import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gradeBenarSalah, gradeIsianOne } from "@/lib/gradeQuiz";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId, userAnswer } = await req.json() as { questionId: string; userAnswer: string };

  // Cari di LessonQuestion dulu, lalu Question
  let q: { id: string; question: string; answer: string; type: string } | null =
    await prisma.lessonQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, question: true, answer: true, type: true },
    });

  if (!q) {
    q = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, question: true, answer: true, type: true },
    });
  }

  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  let isCorrect: boolean;
  if (q.type === "BENAR_SALAH") {
    isCorrect = gradeBenarSalah(userAnswer, q.answer);
  } else {
    isCorrect = userAnswer.trim() ? await gradeIsianOne(q.question, q.answer, userAnswer) : false;
  }

  return NextResponse.json({ isCorrect, correctAnswer: q.answer });
}
