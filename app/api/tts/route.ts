import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { EdgeTTS } from "edge-tts-universal";
import { synthesizeWithPiper } from "@/lib/tts-piper";

const EDGE_VOICE = "id-ID-GadisNeural";
/** Edge memakai layanan tidak resmi; bila ditolak (mis. HTTP 403) pustakanya menunggu tanpa akhir */
const EDGE_TIMEOUT_MS = 6000;
/** Setelah Edge gagal, langsung pakai Piper selama jangka ini agar siswa tidak menunggu di setiap kalimat */
const EDGE_RETRY_AFTER_MS = 10 * 60 * 1000;
let edgeDownUntil = 0;

type WordTiming = { word: string; startMs: number; endMs: number };

/** Durasi audio WAV (PCM) dari header-nya, dalam milidetik */
function wavDurationMs(wav: Buffer): number {
  const byteRate = wav.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") return (Math.min(size, wav.length - offset - 8) / byteRate) * 1000;
    offset += 8 + size + (size % 2);
  }
  return ((wav.length - 44) / byteRate) * 1000;
}

/**
 * Perkiraan waktu tiap kata untuk audio Piper (Piper tidak memberi data waktu kata): durasi dibagi
 * menurut panjang kata, dengan jeda tambahan setelah tanda baca. Cukup untuk sorotan kata.
 */
function estimateWordTimings(text: string, durationMs: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lead = Math.min(150, durationMs * 0.03);
  const weight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1 + (/[.,;:!?]$/.test(w) ? 3 : 0);
  const total = words.reduce((n, w) => n + weight(w), 0) || 1;
  const usable = Math.max(0, durationMs - lead * 2);
  let t = lead;
  return words.map((w) => {
    const d = (weight(w) / total) * usable;
    const timing = { word: w.replace(/[.,;:!?"“”()]+$/g, ""), startMs: Math.round(t), endMs: Math.round(t + d) };
    t += d;
    return timing;
  });
}

function piperResponse(text: string, fallback = false) {
  const wav = synthesizeWithPiper(text);
  return NextResponse.json({
    audio: Buffer.from(wav).toString("base64"),
    mimeType: "audio/wav",
    words: estimateWordTimings(text, wavDurationMs(wav)),
    provider: fallback ? "piper-fallback" : "piper",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, provider } = (await req.json()) as {
    text?: string;
    provider?: "edge" | "piper";
  };

  if (!text?.trim()) {
    return NextResponse.json({ error: "text wajib diisi" }, { status: 400 });
  }

  try {
    if (provider === "piper" || Date.now() < edgeDownUntil) {
      return piperResponse(text.trim(), provider !== "piper");
    }

    // Default: Edge TTS, dengan batas waktu dan cadangan Piper
    try {
      const tts = new EdgeTTS(text.trim(), EDGE_VOICE);
      const result = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Edge TTS tidak merespons dalam ${EDGE_TIMEOUT_MS / 1000} dtk`)), EDGE_TIMEOUT_MS)),
      ]);
      const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
      if (audioBuffer.length === 0) throw new Error("Edge TTS mengembalikan audio kosong");

      type SubtitleEntry = { offset: number; duration: number; text: string };
      const words = ((result.subtitle as SubtitleEntry[]) ?? []).map((s) => ({
        word: s.text,
        startMs: s.offset / 10_000,
        endMs: (s.offset + s.duration) / 10_000,
      }));

      return NextResponse.json({
        audio: audioBuffer.toString("base64"),
        mimeType: "audio/mpeg",
        words,
        provider: "edge",
      });
    } catch (edgeErr) {
      edgeDownUntil = Date.now() + EDGE_RETRY_AFTER_MS;
      console.warn("[tts] Edge gagal, beralih ke Piper selama 10 menit:", edgeErr instanceof Error ? edgeErr.message : edgeErr);
      return piperResponse(text.trim(), true);
    }
  } catch (err) {
    console.error("[tts]", err);
    return NextResponse.json({ error: "Gagal generate suara" }, { status: 500 });
  }
}
