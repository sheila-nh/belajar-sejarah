// Ekspor materi lesson (hasil generasi Qwen) ke PDF untuk penilaian guru.
// Satu PDF per materi (sub-bab buku), tata letak mengikuti halaman materi pelajar.
// Pemakaian:
//   npm run export-materi                  → semua materi, lesson plan terbaru
//   npm run export-materi -- <materialId>  → satu materi
// Hasil: "Materi pdf/Penilaian Guru/Materi <kode> - <judul>.pdf"
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = path.join(process.cwd(), "Materi pdf", "Penilaian Guru");
const BOOK = "Buku Siswa Sejarah untuk SMA/MA Kelas XI (Edisi Revisi), Kemendikbudristek, 2024";

type KeyTerm = { term: string; definition: string };

// Koreksi khusus PDF agar guru menilai keluaran ASLI Qwen (bukan hasil suntingan):
// { "<lessonId>": { "ganti": [[teksSaatIni, teksAsli], ...], "peringatan": [...] } }
const ORIGINAL_FILE = path.join(OUT_DIR, "keluaran-asli-qwen.json");
type Override = { kode?: string; ganti?: [string, string][]; peringatan?: string[] };
const overrides: Record<string, Override> = existsSync(ORIGINAL_FILE)
  ? JSON.parse(readFileSync(ORIGINAL_FILE, "utf8"))
  : {};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Kode sub-bab dari nama file: "Modul 2A_Sejarah…pdf" → "2A" */
