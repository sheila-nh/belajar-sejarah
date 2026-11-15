import { NextRequest, NextResponse } from "next/server";
import { prepareFeedbackInBackground } from "@/lib/quizFeedback";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateLessonQuestions } from "@/lib/generateLessonQuestions";
import type { KeyTerm } from "@/lib/generateLessonPlan";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId, bsCount = 3, isCount = 7 } = await req.json();
  if (!lessonId) return NextResponse.json({ error: "lessonId wajib diisi" }, { status: 400 });

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return NextResponse.json({ error: "Lesson tidak ditemukan" }, { status: 404 });

  let generated;
  try {
    generated = await generateLessonQuestions(
      {
        title: lesson.title,
        summary: lesson.summary,
        keyPoints: lesson.keyPoints as string[],
        content: lesson.content,
        keyTerms: lesson.keyTerms as KeyTerm[],
      },
      bsCount,
      isCount
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lesson-questions/generate]", msg);
    return NextResponse.json({ error: `Gagal generate soal: ${msg}` }, { status: 500 });
  }

  if (!generated.length) {
    return NextResponse.json({ error: "Qwen tidak menghasilkan soal. Coba lagi." }, { status: 500 });
  }

  // Hapus soal lama, buat baru dalam satu transaksi
  await prisma.$transaction([
    prisma.lessonQuestion.deleteMany({ where: { lessonId } }),
    ...generated.map((q, i) =>
      prisma.lessonQuestion.create({
        data: { id: uuidv4(), lessonId, type: q.type, question: q.question, answer: q.answer, order: i },
      })
    ),
  ]);

  const saved = await prisma.lessonQuestion.findMany({
    where: { lessonId },
    orderBy: { order: "asc" },
  });

  // Petunjuk & penjelasan disiapkan di latar belakang agar kuis siswa langsung cepat
  prepareFeedbackInBackground(saved.map((q) => q.id));

  return NextResponse.json(saved, { status: 201 });
}
