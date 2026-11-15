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
  const materialId = searchParams.get("materialId");
  if (!materialId) return NextResponse.json({ error: "materialId wajib diisi" }, { status: 400 });

  const { count } = await prisma.question.deleteMany({ where: { materialId } });
  return NextResponse.json({ ok: true, count });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("materialId");

  const questions = await prisma.question.findMany({
    where: materialId ? { materialId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { material: { select: { title: true } } },
  });

  // Pelajar tidak boleh melihat jawaban maupun umpan balik tersimpan
  if ((session.user as { role: string }).role === "PELAJAR") {
    return NextResponse.json(
      questions.map(({ answer: _a, hints: _h, explanation: _e, sourceQuote: _s, ...q }) => q)
    );
  }

  return NextResponse.json(questions);
}
