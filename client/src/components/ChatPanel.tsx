import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

const SUGGESTIONS = [
  "Why did Video A get more engagement than Video B?",
  "Compare the hooks in the first 5 seconds.",
  "What is the engagement rate of each video?",
  "Who created Video B and what is their follower count?",
  "Suggest improvements for Video B based on Video A.",
  "Compare storytelling styles.",
  "Compare CTA usage.",
  "Compare pacing and retention triggers.",
];

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled: boolean;
  loading: boolean;
  error: string | null;
}

export function ChatPanel({ messages, onSend, disabled, loading, error }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 flex flex-col min-h-[420px] max-h-[70vh]">
      <div className="border-b border-slate-700 px-4 py-3">
        <h2 className="font-semibold">Chat</h2>
        <p className="text-xs text-slate-400">Ask follow-ups — context carries across the session.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!messages.length && !disabled && (
          <div className="space-y-2">
            <p className="text-sm text-slate-400">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSend(q)}
                  disabled={loading}
                  className="text-left text-xs rounded border border-slate-600 px-2 py-1.5 hover:bg-slate-800 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {disabled && (
          <p className="text-sm text-slate-500">Analyze videos first to start chatting.</p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${msg.role === "user" ? "text-sky-300" : "text-slate-200"}`}
          >
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {msg.role === "user" ? "You" : "Assistant"}
              {msg.streaming && " · typing…"}
            </p>
            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 rounded bg-slate-950 border border-slate-800 p-2 text-xs text-slate-400">
                <p className="font-medium text-slate-300 mb-1">Sources</p>
                <ul className="space-y-1">
                  {msg.sources.map((s) => (
                    <li key={`${s.chunkId}-${s.timestampStart}`}>
                      Video {s.videoId} · Chunk {s.chunkId} · {s.timestampStart} – {s.timestampEnd}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {loading && !messages.some((m) => m.streaming) && (
          <p className="text-sm text-slate-500 animate-pulse">Thinking…</p>
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-slate-700 p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = inputRef.current?.value.trim();
          if (!text) return;
          onSend(text);
          if (inputRef.current) inputRef.current.value = "";
        }}
      >
        <textarea
          ref={inputRef}
          rows={2}
          disabled={disabled || loading}
          placeholder={disabled ? "Analyze videos to unlock chat" : "Ask about hooks, CTAs, pacing…"}
          className="flex-1 resize-none rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || loading}
          className="self-end rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
