import { prisma } from "@/lib/db";
import Link from "next/link";
import DeleteLessonPlanButton from "@/components/admin/DeleteLessonPlanButton";

export default async function LessonPlansPage() {
  const lessonPlans = await prisma.lessonPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      material: { select: { title: true } },
      _count: { select: { lessons: true } },
      lessons: { select: { warnings: true, _count: { select: { lessonQuestions: true, quizAttempts: true } } } },
    },
  });
  const reviewCount = (lessons: { warnings: unknown }[]) =>
    lessons.filter((l) => Array.isArray(l.warnings) && l.warnings.length > 0).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lesson Plan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Materi pembelajaran yang telah dipecah menjadi konten kecil</p>
        </div>
        <Link
          href="/admin/lesson-plans/generate"
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm"
        >
          + Generate Lesson Plan
        </Link>
      </div>

      {lessonPlans.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
          <p className="text-lg">Belum ada lesson plan.</p>
          <Link href="/admin/lesson-plans/generate" className="text-amber-600 hover:underline mt-2 inline-block">
            Generate lesson plan pertama →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {lessonPlans.map((lp) => (
            <div key={lp.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-600 font-medium mb-1">{lp.material.title}</p>
                  <h3 className="font-semibold text-gray-800 text-lg leading-snug">{lp.title}</h3>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-[10px]">{lp._count.lessons}</span>
                      lesson
                    </span>
                    <span>{new Date(lp.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                    {reviewCount(lp.lessons) > 0 && (
                      <span className="text-orange-700 bg-orange-100 border border-orange-200 font-semibold px-2 py-0.5 rounded-full">
                        {reviewCount(lp.lessons)} lesson perlu ditinjau
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/lesson-plans/${lp.id}`}
                    className="text-sm text-amber-600 border border-amber-300 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition"
                  >
                    Preview
                  </Link>
                  <DeleteLessonPlanButton
                    id={lp.id}
                    lessonCount={lp._count.lessons}
                    questionCount={lp.lessons.reduce((n, l) => n + l._count.lessonQuestions, 0)}
                    attemptCount={lp.lessons.reduce((n, l) => n + l._count.quizAttempts, 0)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
