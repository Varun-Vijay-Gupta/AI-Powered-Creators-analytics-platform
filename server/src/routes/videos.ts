import { Router } from "express";
import { z } from "zod";
import { fetchYoutubeVideo, fetchInstagramVideo } from "../services/videoFetcher.js";
import {
  createSession,
  saveVideo,
  getSessionVideos,
  resetSessionData,
  indexVideoTranscript,
} from "../services/session.js";
import { validateYoutubeUrl, validateInstagramUrl } from "../utils/urls.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/errors.js";
import type { VideoRecord } from "../types.js";

const router = Router();

const analyzeSchema = z.object({
  youtubeUrl: z.string().url(),
  instagramUrl: z.string().url(),
  sessionId: z.string().uuid().optional(),
});

router.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Request body must include valid youtubeUrl and instagramUrl.");
    }

    const { youtubeUrl, instagramUrl, sessionId: existingSession } = parsed.data;
    validateYoutubeUrl(youtubeUrl);
    validateInstagramUrl(instagramUrl);

    const sessionId = existingSession ?? (await createSession());
    if (existingSession) {
      await resetSessionData(sessionId);
    }

    const [youtubeResult, instagramResult] = await Promise.all([
      fetchYoutubeVideo(youtubeUrl),
      fetchInstagramVideo(instagramUrl),
    ]);

    const videoA: VideoRecord = { videoKey: "A", ...youtubeResult.record };
    const videoB: VideoRecord = { videoKey: "B", ...instagramResult.record };

    await saveVideo(sessionId, "A", videoA);
    await saveVideo(sessionId, "B", videoB);

    await indexVideoTranscript(sessionId, "A", "youtube", youtubeResult.segments);
    await indexVideoTranscript(sessionId, "B", "instagram", instagramResult.segments);

    const videos = await getSessionVideos(sessionId);
    const videoAResp = videos.find((v) => v.videoKey === "A");
    const videoBResp = videos.find((v) => v.videoKey === "B");

    if (!videoAResp || !videoBResp) {
      throw new AppError(500, "Failed to persist analyzed videos.");
    }

    res.json({
      sessionId,
      videoA: videoAResp,
      videoB: videoBResp,
    });
  })
);

export default router;
