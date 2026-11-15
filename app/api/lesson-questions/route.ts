import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "lessonId wajib diisi" }, { status: 400 });

  const { count } = await prisma.lessonQuestion.deleteMany({ where: { lessonId } });
  return NextResponse.json({ ok: true, count });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "lessonId wajib diisi" }, { status: 400 });

  const role = (session.user as { role: string }).role;

  const questions = await prisma.lessonQuestion.findMany({
    where: { lessonId },
    orderBy: { order: "asc" },
  });

  // Pelajar tidak boleh melihat jawaban maupun umpan balik tersimpan (penjelasan & kutipan memuat jawaban)
  if (role === "PELAJAR") {
    return NextResponse.json(
      questions.map(({ answer: _a, hints: _h, explanation: _e, sourceQuote: _s, ...q }) => q)
    );
  }

  return NextResponse.json(questions);
}
