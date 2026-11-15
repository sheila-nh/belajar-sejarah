"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteQuestionButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Hapus soal ini?")) return;
    setLoading(true);
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition disabled:opacity-40 flex-shrink-0"
    >
      {loading ? "..." : "Hapus"}
    </button>
  );
}

export function DeleteAllQuestionsButton({ materialId, count }: { materialId: string; count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Hapus semua ${count} soal untuk materi ini?`)) return;
    setLoading(true);
    await fetch(`/api/questions?materialId=${materialId}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition disabled:opacity-40 font-medium"
    >
      {loading ? "Menghapus..." : `Hapus semua (${count})`}
    </button>
  );
}
