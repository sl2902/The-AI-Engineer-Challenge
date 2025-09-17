import React, { useState, useRef } from 'react';

interface PDFUploadProps {
  apiKey: string;
  onUploadSuccess: (result: any) => void;
  onUploadError: (error: string) => void;
}

interface UploadResult {
  success: boolean;
  message: string;
  filename: string;
  chunks_processed: number;
  total_characters: number;
}

const PDFUpload: React.FC<PDFUploadProps> = ({ apiKey, onUploadSuccess, onUploadError }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      onUploadError('Please select a PDF file');
      return;
    }

    if (!apiKey) {
      onUploadError('OpenAI API key is required for PDF processing');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('chunk_size', chunkSize.toString());
      formData.append('chunk_overlap', chunkOverlap.toString());

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result: UploadResult = await response.json();
      onUploadSuccess(result);
      
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="pdf-upload-container">
      <h3>Upload PDF Document</h3>
      
      {/* Chunking Configuration */}
      <div className="chunk-config">
        <div className="config-row">
          <label htmlFor="chunkSize">Chunk Size:</label>
          <input
            id="chunkSize"
            type="number"
            value={chunkSize}
            onChange={(e) => setChunkSize(parseInt(e.target.value) || 1000)}
            min="100"
            max="5000"
            disabled={isUploading}
          />
          <span className="config-help">Characters per chunk (100-5000)</span>
        </div>
        
        <div className="config-row">
          <label htmlFor="chunkOverlap">Chunk Overlap:</label>
          <input
            id="chunkOverlap"
            type="number"
            value={chunkOverlap}
            onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 200)}
            min="0"
            max="1000"
            disabled={isUploading}
          />
          <span className="config-help">Overlap between chunks (0-1000)</span>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`upload-area ${isDragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={isUploading}
        />
        
        {isUploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p>Processing PDF... {uploadProgress}%</p>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">📄</div>
            <p className="upload-text">
              {isDragOver ? 'Drop PDF here' : 'Click to select PDF or drag and drop'}
            </p>
            <p className="upload-subtext">Only PDF files are supported</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .pdf-upload-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #fafafa;
        }

        .pdf-upload-container h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
        }

        .chunk-config {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f5f5f5;
          border-radius: 6px;
        }

        .config-row {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
          gap: 10px;
        }

        .config-row:last-child {
          margin-bottom: 0;
        }

        .config-row label {
          min-width: 100px;
          font-weight: 500;
          color: #555;
        }

        .config-row input {
          width: 80px;
          padding: 5px 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }

        .config-help {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        .upload-area {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background-color: white;
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .upload-area:hover {
          border-color: #007bff;
          background-color: #f8f9fa;
        }

        .upload-area.drag-over {
          border-color: #007bff;
          background-color: #e3f2fd;
          transform: scale(1.02);
        }

        .upload-area.uploading {
          cursor: not-allowed;
          border-color: #28a745;
        }

        .upload-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .upload-icon {
          font-size: 48px;
          opacity: 0.6;
        }

        .upload-text {
          font-size: 16px;
          font-weight: 500;
          color: #333;
          margin: 0;
        }

        .upload-subtext {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .upload-progress {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
          width: 100%;
        }

        .progress-bar {
          width: 100%;
          max-width: 300px;
          height: 8px;
          background-color: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background-color: #28a745;
          transition: width 0.3s ease;
        }

        .upload-progress p {
          margin: 0;
          color: #28a745;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default PDFUpload;
