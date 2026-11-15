// Siapkan petunjuk & penjelasan tersimpan untuk soal yang belum memilikinya.
// Pemakaian:
//   npm run prepare-feedback              → soal yang belum siap
//   npm run prepare-feedback -- --force   → buat ulang semua soal
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { prepareFeedback } from "@/lib/quizFeedback";

async function main() {
  const force = process.argv.includes("--force");
  const notReady = { OR: [{ explanation: null }, { hints: { equals: Prisma.DbNull } }] };
  const lqWhere: Prisma.LessonQuestionWhereInput = force ? {} : notReady;
  const qWhere: Prisma.QuestionWhereInput = force ? {} : notReady;
  const ids = [
    ...(await prisma.lessonQuestion.findMany({ where: lqWhere, select: { id: true }, orderBy: { createdAt: "asc" } })),
    ...(await prisma.question.findMany({ where: qWhere, select: { id: true }, orderBy: { createdAt: "asc" } })),
  ].map((q) => q.id);

  if (ids.length === 0) {
    console.log("Semua soal sudah memiliki umpan balik tersimpan.");
    return;
  }
  console.log(`Menyiapkan umpan balik untuk ${ids.length} soal...`);
  let ok = 0;
  for (const [i, id] of ids.entries()) {
    const t0 = Date.now();
    const fb = await prepareFeedback(id, { force });
    if (fb) ok++;
    console.log(`  ${i + 1}/${ids.length} ${fb ? "✓" : "✗"} (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);
  }
  console.log(`Selesai: ${ok}/${ids.length} soal.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
