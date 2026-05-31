import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { deleteSessionChunks, indexVideoTranscript } from "./rag.js";
import type { VideoRecord, VideoResponse, ChatMessage, SourceCitation } from "../types.js";

function toVideoResponse(row: Record<string, unknown>): VideoResponse {
  return {
    videoKey: row.video_key as "A" | "B",
    source: row.source as "youtube" | "instagram",
    url: row.url as string,
    title: (row.title as string) ?? "",
    creatorName: (row.creator_name as string) ?? "",
    followerCount: row.follower_count != null ? Number(row.follower_count) : null,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    uploadDate: row.upload_date ? new Date(row.upload_date as string).toISOString() : null,
    durationSeconds: Number(row.duration_seconds ?? 0),
    hashtags: (row.hashtags as string[]) ?? [],
    engagementRate: Number(row.engagement_rate ?? 0),
    hasTranscript: Boolean(row.transcript),
  };
}

export async function createSession(): Promise<string> {
  const id = uuidv4();
  await query("INSERT INTO sessions (id) VALUES ($1)", [id]);
  return id;
}

export async function saveVideo(
  sessionId: string,
  videoKey: "A" | "B",
  video: VideoRecord
): Promise<void> {
  await query(
    `INSERT INTO videos (
      session_id, video_key, source, url, title, creator_name, follower_count,
      views, likes, comments, upload_date, duration_seconds, hashtags,
      transcript, engagement_rate
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (session_id, video_key) DO UPDATE SET
      source = EXCLUDED.source,
      url = EXCLUDED.url,
      title = EXCLUDED.title,
      creator_name = EXCLUDED.creator_name,
      follower_count = EXCLUDED.follower_count,
      views = EXCLUDED.views,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      upload_date = EXCLUDED.upload_date,
      duration_seconds = EXCLUDED.duration_seconds,
      hashtags = EXCLUDED.hashtags,
      transcript = EXCLUDED.transcript,
      engagement_rate = EXCLUDED.engagement_rate`,
    [
      sessionId,
      videoKey,
      video.source,
      video.url,
      video.title,
      video.creatorName,
      video.followerCount,
      video.views,
      video.likes,
      video.comments,
      video.uploadDate,
      video.durationSeconds,
      video.hashtags,
      video.transcript,
      video.engagementRate,
    ]
  );
}

export async function getSessionVideos(sessionId: string): Promise<VideoResponse[]> {
  const result = await query(
    "SELECT * FROM videos WHERE session_id = $1 ORDER BY video_key",
    [sessionId]
  );
  return result.rows.map(toVideoResponse);
}

export async function getVideoMetadataForPrompt(sessionId: string): Promise<string> {
  const videos = await getSessionVideos(sessionId);
  if (!videos.length) return "No video metadata available.";

  return videos
    .map((v) => {
      return [
        `Video ${v.videoKey} (${v.source})`,
        `Title: ${v.title}`,
        `Creator: ${v.creatorName}`,
        `Followers/Subscribers: ${v.followerCount ?? "unknown"}`,
        `Views: ${v.views}`,
        `Likes: ${v.likes}`,
        `Comments: ${v.comments}`,
        `Engagement rate: ${v.engagementRate.toFixed(2)}%`,
        `Upload date: ${v.uploadDate ?? "unknown"}`,
        `Duration: ${v.durationSeconds}s`,
        `Hashtags: ${v.hashtags.join(", ") || "none"}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function saveChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources?: SourceCitation[]
): Promise<void> {
  await query(
    "INSERT INTO chat_messages (session_id, role, content, sources) VALUES ($1, $2, $3, $4)",
    [sessionId, role, content, sources ? JSON.stringify(sources) : null]
  );
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const result = await query(
    "SELECT role, content, sources FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );

  return result.rows.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content as string,
    sources: row.sources ? (row.sources as SourceCitation[]) : undefined,
  }));
}

export async function resetSessionData(sessionId: string): Promise<void> {
  await deleteSessionChunks(sessionId);
  await query("DELETE FROM chat_messages WHERE session_id = $1", [sessionId]);
  await query("DELETE FROM videos WHERE session_id = $1", [sessionId]);
}

export { indexVideoTranscript };
