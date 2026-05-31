import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/.env and repo-root .env (whichever exists)
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/video_rag",
  qdrantUrl: process.env.QDRANT_URL ?? "http://127.0.0.1:6333",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  qdrantCollection: process.env.QDRANT_COLLECTION ?? "video_chunks",
  chunkSize: 1000,
  chunkOverlap: 200,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "bge-small-en-v1.5",
  embeddingDimensions: 384,
  embeddingCacheDir: process.env.EMBEDDING_CACHE_DIR ?? "./.embedding-cache",
  geminiModel: "gemini-2.5-flash",
  whisperModel: process.env.WHISPER_MODEL ?? "whisper-1",
  whisperLocalModel: process.env.WHISPER_LOCAL_MODEL ?? "tiny",
  whisperPath: process.env.WHISPER_PATH?.trim() ?? "",
  tmpDir: process.env.TMP_DIR ?? "./tmp",
  ytDlpPath: process.env.YT_DLP_PATH?.trim() ?? "",
  ffmpegPath: process.env.FFMPEG_PATH?.trim() ?? "",
};

export function requireApiKeys(): void {
  if (!config.geminiApiKey) throw new Error("Missing GEMINI_API_KEY");
}
