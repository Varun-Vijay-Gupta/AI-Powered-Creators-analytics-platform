import fs from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import { v4 as uuidv4 } from "uuid";
import { YoutubeTranscript } from "youtube-transcript";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { cleanupFile, compressAudioForWhisper, downloadAudio } from "../utils/ytdlp.js";
import { extractYoutubeVideoId } from "../utils/urls.js";
import { transcribeWithLocalWhisper } from "./localWhisper.js";
import type { TranscriptSegment } from "../types.js";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new AppError(500, "Missing OPENAI_API_KEY. Add it to server/.env and restart.");
  }
  if (!openai) {
    openai = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: 300_000,
      maxRetries: 2,
    });
  }
  return openai;
}

function formatTranscriptionError(err: unknown): string {
  if (err instanceof OpenAI.APIConnectionError) {
    const cause =
      err.cause instanceof Error ? err.cause.message : err.cause ? String(err.cause) : "";
    return cause
      ? `Connection to OpenAI failed (${cause}). Check network/VPN, or use local Whisper fallback.`
      : "Connection to OpenAI failed. Check network, VPN, or firewall.";
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429 || /quota|billing|insufficient/i.test(err.message)) {
      return "OpenAI API quota exceeded. Add billing at https://platform.openai.com/account/billing or install local Whisper: pip install openai-whisper";
    }
    if (err.status === 401) {
      return "Invalid OPENAI_API_KEY. Check server/.env.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown transcription error";
}

function shouldTryLocalWhisper(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIError) {
    return err.status === 429 || err.status === 503 || err.status === 502;
  }
  return false;
}

async function transcribeWithOpenAI(uploadPath: string): Promise<TranscriptSegment[]> {
  const size = fs.statSync(uploadPath).size;
  if (size > WHISPER_MAX_BYTES) {
    throw new AppError(
      422,
      `Audio is too large for Whisper (${Math.round(size / 1024 / 1024)}MB, max 25MB).`
    );
  }

  const buffer = fs.readFileSync(uploadPath);
  const file = await toFile(buffer, "audio.mp3", { type: "audio/mpeg" });

  const transcription = await getOpenAI().audio.transcriptions.create({
    file,
    model: config.whisperModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = transcription.segments ?? [];
  if (!segments.length && transcription.text) {
    return [{ text: transcription.text, start: 0, duration: 0 }];
  }

  return segments.map((seg) => ({
    text: seg.text.trim(),
    start: seg.start,
    duration: seg.end - seg.start,
  }));
}

export async function getYoutubeTranscript(url: string): Promise<TranscriptSegment[]> {
  const videoId = extractYoutubeVideoId(url);

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (!items.length) throw new Error("empty transcript");

    return items.map((item) => ({
      text: item.text,
      start: item.offset / 1000,
      duration: item.duration / 1000,
    }));
  } catch {
    return transcribeWithWhisper(url, "youtube");
  }
}

export async function getInstagramTranscript(url: string): Promise<TranscriptSegment[]> {
  return transcribeWithWhisper(url, "instagram");
}

async function transcribeWithWhisper(
  url: string,
  source: "youtube" | "instagram"
): Promise<TranscriptSegment[]> {
  const tmpDir = path.resolve(config.tmpDir);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const id = uuidv4();
  const rawAudioPath = path.join(tmpDir, `${source}-${id}-raw.mp3`);
  const whisperAudioPath = path.join(tmpDir, `${source}-${id}-whisper.mp3`);
  const tempFiles = [rawAudioPath, whisperAudioPath];

  try {
    const downloaded = await downloadAudio(url, rawAudioPath);
    if (downloaded !== rawAudioPath && !tempFiles.includes(downloaded)) {
      tempFiles.push(downloaded);
    }

    const uploadPath = await compressAudioForWhisper(downloaded, whisperAudioPath);
    if (uploadPath !== whisperAudioPath && !tempFiles.includes(uploadPath)) {
      tempFiles.push(uploadPath);
    }

    if (config.openaiApiKey.trim()) {
      try {
        return await transcribeWithOpenAI(uploadPath);
      } catch (err) {
        if (!shouldTryLocalWhisper(err)) {
          throw new AppError(502, `Whisper transcription failed: ${formatTranscriptionError(err)}`);
        }
        console.warn(
          `OpenAI Whisper unavailable (${formatTranscriptionError(err)}). Trying local Whisper...`
        );
      }
    } else {
      console.log("No OPENAI_API_KEY — transcribing with local Whisper.");
    }

    return await transcribeWithLocalWhisper(uploadPath);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, `Whisper transcription failed: ${formatTranscriptionError(err)}`);
  } finally {
    await Promise.all(tempFiles.map((f) => cleanupFile(f)));
  }
}

export function segmentsToPlainText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}
