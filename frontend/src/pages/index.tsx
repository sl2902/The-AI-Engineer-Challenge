import Head from "next/head";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";
import React, { useState, useEffect } from "react";

// TypeScript interfaces
interface UploadResult {
  success: boolean;
  message: string;
  chunks_processed?: number;
  filename?: string;
}

interface SearchResult {
  text: string;
  score: number;
  metadata: {
    source: string;
    chunk_index: number;
    [key: string]: unknown;
  };
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [developerMessage, setDeveloperMessage] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [loading, setLoading] = useState(false);
  // const [invalidApiKey, setInvalidApiKey] = useState(false); // Unused
  
  // PDF Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "processing" | "chunking" | "ingesting" | "success" | "error">("idle");
  const [activeTab, setActiveTab] = useState<"chat" | "pdf" | "search" | "rag">("chat");
  const [errorTimeout, setErrorTimeout] = useState<NodeJS.Timeout | null>(null);
  const [errorCountdown, setErrorCountdown] = useState<number>(0);
  
  // Chunking configuration
  const [chunkSize, setChunkSize] = useState<number>(1000);
  const [chunkOverlap, setChunkOverlap] = useState<number>(200);
  
  // Vector Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [distanceMetric, setDistanceMetric] = useState<string>("cosine_similarity");
  const [numResults, setNumResults] = useState<number>(5);
  
  // Remove ANN configuration state
  
  // RAG state
  const [ragQuery, setRagQuery] = useState<string>("");
  const [ragResponse, setRagResponse] = useState<string>("");
  const [ragContext, setRagContext] = useState<string>("");
  const [ragLoading, setRagLoading] = useState<boolean>(false);
  const [includeContext, setIncludeContext] = useState<boolean>(false);

