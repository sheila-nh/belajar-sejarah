"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteMaterialButton({ id, variant = "text" }: { id: string; variant?: "text" | "icon" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Hapus materi ini? Semua chunk dan soal terkait juga akan dihapus.")) return;
    setLoading(true);
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleDelete}
        disabled={loading}
        title="Hapus materi"
        aria-label="Hapus materi"
        className="rounded-lg p-2 text-[#1d2b4f] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
    >
      {loading ? "..." : "Hapus"}
    </button>
  );
}
