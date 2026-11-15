import type { KeyTerm } from "@/lib/generateLessonPlan";
import { extractAndParseJSON } from "@/lib/jsonUtils";
import { qwenChatJSON } from "@/lib/ollamaClient";
import { foldAnswer, requiredItems } from "@/lib/answerMatch";
import { leaksAnswer } from "@/lib/rag";

export type GeneratedQ = {
  question: string;
  answer: string;
  type: "BENAR_SALAH" | "ISIAN_SINGKAT";
  /** B/S berkunci "Salah": fakta di materi yang diubah, dan penggantinya di pernyataan (hanya untuk pemeriksaan) */
  fakta_asli?: string;
  fakta_palsu?: string;
};

type LessonInput = {
  title: string;
  summary: string;
  keyPoints: string[];
  content: string;
  keyTerms: KeyTerm[];
};

// ─── Batas soal Isian Singkat ───────────────────────────────────────────────────
/** Maksimal kata per opsi kunci jawaban (nama, tempat, tahun, istilah) */
export const MAX_ANSWER_WORDS = 5;
/** Maksimal kata seluruh kunci (bila berisi beberapa opsi dipisah koma) */
const MAX_ANSWER_TOTAL_WORDS = 15;
/** Pertanyaan yang jawabannya pasti berupa uraian, bukan isian singkat */
const ESSAY_QUESTION =
  /^(mengapa|kenapa|bagaimana|jelaskan|uraikan|deskripsikan|bandingkan|analisis)\b|\b(apa|sebutkan)\s+(saja\s+)?(yang\s+(menjadi|merupakan)\s+)?(salah satu\s+)?(akibat|dampak|pengaruh|alasan|latar belakang|makna|arti penting|peran|fungsi|manfaat|tujuan|upaya|cara|proses|sebab|penyebab|faktor|hasil)\b/i;
/** Pertanyaan bergaya kalimat tanya lengkap, bukan potongan frasa ("Tujuan utama Gandhi?") */
const QUESTION_WORD = /\b(apa|apakah|siapa|siapakah|kapan|kapankah|mana|manakah|berapa|berapakah|sebutkan|tuliskan)\b/i;
/** Pertanyaan yang diawali kata benda uraian tanpa kata tanya */
const ESSAY_NOUN_START = /^(tujuan|alasan|dampak|akibat|peran|fungsi|manfaat|pengaruh|sebab|penyebab|faktor)\b/i;
/** Jumlah unsur disebut di pertanyaan → kunci boleh berisi beberapa unsur */
const ASKS_MANY = /\b(salah satu|dua|tiga|empat|lima|beberapa)\b/i;
/** Kalimat isian rumpang: "… disebut …", "… adalah …" */
const FILL_IN = /\b(adalah|disebut|dinamakan|bernama|dikenal sebagai)\s*(\.{2,}|…|_+)?\s*\??$/i;

/** Rujukan kabur: "tokoh utama", "tokoh penting", "tokoh tersebut" — tidak jelas tanpa konteks */
const VAGUE_REFERENT =
  /\b(tokoh|ulama|pemimpin|organisasi|tempat|peristiwa|kerajaan|negara)\s+(utama|penting|terpenting|terkenal|berpengaruh|tersebut|itu|ini)\b/i;
