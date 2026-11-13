import { create } from "zustand";
export interface AudioOptions {
  enabled: boolean;
  timer: boolean;
  results: boolean;
  announcer: boolean;
  volume: number;
  voiceURI: string;
}
const defaults: AudioOptions = {
  enabled: false,
  timer: true,
  results: true,
  announcer: true,
  volume: 0.6,
  voiceURI: "",
};
export function parseAudioOptions(
  value: unknown,
  legacyEnabled = false,
): AudioOptions {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : legacyEnabled,
    timer: typeof input.timer === "boolean" ? input.timer : true,
    results: typeof input.results === "boolean" ? input.results : true,
    announcer: typeof input.announcer === "boolean" ? input.announcer : true,
    volume:
      typeof input.volume === "number" && Number.isFinite(input.volume)
        ? Math.max(0, Math.min(1, input.volume))
        : 0.6,
    voiceURI:
      typeof input.voiceURI === "string" ? input.voiceURI.slice(0, 512) : "",
  };
}
function read() {
  try {
    if (typeof localStorage === "undefined") return defaults;
    return parseAudioOptions(
      JSON.parse(localStorage.getItem("cricket-auction-audio") ?? "null"),
      localStorage.getItem("cricket-sound") === "true",
    );
  } catch {
    return defaults;
  }
}
export const useAuctionAudio = create<{
  options: AudioOptions;
  unlocked: boolean;
  error: string;
  setOptions: (patch: Partial<AudioOptions>) => void;
}>((set, get) => ({
  options: read(),
  unlocked: false,
  error: "",
  setOptions: (patch) => {
    const options = parseAudioOptions({ ...get().options, ...patch });
    set({ options });
    try {
      localStorage.setItem("cricket-auction-audio", JSON.stringify(options));
      localStorage.setItem("cricket-sound", String(options.enabled));
    } catch {
      /* Audio still works if browser storage is unavailable. */
    }
  },
}));
let context: AudioContext | undefined,
  master: GainNode | undefined,
  ticks: GainNode | undefined,
  effects: GainNode | undefined;
