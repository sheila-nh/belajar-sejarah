"use client";

import { useEffect, useState } from "react";
import { FeedbackPreview } from "@/components/admin/FeedbackPreview";

type Question = {
  id: string;
  type: string;
  question: string;
  answer: string;
  hints?: unknown;
  explanation?: string | null;
  sourceQuote?: string | null;
};

export default function GenerateLessonQuestionButton({
  lessonId,
  initialCount,
}: {
  lessonId: string;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function fetchQuestions() {
    setFetching(true);
    const res = await fetch(`/api/lesson-questions?lessonId=${lessonId}`);
    if (res.ok) {
      const data: Question[] = await res.json();
      setQuestions(data);
      setCount(data.length);
    }
    setFetching(false);
  }

  // Umpan balik disiapkan di latar belakang setelah generate/edit → perbarui daftar sampai semua siap
  const pending = (questions ?? []).filter((q) => !Array.isArray(q.hints) || !q.explanation).length;
  useEffect(() => {
    if (!open || pending === 0) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/lesson-questions?lessonId=${lessonId}`);
      if (!res.ok) return;
      const fresh: Question[] = await res.json();
      const byId = new Map(fresh.map((q) => [q.id, q]));
      // hanya salin kolom umpan balik agar soal yang sedang diedit tidak tertimpa
      setQuestions((prev) =>
        (prev ?? []).map((q) => {
          const f = byId.get(q.id);
          return f ? { ...q, hints: f.hints, explanation: f.explanation, sourceQuote: f.sourceQuote } : q;
        })
      );
    }, 8_000);
    return () => clearInterval(t);
  }, [open, pending, lessonId]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && questions === null) await fetchQuestions();
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/lesson-questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, bsCount: 3, isCount: 7 }),
    });
    const text = await res.text();
    let data: Question[] | { error: string } = [];
    try { data = JSON.parse(text); } catch { /* non-json */ }

    if (res.ok && Array.isArray(data)) {
      setQuestions(data);
      setCount(data.length);
    } else {
      setError((data as { error: string }).error || "Gagal generate soal");
    }
    setLoading(false);
  }

  async function handleDeleteOne(id: string) {
    await fetch(`/api/lesson-questions/${id}`, { method: "DELETE" });
    const updated = (questions ?? []).filter((q) => q.id !== id);
    setQuestions(updated);
    setCount(updated.length);
  }

  async function handleDeleteAll() {
    if (!confirm(`Hapus semua ${count} soal untuk lesson ini?`)) return;
    await fetch(`/api/lesson-questions?lessonId=${lessonId}`, { method: "DELETE" });
    setQuestions([]);
    setCount(0);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setEditQ(q.question);
    setEditA(q.answer);
    setSaveError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQ("");
    setEditA("");
    setSaveError("");
  }

  async function handleSave(id: string) {
    if (!editQ.trim() || !editA.trim()) return;
    setSaving(true);
    setSaveError("");
    const res = await fetch(`/api/lesson-questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: editQ.trim(), answer: editA.trim() }),
    });
    if (res.ok) {
      setQuestions((prev) =>
        (prev ?? []).map((q) =>
          // umpan balik lama dihapus server dan disiapkan ulang di latar belakang
          q.id === id
            ? { ...q, question: editQ.trim(), answer: editA.trim(), hints: null, explanation: null, sourceQuote: null }
            : q
        )
      );
      cancelEdit();
    } else {
      const data = await res.json() as { error?: string };
      setSaveError(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  return (
    <div>
      {/* Trigger row: label kiri, tombol aksi kanan */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${count > 0 ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"}`}>
            {count}
          </span>
          Soal Lesson
          <svg
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="mt-3 border border-indigo-100 rounded-xl bg-indigo-50/50 p-4">
          {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-gray-600 flex-1">
              {count > 0 ? `${count} soal tersimpan` : "Belum ada soal untuk lesson ini."}
              {count > 0 && questions !== null && pending > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  menyiapkan petunjuk {questions.length - pending}/{questions.length}
                </span>
              )}
            </p>
            {count > 0 && (
              <button
                onClick={handleDeleteAll}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-2 py-1 rounded-lg transition"
              >
                Hapus semua
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading && (
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? "Generating..." : count > 0 ? "Generate Ulang" : "Generate Soal"}
            </button>
          </div>

          {fetching && <p className="text-xs text-gray-400 text-center py-2">Memuat soal...</p>}

          {!fetching && questions !== null && questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="bg-white rounded-lg p-3 text-xs">
                  {editingId === q.id ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 mb-1 block">Soal</label>
                        <textarea
                          value={editQ}
                          onChange={(e) => setEditQ(e.target.value)}
                          rows={3}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 mb-1 block">Kunci Jawaban</label>
                        <input
                          type="text"
                          value={editA}
                          onChange={(e) => setEditA(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSave(q.id); if (e.key === "Escape") cancelEdit(); }}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Soal "salah satu": pisahkan semua opsi dengan koma.
                        </p>
                      </div>
                      {saveError && <p className="text-red-600 text-[10px]">{saveError}</p>}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSave(q.id)}
                          disabled={saving || !editQ.trim() || !editA.trim()}
                          className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md transition disabled:opacity-50"
                        >
                          {saving ? "Menyimpan..." : "Simpan"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-[10px] border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1 rounded-md transition"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${q.type === "BENAR_SALAH" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            {q.type === "BENAR_SALAH" ? "B/S" : "Isian"}
                          </span>
                          <span className="text-gray-400">#{i + 1}</span>
                        </div>
                        <p className="text-gray-800 font-medium">{q.question}</p>
                        <p className="text-indigo-600 mt-0.5">Jawaban: {q.answer}</p>
                        <FeedbackPreview
                          key={`${q.question}|${q.answer}`}
                          questionId={q.id}
                          hints={q.hints ?? null}
                          explanation={q.explanation ?? null}
                          sourceQuote={q.sourceQuote ?? null}
                        />
                      </div>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(q)}
                          title="Edit soal"
                          className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteOne(q.id)}
                          title="Hapus soal"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!fetching && questions !== null && questions.length === 0 && count === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Belum ada soal. Klik Generate Soal untuk membuat.</p>
          )}
        </div>
      )}
    </div>
  );
}
