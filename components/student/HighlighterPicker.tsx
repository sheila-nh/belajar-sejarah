"use client";

import { useState, useEffect, useRef } from "react";
import { HIGHLIGHT_COLORS, setHighlightColorId } from "@/lib/highlight-color";
import { useHighlightColor } from "@/hooks/use-highlight-color";

export default function HighlighterPicker() {
  const [open, setOpen] = useState(false);
  const colorId = useHighlightColor();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const current = HIGHLIGHT_COLORS.find((c) => c.id === colorId) ?? HIGHLIGHT_COLORS[0];

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="flex flex-col items-end gap-3">
      {/* Color swatch panel */}
      {open && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Warna Highlight
          </p>
          <div className="flex gap-2">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.id}
                onClick={() => {
                  setHighlightColorId(color.id);
                  setOpen(false);
                }}
                title={color.label}
                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                  color.id === colorId
                    ? "border-gray-500 scale-110 shadow-md"
                    : "border-transparent hover:border-gray-300"
                }`}
                style={{ backgroundColor: color.swatch }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Tutup" : `Warna highlight: ${current.label}`}
        style={{ backgroundColor: current.swatch }}
        className="w-12 h-12 rounded-full shadow-lg border-2 border-white flex items-center justify-center transition-all hover:scale-105 hover:shadow-xl active:scale-95"
      >
        {/* Highlighter pen icon */}
        <svg
          className="w-5 h-5 text-gray-700"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M20.71 4.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12 3.75 3.75 3.12-3.12zM3 17.25V21h3.75L17 10.75l-3.75-3.75L3 17.25zm2.92 1.83-.17.17H4v-1.75l.17-.17 1 1-.25-.25 1 1z" />
        </svg>
      </button>
    </div>
  );
}