const sources = new Set<AudioScheduledSourceNode>();
function cancelSpeech() {
  try {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  } catch {
    // A device speech service failure must never interrupt auction updates.
  }
}
function sync() {
  const options = useAuctionAudio.getState().options;
  if (master) master.gain.value = options.enabled ? options.volume : 0;
  if (ticks) ticks.gain.value = options.timer ? 1 : 0;
  if (effects) effects.gain.value = options.results ? 1 : 0;
}
export function stopAuctionAudio() {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      /* Already ended. */
    }
  }
  sources.clear();
  cancelSpeech();
}
export function enableAudio() {
  if (
    !useAuctionAudio.getState().options.enabled ||
    typeof window === "undefined"
  )
    return;
  try {
    context ??= new AudioContext();
    if (!master) {
      master = context.createGain();
      ticks = context.createGain();
      effects = context.createGain();
      ticks.connect(master);
      effects.connect(master);
      master.connect(context.destination);
      context.onstatechange = () =>
        useAuctionAudio.setState({ unlocked: context?.state === "running" });
    }
    sync();
    void context
      .resume()
      .then(() => useAuctionAudio.setState({ unlocked: true }))
      .catch(() =>
        useAuctionAudio.setState({
          unlocked: false,
          error: "Tap Test audio to allow sound in this browser.",
        }),
      );
  } catch {
    useAuctionAudio.setState({
      error: "Audio playback is unavailable in this browser.",
      unlocked: false,
    });
  }
}
function register(
  source: AudioScheduledSourceNode,
  cleanup: () => void = () => undefined,
) {
  sources.add(source);
  source.onended = () => {
    sources.delete(source);
    source.disconnect();
    cleanup();
  };
}
export function playTimerTick(seconds: number) {
  const options = useAuctionAudio.getState().options;
  if (
    !options.enabled ||
    !options.timer ||
    options.volume <= 0 ||
    context?.state !== "running" ||
    !ticks
  )
    return;
  const oscillator = context.createOscillator(),
    gain = context.createGain(),
    at = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.value = seconds <= 3 ? 1350 : 850;
  gain.gain.setValueAtTime(0.075, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  oscillator.connect(gain);
  gain.connect(ticks);
  register(oscillator, () => gain.disconnect());
  oscillator.start(at);
  oscillator.stop(at + 0.075);
}
export function playHammer(result: "sold" | "unsold" = "sold") {
  const options = useAuctionAudio.getState().options;
  if (
    !options.enabled ||
    !options.results ||
    options.volume <= 0 ||
    context?.state !== "running" ||
    !effects
  )
    return;
  for (let i = 0; i < (result === "sold" ? 2 : 1); i++) {
    const at = context.currentTime + i * 0.13,
      buffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.15),
        context.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let n = 0; n < data.length; n++)
      data[n] =
        (Math.random() * 2 - 1) * Math.exp(-n / (context.sampleRate * 0.025));
    const noise = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = result === "sold" ? 1050 : 650;
    filter.Q.value = 0.6;
    gain.gain.value = 0.8;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(effects);
    register(noise, () => {
      filter.disconnect();
      gain.disconnect();
    });
    noise.start(at);
    noise.stop(at + 0.15);
    const knock = context.createOscillator(),
      knockGain = context.createGain();
    knock.frequency.setValueAtTime(180, at);
    knock.frequency.exponentialRampToValueAtTime(55, at + 0.1);
    knockGain.gain.setValueAtTime(0.2, at);
    knockGain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    knock.connect(knockGain);
    knockGain.connect(effects);
    register(knock, () => knockGain.disconnect());
    knock.start(at);
    knock.stop(at + 0.13);
  }
}
function speak(text: string, category: "timer" | "results") {
  const options = useAuctionAudio.getState().options;
  if (
    !options.enabled ||
    !options[category] ||
    !options.announcer ||
    options.volume <= 0 ||
    typeof speechSynthesis === "undefined" ||
    typeof SpeechSynthesisUtterance === "undefined"
  )
    return;
  try {
    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(text),
      voices = speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => voice.voiceURI === options.voiceURI) ??
      voices.find(
        (voice) => /^en[-_]IN/i.test(voice.lang) && voice.localService,
      ) ??
      voices.find((voice) => /^en/i.test(voice.lang) && voice.localService) ??
      voices.find((voice) => /^en/i.test(voice.lang)) ??
      null;
    utterance.lang = utterance.voice?.lang ?? "en-IN";
    utterance.rate = 1.04;
    utterance.pitch = 0.85;
    utterance.volume = options.volume;
    utterance.onerror = (event) => {
      if (!["canceled", "interrupted"].includes(event.error))
        useAuctionAudio.setState({
          error:
            "The device's spoken voice is unavailable. Countdown and gavel effects still work.",
        });
    };
    speechSynthesis.speak(utterance);
  } catch {
    useAuctionAudio.setState({
      error:
        "The device's spoken voice is unavailable. Countdown and gavel effects still work.",
    });
  }
}
export function announceCountdown(call: "once" | "twice") {
  speak(call === "once" ? "Going once!" : "Going twice!", "timer");
}
export function announceResult(
  result: "sold" | "unsold",
  player: string,
  team?: string,
) {
  playHammer(result);
  speak(
    result === "sold"
      ? `Sold! ${player}${team ? `, to ${team}` : ""}!`
      : `Unsold. ${player}.`,
    "results",
  );
}
export function previewAuctionAudio() {
  enableAudio();
  if (context)
    void context
      .resume()
      .then(() => {
        playTimerTick(3);
        announceResult("sold", "Your next star signing");
      })
      .catch(() => undefined);
}
useAuctionAudio.subscribe((state, previous) => {
  sync();
  if (!state.options.enabled) stopAuctionAudio();
  else if (
    (!state.options.announcer ||
      !state.options.timer ||
      !state.options.results ||
      state.options.volume === 0) &&
    previous.options !== state.options &&
    typeof speechSynthesis !== "undefined"
  )
    cancelSpeech();
});
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === "cricket-auction-audio")
      useAuctionAudio.setState({ options: read() });
  });
