import { Router } from "express";
import { z } from "zod";
import { streamAgentResponse } from "../graph/agent.js";
import { getSessionVideos } from "../services/session.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/errors.js";

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Request must include sessionId and a non-empty message.");
    }

    const { message, sessionId } = parsed.data;
    const videos = await getSessionVideos(sessionId);

    if (videos.length < 2) {
      throw new AppError(400, "Analyze two videos before chatting.");
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const chunk of streamAgentResponse(sessionId, message)) {
        if (chunk.type === "token") {
          send("token", { text: chunk.data });
        } else {
          send("done", { sources: chunk.sources });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat stream failed";
      send("error", { error: msg });
    }

    res.end();
  })
);

export default router;
