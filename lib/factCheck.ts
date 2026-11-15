// Pemeriksaan fakta deterministik (tanpa LLM) untuk teks hasil Qwen terhadap teks sumber:
// - angka yang muncul di hasil tetapi tidak ada di sumber (kemungkinan dikarang)
// - tanggal lengkap dan tahun di sumber yang tidak muncul di hasil (fakta terlewat)

const MONTHS = "Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember";
const FULL_DATE = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})\\b`, "gi");
const MONTH_YEAR = new RegExp(`(?<!\\d\\s)\\b(${MONTHS})\\s+(\\d{4})\\b`, "gi");
const YEAR = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;

// Angka yang ditulis dengan kata di sumber, agar "sepuluh tahun" → "10 tahun" tidak dianggap karangan
const NUMBER_WORDS: Record<string, string> = {
  sepuluh: "10", sebelas: "11", "dua belas": "12", "lima belas": "15", "dua puluh": "20",
  "tiga puluh": "30", "empat puluh": "40", "lima puluh": "50", seratus: "100", seribu: "1000",
};

// Tahun modern biasanya berasal dari paragraf pemantik (Covid-19, peringatan 2019) yang memang diabaikan
const MODERN_YEAR = 1990;

function normalizeNumber(tok: string): string {
  if (/^\d{1,3}(\.\d{3})+$/.test(tok)) return tok.replace(/\./g, ""); // 600.000 → 600000
  if (/^\d+\.\d{1,2}$/.test(tok)) return tok.replace(".", ","); // 1.5 → 1,5
  return tok;
}

function numbersIn(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.matchAll(NUMBER)) {
    const n = normalizeNumber(m[0]);
    set.add(n);
    // bagian dari angka majemuk juga dianggap ada ("1,5–4,37", "1910–1936")
    for (const part of n.split(/[.,]/)) set.add(part);
  }
  const lower = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) if (lower.includes(word)) set.add(num);
  return set;
}

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[–—]/g, "-").toLowerCase();

export type FactCheckResult = {
  inventedNumbers: string[];
  missingDates: string[];
  missingYears: string[];
  /** tahun ≥1990 di hasil — biasanya fakta masa kini dari paragraf pemantik */
  modernYears: string[];
};

export function checkFacts(output: string, source: string): FactCheckResult {
  const srcNums = numbersIn(source);
  const outNorm = norm(output);

  const inventedNumbers = [
    ...new Set(
      [...output.matchAll(NUMBER)]
        .map((m) => normalizeNumber(m[0]))
        // angka 1 digit (tanggal, butir daftar) terlalu umum untuk diperiksa
        .filter((n) => (n.replace(/[.,]/g, "").length >= 2 || /[.,]/.test(n)) && !srcNums.has(n))
    ),
  ];

  const dates = new Set<string>();
  for (const m of source.matchAll(FULL_DATE)) dates.add(`${m[1]} ${m[2]} ${m[3]}`);
  for (const m of source.matchAll(MONTH_YEAR)) {
    const covered = [...dates].some((d) => d.toLowerCase().endsWith(`${m[1]} ${m[2]}`.toLowerCase()));
    if (!covered) dates.add(`${m[1]} ${m[2]}`);
  }
  const missingDates = [...dates].filter((d) => {
    const year = Number(d.slice(-4));
    return year < MODERN_YEAR && !outNorm.includes(norm(d));
  });

  const outYears = new Set([...output.matchAll(YEAR)].map((m) => m[1]));
  const missingYears = [
    ...new Set([...source.matchAll(YEAR)].map((m) => m[1]).filter((y) => Number(y) < MODERN_YEAR && !outYears.has(y))),
  ];

  const modernYears = [...outYears].filter((y) => Number(y) >= MODERN_YEAR);

  return { inventedNumbers, missingDates, missingYears, modernYears };
}

export function countProblems(r: FactCheckResult): number {
  return r.inventedNumbers.length + r.missingDates.length + r.missingYears.length + r.modernYears.length;
}

/** Peringatan untuk guru (ditampilkan di editor lesson) */
export function describeForTeacher(r: FactCheckResult): string[] {
  const lines: string[] = [];
  if (r.inventedNumbers.length)
    lines.push(`Angka tidak ditemukan di teks sumber (mungkin dikarang): ${r.inventedNumbers.join(", ")}.`);
  if (r.missingDates.length)
    lines.push(`Tanggal di teks sumber tidak muncul atau ditulis berbeda di lesson: ${r.missingDates.join("; ")}.`);
  if (r.missingYears.length)
    lines.push(`Tahun di teks sumber tidak muncul di lesson: ${r.missingYears.join(", ")}.`);
  if (r.modernYears.length)
    lines.push(`Lesson memuat tahun masa kini (kemungkinan dari paragraf pemantik, bukan materi sejarah): ${r.modernYears.join(", ")}.`);
  return lines;
}

/** Umpan balik berbahasa Indonesia untuk diminta perbaikan ke Qwen */
export function describeProblems(r: FactCheckResult): string[] {
  const lines: string[] = [];
  if (r.inventedNumbers.length)
    lines.push(
      `Angka berikut TIDAK ADA di teks sumber, jadi kemungkinan kamu karang — hapus atau perbaiki sesuai teks: ${r.inventedNumbers.join(", ")}.`
    );
  if (r.missingDates.length)
    lines.push(`Tanggal berikut ada di teks sumber tetapi tidak kamu tulis — masukkan beserta peristiwanya: ${r.missingDates.join("; ")}.`);
  if (r.modernYears.length)
    lines.push(
      `Tahun berikut adalah peristiwa MASA KINI dari paragraf pemantik (bukan materi sejarah) — hapus kalimat yang memuatnya: ${r.modernYears.join(", ")}.`
    );
  if (r.missingYears.length)
    lines.push(`Tahun berikut ada di teks sumber tetapi tidak kamu tulis — masukkan beserta peristiwanya: ${r.missingYears.join(", ")}.`);
  return lines;
}
