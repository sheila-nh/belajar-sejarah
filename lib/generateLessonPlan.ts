import { extractAndParseJSON } from "@/lib/jsonUtils";
import { splitIntoSegments, type Segment } from "@/lib/materialText";
import { ollamaPost } from "@/lib/ollamaClient";
import { checkFacts, countProblems, describeForTeacher, describeProblems } from "@/lib/factCheck";

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3:8b";

export type KeyTerm = { term: string; definition: string };

export type GeneratedLesson = {
  title: string;
  summary: string;
  keyPoints: string[];
  content: string;
  keyTerms: KeyTerm[];
  /** Masalah fakta yang tersisa setelah pemeriksaan otomatis — perlu ditinjau guru */
  warnings?: string[];
};

export type GeneratedLessonPlan = {
  title: string;
  lessons: GeneratedLesson[];
};

// Batas ukuran (karakter teks sumber) per lesson
const MAX_LESSON_CHARS = 14000; // > ini dipecah agar muat di konteks & tidak terlalu padat
const FULL_TEXT_OUTLINE_LIMIT = 24000; // materi ≤ ini dikirim utuh saat membuat outline

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callQwen(
  system: string,
  user: string,
  schema: object,
  maxTokens: number,
  temperature = 0.3
): Promise<string> {
  return callQwenChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    schema,
    maxTokens,
    temperature
  );
}

async function callQwenChat(
  messages: ChatMessage[],
  schema: object,
  maxTokens: number,
  temperature = 0.3
): Promise<string> {
  const json = await ollamaPost<{ message?: { content?: string } }>("/api/chat", {
    model: QWEN_MODEL,
    messages,
    format: schema, // structured output: JSON dijamin valid sesuai schema
    stream: false,
    think: false,
    options: {
      temperature,
      num_predict: maxTokens,
      num_ctx: 16384,
    },
  });
  return json.message?.content || "";
}

// ─── Fase 1: outline — Qwen menentukan batas lesson berdasarkan nomor segmen ───

type OutlineLesson = { title: string; tema: string; mulai: number };

const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    planTitle: { type: "string" },
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          tema: { type: "string" },
          mulai: { type: "integer" },
        },
        required: ["title", "tema", "mulai"],
      },
    },
  },
  required: ["planTitle", "lessons"],
};

function lessonCountRange(totalChars: number): [number, number] {
  const min = Math.min(8, Math.max(2, Math.round(totalChars / 5000)));
  const max = Math.min(10, Math.max(min + 2, Math.round(totalChars / 3000)));
  return [min, max];
}