/** Kunci berupa keadaan/proses abstrak ("Munculnya semangat …", "Terbentuknya …"), bukan fakta konkret */
const ABSTRACT_ANSWER = /^[a-z]{5,}nya\b/i;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const normQ = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["apa", "siapa", "yang", "di", "ke", "dari", "pada", "dan", "dalam", "untuk", "oleh", "adalah", "nama", "sebutkan", "salah", "satu", "tersebut", "itu", "ini", "mana", "kapan", "tahun"]);
const contentWords = (s: string) => new Set(normQ(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
/** Dua pertanyaan dianggap sama bila kata-kata isinya hampir sama (Jaccard ≥ 0,6) */
function similarQuestion(a: string, b: string): boolean {
  const A = contentWords(a), B = contentWords(b);
  if (A.size === 0 || B.size === 0) return normQ(a) === normQ(b);
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

/** Alasan soal ditolak, atau null bila soal layak */
export function rejectReason(q: GeneratedQ): string | null {
  const question = q.question?.trim() ?? "";
  const answer = q.answer?.trim() ?? "";
  if (wordCount(question) < 4) return "pertanyaan terlalu pendek";
  if (!answer) return "kunci jawaban kosong";
  if (/^(tidak|belum)\s+(disebutkan|diketahui|dijelaskan|ada)\b/i.test(answer)) return "jawaban tidak ada di materi";

  if (q.type === "BENAR_SALAH") {
    return answer === "Benar" || answer === "Salah" ? null : 'kunci B/S harus "Benar" atau "Salah"';
  }
  if (q.type !== "ISIAN_SINGKAT") return "tipe soal tidak dikenal";

  const options = answer.split(/\s*[,;]\s*/).filter(Boolean);
  const oneOf = /\bsalah satu\b/i.test(question);
  const n = requiredItems(question);
  // "Sebutkan salah satu …" / "Sebutkan tiga …": kunci wajib memuat semua opsi/unsur, dipisah koma
  if (oneOf && options.length < 2) return 'soal "salah satu" wajib memuat SEMUA opsi di kunci, dipisah koma';
  if (n > 1 && options.length < n) return `soal meminta ${n} unsur, kunci hanya ${options.length}`;
  // daftar opsi singkat boleh untuk tujuan/faktor/dsb.; tanpa daftar, pertanyaan seperti itu meminta uraian
  if (ESSAY_QUESTION.test(question) || ESSAY_NOUN_START.test(question)) {
    const listQuestion = (oneOf || n > 1) && !/^(mengapa|kenapa|bagaimana|jelaskan|uraikan)\b/i.test(question);
    if (!listQuestion) return "pertanyaan meminta uraian (mengapa/bagaimana/dampak/fungsi/…)";
  }
  // "Nama organisasi yang dibentuk Jose Rizal?" boleh; "Tahun lahir Rizal?" terlalu telegrafis
  const shortForm = /\?$/.test(question) && wordCount(question) >= 5;
  if (VAGUE_REFERENT.test(question))
    return 'rujukan kabur ("tokoh utama/penting/tersebut") — sebutkan ciri pembeda yang hanya dimiliki jawaban';
  if (!QUESTION_WORD.test(question) && !FILL_IN.test(question) && !shortForm)
    return "bukan kalimat tanya lengkap (tanpa apa/siapa/kapan/di mana/berapa/sebutkan)";
  if (/\s(dan|serta)\s/i.test(answer) && !ASKS_MANY.test(question) && options.length < 2)
    return "menanyakan dua fakta sekaligus — satu soal satu fakta";
  // gelar & kata sandang tidak dihitung: "Syaikh Abd al Shamad al Palimbani" = 3 kata
  const longest = Math.max(...options.map((o) => wordCount(foldAnswer(o) || o)));
  if (longest > MAX_ANSWER_WORDS) return `kunci jawaban berupa kalimat (${longest} kata)`;
  if (wordCount(answer) > MAX_ANSWER_TOTAL_WORDS) return "kunci jawaban terlalu panjang";
  if (/[.!?]$/.test(answer) && longest > 3) return "kunci jawaban berupa kalimat";
  if (options.some((o) => ABSTRACT_ANSWER.test(o) && wordCount(o) > 1))
    return "kunci jawaban berupa keadaan abstrak (…-nya), bukan fakta konkret";
  return null;
}

/** Rapikan keluaran Qwen: kunci B/S diseragamkan ("benar"/true → "Benar") */
function tidy(q: GeneratedQ): GeneratedQ {
  const question = String(q.question ?? "").trim();
  let answer = String(q.answer ?? "").trim();
  if (q.type === "BENAR_SALAH") {
    const a = answer.toLowerCase();
    if (a === "benar" || a === "true") answer = "Benar";
    else if (a === "salah" || a === "false") answer = "Salah";
  } else {
    answer = answer.replace(/\.$/, "");
  }
  const out: GeneratedQ = { type: q.type, question, answer };
  if (q.type === "BENAR_SALAH" && answer === "Salah") {
    out.fakta_asli = String(q.fakta_asli ?? "").trim();
    out.fakta_palsu = String(q.fakta_palsu ?? "").trim();
  }
  return out;
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
/**
 * B/S berkunci "Salah" harus benar-benar memuat fakta yang diubah: fakta palsu ada di pernyataan,
 * fakta asli TIDAK ada di pernyataan tetapi ada di materi. Mencegah pernyataan benar berkunci "Salah".
 */
/**
 * Perbaikan otomatis: Qwen sering menyebut perubahan yang dimaksud (fakta_asli → fakta_palsu) tetapi
 * lupa menerapkannya, sehingga pernyataan tetap benar padahal berkunci "Salah". Bila fakta asli ada di
 * pernyataan dan fakta palsu tidak ada di materi, ganti di kode.
 */
function repairFalseStatement(q: GeneratedQ, context: string): GeneratedQ {
  if (q.type !== "BENAR_SALAH" || q.answer !== "Salah" || !q.fakta_asli || !q.fakta_palsu) return q;
  const qs = lower(q.question);
  const asli = lower(q.fakta_asli), palsu = lower(q.fakta_palsu);
  if (asli === palsu || qs.includes(palsu) || !qs.includes(asli) || lower(context).includes(palsu)) return q;
  const re = new RegExp(q.fakta_asli.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
  const question = q.question.replace(re, () => q.fakta_palsu!);
  if (question === q.question) return q;
  console.log(`[generateLessonQuestions] B/S "Salah" diperbaiki otomatis: "${q.fakta_asli}" → "${q.fakta_palsu}"`);
  return { ...q, question };
}

function falseStatementProblem(q: GeneratedQ, context: string): string | null {
  if (q.type !== "BENAR_SALAH" || q.answer !== "Salah") return null;
  const asli = q.fakta_asli ?? "", palsu = q.fakta_palsu ?? "";
  if (!asli || !palsu) return 'B/S "Salah" tanpa keterangan fakta yang diubah';
  if (lower(asli) === lower(palsu)) return 'B/S "Salah": fakta asli dan pengganti sama';
  const qs = lower(q.question), ctx = lower(context);
  if (!qs.includes(lower(palsu))) return `B/S "Salah": fakta pengganti "${palsu}" tidak ada di pernyataan`;
  if (qs.includes(lower(asli))) return `B/S "Salah": fakta asli "${asli}" masih ada di pernyataan`;
  if (!ctx.includes(lower(asli))) return `B/S "Salah": fakta asli "${asli}" tidak ditemukan di materi`;
  return null;
}

/** Dua kunci Isian merujuk hal yang sama (setelah ejaan diseragamkan) */
function sameAnswer(a: string, b: string): boolean {
  const opts = (s: string) => new Set(s.split(/\s*[,;]\s*/).map((o) => foldAnswer(o)).filter(Boolean));
  const A = opts(a);
  return [...opts(b)].some((o) => A.has(o));
}

// ─── Prompt ─────────────────────────────────────────────────────────────────────

const SYSTEM = `Kamu guru sejarah Indonesia yang membuat soal evaluasi untuk siswa SMA. Semua soal HARUS bersumber langsung dari materi yang diberikan — jangan mengarang nama, tanggal, tempat, atau fakta yang tidak tertulis di materi.

═══ SOAL ISIAN SINGKAT ═══
Isian singkat = jawabannya SATU fakta pendek yang bisa ditulis siswa dalam 1–${MAX_ANSWER_WORDS} kata: nama tokoh, nama tempat, tahun/tanggal, nama organisasi/peristiwa/perjanjian, istilah, atau angka.
1. Kunci jawaban paling banyak ${MAX_ANSWER_WORDS} kata per opsi, BUKAN kalimat, tanpa titik di akhir, dan tertulis di materi.
2. DILARANG pertanyaan yang jawabannya uraian: "mengapa", "bagaimana", "jelaskan", "apa akibat/dampak/pengaruh/fungsi/peran/tujuan/alasan …". Ubah menjadi pertanyaan tentang fakta konkretnya.
   ❌ "Apa akibat dari perjuangan Jose Rizal?" → kunci berupa kalimat panjang
   ✓ "Revolusi yang dipicu oleh semangat perjuangan Jose Rizal terjadi di negara mana?" → "Filipina"
   ❌ "Apa fungsi halaqah dalam komunitas Jawi?"
   ✓ "Di kota mana komunitas Jawi membangun jejaring keagamaan melalui halaqah?" → "Makkah"
3. Pertanyaan harus spesifik dan tidak ambigu. Jika bertanya "siapa", sebutkan perannya ("Siapa pemimpin pasukan Demak yang menyerang Malaka?"), dan pastikan tokoh di kunci memang memiliki peran itu di materi.
4. Jika faktanya terdiri dari beberapa unsur, tulis "salah satu" ("Sebutkan salah satu …") atau sebutkan jumlahnya ("Sebutkan tiga …"); kunci WAJIB memuat SEMUA unsur yang disebut di materi, dipisah koma, masing-masing tetap singkat (1–${MAX_ANSWER_WORDS} kata): "Kekayaan, Kejayaan, Agama". Siswa cukup menyebut satu unsur untuk soal "salah satu".
5. Satu soal hanya menguji satu fakta (❌ "Kapan Jose Rizal lahir dan meninggal?"), dan setiap soal Isian punya jawaban yang BERBEDA — jangan membuat dua soal yang jawabannya sama.
6. Hindari "tokoh utama", "tokoh penting", "salah satu tokoh" tanpa ciri pembeda: sebutkan ciri yang HANYA dimiliki jawaban (asal daerah, karya, jabatan, tahun, peristiwa khusus).
   ❌ "Siapa tokoh utama yang mengajarkan kitab-kitab klasik?" (banyak ulama) ✓ "Siapa ulama asal Palembang yang bergabung dengan komunitas Jawi pada abad ke-18?" — hanya bila di materi memang hanya satu ulama asal Palembang.
7. Tulis sebagai kalimat tanya lengkap dengan kata tanya (apa, siapa, kapan, di mana, berapa, sebutkan), dengan konteks cukup sehingga HANYA satu jawaban yang cocok.
   ❌ "Negara yang pernah dikuasai Inggris?" (banyak negara) ✓ "Negara mana yang dipimpin Gandhi dalam perjuangan melawan Inggris?"

═══ SOAL BENAR/SALAH ═══
1. Pernyataan lengkap dengan konteks — jelas siapa melakukan apa, kapan, di mana. ❌ "Serangan ke Malaka berhasil." ✓ "Serangan Adipati Unus dari Demak ke Malaka pada 1513 berhasil mengusir Portugis."
2. Untuk kunci "Salah": ambil kalimat dari materi, lalu GANTI TEPAT SATU fakta (angka, tahun, nama tokoh, nama tempat, atau tanggal) dengan fakta lain yang keliru; fakta lain tetap benar. Tulis fakta yang kamu ganti persis seperti di materi pada "fakta_asli", dan penggantinya persis seperti di pernyataan pada "fakta_palsu". Contoh: materi "Liga Filipina dibentuk di Tondo" → pernyataan "Liga Filipina dibentuk di Manila", fakta_asli "Tondo", fakta_palsu "Manila". Pernyataan yang semua faktanya sesuai materi WAJIB berkunci "Benar".
   Untuk soal selain B/S berkunci "Salah", isi "fakta_asli" dan "fakta_palsu" dengan "".
3. Jangan membuat pernyataan yang umum atau subjektif.
4. Kunci hanya "Benar" atau "Salah".`;

const SCHEMA = {
  type: "object",
  properties: {
    soal: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["BENAR_SALAH", "ISIAN_SINGKAT"] },
          question: { type: "string" },
          answer: { type: "string" },
          fakta_asli: { type: "string" },
          fakta_palsu: { type: "string" },
        },
        required: ["type", "question", "answer", "fakta_asli", "fakta_palsu"],
      },
    },
  },
  required: ["soal"],
};

type Need = { benar: number; salah: number; isian: number };
const ISIAN_SPARE = 3;
const needTotal = (n: Need) => n.benar + n.salah + n.isian;

function buildRequest(context: string, need: Need, existing: GeneratedQ[], rejected: { q: GeneratedQ; why: string }[], note = "") {
  const parts: string[] = [];
  const bs = need.benar + need.salah;
  const wanted = [
    bs > 0 ? `${bs} Benar/Salah (${need.benar} berkunci "Benar", ${need.salah} berkunci "Salah")` : "",
    // minta cadangan: sebagian soal Isian biasanya ditolak pemeriksa
    need.isian > 0 ? `${need.isian + ISIAN_SPARE} Isian Singkat` : "",
  ].filter(Boolean);
  parts.push(`Buat TEPAT ${needTotal(need) + (need.isian > 0 ? ISIAN_SPARE : 0)} soal: ${wanted.join(" + ")}.`);

  if (existing.length > 0) {
    parts.push(
      `Soal yang sudah ada (jangan menanyakan fakta yang sama):\n${existing.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}`
    );
  }
  if (rejected.length > 0) {
    parts.push(
      `Soal berikut DITOLAK — jangan diulang, buat soal lain yang memenuhi aturan:\n${rejected
        .slice(-8)
        .map((r) => `- "${r.q.question}" → "${r.q.answer}" (${r.why})`)
        .join("\n")}`
    );
  }
  if (note) parts.push(note);
  parts.push(`Materi lesson:\n${context}`);
  return parts.join("\n\n");
}

async function askQwen(user: string, temperature: number): Promise<GeneratedQ[]> {
  const raw = await qwenChatJSON(SYSTEM, user, SCHEMA, { temperature, maxTokens: 5000, numCtx: 8192 });
  const parsed = extractAndParseJSON<{ soal: GeneratedQ[] }>(raw, "lesson questions");
  return Array.isArray(parsed.soal) ? parsed.soal.map(tidy) : [];
}

// ─── Uji jawab balik ────────────────────────────────────────────────────────────

const VERIFY_SYSTEM = `Kamu siswa SMA yang teliti. Jawab setiap pertanyaan HANYA berdasarkan materi yang diberikan, bukan pengetahuan umum.`;

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    jawaban: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nomor: { type: "integer" },
          jawaban: { type: "string" },
          kandidat_lain: { type: "array", items: { type: "string" } },
          detail_keliru: { type: "string" },
        },
        required: ["nomor", "jawaban", "kandidat_lain", "detail_keliru"],
      },
    },
  },
  required: ["jawaban"],
};

