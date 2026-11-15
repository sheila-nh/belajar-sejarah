import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PATCH /api/materials/reorder
// Body: { orderedIds: string[] }  — full ordered list of material IDs
export async function PATCH(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderedIds } = (await req.json()) as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds wajib diisi" }, { status: 400 });
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.material.update({ where: { id }, data: { order: index } }),
    ),
  );

  return NextResponse.json({ ok: true });
}
