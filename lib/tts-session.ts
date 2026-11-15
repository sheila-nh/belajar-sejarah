// Singleton audio session shared across all TTS buttons on the page.
// Ensures clicking one section's speaker stops any other currently playing audio.

let _audio: HTMLAudioElement | null = null;
let _controller: AbortController | null = null;

export function stopSession() {
  _controller?.abort();
  _controller = null;
  if (_audio) {
    _audio.pause();
    _audio.src = "";
    _audio = null;
  }
}

export function setAudio(audio: HTMLAudioElement) {
  _audio = audio;
}

export function setController(ctrl: AbortController | null) {
  _controller = ctrl;
}

export function getController(): AbortController | null {
  return _controller;
}

// ── Word timing helpers ──────────────────────────────────────────────────────

export type WordTiming = { word: string; startMs: number; endMs: number };

/** Return the index of the word currently at `ms` milliseconds. */
export function findWordIndex(ms: number, words: WordTiming[]): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (ms >= words[i].startMs) idx = i;
    else break;
  }
  return idx;
}

// ── Highlight pub/sub ────────────────────────────────────────────────────────
// LessonTtsPlayer publishes which sectionId is active + current word index.
// Each TtsWordBlock subscribes and highlights itself when sectionId matches.

export type HighlightEvent = { sectionId: string; wordIndex: number } | null;
type HighlightListener = (event: HighlightEvent) => void;

const _highlightListeners = new Set<HighlightListener>();

export function publishHighlight(event: HighlightEvent) {
  _highlightListeners.forEach((fn) => fn(event));
}

export function subscribeHighlight(fn: HighlightListener): () => void {
  _highlightListeners.add(fn);
  return () => _highlightListeners.delete(fn);
}

// ── Shared fetch helper ──────────────────────────────────────────────────────

export type TtsResult = {
  blob: Blob;
  words: WordTiming[] | null;
};

export async function fetchTts(
  text: string,
  signal: AbortSignal,
): Promise<TtsResult | null> {
  const provider =
    (typeof window !== "undefined"
      ? (localStorage.getItem("tts-provider") as "edge" | "piper" | null)
      : null) ?? "edge";

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider }),
      signal,
    });
    if (signal.aborted || !res.ok) return null;

    const data = (await res.json()) as {
      audio: string;
      mimeType: string;
      words: WordTiming[] | null;
    };
    if (signal.aborted) return null;

    const blob = base64ToBlob(data.audio, data.mimeType);
    return { blob, words: data.words };
  } catch {
    return null;
  }
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