const NONE = /^(-|tidak ada|tidak disebutkan|tidak diketahui|kosong|none)?$/i;

/**
 * Qwen menjawab soal Isian dari materi TANPA melihat kunci, dan menyebut jawaban lain di materi
 * yang juga cocok. Soal ditolak bila jawabannya tidak sama dengan kunci (salah/tidak berdasar)
 * atau ada kandidat lain yang juga memenuhi pertanyaan (ambigu, mis. "Siapa tokoh utama …?").
 * Hasil: soal → alasan penolakan (soal yang lolos tidak ada di Map). Bila Qwen gagal, semua lolos.
 */
export async function verifyIsian(context: string, questions: GeneratedQ[]): Promise<Map<GeneratedQ, string>> {
  const result = new Map<GeneratedQ, string>();
  if (questions.length === 0) return result;

  const user = `Untuk setiap pertanyaan di bawah:
- "jawaban": jawaban singkat (1–5 kata) yang tertulis di materi. Tulis "TIDAK ADA" bila materi tidak memuat jawabannya.
- "kandidat_lain": SEMUA tokoh/tempat/tahun/hal LAIN yang disebut di materi dan JUGA memenuhi pertanyaan itu. Kosongkan ([]) bila hanya ada satu jawaban yang cocok.
- "detail_keliru": bila pertanyaan memuat detail (tahun, abad, tempat, tokoh, jumlah) yang BERTENTANGAN dengan materi, tulis detail itu beserta yang benar menurut materi (mis. "abad ke-17, seharusnya abad ke-18"). Kosongkan ("") bila semua detail sesuai.

Pertanyaan:
${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}

Materi:
${context}`;

  let rows: { nomor: number; jawaban: string; kandidat_lain: string[]; detail_keliru?: string }[];
  try {
    const raw = await qwenChatJSON(VERIFY_SYSTEM, user, VERIFY_SCHEMA, { temperature: 0, maxTokens: 2000, numCtx: 8192 });
    rows = extractAndParseJSON<{ jawaban: typeof rows }>(raw, "verifikasi soal").jawaban ?? [];
  } catch (e) {
    console.error("[generateLessonQuestions] uji jawab balik gagal, soal tidak diverifikasi:", e);
    return result;
  }

  for (const r of rows) {
    const q = questions[Number(r.nomor) - 1];
    if (!q) continue;
    const got = String(r.jawaban ?? "").trim();
    const multi = /\bsalah satu\b/i.test(q.question) || requiredItems(q.question) > 1;
    if (NONE.test(got) || !leaksAnswer(got, q.answer)) {
      result.set(q, `uji jawab balik: dari materi terjawab "${got || "TIDAK ADA"}", bukan kunci`);
      continue;
    }
    const others = (r.kandidat_lain ?? [])
      .map((c) => String(c).trim())
      .filter((c) => !NONE.test(c) && !leaksAnswer(c, q.answer));
    if (!multi && others.length > 0) {
      result.set(q, `ambigu: "${others.slice(0, 3).join('", "')}" juga cocok`);
      continue;
    }
    const wrong = String(r.detail_keliru ?? "").trim();
    // hanya dipercaya bila detail yang disebut memang tertulis di pertanyaan (cegah halusinasi pemeriksa)
    const cited = wrong.split(/,|seharusnya/i)[0].trim();
    if (!NONE.test(wrong) && cited.length >= 3 && q.question.toLowerCase().includes(cited.toLowerCase())) {
      result.set(q, `premis keliru: ${wrong}`);
    }
  }
  return result;
}

