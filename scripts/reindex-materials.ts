// Indeks ulang potongan teks + embedding (RAG) untuk materi yang sudah diunggah.
// Pemakaian:
//   npm run reindex            → semua materi
//   npm run reindex -- <id>    → satu materi
import { existsSync } from "fs";
import { prisma } from "@/lib/db";
import { parsePDF } from "@/lib/pdf";
import { indexMaterial } from "@/lib/rag";

async function main() {
  const id = process.argv[2];
  const materials = await prisma.material.findMany({
    where: id ? { id } : undefined,
    orderBy: { order: "asc" },
    select: { id: true, title: true, filePath: true },
  });
  if (materials.length === 0) {
    console.log(id ? `Materi ${id} tidak ditemukan.` : "Belum ada materi.");
    return;
  }

  for (const m of materials) {
    if (!existsSync(m.filePath)) {
      console.warn(`✗ ${m.title}: file PDF tidak ditemukan (${m.filePath})`);
      continue;
    }
    const t0 = Date.now();
    const count = await indexMaterial(m.id, await parsePDF(m.filePath));
    console.log(`✓ ${m.title}: ${count} potongan (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
