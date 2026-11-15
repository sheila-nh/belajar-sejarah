// Ekspor soal + petunjuk berjenjang (hasil generasi Qwen) ke PDF untuk penilaian guru.
// Satu PDF per materi (sub-bab), urutan soal sama dengan Formulir 2 pada instrumen penilaian.
// Pemakaian: npm run export-soal [-- <materialId>]
// Hasil: "Materi pdf/Penilaian Guru/Soal <kode> - <judul>.pdf"
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = path.join(process.cwd(), "Materi pdf", "Penilaian Guru");

// Soal yang sudah disunting guru ditampilkan versi ASLI Qwen (lihat keluaran-asli-qwen.json)
const ORIGINAL_FILE = path.join(OUT_DIR, "keluaran-asli-qwen.json");
type SoalAsli = { question: string; answer: string; hints: string[] | null; explanation: string | null; quote: string | null };
const originals: Record<string, { soal_asli?: SoalAsli }> = existsSync(ORIGINAL_FILE) ? JSON.parse(readFileSync(ORIGINAL_FILE, "utf8")) : {};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** "_____" → kotak isian */
const blanks = (s: string) => esc(s).replace(/_{3,}/g, '<span class="blank"></span>');

function materialCode(filename: string, fallback: number): string {
  return filename.match(/Modul\s*([0-9]+[A-Z]?)/i)?.[1]?.toUpperCase() ?? String(fallback);
}

const STEPS = [
  { label: "Petunjuk 1 · Arah umum", when: "muncul setelah salah ke-1", cls: "s1" },
  { label: "Petunjuk 2 · Lebih spesifik", when: "muncul setelah salah ke-2", cls: "s2" },
  { label: "Petunjuk 3 · Kalimat dari buku", when: "muncul setelah salah ke-3", cls: "s3" },
];

