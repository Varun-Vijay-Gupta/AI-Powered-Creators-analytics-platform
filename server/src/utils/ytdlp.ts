import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { AppError } from "./errors.js";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface YtDlpInvocation {
  executable: string;
  baseArgs: string[];
}

let cachedYtDlp: YtDlpInvocation | null = null;
let cachedFfmpegDir: string | null | undefined;

const INSTALL_HINT =
  "Install yt-dlp: pip install yt-dlp  OR  winget install yt-dlp  OR set YT_DLP_PATH in server/.env";

const FFMPEG_HINT =
  "ffmpeg is required for audio extraction. Install: winget install Gyan.FFmpeg  OR set FFMPEG_PATH in server/.env to the folder containing ffmpeg.exe";

function childEnv(extraPathDir?: string): NodeJS.ProcessEnv {
  if (!extraPathDir) return { ...process.env };
  const sep = process.platform === "win32" ? ";" : ":";
  return { ...process.env, PATH: `${extraPathDir}${sep}${process.env.PATH ?? ""}` };
}

function discoverFfmpegDir(): string | null {
  const fromEnv = config.ffmpegPath.trim();
  if (fromEnv) {
    if (fromEnv.toLowerCase().endsWith(".exe") && fs.existsSync(fromEnv)) {
      return path.dirname(fromEnv);
    }
    if (fs.existsSync(path.join(fromEnv, "ffmpeg.exe")) || fs.existsSync(path.join(fromEnv, "ffmpeg"))) {
      return fromEnv;
    }
  }

  if (process.platform !== "win32") return null;

  const wingetRoot = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(wingetRoot)) {
    for (const pkg of fs.readdirSync(wingetRoot)) {
      if (!pkg.toLowerCase().includes("ffmpeg")) continue;
      const pkgDir = path.join(wingetRoot, pkg);
      for (const entry of fs.readdirSync(pkgDir)) {
        const binDir = path.join(pkgDir, entry, "bin");
        if (fs.existsSync(path.join(binDir, "ffmpeg.exe"))) return binDir;
      }
    }
  }

  const scoop = path.join(process.env.USERPROFILE ?? "", "scoop", "shims");
  if (fs.existsSync(path.join(scoop, "ffmpeg.exe"))) return scoop;

  return null;
}

export function resolveFfmpegDir(): string | null {
  if (cachedFfmpegDir !== undefined) return cachedFfmpegDir;
  cachedFfmpegDir = discoverFfmpegDir();
  if (cachedFfmpegDir) {
    console.log(`Using ffmpeg: ${cachedFfmpegDir}`);
  }
  return cachedFfmpegDir;
}

function withFfmpegArgs(args: string[]): string[] {
  const dir = resolveFfmpegDir();
  if (!dir) return args;
  return ["--ffmpeg-location", dir, ...args];
}

function discoverYtDlpExe(): string | null {
  if (process.platform !== "win32") return null;

  const roots = [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python"),
    path.join(process.env.APPDATA ?? "", "Python"),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const candidate = path.join(root, entry, "Scripts", "yt-dlp.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function classifyCommandError(cmd: string, detail: string): AppError {
  const lower = detail.toLowerCase();

  if (/ffmpeg|ffprobe/.test(lower) && /not found|not recognized|enoent/.test(lower)) {
    return new AppError(500, `${FFMPEG_HINT}\n\nyt-dlp said: ${detail.trim().slice(0, 300)}`);
  }

  const isBareName = !path.isAbsolute(cmd) && !cmd.includes(path.sep);
  if (isBareName && /not recognized|enoent|'yt-dlp'|\"yt-dlp\"/.test(lower)) {
    return new AppError(500, `yt-dlp not found on PATH. ${INSTALL_HINT}`);
  }

  return new AppError(502, `${path.basename(cmd)} failed: ${detail.trim().slice(0, 500)}`);
}

export async function runCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; pathDir?: string }
): Promise<{ stdout: string; stderr: string }> {
  const env = childEnv(opts?.pathDir ?? resolveFfmpegDir() ?? undefined);

  const run = (): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      const useExecFile = path.isAbsolute(cmd) || cmd.includes(path.sep);

      if (useExecFile) {
        execFileAsync(cmd, args, {
          cwd: opts?.cwd,
          env,
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        })
          .then(({ stdout, stderr }) => resolve({ stdout: String(stdout), stderr: String(stderr) }))
          .catch((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string }) => {
            const detail = String(err.stderr || err.stdout || err.message || "");
            if (err.code === "ENOENT") {
              reject(new AppError(500, `Cannot run ${cmd}. ${INSTALL_HINT}`));
              return;
            }
            reject(classifyCommandError(cmd, detail || `exit ${err.code}`));
          });
        return;
      }

      const proc = spawn(cmd, args, { shell: true, cwd: opts?.cwd, env, windowsHide: true });
      let stdout = "";
      let stderr = "";

      const timer = opts?.timeoutMs
        ? setTimeout(() => {
            proc.kill();
            reject(new AppError(504, `Command timed out: ${cmd} ${args.join(" ")}`));
          }, opts.timeoutMs)
        : null;

      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      proc.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(new AppError(500, `Failed to run ${cmd}: ${err.message}. ${INSTALL_HINT}`));
      });

      proc.on("close", (code) => {
        if (timer) clearTimeout(timer);
        if (code !== 0) {
          reject(classifyCommandError(cmd, stderr || stdout));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

  if (opts?.timeoutMs) {
    return Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AppError(504, `Command timed out: ${cmd} ${args.join(" ")}`)),
          opts.timeoutMs
        )
      ),
    ]);
  }

  return run();
}

