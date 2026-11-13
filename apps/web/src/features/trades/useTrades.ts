import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import type { TradeState, TradeServerEvents } from "@cricket/shared";
import { api, base, useAuth } from "../../lib/api";
import { useRoom } from "../auction/transport";
export function useTrades(roomId: string, enabled = true) {
  const liveRoom = useRoom((state) =>
    state.connected && state.room?.id === roomId ? state.room : undefined,
  );
  const token = useAuth((state) => state.token),
    userId = useAuth((state) => state.user?.id),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["trades", roomId, userId],
    enabled: enabled && !!token,
    queryFn: () => api<TradeState>(`/rooms/${roomId}/trades`),
    staleTime: 0,
    refetchInterval: 30000,
  });
  useEffect(() => {
    if (!enabled || !token) return;
    const socket: Socket<TradeServerEvents> = io(`${base}/trades`, {
      forceNew: true,
      auth: { token, roomId },
    });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["trades", roomId] });
      void client.invalidateQueries({ queryKey: ["squad", roomId] });
      void client.invalidateQueries({ queryKey: ["squads"] });
    };
    socket.on("changed", refresh);
    socket.on("connect", refresh);
    socket.on("accessEnded", refresh);
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomId, token, enabled, client]);
  return {
    ...query,
    data:
      query.data && liveRoom ? { ...query.data, room: liveRoom } : query.data,
  };
}
