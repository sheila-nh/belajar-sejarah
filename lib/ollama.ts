import { extractAndParseJSON } from "@/lib/jsonUtils";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3:8b";

export type GeneratedQuestion = {
  question: string;
  answer: string;
  type: "BENAR_SALAH" | "ISIAN_SINGKAT";
};

export async function generateQuestions(
  chunks: string[],
  bsCount: number,
  isCount: number
): Promise<GeneratedQuestion[]> {
  const context = chunks.join("\n\n---\n\n");
  const benarCount = Math.ceil(bsCount / 2);
  const salahCount = Math.floor(bsCount / 2);
  const total = bsCount + isCount;

  const prompt = `Kamu adalah guru sejarah yang ahli membuat soal evaluasi berkualitas tinggi.
Buat TEPAT ${total} soal (${bsCount} Benar/Salah + ${isCount} Isian Singkat) dari teks materi sejarah berikut.

⚠️ LARANGAN PENGULANGAN — WAJIB DIPATUHI:
Setiap soal HARUS menguji fakta, tokoh, atau peristiwa yang BERBEDA dari semua soal lainnya.
Jangan bertanya tentang tokoh atau kejadian yang sama meski dengan kalimat berbeda.
Sebar pertanyaan ke seluruh cakupan materi — jangan terfokus pada satu bagian saja.

⚠️ GROUNDING WAJIB:
Semua fakta dan jawaban HARUS bersumber langsung dari teks. Jangan mengarang fakta, nama, tanggal, atau peristiwa yang tidak ada dalam teks.
Jika soal menyebut peran tertentu (misal "pemimpin perlawanan rakyat X"), pastikan tokoh dalam jawaban memang memiliki peran tersebut — bukan tokoh dari pihak lawan.

═══ ATURAN SOAL ISIAN SINGKAT (${isCount} soal, type: "ISIAN_SINGKAT") ═══
1. Pertanyaan harus spesifik dan tidak ambigu:
   - Jika bertanya "siapa", sebutkan peran/pihak yang ditanyakan. BURUK: "Siapa pemimpin serangan?" BAIK: "Siapa pemimpin pasukan Demak yang menyerang Malaka pada 1513?"
   - Jika suatu fakta terdiri dari beberapa unsur (misal 3 motivasi), pilih salah satu cara:
     a) Tanyakan satu saja: "Sebutkan salah satu motivasi bangsa Eropa datang ke Indonesia!" → kunci jawaban: SEMUA opsi dipisah koma: "Kekayaan, Kejayaan, Agama"
     b) Tanyakan semua: "Sebutkan tiga motivasi bangsa Eropa datang ke Indonesia!" → kunci jawaban: semua unsur dipisah koma: "Kekayaan, Kejayaan, Agama"
2. Satu soal hanya menguji satu fakta yang jelas. Jawaban tidak lebih dari 10 kata.

⚠️ ATURAN KRITIS — KUNCI JAWABAN "SALAH SATU":
Jika soal menggunakan kata "salah satu", kunci jawaban WAJIB memuat SEMUA opsi yang valid dipisah koma.
  ❌ SALAH → soal: "Sebutkan salah satu motivasi bangsa Eropa!" | jawaban: "Agama"
  ✓ BENAR  → soal: "Sebutkan salah satu motivasi bangsa Eropa!" | jawaban: "Kekayaan, Kejayaan, Agama"

═══ ATURAN SOAL BENAR/SALAH (${benarCount} jawaban "Benar", ${salahCount} jawaban "Salah", type: "BENAR_SALAH") ═══
1. Pernyataan harus lengkap dan mengandung konteks cukup — pembaca harus tahu siapa melakukan apa kepada siapa dan kapan.
   BURUK: "Serangan ke Malaka berhasil." BAIK: "Serangan Adipati Unus dari Demak ke Malaka tahun 1513 berhasil mengusir Portugis."
2. Soal jawaban "Salah": ubah TEPAT SATU fakta terverifikasi (angka, nama tokoh, nama tempat, atau tanggal) menjadi keliru. Fakta lain tetap benar.
3. Jangan buat pernyataan yang ambigu, terlalu umum, atau subjektif.

Balas HANYA dengan JSON array, tanpa teks lain, tanpa markdown:
[{"type":"BENAR_SALAH","question":"...","answer":"Benar"},{"type":"ISIAN_SINGKAT","question":"...","answer":"..."}]

Teks materi:
${context}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: QWEN_MODEL,
      prompt,
      stream: false,
      think: false,
      options: { temperature: 0.5, num_predict: 4000 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama generate error: ${res.statusText}`);

  const json = await res.json();
  const raw: string = json.response || "";

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Tidak ada JSON array dalam respons Qwen");

  const wrapped = `{"items":${jsonMatch[0]}}`;
  const result = extractAndParseJSON<{ items: GeneratedQuestion[] }>(wrapped, "questions");
  return (result.items ?? []).slice(0, total);
}