const CSS = `
@page {
  size: A4; margin: 16mm 16mm 18mm;
  @bottom-left { content: var(--doc-label); font: 8pt -apple-system, "Helvetica Neue", Arial, sans-serif; color: #94a3b8; }
  @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt -apple-system, "Helvetica Neue", Arial, sans-serif; color: #94a3b8; }
}
@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #334155; font-size: 9.5pt; line-height: 1.5; }
.cover { page: cover; height: 297mm; display: flex; flex-direction: column; break-after: page; }
.cover-top { background: linear-gradient(135deg, #d97706 0%, #b45309 60%, #92400e 100%); color: #fff; padding: 34mm 22mm 20mm; position: relative; overflow: hidden; }
.cover-top::after { content: ""; position: absolute; right: -40mm; top: -30mm; width: 120mm; height: 120mm; border-radius: 50%; background: rgba(255,255,255,.08); }
.eyebrow { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #fde68a; font-weight: 600; }
.cover h1 { font-size: 24pt; line-height: 1.2; margin: 6mm 0 4mm; font-weight: 800; max-width: 150mm; }
.chip { display: inline-block; background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: 1.2mm 4mm; font-size: 10pt; font-weight: 600; }
.cover-body { padding: 14mm 22mm; flex: 1; display: flex; flex-direction: column; font-size: 10pt; }
.toc-title { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4mm; }
.toc { list-style: none; margin: 0; padding: 0; border-top: 1px solid #e2e8f0; }
.toc li { display: grid; grid-template-columns: 16mm 1fr auto; gap: 4mm; padding: 3mm 0; border-bottom: 1px solid #e2e8f0; }
.toc .c { font-weight: 700; color: #b45309; } .toc .t { font-weight: 600; color: #1e293b; } .toc .m { color: #94a3b8; font-size: 8.5pt; }
.how { margin-top: 8mm; background: #fffbeb; border: 1px solid #fde68a; border-radius: 3mm; padding: 5mm 6mm; color: #78350f; font-size: 9pt; line-height: 1.6; }
.how b { color: #92400e; } .how ol { margin: 1mm 0 0; padding-left: 5mm; }
.lesson { break-before: page; }
.lesson-head { background: #0284c7; color: #fff; border-radius: 4mm; padding: 5mm 7mm; margin-bottom: 5mm; }
.lesson-head .eyebrow { color: #bae6fd; font-size: 8pt; }
.lesson-head h2 { margin: 1mm 0 0; font-size: 15pt; line-height: 1.25; font-weight: 800; }
.q { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 4mm 5mm; margin-bottom: 4mm; break-inside: avoid; }
.qtop { display: flex; gap: 3mm; align-items: baseline; }
.qn { font-weight: 800; color: #0284c7; font-size: 11pt; min-width: 7mm; }
.badge { font-size: 7.5pt; font-weight: 700; border-radius: 999px; padding: .4mm 2.4mm; white-space: nowrap; }
.bs { background: #dbeafe; color: #1d4ed8; } .is { background: #ede9fe; color: #6d28d9; }
.qt { font-weight: 600; color: #1e293b; font-size: 10pt; }
.key { margin: 1.5mm 0 3mm 10mm; color: #b45309; font-size: 9pt; } .key b { color: #92400e; }
.ladder { margin-left: 10mm; position: relative; }
.ladder::before { content: ""; position: absolute; left: 2.2mm; top: 2mm; bottom: 2mm; width: .3mm; background: #fcd34d; }
.step { position: relative; padding-left: 8mm; margin-bottom: 2.2mm; }
.dot { position: absolute; left: 0; top: .3mm; width: 4.6mm; height: 4.6mm; border-radius: 50%; font-size: 7pt; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.s1 .dot { background: #fef3c7; color: #b45309; border: .3mm solid #fcd34d; }
.s2 .dot { background: #fcd34d; color: #78350f; }
.s3 .dot { background: #d97706; color: #fff; }
.sl { font-size: 7pt; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
.sl b { color: #92400e; }
.st { color: #334155; }
.book { display: block; margin-top: 1mm; border-left: .8mm solid #f59e0b; background: #fffbeb; padding: 1.5mm 3mm; font-family: Georgia, "Times New Roman", serif; font-style: italic; color: #1e293b; border-radius: 0 1.5mm 1.5mm 0; }
.blank { display: inline-block; min-width: 16mm; border-bottom: .5mm dashed #d97706; background: #fef3c7; height: 1em; vertical-align: -.15em; margin: 0 .5mm; }
.after { margin: 2.5mm 0 0 10mm; padding-top: 2.5mm; border-top: 1px dashed #e2e8f0; }
.after .sl { margin-bottom: .5mm; }
.pill { font-size: 7pt; border-radius: 999px; padding: .2mm 2mm; margin-right: 1mm; }
.ok { background: #dcfce7; color: #15803d; } .no { background: #ffe4e6; color: #be123c; }
.quote { margin-top: 1.5mm; font-size: 8.5pt; color: #475569; font-style: italic; }
.quote b { font-style: normal; color: #334155; }
`;

