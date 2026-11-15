"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  stopSession,
  setAudio,
  setController,
  fetchTts,
  findWordIndex,
  publishHighlight,
  type WordTiming,
} from "@/lib/tts-session";

type KeyTerm = { term: string; definition: string };

export type LessonData = {
  title: string;
  order: number;
  totalLessons: number;
  summary: string;
  keyPoints: string[];
  content: string;
  keyTerms: KeyTerm[];
};

type Chunk = {
  label: string;
  text: string;
  sectionId: string | null;
};

function buildChunks(lesson: LessonData): Chunk[] {
  const chunks: Chunk[] = [];

  chunks.push({
    label: "Judul",
    text: `Lesson ${lesson.order} dari ${lesson.totalLessons}. ${lesson.title}.`,
    sectionId: null,
  });

  chunks.push({
    label: "Ringkasan",
    text: `Ringkasan. ${lesson.summary}`,
    sectionId: "summary",
  });

  if (lesson.keyPoints.length > 0) {
    chunks.push({
      label: "Poin Penting",
      text: `Poin Penting. ${lesson.keyPoints.join(". ")}`,
      sectionId: "keypointsblock",
    });
  }

  const paragraphs = lesson.content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    chunks.push({ label: "Penjelasan", text: "Penjelasan.", sectionId: "penjelasanlabel" });
  }

  paragraphs.forEach((para, i) => {
    chunks.push({
      label: `Penjelasan ${i + 1}${paragraphs.length > 1 ? `/${paragraphs.length}` : ""}`,
      text: para,
      sectionId: `para-${i}`,
    });
  });

  if (lesson.keyTerms.length > 0) {
    chunks.push({
      label: "Istilah Kunci",
      text: `Istilah Kunci. ${lesson.keyTerms.map((kt) => `${kt.term}: ${kt.definition}`).join(". ")}`,
      sectionId: "termsblock",
    });
  }

  return chunks;
}

type ActivePlayback = {
  audio: HTMLAudioElement;
  words: WordTiming[] | null;
  sectionId: string | null;
  rafId: number | null;
};

