import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Volume2,
  LoaderCircle,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, useAuth } from "../../lib/api";
import { useRoom } from "../auction/transport";
import {
  useVoice,
  joinVoice,
  leaveVoice,
  toggleMicrophone,
  toggleDeafened,
  chooseMicrophone,
  enablePlayback,
} from "./client";
export function Voice({
  roomId,
  enabled,
  closed,
  onStatusChange,
}: {
  roomId: string;
  enabled: boolean;
  closed: boolean;
  onStatusChange?: (state: { joined: boolean; muted: boolean }) => void;
}) {
  const state = useVoice();
  const owner = useAuth((state) => state.user?.id);
  const room = useRoom((state) => state.room);
  const sessionId = useRoom((state) => state.sessionId);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState("");
  const joined = state.roomId === roomId && state.phase === "joined";
  const connecting =
    state.roomId === roomId &&
    ["joining", "reconnecting"].includes(state.phase);
  useEffect(() => {
    onStatusChange?.({ joined, muted: state.muted });
  }, [joined, state.muted, onStatusChange]);
  async function setEnabled(value: boolean) {
    setEnabling(true);
    setEnableError("");
    try {
      await api(`/rooms/${roomId}/voice`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: value, sessionId }),
      });
    } catch (error) {
      setEnableError(
        error instanceof Error ? error.message : "Voice could not be enabled.",
      );
    } finally {
      setEnabling(false);
    }
  }
  return (
    <div className="voice" aria-label="Room voice chat">
      <div className="section-label">
        <Headphones size={15} />
        ROOM VOICE
        <span>
          {joined
            ? `${state.peers.length} joined`
            : connecting
              ? state.phase === "joining"
                ? "Connecting"
                : "Reconnecting"
              : "Audio only"}
        </span>
      </div>
      {enabled && !closed ? (
        <>
          <div className="voice-controls">
            {joined ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void toggleMicrophone()}
                  disabled={state.busy}
                  aria-pressed={!state.muted}
                >
                  {state.busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : state.muted ? (
                    <MicOff size={15} />
                  ) : (
                    <Mic size={15} />
                  )}
                  {state.busy
                    ? "Updating mic…"
                    : state.muted
                      ? "Unmute"
                      : "Mute"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleDeafened}
                  aria-label={
                    state.deafened
                      ? "Enable incoming audio"
                      : "Deafen incoming audio"
                  }
                  aria-pressed={state.deafened}
                >
                  {state.deafened ? (
                    <HeadphoneOff size={15} />
                  ) : (
                    <Headphones size={15} />
                  )}
                  {state.deafened ? "Deafened" : "Listen"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => leaveVoice()}>
                  Leave voice
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={connecting}
                onClick={() => void joinVoice(roomId)}
              >
                {connecting ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Headphones size={15} />
                )}
                {connecting
                  ? state.phase === "reconnecting"
                    ? "Rejoining muted…"
                    : "Connecting…"
                  : "Join voice"}
              </Button>
            )}
            {connecting && (
              <Button variant="ghost" size="sm" onClick={() => leaveVoice()}>
                Cancel
              </Button>
            )}
          </div>
          {joined ? (
            <>
              <p className="voice-status" role="status">
                {state.muted ? "Microphone muted" : "Microphone on"}
                {state.deafened
                  ? " · Incoming audio off"
                  : " · Listening to the room"}
              </p>
              {state.playbackBlocked && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void enablePlayback()}
                >
                  <Volume2 size={15} />
                  Enable audio
                </Button>
              )}
              {state.devices.length > 1 && (
                <label className="voice-device-label">
                  Microphone
                  <select
                    aria-label="Microphone"
                    disabled={state.busy}
                    value={state.deviceId}
                    onChange={(event) =>
                      void chooseMicrophone(event.target.value)
                    }
                  >
                    <option value="">System default</option>
                    {state.devices
                      .filter((device) => device.deviceId !== "default")
                      .map((device, i) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${i + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div
                className="voice-participants"
                aria-label="Voice participants"
              >
                {state.peers.map((peer) => (
                  <div
                    className={
                      state.speaking.includes(peer.id) ? "is-speaking" : ""
                    }
                    key={peer.id}
                  >
                    <span>
                      {peer.muted ? <MicOff size={13} /> : <Mic size={13} />}
                      {peer.name}
                      {peer.userId === owner && " (you)"}
                    </span>
                    <small>
                      {!peer.connected
                        ? "Connecting"
                        : peer.muted
                          ? "Muted"
                          : state.speaking.includes(peer.id)
                            ? "Speaking"
                            : "Mic on"}
                    </small>
                  </div>
                ))}
              </div>
              {state.peers.length < 2 && (
                <small className="muted">
                  <Users size={12} /> Waiting for other owners to join voice.
                </small>
              )}
            </>
          ) : (
            <small className="muted">
              Join to listen. Your microphone starts muted.
            </small>
          )}
        </>
      ) : (
        <>
          <small className="muted">
            {closed
              ? "Reconnect to the auction to use voice."
              : "Voice is disabled for this room."}
          </small>
          {!closed && !enabled && room?.hostId === owner && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void setEnabled(true)}
              disabled={enabling}
            >
              {enabling ? "Enabling…" : "Enable voice chat"}
            </Button>
          )}
          {!closed && !enabled && room?.hostId !== owner && (
            <small className="muted">The host can enable voice chat.</small>
          )}
        </>
      )}
      {(state.error || enableError) && (
        <small role="alert" className="error-text">
          {enableError || state.error}
        </small>
      )}
      {!closed && enabled && room?.hostId === owner && (
        <details className="voice-host-controls">
          <summary>Host voice controls</summary>
          <Button
            variant="ghost"
            size="sm"
            disabled={enabling}
            onClick={() => void setEnabled(false)}
          >
            {enabling ? "Updating voice…" : "Disable room voice"}
          </Button>
        </details>
      )}
      {closed && connecting && (
        <Button variant="ghost" size="sm" onClick={() => leaveVoice()}>
          Cancel voice reconnect
        </Button>
      )}
    </div>
  );
}