function splitBook(hint: string): { lead: string; sentence: string } | null {
  const m = hint.match(/^([\s\S]*?kalimat dari buku ini):\s*([\s\S]+)$/i);
  return m ? { lead: m[1], sentence: m[2] } : null;
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Google Chrome tidak ditemukan di ${CHROME}`);
  const only = process.argv[2];
  const materials = await prisma.material.findMany({
    where: only ? { id: only } : undefined,
    orderBy: { order: "asc" },
    include: {
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { lessons: { orderBy: { order: "asc" }, include: { lessonQuestions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } } },
      },
    },
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const work = path.join(tmpdir(), `export-soal-${Date.now()}`);
  mkdirSync(work, { recursive: true });

  for (const [idx, m] of materials.entries()) {
    const plan = m.lessonPlans[0];
    const lessons = (plan?.lessons ?? []).filter((l) => l.lessonQuestions.length > 0);
    if (lessons.length === 0) {
      console.log(`- ${m.title}: belum ada soal, dilewati`);
      continue;
    }
    const code = materialCode(m.filename, idx + 1);
    let missing = 0;

    const lessonHtml = lessons
      .map((l) => {
        const cards = l.lessonQuestions
          .map((dbq, i) => {
            const o = originals[dbq.id]?.soal_asli;
            if (o) console.log(`  ${code}-${l.order} no ${i + 1}: memakai versi asli Qwen`);
            const q = o ? { ...dbq, question: o.question, answer: o.answer, hints: o.hints, explanation: o.explanation, sourceQuote: o.quote } : dbq;
            const isBS = q.type === "BENAR_SALAH";
            const hints = Array.isArray(q.hints) ? (q.hints as string[]) : null;
            if (!hints || !q.explanation) missing++;
            const ladder = hints
              ? hints
                  .map((h, k) => {
                    const book = k === 2 ? splitBook(h) : null;
                    const body = book
                      ? `<span class="st">${esc(book.lead)}:</span><span class="book">${blanks(book.sentence)}</span>`
                      : `<span class="st">${blanks(h)}</span>`;
                    return `<div class="step ${STEPS[k].cls}"><span class="dot">${k + 1}</span><div class="sl"><b>${STEPS[k].label}</b> · ${STEPS[k].when}</div>${body}</div>`;
                  })
                  .join("")
              : `<div class="st"><i>Petunjuk belum tersedia.</i></div>`;
            const after = q.explanation
              ? `<div class="after"><div class="sl"><b>Penjelasan setelah menjawab</b> <span class="pill ok">benar → "Tepat!"</span><span class="pill no">salah 4× → "Perlu diketahui:"</span></div><div class="st">${esc(q.explanation)}</div>${
                  q.sourceQuote ? `<div class="quote"><b>📖 Dari buku:</b> “${esc(q.sourceQuote)}”</div>` : ""
                }</div>`
              : "";
            return `<div class="q"><div class="qtop"><span class="qn">${i + 1}</span><span class="badge ${isBS ? "bs" : "is"}">${isBS ? "Benar/Salah" : "Isian Singkat"}</span><span class="qt">${esc(q.question)}</span></div>
<div class="key">Kunci jawaban: <b>${esc(q.answer)}</b></div><div class="ladder">${ladder}</div>${after}</div>`;
          })
          .join("\n");
        return `<article class="lesson"><header class="lesson-head"><div class="eyebrow">Soal &amp; Petunjuk · Kode ${code}-${l.order} · ${l.lessonQuestions.length} soal</div><h2>${esc(l.title)}</h2></header>${cards}</article>`;
      })
      .join("\n");

    const total = lessons.reduce((n, l) => n + l.lessonQuestions.length, 0);
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Soal ${code} – ${esc(m.title)}</title>
<style>${CSS} :root { --doc-label: "Soal & Petunjuk ${code} · ${esc(m.title).replace(/"/g, "'")}"; }</style></head><body>
<section class="cover">
  <div class="cover-top">
    <div class="eyebrow">Belajar Sejarah · Soal &amp; Petunjuk Berjenjang Hasil Generasi AI</div>
    <h1>${esc(m.title)}</h1>
    <span class="chip">Sub-bab ${code} · ${lessons.length} lesson · ${total} soal</span>
  </div>
  <div class="cover-body">
    <p class="toc-title">Daftar Lesson</p>
    <ol class="toc">${lessons
      .map((l) => {
        const bs = l.lessonQuestions.filter((q) => q.type === "BENAR_SALAH").length;
        return `<li><span class="c">${code}-${l.order}</span><span class="t">${esc(l.title)}</span><span class="m">${bs} B/S · ${l.lessonQuestions.length - bs} Isian</span></li>`;
      })
      .join("")}</ol>
    <div class="how"><b>Cara membaca dokumen ini</b>
      <ol>
        <li>Nomor soal sama dengan nomor pada Formulir 2 instrumen penilaian.</li>
        <li>Saat siswa menjawab salah, petunjuk muncul bertahap: petunjuk 1 setelah salah pertama, petunjuk 2 setelah salah kedua, petunjuk 3 setelah salah ketiga. Siswa memiliki 4 kesempatan menjawab.</li>
        <li>Petunjuk 3 berupa kalimat asli dari buku; untuk soal Isian, jawabannya dikosongkan (<span class="blank"></span>).</li>
        <li>Penjelasan ditampilkan setelah siswa menjawab benar (diawali "Tepat!") atau setelah 4 kali salah (diawali "Perlu diketahui:").</li>
      </ol>
    </div>
  </div>
</section>
${lessonHtml}
</body></html>`;

    const htmlPath = path.join(work, `soal-${code}.html`);
    writeFileSync(htmlPath, html);
    const safeTitle = m.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
    const pdfPath = path.join(OUT_DIR, `Soal ${code} - ${safeTitle}.pdf`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "ignore" });
    console.log(`✓ ${path.relative(process.cwd(), pdfPath)} (${lessons.length} lesson, ${total} soal${missing ? `, ${missing} tanpa petunjuk` : ""})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