  // ← The function needs to be HERE, inside the component
  const callChatAPI = async () => {
    setInvalidApiKey(false); // Reset error state
    if (!apiKey) {
      alert("OpenAI API key is required!");
      return;
    }

    setLoading(true);
    setResponseText("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developer_message: developerMessage,
          user_message: userMessage,
          model: "gpt-4o-mini",
          api_key: apiKey,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        alert("Invalid API key. Please check and try again.");
        setInvalidApiKey(true);
        setResponseText("");
        return;
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported in this browser.');
      }
      const decoder = new TextDecoder();
      let done = false;
      let text = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          text += decoder.decode(value);
          setResponseText(text);
        }
      }
    } catch (error) {
      setResponseText(`Error: ${(error as Error).
        message}`);
    } finally {
      setLoading(false);
    }
  };

  // PDF Upload handlers
  const handleUploadSuccess = (result: UploadResult) => {
    setUploadResult(result);
    setUploadError("");
    setUploadStatus("success");
    setActiveTab("search"); // Switch to search tab after successful upload
    // Refresh available sources for the dropdown
    fetchAvailableSources();
  };

  const handleUploadError = (error: string) => {
    // Clear any existing timeout
    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }
    
    setUploadError(error);
    setUploadResult(null);
    setUploadStatus("error");
    
    // Start countdown from 5 seconds
    setErrorCountdown(5);
    
    // Auto-dismiss error after 5 seconds
    const timeout = setTimeout(() => {
      setUploadError("");
      setUploadStatus("idle");
      setErrorCountdown(0);
    }, 5000);
    
    setErrorTimeout(timeout);
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
      setErrorCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // File upload handler
  const handleFileUpload = async (file: File) => {
    console.log('File selected:', file.name, file.size, file.type);
    
    // Reset states and show immediate feedback
    setUploadError('');
    setUploadResult(null);
    setUploadStatus("uploading"); // Show progress immediately
    
    // Clear any existing error timeout
    if (errorTimeout) {
      clearTimeout(errorTimeout);
      setErrorTimeout(null);
    }
    setErrorCountdown(0);
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      handleUploadError('❌ Please select a PDF file. Only .pdf files are supported.');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      handleUploadError('❌ File too large. Please select a PDF file smaller than 10MB.');
      return;
    }

    if (!apiKey) {
      handleUploadError('❌ OpenAI API key is required for PDF processing');
      return;
    }

    console.log('Starting upload process...');
    
    // Small delay to ensure user sees the progress indicator
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('chunk_size', chunkSize.toString());
      formData.append('chunk_overlap', chunkOverlap.toString());

      console.log('Sending request to /api/upload-pdf');
      setUploadStatus("processing");
      
      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.detail || errorMessage;
        } catch {
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        console.error('Upload error:', errorMessage);
        throw new Error(errorMessage);
      }

      setUploadStatus("chunking");
      // Simulate processing time for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setUploadStatus("ingesting");
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await response.json();
      console.log('Upload success:', result);
      handleUploadSuccess(result);
      
    } catch (error) {
      console.error('Upload failed:', error);
      handleUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  // Fetch available sources from vector database
  const fetchAvailableSources = async () => {
    try {
      const response = await fetch('/api/vector-db-summary');
      if (response.ok) {
        const data = await response.json();
        const sources = data.summary?.sources || [];
        setAvailableSources(sources);
        
        // Clear upload success message if no data is available
        if (sources.length === 0) {
          setUploadResult(null);
          setUploadStatus("idle");
        }
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    }
  };

  // Fetch API key from environment
  const fetchApiKeyFromEnv = async () => {
    try {
      const response = await fetch('/api/get-api-key');
      if (response.ok) {
        const data = await response.json();
        if (data.api_key) {
          setApiKey(data.api_key);
          alert('API key loaded from environment successfully!');
        } else {
          alert('No API key found in environment variables.');
        }
      } else {
        alert('Failed to fetch API key from environment.');
      }
    } catch (error) {
      console.error('Failed to fetch API key:', error);
      alert('Failed to fetch API key from environment.');
    }
  };

  // Vector search handler
  const handleVectorSearch = async () => {
    if (!searchQuery.trim() || !apiKey) {
      console.log('Search blocked: missing query or API key');
      return;
    }

    console.log('Starting vector search...');
    setSearchResults([]); // Clear previous results

    try {
      const searchPayload = {
        query: searchQuery.trim(),
        k: numResults,
        api_key: apiKey,
        source_filter: selectedSource || null,
        distance_metric: distanceMetric,
      };
      
      console.log('Search payload:', searchPayload);
      
      const response = await fetch('/api/search-vectors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchPayload),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        let errorMessage = 'Search failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.detail || errorMessage;
        } catch {
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        console.error('Search failed:', errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Search results:', data);
      setSearchResults(data.results || []);
      
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  };

  // RAG query handler
  const handleRAGQuery = async () => {
    if (!ragQuery.trim() || !apiKey) {
      console.log('RAG query blocked: missing query or API key');
      return;
    }

    console.log('Starting RAG query...');
    setRagLoading(true);
    setRagResponse('');
    setRagContext('');

    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: ragQuery.trim(),
          k: numResults,
          api_key: apiKey,
          source_filter: selectedSource || null,
          distance_metric: distanceMetric,
          include_context: includeContext,
          stream: false, // For now, we'll use non-streaming
        }),
      });

      if (!response.ok) {
        let errorMessage = 'RAG query failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, try to get text
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('RAG response:', data);
      
      setRagResponse(data.response);
      if (data.context) {
        setRagContext(data.context);
      }
      
    } catch (error) {
      console.error('RAG query error:', error);
      setRagResponse(`Error: ${error instanceof Error ? error.message : 'RAG query failed'}`);
    } finally {
      setRagLoading(false);
    }
  };

  // Load available sources when component mounts
  useEffect(() => {
    fetchAvailableSources();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeout) {
        clearTimeout(errorTimeout);
      }
    };
  }, [errorTimeout]);

  return (
    <>
      <Head>
        <title>The AI Engineer Challenge</title>
        <meta name="description" content="Build modern AI powered apps with ease." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`${styles.page} ${geistSans.variable} ${geistMono.variable}`}> 
        <main className={styles.main}>
          <h1 className={styles.title}>The AI Engineer Challenge</h1>

          {/* API Key Input */}
          <label htmlFor="apiKey" className={styles.label}>
            OpenAI API Key
          </label>
          <div className={styles.apiKeyContainer}>
            <input
              id="apiKey"
              type="password"
              className={styles.textarea}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your OpenAI API key"
            />
            <button 
              onClick={fetchApiKeyFromEnv}
              className={styles.envButton}
              title="Load API key from environment variables"
            >
              📁 Load from Env
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              💬 Chat
            </button>
            <button
              className={`tab-button ${activeTab === "pdf" ? "active" : ""}`}
              onClick={() => setActiveTab("pdf")}
            >
              📄 Upload PDF
            </button>
            <button
              className={`tab-button ${activeTab === "search" ? "active" : ""}`}
              onClick={() => setActiveTab("search")}
            >
              🔍 Search Vectors
            </button>
            <button
              className={`tab-button ${activeTab === "rag" ? "active" : ""}`}
              onClick={() => setActiveTab("rag")}
            >
              🤖 RAG Chat
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "chat" && (
            <div className="tab-content">

          <label htmlFor="developerMessage" className={styles.label}>
            Developer Message
          </label>
          <textarea
            id="developerMessage"
            className={styles.textarea}
            value={developerMessage}
            onChange={(e) => setDeveloperMessage(e.target.value)}
            rows={3}
            placeholder="Enter developer message here"
          />

          <label htmlFor="userMessage" className={styles.label}>
            User Message
          </label>
          <textarea
            id="userMessage"
            className={styles.textarea}
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            rows={3}
            placeholder="Enter user message here"
          />

          <button
            className={styles.primaryButton}
            onClick={callChatAPI}
            disabled={loading || !userMessage}
          >
            {loading ? "Loading..." : "Send"}
          </button>

              <h3 className={styles.title}>Response:</h3>
              <div className={styles.response}>
                <div>{responseText.split('\n').map((line, idx) => (
                  <p key={idx} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{line}</p>
                ))}</div>
              </div>
            </div>
          )}

          {activeTab === "pdf" && (
            <div className="tab-content">
              <div className="pdf-upload-container">
                <h3>Upload PDF Document</h3>
                
                {/* Chunking Configuration */}
                <div className="chunking-config">
                  <h4>Chunking Configuration</h4>
                  <div className="config-row">
                    <div className="config-group">
                      <label htmlFor="chunk-size">Chunk Size: {chunkSize} characters</label>
                      <input
                        type="range"
                        id="chunk-size"
                        min="500"
                        max="2000"
                        value={chunkSize}
                        onChange={(e) => setChunkSize(parseInt(e.target.value))}
                        className="config-slider"
                      />
                      <div className="slider-labels">
                        <span>500</span>
                        <span>2000</span>
                      </div>
                    </div>
                    
                    <div className="config-group">
                      <label htmlFor="chunk-overlap">Overlap: {chunkOverlap} characters</label>
                      <input
                        type="range"
                        id="chunk-overlap"
                        min="50"
                        max="500"
                        value={chunkOverlap}
                        onChange={(e) => setChunkOverlap(parseInt(e.target.value))}
                        className="config-slider"
                      />
                      <div className="slider-labels">
                        <span>50</span>
                        <span>500</span>
                      </div>
                    </div>
                  </div>
                  <div className="config-info">
                    <p><strong>Chunk Size:</strong> Larger chunks preserve more context but may be less precise</p>
                    <p><strong>Overlap:</strong> Higher overlap maintains better continuity between chunks</p>
                  </div>
                </div>
                
                {/* Upload Progress Indicator */}
                {uploadStatus !== "idle" && uploadStatus !== "success" && uploadStatus !== "error" && (
                  <div className="upload-progress-container">
                    <div className="progress-steps">
                      <div className={`step ${uploadStatus === "uploading" ? "active" : uploadStatus === "processing" || uploadStatus === "chunking" || uploadStatus === "ingesting" ? "completed" : ""}`}>
                        <div className="step-icon">📤</div>
                        <div className="step-text">Uploading</div>
                      </div>
                      <div className={`step ${uploadStatus === "processing" ? "active" : uploadStatus === "chunking" || uploadStatus === "ingesting" ? "completed" : ""}`}>
                        <div className="step-icon">⚙️</div>
                        <div className="step-text">Processing</div>
                      </div>
                      <div className={`step ${uploadStatus === "chunking" ? "active" : uploadStatus === "ingesting" ? "completed" : ""}`}>
                        <div className="step-icon">✂️</div>
                        <div className="step-text">Chunking</div>
                      </div>
                      <div className={`step ${uploadStatus === "ingesting" ? "active" : ""}`}>
                        <div className="step-icon">🧠</div>
                        <div className="step-text">Ingesting</div>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${uploadStatus}`}></div>
                    </div>
                  </div>
                )}
                
                <div className="upload-area">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                      }
                    }}
                    style={{ display: 'none' }}
                    id="pdf-upload"
                    disabled={uploadStatus === "uploading" || uploadStatus === "processing" || uploadStatus === "chunking" || uploadStatus === "ingesting"}
                  />
                  <label htmlFor="pdf-upload" className={`upload-label ${uploadStatus === "uploading" || uploadStatus === "processing" || uploadStatus === "chunking" || uploadStatus === "ingesting" ? "disabled" : ""}`}>
                    <div className="upload-icon">
                      {uploadStatus === "uploading" || uploadStatus === "processing" || uploadStatus === "chunking" || uploadStatus === "ingesting" ? "⏳" : "📄"}
                    </div>
                    <p>
                      {uploadStatus === "uploading" || uploadStatus === "processing" || uploadStatus === "chunking" || uploadStatus === "ingesting" 
                        ? "Processing..." 
                        : "Click to select PDF file"
                      }
                    </p>
                    <p className="upload-subtext">Only PDF files are supported (max 10MB)</p>
                  </label>
                </div>
                
                {uploadResult && (
                  <div className="upload-success">
                    <h4>✅ Upload Successful!</h4>
                    <p><strong>File:</strong> {uploadResult.filename}</p>
                    <p><strong>Chunks processed:</strong> {uploadResult.chunks_processed}</p>
                    <p><strong>Total characters:</strong> {uploadResult.total_characters.toLocaleString()}</p>
                    <p><strong>Message:</strong> {uploadResult.message}</p>
                  </div>
                )}
                
                {uploadError && (
                  <div className="upload-error">
                    <div className="error-header">
                      <h4>❌ Upload Failed</h4>
                      {errorCountdown > 0 && (
                        <span className="error-countdown">
                          Auto-dismiss in {errorCountdown}s
                        </span>
                      )}
                    </div>
                    <p>{uploadError}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "search" && (
            <div className="tab-content">
              <div className="vector-search-container">
                <h3>Search Vector Database</h3>
                
                <div className="search-form">
                  <input
                    type="text"
                    placeholder="Enter your search query..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button onClick={handleVectorSearch} disabled={!searchQuery.trim()}>
                    Search
                  </button>
                </div>
                
                <div className="search-options">
                  <div className="option-group">
                    <label htmlFor="source-filter">Source Filter:</label>
                    <select
                      id="source-filter"
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                    >
                      <option value="">All Sources</option>
                      {availableSources.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="option-group">
                    <label htmlFor="distance-metric">Distance Metric:</label>
                    <select
                      id="distance-metric"
                      value={distanceMetric}
                      onChange={(e) => setDistanceMetric(e.target.value)}
                    >
                      <option value="cosine_similarity">Cosine Similarity</option>
                      <option value="euclidean_distance">Euclidean Distance</option>
                      <option value="manhattan_distance">Manhattan Distance</option>
                    </select>
                  </div>
                  
                  <div className="option-group">
                    <label htmlFor="num-results">Search Results to Show: {numResults}</label>
                    <input
                      type="range"
                      id="num-results"
                      min="1"
                      max="20"
                      value={numResults}
                      onChange={(e) => setNumResults(parseInt(e.target.value))}
                      className="results-slider"
                    />
                    <div className="slider-labels">
                      <span>1</span>
                      <span>20</span>
                    </div>
                    <small className="slider-help">More results = more context, but slower search</small>
                  </div>
                </div>
                
                {availableSources.length > 0 ? (
                  <div className="sources-info">
                    <p><strong>Available Sources:</strong> {availableSources.join(", ")}</p>
                  </div>
                ) : (
                  <div className="no-data-warning">
                    <p><strong>⚠️ No data found!</strong> Upload a PDF first to enable search.</p>
                  </div>
                )}

                
                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h4>Search Results ({searchResults.length})</h4>
                    {searchResults.map((result, index) => (
                      <div key={index} className="result-item">
                        <div className="result-text">{result.text}</div>
                        <div className="result-meta">
                          Score: {result.score.toFixed(4)} | 
                          Source: {result.metadata.source} | 
                          Chunk: {result.metadata.chunk_index}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "rag" && (
            <div className="tab-content">
              <div className="rag-container">
                <h3>RAG (Retrieval-Augmented Generation) Chat</h3>
                <p className="rag-description">
                  Ask questions about your uploaded documents. The AI will search through your content and provide answers based on the retrieved context.
                </p>
                
                {availableSources.length > 0 ? (
                  <>
                    <div className="rag-query-section">
                      <div className="rag-options">
                        <div className="rag-option">
                          <label htmlFor="rag-source-filter">Source Filter:</label>
                          <select
                            id="rag-source-filter"
                            value={selectedSource}
                            onChange={(e) => setSelectedSource(e.target.value)}
                          >
                            <option value="">All Sources</option>
                            {availableSources.map((source) => (
                              <option key={source} value={source}>
                                {source}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="rag-option">
                          <label htmlFor="rag-distance-metric">Distance Metric:</label>
                          <select
                            id="rag-distance-metric"
                            value={distanceMetric}
                            onChange={(e) => setDistanceMetric(e.target.value)}
                          >
                            <option value="cosine_similarity">Cosine Similarity</option>
                            <option value="euclidean_distance">Euclidean Distance</option>
                            <option value="manhattan_distance">Manhattan Distance</option>
                          </select>
                        </div>
                        
                        <div className="rag-option">
                          <label htmlFor="rag-num-results">Document Sections to Use: {numResults}</label>
                          <input
                            type="range"
                            id="rag-num-results"
                            min="1"
                            max="10"
                            value={numResults}
                            onChange={(e) => setNumResults(parseInt(e.target.value))}
                            className="rag-slider"
                          />
                          <small className="slider-help">More sections = better answers, but slower response</small>
                        </div>
                        
                        <div className="rag-option">
                          <label>
                            <input
                              type="checkbox"
                              checked={includeContext}
                              onChange={(e) => setIncludeContext(e.target.checked)}
                            />
                            Show Retrieved Context
                          </label>
                        </div>
                      </div>
                      
                      <div className="rag-input-section">
                        <textarea
                          value={ragQuery}
                          onChange={(e) => setRagQuery(e.target.value)}
                          placeholder="Ask a question about your uploaded documents..."
                          rows={3}
                          className="rag-textarea"
                        />
                        <button
                          onClick={handleRAGQuery}
                          disabled={ragLoading || !ragQuery.trim()}
                          className="rag-submit-btn"
                        >
                          {ragLoading ? "Thinking..." : "Ask Question"}
                        </button>
                      </div>
                    </div>
                    
                    {ragResponse && (
                      <div className="rag-response-section">
                        <h4>AI Response:</h4>
                        <div className="rag-response">
                          {ragResponse.split('\n').map((line, idx) => (
                            <p key={idx} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {ragContext && includeContext && (
                      <div className="rag-context-section">
                        <h4>Retrieved Context:</h4>
                        <div className="rag-context">
                          <pre>{ragContext}</pre>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="no-data-warning">
                    <p><strong>⚠️ No data found!</strong> Upload a PDF first to enable RAG chat.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .tab-navigation {
          display: flex;
          gap: 5px;
          margin: 20px 0;
          border-bottom: 2px solid #e0e0e0;
        }

        .tab-button {
          background: none;
          border: none;
          padding: 12px 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          border-bottom: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .tab-button:hover {
          color: #333;
          background-color: #f8f9fa;
        }

        .tab-button.active {
          color: #007bff;
          border-bottom-color: #007bff;
          background-color: #f8f9fa;
        }

        .tab-content {
          margin-top: 20px;
          max-width: 100%;
          overflow-x: hidden;
        }

        .upload-success {
          background-color: #d4edda;
          color: #155724;
          padding: 15px;
          border-radius: 6px;
          margin-top: 20px;
          border: 1px solid #c3e6cb;
        }

        .upload-success h4 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }

        .upload-success p {
          margin: 5px 0;
          font-size: 14px;
        }

        .upload-error {
          background-color: #f8d7da;
          color: #721c24;
          padding: 15px;
          border-radius: 6px;
          margin-top: 20px;
          border: 1px solid #f5c6cb;
        }

        .upload-error h4 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }

        .upload-error p {
          margin: 0;
          font-size: 14px;
        }

        .error-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .error-countdown {
          font-size: 12px;
          color: #721c24;
          background-color: rgba(114, 28, 36, 0.1);
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }

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

        .chunking-config {
          margin: 20px 0;
          padding: 20px;
          background-color: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }

        .chunking-config h4 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 16px;
        }

        .config-row {
          display: flex;
          gap: 30px;
          margin-bottom: 15px;
        }

        @media (max-width: 768px) {
          .config-row {
            flex-direction: column;
            gap: 20px;
          }
        }

        .config-group {
          flex: 1;
        }

        .config-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #555;
          font-size: 14px;
        }

        .config-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e9ecef;
          outline: none;
          -webkit-appearance: none;
          margin: 10px 0;
        }

        .config-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #28a745;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .config-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #28a745;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .config-info {
          margin-top: 15px;
          padding: 10px;
          background-color: #e3f2fd;
          border-radius: 4px;
          border-left: 4px solid #2196f3;
        }

        .config-info p {
          margin: 5px 0;
          font-size: 13px;
          color: #1976d2;
        }

        .upload-area {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          background-color: white;
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 20px 0;
          clear: both;
        }

        .upload-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .upload-icon {
          font-size: 48px;
          opacity: 0.6;
        }

        .upload-subtext {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .vector-search-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #fafafa;
          max-width: 100%;
          overflow: hidden;
        }

        .vector-search-container h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
        }

        .search-form {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        .search-form input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }

        .search-form button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .search-form button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }

        .search-results {
          margin-top: 20px;
          max-width: 100%;
          overflow: hidden;
        }

        .search-results h4 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 16px;
        }

        .result-item {
          background-color: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 15px;
          max-width: 100%;
          overflow: hidden;
          word-wrap: break-word;
        }

        .result-item:last-child {
          margin-bottom: 0;
        }

        .result-text {
          margin-bottom: 10px;
          line-height: 1.5;
          color: #333;
          word-wrap: break-word;
          word-break: break-word;
          overflow-wrap: break-word;
          max-width: 100%;
          white-space: pre-wrap;
        }

        .result-meta {
          color: #666;
          font-size: 12px;
        }

        /* Upload Progress Styles */
        .upload-progress-container {
          margin: 20px 0;
          padding: 20px;
          background-color: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
          clear: both;
          width: 100%;
        }

        .progress-steps {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          position: relative;
        }

        .step:not(:last-child)::after {
          content: '';
          position: absolute;
          top: 20px;
          left: 60%;
          width: 80%;
          height: 2px;
          background-color: #e9ecef;
          z-index: 1;
        }

        .step.completed:not(:last-child)::after {
          background-color: #28a745;
        }

        .step-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: #e9ecef;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-bottom: 8px;
          position: relative;
          z-index: 2;
        }

        .step.active .step-icon {
          background-color: #007bff;
          color: white;
          animation: pulse 1.5s infinite;
        }

        .step.completed .step-icon {
          background-color: #28a745;
          color: white;
        }

        .step-text {
          font-size: 12px;
          color: #666;
          text-align: center;
        }

        .step.active .step-text {
          color: #007bff;
          font-weight: 500;
        }

        .step.completed .step-text {
          color: #28a745;
          font-weight: 500;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background-color: #e9ecef;
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background-color: #007bff;
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .progress-fill.uploading { width: 25%; }
        .progress-fill.processing { width: 50%; }
        .progress-fill.chunking { width: 75%; }
        .progress-fill.ingesting { width: 100%; }

        .upload-label.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Search Options Styles */
        .search-options {
          display: flex;
          gap: 20px;
          margin: 20px 0;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 6px;
        }

        .option-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .option-group label {
          font-size: 14px;
          font-weight: 500;
          color: #555;
        }

        .option-group select {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          background-color: white;
          min-width: 150px;
          color: #333;
          cursor: pointer;
        }

        .option-group select:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .results-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e9ecef;
          outline: none;
          -webkit-appearance: none;
          margin: 10px 0;
        }

        .results-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007bff;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .results-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007bff;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }

        .slider-help {
          display: block;
          font-size: 11px;
          color: #888;
          font-style: italic;
          margin-top: 3px;
          line-height: 1.3;
        }

        .sources-info {
          margin: 15px 0;
          padding: 10px 15px;
          background-color: #e3f2fd;
          border-radius: 4px;
          border-left: 4px solid #2196f3;
        }

        .sources-info p {
          margin: 0;
          font-size: 14px;
          color: #1976d2;
        }

        .no-data-warning {
          margin: 15px 0;
          padding: 10px 15px;
          background-color: #fff3cd;
          border-radius: 4px;
          border-left: 4px solid #ffc107;
        }

        .no-data-warning p {
          margin: 0;
          font-size: 14px;
          color: #856404;
        }


        /* RAG Styles */
        .rag-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #fafafa;
        }

        .rag-container h3 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 18px;
        }

        .rag-description {
          margin: 0 0 20px 0;
          color: #666;
          font-size: 14px;
          line-height: 1.5;
        }

        .rag-query-section {
          margin-bottom: 20px;
        }

        .rag-options {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 6px;
        }

        .rag-option {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .rag-option label {
          font-size: 14px;
          font-weight: 500;
          color: #555;
        }

        .rag-option select {
          padding: 6px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          background-color: white;
          color: #333;
          cursor: pointer;
        }

        .rag-option select:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .rag-option input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin-right: 8px;
        }

        .rag-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e9ecef;
          outline: none;
          -webkit-appearance: none;
          margin: 10px 0;
        }

        .rag-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #007bff;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .rag-input-section {
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }

        .rag-textarea {
          flex: 1;
          padding: 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 80px;
        }

        .rag-submit-btn {
          background-color: #28a745;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
        }

        .rag-submit-btn:hover:not(:disabled) {
          background-color: #218838;
        }

        .rag-submit-btn:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }

        .apiKeyContainer {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .apiKeyContainer input {
          flex: 1;
        }

        .envButton {
          background-color: #28a745;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          transition: background-color 0.2s;
        }

        .envButton:hover {
          background-color: #218838;
        }

        .envButton:active {
          background-color: #1e7e34;
        }

        .rag-response-section {
          margin: 20px 0;
          padding: 20px;
          background-color: #e8f5e8;
          border-radius: 6px;
          border-left: 4px solid #28a745;
        }

        .rag-response-section h4 {
          margin: 0 0 15px 0;
          color: #155724;
          font-size: 16px;
        }

        .rag-response {
          color: #155724;
          line-height: 1.6;
        }

        .rag-context-section {
          margin: 20px 0;
          padding: 20px;
          background-color: #f8f9fa;
          border-radius: 6px;
          border-left: 4px solid #6c757d;
        }

        .rag-context-section h4 {
          margin: 0 0 15px 0;
          color: #495057;
          font-size: 16px;
        }

        .rag-context pre {
          background-color: white;
          padding: 15px;
          border-radius: 4px;
          border: 1px solid #dee2e6;
          font-size: 12px;
          line-height: 1.4;
          color: #495057;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </>
  );
}