const VERIFY_BS_SCHEMA = {
  type: "object",
  properties: {
    penilaian: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nomor: { type: "integer" },
          menurut_materi: { type: "string", enum: ["Benar", "Salah", "Tidak dapat ditentukan"] },
          alasan: { type: "string" },
        },
        required: ["nomor", "menurut_materi", "alasan"],
      },
    },
  },
  required: ["penilaian"],
};

/**
 * Qwen menilai setiap pernyataan B/S benar/salah HANYA dari materi, tanpa melihat kunci. Soal ditolak
 * bila penilaian berbeda dari kunci (mis. kunci "Salah" padahal tidak ada fakta yang diubah) atau
 * tidak dapat ditentukan dari materi. Bila Qwen gagal, semua lolos.
 */
export async function verifyBS(context: string, questions: GeneratedQ[]): Promise<Map<GeneratedQ, string>> {
  const result = new Map<GeneratedQ, string>();
  if (questions.length === 0) return result;
  const user = `Nilai setiap pernyataan berikut HANYA berdasarkan materi. Periksa setiap detail (tokoh, tahun, tanggal, tempat, jumlah, peristiwa).
- "Benar": semua detail sesuai materi.
- "Salah": ada detail yang bertentangan dengan materi — sebutkan detail itu dan yang benar di "alasan".
- "Tidak dapat ditentukan": materi tidak memuat informasi untuk memastikannya.

Pernyataan:
${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}

Materi:
${context}`;
  let rows: { nomor: number; menurut_materi: string; alasan: string }[];
  try {
    const raw = await qwenChatJSON(VERIFY_SYSTEM, user, VERIFY_BS_SCHEMA, { temperature: 0, maxTokens: 1500, numCtx: 8192 });
    rows = extractAndParseJSON<{ penilaian: typeof rows }>(raw, "verifikasi B/S").penilaian ?? [];
  } catch (e) {
    console.error("[generateLessonQuestions] uji jawab balik B/S gagal, soal tidak diverifikasi:", e);
    return result;
  }
  for (const r of rows) {
    const q = questions[Number(r.nomor) - 1];
    if (!q) continue;
    const verdict = String(r.menurut_materi ?? "");
    if (verdict !== q.answer) {
      result.set(q, `uji jawab balik B/S: menurut materi "${verdict}", kunci "${q.answer}" (${String(r.alasan ?? "").slice(0, 120)})`);
    }
  }
  return result;
}

