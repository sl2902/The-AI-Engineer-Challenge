import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Search vectors API called, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, k, api_key, source_filter, distance_metric } = req.body;
  console.log('Request body:', { query, k, api_key: !!api_key, source_filter, distance_metric });

  if (!api_key) {
    return res.status(400).json({ error: 'API key is required' });
  }

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Call the backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const backendPayload = {
      query,
      k: k || 5,
      api_key,
      source_filter: source_filter || null,
      distance_metric: distance_metric || "cosine_similarity",
    };
    
    console.log('Calling backend at:', `${backendUrl}/api/search-vectors`);
    console.log('Backend payload:', backendPayload);
    
    const response = await fetch(`${backendUrl}/api/search-vectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendPayload),
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Backend error:', errorData);
      return res.status(response.status).json({ error: errorData.detail || 'Search failed' });
    }

    const result = await response.json();
    console.log('Backend result:', result);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Vector Search Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
