"use client";

interface Props {
  onClick: () => void;
  isLoading: boolean;
  isPlaying: boolean;
  isPaused?: boolean;
  className?: string;
}

export default function SpeakerButton({
  onClick,
  isLoading,
  isPlaying,
  isPaused = false,
  className = "",
}: Props) {
  const title = isLoading
    ? "Memuat audio..."
    : isPlaying
      ? "Jeda"
      : isPaused
        ? "Lanjutkan"
        : "Bacakan bagian ini";

  const colorClass = isLoading
    ? "border-sky-300 text-sky-400 bg-sky-50 animate-pulse"
    : isPlaying
      ? "border-sky-500 text-sky-600 bg-sky-100 hover:bg-sky-200"
      : isPaused
        ? "border-sky-400 text-sky-500 bg-sky-50 hover:bg-sky-100"
        : "border-gray-300 text-gray-400 hover:border-sky-400 hover:text-sky-500 hover:bg-sky-50";

  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 transition ${className} ${colorClass}`}
    >
      {isPlaying ? (
        // Pause icon
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z" />
        </svg>
      ) : isPaused ? (
        // Resume icon (filled play triangle, sky colored)
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        // Speaker icon
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      )}
    </button>
  );
}
