import { io, type Socket } from "socket.io-client";
import type {
  VoiceClientEvents,
  VoiceServerEvents,
  VoicePeer,
  VoiceSignal,
  VoiceIceServer,
} from "@cricket/shared";
import type { VoiceCallbacks, VoiceEngine } from "./engine";
type Link = {
  pc: RTCPeerConnection;
  sender?: RTCRtpSender;
  candidates: RTCIceCandidateInit[];
  chain: Promise<void>;
  audio?: HTMLAudioElement;
  analyser?: AnalyserNode;
  source?: MediaStreamAudioSourceNode;
  restarted: boolean;
};

export class MeshVoice implements VoiceEngine {
  private socket: Socket<VoiceServerEvents, VoiceClientEvents>;
  private links = new Map<string, Link>();
  private roster: VoicePeer[] = [];
  private stream?: MediaStream;
  private context: AudioContext;
  private localSource?: MediaStreamAudioSourceNode;
  private localAnalyser?: AnalyserNode;
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  private cancelStart?: () => void;
  private deafened = false;
  private muted = true;
  private lastSpeaking = "";
  constructor(
    private input: {
      base: string;
      roomId: string;
      token: string;
      sessionId: string;
      iceServers: VoiceIceServer[];
    },
    private callbacks: VoiceCallbacks,
    context: AudioContext,
  ) {
    this.context = context;
    this.socket = io(`${input.base}/voice`, {
      forceNew: true,
      autoConnect: false,
      reconnection: false,
      timeout: 10000,
      auth: {
        token: input.token,
        roomId: input.roomId,
        sessionId: input.sessionId,
      },
    });
    this.socket.on("voice:roster", (peers) => {
      if (this.disposed) return;
      this.roster = peers;
      for (const [id, link] of this.links)
        if (!peers.some((peer) => peer.id === id)) {
          this.removeLink(link);
          this.links.delete(id);
        }
      for (const peer of peers)
        if (peer.id !== this.socket.id) this.link(peer.id);
      this.publish();
    });
    this.socket.on("voice:signal", ({ from, signal }) => {
      if (this.disposed) return;
      const link = this.link(from);
      link.chain = link.chain
        .then(() => this.signal(link, from, signal))
        .catch(() => {
          if (!this.disposed)
            this.callbacks.error(
              "An audio connection failed. Rejoin voice to try again.",
            );
        });
    });
    this.socket.on("voice:ended", ({ reason, retry }) => {
      if (!this.disposed) this.callbacks.ended(reason, retry);
    });
    this.socket.on("disconnect", () => {
      if (!this.disposed)
        this.callbacks.ended("Voice connection lost. Rejoining muted…", true);
    });
    this.timer = setInterval(() => this.levels(), 200);
  }
  async start() {
    await new Promise<void>((resolve, reject) => {
      this.cancelStart = () => reject(new Error("Voice join cancelled."));
      this.socket.once("connect", () => {
        this.socket.timeout(10000).emit("voice:sync", (error, peers) => {
          this.cancelStart = undefined;
          if (error) {
            reject(new Error("Voice did not respond. Try joining again."));
            return;
          }
          this.roster = peers;
          this.publish();
          resolve();
        });
      });
      this.socket.once("connect_error", (error) => {
        this.cancelStart = undefined;
        reject(error);
      });
      this.socket.connect();
    });
  }
  private publish() {
    if (this.disposed) return;
    this.callbacks.peers(
      this.roster.map((peer) => ({
        ...peer,
        connected:
          peer.id === this.socket.id ||
          this.links.get(peer.id)?.pc.connectionState === "connected",
      })),
    );
  }
  private link(id: string): Link {
    const existing = this.links.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.input.iceServers });
    const link: Link = {
      pc,
      candidates: [],
      chain: Promise.resolve(),
      restarted: false,
    };
    if (this.socket.id! < id)
      link.sender = pc.addTransceiver("audio", {
        direction: "sendrecv",
      }).sender;
    this.links.set(id, link);
    const track = this.stream?.getAudioTracks()[0];
    if (track && link.sender)
      void link.sender.replaceTrack(track).catch(() => undefined);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this.disposed)
        this.socket.emit("voice:signal", {
          to: id,
          signal: {
            candidate: {
              ...candidate.toJSON(),
              candidate: candidate.candidate,
            },
          },
        });
    };
    pc.onnegotiationneeded = () => {
      // A deterministic offerer avoids simultaneous offers; replacing the audio track requires no renegotiation.
      if (this.disposed || !this.socket.id || this.socket.id > id) return;
      link.chain = link.chain
        .then(async () => {
          if (pc.signalingState !== "stable" || this.disposed) return;
          await pc.setLocalDescription(await pc.createOffer());
          if (!this.disposed && pc.localDescription)
            this.socket.emit("voice:signal", {
              to: id,
              signal: {
                description: { type: "offer", sdp: pc.localDescription.sdp },
              },
            });
        })
        .catch(() => {
          if (!this.disposed)
            this.callbacks.error(
              "Could not negotiate audio. Rejoin voice to retry.",
            );
        });
    };
    pc.onconnectionstatechange = () => {
      this.publish();
      if (pc.connectionState === "failed" && !this.disposed) {
        if (!link.restarted && this.socket.id! < id) {
          link.restarted = true;
          pc.restartIce();
        } else
          this.callbacks.error(
            "Audio could not reach another owner. Try rejoining voice. Different networks may need the server's TURN relay configured.",
          );
      }
    };
    pc.ontrack = ({ track }) => {
      if (track.kind !== "audio" || this.disposed) return;
      link.audio?.remove();
      link.source?.disconnect();
      const stream = new MediaStream([track]);
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.dataset.voicePeer = id;
      audio.srcObject = stream;
      audio.muted = this.deafened;
      document.body.append(audio);
      link.audio = audio;
      link.source = this.context.createMediaStreamSource(stream);
      link.analyser = this.context.createAnalyser();
      link.analyser.fftSize = 512;
      link.source.connect(link.analyser);
      void audio.play().catch(() => {
        if (!this.disposed && audio.isConnected)
          this.callbacks.playbackBlocked();
      });
    };
    return link;
  }
  private async signal(link: Link, from: string, signal: VoiceSignal) {
    if (this.disposed || link.pc.signalingState === "closed") return;
    if ("description" in signal) {
      await link.pc.setRemoteDescription(signal.description);
      for (const candidate of link.candidates.splice(0))
        await link.pc.addIceCandidate(candidate);
      if (signal.description.type === "offer") {
        const transceiver = link.pc
          .getTransceivers()
          .find((item) => item.receiver.track.kind === "audio");
        if (transceiver) {
          transceiver.direction = "sendrecv";
          link.sender = transceiver.sender;
          await link.sender.replaceTrack(
            this.stream?.getAudioTracks()[0] ?? null,
          );
        }
        await link.pc.setLocalDescription(await link.pc.createAnswer());
        if (!this.disposed && link.pc.localDescription)
          this.socket.emit("voice:signal", {
            to: from,
            signal: {
              description: {
                type: "answer",
                sdp: link.pc.localDescription.sdp,
              },
            },
          });
      }
    } else if (link.pc.remoteDescription)
      await link.pc.addIceCandidate(signal.candidate);
    else link.candidates.push(signal.candidate);
  }
  async microphone(enabled: boolean, deviceId?: string) {
    if (!enabled) {
      this.muted = true;
      this.stream?.getTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      this.stream = undefined;
      this.localSource?.disconnect();
      this.localSource = undefined;
      this.localAnalyser = undefined;
      await Promise.allSettled(
        [...this.links.values()].map((link) => link.sender?.replaceTrack(null)),
      );
      if (!this.disposed) this.socket.emit("voice:mute", true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Microphone access requires HTTPS or localhost.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    track.enabled = false;
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      await Promise.all(
        [...this.links.values()]
          .filter((link) => link.pc.signalingState !== "closed")
          .map((link) => link.sender?.replaceTrack(track)),
      );
      if (this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream?.getTracks().forEach((track) => track.stop());
      this.localSource?.disconnect();
      this.stream = stream;
      track.enabled = true;
      this.muted = false;
      this.localSource = this.context.createMediaStreamSource(stream);
      this.localAnalyser = this.context.createAnalyser();
      this.localAnalyser.fftSize = 512;
      this.localSource.connect(this.localAnalyser);
      this.socket.emit("voice:mute", false);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      await this.microphone(false);
      throw error;
    }
  }
  deafen(value: boolean) {
    this.deafened = value;
    for (const link of this.links.values())
      if (link.audio) link.audio.muted = value;
  }
  async play() {
    await this.context.resume();
    await Promise.all(
      [...this.links.values()]
        .filter((link) => link.audio)
        .map((link) => link.audio!.play()),
    );
  }
  private levels() {
    if (this.disposed) return;
    const active: string[] = [];
    const loud = (analyser?: AnalyserNode) => {
      if (!analyser || this.context.state !== "running") return false;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      return (
        Math.sqrt(
          data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
            data.length,
        ) > 0.02
      );
    };
    for (const peer of this.roster)
      if (
        !peer.muted &&
        loud(
          peer.id === this.socket.id
            ? this.localAnalyser
            : this.links.get(peer.id)?.analyser,
        )
      )
        active.push(peer.id);
    const signature = active.sort().join(",");
    if (signature !== this.lastSpeaking) {
      this.lastSpeaking = signature;
      this.callbacks.speaking(active);
    }
  }
  private removeLink(link: Link) {
    link.pc.onconnectionstatechange = null;
    link.pc.onicecandidate = null;
    link.pc.onnegotiationneeded = null;
    link.pc.ontrack = null;
    link.pc.close();
    link.source?.disconnect();
    if (link.audio) {
      link.audio.pause();
      link.audio.srcObject = null;
      link.audio.remove();
    }
  }
  close() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelStart?.();
    this.cancelStart = undefined;
    clearInterval(this.timer);
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.localSource?.disconnect();
    for (const link of this.links.values()) this.removeLink(link);
    this.links.clear();
    void this.context.close().catch(() => undefined);
  }
}
