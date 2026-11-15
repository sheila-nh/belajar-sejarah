"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { fetchTts } from "@/lib/tts-session";
import { LESSON_PASS_SCORE } from "@/lib/quizRules";

export type QuizQuestion = {
  id: string;
  question: string;
  type: "BENAR_SALAH" | "ISIAN_SINGKAT";
};

type QuestionRecord = {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer: string;
};

type FinalResult = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  answers: QuestionRecord[];
};

const MAX_ATTEMPTS = 4;
const FALLBACK_HINTS = [
  "Coba baca kembali materi pada lesson ini dan fokus pada tema utama soal.",
  "Perhatikan kata kunci dalam pertanyaan — ia mengarah ke satu konsep atau fakta spesifik.",
  "Jawaban ada dalam materi yang sudah kamu pelajari. Pikirkan nama, tanggal, atau istilah penting yang berkaitan.",
];

export default function QuizPlayerOneByOne({
  questions,
  submitUrl,
  extraBody,
  passScore = LESSON_PASS_SCORE,
  backUrl,
  nextUrl,
  nextLabel,
}: {
  questions: QuizQuestion[];
  submitUrl: string;
  extraBody: Record<string, string>;
  /** batas lulus (default quiz lesson) */
  passScore?: number;
  backUrl: string;
  nextUrl?: string;
  nextLabel?: string;
}) {
  // State per soal
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState("");
  const [confirmCorrect, setConfirmCorrect] = useState("");
  const [confirmWrong, setConfirmWrong] = useState("");
  // kalimat asli dari buku sebagai bukti jawaban (dari RAG)
  const [sourceQuote, setSourceQuote] = useState<string | null>(null);

  // State quiz keseluruhan
  const [records, setRecords] = useState<QuestionRecord[]>([]);
  const [phase, setPhase] = useState<"quiz" | "summary" | "result">("quiz");
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // TTS state
  const [speaking, setSpeaking] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<"edge" | "piper">("edge");
  const ttsProviderRef = useRef<"edge" | "piper">("edge");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  // Tracks which hint index (1-3) was last spoken, to avoid re-reading on re-render
  const lastSpokenHintRef = useRef(0);
  // Tracks whether the confirmation was spoken ("correct" | "wrong" | "")
  const lastSpokenConfirmRef = useRef<"" | "correct" | "wrong">("");

  // STT state
  const [recording, setRecording] = useState(false);
  const [sttLoading, setSttLoading] = useState(false);
  const [sttError, setSttError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const q = questions[qIdx] ?? null;
  const isExhausted = attempts >= MAX_ATTEMPTS && lastCorrect === false;

  // Hydrate TTS provider preference from localStorage (client-only)
  useEffect(() => {
    const stored = localStorage.getItem("tts-provider");
    if (stored === "piper" || stored === "edge") {
      setTtsProvider(stored);
      ttsProviderRef.current = stored;
    }
  }, []);

  function toggleTtsProvider() {
    const next = ttsProviderRef.current === "edge" ? "piper" : "edge";
    ttsProviderRef.current = next;
    setTtsProvider(next);
    localStorage.setItem("tts-provider", next);
  }

  // TTS helpers
  const stopSpeaking = useCallback(() => {
    // Batalkan fetch yang sedang berjalan agar tidak memutar audio lama setelah selesai
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speakText = useCallback(async (text: string) => {
    stopSpeaking();
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    setSpeaking(true);
    try {
      // "_____" pada petunjuk isian dibaca sebagai "titik-titik"
      const result = await fetchTts(text.replace(/_{3,}/g, "titik-titik"), controller.signal);
      if (!result || controller.signal.aborted) { setSpeaking(false); return; }
      const url = URL.createObjectURL(result.blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await audio.play();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSpeaking(false);
    }
  }, [stopSpeaking]);

  // Auto-play soal + pre-fetch hints + pre-fetch penjelasan jawaban benar
  useEffect(() => {
    if (phase === "quiz" && q) {
      speakText(q.question);
      lastSpokenHintRef.current = 0;
      lastSpokenConfirmRef.current = "";
      fetchHints(q.id);
      fetchConfirmation(q.id, true, setConfirmCorrect);
    }
    return () => stopSpeaking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, phase]);

  // Auto-speak hint baru yang baru saja terbuka
  useEffect(() => {
    if (lastCorrect !== false || isExhausted || hints.length === 0) return;
    const idx = Math.min(attempts, 3);
    if (idx > 0 && idx !== lastSpokenHintRef.current && hints[idx - 1]) {
      lastSpokenHintRef.current = idx;
      speakText(`Petunjuk ${idx}. ${hints[idx - 1]}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hints, attempts, lastCorrect]);

  // Auto-speak penjelasan saat jawaban benar
  useEffect(() => {
    if (lastCorrect === true && confirmCorrect && lastSpokenConfirmRef.current !== "correct") {
      lastSpokenConfirmRef.current = "correct";
      speakText(confirmCorrect);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCorrect, confirmCorrect]);

  // Auto-speak penjelasan saat percobaan habis
  useEffect(() => {
    if (isExhausted && confirmWrong && lastSpokenConfirmRef.current !== "wrong") {
      lastSpokenConfirmRef.current = "wrong";
      speakText(confirmWrong);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExhausted, confirmWrong]);

  // Chime via Web Audio API — dua nada naik menandakan siap bicara
  function playChime() {
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const now = ctx.currentTime;
      [[523.25, 0], [783.99, 0.18]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.22, now + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.38);
        osc.start(now + delay);
        osc.stop(now + delay + 0.42);
      });
    } catch { /* silent fallback */ }
  }

  // STT helpers
  async function startRecording() {
    setSttError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioForTranscription(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      playChime();
    } catch {
      setSttError("Mikrofon tidak dapat diakses.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  async function sendAudioForTranscription(blob: Blob) {
    setSttLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      if (q?.id) fd.append("questionId", q.id);
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      const data: { text?: string; error?: string } = await res.json();
      if (!res.ok || !data.text) {
        setSttError(data.error || "Gagal mengenali suara.");
        return;
      }
      const transcript = data.text.trim();
      if (q?.type === "BENAR_SALAH") {
        const lower = transcript.toLowerCase();
        if (/\b(benar|ya|betul|iya|bener)\b/.test(lower)) {
          setAnswer("Benar");
        } else if (/\b(salah|tidak|bukan|ngga|nggak|enggak)\b/.test(lower)) {
          setAnswer("Salah");
        } else {
          setSttError(`Tidak dikenali: "${transcript}". Ucapkan "Benar" atau "Salah".`);
        }
      } else {
        setAnswer(transcript);
      }
    } catch {
      setSttError("Gagal mengirim audio.");
    } finally {
      setSttLoading(false);
    }
  }
  // Hint ke-N ditampilkan setelah salah ke-N (attempts=1 → hint 0, attempts=2 → hint 1, dst)
  const hintIndex = lastCorrect === false && !isExhausted ? Math.min(attempts, 3) : 0;
  const currentHint = hintIndex > 0 ? (hints[hintIndex - 1] ?? null) : null;

  async function handleSubmit() {
    if (!q || !answer.trim() || checking) return;
    setChecking(true);

    const res = await fetch("/api/quiz/grade-one", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, userAnswer: answer }),
    });
    const data: { isCorrect: boolean; correctAnswer: string } = await res.json();
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setLastCorrect(data.isCorrect);
    setRevealedAnswer(data.correctAnswer);

    // Pre-fetch penjelasan "salah" saat pertama kali menjawab salah
    if (!data.isCorrect && newAttempts === 1) {
      fetchConfirmation(q.id, false, setConfirmWrong);
    }
    setChecking(false);
  }

  async function fetchConfirmation(
    questionId: string,
    wasCorrect: boolean,
    setter: (v: string) => void,
  ) {
    try {
      const res = await fetch("/api/quiz/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, wasCorrect }),
      });
      const data: { confirmation: string; quote?: string | null } = await res.json();
      setter(data.confirmation ?? "");
      if (data.quote) setSourceQuote(data.quote);
    } catch {
      setter("");
    }
  }

  async function fetchHints(questionId: string) {
    setHintsLoading(true);
    try {
      const res = await fetch("/api/quiz/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      const data: { hints: string[] } = await res.json();
      setHints(data.hints?.length === 3 ? data.hints : FALLBACK_HINTS);
    } catch {
      setHints(FALLBACK_HINTS);
    }
    setHintsLoading(false);
  }

  function handleNext() {
    if (!q) return;
    stopSpeaking();
    lastSpokenHintRef.current = 0;
    const record: QuestionRecord = {
      questionId: q.id,
      userAnswer: answer,
      isCorrect: lastCorrect === true,
      correctAnswer: revealedAnswer,
    };
    const newRecords = [...records, record];
    setRecords(newRecords);

    if (qIdx + 1 >= questions.length) {
      setPhase("summary");
    } else {
      setQIdx(qIdx + 1);
      setAnswer("");
      setAttempts(0);
      setLastCorrect(null);
      setHints([]);
      setRevealedAnswer("");
      setConfirmCorrect("");
      setConfirmWrong("");
      setSourceQuote(null);
      setHintsLoading(false);
      setSttError("");
    }
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    setSubmitError("");

    const correctCount = records.filter((r) => r.isCorrect).length;
    const score = Math.round((correctCount / records.length) * 100);
    const preGraded: FinalResult = {
      score,
      correctCount,
      totalQuestions: records.length,
      passed: score >= passScore,
      answers: records,
    };

    const res = await fetch(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...extraBody,
        answers: records.map((r) => ({ questionId: r.questionId, userAnswer: r.userAnswer })),
        preGraded,
      }),
    });

    const text = await res.text();
    let data: FinalResult & { error?: string } = preGraded;
    try { data = JSON.parse(text); } catch { /* gunakan preGraded sebagai fallback */ }

    setFinalResult(res.ok ? data : preGraded);
    setPhase("result");
    setSubmitting(false);
  }

  function handleRetry() {
    stopSpeaking();
    lastSpokenHintRef.current = 0;
    lastSpokenConfirmRef.current = "";
    setRecords([]);
    setPhase("quiz");
    setQIdx(0);
    setAnswer("");
    setAttempts(0);
    setLastCorrect(null);
    setHints([]);
    setRevealedAnswer("");
    setConfirmCorrect("");
    setConfirmWrong("");
    setSourceQuote(null);
    setFinalResult(null);
    setSttError("");
  }

  // ── HASIL AKHIR ───────────────────────────────────────────────────────────
  if (phase === "result" && finalResult) {
    const resultMap = new Map(finalResult.answers.map((a) => [a.questionId, a]));
    return (
      <div className="space-y-6">
        <div className={`rounded-2xl p-6 text-center ${finalResult.passed ? "bg-green-50 border-2 border-green-200" : "bg-orange-50 border-2 border-orange-200"}`}>
          <div className={`text-6xl font-black mb-2 ${finalResult.passed ? "text-green-600" : "text-orange-500"}`}>
            {finalResult.score}
          </div>
          <p className="text-gray-600 font-medium">{finalResult.correctCount} dari {finalResult.totalQuestions} soal benar</p>
          <p className={`mt-3 text-sm font-semibold ${finalResult.passed ? "text-green-700" : "text-orange-700"}`}>
            {finalResult.passed ? `✓ Lulus! Nilai kamu mencapai batas lulus (${passScore})` : `Belum lulus. Nilai minimum ${passScore}`}
          </p>
        </div>

        <div className="space-y-3">
          {questions.map((question, i) => {
            const r = resultMap.get(question.id) ?? records[i];
            return (
              <div key={question.id} className={`rounded-xl p-4 border ${r?.isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${r?.isCorrect ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                    {r?.isCorrect ? "✓" : "✗"}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{i + 1}. {question.question}</p>
                    <p className="text-xs mt-1">
                      <span className="text-gray-500">Jawaban kamu: </span>
                      <span className={r?.isCorrect ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                        {r?.userAnswer || "(tidak dijawab)"}
                      </span>
                    </p>
                    {!r?.isCorrect && r?.correctAnswer && (
                      <p className="text-xs mt-0.5">
                        <span className="text-gray-500">Jawaban benar: </span>
                        <span className="text-green-700 font-semibold">{r.correctAnswer}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Link href={backUrl} className="flex-1 text-center py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition">
            ← Kembali
          </Link>
          {finalResult.passed && nextUrl && (
            <Link href={nextUrl} className="flex-1 text-center py-2.5 rounded-full bg-[#1d2b4f] hover:brightness-125 text-white text-sm font-semibold transition">
              {nextLabel ?? "Lanjut →"}
            </Link>
          )}
          {!finalResult.passed && (
            <button onClick={handleRetry} className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Coba Lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── RINGKASAN SEBELUM SUBMIT ──────────────────────────────────────────────
  if (phase === "summary") {
    const correctCount = records.filter((r) => r.isCorrect).length;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
        <p className="text-5xl">🎉</p>
        <h2 className="text-lg font-bold text-gray-800">Semua soal selesai!</h2>
        <p className="text-gray-500 text-sm">
          Kamu menjawab benar <strong className="text-gray-800">{correctCount}</strong> dari <strong className="text-gray-800">{records.length}</strong> soal.
        </p>
        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}
        <button
          onClick={handleFinalSubmit}
          disabled={submitting}
          className="w-full bg-[#1d2b4f] hover:brightness-125 text-white font-semibold py-3 rounded-full transition disabled:opacity-50"
        >
          {submitting ? "Menyimpan hasil..." : "Lihat Nilai →"}
        </button>
      </div>
    );
  }

  // ── SOAL SATU PER SATU ────────────────────────────────────────────────────
  if (!q) return null;

  return (
    <div className="space-y-4">
      {/* Progress bar + TTS toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 flex-shrink-0">Soal {qIdx + 1}/{questions.length}</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3577b5] rounded-full transition-all duration-300"
            style={{ width: `${(qIdx / questions.length) * 100}%` }}
          />
        </div>
        {/* TTS provider toggle */}
        <button
          onClick={toggleTtsProvider}
          title={ttsProvider === "edge" ? "Suara: Microsoft Edge (cloud) — klik untuk ganti ke Piper (lokal)" : "Suara: Piper (lokal) — klik untuk ganti ke Microsoft Edge (cloud)"}
          className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors
            hover:bg-gray-50 select-none
            border-gray-200 text-gray-500"
        >
          {ttsProvider === "edge" ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3577b5]" />
              Edge
            </>
          ) : (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Piper
            </>
          )}
        </button>
      </div>

      {/* Indikator percobaan */}
      {attempts > 0 && !isExhausted && lastCorrect !== true && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Percobaan:</span>
          {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${i < attempts ? "bg-red-400" : "bg-gray-200"}`}
            />
          ))}
          {attempts < MAX_ATTEMPTS && (
            <span className="text-xs text-gray-400 ml-1">{MAX_ATTEMPTS - attempts} sisa</span>
          )}
        </div>
      )}

      {/* Kartu soal */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Teks soal + tombol suara */}
        <div className="flex items-start gap-3">
          <p className="flex-1 text-gray-800 font-semibold text-base leading-relaxed">{q.question}</p>
          <button
            onClick={() => speaking ? stopSpeaking() : speakText(q.question)}
            title={speaking ? "Hentikan suara" : "Putar soal dengan suara"}
            className={`flex-shrink-0 p-2 rounded-lg transition ${speaking ? "bg-[#3577b5]/15 text-[#3577b5]" : "text-gray-400 hover:text-[#3577b5] hover:bg-[#3577b5]/10"}`}
          >
            {speaking ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
        </div>

        {/* Input jawaban — sembunyikan jika sudah benar atau exhausted */}
        {lastCorrect !== true && !isExhausted && (
          q.type === "BENAR_SALAH" ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                {["Benar", "Salah"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAnswer(opt)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                      answer === opt
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
              <MicButton
                recording={recording}
                loading={sttLoading}
                onStart={startRecording}
                onStop={stopRecording}
              />
              {sttError && <p className="text-xs text-red-500 text-center">{sttError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && answer.trim() && !checking) handleSubmit(); }}
                placeholder="Ketik jawaban kamu..."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3577b5]"
              />
              <MicButton
                recording={recording}
                loading={sttLoading}
                onStart={startRecording}
                onStop={stopRecording}
              />
              {sttError && <p className="text-xs text-red-500 text-center">{sttError}</p>}
            </div>
          )
        )}

        {/* Feedback benar */}
        {lastCorrect === true && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-500 text-lg">✓</span>
              <p className="text-green-700 font-semibold text-sm flex-1">Jawaban benar!</p>
            </div>
            {confirmCorrect && (
              <div className="flex items-start gap-2 pl-1">
                <p className="text-sm text-green-800 flex-1">{confirmCorrect}</p>
                <button
                  onClick={() => speakText(confirmCorrect)}
                  title="Bacakan penjelasan"
                  className="flex-shrink-0 p-1 text-green-500 hover:text-green-700 hover:bg-green-100 rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  </svg>
                </button>
              </div>
            )}
            {sourceQuote && (
              <div className="bg-white/70 border border-green-200 text-green-900 rounded-lg px-3 py-2 text-xs">
                <p className="font-semibold mb-0.5">📖 Dari buku:</p>
                <p className="italic leading-relaxed">&ldquo;{sourceQuote}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* Feedback habis percobaan */}
        {isExhausted && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
            <p className="text-red-600 font-semibold text-sm">Percobaan habis.</p>
            <div>
              <p className="text-xs text-gray-500">Jawaban yang benar:</p>
              <p className="text-sm font-semibold text-gray-800">{revealedAnswer}</p>
            </div>
            {confirmWrong && (
              <div className="flex items-start gap-2 pt-1 border-t border-red-100">
                <p className="text-sm text-gray-700 flex-1">{confirmWrong}</p>
                <button
                  onClick={() => speakText(confirmWrong)}
                  title="Bacakan penjelasan"
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-red-100 rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  </svg>
                </button>
              </div>
            )}
            {sourceQuote && (
              <div className="bg-white/70 border border-red-100 text-gray-700 rounded-lg px-3 py-2 text-xs">
                <p className="font-semibold mb-0.5">📖 Dari buku:</p>
                <p className="italic leading-relaxed">&ldquo;{sourceQuote}&rdquo;</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kotak petunjuk */}
      {currentHint && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
              💡 Petunjuk {hintIndex} / 3
            </p>
            <button
              onClick={() => speakText(`Petunjuk ${hintIndex}. ${currentHint}`)}
              title="Bacakan petunjuk"
              className="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            </button>
          </div>
          <p className="text-sm text-amber-900">{currentHint}</p>
        </div>
      )}

      {/* Tombol aksi */}
      {lastCorrect === true || isExhausted ? (
        <button
          onClick={handleNext}
          className="w-full py-3 rounded-full bg-[#1d2b4f] hover:brightness-125 text-white text-sm font-semibold transition"
        >
          {qIdx + 1 < questions.length ? "Soal Berikutnya →" : "Selesai ✓"}
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || checking}
          className="w-full py-3 rounded-full bg-[#1d2b4f] hover:brightness-125 text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {checking ? "Memeriksa..." : attempts > 0 ? "Coba Lagi" : "Kumpulkan Jawaban"}
        </button>
      )}
    </div>
  );
}

function MicButton({
  recording,
  loading,
  onStart,
  onStop,
}: {
  recording: boolean;
  loading: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (loading) {
    return (
      <div className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-gray-100 text-gray-500">
        <svg className="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm font-medium">Memproses suara...</span>
      </div>
    );
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="relative w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white transition-colors overflow-hidden"
      >
        {/* Ripple rings */}
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="absolute w-20 h-20 rounded-full bg-red-400 opacity-40 animate-ping" />
          <span className="absolute w-14 h-14 rounded-full bg-red-400 opacity-30 animate-ping [animation-delay:0.3s]" />
        </span>
        <svg className="relative w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
        <span className="relative text-sm font-semibold">Sedang merekam — ketuk untuk selesai</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#3577b5]/50 bg-[#3577b5]/5 hover:bg-[#3577b5]/10 hover:border-[#3577b5] text-[#1d2b4f] transition-colors group"
    >
      <svg
        className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 2.78-2.9 4.85-5.91 4.85s-5.42-2.07-5.91-4.85H4c.49 3.21 2.89 5.71 6 6.17V20h4v-2.83c3.11-.46 5.51-2.96 6-6.17h-2.09z" />
      </svg>
      <span className="text-sm font-semibold">Ketuk untuk menjawab dengan suara</span>
    </button>
  );
}
