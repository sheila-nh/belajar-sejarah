import { extractAndParseJSON } from "@/lib/jsonUtils";
import { qwenChatJSON } from "@/lib/ollamaClient";
import { countMatchedOptions, echoesQuestion, isGuess, isSpellingVariant, normalizeSpokenAnswer, numbersConflict, requiredItems } from "@/lib/answerMatch";

export type AnswerResult = {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer: string;
};

export type GradeResult = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  answers: AnswerResult[];
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.,!?;:'"]/g, "").replace(/\s+/g, " ");
}

// BENAR_SALAH selalu exact match karena jawaban siswa berupa klik tombol
export function gradeBenarSalah(userAnswer: string, correctAnswer: string): boolean {
  return normalize(userAnswer) === normalize(correctAnswer);
}

type IsianItem = { questionId: string; question: string; correctAnswer: string; studentAnswer: string };

const GRADING_SYSTEM = `Kamu guru sejarah Indonesia yang menilai jawaban isian singkat siswa SMA. Nilai MAKNA dan FAKTA, bukan ejaan.

BENAR bila jawaban siswa merujuk pada tokoh, tempat, peristiwa, organisasi, atau konsep yang SAMA dengan kunci, walaupun:
- ada salah ketik kecil (huruf tertukar, kurang, atau lebih);
- ejaan atau transliterasi berbeda: ejaan lama/baru (Soekarno = Sukarno, Boedi Oetomo = Budi Utomo), transliterasi Arab (Abd al-Shamad = Abdul Shomad = Abdus Samad; Palimbani = Falimbani), vokal Jawa (Diponegoro = Dipanegara);
- gelar atau kata sandang ditambah/dihilangkan (Syekh, Kiai, Haji, al-, as-);
- siswa memakai nama lain dari tokoh yang SAMA: nama asli, nama gelar, atau nama julukan yang dikenal (Ki Hajar Dewantara = Suwardi Suryaningrat; Tan Malaka = Ibrahim Datuk Tan Malaka);
- susunan kata atau sinonim berbeda tetapi maknanya sama;
- kunci berisi beberapa opsi dipisah koma, dan siswa menyebut salah satu atau lebih opsi tersebut.

SALAH bila:
- merujuk pada tokoh/tempat/peristiwa/organisasi LAIN, walaupun ejaannya mirip (Sultan Agung ≠ Sultan Ageng, Maluku ≠ Malaka, Sukarno ≠ Suharto);
- menyebut organisasi lain yang BERKAITAN tetapi berbeda: pendahulu, penerus, cabang, atau organisasi sezaman (Perhimpunan Indonesia ≠ Partai Nasional Indonesia, Jong Java ≠ Budi Utomo). Nama lain hanya BENAR bila benar-benar nama untuk tokoh/organisasi yang sama;
- angka, tahun, tanggal, atau angka Romawi berbeda (1928 ≠ 1929, Perang Dunia I ≠ Perang Dunia II);
- terlalu umum atau kurang spesifik dibanding kunci (kunci "17 Agustus 1945", siswa "1945");
- tidak relevan atau kosong;
- siswa menebak dengan menyebut beberapa kandidat berbeda untuk soal yang jawabannya satu ("Sukarno atau Hatta", "Belanda, Inggris, Portugis").

SOAL BERISI BEBERAPA UNSUR (kunci dipisah koma):
- "salah satu": BENAR bila siswa menyebut minimal satu unsur kunci dengan benar. Bila siswa menyebut lebih dari satu, semua yang disebut harus benar.
- "Sebutkan dua/tiga …": BENAR hanya bila siswa menyebut sebanyak yang diminta dengan benar (urutan bebas).

JAWABAN PANJANG (berupa kalimat):
- BENAR bila kalimat itu memuat fakta kunci dengan benar dan tidak memuat fakta lain yang keliru atau bertentangan dengan soal.
- SALAH bila hanya berputar-putar, mengulang soal, atau menjelaskan hal umum tanpa menyebut fakta kunci.`;

const GRADING_SCHEMA = {
  type: "object",
  properties: {
    hasil: {
      type: "array",
      items: {
        type: "object",
        properties: { nomor: { type: "integer" }, benar: { type: "boolean" } },
        required: ["nomor", "benar"],
      },
    },
  },
  required: ["hasil"],
};

function unitNote(it: IsianItem): string {
  const n = requiredItems(it.question);
  if (n > 1) return `Harus menyebut: ${n} unsur kunci\n   `;
  if (/\bsalah satu\b/i.test(it.question)) return "Cukup menyebut: satu unsur kunci\n   ";
  return "";
}

