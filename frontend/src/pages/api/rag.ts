import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, k, distance_metric, source_filter, include_context, stream, api_key } = req.body;

    console.log('RAG API Route - Request:', { query, k, distance_metric, source_filter, include_context, stream });

    const response = await fetch('http://localhost:8000/api/rag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        k,
        distance_metric,
        source_filter,
        include_context,
        stream,
        api_key
      }),
    });

    console.log('RAG API Route - Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RAG API Route - Backend error:', errorText);
      return res.status(response.status).json({ 
        error: 'Backend request failed',
        details: errorText 
      });
    }

    // Check if it's a streaming response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/plain')) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            res.write(chunk);
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } else {
      // Handle JSON response
      const data = await response.json();
      console.log('RAG API Route - Backend response data:', data);
      res.status(200).json(data);
    }

  } catch (error) {
    console.error('RAG API Route - Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


