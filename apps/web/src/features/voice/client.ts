import { create } from "zustand";
import type { VoiceConfig } from "@cricket/shared";
import { api, base, useAuth } from "../../lib/api";
import { useRoom } from "../auction/transport";
import type { VoiceEngine, VoiceParticipant, VoiceCallbacks } from "./engine";
import { MeshVoice } from "./mesh";
import { LiveKitVoice } from "./livekit";
type Phase = "idle" | "joining" | "joined" | "reconnecting";
interface VoiceState {
  roomId?: string;
  phase: Phase;
  muted: boolean;
  deafened: boolean;
  busy: boolean;
  peers: VoiceParticipant[];
  speaking: string[];
  error: string;
  playbackBlocked: boolean;
  devices: MediaDeviceInfo[];
  deviceId: string;
}
const initial = {
  phase: "idle" as Phase,
  muted: true,
  deafened: false,
  busy: false,
  peers: [],
  speaking: [],
  error: "",
  playbackBlocked: false,
  devices: [],
  deviceId: "",
};
export const useVoice = create<VoiceState>(() => ({ ...initial }));
let engine: VoiceEngine | undefined;
let pendingContext: AudioContext | undefined;
let generation = 0;
let desiredRoom: string | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
const mediaError = (error: unknown) => {
  if (error instanceof DOMException) {
    if (["NotAllowedError", "PermissionDeniedError"].includes(error.name))
      return "Microphone permission was denied. Allow it in your browser's site settings, then try Unmute again. You can still listen.";
    if (error.name === "NotFoundError")
      return "No microphone was found. Connect a microphone and try again. You can still listen.";
    if (["NotReadableError", "AbortError"].includes(error.name))
      return "Your microphone is unavailable or in use by another app. Close that app and try again.";
    if (error.name === "OverconstrainedError")
      return "That microphone is no longer available. Choose another microphone.";
    if (error.name === "NotSupportedError")
      return "Your browser could not open this microphone. Try another microphone or browser. You can still listen.";
  }
  return error instanceof Error
    ? error.message
    : "Voice is unavailable. Auction and text chat still work.";
};
function stopEngine() {
  generation++;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  engine?.close();
  engine = undefined;
  void pendingContext?.close().catch(() => undefined);
  pendingContext = undefined;
}
export function leaveVoice(message = "") {
  desiredRoom = undefined;
  retries = 0;
  stopEngine();
  useVoice.setState({ ...initial, roomId: undefined, error: message });
}
function reconnect(message: string) {
  if (!desiredRoom) return;
  stopEngine();
  useVoice.setState({
    phase: "reconnecting",
    muted: true,
    busy: false,
    peers: [],
    speaking: [],
    error: message,
  });
  if (!useRoom.getState().connected || !useRoom.getState().sessionId) return;
  if (++retries > 3) {
    leaveVoice("Voice could not reconnect. Join voice to try again.");
    return;
  }
  const roomId = desiredRoom;
  retryTimer = setTimeout(() => {
    void connect(roomId, true);
  }, 1000 * retries);
}
async function connect(roomId: string, automatic = false) {
  const state = useRoom.getState(),
    auth = useAuth.getState();
  if (
    !auth.token ||
    !state.connected ||
    !state.sessionId ||
    state.room?.id !== roomId
  ) {
    if (!automatic)
      useVoice.setState({
        error: "Connect to the auction before joining voice.",
      });
    return;
  }
  if (
    !window.isSecureContext ||
    !window.RTCPeerConnection ||
    !window.AudioContext
  ) {
    leaveVoice(
      "Voice needs HTTPS (or localhost) and a browser with audio support.",
    );
    return;
  }
  stopEngine();
  desiredRoom = roomId;
  const preferences = automatic
    ? {
        deafened: useVoice.getState().deafened,
        deviceId: useVoice.getState().deviceId,
        devices: useVoice.getState().devices,
      }
    : {};
  const current = generation;
  useVoice.setState({
    ...initial,
    ...preferences,
    roomId,
    phase: automatic ? "reconnecting" : "joining",
    busy: true,
  });
  // Resume during the explicit Join gesture; a separate Enable audio button handles browser autoplay restrictions.
  const context = new AudioContext();
  pendingContext = context;
  void context.resume().catch(() => undefined);
  const callbacks: VoiceCallbacks = {
    peers: (peers) => {
      if (generation === current) useVoice.setState({ peers });
    },
    speaking: (speaking) => {
      if (generation === current) useVoice.setState({ speaking });
    },
    playbackBlocked: () => {
      if (generation === current) useVoice.setState({ playbackBlocked: true });
    },
    error: (error) => {
      if (generation === current) useVoice.setState({ error });
    },
    ended: (reason, retry) => {
      if (generation === current) {
        if (retry) reconnect(reason);
        else leaveVoice(reason);
      }
    },
  };
  try {
    const config = await api<VoiceConfig>(`/rooms/${roomId}/voice`, {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId }),
    });
    if (generation !== current) {
      void context.close().catch(() => undefined);
      return;
    }
    if (config.mode === "livekit") {
      void context.close().catch(() => undefined);
      engine = new LiveKitVoice(config, callbacks);
    } else
      engine = new MeshVoice(
        {
          base,
          roomId,
          token: auth.token,
          sessionId: state.sessionId,
          iceServers: config.iceServers,
        },
        callbacks,
        context,
      );
    pendingContext = undefined;
    engine.deafen(useVoice.getState().deafened);
    await engine.start();
    if (generation !== current) return;
    retries = 0;
    useVoice.setState({ phase: "joined", muted: true, busy: false });
  } catch (error) {
    void context.close().catch(() => undefined);
    if (generation !== current) return;
    if (automatic) reconnect(mediaError(error));
    else leaveVoice(mediaError(error));
  }
}
export async function joinVoice(roomId: string) {
  if (
    useVoice.getState().phase === "joining" ||
    useVoice.getState().phase === "joined"
  )
    return;
  retries = 0;
  await connect(roomId);
}
export async function toggleMicrophone() {
  const current = engine,
    id = generation,
    state = useVoice.getState();
  if (!current || state.busy || state.phase !== "joined") return;
  useVoice.setState({ busy: true, error: "" });
  try {
    await current.microphone(state.muted, state.deviceId || undefined);
    if (id !== generation) return;
    useVoice.setState({ muted: !state.muted });
    const devices = await navigator.mediaDevices?.enumerateDevices();
    if (id === generation)
      useVoice.setState({
        devices:
          devices?.filter(
            (device) => device.kind === "audioinput" && device.deviceId,
          ) ?? [],
      });
  } catch (error) {
    if (id === generation) useVoice.setState({ error: mediaError(error) });
  } finally {
    if (id === generation) useVoice.setState({ busy: false });
  }
}
export function toggleDeafened() {
  const deafened = !useVoice.getState().deafened;
  engine?.deafen(deafened);
  useVoice.setState({ deafened });
}
export async function chooseMicrophone(deviceId: string) {
  const current = engine,
    id = generation,
    state = useVoice.getState();
  if (!current || state.busy) return;
  useVoice.setState({ busy: true, error: "" });
  try {
    if (!state.muted) await current.microphone(true, deviceId || undefined);
    if (id === generation) useVoice.setState({ deviceId });
  } catch (error) {
    if (id === generation) {
      try {
        await current.microphone(false);
        useVoice.setState({ error: mediaError(error), muted: true });
      } catch {
        leaveVoice(mediaError(error));
      }
    }
  } finally {
    if (id === generation) useVoice.setState({ busy: false });
  }
}
export async function enablePlayback() {
  try {
    await engine?.play();
    useVoice.setState({ playbackBlocked: false });
  } catch {
    useVoice.setState({
      error:
        "Your browser blocked sound. Check site sound permissions and try Enable audio again.",
    });
  }
}
useRoom.subscribe((state) => {
  if (!desiredRoom) return;
  if (
    state.room &&
    (state.room.id !== desiredRoom ||
      !state.room.settings.voice ||
      ["completed", "cancelled"].includes(state.room.status))
  ) {
    leaveVoice();
    return;
  }
  if (!state.connected || !state.sessionId) {
    if (useVoice.getState().phase !== "reconnecting")
      reconnect(
        "Auction connection lost. Voice will rejoin muted after reconnecting.",
      );
  } else if (
    useVoice.getState().phase === "reconnecting" &&
    !retryTimer &&
    !useVoice.getState().busy
  )
    reconnect("Rejoining voice muted…");
});
useAuth.subscribe((state) => {
  if (!state.user || !state.token) leaveVoice();
});
if (import.meta.hot) import.meta.hot.dispose(() => leaveVoice());
