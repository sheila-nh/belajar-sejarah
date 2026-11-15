"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { id: string; lessonCount?: number; questionCount?: number; attemptCount?: number };

export default function DeleteLessonPlanButton({ id, lessonCount = 0, questionCount = 0, attemptCount = 0 }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    // Semua isi ikut terhapus (cascade di database): lesson → soal + petunjuk berjenjang → riwayat kuis
    const parts = [
      `${lessonCount} lesson`,
      `${questionCount} soal beserta petunjuk berjenjangnya`,
      ...(attemptCount > 0 ? [`${attemptCount} riwayat kuis pelajar (nilai akan hilang)`] : []),
    ];
    if (!confirm(`Hapus lesson plan ini?\n\nIkut terhapus permanen: ${parts.join(", ")}.`)) return;
    setLoading(true);
    await fetch(`/api/lesson-plans/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
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
