import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("materialId");

  const lessonPlans = await prisma.lessonPlan.findMany({
    where: materialId ? { materialId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      material: { select: { title: true } },
      _count: { select: { lessons: true } },
    },
  });

  return NextResponse.json(lessonPlans);
}
