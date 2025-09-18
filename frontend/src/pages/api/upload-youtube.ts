import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, api_key, language, chunk_by_time, chunk_duration } = req.body;

    if (!url || !api_key) {
      return res.status(400).json({ 
        error: 'Missing required fields: url and api_key are required' 
      });
    }

    // Forward the request to the FastAPI backend
    const response = await fetch('http://localhost:8000/api/upload-youtube', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        api_key,
        language: language || 'en',
        chunk_by_time: chunk_by_time !== undefined ? chunk_by_time : true,
        chunk_duration: chunk_duration || 60
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: 'Backend request failed',
        details: errorData.detail || 'Unknown error'
      });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('YouTube Upload API Route - Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
