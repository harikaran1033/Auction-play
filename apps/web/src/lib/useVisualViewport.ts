import { useEffect } from "react";
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? innerHeight;
        const editable = document.activeElement?.matches(
          'input:not([type="checkbox"]), textarea',
        );
        const inset = editable
          ? Math.max(0, innerHeight - height - (viewport?.offsetTop ?? 0))
          : 0;
        document.documentElement.style.setProperty(
          "--visual-height",
          `${height}px`,
        );
        document.documentElement.style.setProperty(
          "--keyboard-inset",
          `${inset > 120 ? inset : 0}px`,
        );
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--visual-height");
      document.documentElement.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
