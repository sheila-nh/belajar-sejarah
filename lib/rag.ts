import { prisma } from "@/lib/db";
import { ollamaPost } from "@/lib/ollamaClient";
import { cleanPdfText, splitIntoSegments } from "@/lib/materialText";
import { v4 as uuidv4 } from "uuid";
import { foldAnswer, isSpellingVariant } from "@/lib/answerMatch";

const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";

// nomic-embed-text dilatih dengan awalan tugas; tanpa awalan kualitas pencarian menurun
const PREFIX = { document: "search_document: ", query: "search_query: " } as const;

export async function embedText(text: string, kind: keyof typeof PREFIX = "document"): Promise<number[]> {
  const json = await ollamaPost<{ embeddings?: number[][]; embedding?: number[] }>("/api/embed", {
    model: EMBED_MODEL,
    input: PREFIX[kind] + text,
  });
  const embedding = json.embeddings?.[0] ?? json.embedding;
  if (!embedding) throw new Error("Ollama tidak mengembalikan embedding");
  return embedding;
}

/**
 * Indeks teks materi untuk RAG: teks PDF dibersihkan (tanpa header, keterangan gambar, kotak
 * aktivitas, dll.), dipecah di batas paragraf, lalu tiap potongan di-embed dan disimpan ke Chunk.
 * Indeks lama materi tersebut dihapus lebih dulu.
 */
export async function indexMaterial(materialId: string, rawPdfText: string): Promise<number> {
  const segments = splitIntoSegments(cleanPdfText(rawPdfText), 700);
  await prisma.chunk.deleteMany({ where: { materialId } });

  for (let i = 0; i < segments.length; i++) {
    const content = segments[i].text;
    const vectorStr = `[${(await embedText(content, "document")).join(",")}]`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Chunk" (id, "materialId", content, embedding, "chunkIndex")
       VALUES ($1, $2, $3, $4::vector, $5)`,
      uuidv4(),
      materialId,
      content,
      vectorStr,
      i
    );
  }
  return segments.length;
}

export async function retrieveRelevantChunks(
  materialId: string,
  queryEmbedding: number[],
  topK = 5
): Promise<{ content: string; distance: number }[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  return prisma.$queryRawUnsafe<{ content: string; distance: number }[]>(
    `SELECT content, (embedding <=> $2::vector) AS distance
     FROM "Chunk"
     WHERE "materialId" = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    materialId,
    vectorStr,
    topK
  );
}

// ─── Konteks sumber untuk umpan balik kuis ─────────────────────────────────────

export type QuestionContext = {
  question: string;
  answer: string;
  type: string;
  lessonTitle: string | null;
  /** potongan teks buku paling relevan (urut dari yang paling relevan) */
  passages: string[];
  /** kalimat buku yang paling mendukung kunci jawaban, bila ditemukan */
  evidence: string | null;
};

const STOPWORDS = new Set(
  "yang dan dari pada untuk dengan dalam oleh atau sebagai adalah ialah karena tersebut kepada akan juga tidak sudah telah bahwa ini itu para serta hingga antara".split(" ")
);

export const normalizeText = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Kata kunci bermakna dari teks (untuk pencocokan leksikal) */
export function keywords(s: string): string[] {
  return [...new Set(normalizeText(s).split(" ").filter((w) => (w.length >= 4 || /^\d+$/.test(w)) && !STOPWORDS.has(w)))];
}

