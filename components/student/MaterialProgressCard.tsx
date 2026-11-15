import Link from "next/link";
import type { MaterialProgress } from "@/lib/studentProgress";
import { BookOrange, Compass } from "@/components/ui/HistoryDecor";

/** Kartu materi siswa: bingkai biru tua, lencana kuning, bilah kemajuan quiz, status challenge. */
export default function MaterialProgressCard({ m, index }: { m: MaterialProgress; index: number }) {
  const pct = m.quizCount ? Math.round((m.passedCount / m.quizCount) * 100) : 0;
  const done = m.quizCount > 0 && m.passedCount === m.quizCount;
  const href =
    m.nextLessonOrder !== null
      ? `/student/materials/${m.id}?tab=lessons&lesson=${m.nextLessonOrder}`
      : `/student/materials/${m.id}`;

  return (
    <div className="flex flex-col rounded-2xl border-2 border-[#1d2b4f]/80 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#3577b5]">Materi {index + 1}</p>
          <h3 className="mt-0.5 text-[17px] font-semibold leading-snug text-[#1d2b4f]">{m.title}</h3>
        </div>
        <span
          className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-[#fcc76a] px-2 text-sm font-bold text-[#1d2b4f]"
          title={`${m.lessonCount} lesson`}
        >
          {m.lessonCount}
        </span>
      </div>

      <p className="mt-1 text-sm text-gray-600">
        {m.lessonCount > 0 ? `${m.lessonCount} lesson` : "Materi belum siap"}
        {m.challengeCount > 0 && ` · ${m.challengeCount} soal challenge`}
      </p>

      {m.quizCount > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>
              Quiz lulus {m.passedCount}/{m.quizCount}
            </span>
            <span className="font-semibold text-[#1d2b4f]">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-[#3577b5]"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="flex items-end gap-1" aria-hidden>
            <BookOrange size={24} />
            <Compass size={24} />
          </span>
          {m.challengeCount > 0 &&
            (m.challengeUnlocked ? (
              <span className="rounded-full bg-[#fcc76a]/40 px-2.5 py-1 text-xs font-semibold text-[#1d2b4f]">🏆 Challenge terbuka</span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">🔒 Challenge terkunci</span>
            ))}
        </span>
        {m.lessonCount > 0 && (
          <Link
            href={href}
            className="rounded-full border-2 border-[#1d2b4f] px-4 py-1.5 text-sm font-semibold text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white"
          >
            {m.attemptedCount === 0 ? "Mulai belajar" : done ? "Lihat materi" : "Lanjutkan"}
          </Link>
        )}
      </div>
    </div>
  );
}
