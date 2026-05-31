import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { analyzeVideos, streamChat } from "./api/client";
import { useAppStore } from "./store/appStore";
import { UrlForm } from "./components/UrlForm";
import { VideoCard } from "./components/VideoCard";
import { ChatPanel } from "./components/ChatPanel";

function uid() {
  return crypto.randomUUID();
}

export default function App() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const sessionId = useAppStore((s) => s.sessionId);
  const videoA = useAppStore((s) => s.videoA);
  const videoB = useAppStore((s) => s.videoB);
  const messages = useAppStore((s) => s.messages);
  const setAnalysis = useAppStore((s) => s.setAnalysis);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeVideos(youtubeUrl, instagramUrl, sessionId ?? undefined),
    onMutate: () => setAnalyzeError(null),
    onSuccess: (data) => {
      setAnalysis(data.sessionId, data.videoA, data.videoB);
    },
    onError: (err: Error) => setAnalyzeError(err.message),
  });

  const handleSend = useCallback(
    async (text: string) => {
      if (!sessionId || chatLoading) return;

      setChatError(null);
      setChatLoading(true);

      const userMsg = { id: uid(), role: "user" as const, content: text };
      const assistantMsg = {
        id: uid(),
        role: "assistant" as const,
        content: "",
        streaming: true,
      };

      addMessage(userMsg);
      addMessage(assistantMsg);

      let accumulated = "";

      try {
        await streamChat(
          sessionId,
          text,
          (token) => {
            accumulated += token;
            updateLastAssistant(accumulated);
          },
          (sources) => {
            updateLastAssistant(accumulated, sources);
          },
          (error) => setChatError(error)
        );
      } catch (err) {
        setChatError(err instanceof Error ? err.message : "Chat failed");
        updateLastAssistant(accumulated || "Sorry, something went wrong.");
      } finally {
        setChatLoading(false);
      }
    },
    [sessionId, chatLoading, addMessage, updateLastAssistant]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <UrlForm
        youtubeUrl={youtubeUrl}
        instagramUrl={instagramUrl}
        onYoutubeChange={setYoutubeUrl}
        onInstagramChange={setInstagramUrl}
        onSubmit={() => analyzeMutation.mutate()}
        loading={analyzeMutation.isPending}
        error={analyzeError}
      />

      <div className="grid md:grid-cols-2 gap-4">
        <VideoCard
          label="Video A"
          platform="YouTube"
          title={videoA?.title ?? ""}
          creatorName={videoA?.creatorName ?? ""}
          followerCount={videoA?.followerCount ?? null}
          views={videoA?.views ?? 0}
          likes={videoA?.likes ?? 0}
          comments={videoA?.comments ?? 0}
          engagementRate={videoA?.engagementRate ?? 0}
          uploadDate={videoA?.uploadDate ?? null}
          durationSeconds={videoA?.durationSeconds ?? 0}
          hashtags={videoA?.hashtags ?? []}
          loading={analyzeMutation.isPending}
        />
        <VideoCard
          label="Video B"
          platform="Instagram"
          title={videoB?.title ?? ""}
          creatorName={videoB?.creatorName ?? ""}
          followerCount={videoB?.followerCount ?? null}
          views={videoB?.views ?? 0}
          likes={videoB?.likes ?? 0}
          comments={videoB?.comments ?? 0}
          engagementRate={videoB?.engagementRate ?? 0}
          uploadDate={videoB?.uploadDate ?? null}
          durationSeconds={videoB?.durationSeconds ?? 0}
          hashtags={videoB?.hashtags ?? []}
          loading={analyzeMutation.isPending}
        />
      </div>

      <ChatPanel
        messages={messages}
        onSend={handleSend}
        disabled={!sessionId || analyzeMutation.isPending}
        loading={chatLoading}
        error={chatError}
      />
    </div>
  );
}
