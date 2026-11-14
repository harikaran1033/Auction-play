import { Auction } from "./Auction";
import { Results } from "./Results";
import { enableAudio } from "../../lib/preferences";
import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  RefreshCcw,
  Shield,
  X,
  Wifi,
  WifiOff,
  Mic,
  MicOff,
} from "lucide-react";
import { type Command, type Dataset, type RoomView } from "@cricket/shared";
import { api, useAuth } from "../../lib/api";
import { useRoom, watchRoom, closeRoom, send } from "./transport";
import { Loading, ErrorState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { CopyCode } from "../rooms/Rooms";
import { Lobby } from "../rooms/Lobby";
import { leaveVoice } from "../voice/client";
import { RoomTools } from "../trades/RoomTools";
import { useAuctionSounds } from "../audio/useAuctionSounds";
import * as Dialog from "@radix-ui/react-dialog";
import { ThemeToggle } from "../../components/ThemePicker";
export function RoomScreen() {
  const { roomId, screen } = useParams();
  const { token, user } = useAuth();
  const { room, error, connected, takenOver } = useRoom();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<Command["type"]>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [voiceRequest, setVoiceRequest] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState({
    joined: false,
    muted: true,
  });
  useEffect(() => {
    watchRoom(roomId!);
    return () => {
      leaveVoice();
      closeRoom();
    };
  }, [roomId, token]);
  const { data: rawDataset, error: datasetError } = useQuery({
    queryKey: ["dataset", room?.settings.datasetId],
    enabled: !!room,
    queryFn: () => api<Dataset>(`/leagues/${room!.settings.datasetId}`),
  });
  const dataset = useMemo(
    () =>
      rawDataset && {
        ...rawDataset,
        unit: room?.settings.currency === "inr" ? "inr" : rawDataset.unit,
      },
    [rawDataset, room?.settings.currency],
  );
  useAuctionSounds(roomId, dataset);
  useEffect(() => {
    if (!room) return;
    const expected =
      room.status === "lobby"
        ? "lobby"
        : room.status === "completed"
          ? "results"
          : "auction";
    if (room.status !== "cancelled" && screen !== expected)
      navigate(`/rooms/${room.id}/${expected}`, { replace: true });
  }, [room?.status, screen, roomId]);
  async function act(type: Command["type"], payload: Command["payload"] = {}) {
    enableAudio();
    setBusy(true);
    setPendingCommand(type);
    setActionError("");
    try {
      await send(type, payload);
      if (type === "leave") navigate("/rooms");
    } catch (e) {
      setActionError((e as Error).message);
      if (type === "team") {
        try {
          const latest = await api<RoomView>(`/rooms/${roomId}`);
          useRoom.setState((state) =>
            state.room && state.room.version > latest.version
              ? {}
              : { room: latest, offset: latest.serverTime - Date.now() },
          );
        } catch {
          /* Keep the existing confirmed snapshot when refresh is unavailable. */
        }
      }
    } finally {
      setBusy(false);
      setPendingCommand(undefined);
    }
  }
  if (takenOver)
    return (
      <div className="state">
        <Shield size={32} />
        <h2>This team is active in another session.</h2>
        <p>The newest connection controls the team. Your squad stays saved.</p>
        <Button onClick={() => location.reload()}>
          Take over in this window
        </Button>
      </div>
    );
  if (error)
    return (
      <ErrorState error={new Error(error)} retry={() => location.reload()} />
    );
  if (datasetError) return <ErrorState error={datasetError} />;
  if (!room || !dataset) return <Loading />;
  const me = room.members.find((m) => m.userId === user?.id);
  if (!me) return <ErrorState error="Room membership required" />;
  const host = room.hostId === user?.id;
  const locked = busy || !connected;
  return (
    <div
      className="room-screen"
      onPointerDown={enableAudio}
      onKeyDown={enableAudio}
    >
      {!connected && (
        <div className="connection-banner">
          <RefreshCcw className="spin" size={15} /> Reconnecting… bidding
          resumes after the server confirms your session.
        </div>
      )}
      <div className="room-top">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            {dataset.league.toUpperCase()} <span>/</span>{" "}
            {room.status.replace("_", " ").toUpperCase()}
          </div>
          <h1>{room.settings.name}</h1>
        </div>
        <div className="flex gap-2">
          <span
            className={`room-connection ${connected ? "connected" : "disconnected"}`}
          >
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? "Connected" : "Reconnecting"}</span>
          </span>
          <CopyCode code={room.code} />
          <ThemeToggle />
          {room.status !== "cancelled" && (
            <RoomTools roomId={room.id} dataset={dataset} />
          )}
          {room.status !== "lobby" && room.status !== "completed" && (
            <Button
              variant="secondary"
              size="sm"
              aria-label="Voice controls"
              onClick={() => setVoiceRequest((n) => n + 1)}
            >
              {voiceStatus.joined && !voiceStatus.muted ? (
                <Mic size={15} />
              ) : (
                <MicOff size={15} />
              )}
              <span>Voice</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (room.status === "completed") void act("leave");
              else setConfirmLeave(true);
            }}
            disabled={locked}
          >
            <LogOut size={15} />
            Leave
          </Button>
        </div>
      </div>
      {actionError && (
        <div role="alert" className="form-error">
          {actionError}
          <button aria-label="Dismiss error" onClick={() => setActionError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {room.status === "cancelled" ? (
        <div className="state">
          <h2>The host cancelled this room.</h2>
          <Link to="/rooms">Find another auction</Link>
        </div>
      ) : room.status === "completed" ? (
        <Results room={room} dataset={dataset} me={me} />
      ) : room.status === "lobby" ? (
        <Lobby
          room={room}
          dataset={dataset}
          me={me}
          host={host}
          locked={locked}
          connected={connected}
          pendingCommand={pendingCommand}
          act={act}
        />
      ) : (
        <Auction
          room={room}
          dataset={dataset}
          me={me}
          host={host}
          locked={locked}
          act={act}
          pendingCommand={pendingCommand}
          voiceRequest={voiceRequest}
          onVoiceStatus={setVoiceStatus}
        />
      )}
      <Dialog.Root open={confirmLeave} onOpenChange={setConfirmLeave}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content leave-dialog">
            <Dialog.Title>
              {room.status === "lobby"
                ? "Leave the waiting room?"
                : "Leave this auction?"}
            </Dialog.Title>
            <Dialog.Description>
              {room.status === "lobby"
                ? `Leaving releases your team seat.${host ? " As host, control transfers to a connected owner, or the room is cancelled if no one else is connected." : ""}`
                : "Your team, purchases and accepted bids remain saved. You can return through My rooms, but cannot place bids while away."}
            </Dialog.Description>
            {actionError && (
              <p role="alert" className="form-error">
                {actionError}
              </p>
            )}
            <div className="leave-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Stay in room</Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                disabled={locked}
                onClick={() => {
                  void act("leave");
                }}
              >
                {busy ? "Leaving…" : "Leave room"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
