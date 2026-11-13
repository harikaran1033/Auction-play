import { useEffect, useRef, useState } from "react";
import { Send, ArrowDown, MessageSquare } from "lucide-react";
import type { ChatMessage, RoomView } from "@cricket/shared";
import { api, useAuth } from "../../lib/api";
import { send } from "../auction/transport";
import { Button } from "../../components/ui/button";
export function Chat({
  room,
  disabled,
  active = true,
  onUnreadChange,
}: {
  room: RoomView;
  disabled: boolean;
  active?: boolean;
  onUnreadChange?: (count: number) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(true);
  const [unread, setUnread] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastSeenMessage = useRef(room.chat.at(-1)?.id);
  const { user } = useAuth();
  const recent = room.chat.slice(-50);
  const messages = [
    ...new Map([...older, ...recent].map((m) => [m.id, m])).values(),
  ].sort((a, b) => a.at - b.at);
  useEffect(() => {
    const newest = room.chat.at(-1);
    const changed = newest?.id !== lastSeenMessage.current;
    lastSeenMessage.current = newest?.id;
    if (active && atBottom.current) {
      list.current?.scrollTo({ top: list.current.scrollHeight });
      setUnread(0);
    } else if (changed && newest && newest.userId !== user?.id)
      setUnread((n) => n + 1);
  }, [room.chat.at(-1)?.id, active, user?.id]);
  useEffect(() => {
    onUnreadChange?.(unread);
  }, [unread, onUnreadChange]);
  async function history() {
    try {
      const response = await api(
        `/rooms/${room.id}/chat?before=${messages[0]?.at ?? Date.now() + 1}`,
      );
      setOlder((current) => [...response.messages, ...current]);
      setMore(response.hasMore);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      await send("chat", { text });
      setText("");
      atBottom.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="chat">
      <div className="section-label">
        <MessageSquare size={14} /> ROOM CHAT{" "}
        <span>{room.members.filter((m) => m.connected).length} online</span>
      </div>
      <div
        className="chat-messages"
        ref={list}
        onScroll={() => {
          const el = list.current!;
          atBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          if (atBottom.current) setUnread(0);
        }}
      >
        {more && messages.length >= 50 && (
          <button className="text-button" onClick={history}>
            Load earlier messages
          </button>
        )}
        {!messages.length && (
          <div className="chat-empty">
            <MessageSquare size={24} />
            <p>A little friendly banter?</p>
            <small>Say hello to your competition.</small>
          </div>
        )}
        {messages.map((m) => (
          <div
            className={`chat-message ${m.userId === user?.id ? "mine" : ""}`}
            key={m.id}
          >
            <div>
              <strong>{m.name}</strong>
              <time>
                {new Date(m.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {unread > 0 && (
        <button
          className="unread-button"
          onClick={() => {
            list.current?.scrollTo({
              top: list.current.scrollHeight,
              behavior: "smooth",
            });
            atBottom.current = true;
            setUnread(0);
          }}
        >
          {unread} new <ArrowDown size={13} />
        </button>
      )}
      <form onSubmit={submit}>
        <input
          aria-label="Chat message"
          placeholder="Talk a little cricket…"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={disabled || sending || !text.trim()}
        >
          <Send size={17} />
        </Button>
      </form>
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
