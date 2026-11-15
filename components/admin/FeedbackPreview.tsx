"use client";

import { useCallback, useEffect, useState } from "react";

// Pasang dengan key yang berubah saat soal/jawaban berubah agar umpan balik lama tidak tertinggal.

type Feedback = { hints: string[]; explanation: string; quote: string | null };

type Props = {
  questionId: string;
  hints: unknown;
  explanation: string | null;
  sourceQuote: string | null;
};

function toFeedback(hints: unknown, explanation: string | null, quote: string | null): Feedback | null {
  if (!Array.isArray(hints) || hints.length !== 3 || !explanation) return null;
  return { hints: hints as string[], explanation, quote };
}

const STEPS = [
  { label: "Arah umum", when: "setelah salah ke-1", dot: "bg-amber-100 text-amber-700 ring-amber-200" },
  { label: "Lebih spesifik", when: "setelah salah ke-2", dot: "bg-amber-300 text-amber-900 ring-amber-300" },
  { label: "Kalimat dari buku", when: "setelah salah ke-3", dot: "bg-amber-600 text-white ring-amber-600" },
];

// Petunjuk 3 berbentuk "Lengkapi kalimat dari buku ini: …" / "Bandingkan … dengan kalimat dari buku ini: …"
function splitBookHint(hint: string): { lead: string; sentence: string } | null {
  const m = hint.match(/^([\s\S]*?kalimat dari buku ini):\s*([\s\S]+)$/i);
  return m ? { lead: m[1], sentence: m[2] } : null;
}

