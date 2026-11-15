import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import QuizPlayerOneByOne from "@/components/student/QuizPlayerOneByOne";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

const QUIZ_BS_COUNT = 1;
const QUIZ_IS_COUNT = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export default async function LessonQuizPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id: materialId, lessonId } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      lessonQuestions: { orderBy: { order: "asc" } },
      lessonPlan: { select: { materialId: true, lessons: { orderBy: { order: "asc" }, select: { id: true, order: true } } } },
    },
  });

  if (!lesson || lesson.lessonPlan.materialId !== materialId) notFound();

  if (lesson.lessonQuestions.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/student/materials/${materialId}?tab=lessons&lesson=${lesson.order}`} aria-label="Kembali" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1d2b4f] text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white">←</Link>
          <h1 className="text-xl font-bold text-[#1d2b4f]">Quiz: {lesson.title}</h1>
        </div>
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300 text-gray-500">
          <p>Soal untuk lesson ini belum tersedia.</p>
          <Link href={`/student/materials/${materialId}?tab=lessons&lesson=${lesson.order}`} className="text-[#3577b5] font-semibold hover:underline mt-2 inline-block">
            Kembali ke materi
          </Link>
        </div>
      </div>
    );
  }

  // Pisahkan per tipe lalu ambil acak sesuai kuota
  const allBs = lesson.lessonQuestions.filter((q) => q.type === "BENAR_SALAH");
  const allIs = lesson.lessonQuestions.filter((q) => q.type === "ISIAN_SINGKAT");

  const pickedBs = pickRandom(allBs, QUIZ_BS_COUNT);
  const pickedIs = pickRandom(allIs, QUIZ_IS_COUNT);

  // Jika salah satu tipe kurang, isi kekurangan dari tipe lain
  const totalTarget = QUIZ_BS_COUNT + QUIZ_IS_COUNT;
  const shortage = totalTarget - pickedBs.length - pickedIs.length;
  if (shortage > 0) {
    const usedBsIds = new Set(pickedBs.map((q) => q.id));
    const usedIsIds = new Set(pickedIs.map((q) => q.id));
    const remaining = lesson.lessonQuestions.filter(
      (q) => !usedBsIds.has(q.id) && !usedIsIds.has(q.id)
    );
    pickedIs.push(...pickRandom(remaining, shortage));
  }

  const questions = shuffle([...pickedBs, ...pickedIs]).map((q) => ({
    id: q.id,
    question: q.question,
    type: q.type as "BENAR_SALAH" | "ISIAN_SINGKAT",
  }));

  // Cari lesson berikutnya
  const lessonList = lesson.lessonPlan.lessons;
  const currentIdx = lessonList.findIndex((l) => l.id === lessonId);
  const nextLesson = lessonList[currentIdx + 1];
  const nextUrl = nextLesson
    ? `/student/materials/${materialId}?tab=lessons&lesson=${nextLesson.order}`
    : `/student/materials/${materialId}?tab=lessons`;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/student/materials/${materialId}?tab=lessons&lesson=${lesson.order}`} aria-label="Kembali" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1d2b4f] text-[#1d2b4f] transition hover:bg-[#1d2b4f] hover:text-white">←</Link>
        <div>
          <p className="text-xs text-[#3577b5] font-semibold uppercase tracking-wide">Quiz Lesson {lesson.order}</p>
          <h1 className="text-xl font-bold text-[#1d2b4f]">{lesson.title}</h1>
        </div>
      </div>

      <div className="bg-[#fcc76a]/20 border-l-4 border-[#fcc76a] rounded-r-lg px-4 py-3 mb-6 text-sm text-[#1d2b4f]">
        {questions.length} soal dipilih acak · Lulus bila benar minimal 4 dari 5 soal (nilai ≥ <strong>{LESSON_PASS_SCORE}</strong>)
      </div>

      <QuizPlayerOneByOne
        questions={questions}
        submitUrl="/api/quiz-attempts"
        extraBody={{ lessonId }}
        backUrl={`/student/materials/${materialId}?tab=lessons&lesson=${lesson.order}`}
        nextUrl={nextUrl}
        nextLabel={nextLesson ? `Pelajari Lesson ${nextLesson.order} →` : "Kembali ke Materi →"}
      />
    </div>
  );
}
