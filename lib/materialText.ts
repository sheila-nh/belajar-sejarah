// Pembersihan teks PDF modul dan pemecahan menjadi segmen bernomor.
// Dipakai oleh generateLessonPlan agar pembagian lesson berbasis batas paragraf/judul,
// bukan potongan 1000 karakter yang saling tumpang-tindih.

export type Segment = {
  text: string;
  /** true jika segmen diawali judul bagian (mis. "c. Perang Diponegoro") — kandidat batas lesson */
  startsWithHeading: boolean;
};

// Bagian modul yang bukan materi inti (mengulang materi atau berisi soal)
const SKIP_SECTION =
  /^[A-H]\.\s*(Tujuan|Rangkuman|Latihan|Evaluasi|Penilaian|Kunci|Pembahasan|Daftar\s+Pustaka|Glosarium|Refleksi|Petunjuk|Peta\s+Konsep|Identitas|Tugas|Lembar\s+Kerja)/i;
const KEEP_SECTION = /^([A-H]\.\s*Uraian\s+Materi|KEGIATAN\s+PEMBELAJARAN)/i;

const HEADING_LIKE = /^(\d{1,2}|[a-zA-Z])\.\s+\S/;
const BULLET = /^[•▪●◦\-–]\s*/;

// ─── Elemen tata letak buku (buku siswa Kemendikbud, dll.) ─────────────────────
const PAGE_NUM = /^\d{1,4}$/; // termasuk nomor ganda seperti "7575"
const CAPTION_START = /^Gambar\s+\d+(\.\d+)?\b/i;
const SOURCE_LINE = /^Sumber\s*:/i;
const SOURCE_END = /\(\d{4}[^)]*\)\s*\.?$/; // "... /Domain Publik (1921)"
const ACTIVITY_START = /^(AKTIVITAS\s+\d|Instruksi\s+tugas)/i;
const BOX_LABEL = /^(VIVA HISTORIA)$/i;
const LINK_HINT =
  /(kode\s+QR|memindai|https?:\/\/|referensi berikut|pada\s+(laman|tautan)|\b(buku|jurnal|referensi|video)\b.{0,40}\bberikut( ini)?\.?$)/i;
const SECTION_HEADING = /^(\d{1,2}|[A-H])\.\s+[A-Z]/;
// Kutipan sumber dalam teks: "(Iswanto, 2013: 456-458)", "(Noer 1980: 39 dan Abdullah, 2013)"
const INLINE_CITATION =
  /\s*\((?:[A-Z][\w'’.-]+(?:\s[A-Za-z][\w'’.-]+){0,3},?\s\d{4}(?::\s?[\d–-]+)?(?:\s*(?:dan|;)\s*)?)+\)/g;

/** "ABCABC" → "ABC" (header halaman yang tercetak dobel) */
function undouble(t: string): string {
  if (t.length >= 16 && t.length % 2 === 0) {
    const h = t.length / 2;
    if (t.slice(0, h) === t.slice(h)) return t.slice(0, h).trim();
  }
  return t;
}

function isUpperDocLine(t: string): boolean {
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 10) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= 0.85;
}

/**
 * Buang elemen tata letak yang bukan isi materi: nomor halaman, keterangan gambar
 * ("Gambar 2.10 … Sumber: … (2016)"), kotak tugas AKTIVITAS (kecuali kutipan dokumen
 * berhuruf kapital seperti ikrar Sumpah Pemuda), label kotak, serta ajakan membuka tautan/kode QR.
 */
