import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import QuizPlayerOneByOne from "@/components/student/QuizPlayerOneByOne";
import { LESSON_PASS_SCORE, CHALLENGE_PASS_SCORE } from "@/lib/quizRules";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { id: string; role: string } | undefined;
  if (!user) redirect("/login");

  const { id: materialId } = await params;

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      questions: { orderBy: { createdAt: "asc" } },
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          lessons: { include: { _count: { select: { lessonQuestions: true } } } },
        },
      },
    },
  });

  if (!material) notFound();

  // Cek apakah challenge sudah terbuka
  const lessonPlan = material.lessonPlans[0];
  let challengeUnlocked = true;
  let lockedLessons: { title: string; bestScore: number | null }[] = [];

  if (lessonPlan) {
    const lessonsWithQuiz = lessonPlan.lessons.filter((l) => l._count.lessonQuestions > 0);

    if (lessonsWithQuiz.length > 0) {
      const bestScores = await prisma.quizAttempt.groupBy({
        by: ["lessonId"],
        where: { userId: user.id, lessonId: { in: lessonsWithQuiz.map((l) => l.id) } },
        _max: { score: true },
      });

      const scoreMap = new Map(bestScores.map((b) => [b.lessonId, b._max.score ?? 0]));

      const lessonStatuses = lessonsWithQuiz.map((l) => ({
        title: l.title,
        bestScore: scoreMap.get(l.id) ?? null,
        passed: (scoreMap.get(l.id) ?? 0) >= LESSON_PASS_SCORE,
      }));

      lockedLessons = lessonStatuses.filter((s) => !s.passed);
      challengeUnlocked = lockedLessons.length === 0;
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/student/materials/${materialId}`} aria-label="Kembali" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1d2b4f] text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white">←</Link>
        <div>
          <p className="text-xs text-[#3577b5] font-semibold uppercase tracking-wide">🏆 Challenge</p>
          <h1 className="text-xl font-bold text-[#1d2b4f]">{material.title}</h1>
        </div>
      </div>

      {!challengeUnlocked ? (
        <div className="mt-6 bg-white rounded-2xl border-2 border-[#1d2b4f]/80 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#1d2b4f] mb-2">Challenge Terkunci</h2>
          <p className="text-gray-500 text-sm mb-6">Selesaikan quiz semua lesson dengan nilai ≥ {LESSON_PASS_SCORE} untuk membuka Challenge.</p>
          <div className="space-y-2 text-left max-w-sm mx-auto">
            {lockedLessons.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm bg-[#fcc76a]/20 rounded-lg px-3 py-2">
                <span className="text-[#1d2b4f]">{l.title}</span>
                <span className="shrink-0 text-[#f47a20] font-semibold">
                  {l.bestScore !== null ? `Nilai: ${l.bestScore}` : "Belum dikerjakan"}
                </span>
              </div>
            ))}
          </div>
          <Link href={`/student/materials/${materialId}`} className="mt-6 inline-block rounded-full border-2 border-[#1d2b4f] px-4 py-1.5 text-sm font-semibold text-[#1d2b4f] hover:bg-[#1d2b4f] hover:text-white transition">
            Kembali ke materi
          </Link>
        </div>
      ) : material.questions.length === 0 ? (
        <div className="mt-6 text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-300 text-gray-500">
          <p>Admin belum menambahkan soal challenge untuk materi ini.</p>
        </div>
      ) : (
        <>
          <div className="bg-[#fcc76a]/20 border-l-4 border-[#fcc76a] rounded-r-lg px-4 py-3 mb-6 mt-4 text-sm text-[#1d2b4f]">
            <strong>Challenge terbuka!</strong> {material.questions.length} soal dari seluruh materi · Nilai tidak mempengaruhi status lesson
          </div>
          <QuizPlayerOneByOne
            questions={material.questions.map((q) => ({
              id: q.id,
              question: q.question,
              type: q.type as "BENAR_SALAH" | "ISIAN_SINGKAT",
            }))}
            submitUrl="/api/quiz-attempts/challenge"
            extraBody={{ materialId }}
            backUrl={`/student/materials/${materialId}`}
            passScore={CHALLENGE_PASS_SCORE}
          />
        </>
      )}
    </div>
  );
}
