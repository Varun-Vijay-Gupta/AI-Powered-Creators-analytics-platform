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

/** Whisper on Windows defaults to cp1252; emoji in lyrics crash before JSON is written. */
function whisperChildEnv(): NodeJS.ProcessEnv {
  return {
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };
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
    await runCommand("py", ["-c", "import whisper"], {
      timeoutMs: 15_000,
      env: whisperChildEnv(),
    });
    return { executable: "py", baseArgs: ["-m", "whisper"] };
  } catch {
    return null;
  }
}

function findWhisperJson(outDir: string, base: string): string | null {
  const expected = path.join(outDir, `${base}.json`);
  if (fs.existsSync(expected)) return expected;

  const candidates = fs
    .readdirSync(outDir)
    .filter((name) => name.endsWith(".json") && name.startsWith(base))
    .map((name) => path.join(outDir, name));

  return candidates[0] ?? null;
}

function whisperFailureDetail(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`.trim();
  if (/UnicodeEncodeError|charmap codec/i.test(combined)) {
    return "Whisper crashed on Windows console encoding (emoji in audio). Restart the server after updating.";
  }
  const tail = combined.split(/\r?\n/).slice(-6).join(" ").trim();
  return tail || "no stderr from Whisper";
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

  const { stdout, stderr } = await runCommand(
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
      "--device",
      "cpu",
      "--fp16",
      "False",
    ],
    { timeoutMs: 600_000, env: whisperChildEnv() }
  );

  const jsonPath = findWhisperJson(outDir, base);
  if (!jsonPath) {
    throw new AppError(
      502,
      `Local Whisper did not produce a JSON transcript. ${whisperFailureDetail(stderr, stdout)}`
    );
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
