import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lessonPlan = await prisma.lessonPlan.findUnique({
    where: { id },
    include: {
      lessons: { orderBy: { order: "asc" } },
      material: { select: { title: true, filename: true } },
    },
  });

  if (!lessonPlan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lessonPlan);
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
  await prisma.lessonPlan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