/** Tampilkan bagian kosong (____) sebagai kotak isian */
function WithBlanks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(_{3,})/).map((part, i) =>
        /^_{3,}$/.test(part) ? (
          <span
            key={i}
            className="inline-block align-baseline min-w-[4.5rem] mx-0.5 border-b-2 border-dashed border-amber-500 bg-amber-100/70 rounded-sm"
            aria-label="bagian kosong"
          >
            &nbsp;
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function FeedbackPreview({ questionId, hints, explanation, sourceQuote }: Props) {
  // Nilai dari induk (daftar soal memperbarui berkala) + hasil yang diambil/dibuat ulang di panel ini
  const fromProps = toFeedback(hints, explanation, sourceQuote);
  const [local, setFb] = useState<Feedback | null>(null);
  const fb = local ?? fromProps;
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Feedback>({ hints: ["", "", ""], explanation: "", quote: null });
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  function startEdit() {
    if (!fb) return;
    setDraft({ hints: [...fb.hints], explanation: fb.explanation, quote: fb.quote });
    setWarnings([]);
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/feedback/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await res.json().catch(() => ({}))) as { feedback?: Feedback; warnings?: string[]; error?: string };
    if (res.ok && data.feedback) {
      setFb(data.feedback);
      setWarnings(data.warnings ?? []);
      setEditing(false);
    } else {
      setError(data.error || "Gagal menyimpan.");
    }
    setSaving(false);
  }

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/feedback/${questionId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { feedback: Feedback | null };
    if (data.feedback) setFb(data.feedback);
  }, [questionId]);

  // Sedang disiapkan di latar belakang → cek berkala selama panel terbuka
  useEffect(() => {
    if (!open || fb || working) return;
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [open, fb, working, refresh]);

  async function generate(force: boolean) {
    if (force && !confirm("Buat ulang akan mengganti petunjuk dan penjelasan saat ini, termasuk hasil suntingan Anda. Lanjutkan?")) return;
    setWorking(true);
    setWarnings([]);
    setError("");
    const res = await fetch(`/api/feedback/${questionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = (await res.json().catch(() => ({}))) as { feedback?: Feedback | null; error?: string };
    if (res.ok && data.feedback) setFb(data.feedback);
    else setError(data.error || "Gagal membuat umpan balik.");
    setWorking(false);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !fb) refresh();
        }}
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-amber-700 transition"
      >
        <span aria-hidden>💡</span>
        Petunjuk berjenjang
        {fb ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-px text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Siap
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-1.5 py-px text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> Sedang disiapkan
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-xs">
          {!fb ? (
            <div className="flex flex-wrap items-center gap-2 text-gray-500">
              <p className="flex-1 min-w-[12rem]">
                {working
                  ? "Mencari kutipan buku dan menyusun petunjuk… (±20 detik)"
                  : "Umpan balik sedang disiapkan di latar belakang. Panel ini diperbarui otomatis."}
              </p>
              <button
                type="button"
                onClick={() => generate(false)}
                disabled={working}
                className="text-[11px] border border-amber-300 text-amber-800 hover:bg-amber-100 px-2.5 py-1 rounded-md transition disabled:opacity-50"
              >
                {working ? "Menyiapkan…" : "Siapkan sekarang"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[11px] text-gray-500">
                  {editing ? "Sunting petunjuk — perubahan langsung dipakai di kuis setelah disimpan." : "Yang dilihat pelajar saat jawabannya salah:"}
                </p>
                {!editing && (
                <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={working}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-amber-700 disabled:opacity-50 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" />
                  </svg>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => generate(true)}
                  disabled={working}
                  title="Cari ulang kutipan buku dan susun ulang petunjuk"
                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-amber-700 disabled:opacity-50 transition"
                >
                  <svg className={`w-3 h-3 ${working ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {working ? "Membuat ulang…" : "Buat ulang"}
                </button>
                </div>
                )}
              </div>

              {warnings.length > 0 && !editing && (
                <div className="mb-3 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-800">
                  <p className="font-semibold">Tersimpan, tetapi perlu dicek:</p>
                  <ul className="list-disc pl-4">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {editing ? (
                <div className="space-y-3">
                  {draft.hints.map((h, i) => (
                    <label key={i} className="block">
                      <span className="text-[10px] uppercase tracking-wide text-gray-400">
                        <span className="font-semibold text-amber-800">Petunjuk {i + 1} · {STEPS[i].label}</span> · {STEPS[i].when}
                      </span>
                      <textarea
                        value={h}
                        onChange={(e) => setDraft((d) => ({ ...d, hints: d.hints.map((x, j) => (j === i ? e.target.value : x)) }))}
                        rows={i === 2 ? 4 : 2}
                        className="mt-0.5 w-full border border-amber-200 bg-white rounded-md px-2.5 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y"
                      />
                    </label>
                  ))}
                  <p className="text-[10px] text-gray-400 -mt-1">
                    Tulis <code className="px-1 bg-white rounded">_____</code> (garis bawah) untuk bagian kosong yang harus dilengkapi pelajar. Petunjuk sebaiknya makin spesifik dari 1 ke 3.
                  </p>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">Penjelasan setelah menjawab</span>
                    <textarea
                      value={draft.explanation}
                      onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value }))}
                      rows={3}
                      className="mt-0.5 w-full border border-amber-200 bg-white rounded-md px-2.5 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y"
                    />
                    <span className="text-[10px] text-gray-400">Tanpa awalan — &ldquo;Tepat!&rdquo; / &ldquo;Perlu diketahui:&rdquo; ditambahkan otomatis.</span>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">📖 Kutipan dari buku (boleh dikosongkan)</span>
                    <textarea
                      value={draft.quote ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
                      rows={2}
                      className="mt-0.5 w-full border border-amber-200 bg-white rounded-md px-2.5 py-1.5 text-xs italic leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving || draft.hints.some((h) => !h.trim()) || !draft.explanation.trim()}
                      className="text-[11px] bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md transition disabled:opacity-50"
                    >
                      {saving ? "Menyimpan…" : "Simpan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setError(""); }}
                      className="text-[11px] border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1 rounded-md transition"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
              <>

              {/* Tangga petunjuk */}
              <ol className="relative space-y-3">
                <span aria-hidden className="absolute left-[9px] top-2 bottom-2 w-px bg-amber-200" />
                {fb.hints.map((hint, i) => {
                  const step = STEPS[i];
                  const book = i === 2 ? splitBookHint(hint) : null;
                  return (
                    <li key={i} className="relative flex gap-3">
                      <span className={`relative z-10 flex-shrink-0 w-[19px] h-[19px] rounded-full ring-2 ring-offset-1 ring-offset-amber-50 flex items-center justify-center text-[10px] font-bold ${step.dot}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          <span className="font-semibold text-amber-800">{step.label}</span> · {step.when}
                        </p>
                        {book ? (
                          <>
                            <p className="mt-0.5 text-gray-700">{book.lead}:</p>
                            <blockquote className="mt-1 border-l-2 border-amber-400 bg-white/80 rounded-r-md px-2.5 py-1.5 font-serif italic text-gray-800 leading-relaxed">
                              <WithBlanks text={book.sentence} />
                            </blockquote>
                          </>
                        ) : (
                          <p className="mt-0.5 text-gray-700 leading-relaxed">
                            <WithBlanks text={hint} />
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Setelah menjawab */}
              <div className="mt-4 pt-3 border-t border-amber-100">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Penjelasan setelah menjawab</p>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-px text-[10px]">
                    Benar → diawali &ldquo;Tepat!&rdquo;
                  </span>
                  <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-px text-[10px]">
                    Salah 4× → diawali &ldquo;Perlu diketahui:&rdquo;
                  </span>
                </div>
                <p className="text-gray-700 leading-relaxed">{fb.explanation}</p>
                {fb.quote && (
                  <div className="mt-2 bg-white/80 border border-gray-200 text-gray-700 rounded-md px-2.5 py-1.5">
                    <p className="font-semibold text-[11px] mb-0.5">📖 Dari buku:</p>
                    <p className="italic leading-relaxed">&ldquo;{fb.quote}&rdquo;</p>
                  </div>
                )}
              </div>
              </>
              )}
            </>
          )}
          {error && <p className="mt-2 text-red-600 text-[11px]">{error}</p>}
        </div>
      )}
    </div>
  );
}