function materialCode(filename: string, fallback: number): string {
  return filename.match(/Modul\s*([0-9]+[A-Z]?)/i)?.[1]?.toUpperCase() ?? String(fallback);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const CSS = `
@page {
  size: A4;
  margin: 18mm 18mm 20mm;
  @bottom-left { content: var(--doc-label); font: 8pt -apple-system, "Helvetica Neue", Arial, sans-serif; color: #94a3b8; }
  @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt -apple-system, "Helvetica Neue", Arial, sans-serif; color: #94a3b8; }
}
@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #334155; font-size: 10.5pt; line-height: 1.65; }

/* Sampul */
.cover { page: cover; height: 297mm; display: flex; flex-direction: column; break-after: page; }
.cover-top { background: linear-gradient(135deg, #0284c7 0%, #0369a1 60%, #075985 100%); color: #fff; padding: 34mm 22mm 20mm; position: relative; overflow: hidden; }
.cover-top::after { content: ""; position: absolute; right: -40mm; top: -30mm; width: 120mm; height: 120mm; border-radius: 50%; background: rgba(255,255,255,.07); }
.eyebrow { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #bae6fd; font-weight: 600; }
.cover h1 { font-size: 26pt; line-height: 1.2; margin: 6mm 0 4mm; font-weight: 800; max-width: 150mm; }
.code-chip { display: inline-block; background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: 1.2mm 4mm; font-size: 10pt; font-weight: 600; }
.cover-body { padding: 14mm 22mm; flex: 1; display: flex; flex-direction: column; }
.toc-title { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4mm; }
.toc { list-style: none; margin: 0; padding: 0; border-top: 1px solid #e2e8f0; }
.toc li { display: grid; grid-template-columns: 16mm 1fr auto; gap: 4mm; align-items: baseline; padding: 3.2mm 0; border-bottom: 1px solid #e2e8f0; }
.toc .tcode { font-weight: 700; color: #0284c7; font-size: 10pt; }
.toc .ttitle { color: #1e293b; font-weight: 600; }
.toc .tmeta { color: #94a3b8; font-size: 8.5pt; white-space: nowrap; }
.meta { margin-top: auto; display: grid; grid-template-columns: 34mm 1fr; gap: 2mm 4mm; font-size: 9pt; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3mm; padding: 5mm 6mm; }
.meta dt { color: #94a3b8; font-weight: 600; }
.meta dd { margin: 0; }
.note { margin-top: 5mm; font-size: 8.5pt; color: #64748b; line-height: 1.55; }

/* Lesson */
.lesson { break-before: page; }
.lesson-head { background: #0284c7; color: #fff; border-radius: 4mm; padding: 6mm 7mm; margin-bottom: 6mm; }
.lesson-head .eyebrow { color: #bae6fd; font-size: 8pt; }
.lesson-head h2 { margin: 1.5mm 0 0; font-size: 17pt; line-height: 1.25; font-weight: 800; }
.label { font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #64748b; margin: 0 0 2.5mm; }
.summary { background: #f0f9ff; border-left: 1.2mm solid #38bdf8; border-radius: 0 2.5mm 2.5mm 0; padding: 4mm 5mm; margin-bottom: 6mm; break-inside: avoid; }
.summary .label { color: #0284c7; }
.summary p { margin: 0; color: #334155; }
section { margin-bottom: 6mm; }
.points { list-style: none; margin: 0; padding: 0; }
.points li { position: relative; padding-left: 6mm; margin-bottom: 2mm; break-inside: avoid; }
.points li::before { content: ""; position: absolute; left: 1mm; top: 2.3mm; width: 2mm; height: 2mm; border-radius: 50%; background: #38bdf8; }
.para { display: grid; grid-template-columns: 8mm 1fr; margin-bottom: 3mm; orphans: 3; widows: 3; }
.para .pn { font-size: 7.5pt; color: #94a3b8; font-weight: 600; padding-top: .6mm; }
.para p { margin: 0; text-align: justify; hyphens: auto; }
.para.viva p { background: #fffbeb; border: 1px solid #fde68a; border-radius: 2mm; padding: 3mm 4mm; }
.para.viva p::before { content: "Viva Historia · pengayaan"; display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #b45309; margin-bottom: 1mm; }
.warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 3mm; padding: 3.5mm 5mm; margin-bottom: 6mm; break-inside: avoid; color: #7c2d12; font-size: 9.5pt; }
.warn .wt { font-weight: 700; color: #c2410c; margin: 0 0 1mm; }
.warn ul { margin: 1mm 0 1.5mm; padding-left: 5mm; }
.warn .wn { font-size: 8pt; color: #9a3412; margin: 0; }
.terms { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 3mm; overflow: hidden; font-size: 9.5pt; }
.terms td { padding: 2.6mm 4mm; vertical-align: top; border-top: 1px solid #f1f5f9; }
.terms tr:first-child td { border-top: 0; }
.terms tr:nth-child(even) td { background: #f8fafc; }
.terms td.term { width: 38%; font-weight: 700; color: #0369a1; }
.terms tr { break-inside: avoid; }
`;

function lessonHtml(
  l: { order: number; title: string; summary: string; keyPoints: string[]; content: string; keyTerms: KeyTerm[]; warnings: string[] },
  code: string,
  total: number
): string {
  const paras = l.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paraHtml = paras
    .map((p, i) => {
      const viva = /^viva historia/i.test(p);
      const text = viva ? p.replace(/^viva historia\s*(\(pengayaan\))?\s*:?\s*/i, "") : p;
      return `<div class="para${viva ? " viva" : ""}"><span class="pn">¶${i + 1}</span><p>${esc(text)}</p></div>`;
    })
    .join("\n");

  return `
<article class="lesson">
  <header class="lesson-head">
    <div class="eyebrow">Lesson ${l.order} dari ${total} · Kode ${code}-${l.order}</div>
    <h2>${esc(l.title)}</h2>
  </header>
  ${
    l.warnings.length
      ? `<div class="warn"><p class="wt">⚠ Perlu ditinjau — catatan pemeriksa fakta otomatis</p><ul>${l.warnings
          .map((w) => `<li>${esc(w)}</li>`)
          .join("")}</ul><p class="wn">Pemeriksaan otomatis hanya mencakup angka, tahun, dan tanggal. Nama tokoh dan atribusi peristiwa tetap perlu dicek manual.</p></div>`
      : ""
  }
  <div class="summary"><p class="label">Ringkasan</p><p>${esc(l.summary)}</p></div>
  ${
    l.keyPoints.length
      ? `<section><p class="label">Poin Penting</p><ul class="points">${l.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>`
      : ""
  }
  <section><p class="label">Penjelasan</p>${paraHtml}</section>
  ${
    l.keyTerms.length
      ? `<section><p class="label">Istilah Kunci</p><table class="terms">${l.keyTerms
          .map((t) => `<tr><td class="term">${esc(t.term)}</td><td>${esc(t.definition)}</td></tr>`)
          .join("")}</table></section>`
      : ""
  }
</article>`;
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Google Chrome tidak ditemukan di ${CHROME}`);
  const only = process.argv[2];
  const materials = await prisma.material.findMany({
    where: only ? { id: only } : undefined,
    orderBy: { order: "asc" },
    include: {
      lessonPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { lessons: { orderBy: { order: "asc" } } } },
    },
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const work = path.join(tmpdir(), `export-materi-${Date.now()}`);
  mkdirSync(work, { recursive: true });

  for (const [idx, m] of materials.entries()) {
    const plan = m.lessonPlans[0];
    if (!plan || plan.lessons.length === 0) {
      console.log(`- ${m.title}: belum ada lesson plan, dilewati`);
      continue;
    }
    const code = materialCode(m.filename, idx + 1);
    const lessons = plan.lessons.map((l) => {
      const o = overrides[l.id] ?? {};
      const fix = (t: string) => (o.ganti ?? []).reduce((acc, [now, orig]) => acc.split(now).join(orig), t);
      const used = (o.ganti ?? []).filter(([now]) =>
        [l.title, l.summary, l.content, JSON.stringify(l.keyPoints), JSON.stringify(l.keyTerms)].some((t) => t.includes(now))
      ).length;
      if (o.ganti?.length) console.log(`  ${code}-${l.order}: ${used}/${o.ganti.length} koreksi ke teks asli diterapkan`);
      const warnings = (l.warnings as string[])?.length ? (l.warnings as string[]) : (o.peringatan ?? []);
      return {
        order: l.order,
        title: fix(l.title),
        summary: fix(l.summary),
        keyPoints: ((l.keyPoints as string[]) ?? []).map(fix),
        content: fix(l.content),
        keyTerms: ((l.keyTerms as KeyTerm[]) ?? []).map((t) => ({ term: fix(t.term), definition: fix(t.definition) })),
        warnings,
      };
    });
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Materi ${code} – ${esc(m.title)}</title>
<style>${CSS} :root { --doc-label: "Materi ${code} · ${esc(m.title).replace(/"/g, "'")}"; }</style></head><body>
<section class="cover">
  <div class="cover-top">
    <div class="eyebrow">Belajar Sejarah · Materi Hasil Generasi AI</div>
    <h1>${esc(m.title)}</h1>
    <span class="code-chip">Sub-bab ${code} · ${lessons.length} lesson</span>
  </div>
  <div class="cover-body">
    <p class="toc-title">Daftar Lesson</p>
    <ol class="toc">
      ${lessons
        .map(
          (l) =>
            `<li><span class="tcode">${code}-${l.order}</span><span class="ttitle">${esc(l.title)}</span><span class="tmeta">${words(l.content)} kata · ${l.content.split(/\n{2,}/).filter((p) => p.trim()).length} paragraf</span></li>`
        )
        .join("")}
    </ol>
    <dl class="meta">
      <dt>Sumber materi</dt><dd>${esc(BOOK)} — sub-bab ${code} (berkas ${esc(m.filename)})</dd>
      <dt>Dibuat oleh</dt><dd>Model bahasa lokal Qwen3:8B melalui aplikasi Belajar Sejarah</dd>
      <dt>Lesson plan</dt><dd>${esc(plan.title)} · dibuat ${formatDate(plan.createdAt)}</dd>
      <dt>Dicetak</dt><dd>${formatDate(new Date())}</dd>
    </dl>
    <p class="note">Dokumen ini berisi materi keluaran model sebelum disunting guru, termasuk catatan pemeriksa fakta otomatis bila ada. Kode lesson (mis. ${code}-1) dan nomor paragraf (¶) dapat dipakai untuk merujuk bagian tertentu pada lembar penilaian.</p>
  </div>
</section>
${lessons.map((l) => lessonHtml(l, code, lessons.length)).join("\n")}
</body></html>`;

    const htmlPath = path.join(work, `materi-${code}.html`);
    writeFileSync(htmlPath, html);
    const safeTitle = m.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
    const pdfPath = path.join(OUT_DIR, `Materi ${code} - ${safeTitle}.pdf`);
    execFileSync(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: "ignore" }
    );
    console.log(`✓ ${path.relative(process.cwd(), pdfPath)} (${lessons.length} lesson)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
