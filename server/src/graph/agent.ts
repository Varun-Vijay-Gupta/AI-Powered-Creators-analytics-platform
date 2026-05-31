import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { searchChunks } from "../services/rag.js";
import { getVideoMetadataForPrompt, getChatHistory, saveChatMessage } from "../services/session.js";
import type { ChunkMetadata, SourceCitation } from "../types.js";

const GraphState = Annotation.Root({
  sessionId: Annotation<string>,
  question: Annotation<string>,
  chunks: Annotation<ChunkMetadata[]>,
  metadataContext: Annotation<string>,
  history: Annotation<{ role: string; content: string }[]>,
  answer: Annotation<string>,
  citedSources: Annotation<SourceCitation[]>,
  onToken: Annotation<((text: string) => void) | undefined>,
});

function getGenAI(): GoogleGenerativeAI {
  if (!config.geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it to server/.env and restart.");
  }
  return new GoogleGenerativeAI(config.geminiApiKey);
}

async function retrieveNode(state: typeof GraphState.State) {
  const chunks = await searchChunks(state.sessionId, state.question, 10);
  return { chunks };
}

async function loadContextNode(state: typeof GraphState.State) {
  const [metadataContext, history] = await Promise.all([
    getVideoMetadataForPrompt(state.sessionId),
    getChatHistory(state.sessionId),
  ]);

  return {
    metadataContext,
    history: history.map((m) => ({ role: m.role, content: m.content })),
  };
}

function buildPrompt(
  question: string,
  metadata: string,
  chunks: ChunkMetadata[],
  history: { role: string; content: string }[]
): string {
  const chunkBlock = chunks.length
    ? chunks
        .map(
          (c) =>
            `[Video ${c.videoId} | Chunk ${c.chunkId} | ${c.timestampStart} - ${c.timestampEnd}]\n${c.text}`
        )
        .join("\n\n")
    : "No transcript chunks retrieved.";

  const effectiveHistory =
    history.length &&
    history[history.length - 1].role === "user" &&
    history[history.length - 1].content === question
      ? history.slice(0, -1)
      : history;

  const historyBlock = effectiveHistory.length
    ? effectiveHistory.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : "No prior messages.";

  return `You are a video performance analyst helping creators compare two social media videos (Video A = YouTube, Video B = Instagram Reel).

Rules:
- Answer using ONLY the metadata and transcript excerpts below.
- If data is missing, say so plainly — do not invent stats or quotes.
- When comparing hooks, focus on the first ~5 seconds of transcript where available.
- For engagement questions, use the precomputed engagement rates from metadata.
- End every response with a "Sources:" section listing ONLY chunks you actually used.
- Source format (one per line):
  Video A | Chunk A_2 | 00:10 - 00:35
  Video B | Chunk B_1 | 00:00 - 00:20
- Do not cite chunks you did not use.

VIDEO METADATA:
${metadata}

TRANSCRIPT EXCERPTS:
${chunkBlock}

CONVERSATION HISTORY:
${historyBlock}

USER QUESTION:
${question}`;
}

function parseSourcesFromAnswer(answer: string, chunks: ChunkMetadata[]): SourceCitation[] {
  const sources: SourceCitation[] = [];
  const sourcesIdx = answer.lastIndexOf("Sources:");
  if (sourcesIdx === -1) return sources;

  const block = answer.slice(sourcesIdx);
  const chunkMap = new Map(chunks.map((c) => [c.chunkId, c]));

  const linePattern = /Video\s+([AB])\s*\|\s*Chunk\s+([AB]_\d+)\s*\|\s*([\d:]+)\s*-\s*([\d:]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(block)) !== null) {
    const normalizedId = match[2].toUpperCase();
    const chunk = chunkMap.get(normalizedId);

    if (chunk) {
      sources.push({
        videoId: chunk.videoId,
        chunkId: chunk.chunkId,
        timestampStart: chunk.timestampStart,
        timestampEnd: chunk.timestampEnd,
      });
    }
  }

  return sources;
}

async function generateNode(state: typeof GraphState.State) {
  const prompt = buildPrompt(state.question, state.metadataContext, state.chunks, state.history);

  try {
    const model = getGenAI().getGenerativeModel({ model: config.geminiModel });
    let answer = "";

    if (state.onToken) {
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          answer += text;
          state.onToken(text);
        }
      }
    } else {
      const result = await model.generateContent(prompt);
      answer = result.response.text();
    }

    const citedSources = parseSourcesFromAnswer(answer, state.chunks);
    await saveChatMessage(state.sessionId, "assistant", answer, citedSources);

    return { answer, citedSources };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini request failed";
    throw new Error(`Gemini failed: ${msg}`);
  }
}

const workflow = new StateGraph(GraphState)
  .addNode("loadContext", loadContextNode)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", END);

const compiledGraph = workflow.compile();

function baseInput(sessionId: string, question: string) {
  return {
    sessionId,
    question,
    chunks: [] as ChunkMetadata[],
    metadataContext: "",
    history: [] as { role: string; content: string }[],
    answer: "",
    citedSources: [] as SourceCitation[],
    onToken: undefined as ((text: string) => void) | undefined,
  };
}

export async function runAgent(sessionId: string, question: string) {
  await saveChatMessage(sessionId, "user", question);
  return compiledGraph.invoke(baseInput(sessionId, question));
}

export async function* streamAgentResponse(
  sessionId: string,
  question: string
): AsyncGenerator<{ type: "token"; data: string } | { type: "done"; sources: SourceCitation[] }> {
  await saveChatMessage(sessionId, "user", question);

  const tokenQueue: string[] = [];
  let graphDone = false;
  let citedSources: SourceCitation[] = [];
  let graphError: Error | null = null;

  const run = compiledGraph
    .invoke({
      ...baseInput(sessionId, question),
      onToken: (text: string) => tokenQueue.push(text),
    })
    .then((result) => {
      citedSources = result.citedSources;
      graphDone = true;
    })
    .catch((err: unknown) => {
      graphError = err instanceof Error ? err : new Error("Graph execution failed");
      graphDone = true;
    });

  while (!graphDone || tokenQueue.length > 0) {
    if (tokenQueue.length > 0) {
      const pending = tokenQueue.splice(0, tokenQueue.length);
      for (const text of pending) {
        yield { type: "token", data: text };
      }
    } else if (!graphDone) {
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  await run;
  if (graphError) throw graphError;

  yield { type: "done", sources: citedSources };
}

export { buildPrompt, parseSourcesFromAnswer };
