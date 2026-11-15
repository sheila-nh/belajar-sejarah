import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { KeyTerm } from "@/lib/generateLessonPlan";
import EditableLessonCard from "@/components/admin/EditableLessonCard";

export default async function LessonPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lp = await prisma.lessonPlan.findUnique({
    where: { id },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: { _count: { select: { lessonQuestions: true } } },
      },
      material: { select: { title: true } },
    },
  });

  if (!lp) notFound();

  const warningsOf = (w: unknown) => (Array.isArray(w) ? (w as string[]) : []);
  const needReview = lp.lessons.filter((l) => warningsOf(l.warnings).length > 0);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/lesson-plans" className="text-gray-400 hover:text-gray-600">←</Link>
        <span className="text-xs text-amber-600 font-medium">{lp.material.title}</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{lp.title}</h1>
      <p className={`text-sm text-gray-400 ${needReview.length ? "mb-4" : "mb-8"}`}>{lp.lessons.length} lesson · Klik "Edit" pada lesson untuk mengoreksi isi</p>

      {needReview.length > 0 && (
        <div className="mb-8 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-semibold">{needReview.length} lesson perlu ditinjau</p>
          <p className="text-xs text-orange-700 mt-0.5 mb-2">
            Pemeriksaan otomatis menemukan angka atau tanggal yang berbeda dari teks sumber.
          </p>
          <div className="flex flex-wrap gap-2">
            {needReview.map((l) => (
              <a
                key={l.id}
                href={`#lesson-${l.id}`}
                className="text-xs bg-white border border-orange-300 text-orange-800 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition"
              >
                {l.order}. {l.title}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {lp.lessons.map((lesson) => (
          <EditableLessonCard
            key={lesson.id}
            lesson={{
              id: lesson.id,
              order: lesson.order,
              title: lesson.title,
              summary: lesson.summary,
              keyPoints: lesson.keyPoints as string[],
              content: lesson.content,
              keyTerms: lesson.keyTerms as KeyTerm[],
              questionCount: lesson._count.lessonQuestions,
              warnings: warningsOf(lesson.warnings),
            }}
          />
        ))}
      </div>
    </div>
  );
}
