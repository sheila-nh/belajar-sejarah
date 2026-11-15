// Pencocokan jawaban Isian Singkat yang toleran terhadap salah ketik kecil dan variasi ejaan
// (ejaan lama, transliterasi Arab, gelar, tanda hubung). Deterministik: dipakai sebelum Qwen
// agar variasi seperti "Abd al-Shamad al-Palimbani" / "Abdus Samad al-Falimbani" selalu diterima.

// bentuk setelah foldAnswer (sy/sh → s, ch → kh): Syekh, Syaikh, Syeikh, Sheikh, Shaykh, Syech, Kiai, K.H., Haji
const HONORIFICS = new Set(["sekh", "saikh", "seikh", "saykh", "seh", "kiai", "kyai", "kh", "haji"]);

/** Bentuk dasar untuk dibandingkan: huruf kecil, tanpa diakritik/tanda baca, ejaan diseragamkan */
export function foldAnswer(s: string): string {
  let t = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritik (ā, é, …)
    .toLowerCase()
    .replace(/[‘’ʼʿʾ'`´"]/g, "") // apostrof transliterasi ('Abd, Ba'asyir)
    // kata sandang Arab yang ditulis dengan tanda hubung: al-, as-, asy-, ad-, …
    .replace(/\b(al|el|ul|as|asy|ash|ad|an|ar|at|az|ats)-/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // ejaan lama & transliterasi
  t = t
    .replace(/oe/g, "u") // Soekarno → Sukarno
    .replace(/dj/g, "j") // Djakarta → Jakarta
    .replace(/tj/g, "c") // Tjokroaminoto → Cokroaminoto
    .replace(/s[jhy]/g, "s") // Sjahrir/Syahrir, Shamad/Syamad/Samad
    .replace(/ch/g, "kh") // Syech → Syekh
    .replace(/dz/g, "z")
    .replace(/dh/g, "d")
    .replace(/[fv]/g, "p") // Falimbani → Palimbani
    .replace(/q/g, "k");

  // Abdul / Abdus / Abdur / Abd al / Abdussamad → "abd …"
  t = t.replace(/\babd(?:ul|us|ur|el|al|u)?(?=\s|[a-z])\s*/g, "abd ");

  let tokens = t.split(/\s+/).filter(Boolean);
  // kata sandang lepas (al, el, ul) dan gelar keagamaan, selama masih ada kata lain
  const core = tokens.filter((w) => !["al", "el", "ul"].includes(w) && !HONORIFICS.has(w));
  if (core.length > 0) tokens = core;

  return tokens
    .join(" ")
    .replace(/([a-z])\1+/g, "$1"); // huruf ganda: Muhammad = Muhamad
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const digits = (s: string) => (s.match(/\d+/g) ?? []).join(" ");
// angka Romawi pada teks asli (Perang Dunia I/II, Hamengkubuwono VIII/IX) — dicek sebelum v → p
const ROMAN = /^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xvi{0,3})$/;
const romans = (raw: string) =>
  raw.toLowerCase().split(/[^a-z]+/).filter((w) => ROMAN.test(w)).join(" ");

/**
 * Dua kata dianggap sama bila hanya beda salah ketik kecil. Kata pendek (≤5 huruf) harus persis,
 * karena satu huruf bisa berarti nama lain (Agung/Ageng, Jawa/Jawi, Maluku/Malaka).
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 6) return false;
  const d = levenshtein(a, b);
  // 1 huruf: Palimbani/Palimbany. Beda 2 huruf tidak diterima (Palimbani ≠ Palembang);
  // variasi vokal seperti Diponegoro/Dipanegara ditangani vowelVariant.
  return d <= 1;
}

// Kata umum yang tidak cukup membedakan nama (Sultan Agung vs Sultan Ageng tetap berbeda)
const GENERIC = new Set([
  "sultan", "raden", "pangeran", "ratu", "prabu", "sunan", "kerajaan", "kesultanan", "perang",
  "kongres", "perjanjian", "organisasi", "partai", "gerakan", "pulau", "kota", "sungai", "gunung",
]);

const VOWEL = /[aiueo]/;
/** Hanya beda vokal di posisi yang sama: Shomad/Shamad, Diponegoro/Dipanegara, Sarekat/Serikat */
function vowelVariant(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && !(VOWEL.test(a[i]) && VOWEL.test(b[i]))) return false;
  }
  return true;
}

/** Satu jawaban dibanding satu bentuk kunci (keduanya sudah di-fold) */
function closeEnough(ans: string, key: string): boolean {
  if (ans === key) return true;
  if (ans.replace(/\s+/g, "") === key.replace(/\s+/g, "")) return true; // beda spasi saja
  if (digits(ans) !== digits(key)) return false; // 1928 ≠ 1982
  const a = ans.split(" ");
  const k = key.split(" ");
  if (a.length !== k.length) return false;

  // ada kata khas yang sama persis → variasi vokal pada kata lain bisa dipercaya
  const anchored = a.some((w, i) => w === k[i] && w.length >= 6 && !GENERIC.has(w));
  return a.every(
    (w, i) =>
      sameWord(w, k[i]) ||
      (vowelVariant(w, k[i]) && (w.length >= 8 || (anchored && w.length >= 4)))
  );
}

/** Opsi kunci: seluruh kunci, atau salah satu opsi bila dipisah koma/titik koma/"atau" */
function keyOptions(key: string): string[] {
  const parts = key.split(/\s*(?:[,;/]|\batau\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? [key, ...parts] : [key];
}

/**
 * true bila jawaban siswa sama dengan kunci (atau salah satu opsinya) setelah ejaan diseragamkan
 * dan salah ketik kecil ditoleransi. false = belum tentu salah; serahkan ke Qwen untuk cek makna.
 */
export function isSpellingVariant(studentAnswer: string, key: string): boolean {
  const ans = foldAnswer(studentAnswer);
  if (!ans) return false;
  return keyOptions(key).some((opt) => {
    const k = foldAnswer(opt);
    return k.length > 0 && romans(studentAnswer) === romans(opt) && closeEnough(ans, k);
  });
}

/**
 * true bila angka pada jawaban pasti tidak cocok dengan kunci: kunci memuat angka (tahun, tanggal,
 * jumlah) dan angka jawaban tidak sama persis dengan angka kunci atau salah satu opsinya.
 * "28 Oktober 1928" vs kunci "27–28 Oktober 1928" → bertentangan (kurang lengkap).
 */
export function numbersConflict(studentAnswer: string, key: string): boolean {
  // urutan tidak penting: "1629 dan 1628" = kunci "1628, 1629"
  const sorted = (s: string) => digits(s).split(" ").filter(Boolean).sort().join(" ");
  const keyNums = keyOptions(key).map(sorted).filter(Boolean);
  if (keyNums.length === 0) return false;
  return !keyNums.includes(sorted(studentAnswer));
}

/**
 * Jawaban menebak dengan alternatif ("Dapitan atau Manila", "Sukarno/Hatta"): true bila ada
 * alternatif yang tidak cocok dengan kunci/opsinya. Semua alternatif benar (opsi "salah satu") → false.
 */
export function isGuess(studentAnswer: string, key: string): boolean {
  const alts = studentAnswer.split(/\s*(?:\batau\b|\/)\s*/i).filter((p) => p.trim());
  return alts.length > 1 && alts.some((a) => !isSpellingVariant(a, key));
}

const STOPWORDS = new Set([
  "yang", "dan", "atau", "adalah", "ialah", "merupakan", "dari", "pada", "untuk", "dengan", "dalam",
  "oleh", "itu", "ini", "tersebut", "siapa", "apa", "mana", "kapan", "nya", "ia", "dia", "sebagai",
]);
const contentWords = (s: string) =>
  foldAnswer(s).split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w));
/** Kata dasar kasar agar "dijuluki" ≈ "julukan", "pemimpinnya" ≈ "pemimpin" */
const stem = (w: string) => w.replace(/^(di|me|ber|ter|pe)/, "").replace(/(nya|kan|an|i)$/, "").slice(0, 5);

/**
 * Jawaban hanya mengulang soal tanpa menyebut fakta kunci, mis. soal "Siapa pemimpin SI yang
 * dijuluki Raja Jawa Tanpa Mahkota?" dijawab "Raja Jawa Tanpa Mahkota adalah julukan pemimpin SI".
 */
export function echoesQuestion(studentAnswer: string, question: string, key: string): boolean {
  const ans = contentWords(studentAnswer);
  if (ans.length < 2) return false;
  const keyStems = new Set(key.split(/\s*[,;]\s*/).flatMap(contentWords).map(stem));
  if (ans.some((w) => keyStems.has(stem(w)))) return false; // fakta kunci disebut
  const qStems = new Set(contentWords(question).map(stem));
  const fromQuestion = ans.filter((w) => qStems.has(stem(w))).length;
  return fromQuestion / ans.length >= 0.7;
}

const NUMBER_WORDS: Record<string, number> = { dua: 2, tiga: 3, empat: 4, lima: 5 };
/** Jumlah unsur yang diminta pertanyaan: "Sebutkan tiga …" → 3; "salah satu"/lainnya → 1 */
export function requiredItems(question: string): number {
  if (/\bsalah satu\b/i.test(question)) return 1;
  const m = question.match(/\b(?:sebutkan|tuliskan|apa saja)\s+(dua|tiga|empat|lima)\b/i);
  return m ? NUMBER_WORDS[m[1].toLowerCase()] : 1;
}

/** Berapa opsi kunci yang berbeda disebut dengan benar (ejaan ditoleransi) dalam jawaban berisi daftar */
export function countMatchedOptions(studentAnswer: string, key: string): number {
  const parts = studentAnswer.split(/\s*(?:[,;/]|\bdan\b|\bserta\b)\s*/i).filter((p) => p.trim());
  const options = key.split(/\s*[,;]\s*/).filter(Boolean);
  const hit = new Set<number>();
  for (const p of parts) {
    const i = options.findIndex((o, idx) => !hit.has(idx) && isSpellingVariant(p, o));
    if (i >= 0) hit.add(i);
  }
  return hit.size;
}


// ─── Normalisasi jawaban lisan (hasil Whisper) ─────────────────────────────────

const UNITS: Record<string, number> = {
  nol: 0, kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
};
const EN_MONTHS: Record<string, string> = {
  january: "Januari", february: "Februari", march: "Maret", april: "April", may: "Mei", june: "Juni",
  july: "Juli", august: "Agustus", september: "September", october: "Oktober", november: "November", december: "Desember",
};
const NUM_WORD = /^(nol|kosong|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|sejuta|belas|puluh|ratus|ribu|juta|koma)$/i;

/** Ubah satu rangkaian kata bilangan ("seribu sembilan ratus lima puluh delapan") menjadi teks angka ("1958") */
function wordsToNumber(words: string[]): string {
  let total = 0, current = 0, last = 0, decimal = "", inDecimal = false, millions = false;
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (w === "koma") { inDecimal = true; continue; }
    if (inDecimal && w in UNITS) { decimal += String(UNITS[w]); continue; }
    if (w in UNITS) { current += UNITS[w]; last = UNITS[w]; }
    else if (w === "sepuluh") { current += 10; last = 0; }
    else if (w === "sebelas") { current += 11; last = 0; }
    else if (w === "belas") { current += 10; last = 0; }
    else if (w === "puluh") { current += last * 9; last = 0; }
    else if (w === "seratus") { current += 100; last = 0; }
    else if (w === "ratus") { current += last * 99; last = 0; }
    else if (w === "seribu") { total += 1000; last = 0; }
    else if (w === "ribu") { total += (current || 1) * 1000; current = 0; last = 0; }
    else if (w === "sejuta") { current = 1; millions = true; }
    else if (w === "juta") { millions = true; }
  }
  const n = String(total + current) + (decimal ? `,${decimal}` : "");
  // "lima juta" tetap ditulis "5 juta" (begitulah kunci jawaban ditulis)
  return millions ? `${n} juta` : n;
}

