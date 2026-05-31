import type { AnalyzeResponse, SourceCitation } from "../types";

const API_BASE = "/api";

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 502 || res.status === 504) {
      throw new Error(
        "Backend unreachable or timed out. Start the server with `cd server && npm run dev`."
      );
    }
    throw new Error(
      res.ok
        ? "Server returned an empty response."
        : `Request failed (${res.status}). Is the backend running on port 3001?`
    );
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.ok ? "Server returned invalid JSON." : `Server error (${res.status}): ${text.slice(0, 200)}`
    );
  }
}

export async function analyzeVideos(
  youtubeUrl: string,
  instagramUrl: string,
  sessionId?: string
): Promise<AnalyzeResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/videos/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl, instagramUrl, sessionId }),
    });
  } catch {
    throw new Error(
      "Could not reach the API. Run the backend: cd server && npm run dev"
    );
  }

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error((data.error as string) ?? "Failed to analyze videos");
  }
  return data as unknown as AnalyzeResponse;
}

export async function streamChat(
  sessionId: string,
  message: string,
  onToken: (text: string) => void,
  onDone: (sources: SourceCitation[]) => void,
  onError: (error: string) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
  } catch {
    throw new Error("Could not reach the API. Is the backend running?");
  }

  if (!res.ok) {
    const data = await parseJsonResponse(res).catch(() => ({}));
    throw new Error((data.error as string) ?? "Chat request failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;

      const lines = part.split("\n");
      let event = "message";
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }

      if (!dataLine) continue;

      try {
        const payload = JSON.parse(dataLine);
        if (event === "token") onToken(payload.text);
        if (event === "done") onDone(payload.sources ?? []);
        if (event === "error") onError(payload.error);
      } catch {
        // skip malformed events
      }
    }
  }
}
