// Umpan balik kuis berbasis buku (RAG): petunjuk berjenjang dan penjelasan setelah menjawab.
// Kutipan diambil dari potongan teks materi yang diindeks saat unggah PDF (lib/rag.ts).
import { extractAndParseJSON } from "@/lib/jsonUtils";
import { qwenChatJSON } from "@/lib/ollamaClient";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  answerOptions,
  getQuestionContext,
  keywords,
  leaksAnswer,
  maskAnswer,
  normalizeText,
  type QuestionContext,
} from "@/lib/rag";

export const FALLBACK_HINTS = [
  "Coba baca kembali materi pada lesson ini dan fokus pada tema utama soal.",
  "Perhatikan kata kunci dalam pertanyaan — ia mengarah ke satu konsep atau fakta spesifik.",
  "Jawaban ada dalam materi yang sudah kamu pelajari. Pikirkan nama, tanggal, atau istilah penting yang berkaitan.",
];

const HINTS_SCHEMA = {
  type: "object",
  properties: { hints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 } },
  required: ["hints"],
};

export const BS_SAFE_HINTS = [
  "Ingat kembali peristiwa dan tokoh yang dibahas pernyataan ini pada materi yang sudah kamu baca.",
  "Periksa satu per satu detail pernyataan — tokoh, tahun, tempat, dan jumlah — lalu cocokkan dengan materi yang sudah kamu baca.",
  "Bandingkan setiap detail pernyataan dengan materi. Satu detail yang berbeda saja sudah membuat pernyataan tidak sesuai.",
];

// Petunjuk B/S tidak boleh langsung memberi vonis
const BS_VERDICT = /\b(pernyataan|kalimat)\s+(ini|tersebut|di atas)\s+(adalah\s+)?(benar|salah|tepat|keliru)\b|\bjawaban(nya)?\s+(adalah\s+)?(benar|salah)\b/i;

/** Petunjuk menyangkal detail pernyataan B/S: "…, bukan abad ke-18" / "tidak benar bahwa …" */
export function contradictsStatement(hint: string, statement: string): boolean {
  if (/\b(tidak benar|keliru|salah)\s+(bahwa|jika|kalau)\b/i.test(hint)) return true;
  const qWords = new Set(keywords(statement));
  for (const m of hint.matchAll(/\bbukan(?:lah)?\s+([^.,;:!?]+)/gi)) {
    if (keywords(m[1]).some((w) => qWords.has(w))) return true;
  }
  return false;
}

/** Petunjuk tambahan deterministik: jenis/bentuk jawaban Isian Singkat */
function shapeClue(answer: string): string | null {
  const opts = answerOptions(answer);
  if (opts.length !== 1) return null;
  const a = opts[0];
  if (/^\d{3,4}$/.test(a)) return "Jawabannya berupa tahun.";
  if (/^\d{3,4}\s*[–—-]\s*\d{3,4}$/.test(a)) return "Jawabannya berupa rentang tahun (tahun awal–tahun akhir).";
  if (/^\d/.test(a)) return "Jawabannya berupa angka atau tanggal.";
  const words = a.split(/\s+/).length;
  return `Jawabannya terdiri dari ${words} kata, diawali huruf "${a[0].toUpperCase()}".`;
}

const CONFIRM_SCHEMA = {
  type: "object",
  properties: { penjelasan: { type: "string" } },
  required: ["penjelasan"],
};

/** Penjelasan dianggap layak bila berupa kalimat, bukan sekadar "Benar"/"true"/jawaban */
/**
 * Penjelasan dianggap layak bila berupa kalimat, bukan sekadar "Benar"/"true"/jawaban, dan tidak
 * bertentangan dengan kunci maupun kutipan buku.
 */
