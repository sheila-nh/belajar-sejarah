"use client";

import { useState } from "react";
import Link from "next/link";

export type QuizQuestion = {
  id: string;
  question: string;
  type: "BENAR_SALAH" | "ISIAN_SINGKAT";
};

type AnswerResult = {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer: string;
};

type QuizResult = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  answers: AnswerResult[];
};

export default function QuizPlayer({
  questions,
  submitUrl,
  extraBody,
  backUrl,
  nextUrl,
  nextLabel,
}: {
  questions: QuizQuestion[];
  submitUrl: string;
  extraBody: Record<string, string>;
  backUrl: string;
  nextUrl?: string;
  nextLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allAnswered = questions.every((q) => answers[q.id]?.trim());

  async function handleSubmit() {
    setLoading(true);
    setError("");
    const payload = questions.map((q) => ({ questionId: q.id, userAnswer: answers[q.id] ?? "" }));
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extraBody, answers: payload }),
    });
    const text = await res.text();
    let data: QuizResult & { error?: string } = { score: 0, correctCount: 0, totalQuestions: 0, passed: false, answers: [] };
    try { data = JSON.parse(text); } catch { /* */ }
    if (res.ok) setResult(data);
    else setError(data.error || "Terjadi kesalahan");
    setLoading(false);
  }

  if (result) {
    const resultMap = new Map(result.answers.map((a) => [a.questionId, a]));
    return (
      <div className="space-y-6">
        {/* Score card */}
        <div className={`rounded-2xl p-6 text-center ${result.passed ? "bg-green-50 border-2 border-green-200" : "bg-orange-50 border-2 border-orange-200"}`}>
          <div className={`text-6xl font-black mb-2 ${result.passed ? "text-green-600" : "text-orange-500"}`}>
            {result.score}
          </div>
          <p className="text-gray-600 font-medium">
            {result.correctCount} dari {result.totalQuestions} soal benar
          </p>
          <p className={`mt-3 text-sm font-semibold ${result.passed ? "text-green-700" : "text-orange-700"}`}>
            {result.passed ? "✓ Lulus! Nilai kamu di atas 70" : "Belum lulus. Nilai minimum 70"}
          </p>
        </div>

        {/* Review per soal */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const r = resultMap.get(q.id);
            return (
              <div key={q.id} className={`rounded-xl p-4 border ${r?.isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${r?.isCorrect ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                    {r?.isCorrect ? "✓" : "✗"}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{i + 1}. {q.question}</p>
                    <p className="text-xs mt-1">
                      <span className="text-gray-500">Jawaban kamu: </span>
                      <span className={r?.isCorrect ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                        {r?.userAnswer || "(tidak dijawab)"}
                      </span>
                    </p>
                    {!r?.isCorrect && (
                      <p className="text-xs mt-0.5">
                        <span className="text-gray-500">Jawaban benar: </span>
                        <span className="text-green-700 font-semibold">{r?.correctAnswer}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link href={backUrl} className="flex-1 text-center py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition">
            ← Kembali
          </Link>
          {result.passed && nextUrl && (
            <Link href={nextUrl} className="flex-1 text-center py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition">
              {nextLabel ?? "Lanjut →"}
            </Link>
          )}
          {!result.passed && (
            <button
              onClick={() => { setResult(null); setAnswers({}); }}
              className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
            >
              Coba Lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {questions.map((q, i) => (
        <div key={q.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-medium text-gray-800 mb-3">
            <span className="text-sky-600 font-bold">{i + 1}.</span> {q.question}
          </p>

          {q.type === "BENAR_SALAH" ? (
            <div className="flex gap-3">
              {["Benar", "Salah"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${
                    answers[q.id] === opt
                      ? opt === "Benar"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-red-400 bg-red-50 text-red-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Ketik jawaban kamu..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={loading || !allAnswered}
        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
      >
        {loading ? "Memeriksa jawaban..." : !allAnswered ? "Jawab semua soal terlebih dahulu" : "Kumpulkan Jawaban"}
      </button>
    </div>
  );
}
