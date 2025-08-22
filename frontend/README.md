# Frontend - The AI Engineer Challenge

This frontend application is built with Next.js and provides a user interface to interact with the backend AI chat API.

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Clone the repository (if not already done):

```bash
git clone <your-repo-url>
```

2. Navigate to the frontend directory:

```bash
cd frontend
```

3. Install dependencies:

```bash
npm install
```

### Running the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open your browser and go to [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

Ensure the backend API is running and accessible. The frontend is configured to communicate with the backend API running on `http://localhost:8000` (default).

### Features

- Input fields for Developer Message and User Message.
- Send messages to the backend AI chat API and stream responses.
- Clean and responsive UI using custom CSS modules.
- Next.js rewrites configured to proxy OpenAI API calls during development.

### Additional Notes

- The frontend assumes the backend FastAPI server is running locally at port 8000.
- Proxy is set up to forward OpenAI API `/v1/*` calls to `https://api.openai.com/v1/*` for proper OpenAI API access during development.

### Troubleshooting

- If you encounter CORS errors, verify backend server is running and CORS settings allow requests.
- If the chat responses aren't appearing correctly, check console for errors and network requests.

---

Feel free to customize and extend this frontend as needed for your AI Engineer Challenge project!