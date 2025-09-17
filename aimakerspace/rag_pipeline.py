"""
RAG (Retrieval-Augmented Generation) Pipeline
Integrates vector search with LLM generation for context-aware responses.
"""

import asyncio
from typing import List, Dict, Any, Optional, Tuple
from aimakerspace.openai_utils.chatmodel import ChatOpenAI
from aimakerspace.openai_utils.prompts import UserRolePrompt, SystemRolePrompt
from aimakerspace.vectordatabase import VectorDatabase


class RAGPipeline:
    """
    Retrieval-Augmented Generation pipeline that combines vector search with LLM generation.
    """
    
    def __init__(self, vector_db: VectorDatabase, model_name: str = "gpt-4o-mini"):
        self.vector_db = vector_db
        self.chat_openai = ChatOpenAI(model_name=model_name)
        
        # Default RAG prompts
        self.system_prompt = SystemRolePrompt(
            """You are a helpful assistant that answers questions based on the provided context.

            Instructions:
            - Answer questions using information from the provided context when possible
            - If the context contains relevant information, provide a helpful answer even if it's not a perfect match
            - Be accurate and cite specific parts of the context when possible
            - Keep responses detailed and comprehensive
            - If the context doesn't contain relevant information, try to provide what information is available or suggest what the user might be looking for
            - Use the provided context as your primary source, but be helpful and informative"""
        )
        
        self.user_prompt = UserRolePrompt(
            """Context Information:
            {context}

            Question: {user_query}

            Please provide a helpful answer based on the context above. If the context contains relevant information, use it to answer the question. If the context doesn't directly answer the question, try to provide related information that might be helpful."""
        )

    def set_custom_prompts(self, system_prompt: str, user_prompt: str):
        """Set custom prompts for the RAG pipeline."""
        self.system_prompt = SystemRolePrompt(system_prompt)
        self.user_prompt = UserRolePrompt(user_prompt)

    async def retrieve_context(
        self, 
        query: str, 
        k: int = 5, 
        distance_measure=None,
        metadata_filter: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """
        Retrieve relevant context from the vector database.
        
        Args:
            query: Search query
            k: Number of results to retrieve
            distance_measure: Distance function to use
            metadata_filter: Filter by metadata
            
        Returns:
            List of (text, score, metadata) tuples
        """
        return self.vector_db.search_by_text(
            query_text=query,
            k=k,
            distance_measure=distance_measure,
            metadata_filter=metadata_filter,
            include_metadata=True
        )

    def format_context(self, retrieved_results: List[Tuple[str, float, Dict[str, Any]]]) -> str:
        """
        Format retrieved results into context string.
        
        Args:
            retrieved_results: Results from vector search
            
        Returns:
            Formatted context string
        """
        if not retrieved_results:
            return "No relevant context found."
        
        context_parts = []
        for i, (text, score, metadata) in enumerate(retrieved_results, 1):
            source = metadata.get("source", "Unknown")
            chunk_index = metadata.get("chunk_index", "Unknown")
            
            context_parts.append(
                f"[Context {i}] (Source: {source}, Chunk: {chunk_index}, Relevance: {score:.3f})\n"
                f"{text}\n"
            )
        
        return "\n".join(context_parts)

    async def generate_response(
        self, 
        query: str, 
        context: str,
        stream: bool = False
    ) -> str:
        """
        Generate response using the LLM with provided context.
        
        Args:
            query: User query
            context: Retrieved context
            stream: Whether to stream the response
            
        Returns:
            Generated response
        """
        messages = [
            self.system_prompt.create_message(),
            self.user_prompt.create_message(context=context, user_query=query)
        ]
        
        if stream:
            # For streaming, we'll return a generator
            return self.chat_openai.astream(messages)
        else:
            return self.chat_openai.run(messages, text_only=True)

    async def rag_query(
        self,
        query: str,
        k: int = 5,
        distance_measure=None,
        metadata_filter: Optional[Dict[str, Any]] = None,
        stream: bool = False,
        include_context: bool = False
    ) -> Dict[str, Any]:
        """
        Complete RAG pipeline: retrieve context and generate response.
        
        Args:
            query: User query
            k: Number of context chunks to retrieve
            distance_measure: Distance function to use
            metadata_filter: Filter by metadata
            stream: Whether to stream the response
            include_context: Whether to include retrieved context in response
            
        Returns:
            Dictionary with response and optional context
        """
        # Step 1: Retrieve relevant context
        retrieved_results = await self.retrieve_context(
            query=query,
            k=k,
            distance_measure=distance_measure,
            metadata_filter=metadata_filter
        )
        
        # Step 2: Format context
        context = self.format_context(retrieved_results)
        
        # Step 3: Generate response
        if stream:
            response_generator = await self.generate_response(query, context, stream=True)
            return {
                "response_generator": response_generator,
                "context": context if include_context else None,
                "retrieved_results": retrieved_results if include_context else None
            }
        else:
            response = await self.generate_response(query, context, stream=False)
            result = {
                "response": response,
                "query": query
            }
            
            if include_context:
                result.update({
                    "context": context,
                    "retrieved_results": retrieved_results,
                    "num_context_chunks": len(retrieved_results)
                })
            
            return result

    def get_rag_stats(self) -> Dict[str, Any]:
        """Get statistics about the RAG pipeline."""
        db_summary = self.vector_db.get_metadata_summary()
        performance_stats = self.vector_db.get_performance_stats()
        
        return {
            "vector_db_summary": db_summary,
            "performance_stats": performance_stats,
            "model_name": self.chat_openai.model_name,
            "system_prompt_length": len(self.system_prompt.content),
            "user_prompt_length": len(self.user_prompt.content)
        }


class StreamingRAGPipeline(RAGPipeline):
    """
    RAG Pipeline with streaming response support.
    """
    
    async def stream_rag_response(
        self,
        query: str,
        k: int = 5,
        distance_measure=None,
        metadata_filter: Optional[Dict[str, Any]] = None
    ):
        """
        Stream RAG response with context retrieval.
        
        Yields:
            Dictionary with response chunks and metadata
        """
        # Retrieve context first
        retrieved_results = await self.retrieve_context(
            query=query,
            k=k,
            distance_measure=distance_measure,
            metadata_filter=metadata_filter
        )
        
        context = self.format_context(retrieved_results)
        
        # Stream the response
        async for chunk in self.chat_openai.astream([
            self.system_prompt.create_message(),
            self.user_prompt.create_message(context=context, user_query=query)
        ]):
            yield {
                "chunk": chunk,
                "context_used": len(retrieved_results),
                "query": query
            }


# Factory function for creating RAG pipelines
def create_rag_pipeline(
    vector_db: VectorDatabase, 
    model_name: str = "gpt-4o-mini",
    streaming: bool = False
) -> RAGPipeline:
    """
    Factory function to create a RAG pipeline.
    
    Args:
        vector_db: Vector database instance
        model_name: OpenAI model name
        streaming: Whether to create streaming pipeline
        
    Returns:
        RAGPipeline instance
    """
    if streaming:
        return StreamingRAGPipeline(vector_db, model_name)
    else:
        return RAGPipeline(vector_db, model_name)