/** Nilai beberapa jawaban Isian Singkat sekaligus. Variasi ejaan dicek dulu tanpa Qwen. */
export async function gradeIsianBatch(
  items: IsianItem[],
  /** normalizeSpoken: false hanya untuk uji pembanding (penilai tanpa normalisasi jawaban lisan) */
  opts: { normalizeSpoken?: boolean } = {}
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const toQwen: IsianItem[] = [];
  // jawaban lisan/ketikan: "tiga belas" → "13", "22/25 December" → "22–25 Desember"
  if (opts.normalizeSpoken !== false) items = items.map((it) => ({ ...it, studentAnswer: normalizeSpokenAnswer(it.studentAnswer) }));
  for (const it of items) {
    const n = requiredItems(it.question);
    if (!it.studentAnswer.trim()) results.set(it.questionId, false);
    else if (isGuess(it.studentAnswer, it.correctAnswer)) results.set(it.questionId, false);
    else if (echoesQuestion(it.studentAnswer, it.question, it.correctAnswer)) results.set(it.questionId, false);
    else if (n > 1 ? countMatchedOptions(it.studentAnswer, it.correctAnswer) >= n : isSpellingVariant(it.studentAnswer, it.correctAnswer))
      results.set(it.questionId, true);
    else if (numbersConflict(it.studentAnswer, it.correctAnswer)) results.set(it.questionId, false);
    else toQwen.push(it);
  }
  if (toQwen.length === 0) return results;

  const list = toQwen
    .map(
      (it, i) =>
        `${i + 1}. Soal: ${it.question}\n   Kunci: ${it.correctAnswer}\n   ${unitNote(it)}Jawaban siswa: ${it.studentAnswer}`
    )
    .join("\n\n");
  const raw = await qwenChatJSON(
    GRADING_SYSTEM,
    `Nilai setiap jawaban berikut. Kembalikan "hasil" berisi nomor dan benar (true/false) untuk SETIAP nomor.\n\n${list}`,
    GRADING_SCHEMA,
    { temperature: 0, maxTokens: toQwen.length * 30 + 100, numCtx: 4096 }
  );
  const parsed = extractAndParseJSON<{ hasil: { nomor: number; benar: boolean }[] }>(raw, "grading");
  if (!Array.isArray(parsed.hasil)) throw new Error("Format hasil penilaian Qwen tidak valid");
  for (const r of parsed.hasil) {
    const it = toQwen[Number(r.nomor) - 1];
    if (it) results.set(it.questionId, Boolean(r.benar));
  }
  console.log(`[gradeIsian] ${items.length - toQwen.length} dinilai aturan (ejaan/angka), ${toQwen.length} dinilai Qwen`);
  return results;
}

/** Nilai satu jawaban Isian Singkat (dipakai saat kuis per soal) */
export async function gradeIsianOne(
  question: string,
  correctAnswer: string,
  studentAnswer: string,
  opts: { normalizeSpoken?: boolean } = {}
): Promise<boolean> {
  const r = await gradeIsianBatch([{ questionId: "q", question, correctAnswer, studentAnswer }], opts);
  return r.get("q") ?? false;
}

export async function gradeAttempt(
  questions: { id: string; question: string; answer: string; type: string }[],
  userAnswers: { questionId: string; userAnswer: string }[]
): Promise<GradeResult> {
  const answerMap = new Map(userAnswers.map((a) => [a.questionId, a.userAnswer]));

  // Kumpulkan semua ISIAN_SINGKAT yang dijawab untuk dikirim ke Qwen sekaligus
  const isianItems = questions
    .filter((q) => q.type === "ISIAN_SINGKAT")
    .map((q) => ({
      questionId: q.id,
      question: q.question,
      correctAnswer: q.answer,
      studentAnswer: answerMap.get(q.id) ?? "",
    }))
    .filter((item) => item.studentAnswer.trim() !== "");

  const isianResults = await gradeIsianBatch(isianItems);

  const results: AnswerResult[] = questions.map((q) => {
    const userAnswer = answerMap.get(q.id) ?? "";
    let isCorrect: boolean;

    if (q.type === "BENAR_SALAH") {
      isCorrect = gradeBenarSalah(userAnswer, q.answer);
    } else {
      // Kalau tidak dijawab → salah. Kalau dijawab → pakai hasil Qwen
      isCorrect = userAnswer.trim() ? (isianResults.get(q.id) ?? false) : false;
    }

    return { questionId: q.id, userAnswer, isCorrect, correctAnswer: q.answer };
  });

  const correctCount = results.filter((r) => r.isCorrect).length;
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  return { score, correctCount, totalQuestions: questions.length, answers: results };
}
