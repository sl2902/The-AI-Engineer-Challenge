# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
import sys
from typing import Optional
from dotenv import load_dotenv
import numpy as np
from datetime import datetime


# Add the parent directory to the path to import aimakerspace modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aimakerspace.pdf_utils import create_pdf_processor
from aimakerspace.youtube_utils import YouTubeTranscriptLoader
from aimakerspace.vectordatabase import VectorDatabase, cosine_similarity, euclidean_distance, manhattan_distance
from aimakerspace.rag_pipeline import create_rag_pipeline
import asyncio

load_dotenv()

# Initialize FastAPI application with a title
app = FastAPI(title="OpenAI Chat API")

api_key = os.getenv("OPENAI_API_KEY")

# Initialize global vector database instance
vector_db = VectorDatabase()

# Initialize RAG pipeline
rag_pipeline = create_rag_pipeline(vector_db, model_name="gpt-4o-mini", streaming=True)

# Configure CORS (Cross-Origin Resource Sharing) middleware
# This allows the API to be accessed from different domains/origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers in requests
)

# Define the data model for chat requests using Pydantic
# This ensures incoming request data is properly validated
class ChatRequest(BaseModel):
    developer_message: str  # Message from the developer/system
    user_message: str      # Message from the user
    model: Optional[str] = "gpt-4.1-mini"  # Optional model selection with default
    api_key: str          # OpenAI API key for authentication

# Define response models for PDF upload
class PDFUploadResponse(BaseModel):
    success: bool
    message: str
    filename: str
    chunks_processed: int
    total_characters: int

class VectorDBSearchRequest(BaseModel):
    query: str
    k: int = 5
    api_key: str
    source_filter: Optional[str] = None
    distance_metric: Optional[str] = "cosine_similarity"

class VectorDBSearchResponse(BaseModel):
    results: list
    total_results: int


class RAGRequest(BaseModel):
    query: str
    k: int = 5
    api_key: str
    source_filter: Optional[str] = None
    distance_metric: Optional[str] = "cosine_similarity"
    include_context: bool = False
    stream: bool = False

class YouTubeUploadRequest(BaseModel):
    url: str
    api_key: str
    language: str = "en"
    chunk_by_time: bool = True
    chunk_duration: int = 60

class RAGResponse(BaseModel):
    response: str
    query: str
    context: Optional[str] = None
    retrieved_results: Optional[list] = None
    num_context_chunks: Optional[int] = None

# Define the main chat endpoint that handles POST requests
@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Initialize OpenAI client with the provided API key
        client = OpenAI(api_key=request.api_key)
        
        # Create an async generator function for streaming responses
        async def generate():
            # Create a streaming chat completion request
            stream = client.chat.completions.create(
                model=request.model,
                messages=[
                    {"role": "developer", "content": request.developer_message},
                    {"role": "user", "content": request.user_message}
                ],
                stream=True  # Enable streaming response
            )
            
            # Yield each chunk of the response as it becomes available
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content

        # Return a streaming response to the client
        return StreamingResponse(generate(), media_type="text/plain")
    
    except Exception as e:
        error_message = str(e)
        if "authentication" in error_message.lower() or \
            "invalid" in error_message.lower() or \
            "unauthorized" in error_message.lower():
            raise HTTPException(status_code=401, detail="Invalid API key")
        raise HTTPException(status_code=500, detail=error_message)

