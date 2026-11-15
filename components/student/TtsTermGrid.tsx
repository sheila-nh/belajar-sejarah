"use client";

import { useMemo } from "react";
import { useSectionTts } from "@/hooks/use-section-tts";
import { useHighlightColor } from "@/hooks/use-highlight-color";
import { getHlClass } from "@/lib/highlight-color";
import SpeakerButton from "@/components/student/SpeakerButton";

type KeyTerm = { term: string; definition: string };

interface Props {
  terms: KeyTerm[];
  sectionId: string;
}

const LABEL = "Istilah Kunci";
const LABEL_WORDS = LABEL.match(/\S+/g) ?? [];

type TermRange = {
  termWords: string[];
  defWords: string[];
  termStart: number;
  defStart: number;
};

function buildTermRanges(terms: KeyTerm[]): TermRange[] {
  // Global word index starts after label words
  let globalIdx = LABEL_WORDS.length;
  return terms.map(({ term, definition }) => {
    const termWords = term.match(/\S+/g) ?? [];
    const defWords = definition.match(/\S+/g) ?? [];
    const range: TermRange = {
      termWords,
      defWords,
      termStart: globalIdx,
      defStart: globalIdx + termWords.length,
    };
    globalIdx += termWords.length + defWords.length;
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

export default function TtsTermGrid({ terms, sectionId }: Props) {
  const ttsText = `${LABEL}. ${terms.map((kt) => `${kt.term}: ${kt.definition}`).join(". ")}`;
  const { toggle, isLoading, isPlaying, isPaused, activeWordIndex } = useSectionTts(ttsText, sectionId);
  const hlClass = getHlClass(useHighlightColor());
  const termRanges = useMemo(() => buildTermRanges(terms), [terms]);

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
      <dl className="rounded-xl border border-gray-200 overflow-hidden text-sm divide-y divide-gray-100">
        {termRanges.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_3fr] gap-x-4 px-4 py-3 even:bg-gray-50/60">
            <dt className="font-semibold text-sky-700 leading-relaxed">
              {row.termWords.map((word, j) => (
                <HlSpan key={j} word={word} index={row.termStart + j} activeIndex={activeWordIndex} hlClass={hlClass} last={j === row.termWords.length - 1} />
              ))}
            </dt>
            <dd className="text-gray-600 leading-relaxed">
              {row.defWords.map((word, j) => (
                <HlSpan key={j} word={word} index={row.defStart + j} activeIndex={activeWordIndex} hlClass={hlClass} last={j === row.defWords.length - 1} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
