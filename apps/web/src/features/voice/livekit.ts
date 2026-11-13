import type { Room } from "livekit-client";
import type { VoiceCallbacks, VoiceEngine } from "./engine";
export class LiveKitVoice implements VoiceEngine {
  private room?: Room;
  private disposed = false;
  private audio = new Set<HTMLMediaElement>();
  private deafened = false;
  constructor(
    private input: { url: string; token: string },
    private callbacks: VoiceCallbacks,
  ) {}
  async start() {
    const { Room, RoomEvent } = await import("livekit-client");
    if (this.disposed) return;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    const publish = () => {
      if (this.disposed) return;
      this.callbacks.peers(
        [room.localParticipant, ...room.remoteParticipants.values()].map(
          (peer) => ({
            id: peer.identity,
            userId: peer.identity,
            name: peer.name ?? peer.identity,
            muted: !peer.isMicrophoneEnabled,
            connected: true,
          }),
        ),
      );
    };
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== "audio" || this.disposed) return;
      const element = track.attach();
      element.dataset.voicePeer = track.sid ?? "remote";
      element.muted = this.deafened;
      document.body.append(element);
      this.audio.add(element);
      void element.play().catch(() => {
        if (!this.disposed) this.callbacks.playbackBlocked();
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) =>
      track.detach().forEach((element) => {
        this.audio.delete(element);
        element.remove();
      }),
    );
    room.on(RoomEvent.ParticipantConnected, publish);
    room.on(RoomEvent.ParticipantDisconnected, publish);
    room.on(RoomEvent.TrackMuted, publish);
    room.on(RoomEvent.TrackUnmuted, publish);
    room.on(RoomEvent.LocalTrackPublished, publish);
    room.on(RoomEvent.LocalTrackUnpublished, publish);
    room.on(RoomEvent.ActiveSpeakersChanged, (peers) =>
      this.callbacks.speaking(peers.map((peer) => peer.identity)),
    );
    room.on(RoomEvent.Reconnecting, () =>
      this.callbacks.error(
        "Voice is reconnecting. Auction controls remain available.",
      ),
    );
    room.on(RoomEvent.Reconnected, publish);
    room.on(RoomEvent.Disconnected, () => {
      if (!this.disposed)
        this.callbacks.ended(
          "Voice disconnected. Join again to reconnect.",
          false,
        );
    });
    await room.connect(this.input.url, this.input.token);
    if (this.disposed) {
      void room.disconnect(true);
      return;
    }
    try {
      await room.startAudio();
    } catch {
      this.callbacks.playbackBlocked();
    }
    publish();
  }
  async microphone(enabled: boolean, deviceId?: string) {
    if (!this.room || this.disposed) return;
    if (deviceId) await this.room.switchActiveDevice("audioinput", deviceId);
    await this.room.localParticipant.setMicrophoneEnabled(enabled, {
      echoCancellation: true,
      noiseSuppression: true,
    });
  }
  deafen(value: boolean) {
    this.deafened = value;
    this.audio.forEach((audio) => {
      audio.muted = value;
    });
  }
  async play() {
    await this.room?.startAudio();
  }
  close() {
    if (this.disposed) return;
    this.disposed = true;
    this.room?.removeAllListeners();
    void this.room?.disconnect(true);
    this.audio.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    this.audio.clear();
  }
}