export async function buildOutline(
  materialTitle: string,
  segments: Segment[]
): Promise<{ planTitle: string; lessons: OutlineLesson[] }> {
  const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
  const fullText = totalChars <= FULL_TEXT_OUTLINE_LIMIT;
  const [minL, maxL] = lessonCountRange(totalChars);

  const segmentList = segments
    .map((s, i) => {
      const body = fullText ? s.text : s.text.slice(0, 200).replace(/\s+/g, " ") + (s.text.length > 200 ? " …" : "");
      return `[S${i + 1}] (${s.text.length} karakter)\n${body}`;
    })
    .join("\n\n");

  const system =
    "Kamu adalah perancang kurikulum sejarah Indonesia untuk siswa SMA. Kamu membagi materi menjadi lesson yang temanya jelas, tidak tumpang-tindih, dan urut sesuai teks.";

  const user = `Berikut materi "${materialTitle}" yang sudah dipecah menjadi ${segments.length} segmen bernomor (S1 sampai S${segments.length}).${
    fullText ? "" : " Setiap segmen hanya ditampilkan awalnya saja."
  }

${segmentList}

=== TUGAS ===
Kelompokkan segmen-segmen di atas menjadi ${minL} sampai ${maxL} lesson.

ATURAN:
1. Setiap lesson adalah rangkaian segmen yang BERURUTAN. Untuk setiap lesson tulis "mulai" = nomor segmen pertamanya (angka saja, tanpa huruf S).
   - Lesson pertama mulai = 1.
   - Lesson berakhir tepat sebelum segmen "mulai" lesson berikutnya. Jadi tidak ada segmen yang terlewat atau dipakai dua kali.
   - Nilai "mulai" harus terus naik.
2. Satu lesson = SATU tema yang jelas, misalnya satu perlawanan/perang, satu tokoh, atau satu kelompok sebab/latar belakang. Jangan gabungkan dua peristiwa yang tidak berhubungan.
3. Letakkan batas lesson di segmen yang diawali judul bagian (contoh: "a. Perang Paderi", "2. Bentuk Perlawanan ..."), bukan di tengah pembahasan.
4. Jika satu tema sangat panjang (lebih dari ±${Math.round(MAX_LESSON_CHARS * 0.7)} karakter), bagi menjadi dua lesson dengan judul yang membedakan isinya (contoh: "Perang Aceh: Latar Belakang dan Awal Perang" dan "Perang Aceh: Perlawanan Teuku Umar dan Cut Nyak Dien").
5. Segmen pembuka atau pengantar yang pendek digabung ke lesson pertama, jangan dijadikan lesson sendiri.
6. "title": judul lesson yang spesifik, sesuai isi segmennya (bukan tebakan). Jangan memberi nomor pada judul.
7. "tema": satu kalimat yang menjelaskan cakupan lesson, termasuk tokoh/peristiwa utamanya.
8. "planTitle": judul keseluruhan yang deskriptif.`;

  const schema = {
    ...OUTLINE_SCHEMA,
    properties: {
      ...OUTLINE_SCHEMA.properties,
      lessons: { ...OUTLINE_SCHEMA.properties.lessons, minItems: minL, maxItems: maxL },
    },
  };

  let outline = extractAndParseJSON<{ planTitle: string; lessons: OutlineLesson[] }>(
    await callQwen(system, user, schema, 2048),
    "outline"
  );

  // Qwen kadang memberi terlalu sedikit lesson (mis. seluruh materi jadi 1 lesson) — ulangi sekali
  const count = Array.isArray(outline.lessons) ? outline.lessons.length : 0;
  if (count < minL) {
    console.warn(`[generateLessonPlan] outline hanya ${count} lesson (minimal ${minL}), mengulang...`);
    const retryUser = `${user}

PERHATIAN: jawabanmu sebelumnya hanya berisi ${count} lesson. Itu SALAH. Materi ini membahas beberapa tema/peristiwa berbeda (lihat judul-judul bagian seperti "a. ...", "b. ...", "2. ..."). Buat MINIMAL ${minL} lesson, masing-masing untuk satu tema.`;
    const retry = extractAndParseJSON<{ planTitle: string; lessons: OutlineLesson[] }>(
      await callQwen(system, retryUser, schema, 2048, 0.5),
      "outline (ulang)"
    );
    if (Array.isArray(retry.lessons) && retry.lessons.length > count) outline = retry;
  }

  return outline;
}

// ─── Normalisasi batas lesson: tanpa celah/tumpang-tindih, ukuran seimbang ────

export type LessonRange = { title: string; tema: string; start: number; end: number }; // end eksklusif

function headingTitle(seg: Segment): string {
  return seg.text.split("\n")[0].replace(/^(\d{1,2}|[a-zA-Z])\.\s*/, "").trim().slice(0, 100);
}

// ─── Outline deterministik dari judul sub-bab bernomor ("1. …", "2. …") ───────

const INTRO_OWN_LESSON_CHARS = 2000; // pengantar sebelum sub-bab 1 sepanjang ini dijadikan lesson sendiri
const SPLIT_BY_LETTER_CHARS = 9000; // sub-bab sepanjang ini dipecah per judul "a. …", "b. …"

function headingNumber(seg: Segment, re: RegExp): string | null {
  if (!seg.startsWithHeading) return null;
  const m = seg.text.split("\n")[0].match(re);
  return m ? m[1] : null;
}

