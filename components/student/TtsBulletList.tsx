"use client";

import { useMemo } from "react";
import { useSectionTts } from "@/hooks/use-section-tts";
import { useHighlightColor } from "@/hooks/use-highlight-color";
import { getHlClass } from "@/lib/highlight-color";
import SpeakerButton from "@/components/student/SpeakerButton";

interface Props {
  items: string[];
  sectionId: string;
}

const LABEL = "Poin Penting";
const LABEL_WORDS = LABEL.match(/\S+/g) ?? [];

type ItemRange = { words: string[]; startIdx: number };

function buildItemRanges(items: string[]): ItemRange[] {
  // Global word index starts after label words
  let globalIdx = LABEL_WORDS.length;
  return items.map((item) => {
    const words = item.match(/\S+/g) ?? [];
    const range = { words, startIdx: globalIdx };
    globalIdx += words.length;
    return range;
  });
}

function HlSpan({ word, index, activeIndex, hlClass, last }: { word: string; index: number; activeIndex: number; hlClass: string; last: boolean }) {
  return (
    <span className={index === activeIndex ? hlClass : "transition-colors duration-75"}>
      {word}{last ? "" : " "}
    </span>
  );
}

export default function TtsBulletList({ items, sectionId }: Props) {
  // TTS text includes the label so timing data covers label words
  const ttsText = `${LABEL}. ${items.join(". ")}`;
  const { toggle, isLoading, isPlaying, isPaused, activeWordIndex } = useSectionTts(ttsText, sectionId);
  const hlClass = getHlClass(useHighlightColor());
  const itemRanges = useMemo(() => buildItemRanges(items), [items]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <SpeakerButton onClick={toggle} isLoading={isLoading} isPlaying={isPlaying} isPaused={isPaused} />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {LABEL_WORDS.map((word, i) => (
            <HlSpan key={i} word={word} index={i} activeIndex={activeWordIndex} hlClass={hlClass} last={i === LABEL_WORDS.length - 1} />
          ))}
        </p>
      </div>
      <ul className="space-y-2">
        {itemRanges.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
            <span>
              {item.words.map((word, j) => (
                <HlSpan key={j} word={word} index={item.startIdx + j} activeIndex={activeWordIndex} hlClass={hlClass} last={j === item.words.length - 1} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
