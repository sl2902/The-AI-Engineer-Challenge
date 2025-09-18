# Debug Steps for Vector Search

## Step 1: Check if Backend is Running
```bash
cd api
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Step 2: Check if Frontend is Running
```bash
cd frontend
npm run dev
```

## Step 3: Test Backend Directly
Open browser and go to: http://localhost:8000/docs
- This should show the FastAPI documentation
- Try the `/api/vector-db-summary` endpoint to see if there's any data

## Step 4: Check Browser Console
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Try a search and look for:
   - "Starting vector search..."
   - "Search payload: ..."
   - "Response status: ..."
   - Any error messages

## Step 5: Check Backend Terminal
Look for debug messages like:
- "Using distance metric: ..."
- "Filtering by source: ..."
- "Found X results from sources: ..."

## Step 6: Check if You Have Data
1. Go to http://localhost:3000
2. Upload a PDF first
3. Then try searching

## Common Issues:
1. **No data in vector database** - Upload a PDF first
2. **Backend not running** - Start with uvicorn command
3. **API key missing** - Enter your OpenAI API key
4. **Network error** - Check if both servers are running on correct ports

