"use client";

import { useState } from "react";
import Link from "next/link";
import DeleteMaterialButton from "@/components/admin/DeleteMaterialButton";

type Item = { id: string; title: string; filename: string; questionCount: number; hasLessonPlan: boolean };

const arrow = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/** Daftar materi ringkas di dashboard: urutan (naik/turun), buat soal, hapus. */
export default function DashboardMaterialList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
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

  if (items.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
        Belum ada materi. Unggah PDF untuk memulai.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-between px-2 text-[15px] font-semibold text-[#1d2b4f]">
        <span>Judul Materi</span>
        <span>{saving ? <span className="text-xs font-normal text-gray-400">Menyimpan urutan…</span> : "Aksi"}</span>
      </div>
      <ul className="space-y-3">
        {items.map((m, i) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-xl border-2 border-[#1d2b4f]/80 bg-white px-3 py-2.5 transition hover:shadow-md"
          >
            <PdfIcon />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[15px] font-medium leading-snug text-[#1d2b4f] sm:truncate" title={m.title}>
                {m.title}
              </p>
              <p className="truncate text-xs text-gray-500">
                {m.hasLessonPlan ? "Lesson plan siap" : "Belum ada lesson plan"} · {m.questionCount} soal latihan
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={
                  m.hasLessonPlan
                    ? `/admin/questions/generate?materialId=${m.id}`
                    : `/admin/lesson-plans/generate?materialId=${m.id}`
                }
                title={m.hasLessonPlan ? "Generate soal latihan" : "Generate lesson plan"}
                aria-label={m.hasLessonPlan ? "Generate soal latihan" : "Generate lesson plan"}
                className="rounded-lg p-2 text-[#1d2b4f] transition hover:bg-[#fcc76a]/30"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20l9.5-9.5M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
                  <path d="M19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z" />
                </svg>
              </Link>
              <DeleteMaterialButton id={m.id} variant="icon" />
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0 || saving}
                title="Pindah ke atas"
                aria-label="Pindah ke atas"
                className="ml-1 rounded-lg bg-[#1d2b4f] p-2 text-white transition hover:brightness-125 disabled:opacity-25"
              >
                {arrow("M12 19V5M6 11l6-6 6 6")}
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1 || saving}
                title="Pindah ke bawah"
                aria-label="Pindah ke bawah"
                className="rounded-lg bg-[#1d2b4f] p-2 text-white transition hover:brightness-125 disabled:opacity-25"
              >
                {arrow("M12 5v14M6 13l6 6 6-6")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg width="30" height="36" viewBox="0 0 30 36" className="shrink-0" aria-hidden>
      <path d="M4 2h15l8 8v22a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fbe3cc" stroke="#1d2b4f" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19 2v8h8" fill="#fff8ec" stroke="#1d2b4f" strokeWidth="1.8" strokeLinejoin="round" />
      <text x="5" y="25" fontSize="8" fontWeight="700" fill="#1d2b4f" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}
