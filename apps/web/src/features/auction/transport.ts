import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import type {
  RoomView,
  ClientEvents,
  ServerEvents,
  Command,
  Ack,
} from "@cricket/shared";
import { base, useAuth } from "../../lib/api";
type State = {
  sessionId?: string;
  suppressCelebrationLot?: string;
  room?: RoomView;
  connected: boolean;
  error?: string;
  takenOver: boolean;
  offset: number;
};
export const useRoom = create<State>(() => ({
  connected: false,
  takenOver: false,
  offset: 0,
}));
let socket: Socket<ServerEvents, ClientEvents> | undefined;
let watching: string | undefined;
let currentToken: string | undefined;
let restoring = true;
function snapshot(room: RoomView) {
  useRoom.setState((state) =>
    state.room?.id === room.id && state.room.version > room.version
      ? {}
      : {
          room,
          offset: room.serverTime - Date.now(),
          ...(restoring && room.lot?.resolved
            ? { suppressCelebrationLot: room.lot.id }
            : {}),
        },
  );
}
export function watchRoom(roomId: string) {
  const token = useAuth.getState().token;
  if (socket && currentToken === token && watching === roomId) return;
  socket?.disconnect();
  currentToken = token;
  watching = roomId;
  useRoom.setState({
    room: undefined,
    error: undefined,
    takenOver: false,
    connected: false,
  });
  socket = io(base || undefined, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
  });
  socket.on("connect", () => {
    restoring = true;
    useRoom.setState({ connected: true, error: undefined });
    socket!.emit("watch", { roomId }, (result) => {
      if (result.ok) {
        snapshot(result.data);
        restoring = false;
        useRoom.setState({ sessionId: socket!.id });
      } else useRoom.setState({ error: result.error.message });
    });
  });
  socket.on("disconnect", () =>
    useRoom.setState({ connected: false, sessionId: undefined }),
  );
  socket.on("connect_error", (e) =>
    useRoom.setState({ connected: false, error: e.message }),
  );
  socket.on("snapshot", snapshot);
  socket.on("takeover", () => {
    useRoom.setState({ takenOver: true, connected: false });
    socket?.disconnect();
  });
  socket.on("revoked", (reason) => {
    useRoom.setState({ error: reason, connected: false });
    socket?.disconnect();
  });
}
export function closeRoom() {
  socket?.disconnect();
  socket = undefined;
  watching = undefined;
  useRoom.setState({ room: undefined, connected: false, sessionId: undefined });
}
export async function send(
  type: Command["type"],
  payload: Command["payload"] = {},
): Promise<RoomView> {
  const { room, connected, takenOver } = useRoom.getState();
  if (!socket || !room || !connected || takenOver)
    throw new Error("Reconnect before sending actions");
  const command: Command = {
    requestId: crypto.randomUUID(),
    roomId: room.id,
    lotId: room.lot?.id,
    expectedVersion: room.version,
    type,
    payload,
  };
  return new Promise((resolve, reject) => {
    socket!
      .timeout(10000)
      .emit(
        "command",
        command,
        (error: Error | null, result: Ack<RoomView>) => {
          if (error) {
            reject(
              new Error(
                "No confirmation received. Reconnect to check the latest state.",
              ),
            );
            return;
          }
          if (result.ok) {
            snapshot(result.data);
            resolve(result.data);
          } else reject(new Error(result.error.message));
        },
      );
  });
}
