import { EmbeddingModel, FlagEmbedding } from "fastembed";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

let model: FlagEmbedding | null = null;

const MODEL_MAP: Record<string, EmbeddingModel> = {
  "bge-small-en-v1.5": EmbeddingModel.BGESmallENV15,
  "bge-small-en": EmbeddingModel.BGESmallEN,
  "bge-base-en-v1.5": EmbeddingModel.BGEBaseENV15,
  "all-MiniLM-L6-v2": EmbeddingModel.AllMiniLML6V2,
};

export async function initEmbeddings(): Promise<void> {
  if (model) return;

  const selected =
    MODEL_MAP[config.embeddingModel] ?? EmbeddingModel.BGESmallENV15;

  try {
    console.log(`Loading local embeddings (${config.embeddingModel}, ${config.embeddingDimensions}d)...`);
    model = await FlagEmbedding.init({
      model: selected as Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>,
      cacheDir: config.embeddingCacheDir,
      showDownloadProgress: true,
    });
    console.log("Embeddings ready.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "init failed";
    throw new Error(`FastEmbed init failed: ${msg}`);
  }
}

function getModel(): FlagEmbedding {
  if (!model) {
    throw new AppError(500, "Embeddings not initialized. Restart the server.");
  }
  return model;
}

function toVector(values: number[] | Float32Array): number[] {
  return Array.from(values);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const embedder = getModel();
  const vectors: number[][] = [];

  try {
    for await (const batch of embedder.passageEmbed(texts, 32)) {
      for (const vec of batch) {
        vectors.push(toVector(vec));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "embedding failed";
    throw new AppError(502, `Local embedding failed: ${msg}`);
  }

  if (vectors.length !== texts.length) {
    throw new AppError(502, `Embedding count mismatch (${vectors.length} vs ${texts.length}).`);
  }

  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  try {
    return toVector(await getModel().queryEmbed(text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "embedding failed";
    throw new AppError(502, `Local embedding failed: ${msg}`);
  }
}
