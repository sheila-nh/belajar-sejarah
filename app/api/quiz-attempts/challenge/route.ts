import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gradeAttempt } from "@/lib/gradeQuiz";
import { LESSON_PASS_SCORE, CHALLENGE_PASS_SCORE } from "@/lib/quizRules";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string; id: string } | undefined;
  if (!user || user.role !== "PELAJAR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  type PreGraded = {
    score: number; correctCount: number; totalQuestions: number;
    answers: { questionId: string; userAnswer: string; isCorrect: boolean; correctAnswer: string }[];
  };
  const { materialId, answers, preGraded } = await req.json() as {
    materialId: string;
    answers: { questionId: string; userAnswer: string }[];
    preGraded?: PreGraded;
  };

  // Verifikasi challenge sudah terbuka (semua lesson quiz passed)
  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { materialId },
    orderBy: { createdAt: "desc" },
    include: {
      lessons: { include: { _count: { select: { lessonQuestions: true } } } },
    },
  });

  if (lessonPlan) {
    const lessonIds = lessonPlan.lessons.filter((l) => l._count.lessonQuestions > 0).map((l) => l.id);
    if (lessonIds.length > 0) {
      const bestScores = await prisma.quizAttempt.groupBy({
        by: ["lessonId"],
        where: { userId: user.id, lessonId: { in: lessonIds } },
        _max: { score: true },
      });
      const allPassed = lessonIds.every((id) => {
        const best = bestScores.find((b) => b.lessonId === id);
        return best && (best._max.score ?? 0) >= LESSON_PASS_SCORE;
      });
      if (!allPassed) {
        return NextResponse.json({ error: "Challenge belum terbuka. Selesaikan semua quiz lesson terlebih dahulu." }, { status: 403 });
      }
    }
  }

  let result: PreGraded;

  if (preGraded) {
    result = preGraded;
  } else {
    const questions = await prisma.question.findMany({
      where: { materialId },
      select: { id: true, question: true, answer: true, type: true },
    });

    if (questions.length === 0) {
      return NextResponse.json({ error: "Belum ada soal challenge untuk materi ini" }, { status: 400 });
    }

    try {
      result = await gradeAttempt(
        questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer, type: q.type })),
        answers
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[challenge] gradeAttempt error:", msg);
      return NextResponse.json({ error: `Gagal menilai jawaban: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ...result, passed: result.score >= CHALLENGE_PASS_SCORE });
}
