const LS_KEY = "tts-highlight-color";

export type HighlightColor = {
  id: string;
  label: string;
  bgClass: string;
  swatch: string; // CSS hex for the picker dot
};

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: "yellow", label: "Kuning",  bgClass: "bg-yellow-200", swatch: "#fef08a" },
  { id: "green",  label: "Hijau",   bgClass: "bg-green-200",  swatch: "#bbf7d0" },
  { id: "blue",   label: "Biru",    bgClass: "bg-sky-200",    swatch: "#bae6fd" },
  { id: "pink",   label: "Pink",    bgClass: "bg-pink-200",   swatch: "#fbcfe8" },
  { id: "orange", label: "Oranye",  bgClass: "bg-orange-200", swatch: "#fed7aa" },
  { id: "purple", label: "Ungu",    bgClass: "bg-purple-200", swatch: "#e9d5ff" },
];

/** Returns the full Tailwind class string for an active highlighted word. */
export function getHlClass(colorId: string): string {
  const color = HIGHLIGHT_COLORS.find((c) => c.id === colorId) ?? HIGHLIGHT_COLORS[0];
  return `${color.bgClass} text-gray-900 rounded px-0.5 transition-colors duration-75`;
}

// ── Pub/sub ──────────────────────────────────────────────────────────────────

type Listener = (colorId: string) => void;
const _listeners = new Set<Listener>();
let _currentId = "yellow";

export function getCurrentHighlightColorId(): string {
  return _currentId;
}

export function setHighlightColorId(id: string): void {
  _currentId = id;
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, id);
  _listeners.forEach((fn) => fn(id));
}

export function subscribeHighlightColor(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Call once on the client to sync module state with localStorage. */
export function initHighlightColor(): void {
  if (typeof window === "undefined") return;
  const stored = localStorage.getItem(LS_KEY);
  if (stored && HIGHLIGHT_COLORS.some((c) => c.id === stored)) {
    setHighlightColorId(stored);
  }
}
