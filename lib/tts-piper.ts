import path from "path";
import os from "os";
import fs from "fs";
import { execFileSync } from "child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const PYTHON = path.join(PROJECT_ROOT, "piper/venv/bin/python");
const MODEL = path.join(PROJECT_ROOT, "piper/models/id_ID-news_tts-medium.onnx");

export function synthesizeWithPiper(text: string): Buffer {
  const wavPath = path.join(os.tmpdir(), `piper-${Date.now()}.wav`);
  try {
    execFileSync(
      PYTHON,
      ["-m", "piper", "--model", MODEL, "--output_file", wavPath],
      {
        input: text,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15_000,
      },
    );
    return fs.readFileSync(wavPath);
  } finally {
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  }
}
