import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { runCommand } from "../utils/ytdlp.js";
import type { TranscriptSegment } from "../types.js";

interface WhisperJson {
  text?: string;
  segments?: { start: number; end: number; text: string }[];
}

function discoverWhisperExe(): string | null {
  if (process.platform !== "win32") return null;

  const roots = [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python"),
    path.join(process.env.APPDATA ?? "", "Python"),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const candidate = path.join(root, entry, "Scripts", "whisper.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

async function resolveLocalWhisper(): Promise<{ executable: string; baseArgs: string[] } | null> {
  const fromEnv = config.whisperPath.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return { executable: fromEnv, baseArgs: [] };
  }

  const discovered = discoverWhisperExe();
  if (discovered) return { executable: discovered, baseArgs: [] };

  try {
    await runCommand("py", ["-c", "import whisper"], { timeoutMs: 15_000 });
    return { executable: "py", baseArgs: ["-m", "whisper"] };
  } catch {
    return null;
  }
}

export async function transcribeWithLocalWhisper(audioPath: string): Promise<TranscriptSegment[]> {
  const inv = await resolveLocalWhisper();
  if (!inv) {
    throw new AppError(
      502,
      "Local Whisper not installed. Run: pip install openai-whisper  (needs ffmpeg, already installed)"
    );
  }

  const outDir = path.dirname(audioPath);
  const base = path.basename(audioPath, path.extname(audioPath));

  await runCommand(
    inv.executable,
    [
      ...inv.baseArgs,
      audioPath,
      "--model",
      config.whisperLocalModel,
      "--output_format",
      "json",
      "--output_dir",
      outDir,
      "--fp16",
      "False",
    ],
    { timeoutMs: 600_000 }
  );

  const jsonPath = path.join(outDir, `${base}.json`);
  if (!fs.existsSync(jsonPath)) {
    throw new AppError(502, "Local Whisper did not produce a JSON transcript.");
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as WhisperJson;
  await fs.promises.unlink(jsonPath).catch(() => {});

  if (data.segments?.length) {
    return data.segments.map((seg) => ({
      text: seg.text.trim(),
      start: seg.start,
      duration: seg.end - seg.start,
    }));
  }

  if (data.text?.trim()) {
    return [{ text: data.text.trim(), start: 0, duration: 0 }];
  }

  throw new AppError(502, "Local Whisper returned an empty transcript.");
}