export function explanationProblem(text: string, ctx: { answer: string; type: string; evidence: string | null }): string | null {
  const t = text.trim();
  if (t.split(/\s+/).length < 8) return "terlalu pendek";
  if (t.toLowerCase() === ctx.answer.trim().toLowerCase()) return "hanya jawaban";
  // klaim "tidak disebutkan di buku" padahal penjelasan disusun dari kutipan buku → mengarang/keliru
  if (/\b(tidak|belum)\s+(disebutkan|dijelaskan|tercantum|tertulis|ada)\b[^.]*\b(buku|materi|teks|sumber)\b/i.test(t) ||
      /\b(buku|materi|teks|sumber)\b[^.]*\b(tidak|belum)\s+(menyebutkan|menjelaskan|mencantumkan)\b/i.test(t))
    return "mengklaim buku tidak menyebutkan sesuatu";
  // Isian: penjelasan wajib menyebut jawaban yang benar (mencegah "Flu Spanyol menyebabkan…" untuk kunci "pes")
  if (ctx.type === "ISIAN_SINGKAT") {
    // jawaban berangka: cukup semua angkanya muncul ("1910 hingga 1936" = "1910–1936")
    const nums = ctx.answer.match(/\d+/g);
    const hasAnswer = nums ? nums.every((n) => new RegExp(`\\b${n}\\b`).test(t)) : leaksAnswer(t, ctx.answer);
    if (!hasAnswer) return "tidak memuat jawaban yang benar";
  }
  if (ctx.type === "BENAR_SALAH") {
    const key = ctx.answer.trim().toLowerCase();
    const saysTrue = /\bpernyataan\s+(ini|tersebut|itu)\s+(sudah\s+)?(benar|tepat|sesuai)\b/i.test(t);
    const saysFalse = /\bpernyataan\s+(ini|tersebut|itu)\s+(salah|keliru|tidak\s+(benar|tepat|sesuai))\b/i.test(t);
    if ((key === "salah" && saysTrue) || (key === "benar" && saysFalse)) return "bertentangan dengan kunci";
  }
  return null;
}

export type HintsResult = { hints: string[]; grounded: boolean };
export type ConfirmResult = { confirmation: string; quote: string | null };

