import { useEffect, useRef, useState } from "react";
export function useMobilePanels() {
  const [isMobile, setIsMobile] = useState(
    () => matchMedia("(max-width: 850px)").matches,
  );
  const [panel, setPanel] = useState<"squad" | "context">();
  const squadRef = useRef<HTMLElement | null>(null),
    contextRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const query = matchMedia("(max-width: 850px)");
    const update = () => {
      setIsMobile(query.matches);
      if (!query.matches) setPanel(undefined);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isMobile || !panel) return;
    const element = (panel === "squad" ? squadRef : contextRef).current;
    if (!element) return;
    const source = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length > 0);
    const focus = requestAnimationFrame(() => {
      (focusables()[0] ?? element).focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (document.querySelector(".player-detail-panel")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setPanel(undefined);
      }
      if (event.key === "Tab") {
        const nodes = focusables(),
          first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          event.preventDefault();
          element.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(focus);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trap);
      if (source?.isConnected) source.focus();
    };
  }, [isMobile, panel]);
  return { isMobile, panel, setPanel, squadRef, contextRef };
}
