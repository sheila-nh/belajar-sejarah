import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateLessonPlan } from "@/lib/generateLessonPlan";
import { parsePDF } from "@/lib/pdf";
import { cleanPdfText, mergeOverlappingChunks } from "@/lib/materialText";
import { existsSync } from "fs";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { materialId } = await req.json();
  if (!materialId) {
    return NextResponse.json({ error: "materialId wajib diisi" }, { status: 400 });
  }

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) {
    return NextResponse.json({ error: "Materi tidak ditemukan" }, { status: 404 });
  }

  // Utamakan teks PDF asli (urut, tanpa overlap); fallback ke gabungan chunk
  let rawText = "";
  if (material.filePath && existsSync(material.filePath)) {
    try {
      rawText = await parsePDF(material.filePath);
    } catch (err) {
      console.warn("[lesson-plans/generate] gagal parse PDF, pakai chunk:", err);
    }
  }
  if (!rawText.trim()) {
    const chunks = await prisma.chunk.findMany({
      where: { materialId },
      orderBy: { chunkIndex: "asc" },
      select: { content: true },
    });
    rawText = mergeOverlappingChunks(chunks.map((c) => c.content));
  }

  const cleanText = cleanPdfText(rawText);
  if (!cleanText) {
    return NextResponse.json(
      { error: "Materi belum memiliki konten. Pastikan PDF berhasil diproses saat upload." },
      { status: 400 }
    );
  }

  let generated;
  try {
    generated = await generateLessonPlan(material.title, cleanText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lesson-plans/generate] generateLessonPlan error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const lessonPlan = await prisma.lessonPlan.create({
    data: {
      id: uuidv4(),
      materialId,
      title: generated.title,
      lessons: {
        create: generated.lessons.map((lesson, i) => ({
          id: uuidv4(),
          order: i + 1,
          title: lesson.title,
          summary: lesson.summary,
          keyPoints: lesson.keyPoints,
          content: lesson.content,
          keyTerms: lesson.keyTerms,
          warnings: lesson.warnings ?? [],
        })),
      },
    },
    include: { lessons: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(lessonPlan, { status: 201 });
}
