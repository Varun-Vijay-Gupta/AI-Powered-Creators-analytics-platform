import { fetchPlatformMetadata } from "./platformStats.js";
import { getYoutubeTranscript, segmentsToPlainText } from "./transcript.js";
import { calcEngagementRate, extractHashtags, extractYoutubeVideoId } from "../utils/urls.js";
import { AppError } from "../utils/errors.js";
import type { VideoRecord, TranscriptSegment } from "../types.js";

function parseUploadDate(raw?: string): string | null {
  if (!raw || raw.length !== 8) return null;
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}

function buildMetadata(raw: Awaited<ReturnType<typeof fetchPlatformMetadata>>, description: string) {
  const title = raw.title ?? "Unknown title";
  const creatorName = raw.uploader ?? raw.channel ?? "Unknown creator";
  const followerCount = raw.channel_follower_count ?? raw.follower_count ?? null;
  const views = raw.view_count ?? 0;
  const likes = raw.like_count ?? 0;
  const comments = raw.comment_count ?? 0;
  const durationSeconds = Math.round(raw.duration ?? 0);
  const tagHashtags = (raw.tags ?? []).filter((t) => t.startsWith("#"));
  const descHashtags = extractHashtags(description);
  const hashtags = [...new Set([...tagHashtags, ...descHashtags].map((h) => h.toLowerCase()))];

  return {
    title,
    creatorName,
    followerCount,
    views,
    likes,
    comments,
    uploadDate: parseUploadDate(raw.upload_date),
    durationSeconds,
    hashtags,
  };
}

export async function fetchYoutubeVideo(url: string): Promise<{
  record: Omit<VideoRecord, "videoKey">;
  segments: TranscriptSegment[];
}> {
  extractYoutubeVideoId(url);
  const raw = await fetchPlatformMetadata(url, "youtube");
  const description = raw.description ?? "";
  const meta = buildMetadata(raw, description);

  if (meta.durationSeconds <= 0) {
    throw new AppError(400, "YouTube video appears to have zero duration.");
  }

  const segments = await getYoutubeTranscript(url);
  const transcript = segmentsToPlainText(segments);

  if (!transcript) {
    throw new AppError(422, "Could not extract a transcript from the YouTube video.");
  }

  return {
    record: {
      source: "youtube",
      url,
      ...meta,
      transcript,
      engagementRate: calcEngagementRate(meta.likes, meta.comments, meta.views),
    },
    segments,
  };
}

export async function fetchInstagramVideo(url: string): Promise<{
  record: Omit<VideoRecord, "videoKey">;
  segments: TranscriptSegment[];
}> {
  const raw = await fetchPlatformMetadata(url, "instagram");
  const description = raw.description ?? "";
  const meta = buildMetadata(raw, description);

  if (meta.durationSeconds <= 0) {
    throw new AppError(400, "Instagram reel appears to have zero duration.");
  }

  const { getInstagramTranscript } = await import("./transcript.js");
  const segments = await getInstagramTranscript(url);
  const transcript = segmentsToPlainText(segments);

  if (!transcript) {
    throw new AppError(422, "Could not transcribe the Instagram reel.");
  }

  return {
    record: {
      source: "instagram",
      url,
      ...meta,
      transcript,
      engagementRate: calcEngagementRate(meta.likes, meta.comments, meta.views),
    },
    segments,
  };
}
