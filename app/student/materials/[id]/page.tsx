import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { KeyTerm } from "@/lib/generateLessonPlan";
import LessonTtsPlayer from "@/components/student/LessonTtsPlayer";
import TtsWordBlock from "@/components/student/TtsWordBlock";
import TtsBulletList from "@/components/student/TtsBulletList";
import TtsTermGrid from "@/components/student/TtsTermGrid";
import TtsLabel from "@/components/student/TtsLabel";
import HighlighterPicker from "@/components/student/HighlighterPicker";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const session = await auth();
  const user = session?.user as { id: string } | undefined;
  if (!user) redirect("/login");

  const { id } = await params;
  const { lesson: lessonParam } = await searchParams;

  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      questions: { select: { id: true } },
      lessonPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: { _count: { select: { lessonQuestions: true } } },
          },
        },
      },
    },
  });

  if (!material) notFound();

  const lessonPlan = material.lessonPlans[0] ?? null;
  const activeLessonIndex = lessonParam ? parseInt(lessonParam) - 1 : 0;
  const activeLesson = lessonPlan?.lessons[activeLessonIndex] ?? lessonPlan?.lessons[0];

  // Ambil status quiz per lesson untuk user ini
  let quizStatusMap = new Map<string, number | null>(); // lessonId -> bestScore
  let challengeUnlocked = false;

  if (lessonPlan) {
    const lessonsWithQuiz = lessonPlan.lessons.filter((l) => l._count.lessonQuestions > 0);

    if (lessonsWithQuiz.length > 0) {
      const bestScores = await prisma.quizAttempt.groupBy({
        by: ["lessonId"],
        where: { userId: user.id, lessonId: { in: lessonsWithQuiz.map((l) => l.id) } },
        _max: { score: true },
      });
      quizStatusMap = new Map(bestScores.map((b) => [b.lessonId, b._max.score ?? null]));
      challengeUnlocked = lessonsWithQuiz.every((l) => (quizStatusMap.get(l.id) ?? 0) >= LESSON_PASS_SCORE);
    } else {
      // Tidak ada lesson yang punya soal → challenge terbuka langsung
      challengeUnlocked = material.questions.length > 0;
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/student/materials" aria-label="Kembali ke daftar materi"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1d2b4f] text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1d2b4f]">{material.title}</h1>
          <p className="text-sm text-gray-500">{lessonPlan ? `${lessonPlan.lessons.length} lesson` : material.filename}</p>
        </div>
      </div>

      {/* Materi belajar */}
      <>
          {!lessonPlan ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
              <p>Belum ada lesson plan untuk materi ini.</p>
            </div>
          ) : (
            <div className="flex gap-6">
              {/* Sidebar */}
              <aside className="w-60 flex-shrink-0 space-y-4">
                <nav className="space-y-1">
                  <p className="text-xs font-semibold text-[#3577b5] uppercase tracking-wide mb-2 px-1">
                    {lessonPlan.lessons.length} Lesson
                  </p>
                  {lessonPlan.lessons.map((lesson) => {
                    const hasQuiz = lesson._count.lessonQuestions > 0;
                    const best = hasQuiz ? (quizStatusMap.get(lesson.id) ?? null) : null;
                    const passed = hasQuiz && best !== null && best >= LESSON_PASS_SCORE;

                    return (
                      <Link key={lesson.id}
                        href={`/student/materials/${id}?tab=lessons&lesson=${lesson.order}`}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
                          activeLesson?.id === lesson.id ? "bg-[#1d2b4f] text-white font-medium shadow-md" : "text-[#1d2b4f] hover:bg-[#1d2b4f]/[0.07]"
                        }`}>
                        <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                          activeLesson?.id === lesson.id ? "bg-[#fcc76a] text-[#1d2b4f]" : "bg-white border border-[#1d2b4f]/30 text-[#1d2b4f]"
                        }`}>{lesson.order}</span>
                        <span className="leading-tight line-clamp-2 flex-1">{lesson.title}</span>
                        {passed && <span className="text-emerald-500 text-xs font-bold flex-shrink-0" title="Quiz lulus">✓</span>}
                        {hasQuiz && !passed && best !== null && (
                          <span className="text-[#f47a20] text-[10px] font-semibold flex-shrink-0" title="Skor terbaik">{best}</span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {/* Challenge status */}
                <div className={`rounded-xl p-3 text-center ${challengeUnlocked ? "bg-[#fcc76a]/25 border-2 border-[#fcc76a]" : "bg-white border-2 border-dashed border-gray-300"}`}>
                  {challengeUnlocked ? (
                    <>
                      <p className="text-xs font-bold text-[#1d2b4f] mb-2">🏆 Challenge Terbuka!</p>
                      <Link href={`/student/materials/${id}/challenge`}
                        className="text-xs bg-[#1d2b4f] hover:brightness-125 text-white px-3 py-2 rounded-full transition block font-semibold">
                        Mulai Challenge →
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-500 mb-1">🔒 Challenge Terkunci</p>
                      <p className="text-[10px] text-gray-500">Lulus semua quiz lesson (≥{LESSON_PASS_SCORE}) untuk membuka</p>
                    </>
                  )}
                </div>
              </aside>

              {/* Lesson content */}
              {activeLesson && (
                <div className="flex-1 min-w-0 space-y-5">
                  <div className="bg-white rounded-2xl border-2 border-[#1d2b4f]/80 shadow-[0_6px_24px_rgba(29,43,79,0.07)] overflow-hidden">
                    <div className="relative bg-[#1d2b4f] px-6 pb-5 pt-4">
                      <p className="text-[#fcc76a] text-xs font-semibold mb-0.5">
                        Lesson {activeLesson.order} dari {lessonPlan.lessons.length}
                      </p>
                      <h2 className="text-white font-bold text-xl">{activeLesson.title}</h2>
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[#fcc76a]" aria-hidden />
                    </div>

                    <div className="px-6 py-6 space-y-6">
                      <div className="bg-[#fcc76a]/15 border-l-4 border-[#fcc76a] rounded-r-lg px-4 py-3">
                        <TtsWordBlock
                          label="Ringkasan"
                          labelClassName="text-xs font-semibold text-[#1d2b4f] uppercase tracking-wide"
                          text={activeLesson.summary}
                          sectionId="summary"
                          className="text-gray-700 text-sm leading-relaxed"
                        />
                      </div>

                      {(activeLesson.keyPoints as string[]).length > 0 && (
                        <TtsBulletList
                          items={activeLesson.keyPoints as string[]}
                          sectionId="keypointsblock"
                        />
                      )}

                      <div>
                        <p className="text-xs font-semibold text-[#3577b5] uppercase tracking-wide mb-3">
                          <TtsLabel sectionId="penjelasanlabel">Penjelasan</TtsLabel>
                        </p>
                        <div className="space-y-3">
                          {activeLesson.content.split(/\n\n+/).map((para, i) => (
                            <TtsWordBlock
                              key={i}
                              text={para.trim()}
                              sectionId={`para-${i}`}
                              className="text-sm text-gray-700 leading-relaxed"
                            />
                          ))}
                        </div>
                      </div>

                      {(activeLesson.keyTerms as KeyTerm[]).length > 0 && (
                        <TtsTermGrid
                          terms={activeLesson.keyTerms as KeyTerm[]}
                          sectionId="termsblock"
                        />
                      )}
                    </div>
                  </div>

                  {/* Navigasi + tombol quiz */}
                  <div className="flex justify-between items-center">
                    {activeLesson.order > 1 ? (
                      <Link href={`/student/materials/${id}?tab=lessons&lesson=${activeLesson.order - 1}`}
                        className="text-sm font-semibold text-[#1d2b4f] border-2 border-[#1d2b4f] hover:bg-[#1d2b4f] hover:text-white px-4 py-2 rounded-full transition">
                        ← Lesson sebelumnya
                      </Link>
                    ) : <span />}

                    <div className="flex gap-2">
                      {/* Tombol quiz lesson jika ada soal */}
                      {activeLesson._count.lessonQuestions > 0 && (
                        <Link href={`/student/materials/${id}/lesson-quiz/${activeLesson.id}`}
                          className="text-sm font-semibold bg-[#fcc76a] hover:brightness-105 text-[#1d2b4f] px-4 py-2 rounded-full shadow-[0_4px_12px_rgba(252,199,106,0.5)] transition flex items-center gap-1.5">
                          {(() => {
                            const best = quizStatusMap.get(activeLesson.id) ?? null;
                            if (best !== null && best >= LESSON_PASS_SCORE) return <>✓ Quiz Selesai ({best})</>;
                            if (best !== null) return <>Ulangi Quiz ({best})</>;
                            return <>Kerjakan Quiz →</>;
                          })()}
                        </Link>
                      )}

                      {activeLesson.order < lessonPlan.lessons.length ? (
                        <Link href={`/student/materials/${id}?tab=lessons&lesson=${activeLesson.order + 1}`}
                          className="text-sm font-semibold bg-[#1d2b4f] hover:brightness-125 text-white px-4 py-2 rounded-full transition">
                          Lesson berikutnya →
                        </Link>
                      ) : challengeUnlocked ? (
                        <Link href={`/student/materials/${id}/challenge`}
                          className="text-sm font-semibold bg-[#1d2b4f] hover:brightness-125 text-white px-4 py-2 rounded-full transition">
                          🏆 Mulai Challenge →
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400 px-4 py-2">🔒 Challenge Terkunci</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      {/* Floating toolbar — bottom right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {activeLesson && (
          <LessonTtsPlayer
            lesson={{
              title: activeLesson.title,
              order: activeLesson.order,
              totalLessons: lessonPlan!.lessons.length,
              summary: activeLesson.summary,
              keyPoints: activeLesson.keyPoints as string[],
              content: activeLesson.content,
              keyTerms: activeLesson.keyTerms as KeyTerm[],
            }}
          />
        )}
        <HighlighterPicker />
      </div>
    </div>
  );
}