// Kata bilangan & bulan yang salah eja dari Whisper ("Serebu", "tijapunuh", "sembilandartus", "Sektemper")
const FUZZY_NUM = ["sembilan", "delapan", "sepuluh", "sebelas", "seratus", "seribu", "empat", "tujuh", "puluh", "ratus", "belas", "tiga", "lima", "enam", "satu", "ribu", "juta"];
const MULTIPLIERS = ["puluh", "ratus", "belas", "ribu"];
const UNIT_WORDS = ["satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const ID_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function nearest(word: string, list: string[], maxDist: (len: number) => number, sameFirst = true): string | null {
  const w = word.toLowerCase();
  let best: string | null = null, bestD = Infinity;
  for (const c of list) {
    if (sameFirst && c[0].toLowerCase() !== w[0]) continue;
    const d = levenshtein(w, c.toLowerCase());
    if (d < bestD && d <= maxDist(w.length)) { best = c; bestD = d; }
  }
  return best;
}

/** Satu token bilangan salah eja → bentuk baku (bisa jadi dua kata bila menyambung), atau null */
function fuzzyNumberToken(token: string): string | null {
  const w = token.toLowerCase();
  if (w.length >= 5) {
    const one = nearest(w, FUZZY_NUM, (l) => (l >= 8 ? 2 : 1));
    if (one) return one;
  }
  // menyambung: "tijapunuh" = tiga + puluh, "sembilandartus" = sembilan + ratus
  for (let i = 3; i <= w.length - 4; i++) {
    const unit = nearest(w.slice(0, i), UNIT_WORDS, (l) => (l >= 4 ? 1 : 0));
    const mult = unit && nearest(w.slice(i), MULTIPLIERS, (l) => (l >= 5 ? 2 : 1), false);
    if (unit && mult) return `${unit} ${mult}`;
  }
  return null;
}

