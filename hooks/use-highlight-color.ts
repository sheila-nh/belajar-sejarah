import { useSyncExternalStore, useEffect } from "react";
import {
  getCurrentHighlightColorId,
  initHighlightColor,
  subscribeHighlightColor,
} from "@/lib/highlight-color";

export function useHighlightColor(): string {
  useEffect(() => {
    initHighlightColor();
  }, []);

  return useSyncExternalStore(
    subscribeHighlightColor,
    getCurrentHighlightColorId,
    getCurrentHighlightColorId,
  );
}
