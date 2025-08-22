# Backend - OpenAI Chat API

This backend is a FastAPI application providing an API to interact with OpenAI's chat completion service.

## Setup and Installation

1. Create a Python virtual environment and activate it:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Alternatively, create a `.env` file in the `api` folder with:

```
OPENAI_API_KEY=your_api_key_here
```

## Running the Backend Locally

Start the FastAPI server with:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

The backend will be accessible at `http://localhost:8000`.

## API Endpoint

### POST `/api/chat`

Send chat messages to the backend for processing by OpenAI.

#### Request JSON Body

```json
{
  "developer_message": "string",
  "user_message": "string",
  "model": "string", // optional, default: "gpt-4.1-mini"
  "api_key": "string" // Your OpenAI API key, required
}
```

#### Response

Streamed chat completion text as plain text.

#### Errors

- Returns HTTP 401 if the OpenAI API key is invalid.
- Returns HTTP 500 for other server errors.

## CORS

The backend allows CORS from all origins for development flexibility.

## Deployment

- Ensure the environment variable `OPENAI_API_KEY` is set in your deployment environment or provide the API key in request.

- The backend can be deployed separately or integrated as serverless functions.

---

Feel free to customize and extend this backend API as needed for your AI Engineer Challenge project!
