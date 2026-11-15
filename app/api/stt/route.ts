import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transcribeIndonesian } from "@/lib/stt";
import { buildSttPrompt } from "@/lib/sttPrompt";

// Tambahkan path umum ffmpeg agar nodejs-whisper (shelljs) bisa menemukannya
// di macOS (Homebrew) maupun Linux server (/usr/bin, /usr/local/bin)
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:${process.env.PATH ?? ""}`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) {
    return NextResponse.json({ error: "audio field wajib diisi" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "audio/webm";

  try {
    // prompt awal dari lesson soal yang sedang dijawab (nama diri & istilah), bila dikirim
    const questionId = formData.get("questionId");
    const prompt = await buildSttPrompt(typeof questionId === "string" ? questionId : null);
    const text = await transcribeIndonesian(buffer, mime, prompt);
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stt error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
