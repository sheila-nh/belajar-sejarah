"use client";

import { useState, useEffect } from "react";
import { subscribeHighlight } from "@/lib/tts-session";

interface Props {
  sectionId: string;
  className?: string;
  children: React.ReactNode;
}

/** Static label that highlights when LessonTtsPlayer announces this section. */
export default function TtsLabel({ sectionId, className = "", children }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeHighlight((event) => {
      setActive(event?.sectionId === sectionId && event.wordIndex >= 0);
    });
  }, [sectionId]);

  return (
    <span
      className={`${className} rounded transition-colors duration-75 ${
        active ? "bg-yellow-200 text-gray-900 px-0.5" : ""
      }`}
    >
      {children}
    </span>
  );
}