/** Opsi jawaban: kunci Isian Singkat bisa berisi beberapa opsi dipisah koma */
export function answerOptions(answer: string): string[] {
  return answer.split(/[,;]|\s+atau\s+/i).map((s) => s.trim()).filter((s) => s.length >= 2);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n{2,}/)
    // buang paragraf judul ("b. Sarekat Islam") agar tidak menempel ke kalimat berikutnya
    .filter((p) => !(p.length <= 90 && !/[.!?]$/.test(p.trim()) && !p.includes("\n")))
    .flatMap((p) => p.replace(/\n+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z“"(])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

/** Pilih kalimat dari potongan buku yang paling mendukung soal + jawaban */
function findEvidence(passages: string[], question: string, answer: string, type: string): string | null {
  const sentences = passages.flatMap(splitSentences);
  if (sentences.length === 0) return null;
  const qWords = keywords(question);
  const options = type === "BENAR_SALAH" ? [] : answerOptions(answer).map(normalizeText);
  const aWords = type === "BENAR_SALAH" ? [] : keywords(answer);

  let best: string | null = null;
  let bestScore = 0;
  for (const [i, s] of sentences.entries()) {
    const n = normalizeText(s);
    const words = new Set(n.split(" "));
    const optionHit = options.some((o) => o && n.includes(o)) ? 3 : 0;
    const answerOverlap = aWords.filter((w) => words.has(w)).length / Math.max(1, aWords.length);
    // kecocokan dengan soal dihitung juga dari kalimat sebelum/sesudahnya (konteks), karena kalimat
    // berjawaban sering tidak mengulang topiknya ("…Depresi Besar melanda pada 1931–1935")
    const around = new Set(normalizeText([sentences[i - 1] ?? "", s, sentences[i + 1] ?? ""].join(" ")).split(" "));
    const ownOverlap = qWords.filter((w) => words.has(w)).length / Math.max(1, qWords.length);
    const ctxOverlap = qWords.filter((w) => around.has(w)).length / Math.max(1, qWords.length);
    // Isian: kalimat yang memuat jawaban tetapi sama sekali tidak terkait topik soal (mis. "Invasi Italia
    // di Ethiopia (1935–1939)" untuk soal krisis ekonomi) bukan bukti
    if (type !== "BENAR_SALAH" && ctxOverlap === 0) continue;
    // Isian: bukti wajib memuat jawabannya (agar petunjuk 3 bisa berupa kalimat rumpang dari buku)
    if (type !== "BENAR_SALAH" && optionHit === 0 && !leaksAnswer(s, answer)) continue;
    const questionOverlap = ownOverlap + 0.5 * ctxOverlap;
    const score = optionHit + 2 * answerOverlap + questionOverlap;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  // B/S: cukup mirip dengan pernyataan; Isian: harus memuat (sebagian) jawaban
  const minScore = type === "BENAR_SALAH" ? 0.35 : 1;
  return bestScore >= minScore ? best : null;
}

/** Ambil soal beserta potongan buku yang relevan dari materi asalnya */
export async function getQuestionContext(questionId: string): Promise<QuestionContext | null> {
  let base: {
    question: string;
    answer: string;
    type: string;
    materialId: string;
    lessonTitle: string | null;
    lessonContent: string | null;
  } | null = null;

  const lq = await prisma.lessonQuestion.findUnique({
    where: { id: questionId },
    select: {
      question: true,
      answer: true,
      type: true,
      lesson: { select: { title: true, content: true, lessonPlan: { select: { materialId: true } } } },
    },
  });
  if (lq) {
    base = {
      question: lq.question,
      answer: lq.answer,
      type: lq.type,
      materialId: lq.lesson.lessonPlan.materialId,
      lessonTitle: lq.lesson.title,
      lessonContent: lq.lesson.content,
    };
  } else {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      select: { question: true, answer: true, type: true, materialId: true },
    });
    if (q) base = { ...q, lessonTitle: null, lessonContent: null };
  }
  if (!base) return null;

  let passages: string[] = [];
  try {
    // Kunci jawaban ikut dipakai untuk mencari (hanya di server, tidak dikirim ke siswa)
    const query = base.type === "BENAR_SALAH" ? base.question : `${base.question} ${base.answer}`;
    const candidates = await retrieveRelevantChunks(base.materialId, await embedText(query, "query"), 6);

    // Urut ulang: utamakan potongan yang memuat kata kunci jawaban/soal
    const aWords = base.type === "BENAR_SALAH" ? [] : keywords(base.answer);
    const qWords = keywords(base.question);
    passages = candidates
      .map((c, rank) => {
        const words = new Set(normalizeText(c.content).split(" "));
        const lex =
          2 * (aWords.filter((w) => words.has(w)).length / Math.max(1, aWords.length)) +
          qWords.filter((w) => words.has(w)).length / Math.max(1, qWords.length);
        return { content: c.content, score: lex - rank * 0.15 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((c) => c.content);
  } catch (err) {
    console.error("[rag] gagal mengambil konteks soal:", err);
  }

  // Cadangan bila materi belum terindeks: paragraf isi lesson yang paling cocok dengan soal
  if (passages.length === 0 && base.lessonContent) {
    const words = keywords(`${base.question} ${base.type === "BENAR_SALAH" ? "" : base.answer}`);
    passages = base.lessonContent
      .split(/\n{2,}/)
      .map((p) => {
        const pw = new Set(normalizeText(p).split(" "));
        return { p, score: words.filter((w) => pw.has(w)).length };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.p);
  }

  let evidence = findEvidence(passages, base.question, base.answer, base.type);

  // Cadangan leksikal: pencarian vektor kadang meleset (mis. soal Kongres Pemuda I mengambil potongan
  // Kongres Perempuan). Bila tidak ada kalimat bukti, cari di SEMUA potongan materi berdasarkan kata kunci
  // soal (+ kunci Isian); angka/tahun diberi bobot lebih karena paling membedakan.
  // Isian: bukti yang memuat jawaban secara UTUH lebih diutamakan ("22–25 Desember 1928", bukan hanya "22 Desember")
  const fullHit = (sent: string | null) =>
    !!sent && answerOptions(base.answer).some((o) => normalizeText(sent).includes(normalizeText(o)));
  const isIsian = base.type !== "BENAR_SALAH";
  if (!evidence || (isIsian && !fullHit(evidence))) {
    const chunks = await prisma.chunk.findMany({ where: { materialId: base.materialId }, select: { content: true } });
    const words = keywords(`${base.question} ${base.type === "BENAR_SALAH" ? "" : base.answer}`);
    const ranked = chunks
      .map((c) => {
        const cw = new Set(normalizeText(c.content).split(" "));
        const score = words.reduce((n, w) => n + (cw.has(w) ? (/^\d+$/.test(w) ? 2 : 1) : 0), 0);
        return { content: c.content, score };
      })
      .filter((c) => c.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 2)
      .map((c) => c.content);
    const lexEvidence = findEvidence(ranked, base.question, base.answer, base.type);
    if (lexEvidence && (!evidence || fullHit(lexEvidence))) {
      passages = [...ranked, ...passages.filter((p) => !ranked.includes(p))].slice(0, 2);
      evidence = lexEvidence;
    }
  }

  return {
    question: base.question,
    answer: base.answer,
    type: base.type,
    lessonTitle: base.lessonTitle,
    passages,
    evidence,
  };
}

/** Ganti kemunculan opsi jawaban dalam teks dengan titik-titik */
type Tok = { start: number; end: number };
const tokensOf = (text: string): Tok[] =>
  [...text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));

/** Kata khas jawaban (bukan gelar/kata sandang), mis. "Palimbani", "Shamad" — dipakai bila nama diri hanya disebut sebagian */
function distinctiveWords(option: string): string[] {
  return foldAnswer(option)
    .split(" ")
    .filter((w) => w.length >= 5 && !/^\d+$/.test(w));
}

/**
 * Rentang teks yang memuat jawaban (toleran ejaan: "al-Palimbani" = "al Palimbani" = "al-Falimbani"):
 * jendela kata yang cocok dengan opsi kunci, ditambah kata khas jawaban yang muncul terpisah.
 */
function answerSpans(text: string, answer: string): Tok[] {
  const toks = tokensOf(text);
  const covered = new Array<boolean>(toks.length).fill(false);
  const spans: Tok[] = [];
  for (const opt of answerOptions(answer).sort((a, b) => b.length - a.length)) {
    const n = tokensOf(opt).length;
    // jendela terpanjang dulu agar gelar/kata sandang di depan ikut tertutup
    for (let size = n + 2; size >= Math.max(1, n - 3); size--) {
      for (let i = 0; i + size <= toks.length; i++) {
        if (covered.slice(i, i + size).some(Boolean)) continue;
        const piece = text.slice(toks[i].start, toks[i + size - 1].end);
        if (isSpellingVariant(piece, opt)) {
          spans.push({ start: toks[i].start, end: toks[i + size - 1].end });
          covered.fill(true, i, i + size);
        }
      }
    }
    const words = distinctiveWords(opt);
    toks.forEach((t, i) => {
      const word = text.slice(t.start, t.end);
      // hanya penggalan nama diri (berhuruf kapital: "Al-Palimbani"); kata umum seperti
      // "keutamaan jihad" untuk jawaban "Fadha'il al-Jihad" tidak dianggap bocor
      if (!/\p{Lu}/u.test(word)) return;
      if (!covered[i] && words.some((w) => isSpellingVariant(word, w))) {
        spans.push(t);
        covered[i] = true;
      }
    });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Kosongkan jawaban di teks (untuk petunjuk 3 Isian Singkat) */
export function maskAnswer(text: string, answer: string): string {
  let out = "";
  let last = 0;
  for (const sp of answerSpans(text, answer)) {
    out += text.slice(last, sp.start) + "_____";
    last = sp.end;
  }
  // "_____ _____" (gelar + nama tertutup terpisah) → satu bagian kosong
  return (out + text.slice(last)).replace(/_____(?:[\s\-]+(?:al|el|as|ad|bin|binti)?[\s\-]*_____)+/gi, "_____");
}

/** true bila teks membocorkan jawaban Isian Singkat (termasuk variasi ejaan atau sebagian nama) */
export function leaksAnswer(text: string, answer: string): boolean {
  return answerSpans(text, answer).length > 0;
}