/**
 * Bila teks punya judul sub-bab bernomor urut (1, 2, 3, …) — seperti buku teks — batas lesson
 * diambil langsung dari judul tersebut, tanpa bergantung pada pilihan Qwen.
 * Mengembalikan null bila struktur tidak jelas (dipakai fallback outline Qwen).
 */
export function headingOutline(segments: Segment[]): OutlineLesson[] | null {
  const charLen = (a: number, b: number) => segments.slice(a, b).reduce((n, x) => n + x.text.length, 0);

  // judul bernomor yang urut mulai dari 1
  const numbered: number[] = [];
  let expect = 1;
  segments.forEach((seg, i) => {
    const n = headingNumber(seg, /^(\d{1,2})\.\s+[A-Z]/);
    if (n && Number(n) === expect) {
      numbered.push(i);
      expect++;
    }
  });
  if (numbered.length < 2) return null;

  // { start, titleSeg }: titleSeg = segmen yang judulnya dipakai
  const starts: { start: number; title: string }[] = [];
  const introOwn = numbered[0] > 0 && charLen(0, numbered[0]) >= INTRO_OWN_LESSON_CHARS;
  if (introOwn) starts.push({ start: 0, title: "Pengantar" });
  numbered.forEach((s, k) =>
    starts.push({ start: k === 0 && !introOwn ? 0 : s, title: headingTitle(segments[s]) })
  );

  // pecah sub-bab yang panjang di judul berhuruf urut ("a. …", "b. …")
  const final: { start: number; title: string }[] = [];
  starts.forEach(({ start: s, title }, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].start : segments.length;
    final.push({ start: s, title });
    if (charLen(s, end) < SPLIT_BY_LETTER_CHARS) return;
    let letter = "a".charCodeAt(0);
    const subs: number[] = [];
    for (let i = s; i < end; i++) {
      const l = headingNumber(segments[i], /^([a-z])\.\s+[A-Z]/);
      if (l && l.charCodeAt(0) === letter) {
        subs.push(i);
        letter++;
      }
    }
    // "a." biasanya menempel di awal sub-bab; batas baru mulai dari "b."
    if (subs.length >= 2)
      final.push(...subs.filter((i) => i > s).map((i) => ({ start: i, title: headingTitle(segments[i]) })));
  });

  const lessons = final.map(({ start, title }) => ({ title, tema: "", mulai: start + 1 }));

  // struktur terlalu kasar dibanding panjang materi → serahkan ke Qwen
  const [minL] = lessonCountRange(charLen(0, segments.length));
  if (lessons.length < minL) return null;
  return lessons;
}

