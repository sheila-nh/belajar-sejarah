import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearFeedback, prepareFeedbackInBackground } from "@/lib/quizFeedback";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  return user?.role === "ADMIN" ? user : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { question, answer } = await req.json() as { question: string; answer: string };
  if (!question?.trim() || !answer?.trim())
    return NextResponse.json({ error: "question dan answer wajib diisi" }, { status: 400 });

  const updated = await prisma.question.update({
    where: { id },
    data: { question: question.trim(), answer: answer.trim() },
  });
  // Isi soal berubah → umpan balik lama tidak berlaku lagi; siapkan ulang di latar belakang
  await clearFeedback(id);
  prepareFeedbackInBackground([id], { force: true });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
