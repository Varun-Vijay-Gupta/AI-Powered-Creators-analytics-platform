import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

let qdrantClient: QdrantClient | null = null;

export function getQdrant(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey,
      checkCompatibility: false,
      timeout: 120_000,
    });
  }

  return qdrantClient;
}

export function resetQdrantClient(): void {
  qdrantClient = null;
}

function formatQdrantError(
  err: unknown,
  operation: string
): AppError {
  const msg =
    err instanceof Error ? err.message : String(err);

  const cause =
    err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : err instanceof Error && err.cause
      ? String(err.cause)
      : "";

  const combined = `${msg} ${cause}`.toLowerCase();

  if (
    /fetch failed|econnrefused|enotfound|socket|network/i.test(
      combined
    )
  ) {
    return new AppError(
      502,
      `Qdrant ${operation} failed: cannot reach ${config.qdrantUrl}`
    );
  }

  if (combined.includes("forbidden")) {
    return new AppError(
      401,
      "Qdrant authentication failed. Check QDRANT_API_KEY."
    );
  }

  if (err && typeof err === "object" && "data" in err) {
    return new AppError(
      502,
      `Qdrant ${operation} failed: ${JSON.stringify(
        (err as { data: unknown }).data
      )}`
    );
  }

  return new AppError(
    502,
    `Qdrant ${operation} failed: ${msg}`
  );
}

export async function pingQdrant(): Promise<void> {
  await getQdrant().getCollections();
}

export async function withQdrantRetry<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await pingQdrant();
      return await fn();
    } catch (err) {
      lastError = err;

      resetQdrantClient();

      if (attempt < 3) {
        console.warn(
          `Qdrant ${operation} attempt ${attempt} failed, retrying...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 1500)
        );
      }
    }
  }

  throw formatQdrantError(lastError, operation);
}