export function buildRanges(outline: OutlineLesson[], segments: Segment[]): LessonRange[] {
  const n = segments.length;
  const charLen = (r: { start: number; end: number }) =>
    segments.slice(r.start, r.end).reduce((s, x) => s + x.text.length, 0);

  // 1. Sanitasi: ubah ke 0-based, buang yang di luar jangkauan/duplikat, urutkan
  const seen = new Set<number>();
  const cleaned = outline
    .map((l) => ({ title: (l.title ?? "").trim(), tema: (l.tema ?? "").trim(), start: Math.round(Number(l.mulai)) - 1 }))
    .filter((l) => l.title && Number.isFinite(l.start) && l.start >= 0 && l.start < n)
    .sort((a, b) => a.start - b.start)
    .filter((l) => (seen.has(l.start) ? false : (seen.add(l.start), true)));

  if (cleaned.length === 0) throw new Error("Outline tidak memiliki batas lesson yang valid");
  cleaned[0].start = 0;

  let ranges: LessonRange[] = cleaned.map((l, i) => ({
    ...l,
    end: i + 1 < cleaned.length ? cleaned[i + 1].start : n,
  }));

  // 2. Geser batas yang jatuh di tengah pembahasan ke judul bagian tepat di sebelahnya (±1 segmen)
  for (let i = 1; i < ranges.length; i++) {
    const s = ranges[i].start;
    if (segments[s].startsWithHeading) continue;
    for (const d of [1, -1]) {
      const c = s + d;
      if (c > ranges[i - 1].start && c < ranges[i].end && segments[c]?.startsWithHeading) {
        ranges[i - 1].end = c;
        ranges[i].start = c;
        break;
      }
    }
  }

  // 3. Gabungkan lesson yang terlalu kecil ke tetangga yang lebih kecil
  const total = charLen({ start: 0, end: n });
  const minChars = Math.min(1500, (total / ranges.length) * 0.35);
  for (;;) {
    const idx = ranges.findIndex((r) => charLen(r) < minChars);
    if (idx === -1 || ranges.length <= 1) break;
    const left = idx > 0 ? idx - 1 : -1;
    const right = idx < ranges.length - 1 ? idx + 1 : -1;
    const target =
      left === -1 ? right : right === -1 ? left : charLen(ranges[left]) <= charLen(ranges[right]) ? left : right;
    const [a, b] = target < idx ? [target, idx] : [idx, target];
    const big = charLen(ranges[a]) >= charLen(ranges[b]) ? ranges[a] : ranges[b];
    ranges.splice(a, 2, {
      title: big.title,
      tema: [ranges[a].tema, ranges[b].tema].filter(Boolean).join(" "),
      start: ranges[a].start,
      end: ranges[b].end,
    });
  }

  // 4. Pecah lesson yang terlalu besar, utamakan di judul bagian dekat tengah
  const split: LessonRange[] = [];
  const queue = [...ranges];
  while (queue.length) {
    const r = queue.shift()!;
    if (charLen(r) <= MAX_LESSON_CHARS || r.end - r.start < 2) {
      split.push(r);
      continue;
    }
    const half = charLen(r) / 2;
    let best = -1;
    let bestScore = Infinity;
    let acc = 0;
    for (let k = r.start + 1; k < r.end; k++) {
      acc += segments[k - 1].text.length;
      const score = Math.abs(acc - half) * (segments[k].startsWithHeading ? 0.5 : 1);
      if (score < bestScore) { bestScore = score; best = k; }
    }
    const secondTitle = segments[best].startsWithHeading
      ? headingTitle(segments[best])
      : `${r.title} (Lanjutan)`;
    queue.unshift(
      { title: r.title, tema: r.tema, start: r.start, end: best },
      { title: secondTitle, tema: "", start: best, end: r.end }
    );
  }
  ranges = split;

  return ranges;
}

// ─── Fase 2: konten penuh untuk satu lesson ────────────────────────────────────

const LESSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    paragraphs: { type: "array", items: { type: "string" }, minItems: 3 },
    keyTerms: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, definition: { type: "string" } },
        required: ["term", "definition"],
      },
    },
  },
  required: ["title", "summary", "keyPoints", "paragraphs", "keyTerms"],
};

