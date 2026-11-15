"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Muat ulang data halaman (server component) berkala selama masih ada umpan balik soal yang disiapkan */
export function FeedbackAutoRefresh({ pending, total }: { pending: number; total: number }) {
  const router = useRouter();
  useEffect(() => {
    if (pending === 0) return;
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [pending, router]);

  if (pending === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      menyiapkan petunjuk {total - pending}/{total}
    </span>
  );
}
