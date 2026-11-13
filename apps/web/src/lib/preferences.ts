import { create } from "zustand";
export const usePreferences = create<{
  motion: string;
  setMotion: (motion: string) => void;
}>((set) => ({
  motion: localStorage.getItem("cricket-motion") ?? "system",
  setMotion: (motion) => {
    localStorage.setItem("cricket-motion", motion);
    document.documentElement.dataset.motion = motion;
    set({ motion });
  },
}));
document.documentElement.dataset.motion = usePreferences.getState().motion;
export { enableAudio, playHammer } from "./auctionAudio";
