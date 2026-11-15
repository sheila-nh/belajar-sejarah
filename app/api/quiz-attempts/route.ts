import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gradeAttempt } from "@/lib/gradeQuiz";
import { v4 as uuidv4 } from "uuid";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

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
  const { lessonId, answers, preGraded } = await req.json() as {
    lessonId: string;
    answers: { questionId: string; userAnswer: string }[];
    preGraded?: PreGraded;
  };

  if (!lessonId || !Array.isArray(answers)) {
    return NextResponse.json({ error: "lessonId dan answers wajib diisi" }, { status: 400 });
  }

  let result: PreGraded;

  if (preGraded) {
    // Hasil sudah dinilai per soal via /api/quiz/grade-one — simpan langsung
    result = preGraded;
  } else {
    // hanya soal yang ditampilkan ke siswa (kuis memilih sebagian soal secara acak)
    const questions = await prisma.lessonQuestion.findMany({
      where: { lessonId, id: { in: answers.map((a) => a.questionId) } },
      orderBy: { order: "asc" },
      select: { id: true, question: true, answer: true, type: true },
    });

    if (questions.length === 0) {
      return NextResponse.json({ error: "Lesson belum memiliki soal" }, { status: 400 });
    }

    try {
      result = await gradeAttempt(
        questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer, type: q.type })),
        answers
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[quiz-attempts] gradeAttempt error:", msg);
      return NextResponse.json({ error: `Gagal menilai jawaban: ${msg}` }, { status: 500 });
    }
  }

  await prisma.quizAttempt.create({
    data: {
      id: uuidv4(),
      userId: user.id,
      lessonId,
      score: result.score,
      totalQuestions: result.totalQuestions,
      correctCount: result.correctCount,
      answers: result.answers,
    },
  });

  return NextResponse.json({ ...result, passed: result.score >= LESSON_PASS_SCORE });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string; id: string } | undefined;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "lessonId wajib diisi" }, { status: 400 });

  const attempts = await prisma.quizAttempt.findMany({
    where: { lessonId, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, score: true, correctCount: true, totalQuestions: true, createdAt: true },
  });

  const best = attempts.reduce((max, a) => (a.score > max ? a.score : max), 0);

  return NextResponse.json({ attempts, bestScore: best, passed: best >= LESSON_PASS_SCORE });
}