async function probeYtDlp(inv: YtDlpInvocation): Promise<boolean> {
  try {
    await runCommand(inv.executable, [...inv.baseArgs, "--version"], { timeoutMs: 20_000 });
    return true;
  } catch {
    return false;
  }
}

export async function resolveYtDlp(): Promise<YtDlpInvocation> {
  if (cachedYtDlp) return cachedYtDlp;

  const fromEnv = config.ytDlpPath.trim();
  const discoveredExe = discoverYtDlpExe();

  const candidates: YtDlpInvocation[] = [];

  if (fromEnv) candidates.push({ executable: fromEnv, baseArgs: [] });
  if (discoveredExe && discoveredExe !== fromEnv) {
    candidates.push({ executable: discoveredExe, baseArgs: [] });
    const pythonExe = path.join(path.dirname(path.dirname(discoveredExe)), "python.exe");
    if (fs.existsSync(pythonExe)) {
      candidates.push({ executable: pythonExe, baseArgs: ["-m", "yt_dlp"] });
    }
  }

  candidates.push(
    { executable: "yt-dlp", baseArgs: [] },
    { executable: "py", baseArgs: ["-m", "yt_dlp"] },
    { executable: "python", baseArgs: ["-m", "yt_dlp"] }
  );

  for (const candidate of candidates) {
    if (await probeYtDlp(candidate)) {
      cachedYtDlp = candidate;
      console.log(`Using yt-dlp: ${candidate.executable} ${candidate.baseArgs.join(" ")}`.trim());
      return candidate;
    }
  }

  if (fromEnv) {
    throw new AppError(500, `YT_DLP_PATH is set but not runnable: ${fromEnv}`);
  }

  throw new AppError(500, `yt-dlp is not installed. ${INSTALL_HINT}`);
}

export async function runYtDlp(args: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string }> {
  const inv = await resolveYtDlp();
  return runCommand(inv.executable, [...inv.baseArgs, ...withFfmpegArgs(args)], { timeoutMs });
}

export async function ensureTmpDir(): Promise<string> {
  const dir = path.resolve(config.tmpDir);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export interface YtDlpMetadata {
  title?: string;
  uploader?: string;
  channel?: string;
  uploader_id?: string;
  channel_id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  upload_date?: string;
  duration?: number;
  description?: string;
  tags?: string[];
  channel_follower_count?: number;
  follower_count?: number;
  webpage_url?: string;
}

export async function fetchYtDlpMetadata(
  url: string,
  extraArgs: string[] = []
): Promise<YtDlpMetadata> {
  const { stdout } = await runYtDlp(["--dump-single-json", "--no-playlist", ...extraArgs, url], 120_000);

  try {
    return JSON.parse(stdout) as YtDlpMetadata;
  } catch {
    throw new AppError(502, "yt-dlp returned invalid JSON for video metadata.");
  }
}

export async function downloadAudio(url: string, outputPath: string): Promise<string> {
  await ensureTmpDir();
  const outTemplate = outputPath.replace(/\.[^.]+$/, "");
  await runYtDlp(
    [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "5",
      "-o",
      `${outTemplate}.%(ext)s`,
      "--no-playlist",
      url,
    ],
    300_000
  );

  if (fs.existsSync(`${outTemplate}.mp3`)) return `${outTemplate}.mp3`;
  if (fs.existsSync(outputPath)) return outputPath;

  const files = fs.readdirSync(path.dirname(outputPath));
  const audio = files.find((f) => f.startsWith(path.basename(outTemplate)));
  if (audio) return path.join(path.dirname(outputPath), audio);

  throw new AppError(502, "yt-dlp did not produce an audio file for transcription.");
}

export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore missing files
  }
}

export async function compressAudioForWhisper(inputPath: string, outputPath: string): Promise<string> {
  const ffmpegDir = resolveFfmpegDir();
  if (!ffmpegDir || !fs.existsSync(inputPath)) {
    return inputPath;
  }

  const ffmpeg = path.join(ffmpegDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

  try {
    await runCommand(
      ffmpeg,
      ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-b:a", "48k", outputPath],
      { timeoutMs: 120_000, pathDir: ffmpegDir }
    );
    if (fs.existsSync(outputPath)) return outputPath;
  } catch (err) {
    console.warn("Audio compression failed, uploading original file:", err instanceof Error ? err.message : err);
  }

  return inputPath;
}
