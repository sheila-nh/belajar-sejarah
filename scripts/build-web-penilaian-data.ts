import { prisma } from "@/lib/db";
import { readFileSync, writeFileSync } from "node:fs";
type KeyTerm = { term: string; definition: string };
const orig = JSON.parse(readFileSync("/Users/sheila/Sites/belajar_sejarah/Materi pdf/Penilaian Guru/keluaran-asli-qwen.json", "utf8"));
(async () => {
  const mats = await prisma.material.findMany({ orderBy: { order: "asc" }, include: { lessonPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { lessons: { orderBy: { order: "asc" }, include: { lessonQuestions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } } } } } });
  const out = [];
  for (const m of mats.sort((a, b) => a.filename.localeCompare(b.filename))) {
    const code = m.filename.match(/Modul\s*(\w+?)_/)![1];
    const lessons = m.lessonPlans[0].lessons.map((l) => {
      const o = orig[l.id] ?? {};
      const fix = (t: string) => (o.ganti ?? []).reduce((acc: string, [now, was]: [string, string]) => acc.split(now).join(was), t);
      const warnings = (l.warnings as string[])?.length ? (l.warnings as string[]) : (o.peringatan ?? []);
      return {
        code: `${code}-${l.order}`, title: fix(l.title), summary: fix(l.summary),
        keyPoints: (l.keyPoints as string[]).map(fix),
        paragraphs: fix(l.content).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        keyTerms: (l.keyTerms as KeyTerm[]).map((t) => ({ term: fix(t.term), definition: fix(t.definition) })),
        warnings,
        questions: l.lessonQuestions.map((q) => {
          const a = orig[q.id]?.soal_asli;
          return { id: q.id, type: q.type === "BENAR_SALAH" ? "BS" : "IS", question: a?.question ?? q.question, answer: a?.answer ?? q.answer,
            hints: (a?.hints ?? q.hints) as string[], explanation: a?.explanation ?? q.explanation, quote: a?.quote ?? q.sourceQuote };
        }),
      };
    });
    out.push({ code, title: m.title, lessons });
  }
  const json = JSON.stringify(out);
  writeFileSync("/private/tmp/claude-501/-Users-sheila-Sites-belajar-sejarah/c6e2e352-1369-4129-b946-59e0754a361c/scratchpad/web-data.json", json);
  console.log("materi", out.length, "lesson", out.reduce((n, m) => n + m.lessons.length, 0), "soal", out.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.questions.length, 0), 0), "ukuran", (json.length / 1024).toFixed(0), "KB");
  await prisma.$disconnect();
})();
