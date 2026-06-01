import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config, requireApiKeys } from "./config.js";
import { pool } from "./db/pool.js";
import { ensureCollection } from "./services/rag.js";
import { pingQdrant } from "./services/qdrantClient.js";
import { initEmbeddings } from "./services/embeddings.js";
import { resolveFfmpegDir, resolveYtDlp } from "./utils/ytdlp.js";
import videoRoutes from "./routes/videos.js";
import chatRoutes from "./routes/chat.js";
import { errorHandler } from "./middleware/errorHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  requireApiKeys();

 try {
  await resolveYtDlp();
  resolveFfmpegDir();
  console.log("yt-dlp detected");
} catch {
  console.warn("yt-dlp not found");
}

  console.log("Embedding model will initialize when first needed");
  await pingQdrant();
  console.log(`Qdrant connected: ${config.qdrantUrl}`);

  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await pool.query(schema);
  await ensureCollection();

  await fs.promises.mkdir(path.resolve(config.tmpDir), { recursive: true });

  const app = express();
  app.use(cors({ origin: config.clientUrl }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/videos", videoRoutes);
  app.use("/chat", chatRoutes);

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);

  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const msg = err instanceof Error ? err.message : "";

  if (code === "28P01") {
    console.error(
      "\nPostgres login failed. DATABASE_URL in server/.env should be:\n" +
        "postgresql://postgres:postgres@localhost:5433/video_rag"
    );
  } else if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
    console.error(
      "\nCannot reach Postgres or Qdrant. Start Docker Desktop, then run from the project root:\n" +
        "  docker compose up -d\n" +
        "Then restart the server: cd server && npm run dev"
    );
  }

  process.exit(1);
});
