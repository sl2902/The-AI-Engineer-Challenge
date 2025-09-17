import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";

// Disable the default body parser for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('PDF upload API called, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Parsing form data...');
    // Parse the form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      filter: ({ mimetype }) => {
        return mimetype === 'application/pdf';
      },
    });

    const [fields, files] = await form.parse(req);
    
    console.log('Parsed fields:', fields);
    console.log('Parsed files:', files);
    
    const apiKey = Array.isArray(fields.api_key) ? fields.api_key[0] : fields.api_key;
    const chunkSize = Array.isArray(fields.chunk_size) ? fields.chunk_size[0] : fields.chunk_size;
    const chunkOverlap = Array.isArray(fields.chunk_overlap) ? fields.chunk_overlap[0] : fields.chunk_overlap;

    console.log('API Key present:', !!apiKey);
    console.log('Chunk size:', chunkSize);
    console.log('Chunk overlap:', chunkOverlap);

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    console.log('File received:', file ? { name: file.originalFilename, size: file.size } : 'No file');
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the file
    const fileContent = fs.readFileSync(file.filepath);

    // Create form data for the backend API
    const formData = new FormData();
    formData.append('file', new Blob([fileContent], { type: 'application/pdf' }), file.originalFilename || 'document.pdf');
    formData.append('api_key', apiKey);
    formData.append('chunk_size', chunkSize || '1000');
    formData.append('chunk_overlap', chunkOverlap || '200');

    // Call the backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    console.log('Calling backend at:', `${backendUrl}/api/upload-pdf`);
    
    const response = await fetch(`${backendUrl}/api/upload-pdf`, {
      method: 'POST',
      body: formData,
    });

    console.log('Backend response status:', response.status);
    console.log('Backend response headers:', response.headers);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Backend error:', errorData);
      return res.status(response.status).json({ error: errorData.detail || 'Upload failed' });
    }

    const result = await response.json();
    console.log('Backend success result:', result);
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError);
    }
    
    return res.status(200).json(result);

  } catch (error) {
    console.error('PDF Upload Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
