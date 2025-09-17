import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Call the backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/vector-db-summary`);

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: errorData.detail || 'Failed to get database summary' });
    }

    const result = await response.json();
    return res.status(200).json(result);

  } catch (error) {
    console.error('Vector DB Summary Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
