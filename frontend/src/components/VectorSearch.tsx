import React, { useState } from 'react';

interface VectorSearchProps {
  apiKey: string;
}

interface SearchResult {
  text: string;
  score: number;
  metadata: {
    source: string;
    source_type: string;
    chunk_index: number;
    timestamp: string;
  };
}

interface SearchResponse {
  results: SearchResult[];
  total_results: number;
}

const VectorSearch: React.FC<VectorSearchProps> = ({ apiKey }) => {
  const [query, setQuery] = useState('');
  const [k, setK] = useState(5);
  const [sourceFilter, setSourceFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!apiKey) {
      setError('OpenAI API key is required for vector search');
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      const response = await fetch('/api/search-vectors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          k: k,
          api_key: apiKey,
          source_filter: sourceFilter || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Search failed');
      }

      const data: SearchResponse = await response.json();
      setSearchResults(data.results);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearResults = () => {
    setSearchResults([]);
    setError('');
  };

  return (
    <div className="vector-search-container">
      <h3>Search Vector Database</h3>
      
      {/* Search Form */}
      <div className="search-form">
        <div className="form-row">
          <label htmlFor="searchQuery">Search Query:</label>
          <input
            id="searchQuery"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your search query..."
            disabled={isSearching}
          />
        </div>
        
        <div className="form-row">
          <label htmlFor="resultCount">Number of Results:</label>
          <input
            id="resultCount"
            type="number"
            value={k}
            onChange={(e) => setK(parseInt(e.target.value) || 5)}
            min="1"
            max="20"
            disabled={isSearching}
          />
        </div>
        
        <div className="form-row">
          <label htmlFor="sourceFilter">Source Filter (optional):</label>
          <input
            id="sourceFilter"
            type="text"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            placeholder="Filter by source filename..."
            disabled={isSearching}
          />
        </div>
        
        <div className="form-actions">
          <button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="search-button"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
          
          {searchResults.length > 0 && (
            <button
              onClick={clearResults}
              className="clear-button"
            >
              Clear Results
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <h4>Search Results ({searchResults.length})</h4>
          {searchResults.map((result, index) => (
            <div key={index} className="result-item">
              <div className="result-header">
                <span className="result-score">Score: {result.score.toFixed(4)}</span>
                <span className="result-source">Source: {result.metadata.source}</span>
                <span className="result-chunk">Chunk: {result.metadata.chunk_index}</span>
              </div>
              <div className="result-text">
                {result.text}
              </div>
              <div className="result-metadata">
                <small>
                  Type: {result.metadata.source_type} | 
                  Timestamp: {new Date(result.metadata.timestamp).toLocaleString()}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .vector-search-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #fafafa;
        }

        .vector-search-container h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
        }

        .search-form {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f5f5f5;
          border-radius: 6px;
        }

        .form-row {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
          gap: 10px;
        }

        .form-row:last-child {
          margin-bottom: 0;
        }

        .form-row label {
          min-width: 120px;
          font-weight: 500;
          color: #555;
        }

        .form-row input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-actions {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }

        .search-button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .search-button:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .search-button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }

        .clear-button {
          background-color: #6c757d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .clear-button:hover {
          background-color: #545b62;
        }

        .error-message {
          background-color: #f8d7da;
          color: #721c24;
          padding: 10px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }

        .search-results {
          margin-top: 20px;
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
        }

        .result-item:last-child {
          margin-bottom: 0;
        }

        .result-header {
          display: flex;
          gap: 15px;
          margin-bottom: 10px;
          font-size: 12px;
          color: #666;
        }

        .result-score {
          background-color: #e3f2fd;
          color: #1976d2;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 500;
        }

        .result-source {
          background-color: #f3e5f5;
          color: #7b1fa2;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .result-chunk {
          background-color: #e8f5e8;
          color: #2e7d32;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .result-text {
          margin-bottom: 10px;
          line-height: 1.5;
          color: #333;
        }

        .result-metadata {
          color: #666;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};

export default VectorSearch;
