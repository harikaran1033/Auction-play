import { create } from "zustand";

export type AppTheme = "night" | "ember";
export const themes = [
  {
    id: "night",
    name: "Night Club",
    description: "Deep purple · Lavender highlights",
  },
  {
    id: "ember",
    name: "Ember Arena",
    description: "Pitch black · Racing red · Electric yellow",
  },
] as const;
function readTheme(): AppTheme {
  try {
    return localStorage.getItem("cricket-theme") === "ember"
      ? "ember"
      : "night";
  } catch {
    return "night";
  }
}
function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('link[rel="icon"]')
    ?.setAttribute("href", theme === "ember" ? "/icon-ember.svg" : "/icon.svg");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "ember" ? "#090909" : "#100b18");
}
export const useAppearance = create<{
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    try {
      localStorage.setItem("cricket-theme", theme);
    } catch {
      /* Keep the choice active when browser storage is unavailable. */
    }
  },
}));
applyTheme(useAppearance.getState().theme);
window.addEventListener("storage", (event) => {
  if (event.key !== "cricket-theme" && event.key !== null) return;
  const theme = readTheme();
  applyTheme(theme);
  useAppearance.setState({ theme });
});
