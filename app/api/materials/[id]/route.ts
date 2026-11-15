import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import fs from "fs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(material);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try { fs.unlinkSync(material.filePath); } catch { /* file mungkin sudah tidak ada */ }

  await prisma.material.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
