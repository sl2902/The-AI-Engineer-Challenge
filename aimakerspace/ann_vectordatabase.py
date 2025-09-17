"""
Enhanced Vector Database with Approximate Nearest Neighbor (ANN) support using FAISS.
This provides much better performance for large-scale similarity search.
"""

import numpy as np
import faiss
from collections import defaultdict
from typing import Any, Dict, List, Tuple, Callable, Optional
from aimakerspace.openai_utils.embedding import EmbeddingModel
import asyncio
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()


def cosine_similarity(vector_a: np.array, vector_b: np.array) -> float:
    """Computes the cosine similarity between two vectors."""
    dot_product = np.dot(vector_a, vector_b)
    norm_a = np.linalg.norm(vector_a)
    norm_b = np.linalg.norm(vector_b)
    return dot_product / (norm_a * norm_b)


def euclidean_distance(vector_a: np.array, vector_b: np.array) -> float:
    """Computes the euclidean distance between two vectors"""
    distance = np.linalg.norm(vector_a - vector_b)
    return 1 / (1 + distance)


def manhattan_distance(vector_a: np.array, vector_b: np.array) -> float:
    """Computes the Manhattan distance between two vectors"""
    distance = np.sum(np.abs(vector_a - vector_b))
    return 1 / (1 + distance)


