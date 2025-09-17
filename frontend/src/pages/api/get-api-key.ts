import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Get API Key API Route - Request received');

    const response = await fetch('http://localhost:8000/api/get-api-key', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Get API Key API Route - Backend response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Get API Key API Route - Backend error:', errorData);
      return res.status(response.status).json({ 
        error: 'Backend request failed',
        details: errorData.detail || errorData.error || 'Unknown error'
      });
    }

    const data = await response.json();
    console.log('Get API Key API Route - Backend response data:', data);
    res.status(200).json(data);

  } catch (error) {
    console.error('Get API Key API Route - Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
