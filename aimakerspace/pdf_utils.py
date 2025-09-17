"""
PDF processing utilities for text extraction and chunking.
This module provides functionality to extract text from PDF files and chunk it for vector database storage.
"""

import PyPDF2
import io
from typing import List, Dict, Any
from datetime import datetime
import re


class PDFProcessor:
    """
    A class to handle PDF text extraction and chunking operations.
    """
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        """
        Initialize the PDF processor.
        
        Args:
            chunk_size: Maximum number of characters per chunk
            chunk_overlap: Number of characters to overlap between chunks
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def extract_text_from_pdf(self, pdf_file_content: bytes) -> str:
        """
        Extract text content from a PDF file.
        
        Args:
            pdf_file_content: Raw bytes of the PDF file
            
        Returns:
            Extracted text as a string
            
        Raises:
            ValueError: If the PDF cannot be processed
        """
        try:
            pdf_file = io.BytesIO(pdf_file_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text += f"\n--- Page {page_num + 1} ---\n"
                        text += page_text
                except Exception as e:
                    print(f"Warning: Could not extract text from page {page_num + 1}: {e}")
                    continue
            
            if not text.strip():
                raise ValueError("No text could be extracted from the PDF")
                
            return text.strip()
            
        except Exception as e:
            raise ValueError(f"Failed to process PDF: {str(e)}")
    
    def clean_text(self, text: str) -> str:
        """
        Clean and normalize extracted text.
        
        Args:
            text: Raw extracted text
            
        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove page markers
        text = re.sub(r'--- Page \d+ ---', '', text)
        
        # Remove excessive newlines
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        return text.strip()
    
    def chunk_text(self, text: str) -> List[str]:
        """
        Split text into semantically meaningful chunks for better vector search.
        Uses a hierarchical approach: paragraphs -> sentences -> words.
        
        Args:
            text: Text to chunk
            
        Returns:
            List of text chunks
        """
        if len(text) <= self.chunk_size:
            return [text]
        
        # First, try to split by paragraphs (double newlines)
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        chunks = []
        current_chunk = ""
        
        for paragraph in paragraphs:
            # If adding this paragraph would exceed chunk size
            if len(current_chunk) + len(paragraph) + 2 > self.chunk_size:
                # Save current chunk if it has content
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                
                # If paragraph is too long, split it by sentences
                if len(paragraph) > self.chunk_size:
                    sentence_chunks = self._split_by_sentences(paragraph)
                    chunks.extend(sentence_chunks)
                    current_chunk = ""
                else:
                    current_chunk = paragraph
            else:
                # Add paragraph to current chunk
                if current_chunk:
                    current_chunk += "\n\n" + paragraph
                else:
                    current_chunk = paragraph
        
        # Add the last chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        # Apply overlap between chunks
        return self._apply_overlap(chunks)
    
    def _split_by_sentences(self, text: str) -> List[str]:
        """
        Split text by sentences, respecting chunk size limits.
        
        Args:
            text: Text to split
            
        Returns:
            List of sentence-based chunks
        """
        import re
        
        # Split by sentence endings (., !, ?) followed by whitespace
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # If adding this sentence would exceed chunk size
            if len(current_chunk) + len(sentence) + 2 > self.chunk_size:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                
                # If sentence is too long, split by words
                if len(sentence) > self.chunk_size:
                    word_chunks = self._split_by_words(sentence)
                    chunks.extend(word_chunks)
                    current_chunk = ""
                else:
                    current_chunk = sentence
            else:
                if current_chunk:
                    current_chunk += ". " + sentence
                else:
                    current_chunk = sentence
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _split_by_words(self, text: str) -> List[str]:
        """
        Split text by words as a last resort.
        
        Args:
            text: Text to split
            
        Returns:
            List of word-based chunks
        """
        words = text.split()
        chunks = []
        current_chunk = ""
        
        for word in words:
            if len(current_chunk) + len(word) + 1 > self.chunk_size:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                current_chunk = word
            else:
                if current_chunk:
                    current_chunk += " " + word
                else:
                    current_chunk = word
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _apply_overlap(self, chunks: List[str]) -> List[str]:
        """
        Apply overlap between chunks to maintain context.
        
        Args:
            chunks: List of chunks to apply overlap to
            
        Returns:
            List of chunks with overlap applied
        """
        if len(chunks) <= 1 or self.chunk_overlap <= 0:
            return chunks
        
        overlapped_chunks = []
        
        for i, chunk in enumerate(chunks):
            if i == 0:
                # First chunk - no overlap from previous
                overlapped_chunks.append(chunk)
            else:
                # Add overlap from previous chunk
                prev_chunk = chunks[i-1]
                overlap_text = self._get_overlap_text(prev_chunk, self.chunk_overlap)
                
                if overlap_text:
                    overlapped_chunk = overlap_text + " " + chunk
                    overlapped_chunks.append(overlapped_chunk)
                else:
                    overlapped_chunks.append(chunk)
        
        return overlapped_chunks
    
    def _get_overlap_text(self, text: str, overlap_size: int) -> str:
        """
        Get the last portion of text for overlap.
        
        Args:
            text: Text to get overlap from
            overlap_size: Size of overlap in characters
            
        Returns:
            Overlap text
        """
        if len(text) <= overlap_size:
            return text
        
        # Try to break at word boundary
        overlap_start = len(text) - overlap_size
        word_boundary = text.rfind(' ', overlap_start)
        
        if word_boundary > overlap_start - 50:  # Within reasonable distance
            return text[word_boundary + 1:]
        else:
            return text[overlap_start:]
    
    def process_pdf(self, pdf_file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        Complete PDF processing pipeline: extract, clean, and chunk text.
        
        Args:
            pdf_file_content: Raw bytes of the PDF file
            filename: Original filename of the PDF
            
        Returns:
            Dictionary containing processed text chunks and metadata
        """
        try:
            # Extract text
            raw_text = self.extract_text_from_pdf(pdf_file_content)
            
            # Clean text
            cleaned_text = self.clean_text(raw_text)
            
            # Chunk text
            chunks = self.chunk_text(cleaned_text)
            
            # Create metadata
            metadata = {
                "filename": filename,
                "total_chunks": len(chunks),
                "total_characters": len(cleaned_text),
                "processing_timestamp": datetime.now().isoformat(),
                "chunk_size": self.chunk_size,
                "chunk_overlap": self.chunk_overlap
            }
            
            return {
                "chunks": chunks,
                "metadata": metadata,
                "raw_text": cleaned_text
            }
            
        except Exception as e:
            raise ValueError(f"PDF processing failed: {str(e)}")


def create_pdf_processor(chunk_size: int = 1000, chunk_overlap: int = 200) -> PDFProcessor:
    """
    Factory function to create a PDF processor with custom settings.
    
    Args:
        chunk_size: Maximum number of characters per chunk
        chunk_overlap: Number of characters to overlap between chunks
        
    Returns:
        Configured PDFProcessor instance
    """
    return PDFProcessor(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
