import { prisma } from "@/lib/db";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

export const PASS_SCORE = LESSON_PASS_SCORE;

export type MaterialProgress = {
  id: string;
  title: string;
  lessonCount: number;
  /** lesson yang punya quiz */
  quizCount: number;
  /** lesson ber-quiz dengan skor terbaik ≥ PASS_SCORE */
  passedCount: number;
  /** lesson ber-quiz yang sudah pernah dikerjakan */
  attemptedCount: number;
  challengeCount: number;
  challengeUnlocked: boolean;
  /** urutan lesson berikutnya untuk dilanjutkan (lesson ber-quiz pertama yang belum lulus) */
  nextLessonOrder: number | null;
  nextLessonTitle: string | null;
  avgBest: number | null;
};

/** Kemajuan belajar siswa per materi (lesson plan terbaru, sama seperti halaman materi). Aturan buka challenge sama dengan /api/quiz-attempts/challenge. */
export async function getStudentProgress(userId: string): Promise<MaterialProgress[]> {
  const materials = await prisma.material.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      _count: { select: { questions: true } },
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, order: true, title: true, _count: { select: { lessonQuestions: true } } },
          },
        },
      },
    },
  });

  const lessonIds = materials.flatMap((m) => m.lessonPlans[0]?.lessons.map((l) => l.id) ?? []);
  const best = lessonIds.length
    ? await prisma.quizAttempt.groupBy({
        by: ["lessonId"],
        where: { userId, lessonId: { in: lessonIds } },
        _max: { score: true },
      })
    : [];
  const bestMap = new Map(best.map((b) => [b.lessonId, b._max.score ?? 0]));

  return materials.map((m) => {
    const lessons = m.lessonPlans[0]?.lessons ?? [];
    const withQuiz = lessons.filter((l) => l._count.lessonQuestions > 0);
    const passed = withQuiz.filter((l) => (bestMap.get(l.id) ?? 0) >= PASS_SCORE);
    const attempted = withQuiz.filter((l) => bestMap.has(l.id));
    const next = withQuiz.find((l) => (bestMap.get(l.id) ?? 0) < PASS_SCORE) ?? null;
    const scores = attempted.map((l) => bestMap.get(l.id)!);
    return {
      id: m.id,
      title: m.title,
      lessonCount: lessons.length,
      quizCount: withQuiz.length,
      passedCount: passed.length,
      attemptedCount: attempted.length,
      challengeCount: m._count.questions,
      challengeUnlocked:
        lessons.length > 0 &&
        (withQuiz.length > 0 ? passed.length === withQuiz.length : m._count.questions > 0),
      nextLessonOrder: next?.order ?? null,
      nextLessonTitle: next?.title ?? null,
      avgBest: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  });
}
