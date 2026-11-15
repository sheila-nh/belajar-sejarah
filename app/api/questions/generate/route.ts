import { NextRequest, NextResponse } from "next/server";
import { prepareFeedbackInBackground } from "@/lib/quizFeedback";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildChallengeSet } from "@/lib/challengeQuestions";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { materialId } = await req.json() as { materialId: string };
  if (!materialId) {
    return NextResponse.json({ error: "materialId wajib diisi" }, { status: 400 });
  }

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return NextResponse.json({ error: "Materi tidak ditemukan" }, { status: 404 });

  // Ambil lesson plan terbaru beserta lesson-lessonnya
  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { materialId },
    orderBy: { createdAt: "desc" },
    include: { lessons: { orderBy: { order: "asc" } } },
  });

  if (!lessonPlan || lessonPlan.lessons.length === 0) {
    return NextResponse.json(
      { error: "Materi belum memiliki lesson plan. Generate lesson plan terlebih dahulu." },
      { status: 400 }
    );
  }

  const { selected, errors } = await buildChallengeSet(material.title, lessonPlan.lessons);
  if (selected.length === 0) {
    return NextResponse.json(
      { error: `Gagal generate soal dari semua lesson: ${errors.join(", ")}` },
      { status: 500 }
    );
  }

  // Simpan ke tabel Question (challenge)
  const saved = await prisma.$transaction(
    selected.map((q) =>
      prisma.question.create({
        data: {
          id: uuidv4(),
          materialId,
          type: q.type,
          question: q.question,
          answer: q.answer,
        },
      })
    )
  );

  // Petunjuk & penjelasan disiapkan di latar belakang agar kuis siswa langsung cepat
  prepareFeedbackInBackground(saved.map((q) => q.id));

  return NextResponse.json(saved, { status: 201 });
}
