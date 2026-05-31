import { create } from "zustand";
import type { VideoData, ChatMessage } from "../types";

interface AppState {
  sessionId: string | null;
  videoA: VideoData | null;
  videoB: VideoData | null;
  messages: ChatMessage[];
  setAnalysis: (sessionId: string, videoA: VideoData, videoB: VideoData) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastAssistant: (content: string, sources?: ChatMessage["sources"]) => void;
  clearChat: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionId: null,
  videoA: null,
  videoB: null,
  messages: [],

  setAnalysis: (sessionId, videoA, videoB) =>
    set({ sessionId, videoA, videoB, messages: [] }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastAssistant: (content, sources) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = {
          ...last,
          content,
          sources,
          streaming: false,
        };
      }
      return { messages };
    }),

  clearChat: () => set({ messages: [] }),

  reset: () =>
    set({
      sessionId: null,
      videoA: null,
      videoB: null,
      messages: [],
    }),
}));
