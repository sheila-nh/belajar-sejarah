"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Material = { id: string; title: true };

export default function GenerateForm({
  materials,
  defaultMaterialId,
}: {
  materials: { id: string; title: string }[];
  defaultMaterialId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ type: string; question: string; answer: string }[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult([]);

    const form = e.currentTarget;
    const materialId = (form.elements.namedItem("materialId") as HTMLSelectElement).value;

    const res = await fetch("/api/questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });

    if (res.ok) {
      const data = await res.json();
      setResult(data);
      router.refresh();
    } else {
      const text = await res.text();
      let message = "Gagal generate soal";
      try { message = JSON.parse(text).error || message; } catch { /* non-JSON */ }
      setError(message);
    }
    setLoading(false);
  }

  const bsResults = result.filter((q) => q.type === "BENAR_SALAH");
  const isResults = result.filter((q) => q.type === "ISIAN_SINGKAT");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Generate <strong>10 soal challenge</strong> (3 Benar/Salah + 7 Isian Singkat) secara otomatis dari konten tiap lesson plan — setiap lesson berkontribusi beberapa soal agar topik beragam dan tidak berulang.
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Materi</label>
          <select
            name="materialId"
            defaultValue={defaultMaterialId || ""}
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">-- Pilih materi --</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Generating soal dari lesson plan..." : "Generate 10 Soal Challenge"}
        </button>
      </form>

      {loading && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Qwen membaca setiap lesson satu per satu. Proses ini bisa memakan 2–5 menit tergantung jumlah lesson...
        </p>
      )}

      {result.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-5 space-y-5">
          <p className="font-semibold text-gray-700">{result.length} soal berhasil dibuat</p>

          {bsResults.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                Benar/Salah ({bsResults.length})
              </p>
              <div className="space-y-2">
                {bsResults.map((q, i) => (
                  <div key={i} className="bg-blue-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-800">{i + 1}. {q.question}</p>
                    <p className="text-xs text-blue-700 mt-1">Jawaban: {q.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isResults.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                Isian Singkat ({isResults.length})
              </p>
              <div className="space-y-2">
                {isResults.map((q, i) => (
                  <div key={i} className="bg-purple-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-800">{i + 1}. {q.question}</p>
                    <p className="text-xs text-purple-700 mt-1">Jawaban: {q.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
