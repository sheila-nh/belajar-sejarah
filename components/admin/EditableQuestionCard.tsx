"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackPreview } from "@/components/admin/FeedbackPreview";

type Props = {
  id: string;
  index: number;
  type: string;
  question: string;
  answer: string;
  apiPath: "questions" | "lesson-questions";
  hints?: unknown;
  explanation?: string | null;
  sourceQuote?: string | null;
};

export function EditableQuestionCard({ id, index, type, question, answer, apiPath, hints, explanation, sourceQuote }: Props) {
  const [editing, setEditing] = useState(false);
  const [editQ, setEditQ] = useState(question);
  const [editA, setEditA] = useState(answer);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function cancelEdit() {
    setEditing(false);
    setEditQ(question);
    setEditA(answer);
    setError("");
  }

  async function handleSave() {
    if (!editQ.trim() || !editA.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/${apiPath}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: editQ.trim(), answer: editA.trim() }),
    });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Hapus soal ini?")) return;
    setDeleting(true);
    await fetch(`/api/${apiPath}/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const typeBadge = (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
      type === "BENAR_SALAH" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
    }`}>
      {type === "BENAR_SALAH" ? "Benar/Salah" : "Isian Singkat"}
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      {!editing ? (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">{typeBadge}</div>
            <p className="text-gray-800 font-medium text-sm">{index + 1}. {question}</p>
            <p className="text-xs text-amber-700 mt-1">
              Jawaban: <span className="font-semibold">{answer}</span>
            </p>
            <FeedbackPreview
              key={`${question}|${answer}`}
              questionId={id}
              hints={hints ?? null}
              explanation={explanation ?? null}
              sourceQuote={sourceQuote ?? null}
            />
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              title="Edit soal"
              className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Hapus soal"
              className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">{typeBadge}</div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Soal</label>
            <textarea
              value={editQ}
              onChange={(e) => setEditQ(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Kunci Jawaban</label>
            <input
              type="text"
              value={editA}
              onChange={(e) => setEditA(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancelEdit(); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Soal "salah satu": pisahkan semua opsi dengan koma. Contoh: Kekayaan, Kejayaan, Agama
            </p>
          </div>
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !editQ.trim() || !editA.trim()}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              onClick={cancelEdit}
              className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1.5 rounded-lg transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
