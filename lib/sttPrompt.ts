import { prisma } from "@/lib/db";

// Prompt awal Whisper per soal: nama diri & istilah dari LESSON soal tersebut, agar ejaan nama yang sulit
// (Xiangshan, Tjokroaminoto, Pearl Harbour) dikenali. Jawaban soal tidak diberi perlakuan khusus — ia
// hanya salah satu dari puluhan istilah lesson — agar Whisper tidak terdorong menulis kunci jawaban.

/**
 * Prompt berupa DAFTAR istilah (≤700 huruf ≈ batas ±224 token whisper.cpp). Uji ablasi: prompt berbentuk
 * kalimat ("Jawaban siswa dalam pelajaran …") menurunkan akurasi pada audio bising (−4 s.d. −6 dari 83),
 * karena Whisper cenderung "melengkapi" dengan kalimat karangan.
 */
const MAX_CHARS = 700;

const STOP = new Set(
  ("Pada Dalam Selain Setelah Sebelum Namun Meskipun Karena Oleh Untuk Dengan Bagi Sejak Hingga Sementara Akibatnya " +
    "Kemudian Selanjutnya Hal Para Sebagai Salah Satu Kata Ia Dia Mereka Kita Kamu Tokoh Organisasi Gerakan Lesson " +
    "Viva Historia Kutipan Ketika Saat Tahun Awalnya Akhirnya Selama Melalui Menurut Tidak Ini Itu Tersebut Berbagai")
    .split(" ")
);

/** Nama diri (rangkaian kata berhuruf kapital, boleh disambung al-/bin/van/de/da) dari teks, urut frekuensi */
export function properNouns(text: string): string[] {
  const re = /\b([A-Z][\p{L}'’-]+(?:\s+(?:al-|al|bin|binti|van|de|da|der|von)?\s*[A-Z][\p{L}'’-]+){0,3})/gu;
  const count = new Map<string, number>();
  for (const m of text.matchAll(re)) {
    const words = m[1].split(/\s+/);
    while (words.length && STOP.has(words[0])) words.shift();
    const name = words.join(" ");
    if (name.length < 3 || STOP.has(name)) continue;
    count.set(name, (count.get(name) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([n]) => n);
}

export async function buildSttPrompt(questionId: string | null | undefined): Promise<string | undefined> {
  if (!questionId) return undefined;
  const lq = await prisma.lessonQuestion.findUnique({
    where: { id: questionId },
    select: { lesson: { select: { title: true, content: true, keyTerms: true } } },
  });
  let lessons: { title: string; content: string; keyTerms: unknown }[] = [];
  if (lq) lessons = [lq.lesson];
  else {
    const q = await prisma.question.findUnique({ where: { id: questionId }, select: { materialId: true } });
    if (!q) return undefined;
    const plan = await prisma.lessonPlan.findFirst({
      where: { materialId: q.materialId },
      orderBy: { createdAt: "desc" },
      select: { lessons: { select: { title: true, content: true, keyTerms: true } } },
    });
    lessons = plan?.lessons ?? [];
  }
  if (lessons.length === 0) return undefined;

  const terms = lessons.flatMap((l) =>
    Array.isArray(l.keyTerms) ? (l.keyTerms as { term?: string }[]).map((t) => String(t.term ?? "").trim()) : []
  );
  const names = properNouns(lessons.map((l) => `${l.title}. ${l.content}`).join("\n"));
  const seen = new Set<string>();
  const parts: string[] = [];
  let len = "Sejarah Indonesia. ".length;
  for (const p of [...terms, ...names]) {
    const k = p.toLowerCase();
    if (!p || seen.has(k)) continue;
    if (len + p.length + 2 > MAX_CHARS) break;
    seen.add(k);
    parts.push(p);
    len += p.length + 2;
  }
  return `Sejarah Indonesia. ${parts.join(", ")}.`;
}