/** Perbaiki kata bilangan/bulan salah eja, hanya bila bersebelahan dengan angka atau kata bilangan lain */
function fixMisheardNumbers(text: string): string {
  const parts = text.split(/(\s+)/);
  const isWord = (i: number) => i >= 0 && i < parts.length && !/^\s+$/.test(parts[i]);
  const core = (x: string) => x.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const numeric = (x: string) => /\d/.test(x) || NUM_WORD.test(core(x));
  const fixed = parts.map((tok, i) => {
    if (!isWord(i)) return tok;
    const c = core(tok);
    if (!c || numeric(c)) return tok;
    // tetangga kiri/kanan (lewati spasi)
    const neighbors = [i - 2, i + 2].filter(isWord).map((j) => parts[j]);
    const nearNumber = neighbors.some((n) => numeric(n) || fuzzyNumberToken(core(n)) !== null);
    if (!nearNumber) return tok;
    const num = fuzzyNumberToken(c);
    if (num) return tok.replace(c, num);
    const month = c.length >= 6 ? nearest(c, ID_MONTHS, () => 2) : null;
    return month ? tok.replace(c, month) : tok;
  });
  return fixed.join("");
}

/**
 * Rapikan jawaban hasil pengenalan suara sebelum dinilai: kata bilangan → angka, "Rp" dibuang,
 * "22/25" → "22–25", pemisah ribuan "1,920" → "1920", nama bulan Inggris → Indonesia.
 */
