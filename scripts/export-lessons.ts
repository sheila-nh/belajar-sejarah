/**
 * Ekspor lesson plan terbaru setiap materi ke JSON untuk bahan penilaian guru.
 * Jalankan dari root project:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/export-lessons.ts
 * Hasil: docs/penelitian/data/lessons-export.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const materials = await prisma.material.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });

  const data = {
    exportedAt: new Date().toISOString(),
    materials: materials
      .filter((m) => m.lessonPlans.length > 0)
      .map((m) => {
        const lp = m.lessonPlans[0];
        return {
          materialId: m.id,
          materialTitle: m.title,
          materialOrder: m.order,
          lessonPlanId: lp.id,
          lessonPlanTitle: lp.title,
          lessonPlanCreatedAt: lp.createdAt.toISOString(),
          lessons: lp.lessons.map((l) => ({
            order: l.order,
            title: l.title,
            summary: l.summary,
            keyPoints: l.keyPoints,
            content: l.content,
            keyTerms: l.keyTerms,
          })),
        };
      }),
  };

  const out = path.join(process.cwd(), "docs/penelitian/data/lessons-export.json");
  fs.writeFileSync(out, JSON.stringify(data, null, 2), "utf8");
  console.log(`Selesai: ${data.materials.length} materi diekspor ke ${out}`);
  for (const m of data.materials) console.log(`  - ${m.materialTitle}: ${m.lessons.length} lesson`);
}

main().finally(() => prisma.$disconnect());
