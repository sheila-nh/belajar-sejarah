import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  const body = await req.json() as {
    title?: string;
    summary?: string;
    keyPoints?: string[];
    content?: string;
    keyTerms?: { term: string; definition: string }[];
    /** [] = guru menandai lesson sudah ditinjau */
    warnings?: string[];
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.summary !== undefined) data.summary = body.summary.trim();
  if (body.keyPoints !== undefined) data.keyPoints = body.keyPoints.map((p) => p.trim()).filter(Boolean);
  if (body.content !== undefined) data.content = body.content.trim();
  if (body.keyTerms !== undefined) data.keyTerms = body.keyTerms.filter((kt) => kt.term.trim());
  if (body.warnings !== undefined) {
    if (!Array.isArray(body.warnings) || body.warnings.some((w) => typeof w !== "string"))
      return NextResponse.json({ error: "warnings harus berupa daftar teks" }, { status: 400 });
    data.warnings = body.warnings;
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });

  const updated = await prisma.lesson.update({ where: { id }, data });
  return NextResponse.json(updated);
}
