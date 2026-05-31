export interface SourceCitation {
  videoId: "A" | "B";
  chunkId: string;
  timestampStart: string;
  timestampEnd: string;
}

export interface VideoData {
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

export interface AnalyzeResponse {
  sessionId: string;
  videoA: VideoData;
  videoB: VideoData;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  streaming?: boolean;
}
