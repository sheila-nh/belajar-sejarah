import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudentProgress } from "@/lib/studentProgress";
import MaterialProgressCard from "@/components/student/MaterialProgressCard";
import { BookOrange, Compass, StudentFigure, NAVY } from "@/components/ui/HistoryDecor";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

export default async function StudentDashboard() {
  const session = await auth();
  const user = session?.user as { id: string; name: string } | undefined;
  if (!user) redirect("/login");

  const progress = await getStudentProgress(user.id);
  const ready = progress.filter((m) => m.lessonCount > 0);

  const quizTotal = ready.reduce((s, m) => s + m.quizCount, 0);
  const quizPassed = ready.reduce((s, m) => s + m.passedCount, 0);
  const lessonTotal = ready.reduce((s, m) => s + m.lessonCount, 0);
  const attempted = ready.reduce((s, m) => s + m.attemptedCount, 0);
  const avgs = ready.filter((m) => m.avgBest !== null);
  const avgScore = avgs.length
    ? Math.round(avgs.reduce((s, m) => s + m.avgBest! * m.attemptedCount, 0) / attempted)
    : null;
  const unlocked = ready.filter((m) => m.challengeCount > 0 && m.challengeUnlocked).length;
  const withChallenge = ready.filter((m) => m.challengeCount > 0).length;

  // Materi untuk dilanjutkan: yang pertama belum tuntas
  const next = ready.find((m) => m.quizCount > 0 && m.passedCount < m.quizCount);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold sm:text-[1.75rem]" style={{ color: NAVY }}>
        Halo, {user.name}!
      </h1>
      <p className="mb-7 text-sm text-gray-600">Ayo lanjutkan perjalanan menelusuri sejarah Indonesia.</p>

      {/* Kartu statistik */}
      <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          value={`${quizPassed}/${quizTotal}`}
          label="Quiz Lulus"
          icon={<StudentFigure size={46} />}
          progress={quizTotal ? quizPassed / quizTotal : 0}
          caption={`dari ${lessonTotal} lesson · lulus bila skor ≥ ${LESSON_PASS_SCORE}`}
        />
        <StatCard
          value={avgScore ?? "–"}
          label="Rata-rata Skor"
          icon={<BookOrange size={36} />}
          progress={avgScore ? avgScore / 100 : 0}
          caption={attempted ? `skor terbaik dari ${attempted} quiz yang dikerjakan` : "belum ada quiz yang dikerjakan"}
        />
        <StatCard
          value={`${unlocked}/${withChallenge}`}
          label="Challenge Terbuka"
          icon={<Compass size={38} />}
          progress={withChallenge ? unlocked / withChallenge : 0}
          caption="lulus semua quiz satu materi untuk membuka challenge"
        />
      </div>

      {/* Lanjutkan belajar */}
      {next && next.nextLessonOrder !== null && (
        <Link
          href={`/student/materials/${next.id}?tab=lessons&lesson=${next.nextLessonOrder}`}
          className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#1d2b4f] px-6 py-5 text-white shadow-[0_8px_24px_rgba(29,43,79,0.25)] transition hover:brightness-110"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#fcc76a]">Lanjutkan belajar</p>
            <p className="mt-1 truncate text-lg font-semibold">
              Lesson {next.nextLessonOrder}: {next.nextLessonTitle}
            </p>
            <p className="truncate text-sm text-white/70">{next.title}</p>
          </div>
          <span className="rounded-full bg-[#fcc76a] px-5 py-2.5 text-[15px] font-bold text-[#1d2b4f]">Lanjutkan →</span>
        </Link>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(29,43,79,0.07)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold" style={{ color: NAVY }}>
            Materi Sejarah
          </h2>
          <Link href="/student/materials" className="text-sm font-semibold text-[#3577b5] hover:underline">
            Lihat semua →
          </Link>
        </div>
        {progress.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
            Belum ada materi. Tunggu guru mengunggah materi.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {progress.map((m, i) => (
              <MaterialProgressCard key={m.id} m={m} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  progress,
  caption,
}: {
  value: ReactNode;
  label: string;
  icon: ReactNode;
  progress: number;
  caption: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-[3px] border-[#1d2b4f] bg-white px-6 pb-6 pt-5">
      <span className="absolute right-4 top-4">{icon}</span>
      <p className="flex flex-wrap items-baseline gap-x-2 pr-12" style={{ color: NAVY }}>
        <span className="text-[2.6rem] font-extrabold leading-none">{value}</span>
        <span className="text-lg font-medium">{label}</span>
      </p>
      <div className="mt-4 flex items-center gap-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-[#3577b5]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{caption}</p>
      <span className="absolute inset-x-0 bottom-0 h-2 bg-[#fcc76a]" aria-hidden />
    </div>
  );
}