// ─── Cadangan B/S "Salah" deterministik ────────────────────────────────────────

const NUM_WORDS = ["dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh"];

/**
 * Buat versi SALAH dari pernyataan yang BENAR dengan mengganti satu fakta yang pasti:
 * tahun (diganti tahun lain yang disebut di materi, atau digeser beberapa tahun), angka, atau
 * bilangan kata (tiga → lima). Pengganti tidak boleh membuat kalimat cocok dengan materi.
 */
export function perturbStatement(statement: string, context: string): GeneratedQ | null {
  const ctx = lower(context);
  const make = (asli: string, palsu: string, at: number): GeneratedQ | null => {
    const question = statement.slice(0, at) + palsu + statement.slice(at + asli.length);
    // kalimat hasil tidak boleh tertulis persis di materi
    if (ctx.includes(lower(question.replace(/\.$/, "")))) return null;
    return { type: "BENAR_SALAH", question, answer: "Salah", fakta_asli: asli, fakta_palsu: palsu };
  };

  // 1) Tahun 1500–1999
  const years = [...statement.matchAll(/\b(1[5-9]\d\d)\b/g)];
  if (years.length) {
    const m = years[0];
    const y = Number(m[1]);
    const inStatement = new Set(years.map((x) => Number(x[1])));
    const ctxYears = [...new Set([...context.matchAll(/\b(1[5-9]\d\d)\b/g)].map((x) => Number(x[1])))]
      .filter((v) => !inStatement.has(v) && Math.abs(v - y) <= 10)
      .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
    const alt = ctxYears[0] ?? y + ([3, -2, 4, -3].find((d) => !inStatement.has(y + d)) ?? 3);
    const r = make(m[1], String(alt), m.index!);
    if (r) return r;
  }
  // 2) Angka lain (jumlah, jarak, tanggal) — bukan tahun
  const nums = [...statement.matchAll(/\b(\d{1,3})\b/g)].filter((x) => !/^1[5-9]\d\d$/.test(x[1]));
  for (const m of nums) {
    const n = Number(m[1]);
    const alt = n >= 20 ? Math.round(n * 1.5 / 10) * 10 || n + 10 : n + 2;
    const r = make(m[1], String(alt), m.index!);
    if (r) return r;
  }
  // 3) Bilangan kata
  // huruf kecil saja: "Tiga Prinsip Rakyat" adalah nama, bukan jumlah
  const w = statement.match(new RegExp(`\\b(${NUM_WORDS.join("|")})\\b`));
  if (w) {
    const i = NUM_WORDS.indexOf(w[1].toLowerCase());
    const alt = NUM_WORDS[(i + 2) % NUM_WORDS.length];
    const r = make(w[1], alt, w.index!);
    if (r) return r;
  }
  return null;
}