export async function buildLessonContent(
  materialTitle: string,
  ranges: LessonRange[],
  index: number,
  lessonText: string
): Promise<GeneratedLesson> {
  const lesson = ranges[index];
  const maxParagraphs = Math.max(3, Math.ceil(lessonText.length / 500));
  const others = ranges
    .map((r, i) => (i === index ? null : `- Lesson ${i + 1}: ${r.title}${r.tema ? ` — ${r.tema}` : ""}`))
    .filter(Boolean)
    .join("\n");

  const system =
    "Kamu adalah guru sejarah Indonesia yang menulis bahan bacaan untuk siswa SMA. Kamu hanya menggunakan fakta dari teks sumber yang diberikan dan menulis dengan bahasa Indonesia baku yang runtut dan mudah dipahami.";

  const user = `TEKS SUMBER (lesson ${index + 1} dari ${ranges.length}):
"""
${lessonText}
"""

Materi: "${materialTitle}"
Judul sementara lesson ini: "${lesson.title}"${lesson.tema ? `\nCakupan: ${lesson.tema}` : ""}

Lesson lain dalam materi ini (hanya sebagai konteks — jangan menambah penjelasan tentang topik-topik ini dari luar teks sumber):
${others || "- (tidak ada)"}

=== TUGAS ===
Tulis ulang TEKS SUMBER di atas menjadi bahan bacaan lesson.

ATURAN ISI:
1. Gunakan HANYA fakta yang tertulis di TEKS SUMBER. Jangan menambah tokoh, tanggal, angka, tempat, atau peristiwa dari pengetahuanmu sendiri.
2. Pertahankan semua nama tokoh, tanggal, angka, tempat, isi perjanjian, serta hubungan sebab-akibat yang ada di teks.
3. TEKS SUMBER sudah dipilih khusus untuk lesson ini, jadi SELURUH isinya wajib tersampaikan — termasuk bagian yang tidak sesuai dengan judul sementara di atas. Jangan melewatkan satu bagian pun (misalnya sub-bab tentang tokoh atau perlawanan lain).
4. Jika teks sumber mengulang informasi yang sama, tulis sekali saja.
5. Abaikan bagian yang bukan materi sejarah:
   - sapaan atau pertanyaan kepada pembaca (misal "Ayoo siapa yang bisa menjawab?", "Tahukah kalian ...?"), keterangan gambar/foto, dan header halaman;
   - paragraf pemantik tentang peristiwa atau tokoh MASA KINI yang hanya dipakai sebagai perbandingan (misal pandemi Covid-19, Pandawara Group, organisasi pelajar masa kini, acara peringatan tahun 2019). Jangan tulis fakta masa kini tersebut.
6. Perbaiki salah ketik yang jelas pada teks sumber (misal "hasuanudiin" → "Hasanuddin"), tetapi jangan mengubah fakta.
7. Bagian berlabel "Viva Historia (pengayaan):" adalah kisah pengayaan. Sampaikan isinya dalam paragraf tersendiri, tanpa menulis label tersebut.
8. Bagian berlabel "Kutipan dokumen:" (misal teks ikrar atau perjanjian) dikutip apa adanya dengan ejaan aslinya, dan diletakkan di paragraf yang membahas peristiwa terkait (misal ikrar Sumpah Pemuda di bagian Kongres Pemuda II), bukan di akhir.
9. Jika teks sumber terpotong atau tidak lengkap (misalnya tahun atau nama tidak disebut), tulis apa adanya. JANGAN melengkapinya dengan pengetahuanmu sendiri.
10. Jangan menulis paragraf penutup berisi kesimpulan, pesan moral, atau penilaian umum yang tidak ada di teks sumber.

FORMAT TIAP BAGIAN:
- "title": judul lesson yang mencakup SELURUH isi teks sumber (boleh sama dengan judul sementara jika sudah sesuai). Jika teks membahas dua peristiwa/tokoh, sebut keduanya. Contoh: "Perlawanan Fatahillah dan Rakyat Ternate terhadap Portugis". Jangan memberi nomor.
- "summary": 2–3 kalimat yang merangkum inti lesson.
- "keyPoints": 3–6 poin; tiap poin satu kalimat berisi fakta penting (siapa, apa, kapan, di mana, mengapa).
- "paragraphs": uraian lengkap sebagai daftar paragraf, urut secara kronologis atau sebab-akibat. Satu paragraf = satu gagasan (3–6 kalimat). Ini BUKAN ringkasan: semua informasi di teks sumber harus tersampaikan. Paling banyak ${maxParagraphs} paragraf. Jangan mengulang informasi yang sudah ditulis di paragraf lain dan jangan menambah paragraf pengisi.
- "keyTerms": 2–6 istilah penting yang muncul di teks (nama perjanjian, gelar, siasat, istilah khusus) beserta definisi singkat berdasarkan teks.`;

  const toLesson = (raw: string): GeneratedLesson => {
    const parsed = extractAndParseJSON<Omit<GeneratedLesson, "content"> & { paragraphs?: string[] }>(
      raw,
      `lesson "${lesson.title}"`
    );
    const paragraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
    return {
      title: parsed.title?.trim() || lesson.title,
      summary: parsed.summary ?? "",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
      content: paragraphs
        .map((p) => p.replace(/^\s*Viva Historia(\s*\(pengayaan\))?\s*:\s*/i, "").trim())
        .filter(Boolean)
        .join("\n\n"),
    };
  };
  const allText = (l: GeneratedLesson) =>
    [l.title, l.summary, ...l.keyPoints, l.content, ...l.keyTerms.map((t) => `${t.term} ${t.definition}`)].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const raw = await callQwenChat(messages, LESSON_SCHEMA, 6000);
  let best = toLesson(raw);
  let check = checkFacts(allText(best), lessonText);

  // Pemeriksaan angka/tanggal otomatis → minta perbaikan sekali bila ada masalah
  if (countProblems(check) > 0) {
    const feedback = describeProblems(check);
    console.warn(`[generateLessonPlan] lesson ${index + 1} perlu perbaikan:\n  ${feedback.join("\n  ")}`);
    try {
      const fixedRaw = await callQwenChat(
        [
          ...messages,
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `Periksa ulang jawabanmu terhadap TEKS SUMBER. Masalah yang ditemukan:\n- ${feedback.join(
              "\n- "
            )}\n\nTulis ulang SELURUH jawaban (format JSON yang sama) dengan masalah tersebut diperbaiki. Saat memasukkan tanggal/tahun yang terlewat, tulis peristiwanya PERSIS seperti di teks sumber — jangan menambah hubungan sebab-akibat atau klaim lain yang tidak tertulis. Semua aturan sebelumnya tetap berlaku.`,
          },
        ],
        LESSON_SCHEMA,
        6000,
        0.2
      );
      const fixed = toLesson(fixedRaw);
      const fixedCheck = checkFacts(allText(fixed), lessonText);
      if (countProblems(fixedCheck) <= countProblems(check) && fixed.content.length > best.content.length * 0.6) {
        best = fixed;
        check = fixedCheck;
      }
    } catch (err) {
      console.error(`[generateLessonPlan] perbaikan lesson ${index + 1} gagal:`, err);
    }
  }

  const warnings = describeForTeacher(check);
  if (warnings.length) console.warn(`[generateLessonPlan] lesson ${index + 1} masih bermasalah:\n  ${warnings.join("\n  ")}`);
  return { ...best, warnings };
}