/** 3 petunjuk berjenjang berdasarkan kutipan buku. `ok` = Qwen berhasil (layak disimpan). */
async function buildHints(ctx: QuestionContext): Promise<{ hints: string[]; ok: boolean }> {
  const isBS = ctx.type === "BENAR_SALAH";
  const passages = ctx.passages.map((p, i) => `[Kutipan ${i + 1}]\n${p}`).join("\n\n");

  const system =
    "Kamu adalah guru sejarah Indonesia yang membimbing siswa SMA menemukan jawaban sendiri (scaffolding). Kamu hanya memakai informasi dari kutipan buku yang diberikan.";

  const user = `${passages ? `KUTIPAN BUKU:\n"""\n${passages}\n"""\n\n` : ""}SOAL (${isBS ? "Benar/Salah" : "Isian Singkat"}): "${ctx.question}"
KUNCI JAWABAN (RAHASIA — jangan pernah ditulis): "${ctx.answer}"

Buat 3 petunjuk BERJENJANG dalam bahasa Indonesia, masing-masing 1–2 kalimat, ditujukan langsung kepada siswa ("kamu").
${
  isBS
    ? `- Petunjuk 1 (ringan): ingatkan konteks peristiwa/tokoh yang dibahas pernyataan, berdasarkan kutipan.
- Petunjuk 2 (sedang): tunjukkan bagian pernyataan yang perlu dicek dengan teliti (misalnya tokoh, tahun, tempat, atau jumlah), tanpa mengatakan bagian itu benar atau salah.${
        ctx.answer.trim().toLowerCase() === "salah"
          ? " (Rahasia: pernyataan ini salah. Arahkan perhatian siswa ke detail yang BERBEDA dari kutipan, bukan ke detail yang sudah sesuai.)"
          : ""
      }
- Petunjuk 3 (kuat): arahkan siswa membandingkan detail pernyataan dengan fakta di kutipan.
- JANGAN menulis bahwa pernyataan itu benar atau salah.`
    : `- Petunjuk 1 (ringan): ingatkan konteks peristiwa, waktu, atau tempat yang berkaitan dengan jawaban, berdasarkan kutipan.
- Petunjuk 2 (sedang): sebutkan ciri atau peran khusus dari jawaban (misalnya jenis organisasi, jabatan tokoh, atau peristiwa yang terjadi bersamaan).
- Petunjuk 3 (kuat): beri petunjuk yang hampir menyebut jawaban, tetapi tanpa menulis jawabannya.
- JANGAN menulis kunci jawaban atau bagian darinya di petunjuk mana pun.`
}
- Semua isi petunjuk harus berasal dari kutipan buku. Jangan menambah fakta dari luar kutipan.
- Siswa TIDAK melihat kutipan ini. Jangan menulis kata "kutipan", "kutipan 1", atau "teks di atas"; sebut saja "materi yang sudah kamu baca".
- Petunjuk 1 dan 2 TIDAK BOLEH menyebut fakta pengganti yang benar (misalnya nama tempat/tokoh/tahun yang seharusnya); itu hanya boleh disimpulkan siswa sendiri.`;

  let hints: string[] = [];
  let ok = false;
  try {
    const raw = await qwenChatJSON(system, user, HINTS_SCHEMA, { temperature: 0.4, maxTokens: 500 });
    const parsed = extractAndParseJSON<{ hints: string[] }>(raw, "hints");
    hints = Array.isArray(parsed.hints) ? parsed.hints.map((h) => String(h).trim()).filter(Boolean).slice(0, 3) : [];
    ok = hints.length === 3;
  } catch (err) {
    console.error("[quiz/hints] Qwen gagal:", err);
  }

  // Pengaman: petunjuk tidak boleh membocorkan jawaban
  // B/S "Salah": detail pengganti yang benar (ada di kalimat bukti, tidak ada di pernyataan) tak boleh
  // muncul di petunjuk 1–2, misalnya "…tetapi materi menyebut Yogyakarta".
  const bsCorrection =
    isBS && ctx.answer.trim().toLowerCase() === "salah" && ctx.evidence
      ? keywords(ctx.evidence).filter((w) => !keywords(ctx.question).includes(w)) // termasuk angka pendek: "abad ke-17"
      : [];
  hints = hints.map((h, i) => {
    if (isBS) {
      // vonis langsung, atau klaim keliru bahwa buku "tidak menyebutkan" detailnya
      if (BS_VERDICT.test(h) || /\btidak\s+(menyebutkan|disebutkan|dijelaskan|menjelaskan)\b/i.test(h)) return BS_SAFE_HINTS[i];
      const words = new Set(normalizeText(h).split(" "));
      if (i < 2 && bsCorrection.some((w) => words.has(w))) return BS_SAFE_HINTS[i];
      // "…pada abad ke-17, bukan abad ke-18": menyangkal detail pernyataan = vonis terselubung
      if (i < 2 && contradictsStatement(h, ctx.question)) return BS_SAFE_HINTS[i];
      return h;
    }
    return leaksAnswer(h, ctx.answer) ? maskAnswer(h, ctx.answer) : h;
  });
  while (hints.length < 3) hints.push(FALLBACK_HINTS[hints.length]);

  // Petunjuk 2 Isian: tambahkan bentuk jawaban (pasti akurat)
  if (!isBS) {
    const clue = shapeClue(ctx.answer);
    if (clue) hints[1] = `${hints[1]} ${clue}`;
  }

  // Petunjuk 3: kalimat asli dari buku (Isian: jawaban dikosongkan) — tidak bisa dikarang
  if (ctx.evidence) {
    if (!isBS && leaksAnswer(ctx.evidence, ctx.answer)) {
      hints[2] = `Lengkapi kalimat dari buku ini: "${maskAnswer(ctx.evidence, ctx.answer)}"`;
    } else if (isBS) {
      hints[2] = `Bandingkan pernyataan soal dengan kalimat dari buku ini: "${ctx.evidence}" Apakah semua detailnya sesuai?`;
    }
  }

  return { hints, ok };
}

