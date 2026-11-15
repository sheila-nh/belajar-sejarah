"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GenerateLessonQuestionButton from "@/components/admin/GenerateLessonQuestionButton";

type KeyTerm = { term: string; definition: string };

type Lesson = {
  id: string;
  order: number;
  title: string;
  summary: string;
  keyPoints: string[];
  content: string;
  keyTerms: KeyTerm[];
  questionCount: number;
  /** Peringatan pemeriksa fakta otomatis; kosong = tidak perlu ditinjau */
  warnings: string[];
};

export default function EditableLessonCard({ lesson }: { lesson: Lesson }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary);
  const [keyPoints, setKeyPoints] = useState(lesson.keyPoints.join("\n"));
  const [content, setContent] = useState(lesson.content);
  const [keyTerms, setKeyTerms] = useState<KeyTerm[]>(lesson.keyTerms);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const router = useRouter();
  const needsReview = lesson.warnings.length > 0;

  async function markReviewed() {
    setMarkingReviewed(true);
    setError("");
    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warnings: [] }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error || "Gagal menandai lesson sebagai sudah ditinjau.");
    }
    setMarkingReviewed(false);
  }

  function cancelEdit() {
    setTitle(lesson.title);
    setSummary(lesson.summary);
    setKeyPoints(lesson.keyPoints.join("\n"));
    setContent(lesson.content);
    setKeyTerms(lesson.keyTerms);
    setError("");
    setEditing(false);
  }

  async function handleSave() {
    if (!title.trim() || !summary.trim() || !content.trim()) {
      setError("Judul, ringkasan, dan penjelasan tidak boleh kosong.");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        summary,
        keyPoints: keyPoints.split("\n").map((p) => p.trim()).filter(Boolean),
        content,
        keyTerms: keyTerms.filter((kt) => kt.term.trim()),
      }),
    });

    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error || "Gagal menyimpan perubahan.");
    }
    setSaving(false);
  }

  function addKeyTerm() {
    setKeyTerms([...keyTerms, { term: "", definition: "" }]);
  }

  function updateKeyTerm(i: number, field: "term" | "definition", value: string) {
    const updated = keyTerms.map((kt, idx) => idx === i ? { ...kt, [field]: value } : kt);
    setKeyTerms(updated);
  }

  function removeKeyTerm(i: number) {
    setKeyTerms(keyTerms.filter((_, idx) => idx !== i));
  }

  return (
    <div
      id={`lesson-${lesson.id}`}
      className={`bg-white rounded-2xl border shadow-sm ${needsReview ? "border-orange-300 ring-1 ring-orange-200" : "border-gray-100"}`}
    >
      {/* Header */}
      <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center justify-between gap-3 rounded-t-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-full bg-amber-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {lesson.order}
          </span>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 font-bold text-gray-800 text-lg border-b-2 border-amber-400 bg-transparent focus:outline-none py-0.5 min-w-0"
            />
          ) : (
            <h2 className="font-bold text-gray-800 text-lg truncate">{lesson.title}</h2>
          )}
          {needsReview && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Perlu ditinjau
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            disabled={saving}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium disabled:opacity-50 ${
              editing
                ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                : "border-amber-300 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {saving ? "Menyimpan..." : editing ? "Simpan" : "Edit"}
          </button>
          {editing && (
            <button
              onClick={cancelEdit}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              Batal
            </button>
          )}
        </div>
      </div>

      {/* Soal Lesson — row sendiri agar panel expand tidak terpotong */}
      {!editing && (
        <div className="border-b border-gray-100 px-6 py-3">
          <GenerateLessonQuestionButton
            lessonId={lesson.id}
            initialCount={lesson.questionCount}
          />
        </div>
      )}

      {/* Peringatan pemeriksa fakta otomatis */}
      {needsReview && (
        <div className="border-b border-orange-200 bg-orange-50 px-6 py-4">
          <p className="text-sm font-semibold text-orange-800 mb-1">Perlu ditinjau sebelum digunakan siswa</p>
          <p className="text-xs text-orange-700 mb-2">
            Pemeriksaan otomatis menemukan perbedaan antara lesson ini dan teks sumber:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-orange-900">
            {lesson.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="text-[11px] text-orange-700 mt-2">
            Pemeriksaan otomatis hanya mencakup angka, tahun, dan tanggal. Nama tokoh dan atribusi peristiwa tetap perlu dicek manual.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-800 hover:bg-orange-100 transition font-medium"
              >
                Perbaiki isi
              </button>
            )}
            <button
              onClick={markReviewed}
              disabled={markingReviewed || saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition font-medium disabled:opacity-50"
            >
              {markingReviewed ? "Menyimpan..." : "Tandai sudah ditinjau"}
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Ringkasan */}
        <div className="bg-sky-50 border-l-4 border-sky-400 rounded-r-lg px-4 py-3">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-1">Ringkasan</p>
          {editing ? (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full bg-white border border-sky-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
            />
          ) : (
            <p className="text-gray-700 text-sm leading-relaxed">{lesson.summary}</p>
          )}
        </div>

        {/* Poin Penting */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Poin Penting</p>
          {editing ? (
            <div>
              <textarea
                value={keyPoints}
                onChange={(e) => setKeyPoints(e.target.value)}
                rows={Math.max(4, keyPoints.split("\n").length + 1)}
                placeholder="Satu poin per baris"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
              />
              <p className="text-[11px] text-gray-400 mt-1">Satu poin per baris. Baris kosong diabaikan.</p>
            </div>
          ) : lesson.keyPoints.length > 0 ? (
            <ul className="space-y-1.5">
              {lesson.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 italic">Belum ada poin penting.</p>
          )}
        </div>

        {/* Penjelasan */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Penjelasan</p>
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
            />
          ) : (
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {lesson.content.split(/\n\n+/).map((para, i) => (
                <p key={i}>{para.trim()}</p>
              ))}
            </div>
          )}
        </div>

        {/* Istilah Kunci */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Istilah Kunci</p>
            {editing && (
              <button
                onClick={addKeyTerm}
                className="text-xs text-amber-700 border border-amber-300 hover:bg-amber-50 px-2 py-1 rounded-lg transition"
              >
                + Tambah
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-2">
              {keyTerms.length === 0 && (
                <p className="text-xs text-gray-400 italic">Belum ada istilah. Klik "+ Tambah" untuk menambahkan.</p>
              )}
              {keyTerms.map((kt, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    value={kt.term}
                    onChange={(e) => updateKeyTerm(i, "term", e.target.value)}
                    placeholder="Istilah"
                    className="w-36 flex-shrink-0 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <input
                    value={kt.definition}
                    onChange={(e) => updateKeyTerm(i, "definition", e.target.value)}
                    placeholder="Definisi"
                    className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => removeKeyTerm(i)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : lesson.keyTerms.length > 0 ? (
            <div className="space-y-2">
              {lesson.keyTerms.map((kt, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="font-semibold text-amber-700 min-w-[120px] flex-shrink-0">{kt.term}</span>
                  <span className="text-gray-600">{kt.definition}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Belum ada istilah kunci.</p>
          )}
        </div>
      </div>
    </div>
  );
}