export default function LessonTtsPlayer({ lesson }: { lesson: LessonData }) {
  const [speaking, setSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("");
  const [ttsProvider, setTtsProvider] = useState<"edge" | "piper">("edge");
  const ttsProviderRef = useRef<"edge" | "piper">("edge");
  const activeRef = useRef<ActivePlayback | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("tts-provider");
    if (stored === "piper" || stored === "edge") {
      setTtsProvider(stored);
      ttsProviderRef.current = stored;
    }
  }, []);

  function toggleProvider() {
    const next = ttsProviderRef.current === "edge" ? "piper" : "edge";
    ttsProviderRef.current = next;
    setTtsProvider(next);
    localStorage.setItem("tts-provider", next);
  }

  const stopRaf = useCallback(() => {
    if (activeRef.current?.rafId != null) {
      cancelAnimationFrame(activeRef.current.rafId);
      activeRef.current.rafId = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    const pb = activeRef.current;
    if (!pb?.words || !pb.sectionId) return;
    stopRaf();
    const { audio, words, sectionId } = pb;
    const tick = () => {
      publishHighlight({ sectionId, wordIndex: findWordIndex(audio.currentTime * 1000, words) });
      if (activeRef.current) activeRef.current.rafId = requestAnimationFrame(tick);
    };
    pb.rafId = requestAnimationFrame(tick);
  }, [stopRaf]);

  const stop = useCallback(() => {
    stopRaf();
    stopSession();
    publishHighlight(null);
    activeRef.current = null;
    setSpeaking(false);
    setIsPaused(false);
    setCurrentLabel("");
  }, [stopRaf]);

  const pauseResume = useCallback(() => {
    const pb = activeRef.current;
    if (!pb) return;
    if (!isPaused) {
      pb.audio.pause();
      stopRaf();
      setIsPaused(true);
    } else {
      pb.audio.play();
      startRaf();
      setIsPaused(false);
    }
  }, [isPaused, stopRaf, startRaf]);

  /** Play blob, drive rAF highlight loop, resolve when audio ends or is aborted. */
  const playWithHighlight = useCallback(
    (blob: Blob, words: WordTiming[] | null, sectionId: string | null, signal: AbortSignal): Promise<void> => {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        setAudio(audio);

        activeRef.current = { audio, words, sectionId, rafId: null };
        if (words?.length && sectionId) startRaf();

        const cleanup = () => {
          stopRaf();
          if (sectionId) publishHighlight(null);
          URL.revokeObjectURL(url);
          if (activeRef.current?.audio === audio) activeRef.current = null;
        };

        audio.onended = () => { cleanup(); resolve(); };
        audio.onerror = () => { cleanup(); resolve(); };
        signal.addEventListener("abort", () => { audio.pause(); cleanup(); resolve(); }, { once: true });
        audio.play().catch(resolve);
      });
    },
    [stopRaf, startRaf],
  );

  const play = useCallback(async () => {
    stopRaf();
    stopSession();
    publishHighlight(null);
    const controller = new AbortController();
    setController(controller);
    setSpeaking(true);
    setIsPaused(false);

    controller.signal.addEventListener(
      "abort",
      () => {
        stopRaf();
        publishHighlight(null);
        activeRef.current = null;
        setSpeaking(false);
        setIsPaused(false);
        setCurrentLabel("");
      },
      { once: true },
    );

    const chunks = buildChunks(lesson);
    let nextFetch = fetchTts(chunks[0].text, controller.signal);

    for (let i = 0; i < chunks.length; i++) {
      if (controller.signal.aborted) break;
      setCurrentLabel(chunks[i].label);

      const result = await nextFetch;
      if (!result || controller.signal.aborted) break;

      nextFetch =
        i + 1 < chunks.length
          ? fetchTts(chunks[i + 1].text, controller.signal)
          : Promise.resolve(null);

      await playWithHighlight(result.blob, result.words, chunks[i].sectionId, controller.signal);
      if (controller.signal.aborted) break;
    }

    if (!controller.signal.aborted) {
      publishHighlight(null);
      setSpeaking(false);
      setIsPaused(false);
      setCurrentLabel("");
    }
  }, [lesson, stopRaf, playWithHighlight]);

  useEffect(() => {
    return () => stop();
  }, [lesson.title, stop]);

  return (
    <div className="flex flex-col items-end gap-2">
      {speaking ? (
        /* Playing state: white card with pause + label + stop */
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={pauseResume}
            title={isPaused ? "Lanjutkan bacaan" : "Jeda bacaan"}
            className="flex items-center gap-2 text-sky-600 font-semibold text-sm flex-1 min-w-0"
          >
            {isPaused ? (
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z" />
              </svg>
            )}
            <span className="truncate max-w-[140px]">{currentLabel || "Memuat..."}</span>
          </button>
          <button
            onClick={stop}
            title="Berhenti"
            className="text-gray-300 hover:text-red-400 transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" />
            </svg>
          </button>
        </div>
      ) : (
        /* Idle state: provider toggle above, then icon button + hover label */
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={toggleProvider}
            title={
              ttsProvider === "edge"
                ? "Suara: Microsoft Edge — klik ganti ke Piper"
                : "Suara: Piper (lokal) — klik ganti ke Edge"
            }
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition select-none"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ttsProvider === "edge" ? "bg-sky-400" : "bg-emerald-400"}`} />
            {ttsProvider === "edge" ? "Edge TTS" : "Piper TTS"}
          </button>
          <div className="group flex flex-col items-end gap-1">
            <button
              onClick={play}
              title="Bacakan lesson ini"
              className="w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-200 border-2 border-white flex items-center justify-center transition-all hover:scale-105 hover:shadow-xl active:scale-95"
            >
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            </button>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-gray-500 font-medium whitespace-nowrap">
              Bacakan Semua
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
