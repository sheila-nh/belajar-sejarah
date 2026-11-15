"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Material = { id: string; title: string; _count: { chunks: number } };

export default function GenerateLessonPlanForm({
  materials,
  defaultMaterialId,
}: {
  materials: Material[];
  defaultMaterialId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResultId("");

    const form = e.currentTarget;
    const materialId = (form.elements.namedItem("materialId") as HTMLSelectElement).value;

    const res = await fetch("/api/lesson-plans/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });

    const text = await res.text();
    let data: { id?: string; error?: string } = {};
    try { data = JSON.parse(text); } catch { /* non-JSON */ }

    if (res.ok && data.id) {
      setResultId(data.id);
      router.refresh();
    } else {
      setError(data.error || "Gagal generate lesson plan. Coba lagi.");
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {resultId ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-1">Lesson Plan Berhasil Dibuat!</h3>
          <p className="text-gray-500 text-sm mb-6">Qwen telah memecah materi menjadi beberapa lesson yang terstruktur.</p>
          <div className="flex justify-center gap-3">
            <Link
              href={`/admin/lesson-plans/${resultId}`}
              className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg font-medium transition text-sm"
            >
              Preview Lesson Plan
            </Link>
            <Link
              href="/admin/lesson-plans"
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2 rounded-lg font-medium transition text-sm"
            >
              Lihat Semua
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Materi PDF</label>
            <select
              name="materialId"
              defaultValue={defaultMaterialId || ""}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">-- Pilih materi --</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id} disabled={m._count.chunks === 0}>
                  {m.title}{m._count.chunks === 0 ? " (belum diproses)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Apa yang akan dibuat?</p>
            <ul className="space-y-1 text-amber-700">
              <li>• 3–6 lesson sesuai kompleksitas materi</li>
              <li>• Setiap lesson: ringkasan, poin penting, penjelasan, istilah kunci</li>
              <li>• Bahasa Indonesia yang mudah dipahami pelajar</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Qwen sedang membuat lesson plan...
              </>
            ) : "Generate Lesson Plan dengan Qwen"}
          </button>

          {loading && (
            <p className="text-xs text-gray-400 text-center">
              Proses ini memerlukan 1–3 menit tergantung panjang materi...
            </p>
          )}
        </form>
      )}
    </div>
  );
}
