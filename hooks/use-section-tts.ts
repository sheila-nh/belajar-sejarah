import { useState, useRef, useCallback, useEffect } from "react";
import {
  stopSession,
  setAudio,
  setController,
  fetchTts,
  findWordIndex,
  publishHighlight,
  subscribeHighlight,
  type WordTiming,
} from "@/lib/tts-session";

export function useSectionTts(text: string, sectionId: string) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [localWordIndex, setLocalWordIndex] = useState(-1);
  const [extWordIndex, setExtWordIndex] = useState(-1);
  const [extActive, setExtActive] = useState(false);

  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const wordsRef = useRef<WordTiming[] | null>(null);

  // Subscribe to highlight events from LessonTtsPlayer
  useEffect(() => {
    return subscribeHighlight((event) => {
      if (event?.sectionId === sectionId) {
        setExtWordIndex(event.wordIndex);
        setExtActive(true);
      } else {
        setExtWordIndex(-1);
        setExtActive(false);
      }
    });
  }, [sectionId]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startRaf = useCallback(
    (audio: HTMLAudioElement, words: WordTiming[]) => {
      stopRaf();
      const tick = () => {
        setLocalWordIndex(findWordIndex(audio.currentTime * 1000, words));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopRaf],
  );

  // Revoke the blob URL idempotently
  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const toggle = useCallback(async () => {
    // ── PAUSE ────────────────────────────────────────────────
    if (state === "playing") {
      audioRef.current?.pause();
      stopRaf();
      setState("paused");
      return;
    }

    // ── RESUME ───────────────────────────────────────────────
    if (state === "paused") {
      if (!audioRef.current) { setState("idle"); return; }
      setState("playing");
      if (wordsRef.current) startRaf(audioRef.current, wordsRef.current);
      audioRef.current.play().catch(() => {
        stopRaf();
        revokeUrl();
        audioRef.current = null;
        wordsRef.current = null;
        setState("idle");
        setLocalWordIndex(-1);
      });
      return;
    }

    // ── CANCEL WHILE LOADING ─────────────────────────────────
    if (state === "loading") {
      stopSession();
      publishHighlight(null);
      revokeUrl();
      setState("idle");
      return;
    }

    // ── START FROM IDLE ──────────────────────────────────────
    stopSession();
    publishHighlight(null);
    const controller = new AbortController();
    setController(controller);
    setState("loading");

    // External stop (another section started) → reset to idle
    controller.signal.addEventListener(
      "abort",
      () => {
        stopRaf();
        setState("idle");
        setLocalWordIndex(-1);
      },
      { once: true },
    );

    const result = await fetchTts(text, controller.signal);
    if (!result || controller.signal.aborted) {
      if (!controller.signal.aborted) setState("idle");
      return;
    }

    const { blob, words } = result;
    urlRef.current = URL.createObjectURL(blob);
    wordsRef.current = words;

    const audio = new Audio(urlRef.current);
    audioRef.current = audio;
    setAudio(audio);
    setState("playing");

    if (words && words.length > 0) startRaf(audio, words);

    await new Promise<void>((resolve) => {
      audio.onended = () => { revokeUrl(); resolve(); };
      audio.onerror = () => { revokeUrl(); resolve(); };
      // Abort = external termination (another section clicked)
      controller.signal.addEventListener(
        "abort",
        () => { audio.pause(); revokeUrl(); resolve(); },
        { once: true },
      );
      audio.play().catch(resolve);
    });

    stopRaf();
    if (!controller.signal.aborted) {
      setState("idle");
      setLocalWordIndex(-1);
      audioRef.current = null;
      wordsRef.current = null;
    }
  }, [state, text, stopRaf, startRaf, revokeUrl]);

  return {
    toggle,
    isLoading: state === "loading",
    isPlaying: state === "playing" || extActive,
    isPaused: state === "paused",
    activeWordIndex: extActive ? extWordIndex : localWordIndex,
  };
}