/**
 * Penjelasan netral 1–2 kalimat (tanpa kata pembuka) yang sama untuk jawaban benar maupun salah;
 * kata pembuka ("Tepat!" / "Perlu diketahui:") ditambahkan saat ditampilkan.
 */
async function buildExplanation(ctx: QuestionContext): Promise<{ explanation: string; ok: boolean }> {
  const isBS = ctx.type === "BENAR_SALAH";
  const passages = ctx.passages.map((p, i) => `[Kutipan ${i + 1}]\n${p}`).join("\n\n");

  const startInstruction =
    'Langsung ke isi. JANGAN diawali kata seperti "Tepat", "Betul", "Benar", "Salah", "Perlu diketahui", atau "Ingat bahwa".';

  const system =
    "Kamu adalah guru sejarah Indonesia yang memberi umpan balik singkat kepada siswa SMA. Kamu hanya memakai informasi dari kutipan buku yang diberikan.";

  const user = `${passages ? `KUTIPAN BUKU:\n"""\n${passages}\n"""\n\n` : ""}SOAL (${isBS ? "Benar/Salah" : "Isian Singkat"}): "${ctx.question}"
${isBS ? `KETERANGAN: menurut buku, pernyataan di atas ${ctx.answer.trim().toUpperCase()}.` : `JAWABAN YANG BENAR: ${ctx.answer}`}

Tulis "penjelasan": 1–2 kalimat utuh (minimal 15 kata) untuk siswa yang menguatkan pemahaman materi. Isi "penjelasan" harus berupa kalimat, BUKAN hanya kata "Benar", "Salah", atau jawabannya saja.
- ${startInstruction}
- ${
    isBS
      ? `Jelaskan mengapa pernyataan itu ${ctx.answer.toLowerCase()}. Jika salah, sebutkan fakta yang benar menurut kutipan.`
      : "Sertakan jawaban yang benar beserta konteksnya (siapa/apa, kapan, di mana, atau mengapa) menurut kutipan."
  }
- Gunakan HANYA fakta dari kutipan buku. Jangan mengulang pertanyaan, jangan menyebut "kunci jawaban", dan jangan menulis kata "kutipan" (sebut "buku" bila perlu).`;

  let explanation = "";
  for (const temperature of [0.3, 0.6]) {
    try {
      const raw = await qwenChatJSON(system, user, CONFIRM_SCHEMA, { temperature, maxTokens: 250 });
      const parsed = extractAndParseJSON<{ penjelasan: string }>(raw, "confirmation");
      const text = typeof parsed.penjelasan === "string" ? parsed.penjelasan.trim() : "";
      const problem = explanationProblem(text, ctx);
      if (!problem) {
        explanation = text
          .replace(/\bkutipan buku\b/gi, "buku")
          .replace(/\bkutipan\b/gi, "buku")
          // buang kata pembuka bila Qwen tetap menuliskannya
          .replace(/^(tepat|betul|benar|salah|perlu diketahui|ingat bahwa)[,.!:]?\s+/i, "");
        explanation = explanation.charAt(0).toUpperCase() + explanation.slice(1);
        break;
      }
      console.warn(`[quiz/confirm] penjelasan tidak layak — ${problem} (${JSON.stringify(text)}), mengulang`);
    } catch (err) {
      console.error("[quiz/confirm] Qwen gagal:", err);
    }
  }

  if (explanation) return { explanation, ok: true };
  // Cadangan pasti benar: dibentuk dari kunci jawaban (kalimat bukti tampil terpisah sebagai kutipan)
  return {
    explanation: isBS
      ? `Menurut buku, pernyataan tersebut ${ctx.answer.trim().toLowerCase()}.`
      : `Jawaban yang benar adalah ${ctx.answer.trim()}.`,
    ok: false,
  };
}

// ─── Penyimpanan umpan balik per soal ──────────────────────────────────────────

export type StoredFeedback = { hints: string[]; explanation: string; quote: string | null };

