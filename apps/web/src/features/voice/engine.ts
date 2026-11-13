export interface VoiceParticipant {
  id: string;
  userId: string;
  name: string;
  muted: boolean;
  connected: boolean;
}
export interface VoiceCallbacks {
  peers: (peers: VoiceParticipant[]) => void;
  speaking: (ids: string[]) => void;
  playbackBlocked: () => void;
  ended: (reason: string, retry: boolean) => void;
  error: (message: string) => void;
}
export interface VoiceEngine {
  start(): Promise<void>;
  close(): void;
  microphone(enabled: boolean, deviceId?: string): Promise<void>;
  deafen(value: boolean): void;
  play(): Promise<void>;
}
