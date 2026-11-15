import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import DashboardMaterialList from "@/components/admin/DashboardMaterialList";
import { BookOrange, Compass, TeacherFigure, NAVY } from "@/components/ui/HistoryDecor";

export default async function AdminDashboard() {
  const materials = await prisma.material.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      filename: true,
      _count: { select: { questions: true } },
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          lessons: { select: { warnings: true, _count: { select: { lessonQuestions: true } } } },
        },
      },
    },
  });

  const [lessonQ, lessonQReady, challengeQ, challengeQReady] = await Promise.all([
    prisma.lessonQuestion.count(),
    prisma.lessonQuestion.count({ where: { hints: { not: Prisma.DbNull } } }),
    prisma.question.count(),
    prisma.question.count({ where: { hints: { not: Prisma.DbNull } } }),
  ]);

  // Lesson plan terbaru tiap materi (sama dengan yang dibaca siswa)
  const plans = materials
    .filter((m) => m.lessonPlans.length > 0)
    .map((m) => {
      const lp = m.lessonPlans[0];
      return {
        id: lp.id,
        title: m.title,
        lessonCount: lp.lessons.length,
        withQuestions: lp.lessons.filter((l) => l._count.lessonQuestions > 0).length,
        needReview: lp.lessons.filter((l) => Array.isArray(l.warnings) && l.warnings.length > 0).length,
      };
    });

  const totalLessons = plans.reduce((s, p) => s + p.lessonCount, 0);
  const lessonsWithQ = plans.reduce((s, p) => s + p.withQuestions, 0);
  const totalQ = lessonQ + challengeQ;
  const readyQ = lessonQReady + challengeQReady;

  return (
    <div>
      <h1 className="mb-7 text-2xl font-bold sm:text-[1.75rem]" style={{ color: NAVY }}>
        Dashboard Guru (Admin)
      </h1>

      {/* Kartu statistik */}
      <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          value={totalLessons}
          label="Total Lesson"
          icon={<TeacherFigure size={46} />}
          progress={totalLessons ? lessonsWithQ / totalLessons : 0}
          caption={`${lessonsWithQ} dari ${totalLessons} lesson sudah punya soal`}
          href="/admin/lesson-plans"
        />
        <StatCard
          value={totalQ}
          label="Total Soal"
          icon={<BookOrange size={36} />}
          progress={totalQ ? readyQ / totalQ : 0}
          caption={`${readyQ} dari ${totalQ} soal petunjuknya siap`}
          href="/admin/questions"
        />
        <StatCard
          value={materials.length}
          label="Materi PDF"
          icon={<Compass size={38} />}
          progress={materials.length ? plans.length / materials.length : 0}
          caption={`${plans.length} dari ${materials.length} materi punya lesson plan`}
          href="/admin/materials"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(330px,1fr)]">
        {/* Materi PDF */}
        <section className="min-w-0 rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(29,43,79,0.07)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>
              Materi PDF
            </h2>
            <Link
              href="/admin/materials/upload"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#fcc76a] px-5 py-2.5 text-[15px] font-semibold text-[#1d2b4f] shadow-[0_4px_12px_rgba(252,199,106,0.55)] transition hover:brightness-105"
            >
              <span className="text-lg leading-none">+</span> Unggah PDF
            </Link>
          </div>
          <DashboardMaterialList
            initial={materials.map((m) => ({
              id: m.id,
              title: m.title,
              filename: m.filename,
              questionCount: m._count.questions,
              hasLessonPlan: m.lessonPlans.length > 0,
            }))}
          />
        </section>

        {/* Lesson Plans */}
        <section className="min-w-0 rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(29,43,79,0.07)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>
              Lesson Plans
            </h2>
            <Link href="/admin/lesson-plans/generate" className="text-sm font-semibold text-[#3577b5] hover:underline">
              + Buat baru
            </Link>
          </div>
          {plans.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
              Belum ada lesson plan.
            </p>
          ) : (
            <ul className="space-y-3">
              {plans.map((p) => (
                <li key={p.id} className="rounded-xl border-2 border-[#1d2b4f]/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-medium leading-snug text-[#1d2b4f]">Tema: {p.title}</p>
                    <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-[#fcc76a] px-2 text-sm font-bold text-[#1d2b4f]">
                      {p.lessonCount}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {p.lessonCount} lesson
                    {p.needReview > 0 && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                        {p.needReview} perlu ditinjau
                      </span>
                    )}
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="flex items-end gap-1.5" aria-hidden>
                      <BookOrange size={26} />
                      <Compass size={26} />
                    </span>
                    <Link
                      href={`/admin/lesson-plans/${p.id}`}
                      className="rounded-full border-2 border-[#1d2b4f] px-4 py-1.5 text-sm font-semibold text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white"
                    >
                      Lihat detail
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  progress,
  caption,
  href,
}: {
  value: number;
  label: string;
  icon: ReactNode;
  progress: number;
  caption: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border-[3px] border-[#1d2b4f] bg-white px-6 pb-6 pt-5 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className="absolute right-4 top-4">{icon}</span>
      <p className="flex items-baseline gap-2 pr-12" style={{ color: NAVY }}>
        <span className="text-5xl font-extrabold leading-none">{value}</span>
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
    </Link>
  );
}