/** Umpan balik tersimpan satu soal; null = belum disiapkan */
export async function readStored(questionId: string): Promise<StoredFeedback | null> {
  const select = { hints: true, explanation: true, sourceQuote: true } as const;
  const row =
    (await prisma.lessonQuestion.findUnique({ where: { id: questionId }, select })) ??
    (await prisma.question.findUnique({ where: { id: questionId }, select }));
  if (!row || !Array.isArray(row.hints) || row.hints.length !== 3 || !row.explanation) return null;
  return { hints: row.hints as string[], explanation: row.explanation, quote: row.sourceQuote };
}

/** Simpan umpan balik satu soal (dipakai juga saat guru menyunting petunjuk) */
export async function writeStored(questionId: string, fb: StoredFeedback): Promise<void> {
  const data = { hints: fb.hints, explanation: fb.explanation, sourceQuote: fb.quote };
  const { count } = await prisma.lessonQuestion.updateMany({ where: { id: questionId }, data });
  if (count === 0) await prisma.question.updateMany({ where: { id: questionId }, data });
}

/** Hapus umpan balik tersimpan (dipanggil saat soal diedit) */
export async function clearFeedback(questionId: string): Promise<void> {
  const data = { hints: Prisma.DbNull, explanation: null, sourceQuote: null };
  const { count } = await prisma.lessonQuestion.updateMany({ where: { id: questionId }, data });
  if (count === 0) await prisma.question.updateMany({ where: { id: questionId }, data });
}

// Satu soal hanya diproses sekali walau petunjuk & penjelasan diminta bersamaan
const inFlight = new Map<string, Promise<StoredFeedback | null>>();

/**
 * Siapkan (atau ambil) umpan balik satu soal: kutipan dicari sekali, lalu petunjuk & penjelasan
 * dibuat dan disimpan. Hasil dari cadangan (Qwen gagal) dipakai tetapi tidak disimpan agar dicoba lagi.
 */
export async function prepareFeedback(questionId: string, { force = false } = {}): Promise<StoredFeedback | null> {
  if (!force) {
    const stored = await readStored(questionId);
    if (stored) return stored;
  }
  const running = inFlight.get(questionId);
  if (running) return running;

  const job = (async () => {
    const ctx = await getQuestionContext(questionId);
    if (!ctx) return null;
    const [h, e] = [await buildHints(ctx), await buildExplanation(ctx)];
    const fb: StoredFeedback = { hints: h.hints, explanation: e.explanation, quote: ctx.evidence };
    if (h.ok && e.ok) await writeStored(questionId, fb);
    return fb;
  })().finally(() => inFlight.delete(questionId));

  inFlight.set(questionId, job);
  return job;
}

// Antrean latar belakang: soal diproses satu per satu agar tidak membanjiri Ollama
let queue: Promise<void> = Promise.resolve();

/** Siapkan umpan balik beberapa soal di latar belakang (tidak ditunggu oleh pemanggil) */
export function prepareFeedbackInBackground(questionIds: string[], opts: { force?: boolean } = {}): void {
  if (questionIds.length === 0) return;
  queue = queue.then(async () => {
    const t0 = Date.now();
    let done = 0;
    for (const id of questionIds) {
      try {
        if (await prepareFeedback(id, opts)) done++;
      } catch (err) {
        console.error(`[quizFeedback] gagal menyiapkan soal ${id}:`, err);
      }
    }
    console.log(`[quizFeedback] umpan balik ${done}/${questionIds.length} soal siap (${Math.round((Date.now() - t0) / 1000)} dtk)`);
  });
}

// ─── Dipakai route kuis ────────────────────────────────────────────────────────

export async function getHints(questionId: string): Promise<HintsResult> {
  const fb = await prepareFeedback(questionId);
  return fb ? { hints: fb.hints, grounded: true } : { hints: FALLBACK_HINTS, grounded: false };
}

export async function getConfirmation(questionId: string, wasCorrect: boolean): Promise<ConfirmResult> {
  const fb = await prepareFeedback(questionId);
  if (!fb) return { confirmation: "", quote: null };
  return { confirmation: `${wasCorrect ? "Tepat!" : "Perlu diketahui:"} ${fb.explanation}`, quote: fb.quote };
}