// ─── Fungsi utama ──────────────────────────────────────────────────────────────

/**
 * @param materialTitle judul materi
 * @param cleanText teks materi yang sudah dibersihkan (lihat cleanPdfText di lib/materialText.ts)
 */
export async function generateLessonPlan(
  materialTitle: string,
  cleanText: string
): Promise<GeneratedLessonPlan> {
  const segments = splitIntoSegments(cleanText);
  if (segments.length === 0) throw new Error("Tidak ada konten untuk diproses");

  // Utamakan judul sub-bab bernomor; pakai outline Qwen bila strukturnya tidak memadai
  const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
  const fromHeadings = headingOutline(segments);
  let ranges = fromHeadings ? buildRanges(fromHeadings, segments) : null;
  if (ranges && ranges.length < lessonCountRange(totalChars)[0]) ranges = null;
  let planTitle = materialTitle;
  const usedHeadings = ranges !== null;

  if (!ranges) {
    const outline = await buildOutline(materialTitle, segments);
    if (!outline.lessons || outline.lessons.length === 0) {
      throw new Error("Gagal membuat outline lesson plan");
    }
    ranges = buildRanges(outline.lessons, segments);
    planTitle = outline.planTitle || materialTitle;
  }
  console.log(`[generateLessonPlan] outline dari ${usedHeadings ? "judul sub-bab" : "Qwen"}`);
  console.log(
    `[generateLessonPlan] ${segments.length} segmen → ${ranges.length} lesson:\n` +
      ranges
        .map((r, i) => {
          const chars = segments.slice(r.start, r.end).reduce((n, s) => n + s.text.length, 0);
          return `  ${i + 1}. S${r.start + 1}–S${r.end} (${chars} kar) ${r.title}`;
        })
        .join("\n")
  );

  const lessons: GeneratedLesson[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const lessonText = segments.slice(r.start, r.end).map((s) => s.text).join("\n\n");
    const content = await buildLessonContent(materialTitle, ranges, i, lessonText);

    lessons.push(content);
  }

  return { title: planTitle, lessons };
}
