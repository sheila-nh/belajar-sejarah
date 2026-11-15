"use client";

import { useSectionTts } from "@/hooks/use-section-tts";
import SpeakerButton from "@/components/student/SpeakerButton";

interface Props {
  text: string;
  sectionId: string;
}

export default function SectionSpeaker({ text, sectionId }: Props) {
  const { toggle, isLoading, isPlaying, isPaused } = useSectionTts(text, sectionId);
  return <SpeakerButton onClick={toggle} isLoading={isLoading} isPlaying={isPlaying} isPaused={isPaused} />;
}
