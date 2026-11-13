export interface VoicePeer {
  id: string;
  userId: string;
  name: string;
  muted: boolean;
}
export interface VoiceIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export type VoiceConfig =
  | { mode: "webrtc"; iceServers: VoiceIceServer[] }
  | { mode: "livekit"; url: string; token: string };
export type VoiceSignal =
  | { description: { type: "offer" | "answer"; sdp: string } }
  | {
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };
export interface VoiceClientEvents {
  "voice:sync": (ack: (peers: VoicePeer[]) => void) => void;
  "voice:signal": (input: { to: string; signal: VoiceSignal }) => void;
  "voice:mute": (muted: boolean) => void;
}
export interface VoiceServerEvents {
  "voice:roster": (peers: VoicePeer[]) => void;
  "voice:signal": (input: { from: string; signal: VoiceSignal }) => void;
  "voice:ended": (input: { reason: string; retry: boolean }) => void;
}