class ANNVectorDatabase:
    """
    Enhanced Vector Database with FAISS-based Approximate Nearest Neighbor search.
    Provides both exact and approximate search capabilities.
    """
    
    def __init__(self, embedding_model: EmbeddingModel = None, use_ann: bool = True, ann_index_type: str = "flat"):
        self.embedding_model = embedding_model or EmbeddingModel()
        self.use_ann = use_ann
        self.ann_index_type = ann_index_type
        
        # Traditional storage for metadata and exact search
        self.vectors = defaultdict(np.array)
        self.metadata = defaultdict(dict)
        self.text_to_key = {}  # Map text to key for retrieval
        
        # FAISS index for ANN search
        self.faiss_index = None
        self.vector_dimension = None
        self.key_to_index = {}  # Map key to FAISS index position
        self.index_to_key = {}  # Map FAISS index position to key
        
        # Statistics
        self.total_vectors = 0
        self.rebuild_threshold = 1000  # Rebuild index every 1000 additions

    def _initialize_faiss_index(self, dimension: int):
        """Initialize FAISS index based on the specified type."""
        if self.ann_index_type == "flat":
            # Exact search (brute force)
            self.faiss_index = faiss.IndexFlatIP(dimension)  # Inner product for cosine similarity
        elif self.ann_index_type == "ivf":
            # For IVF, we'll create it later when we know the data size
            # This is just a placeholder - the real index will be created in _create_ivf_index
            self.faiss_index = None
        elif self.ann_index_type == "hnsw":
            # Hierarchical Navigable Small World graphs
            self.faiss_index = faiss.IndexHNSWFlat(dimension, 32)  # 32 connections per node
        else:
            raise ValueError(f"Unknown ANN index type: {self.ann_index_type}")
        
        self.vector_dimension = dimension
        print(f"Initialized FAISS index: {self.ann_index_type} with dimension {dimension}")

    def _normalize_vector(self, vector: np.array) -> np.array:
        """Normalize vector for cosine similarity in FAISS."""
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm

    def _create_ivf_index(self):
        """Create IVF index with appropriate number of clusters based on data size."""
        if self.ann_index_type != "ivf" or self.vector_dimension is None:
            return
        
        # Calculate appropriate number of clusters
        # Use 10% of data size, but between 4 and 100 clusters
        num_clusters = max(4, min(100, self.total_vectors // 10))
        
        # Create the IVF index
        quantizer = faiss.IndexFlatIP(self.vector_dimension)
        self.faiss_index = faiss.IndexIVFFlat(quantizer, self.vector_dimension, num_clusters)
        print(f"Created IVF index with {num_clusters} clusters for {self.total_vectors} vectors")

    def _train_ivf_index(self):
        """Train the IVF index with existing vectors."""
        if self.ann_index_type != "ivf":
            return
        
        # Create the index if it doesn't exist
        if self.faiss_index is None:
            self._create_ivf_index()
        
        if self.faiss_index is not None and not self.faiss_index.is_trained:
            # Collect all existing vectors for training
            vectors = []
            for key in self.vectors:
                normalized_vector = self._normalize_vector(self.vectors[key])
                vectors.append(normalized_vector)
            
            if len(vectors) > 0:
                # Convert to numpy array and train
                training_data = np.vstack(vectors)
                self.faiss_index.train(training_data)
                print(f"Trained IVF index with {len(vectors)} vectors")
            else:
                print("No vectors available for training IVF index")

    def insert(self, key: str, vector: np.array, metadata: Dict[str, Any] = None) -> None:
        """Insert a vector with metadata into the database."""
        # Store in traditional format
        self.vectors[key] = vector
        if metadata:
            self.metadata[key] = metadata
        else:
            self.metadata[key] = {
                "timestamp": datetime.now().isoformat(),
                "source": "unknown",
                "chunk_index": len(self.vectors) - 1
            }
        
        # Store text for retrieval
        self.text_to_key[key] = key
        
        # Add to FAISS index if using ANN
        if self.use_ann:
            if self.faiss_index is None:
                self._initialize_faiss_index(len(vector))
            
            # Normalize vector for cosine similarity
            normalized_vector = self._normalize_vector(vector)
            
            # For IVF indices, we need to create and train the index
            if self.ann_index_type == "ivf":
                if self.faiss_index is None:
                    self._create_ivf_index()
                if self.faiss_index is not None and not self.faiss_index.is_trained:
                    self._train_ivf_index()
            
            # Add to FAISS index (only if it exists and is trained)
            if self.faiss_index is not None:
                if self.ann_index_type == "ivf" and self.faiss_index.is_trained:
                    self.faiss_index.add(normalized_vector.reshape(1, -1))
                elif self.ann_index_type != "ivf":
                    self.faiss_index.add(normalized_vector.reshape(1, -1))
            
            # Update mappings
            self.key_to_index[key] = self.total_vectors
            self.index_to_key[self.total_vectors] = key
            self.total_vectors += 1

    def _get_all_vectors(self) -> np.array:
        """Get all vectors as a numpy array for training."""
        vectors = []
        for key in self.vectors:
            normalized_vector = self._normalize_vector(self.vectors[key])
            vectors.append(normalized_vector)
        return np.array(vectors)

    def search_exact(self, query_vector: np.array, k: int, distance_measure: Callable = cosine_similarity, 
                    metadata_filter: Dict[str, Any] = None) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Perform exact search using traditional method."""
        # Filter vectors based on metadata if provided
        if metadata_filter:
            filtered_items = []
            for key, vector in self.vectors.items():
                metadata = self.metadata[key]
                if all(metadata.get(filter_key) == filter_value 
                      for filter_key, filter_value in metadata_filter.items()):
                    filtered_items.append((key, vector))
        else:
            filtered_items = list(self.vectors.items())

        # Calculate similarities
        scores = [
            (key, distance_measure(query_vector, vector), self.metadata[key])
            for key, vector in filtered_items
        ]
        return sorted(scores, key=lambda x: x[1], reverse=True)[:k]

    def search_ann(self, query_vector: np.array, k: int, metadata_filter: Dict[str, Any] = None) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Perform approximate nearest neighbor search using FAISS."""
        if not self.use_ann or self.faiss_index is None:
            return self.search_exact(query_vector, k, metadata_filter=metadata_filter)
        
        # Normalize query vector
        normalized_query = self._normalize_vector(query_vector)
        
        # Search FAISS index
        scores, indices = self.faiss_index.search(normalized_query.reshape(1, -1), min(k * 2, self.total_vectors))
        
        # Convert FAISS results to our format
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:  # FAISS returns -1 for invalid indices
                continue
                
            key = self.index_to_key.get(idx)
            if key is None:
                continue
                
            # Apply metadata filter if provided
            if metadata_filter:
                metadata = self.metadata[key]
                if not all(metadata.get(filter_key) == filter_value 
                          for filter_key, filter_value in metadata_filter.items()):
                    continue
            
            results.append((key, float(score), self.metadata[key]))
        
        return results[:k]

    def search(self, query_vector: np.array, k: int, distance_measure: Callable = cosine_similarity, 
               metadata_filter: Dict[str, Any] = None, use_ann: Optional[bool] = None) -> List[Tuple[str, float, Dict[str, Any]]]:
        """
        Perform search using either exact or approximate method.
        
        Args:
            query_vector: Query vector
            k: Number of results to return
            distance_measure: Distance function (only used for exact search)
            metadata_filter: Filter by metadata
            use_ann: Override the default ANN setting
        """
        use_ann = use_ann if use_ann is not None else self.use_ann
        
        if use_ann and self.faiss_index is not None:
            return self.search_ann(query_vector, k, metadata_filter)
        else:
            return self.search_exact(query_vector, k, distance_measure, metadata_filter)

    def search_by_text(self, query_text: str, k: int, distance_measure: Callable = cosine_similarity, 
                      return_as_text: bool = False, metadata_filter: Dict[str, Any] = None, 
                      include_metadata: bool = True, use_ann: Optional[bool] = None) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Search by text query using embeddings."""
        if k < 0:
            raise ValueError("`k` cannot be negative")
            
        query_vector = self.embedding_model.get_embedding(query_text)
        results = self.search(query_vector, k, distance_measure, metadata_filter, use_ann)
        
        if return_as_text:
            return [result[0] for result in results]
        elif include_metadata:
            return results
        else:
            return [(result[0], result[1]) for result in results]

    def retrieve_from_key(self, key: str) -> Tuple[np.array, Dict[str, Any]]:
        """Retrieve vector and metadata by key."""
        return self.vectors.get(key, None), self.metadata.get(key, {})

    async def abuild_from_list(self, list_of_text: List[str], source_name: str = "default", 
                              source_type: str = "text") -> "ANNVectorDatabase":
        """Build database from a list of texts."""
        embeddings = await self.embedding_model.async_get_embeddings(list_of_text)

        for i, (text, embedding) in enumerate(zip(list_of_text, embeddings)):
            metadata = {
                "source": source_name,
                "source_type": source_type,
                "chunk_index": i,
                "chunk_length": len(text),
                "timestamp": datetime.now().isoformat(),
                "total_chunks": len(list_of_text)
            }
            self.insert(text, np.array(embedding), metadata)
        
        return self

    def get_metadata_summary(self) -> Dict[str, Any]:
        """Get summary of database contents."""
        if not self.metadata:
            return {}
        
        sources = set()
        source_types = set()
        chunk_counts = {}
        total_chunks = len(self.metadata)
        
        for metadata in self.metadata.values():
            source = metadata.get("source", "unknown")
            sources.add(source)
            source_type = metadata.get("source_type", "unknown")
            source_types.add(source_type)
            chunk_counts[source] = chunk_counts.get(source, 0) + 1
        
        return {
            "total_chunks": total_chunks,
            "sources": list(sources),
            "source_types": list(source_types),
            "chunks_per_source": chunk_counts,
            "sample_metadata": next(iter(self.metadata.values())) if self.metadata else {},
            "ann_enabled": self.use_ann,
            "ann_index_type": self.ann_index_type,
            "faiss_index_size": self.total_vectors if self.faiss_index else 0
        }

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics."""
        return {
            "total_vectors": self.total_vectors,
            "ann_enabled": self.use_ann,
            "index_type": self.ann_index_type,
            "index_trained": self.faiss_index.is_trained if self.faiss_index else False,
            "memory_usage_estimate": self.total_vectors * self.vector_dimension * 4 if self.vector_dimension else 0  # 4 bytes per float32
        }

    def ensure_index_trained(self):
        """Ensure the index is trained, especially for IVF indices."""
        if self.use_ann and self.faiss_index is not None:
            if self.ann_index_type == "ivf" and not self.faiss_index.is_trained:
                if self.total_vectors > 0:
                    print(f"Training IVF index with {self.total_vectors} vectors...")
                    self._train_ivf_index()
                else:
                    print("No vectors available for training IVF index")


# Factory function for creating different types of vector databases
def create_vector_database(use_ann: bool = True, ann_index_type: str = "flat", 
                          embedding_model: EmbeddingModel = None) -> ANNVectorDatabase:
    """
    Factory function to create a vector database with specified configuration.
    
    Args:
        use_ann: Whether to use approximate nearest neighbor search
        ann_index_type: Type of ANN index ("flat", "ivf", "hnsw")
        embedding_model: Embedding model to use
    
    Returns:
        Configured ANNVectorDatabase instance
    """
    return ANNVectorDatabase(
        embedding_model=embedding_model,
        use_ann=use_ann,
        ann_index_type=ann_index_type
    )