# Define PDF upload endpoint
@app.post("/api/upload-pdf", response_model=PDFUploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(200)
):
    """
    Upload and process a PDF file, extracting text and storing it in the vector database.
    
    Args:
        file: The PDF file to upload
        api_key: OpenAI API key for authentication
        chunk_size: Size of text chunks (default: 1000)
        chunk_overlap: Overlap between chunks (default: 200)
    
    Returns:
        PDFUploadResponse with processing results
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Read file content
        file_content = await file.read()
        
        if len(file_content) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        
        # Initialize PDF processor
        pdf_processor = create_pdf_processor(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        
        # Process PDF
        result = pdf_processor.process_pdf(file_content, file.filename)
        
        # Add chunks to vector database
        await vector_db.abuild_from_list(
            result["chunks"], 
            source_name="PDF",
            source_type="text"
        )
        
        return PDFUploadResponse(
            success=True,
            message=f"Successfully processed PDF: {file.filename}",
            filename=file.filename,
            chunks_processed=result["metadata"]["total_chunks"],
            total_characters=result["metadata"]["total_characters"]
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

# Define YouTube upload endpoint
@app.post("/api/upload-youtube", response_model=PDFUploadResponse)
async def upload_youtube(request: YouTubeUploadRequest):
    """
    Process a YouTube video URL, extract transcript, and store it in the vector database.
    
    Args:
        request: YouTube upload request containing URL, API key, and processing options
        
    Returns:
        PDFUploadResponse with processing results
    """
    try:
        print(f"🎬 YouTube upload started for URL: {request.url}")
        
        # Validate API key
        if request.api_key != api_key:
            print("❌ Invalid API key")
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        print("✅ API key validated")
        
        # Initialize YouTube transcript loader
        print("🔧 Initializing YouTube transcript loader...")
        loader = YouTubeTranscriptLoader(language=request.language)
        print("✅ YouTube transcript loader initialized")
        
        # Get video info first with timeout
        print("🔍 Getting video info...")
        try:
            # Use a simpler approach - just call the method directly
            # The timeout is handled in the YouTube utils itself
            video_info = loader.get_video_info(request.url)
            print(f"📊 Video info result: {video_info}")
            if not video_info.get("valid", False):
                error_msg = video_info.get('error', 'Unknown error')
                print(f"❌ Video not valid: {error_msg}")
                # Return a proper error response instead of raising HTTPException
                return PDFUploadResponse(
                    success=False,
                    message=f"❌ {error_msg}",
                    chunks_processed=0,
                    filename="",
                    total_characters=0
                )
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Failed to get video info: {error_msg}")
            # Return a proper error response instead of raising HTTPException
            return PDFUploadResponse(
                success=False,
                message=f"❌ Failed to get video info: {error_msg}",
                chunks_processed=0,
                filename="",
                total_characters=0
            )
        
        print("✅ Video info retrieved successfully")
        
        # Extract transcript with timeout
        print("📝 Extracting transcript...")
        try:
            transcript_chunks = loader.get_transcript(
                request.url, 
                chunk_by_time=request.chunk_by_time,
                chunk_duration=request.chunk_duration
            )
            print(f"📊 Extracted {len(transcript_chunks)} transcript chunks")
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Failed to extract transcript: {error_msg}")
            # Return a proper error response instead of raising HTTPException
            return PDFUploadResponse(
                success=False,
                message=f"❌ Failed to extract transcript: {error_msg}",
                chunks_processed=0,
                filename="",
                total_characters=0
            )
        
        if not transcript_chunks:
            print("❌ No transcript chunks extracted")
            # Return a proper error response instead of raising HTTPException
            return PDFUploadResponse(
                success=False,
                message="❌ No transcript content could be extracted from the video",
                chunks_processed=0,
                filename="",
                total_characters=0
            )
        
        print("✅ Transcript extracted successfully")
        
        # Process chunks and add to vector database
        total_chunks = len(transcript_chunks)
        total_characters = sum(len(chunk["text"]) for chunk in transcript_chunks)
        print(f"📊 Processing {total_chunks} chunks with {total_characters} total characters")
        
        # Add each chunk to vector database
        for i, chunk in enumerate(transcript_chunks):
            print(f"🔄 Processing chunk {i+1}/{total_chunks}")
            
            # Get embedding for this chunk
            print(f"🧠 Getting embedding for chunk {i+1}...")
            embedding = await vector_db.embedding_model.async_get_embeddings([chunk["text"]])
            print(f"✅ Embedding generated for chunk {i+1}")
            
            # Prepare metadata
            metadata = {
                "source": "YouTube",  # Use consistent source name
                "source_type": "youtube",
                "chunk_index": i,
                "chunk_length": len(chunk["text"]),
                "timestamp": datetime.now().isoformat(),
                "total_chunks": total_chunks,
                **chunk["metadata"]  # Include YouTube-specific metadata
            }
            
            # Insert into vector database
            print(f"💾 Inserting chunk {i+1} into vector database...")
            vector_db.insert(chunk["text"], np.array(embedding[0]), metadata)
            print(f"✅ Chunk {i+1} inserted successfully")
        
        print("🎉 All chunks processed and inserted successfully!")
        
        return PDFUploadResponse(
            success=True,
            message=f"Successfully processed YouTube video: {video_info['video_id']}",
            filename=f"video_{video_info['video_id']}",
            chunks_processed=total_chunks,
            total_characters=total_characters
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube processing failed: {str(e)}")

# Define vector database search endpoint
@app.post("/api/search-vectors", response_model=VectorDBSearchResponse)
async def search_vectors(request: VectorDBSearchRequest):
    """
    Search the vector database for similar content.
    
    Args:
        request: Search request with query, k, and optional source filter
    
    Returns:
        VectorDBSearchResponse with search results
    """
    try:
        # Build metadata filter if source is specified
        metadata_filter = None
        if request.source_filter:
            metadata_filter = {"source": request.source_filter}
            print(f"Filtering by source: {request.source_filter}")
        else:
            print("No source filter - searching all sources")
        
        # Select distance measure function
        distance_measure = cosine_similarity  # default
        if request.distance_metric == "euclidean_distance":
            distance_measure = euclidean_distance
        elif request.distance_metric == "manhattan_distance":
            distance_measure = manhattan_distance
        
        print(f"Using distance metric: {request.distance_metric} -> {distance_measure.__name__}")
        print(f"Search query: '{request.query}', k={request.k}")
        
        # Perform search
        results = vector_db.search_by_text(
            query_text=request.query,
            k=request.k,
            metadata_filter=metadata_filter,
            include_metadata=True,
            distance_measure=distance_measure
        )
        
        # Format results for response
        formatted_results = []
        sources_found = set()
        for text, score, metadata in results:
            formatted_results.append({
                "text": text,
                "score": score,
                "metadata": metadata
            })
            sources_found.add(metadata.get("source", "unknown"))
        
        print(f"Found {len(formatted_results)} results from sources: {list(sources_found)}")
        
        return VectorDBSearchResponse(
            results=formatted_results,
            total_results=len(formatted_results)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector search failed: {str(e)}")

# Define endpoint to get vector database summary
@app.get("/api/vector-db-summary")
async def get_vector_db_summary():
    """
    Get a summary of the current vector database contents.
    
    Returns:
        Dictionary with database summary information
    """
    try:
        summary = vector_db.get_metadata_summary()
        return {
            "success": True,
            "summary": summary,
            "performance": {
                "total_vectors": len(vector_db.vectors),
                "ann_enabled": False,
                "index_type": "basic",
                "index_trained": True,
                "memory_usage_estimate": len(vector_db.vectors) * 1536 * 4
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get database summary: {str(e)}")

# Define endpoint to get API key from environment
@app.get("/api/get-api-key")
async def get_api_key():
    """
    Get the OpenAI API key from environment variables.
    
    Returns:
        Dict with the API key if found in environment
    """
    try:
        import os
        api_key = os.getenv("OPENAI_API_KEY")
        
        # Debug: Log environment info (without exposing the actual key)
        env_vars = {k: v for k, v in os.environ.items() if 'OPENAI' in k.upper()}
        
        if api_key:
            return {
                "success": True,
                "api_key": api_key,
                "debug": {
                    "env_vars_found": list(env_vars.keys()),
                    "key_length": len(api_key) if api_key else 0
                }
            }
        else:
            return {
                "success": False,
                "message": "No API key found in environment variables",
                "debug": {
                    "env_vars_found": list(env_vars.keys()),
                    "all_env_vars": list(os.environ.keys())[:10]  # First 10 env vars for debugging
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get API key: {str(e)}")


# Define RAG endpoint
@app.post("/api/rag")
async def rag_query(request: RAGRequest):
    """
    Perform RAG (Retrieval-Augmented Generation) query.
    
    Args:
        request: RAG request with query and parameters
    
    Returns:
        RAGResponse with generated answer and optional context
    """
    try:
        # Select distance measure function
        distance_measure = cosine_similarity  # default
        if request.distance_metric == "euclidean_distance":
            distance_measure = euclidean_distance
        elif request.distance_metric == "manhattan_distance":
            distance_measure = manhattan_distance
        
        # Build metadata filter if source is specified
        metadata_filter = None
        if request.source_filter:
            metadata_filter = {"source": request.source_filter}
        
        print(f"RAG Query: '{request.query}', k={request.k}, distance={request.distance_metric}")
        
        # Perform RAG query
        result = await rag_pipeline.rag_query(
            query=request.query,
            k=request.k,
            distance_measure=distance_measure,
            metadata_filter=metadata_filter,
            stream=request.stream,
            include_context=request.include_context
        )
        
        if request.stream:
            # For streaming, return a generator
            async def generate():
                async for chunk_data in result["response_generator"]:
                    yield f"data: {chunk_data}\n\n"
                yield "data: [DONE]\n\n"
            
            return StreamingResponse(generate(), media_type="text/plain")
        else:
            return RAGResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")

# Define RAG stats endpoint
@app.get("/api/rag-stats")
async def get_rag_stats():
    """
    Get RAG pipeline statistics.
    
    Returns:
        Dictionary with RAG pipeline statistics
    """
    try:
        stats = rag_pipeline.get_rag_stats()
        return {
            "success": True,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get RAG stats: {str(e)}")

# Define a health check endpoint to verify API status
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


# Add handler for /v1/models to return empty list instead of 404
@app.get("/v1/models")
async def models_handler():
    return {"data": [], "object": "list"}


# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
