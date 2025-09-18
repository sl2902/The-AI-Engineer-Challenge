import yt_dlp
from typing import List, Dict, Any
from datetime import datetime
import re
import asyncio
import concurrent.futures

class YouTubeTranscriptLoader:
    def __init__(self, language: str = "en"):
        self.language = language

    def _run_with_timeout(self, func, timeout_seconds=30):
        """Run a function with a timeout to prevent hanging."""
        try:
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(func)
                return future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError:
            print(f"Function timed out after {timeout_seconds} seconds")
            raise TimeoutError(f"Operation timed out after {timeout_seconds} seconds")
        except Exception as e:
            print(f"Function failed: {str(e)}")
            raise

    def extract_video_id(self, url: str) -> str | None:
        """Extract video ID from common YouTube URL formats."""
        # Check for invalid URL patterns that indicate playlists or multiple videos
        if '&' in url or 'list=' in url or 'playlist' in url.lower():
            print(f"Invalid YouTube URL detected (contains &, list=, or playlist): {url}")
            return None
            
        patterns = [
            r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)",
            r"youtube\.com/watch\?.*v=([^&\n?#]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                video_id = match.group(1)
                # Additional validation: video ID should be 11 characters
                if len(video_id) == 11:
                    return video_id
                else:
                    print(f"Invalid video ID length ({len(video_id)}): {video_id}")
                    return None
        return None

    def get_video_info(self, video_url: str) -> Dict[str, Any]:
        """Get video info (and whether transcript is available)."""
        video_id = self.extract_video_id(video_url)
        ext = 'txt'
        if not video_id:
            return {"valid": False, "error": "Invalid YouTube URL"}

        ydl_opts = {
            "skip_download": True, 
            "quiet": True,
            "socket_timeout": 10,  # 10 second timeout
            "timeout": 10,         # 10 second timeout
            "outtmpl": "/tmp/aimakerspace/data/%(video_id)s.%(ext)s"
        }
        def _extract_info():
            print(f"🔧 Creating YouTubeDL instance with options: {ydl_opts}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                print(f"Calling extract_info for URL: {video_url}")
                info = ydl.extract_info(video_url, download=False)
                print(f"extract_info completed successfully")
                
                subtitles = info.get("subtitles", {})
                auto_subs = info.get("automatic_captions", {})
                available_langs = list(subtitles.keys()) + list(auto_subs.keys())
                print(f"Found subtitles: {list(subtitles.keys())}")
                print(f"Found auto_subs: {list(auto_subs.keys())}")

                # Check if the requested language is available
                has_requested_lang = self.language in subtitles or self.language in auto_subs
                print(f"🔍 Requested language '{self.language}' available: {has_requested_lang}")
                
                return {
                    "valid": has_requested_lang,
                    "video_id": video_id,
                    "video_url": video_url,
                    "language": self.language,
                    "available_languages": available_langs,
                    "error": f"No transcripts available in {self.language}. Available languages: {available_langs}" if not has_requested_lang else None
                }

        try:
            return self._run_with_timeout(_extract_info, timeout_seconds=30)
        except TimeoutError as e:
            print(f"get_video_info timed out: {str(e)}")
            return {"valid": False, "video_id": video_id, "video_url": video_url, "error": f"Timeout: {str(e)}"}
        except Exception as e:
            error_msg = str(e)
            print(f"Exception in get_video_info: {error_msg}")
            
            # Handle common YouTube errors
            if "bot" in error_msg.lower() or "captcha" in error_msg.lower() or "verify" in error_msg.lower():
                return {"valid": False, "video_id": video_id, "video_url": video_url, "error": "YouTube detected automated access. Please try again later or use a different video."}
            elif "private" in error_msg.lower() or "unavailable" in error_msg.lower():
                return {"valid": False, "video_id": video_id, "video_url": video_url, "error": "Video is private or unavailable. Please check the URL and try again."}
            elif "age" in error_msg.lower() or "restricted" in error_msg.lower():
                return {"valid": False, "video_id": video_id, "video_url": video_url, "error": "Video is age-restricted or region-blocked. Cannot access transcript."}
            else:
                return {"valid": False, "video_id": video_id, "video_url": video_url, "error": f"YouTube access error: {error_msg}"}

    def get_transcript(self, video_url: str, chunk_by_time: bool = True, chunk_duration: int = 60) -> List[Dict[str, Any]]:
        """Fetch transcript using yt_dlp (falls back to auto captions)."""
        video_id = self.extract_video_id(video_url)
        if not video_id:
            raise ValueError(f"Invalid YouTube URL: {video_url}")

        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [self.language],
            "subtitlesformat": "vtt",
            "quiet": True,
            "socket_timeout": 30,  # 30 second timeout
            "timeout": 30,         # 30 second timeout
        }

        def _get_transcript_info():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                subs = info.get("requested_subtitles", {})
                if not subs:
                    raise Exception(f"No subtitles available for {video_id} in {self.language}")
                return subs[self.language]["url"]

        try:
            url = self._run_with_timeout(_get_transcript_info, timeout_seconds=30)
        except TimeoutError as e:
            print(f"get_transcript timed out: {str(e)}")
            raise TimeoutError(f"Transcript extraction timed out: {str(e)}")
        except Exception as e:
            error_msg = str(e)
            print(f"Exception in get_transcript: {error_msg}")
            
            # Handle common YouTube errors
            if "bot" in error_msg.lower() or "captcha" in error_msg.lower() or "verify" in error_msg.lower():
                raise Exception("YouTube detected automated access. Please try again later or use a different video.")
            elif "private" in error_msg.lower() or "unavailable" in error_msg.lower():
                raise Exception("Video is private or unavailable. Please check the URL and try again.")
            elif "age" in error_msg.lower() or "restricted" in error_msg.lower():
                raise Exception("Video is age-restricted or region-blocked. Cannot access transcript.")
            else:
                raise Exception(f"YouTube access error: {error_msg}")

        # Fetch and parse VTT manually
        import requests
        resp = requests.get(url)
        resp.raise_for_status()
        vtt_text = resp.text

        # Very simple WebVTT parser
        transcript = []
        for block in vtt_text.split("\n\n"):
            if "-->" in block:
                lines = block.splitlines()
                if len(lines) >= 2:
                    time_line, text_lines = lines[0], lines[1:]
                    start_str, end_str = time_line.split(" --> ")
                    transcript.append({
                        "start": start_str,
                        "end": end_str,
                        "text": self._clean_vtt_text(" ".join(text_lines)).strip()
                    })

        if not chunk_by_time:
            full_text = " ".join([item["text"] for item in transcript])
            return [{
                "text": full_text,
                "metadata": {
                    "source_type": "youtube",
                    "source_name": "YouTube",
                    "chunk_index": 0,
                    "chunk_length": len(full_text),
                    "timestamp": datetime.now().isoformat(),
                    "total_chunks": 1,
                    "source_specific": {
                        "video_id": video_id,
                        "video_url": video_url,
                        "language": self.language,
                    },
                },
            }]

        # Simple chunking by count (could refine by timestamps)
        chunks, current_chunk, chunk_index = [], [], 0
        for i, item in enumerate(transcript):
            current_chunk.append(item["text"])
            if (i + 1) % 20 == 0 or i == len(transcript) - 1:
                chunk_text = " ".join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "metadata": {
                        "source_type": "youtube",
                        "source_name": "YouTube",
                        "chunk_index": chunk_index,
                        "chunk_length": len(chunk_text),
                        "timestamp": datetime.now().isoformat(),
                        "total_chunks": 0,
                        "source_specific": {
                            "video_id": video_id,
                            "video_url": video_url,
                            "language": self.language,
                        },
                    },
                })
                chunk_index += 1
                current_chunk = []

        for c in chunks:
            c["metadata"]["total_chunks"] = len(chunks)
        return chunks
    
    def _clean_vtt_text(self, text):
        """Remove VTT formatting from transcript text."""
        import re
        # Remove time codes like <00:00:30.920>
        text = re.sub(r'<[^>]+>', '', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


if __name__ == "__main__":
    loader = YouTubeTranscriptLoader()
    print(loader.get_video_info('https://www.youtube.com/watch?v=d-lZH6TJq2U'))