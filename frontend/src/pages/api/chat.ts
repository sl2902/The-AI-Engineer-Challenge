import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { developer_message, user_message, model, api_key } = req.body;

  if (!api_key) {
    return res.status(400).json({ error: 'API key is required' });
  }

  if (!user_message) {
    return res.status(400).json({ error: 'User message is required' });
  }

  try {
    // Build messages array
    const messages = [];
    
    if (developer_message) {
      messages.push({
        role: "system",
        content: developer_message
      });
    }
    
    messages.push({
      role: "user", 
      content: user_message
    });

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini', // Note: gpt-4.1-mini doesn't exist, using gpt-4o-mini
        messages: messages,
        stream: true, // Enable streaming for your frontend
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Stream the response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.end();
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                res.write(content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    res.end();

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}