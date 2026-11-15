import fs from "fs";
import path from "path";
import os from "os";
import { execSync, execFileSync } from "child_process";

// Resolve relative to project root (works in both CJS __dirname and ESM import.meta)
const PROJECT_ROOT = path.resolve(process.cwd());
const WHISPER_DIR = path.join(
  PROJECT_ROOT,
  "node_modules/nodejs-whisper/cpp/whisper.cpp",
);
const WHISPER_BIN = path.join(WHISPER_DIR, "build/bin/whisper-cli");
const MODEL = path.join(WHISPER_DIR, "models/ggml-small.bin");
// Deteksi suara (VAD): bagian tanpa ucapan dilewati agar Whisper tidak "mengarang" teks dari bising
const VAD_MODEL = path.join(WHISPER_DIR, "models/ggml-silero-v5.1.2.bin");

// Prompt awal bawaan (bila soal tidak diketahui). Prompt per soal dibuat dari lesson-nya — lihat lib/sttPrompt.ts.
// Batas whisper.cpp ±224 token.
const DEFAULT_PROMPT =
  "Sejarah Indonesia. Nusantara, Hindia Belanda, Belanda, Jepang, Tiongkok, India, Filipina, Makkah, " +
  "nasionalisme, kolonialisme, imperialisme, pergerakan nasional, Budi Utomo, Sarekat Islam, Indische Partij, " +
  "Sumpah Pemuda, Kongres Pemuda, Kongres Perempuan, Perang Dunia I, Perang Dunia II, Volksraad, Politik Etis.";

export async function transcribeIndonesian(
  buffer: Buffer,
  mime: string,
  prompt: string = DEFAULT_PROMPT,
  /**
   * noFallback/suppressNst/vad: pengaturan tambahan whisper.cpp untuk uji pembanding/ablasi (bawaan: mati).
   * `tuned` dipertahankan agar pemanggil lama tetap berjalan.
   */
  options: { tuned?: boolean; noFallback?: boolean; suppressNst?: boolean; vad?: boolean } = {},
): Promise<string> {
  // Uji ablasi (83 jawaban × 4 kondisi bising): --no-fallback/--suppress-nst tidak berpengaruh dan VAD sedikit
  // menurunkan akurasi pada jawaban pendek, sehingga ketiganya MATI secara bawaan (bisa dinyalakan untuk uji).
  void options.tuned;
  const noFallback = options.noFallback ?? false;
  const suppressNst = options.suppressNst ?? false;
  const vad = options.vad ?? false;
  const ext = mime.includes("webm")
    ? "webm"
    : mime.includes("mp4")
      ? "mp4"
      : mime.includes("mpeg") || mime.includes("mp3")
        ? "mp3"
        : mime.includes("ogg")
          ? "ogg"
          : "wav";
  const base = path.join(os.tmpdir(), `stt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  // nama input berbeda dari hasil konversi: ffmpeg tidak bisa menimpa file sumbernya sendiri (kasus audio WAV)
  const inputPath = `${base}-in.${ext}`;
  const wavPath = `${base}.wav`;

  fs.writeFileSync(inputPath, buffer);

  try {
    // Convert to 16kHz mono PCM — required by whisper.cpp
    execSync(
      `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
      { stdio: "pipe" },
    );

    const run = (useVad: boolean) =>
      (execFileSync(
        WHISPER_BIN,
        [
          "-m", MODEL,
          "-l", "id",
          // prompt kosong = Whisper tanpa prompt awal
          ...(prompt ? ["--prompt", prompt] : []),
          // --no-fallback: saat ragu tidak menebak makin bebas (sumber halusinasi);
          // --suppress-nst: tekan token non-ucapan ([musik], tawa, dsb.)
          ...(noFallback ? ["--no-fallback"] : []),
          ...(suppressNst ? ["--suppress-nst"] : []),
          ...(useVad ? ["--vad", "-vm", VAD_MODEL] : []),
          "-f", wavPath,
        ],
        { cwd: WHISPER_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ) as string)
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const hasVad = vad && fs.existsSync(VAD_MODEL);
    const text = run(hasVad);
    // VAD bisa memotong habis jawaban yang sangat pendek → ulangi tanpa VAD
    return text || !hasVad ? text : run(false);
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  }
}