export function normalizeSpokenAnswer(text: string): string {
  let t = fixMisheardNumbers(text.replace(/[()]/g, " ").replace(/(\p{L})-(?=\p{L})/gu, "$1 ").replace(/,/g, (m, off, str) => (/\d/.test(str[off - 1] ?? "") && /\d/.test(str[off + 1] ?? "") ? m : " ,")))
    .replace(/ ,/g, ",")
    .replace(/(\d)\s*%/g, "$1 persen")
    .replace(/(\p{L})-(?=\p{L})/gu, "$1 ") // "Sertibu-sembilan" → "Sertibu sembilan" (bukan tanda hubung nama: al-Palimbani tetap utuh setelah fold)
    // kata bilangan yang menyambung / salah dengar: "tigapulu" → "tiga puluh", "Sedibu" → "seribu"
    .replace(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)(puluh|pulu|belas|ratus|ribu)\b/gi, "$1 $2")
    .replace(/\bpulu\b/gi, "puluh")
    .replace(/\bse(?:r|d|rt|dr|rd)ibu\b|\bsribu\b/gi, "seribu")
    .replace(/Rp\.?\s*/gi, "")
    .replace(/\b(\d+)[.,]000[.,]000\b/g, "$1 juta") // "5,000,000" → "5 juta"
    .replace(/\b(\d)[.,](\d{3})\b/g, "$1$2") // pemisah ribuan: "1.910" / "1,929" → tahun
    .replace(/(\d)\s*\/\s*(?=\d)/g, "$1–")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, (m) => EN_MONTHS[m.toLowerCase()]);
  const tokens = t.split(/(\s+)/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].replace(/[.,!?]+$/, "");
    if (NUM_WORD.test(word) && !/^(koma|belas|puluh|ratus|ribu|juta)$/i.test(word)) {
      const seq: string[] = [];
      let j = i;
      while (j < tokens.length) {
        const wj = tokens[j].replace(/[.,!?]+$/, "");
        if (/^\s+$/.test(tokens[j])) { j++; continue; }
        if (!NUM_WORD.test(wj)) break;
        // "seribu sembilan ratus sepuluh seribu sembilan ratus tiga puluh enam" = dua tahun berurutan
        if (seq.length > 0 && /^seribu$/i.test(wj)) break;
        seq.push(wj);
        j++;
      }
      // bagian dari nama ("Tiga Serangkai", "Tiga Prinsip Rakyat"): satu kata bilangan diikuti kata berhuruf kapital
      const nextWord = tokens.slice(j).find((x) => !/^\s+$/.test(x)) ?? "";
      const nextCore = nextWord.replace(/[.,!?]+$/, "");
      const nextIsMonth = ID_MONTHS.some((m) => m.toLowerCase() === nextCore.toLowerCase());
      if (seq.length === 1 && /^[A-Z]/.test(seq[0]) && /^[A-Z]/.test(nextWord) && !NUM_WORD.test(nextCore) && !nextIsMonth) {
        out.push(tokens[i]);
        continue;
      }
      out.push(wordsToNumber(seq));
      // pertahankan spasi sebelum kata berikutnya
      i = j - 1;
      if (j < tokens.length) out.push(" ");
      continue;
    }
    out.push(tokens[i]);
  }
  t = out
    .join("")
    .replace(/\b1000[\s,]+(\d{3})\b/g, (_, n) => String(1000 + Number(n))) // "seribu 914" → 1914
    .replace(/(\d)\s*\/\s*(?=\p{L})|(\p{L})\s*\/\s*(?=\d)/gu, "$1$2 ") // "25/Desember" → "25 Desember"
    .replace(/(\d)\s*(?:sampai|hingga|sd|s\.d\.|-|—)\s*(?=\d)/gi, "$1–") // "22 sampai 25" → "22–25"
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  return t;
}
