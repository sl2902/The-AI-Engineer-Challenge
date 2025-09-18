# PDF Upload App Setup Instructions

This application consists of two parts:
1. **FastAPI Backend** (Python) - Handles PDF processing and vector database operations
2. **Next.js Frontend** (React/TypeScript) - Provides the web interface

## Prerequisites

- Python 3.8+ with pip
- Node.js 18+ with npm
- OpenAI API key

## Setup and Running

### 1. Backend Setup (FastAPI)

```bash
# Navigate to the API directory
cd api

# Install Python dependencies
pip install -r requirements.txt

# Set your OpenAI API key (optional - can also be provided in the UI)
export OPENAI_API_KEY=your_api_key_here

# Run the FastAPI server
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at: http://localhost:8000

### 2. Frontend Setup (Next.js)

```bash
# Navigate to the frontend directory (in a new terminal)
cd frontend

# Install Node.js dependencies
npm install

# Run the Next.js development server
npm run dev
```

The frontend will be available at: http://localhost:3000

## Usage

1. **Open your browser** and go to http://localhost:3000
2. **Enter your OpenAI API key** in the input field
3. **Use the three tabs:**
   - **💬 Chat**: Traditional chat interface with OpenAI
   - **📄 Upload PDF**: Upload PDF files to be processed and stored in the vector database
   - **🔍 Search Vectors**: Search through uploaded PDF content using semantic search

## Features

### PDF Upload
- Drag and drop or click to select PDF files
- Configurable chunk size and overlap for text processing
- Automatic text extraction and vector embedding
- Progress indicators during upload

### Vector Search
- Semantic search through uploaded PDF content
- Filter by source file
- Configurable number of results
- Score-based relevance ranking

### Chat Interface
- Traditional OpenAI chat functionality
- Streaming responses
- Developer and user message separation

## API Endpoints

### Backend (FastAPI)
- `POST /api/upload-pdf` - Upload and process PDF files
- `POST /api/search-vectors` - Search the vector database
- `GET /api/vector-db-summary` - Get database summary
- `POST /api/chat` - Chat with OpenAI
- `GET /api/health` - Health check

### Frontend (Next.js API Routes)
- `POST /api/upload-pdf` - Proxy to backend PDF upload
- `POST /api/search-vectors` - Proxy to backend vector search
- `POST /api/chat` - Proxy to backend chat

## Troubleshooting

1. **Backend not starting**: Make sure all Python dependencies are installed
2. **Frontend not starting**: Run `npm install` in the frontend directory
3. **PDF upload fails**: Check that your OpenAI API key is valid
4. **CORS errors**: The backend is configured to allow all origins for development

## Development Notes

- The vector database is stored in memory and will reset when the backend restarts
- PDF files are processed in chunks for better search results
- The application uses OpenAI embeddings for vector similarity search
- All file uploads are processed server-side for security

