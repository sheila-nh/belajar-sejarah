import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { leaksAnswer } from "@/lib/rag";
import { prepareFeedback, readStored, writeStored } from "@/lib/quizFeedback";

// Umpan balik tersimpan satu soal (LessonQuestion atau Question) — khusus guru/admin.

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  return user?.role === "ADMIN";
}

/** Baca umpan balik tersimpan; { feedback: null } = belum disiapkan */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ feedback: await readStored(id) });
}

/** Siapkan sekarang (atau buat ulang dengan { force: true }) lalu kembalikan hasil tersimpan */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  await prepareFeedback(id, { force: Boolean(force) });
  const feedback = await readStored(id);
  if (!feedback) {
    return NextResponse.json(
      { feedback: null, error: "Umpan balik belum berhasil dibuat (Qwen gagal). Coba lagi." },
      { status: 502 }
    );
  }
  return NextResponse.json({ feedback });
}

/** Simpan suntingan guru: { hints: [3 string], explanation, quote } → { feedback, warnings } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { hints?: unknown; explanation?: unknown; quote?: unknown };

  const hints = Array.isArray(body.hints) ? body.hints.map((h) => String(h ?? "").trim()) : [];
  if (hints.length !== 3 || hints.some((h) => !h)) {
    return NextResponse.json({ error: "Ketiga petunjuk wajib diisi." }, { status: 400 });
  }
  // awalan "Tepat!" / "Perlu diketahui:" ditambahkan otomatis saat kuis — buang bila ikut diketik
  const explanation = String(body.explanation ?? "")
    .trim()
    .replace(/^(tepat|benar|betul|salah|kurang tepat)\s*[!.,:]\s*|^perlu diketahui\s*:\s*/i, "")
    .trim();
  if (!explanation) return NextResponse.json({ error: "Penjelasan wajib diisi." }, { status: 400 });
  const quote = String(body.quote ?? "").trim() || null;

  const select = { type: true, answer: true } as const;
  const q =
    (await prisma.lessonQuestion.findUnique({ where: { id }, select })) ??
    (await prisma.question.findUnique({ where: { id }, select }));
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  const feedback = { hints, explanation, quote };
  await writeStored(id, feedback);

  // Peringatan (tetap disimpan — guru yang memutuskan)
  const warnings: string[] = [];
  if (q.type === "ISIAN_SINGKAT") {
    hints.forEach((h, i) => {
      if (leaksAnswer(h, q.answer)) warnings.push(`Petunjuk ${i + 1} memuat jawaban "${q.answer}". Ganti bagian itu dengan _____ bila tidak disengaja.`);
    });
  } else if (hints.slice(0, 2).some((h) => /\b(pernyataan|kalimat)\s+(ini|tersebut)\s+(adalah\s+)?(benar|salah)\b/i.test(h))) {
    warnings.push("Petunjuk 1–2 tampaknya langsung menyebut benar/salahnya pernyataan.");
  }
  return NextResponse.json({ feedback, warnings });
}
