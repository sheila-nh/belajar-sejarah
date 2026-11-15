"use client";

import { useSectionTts } from "@/hooks/use-section-tts";
import { useHighlightColor } from "@/hooks/use-highlight-color";
import { getHlClass } from "@/lib/highlight-color";
import SpeakerButton from "@/components/student/SpeakerButton";

interface Props {
  label?: string;
  labelClassName?: string;
  text: string;
  sectionId: string;
  className?: string;
}

function tokenize(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

function HlSpan({
  word, index, activeIndex, hlClass, last,
}: {
  word: string; index: number; activeIndex: number; hlClass: string; last: boolean;
}) {
  return (
    <span className={index === activeIndex ? hlClass : "transition-colors duration-75"}>
      {word}{last ? "" : " "}
    </span>
  );
}

export default function TtsWordBlock({ label, labelClassName, text, sectionId, className = "" }: Props) {
  const labelWords = label ? tokenize(label) : [];
  const contentWords = tokenize(text);
  const ttsText = label ? `${label}. ${text}` : text;

  const { toggle, isLoading, isPlaying, isPaused, activeWordIndex } = useSectionTts(ttsText, sectionId);
  const hlClass = getHlClass(useHighlightColor());

  if (label) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <SpeakerButton onClick={toggle} isLoading={isLoading} isPlaying={isPlaying} isPaused={isPaused} />
          <p className={labelClassName}>
            {labelWords.map((word, i) => (
              <HlSpan key={i} word={word} index={i} activeIndex={activeWordIndex} hlClass={hlClass} last={i === labelWords.length - 1} />
            ))}
          </p>
        </div>
        <p className={className}>
          {contentWords.map((word, i) => (
            <HlSpan key={i} word={word} index={labelWords.length + i} activeIndex={activeWordIndex} hlClass={hlClass} last={i === contentWords.length - 1} />
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <SpeakerButton onClick={toggle} isLoading={isLoading} isPlaying={isPlaying} isPaused={isPaused} className="mt-0.5" />
      <p className={className}>
        {contentWords.map((word, i) => (
          <HlSpan key={i} word={word} index={i} activeIndex={activeWordIndex} hlClass={hlClass} last={i === contentWords.length - 1} />
        ))}
      </p>
    </div>
  );
}
