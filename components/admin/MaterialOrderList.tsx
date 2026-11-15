"use client";

import { useState } from "react";
import Link from "next/link";
import DeleteMaterialButton from "@/components/admin/DeleteMaterialButton";

type Material = {
  id: string;
  title: string;
  filename: string;
  order: number;
  createdAt: Date;
  _count: { chunks: number; questions: number };
};

export default function MaterialOrderList({ initialMaterials }: { initialMaterials: Material[] }) {
  const [materials, setMaterials] = useState(
    [...initialMaterials].sort((a, b) => a.order - b.order),
  );
  const [saving, setSaving] = useState(false);

  async function move(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= materials.length) return;

    const next = [...materials];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setMaterials(next);

    setSaving(true);
    try {
      await fetch("/api/materials/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((m) => m.id) }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {saving && (
        <p className="text-xs text-gray-400 text-right">Menyimpan urutan...</p>
      )}
      {materials.map((m, i) => (
        <div
          key={m.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4"
        >
          {/* Kontrol urutan */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              onClick={() => move(i, "up")}
              disabled={i === 0 || saving}
              title="Pindah ke atas"
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <span className="text-xs font-bold text-gray-400 text-center leading-none">
              {i + 1}
            </span>
            <button
              onClick={() => move(i, "down")}
              disabled={i === materials.length - 1 || saving}
              title="Pindah ke bawah"
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Info materi */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800">{m.title}</h3>
            <p className="text-sm text-gray-400 mt-0.5 truncate">{m.filename}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>{m._count.chunks} chunk</span>
              <span>{m._count.questions} soal</span>
              <span>{new Date(m.createdAt).toLocaleDateString("id-ID")}</span>
            </div>
          </div>

          {/* Aksi */}
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href={`/admin/questions/generate?materialId=${m.id}`}
              className="text-sm text-amber-600 border border-amber-300 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition"
            >
              Generate Soal
            </Link>
            <DeleteMaterialButton id={m.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
