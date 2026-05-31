import { AppError } from "./errors.js";

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
];

const INSTAGRAM_PATTERNS = [
  /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[\w-]+/,
];

export function validateYoutubeUrl(url: string): void {
  if (!YOUTUBE_PATTERNS.some((p) => p.test(url.trim()))) {
    throw new AppError(400, "Invalid YouTube URL. Use a standard watch, Shorts, or youtu.be link.");
  }
}

export function validateInstagramUrl(url: string): void {
  if (!INSTAGRAM_PATTERNS.some((p) => p.test(url.trim()))) {
    throw new AppError(400, "Invalid Instagram Reel URL.");
  }
}

export function extractYoutubeVideoId(url: string): string {
  const trimmed = url.trim();
  const shortMatch = trimmed.match(/youtu\.be\/([\w-]+)/);
  if (shortMatch) return shortMatch[1];

  const watchMatch = trimmed.match(/[?&]v=([\w-]+)/);
  if (watchMatch) return watchMatch[1];

  const shortsMatch = trimmed.match(/shorts\/([\w-]+)/);
  if (shortsMatch) return shortsMatch[1];

  throw new AppError(400, "Could not parse YouTube video ID from URL.");
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function calcEngagementRate(likes: number, comments: number, views: number): number {
  if (views <= 0) return 0;
  return ((likes + comments) / views) * 100;
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u0080-\uFFFF]+/g);
  return matches ? [...new Set(matches.map((h) => h.toLowerCase()))] : [];
}
