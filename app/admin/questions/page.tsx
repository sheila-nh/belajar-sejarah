import { prisma } from "@/lib/db";
import Link from "next/link";
import { DeleteAllQuestionsButton } from "@/components/admin/DeleteQuestionButton";
import { EditableQuestionCard } from "@/components/admin/EditableQuestionCard";
import { FeedbackAutoRefresh } from "@/components/admin/FeedbackAutoRefresh";

export default async function QuestionsPage() {
  const questions = await prisma.question.findMany({
    orderBy: { createdAt: "asc" },
    include: { material: { select: { id: true, title: true } } },
  });

  const grouped = questions.reduce<Record<string, { materialTitle: string; materialId: string; questions: typeof questions }>>((acc, q) => {
    if (!acc[q.materialId]) {
      acc[q.materialId] = { materialTitle: q.material.title, materialId: q.materialId, questions: [] };
    }
    acc[q.materialId].questions.push(q);
    return acc;
  }, {});

  const groups = Object.values(grouped);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Soal Latihan</h1>
        <Link
          href="/admin/questions/generate"
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm"
        >
          + Generate Soal
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Belum ada soal.</p>
          <Link href="/admin/questions/generate" className="text-amber-600 hover:underline mt-2 inline-block">
            Generate soal pertama →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ materialId, materialTitle, questions: qs }) => (
            <section key={materialId}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-700">{materialTitle}</h2>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    {qs.length} soal
                    <FeedbackAutoRefresh
                      total={qs.length}
                      pending={qs.filter((q) => !Array.isArray(q.hints) || !q.explanation).length}
                    />
                  </p>
                </div>
                <DeleteAllQuestionsButton materialId={materialId} count={qs.length} />
              </div>

              <div className="space-y-2">
                {qs.map((q, i) => (
                  <EditableQuestionCard
                    key={q.id}
                    id={q.id}
                    index={i}
                    type={q.type}
                    question={q.question}
                    answer={q.answer}
                    hints={q.hints}
                    explanation={q.explanation}
                    sourceQuote={q.sourceQuote}
                    apiPath="questions"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