// ─── Fungsi utama ───────────────────────────────────────────────────────────────

/**
 * Buat soal lesson. Setiap soal divalidasi (Isian benar-benar singkat, kunci B/S valid, tidak
 * duplikat); soal yang ditolak/kurang diminta ulang paling banyak 2 kali beserta alasan penolakannya.
 */
export async function generateLessonQuestions(
  lesson: LessonInput,
  bsCount: number,
  isCount: number,
  /** Opsional: soal lain yang sudah ada (jangan diulang) dan kuota khusus, mis. hanya 1 B/S "Salah" pengganti */
  opts: { existing?: GeneratedQ[]; need?: { benar: number; salah: number; isian: number } } = {}
): Promise<GeneratedQ[]> {
  const context = [
    `Judul: ${lesson.title}`,
    `Ringkasan: ${lesson.summary}`,
    `Poin Penting:\n${lesson.keyPoints.map((p) => `- ${p}`).join("\n")}`,
    `Penjelasan:\n${lesson.content}`,
    lesson.keyTerms.length > 0
      ? `Istilah Kunci:\n${lesson.keyTerms.map((t) => `- ${t.term}: ${t.definition}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const accepted: GeneratedQ[] = [];
  const rejected: { q: GeneratedQ; why: string }[] = [];
  const need: Need = opts.need ? { ...opts.need } : { benar: Math.ceil(bsCount / 2), salah: Math.floor(bsCount / 2), isian: isCount };
  const existing = opts.existing ?? [];

  for (let round = 0; round < 3 && needTotal(need) > 0; round++) {
    let batch: GeneratedQ[];
    try {
      batch = await askQwen(buildRequest(context, need, [...existing, ...accepted], rejected), round === 0 ? 0.5 : 0.7);
    } catch (e) {
      if (round === 0) throw e; // tidak ada hasil sama sekali
      console.error(`[generateLessonQuestions] putaran ${round + 1} gagal:`, e);
      break;
    }

    const before = rejected.length;
    // 1) aturan bentuk soal + duplikat (terhadap soal diterima & kandidat lain di putaran ini)
    const candidates: GeneratedQ[] = [];
    for (const raw of batch) {
      const q = repairFalseStatement(raw, context);
      const pool = [...existing, ...accepted, ...candidates];
      const why =
        rejectReason(q) ??
        falseStatementProblem(q, context) ??
        (pool.some((a) => similarQuestion(a.question, q.question)) ? "duplikat soal lain" : null) ??
        (q.type === "ISIAN_SINGKAT" && pool.some((a) => a.type === "ISIAN_SINGKAT" && sameAnswer(a.answer, q.answer))
          ? `jawaban "${q.answer}" sudah dipakai soal lain`
          : null);
      if (why) rejected.push({ q, why });
      else candidates.push(q);
    }

    // 2) uji jawab balik: Isian harus terjawab dari materi dengan jawaban tunggal = kunci;
    //    B/S harus dinilai sama dengan kuncinya oleh Qwen yang tidak melihat kunci
    const verdicts = new Map([
      ...(await verifyIsian(context, candidates.filter((q) => q.type === "ISIAN_SINGKAT"))),
      ...(await verifyBS(context, candidates.filter((q) => q.type === "BENAR_SALAH"))),
    ]);

    // 3) ambil sesuai kuota yang masih kurang (kelebihan dibuang)
    for (const q of candidates) {
      const why = verdicts.get(q);
      if (why) {
        rejected.push({ q, why });
        continue;
      }
      if (q.type === "ISIAN_SINGKAT" && need.isian > 0) need.isian--;
      else if (q.answer === "Benar" && need.benar > 0) need.benar--;
      else if (q.answer === "Salah" && need.salah > 0) need.salah--;
      else continue;
      accepted.push(q);
    }

    const now = rejected.slice(before);
    if (now.length > 0 || needTotal(need) > 0) {
      console.warn(
        `[generateLessonQuestions] putaran ${round + 1}: ${accepted.length}/${bsCount + isCount} diterima` +
          (now.length ? `, ditolak ${now.length}:\n  ${now.map((r) => `${r.why} ← "${r.q.question}" → "${r.q.answer}"`).join("\n  ")}` : "")
      );
    }
  }

  // Cadangan: slot B/S "Salah" belum terisi → buat dari pernyataan BENAR dengan mengganti satu fakta di kode.
  // Sumber: pernyataan "Salah" yang ditolak karena sebenarnya benar (ditulis Qwen), lalu pernyataan B/S "Benar"
  // yang tidak terpakai. Hasilnya tetap diuji jawab balik agar pasti dinilai "Salah" oleh pembaca materi.
  if (need.salah > 0) {
    const sources = [
      ...rejected.filter((r) => r.q.type === "BENAR_SALAH" && /^(B\/S "Salah"|uji jawab balik B\/S: menurut materi "Benar")/.test(r.why)).map((r) => r.q),
      ...rejected.filter((r) => r.q.type === "BENAR_SALAH" && r.q.answer === "Benar").map((r) => r.q),
    ];
    const made: GeneratedQ[] = [];
    const tryPerturb = (list: GeneratedQ[]) => {
      for (const src of list) {
        if (made.length >= need.salah + 2) break;
        const p = perturbStatement(src.question, context);
        if (p && !made.some((m) => m.question === p.question) &&
            ![...existing, ...accepted, ...made].some((a) => similarQuestion(a.question, p.question))) made.push(p);
      }
    };
    tryPerturb(sources);
    // Masih kurang: minta Qwen menulis pernyataan BENAR baru (keahliannya) tentang fakta yang belum ditanyakan,
    // yang memuat tahun/tanggal/jumlah, lalu kode yang mengubah satu fakta menjadi salah.
    if (made.length < need.salah) {
      try {
        const truths = await askQwen(
          buildRequest(context, { benar: 4, salah: 0, isian: 0 }, [...existing, ...accepted], [],
            "Setiap pernyataan WAJIB memuat tahun, tanggal, atau jumlah yang tertulis di materi, dan membahas fakta yang BELUM ditanyakan oleh soal yang sudah ada. Semua pernyataan berkunci \"Benar\"."),
          0.6
        );
        tryPerturb(truths.filter((x) => x.type === "BENAR_SALAH" && !rejectReason({ ...x, answer: "Benar" })));
      } catch (e) {
        console.error("[generateLessonQuestions] permintaan pernyataan benar gagal:", e);
      }
    }
    const checked = await verifyBS(context, made);
    for (const p of made) {
      if (need.salah === 0) break;
      if (checked.get(p)) continue;
      console.log(`[generateLessonQuestions] B/S "Salah" dibuat dari pernyataan benar: "${p.fakta_asli}" → "${p.fakta_palsu}"`);
      accepted.push(p);
      need.salah--;
    }
  }

  return accepted;
}
