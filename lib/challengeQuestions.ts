import { generateLessonQuestions, type GeneratedQ } from "@/lib/generateLessonQuestions";
import type { KeyTerm } from "@/lib/generateLessonPlan";

/**
 * Soal challenge per materi: 3 B/S (campuran Benar/Salah) + 7 Isian, diambil bergiliran dari
 * semua lesson. Kekurangan (soal gugur validasi) ditambal dari lesson lain.
 */
export const BS_TARGET = 3;
export const IS_TARGET = 7;
/** Soal Isian cadangan per lesson: sebagian soal sering gugur validasi (ambigu, duplikat, uji jawab balik). */
const IS_BUFFER = 1;

type Tagged = GeneratedQ & { lessonIdx: number };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ambil n soal acak, bergiliran antar-lesson agar seluruh materi terwakili. */
function pickSpread(pool: Tagged[], n: number): Tagged[] {
  const byLesson = new Map<number, Tagged[]>();
  for (const q of shuffle(pool)) {
    if (!byLesson.has(q.lessonIdx)) byLesson.set(q.lessonIdx, []);
    byLesson.get(q.lessonIdx)!.push(q);
  }
  const queues = shuffle([...byLesson.values()]);
  const out: Tagged[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (out.length >= n) break;
      const item = q.shift();
      if (item) out.push(item);
    }
  }
  return out;
}

/** 3 soal B/S: campuran berkunci "Benar" dan "Salah" (1–2 Salah) bila tersedia. */
function pickBs(pool: Tagged[]): Tagged[] {
  const benar = pool.filter((q) => q.answer === "Benar");
  const salah = pool.filter((q) => q.answer === "Salah");
  let wantSalah = Math.random() < 0.5 ? 1 : 2;
  wantSalah = Math.min(wantSalah, salah.length, BS_TARGET);
  const picked = [...pickSpread(salah, wantSalah), ...pickSpread(benar, BS_TARGET - wantSalah)];
  if (picked.length < BS_TARGET) {
    // kekurangan salah satu jenis diisi jenis lainnya
    const rest = pool.filter((q) => !picked.includes(q));
    picked.push(...pickSpread(rest, BS_TARGET - picked.length));
  }
  return shuffle(picked);
}

type LessonRow = { title: string; summary: string; keyPoints: unknown; content: string; keyTerms: unknown };

export async function buildChallengeSet(
  materialTitle: string,
  lessons: LessonRow[]
): Promise<{ selected: GeneratedQ[]; errors: string[]; poolSize: number }> {
  const n = lessons.length;
  // Kuota per lesson (+ cadangan Isian). B/S dibagi bergiliran "Benar"/"Salah" antar-lesson agar
  // kumpulan soal memuat keduanya (sebelumnya 1 B/S per lesson selalu berkunci "Benar").
  const bsPerLesson = Math.max(1, Math.ceil(BS_TARGET / n));
  const isPerLesson = Math.max(2, Math.ceil(IS_TARGET / n)) + IS_BUFFER;

  const pool: Tagged[] = [];
  const errors: string[] = [];
  const toInput = (lesson: LessonRow) => ({
    title: lesson.title,
    summary: lesson.summary,
    keyPoints: lesson.keyPoints as string[],
    content: lesson.content,
    keyTerms: lesson.keyTerms as KeyTerm[],
  });

  for (const [i, lesson] of lessons.entries()) {
    const salah = Math.floor(bsPerLesson / 2) + (bsPerLesson % 2 === 1 && i % 2 === 1 ? 1 : 0);
    const need = { benar: bsPerLesson - salah, salah, isian: isPerLesson };
    try {
      // `existing` = soal lesson lain, agar fakta/jawaban yang sama tidak muncul dua kali di challenge
      const generated = await generateLessonQuestions(toInput(lesson), bsPerLesson, isPerLesson, { existing: pool, need });
      pool.push(...generated.map((q) => ({ ...q, lessonIdx: i })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[questions/generate] lesson "${lesson.title}":`, msg);
      errors.push(lesson.title);
    }
  }

  // Tambal kekurangan dari lesson lain (bergiliran, mulai dari lesson dengan soal paling sedikit)
  const count = (t: GeneratedQ["type"]) => pool.filter((q) => q.type === t).length;
  const order = lessons
    .map((_, i) => i)
    .sort((x, y) => pool.filter((q) => q.lessonIdx === x).length - pool.filter((q) => q.lessonIdx === y).length);
  for (const i of order) {
    const missIs = Math.max(0, IS_TARGET - count("ISIAN_SINGKAT"));
    const missBs = Math.max(0, BS_TARGET - count("BENAR_SALAH"));
    if (missIs + missBs === 0) break;
    console.log(`[questions/generate] kurang ${missIs} Isian + ${missBs} B/S — tambahan dari lesson "${lessons[i].title}"`);
    try {
      const extra = await generateLessonQuestions(toInput(lessons[i]), missBs, missIs, {
        existing: pool,
        need: { benar: Math.ceil(missBs / 2), salah: Math.floor(missBs / 2), isian: missIs },
      });
      pool.push(...extra.map((q) => ({ ...q, lessonIdx: i })));
    } catch (err) {
      console.error(`[questions/generate] tambahan "${lessons[i].title}":`, err instanceof Error ? err.message : err);
    }
  }

  const poolBs = pool.filter((q) => q.type === "BENAR_SALAH");
  const poolIs = pool.filter((q) => q.type === "ISIAN_SINGKAT");
  console.log(
    `[questions/generate] "${materialTitle}": kumpulan ${poolBs.length} B/S (${poolBs.filter((q) => q.answer === "Salah").length} Salah) + ${poolIs.length} Isian`
  );


  const selected = [...pickBs(poolBs), ...pickSpread(poolIs, IS_TARGET)].map(({ lessonIdx: _l, ...q }) => q);
  return { selected, errors, poolSize: pool.length };
}