function stripLayoutArtifacts(lines: string[]): string[] {
  const out: string[] = [];
  let mode: "normal" | "caption" | "source" | "skipToPage" | "activity" = "normal";
  let captionBuf: string[] = [];
  let modeLines = 0;
  let activityDoc: string[] = [];

  const endActivity = () => {
    if (activityDoc.length) out.push("", "Kutipan dokumen: " + activityDoc.join(" "), "");
    activityDoc = [];
  };

  for (const t of lines) {
    if (PAGE_NUM.test(t)) {
      // pergantian halaman menutup kotak aktivitas / tautan
      if (mode === "activity") endActivity();
      if (mode === "skipToPage" || mode === "activity") mode = "normal";
      continue;
    }
    modeLines++;

    switch (mode) {
      case "caption":
        if (SOURCE_LINE.test(t)) {
          captionBuf = [];
          mode = SOURCE_END.test(t) ? "normal" : "source";
          modeLines = 0;
        } else if (modeLines > 12) {
          // ternyata bukan keterangan gambar: kembalikan baris setelah "Gambar …"
          out.push(...captionBuf.slice(1), t);
          captionBuf = [];
          mode = "normal";
        } else {
          captionBuf.push(t);
        }
        continue;
      case "source":
        if (SOURCE_END.test(t) || modeLines > 4) mode = "normal";
        continue;
      case "skipToPage":
        if (modeLines > 20) { mode = "normal"; out.push(t); }
        continue;
      case "activity":
        // judul bagian berikutnya bisa berada di halaman yang sama dengan kotak aktivitas
        if (SECTION_HEADING.test(t) && t.length <= 50 && !/[,.;:!?]/.test(t.replace(/^\S+\s/, ""))) {
          endActivity();
          mode = "normal";
          break; // proses baris ini sebagai teks biasa
        }
        if (isUpperDocLine(t) && !ACTIVITY_START.test(t)) activityDoc.push(t);
        continue;
    }

    // mode normal
    if (CAPTION_START.test(t)) { mode = "caption"; captionBuf = [t]; modeLines = 0; continue; }
    if (SOURCE_LINE.test(t)) { mode = SOURCE_END.test(t) ? "normal" : "source"; modeLines = 0; continue; }
    if (ACTIVITY_START.test(t)) { mode = "activity"; modeLines = 0; continue; }
    if (BOX_LABEL.test(t)) { out.push("", "Viva Historia (pengayaan):"); continue; }
    if (/^Sumber$/i.test(t) || LINK_HINT.test(t)) {
      // buang juga awal kalimat ajakan di baris sebelumnya ("Untuk mengetahui …,")
      for (let k = 0; k < 3 && out.length && out[out.length - 1] && !/[.!?:"”)]$/.test(out[out.length - 1]); k++) {
        out.pop();
      }
      mode = "skipToPage";
      modeLines = 0;
      continue;
    }
    out.push(t);
  }
  if (mode === "activity") endActivity();
  return out;
}

/** Sambung judul bagian yang terpotong dua baris ("B. Kemunculan Embrio Kebangsaan dan" + "Nasionalisme Indonesia") */
function joinWrappedHeadings(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    const next = lines[i + 1];
    if (
      next &&
      HEADING_LIKE.test(t) && t.length <= 90 && !/[.,;:!?]$/.test(t) &&
      next.length <= 45 && /^[A-Z]/.test(next) && !HEADING_LIKE.test(next) && !/[.,;:!?]$/.test(next) &&
      !BULLET.test(next)
    ) {
      out.push(`${t} ${next}`);
      i++;
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Bersihkan teks mentah pdf-parse: buang header/footer berulang, bagian non-materi, dan sambung baris terpotong. */
export function cleanPdfText(raw: string): string {
  // Elemen tata letak dibuang lebih dulu: pola "Gambar #.#" / "Domain Publik (#)" juga berulang
  // dan akan terhapus filter header di bawah, sehingga batas keterangan gambar tak terdeteksi.
  const lines = stripLayoutArtifacts(
    raw
      .replace(/\r/g, "")
      .replace(/­/g, "-") // soft hyphen ("rempah­rempah") → tanda hubung biasa
      .split("\n")
      .map((l) => undouble(l.replace(/\s+/g, " ").trim()))
  );

  // Header/footer halaman: baris yang sama (abaikan angka halaman) muncul ≥3 kali
  const key = (l: string) => l.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const freq = new Map<string, number>();
  for (const l of lines) {
    const k = key(l);
    if (k.length >= 8) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const repeated = new Set([...freq].filter(([k, c]) => c >= 3 && k.length <= 150).map(([k]) => k));

  const hasModuleStructure = lines.some((l) => KEEP_SECTION.test(l));
  let keep = true;
  const sectioned: string[] = [];

  for (const t of lines) {
    if (t && repeated.has(key(t))) continue;

    if (hasModuleStructure) {
      if (KEEP_SECTION.test(t)) { keep = true; continue; }
      if (SKIP_SECTION.test(t)) { keep = false; continue; }
    }
    if (keep) sectioned.push(t);
  }

  const kept = joinWrappedHeadings(sectioned);

  // Susun ulang paragraf: baris kosong = paragraf baru; judul & butir daftar di baris sendiri
  const out: string[] = [];
  let para = "";
  const flush = () => {
    if (para.trim()) out.push(para.trim());
    para = "";
  };

  for (const t of kept) {
    if (!t) { flush(); continue; }
    const isHeading = HEADING_LIKE.test(t) && t.length <= 90 && !/[.,;:]$/.test(t);
    if (isHeading) {
      flush();
      out.push(t);
      continue;
    }
    if (BULLET.test(t) || HEADING_LIKE.test(t)) {
      if (para) para += "\n";
      para += t.replace(BULLET, "• ");
      continue;
    }
    if (!para) para = t;
    else if (/[A-Za-z]-$/.test(para)) para += t; // kata terpotong tanda hubung
    else para += " " + t;
  }
  flush();

  // Sambung paragraf yang terpotong pergantian halaman (berakhir tanpa tanda baca, lanjut huruf kecil)
  const joined: string[] = [];
  for (const p of out) {
    const prev = joined[joined.length - 1];
    if (prev && !/[.!?:;"')\]]$/.test(prev) && /^[a-z]/.test(p) && !HEADING_LIKE.test(p)) {
      joined[joined.length - 1] = prev + (/[A-Za-z]-$/.test(prev) ? "" : " ") + p;
    } else {
      joined.push(p);
    }
  }

  return joined.join("\n\n").replace(INLINE_CITATION, "").trim();
}

function splitLongParagraph(p: string, target: number): string[] {
  const sentences = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p];
  const parts: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > target) {
      parts.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Pecah teks bersih menjadi segmen ±targetSize karakter di batas paragraf.
 * Judul bagian selalu menempel ke segmen berikutnya dan diutamakan sebagai awal segmen.
 */
export function splitIntoSegments(cleanText: string, targetSize = 700): Segment[] {
  const MAX = Math.round(targetSize * 1.3);
  const MIN_BEFORE_HEADING = Math.round(targetSize * 0.4);

  const paras: { text: string; heading: boolean }[] = [];
  for (const p of cleanText.split(/\n{2,}/)) {
    const heading = HEADING_LIKE.test(p) && !p.includes("\n") && p.length <= 90 && !/[.,;:]$/.test(p);
    if (!heading && p.length > MAX * 1.5) {
      for (const part of splitLongParagraph(p, targetSize)) paras.push({ text: part, heading: false });
    } else {
      paras.push({ text: p, heading });
    }
  }

  const segments: Segment[] = [];
  let cur: { text: string; heading: boolean }[] = [];
  const len = () => cur.reduce((n, p) => n + p.text.length, 0);
  const close = () => {
    if (cur.length === 0) return;
    // jangan akhiri segmen dengan judul — pindahkan ke segmen berikutnya
    const carry: typeof cur = [];
    while (cur.length > 1 && cur[cur.length - 1].heading) carry.unshift(cur.pop()!);
    segments.push({ text: cur.map((p) => p.text).join("\n\n"), startsWithHeading: cur[0].heading });
    cur = carry;
  };

  for (const p of paras) {
    const l = len();
    const hasBody = cur.some((c) => !c.heading);
    if (hasBody && ((p.heading && l >= MIN_BEFORE_HEADING) || l + p.text.length > MAX)) close();
    cur.push(p);
  }
  close();
  if (cur.length) segments.push({ text: cur.map((p) => p.text).join("\n\n"), startsWithHeading: cur[0].heading });

  return segments.filter((s) => s.text.trim().length > 0);
}

/** Fallback bila file PDF tidak ada: gabungkan chunk sambil membuang bagian tumpang-tindih. */
export function mergeOverlappingChunks(chunks: string[]): string {
  let text = chunks[0] ?? "";
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    let overlap = 0;
    for (let k = Math.min(300, next.length, text.length); k >= 20; k--) {
      if (text.endsWith(next.slice(0, k))) { overlap = k; break; }
    }
    if (overlap === 0) {
      // chunk di-trim saat disimpan; cari awal chunk berikutnya di ekor teks
      const probe = next.slice(0, 40);
      const idx = probe.length >= 20 ? text.lastIndexOf(probe, text.length - 1) : -1;
      if (idx !== -1 && text.length - idx <= 300) {
        text = text.slice(0, idx) + next;
        continue;
      }
    }
    text += (overlap ? "" : "\n") + next.slice(overlap);
  }
  return text;
}
