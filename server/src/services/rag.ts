import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { v5 as uuidv5 } from "uuid";
import { config } from "../config.js";
import { formatTimestamp } from "../utils/urls.js";
import { AppError } from "../utils/errors.js";
import { embedDocuments, embedQuery } from "./embeddings.js";
import { getQdrant, withQdrantRetry } from "./qdrantClient.js";
import type { ChunkMetadata, TranscriptSegment } from "../types.js";

const CHUNK_NAMESPACE = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UPSERT_BATCH_SIZE = 32;

export async function ensureCollection(): Promise<void> {
  await withQdrantRetry("ensure collection", async () => {
    const client = getQdrant();
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === config.qdrantCollection);

    if (exists) {
      const info = await client.getCollection(config.qdrantCollection);
      const vectors = info.config?.params?.vectors;
      const size =
        vectors && typeof vectors === "object" && "size" in vectors
          ? (vectors as { size: number }).size
          : null;

      if (size !== config.embeddingDimensions) {
        console.log(
          `Recreating Qdrant collection (was ${size ?? "?"}d, need ${config.embeddingDimensions}d).`
        );
        await client.deleteCollection(config.qdrantCollection);
      }
    }

    const stillExists = (await client.getCollections()).collections.some(
      (c) => c.name === config.qdrantCollection
    );

    if (!stillExists) {
      await client.createCollection(config.qdrantCollection, {
        vectors: { size: config.embeddingDimensions, distance: "Cosine" },
      });
    }
  });
}

interface TimedChunk {
  text: string;
  timestampStart: string;
  timestampEnd: string;
}

async function buildTimedChunks(
  segments: TranscriptSegment[],
  chunkSize: number,
  overlap: number
): Promise<TimedChunk[]> {
  if (!segments.length) return [];

  const timedParts: { text: string; start: number; end: number }[] = [];
  for (const seg of segments) {
    timedParts.push({
      text: seg.text,
      start: seg.start,
      end: seg.start + (seg.duration || 1),
    });
  }

  const fullText = timedParts.map((p) => p.text).join(" ");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: overlap,
  });

  const rawChunks = await splitter.splitText(fullText);
  const result: TimedChunk[] = [];
  let searchFrom = 0;

  for (const chunk of rawChunks) {
    const idx = fullText.indexOf(chunk.slice(0, Math.min(40, chunk.length)), searchFrom);
    const startChar = idx >= 0 ? idx : searchFrom;
    searchFrom = startChar + chunk.length;

    let charCount = 0;
    let startTime = timedParts[0]?.start ?? 0;
    let endTime = startTime;

    for (const part of timedParts) {
      const partStart = charCount;
      const partEnd = charCount + part.text.length + 1;

      if (partStart <= startChar && startChar < partEnd) {
        startTime = part.start;
      }
      if (partStart < startChar + chunk.length && partEnd >= startChar) {
        endTime = part.end;
      }
      charCount = partEnd;
    }

    result.push({
      text: chunk,
      timestampStart: formatTimestamp(startTime),
      timestampEnd: formatTimestamp(endTime),
    });
  }

  if (!result.length && fullText) {
    const last = timedParts[timedParts.length - 1];
    result.push({
      text: fullText.slice(0, chunkSize),
      timestampStart: formatTimestamp(timedParts[0]?.start ?? 0),
      timestampEnd: formatTimestamp(last?.end ?? 0),
    });
  }

  return result;
}

async function upsertPoints(points: {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}[]): Promise<void> {
  await withQdrantRetry("storage", async () => {
    const client = getQdrant();

    for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
      const batch = points.slice(i, i + UPSERT_BATCH_SIZE);
      await client.upsert(config.qdrantCollection, { wait: true, points: batch });
    }
  });
}

export async function indexVideoTranscript(
  sessionId: string,
  videoId: "A" | "B",
  source: "youtube" | "instagram",
  segments: TranscriptSegment[]
): Promise<number> {
  await ensureCollection();

  const timedChunks = await buildTimedChunks(segments, config.chunkSize, config.chunkOverlap);
  if (!timedChunks.length) {
    throw new AppError(422, `No chunks generated for video ${videoId}.`);
  }

  const texts = timedChunks.map((c) => c.text);
  const vectors = await embedDocuments(texts);

  const points = timedChunks.map((chunk, i) => {
    const chunkId = `${videoId}_${i + 1}`;
    const pointId = uuidv5(`${sessionId}:${chunkId}`, CHUNK_NAMESPACE);

    const payload: ChunkMetadata = {
      sessionId,
      videoId,
      chunkId,
      source,
      timestampStart: chunk.timestampStart,
      timestampEnd: chunk.timestampEnd,
      text: chunk.text,
    };

    return {
      id: pointId,
      vector: vectors[i],
      payload: payload as unknown as Record<string, unknown>,
    };
  });

  await upsertPoints(points);
  return points.length;
}

export async function searchChunks(
  sessionId: string,
  query: string,
  limit = 8
): Promise<ChunkMetadata[]> {
  await ensureCollection();
  const vector = await embedQuery(query);

  return withQdrantRetry("search", async () => {
    const client = getQdrant();
    const results = await client.search(config.qdrantCollection, {
      vector,
      limit,
      filter: {
        must: [{ key: "sessionId", match: { value: sessionId } }],
      },
      with_payload: true,
    });

    return results
      .map((r) => r.payload as unknown as ChunkMetadata)
      .filter((p) => p && p.chunkId);
  });
}

export async function deleteSessionChunks(sessionId: string): Promise<void> {
  try {
    await withQdrantRetry("delete", async () => {
      const client = getQdrant();
      await client.delete(config.qdrantCollection, {
        wait: true,
        filter: {
          must: [{ key: "sessionId", match: { value: sessionId } }],
        },
      });
    });
  } catch {
    // collection might not exist yet
  }
}
