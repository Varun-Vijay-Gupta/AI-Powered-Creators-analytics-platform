export interface VideoMetadata {
  title: string;
  creatorName: string;
  followerCount: number | null;
  views: number;
  likes: number;
  comments: number;
  uploadDate: string | null;
  durationSeconds: number;
  hashtags: string[];
}

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface VideoRecord extends VideoMetadata {
  videoKey: "A" | "B";
  source: "youtube" | "instagram";
  url: string;
  transcript: string;
  engagementRate: number;
}

export interface VideoResponse {
  videoKey: "A" | "B";
  source: "youtube" | "instagram";
  url: string;
  title: string;
  creatorName: string;
  followerCount: number | null;
  views: number;
  likes: number;
  comments: number;
  uploadDate: string | null;
  durationSeconds: number;
  hashtags: string[];
  engagementRate: number;
  hasTranscript: boolean;
}

export interface ChunkMetadata {
  sessionId: string;
  videoId: "A" | "B";
  chunkId: string;
  source: "youtube" | "instagram";
  timestampStart: string;
  timestampEnd: string;
  text: string;
}

export interface SourceCitation {
  videoId: "A" | "B";
  chunkId: string;
  timestampStart: string;
  timestampEnd: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
}
