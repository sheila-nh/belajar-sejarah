import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string; id: string } | undefined;
  if (!user || user.role !== "PELAJAR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("materialId");
  if (!materialId) return NextResponse.json({ error: "materialId wajib diisi" }, { status: 400 });

  // Ambil lesson plan terbaru untuk material ini
  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { materialId },
    orderBy: { createdAt: "desc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: { _count: { select: { lessonQuestions: true } } },
      },
    },
  });

  if (!lessonPlan) {
    return NextResponse.json({ lessonPlan: null, lessonStatuses: [], allPassed: false });
  }

  // Ambil best score per lesson untuk user ini
  const lessonIds = lessonPlan.lessons.map((l) => l.id);
  const bestScores = await prisma.quizAttempt.groupBy({
    by: ["lessonId"],
    where: { userId: user.id, lessonId: { in: lessonIds } },
    _max: { score: true },
  });

  const scoreMap = new Map(bestScores.map((b) => [b.lessonId, b._max.score ?? 0]));

  const lessonStatuses = lessonPlan.lessons.map((l) => {
    const hasQuiz = l._count.lessonQuestions > 0;
    const bestScore = scoreMap.get(l.id) ?? null;
    const passed = !hasQuiz || (bestScore !== null && bestScore >= LESSON_PASS_SCORE);
    return {
      lessonId: l.id,
      title: l.title,
      order: l.order,
      hasQuiz,
      bestScore,
      passed,
    };
  });

  // Challenge terbuka jika setiap lesson yang punya soal sudah passed
  const allPassed = lessonStatuses.every((s) => s.passed);

  return NextResponse.json({
    lessonPlanId: lessonPlan.id,
    lessonStatuses,
    allPassed,
  });
}
