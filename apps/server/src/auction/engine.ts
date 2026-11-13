import { updateLineup } from "./lineup.js";
import { randomUUID } from "node:crypto";
import {
  type Room,
  type User,
  type Dataset,
  type Command,
  type Member,
  type Player,
  ensure,
  ineligible,
  memberFor,
  nextBid,
  settingsSchema,
} from "@cricket/shared";

const active = (m: Member) => !m.blocked && !m.left;
function available(room: Room, dataset: Dataset, player: Player) {
  return room.members.filter(
    (m) => active(m) && !ineligible(room, m, player, dataset, player.basePrice),
  );
}
function hasAcquisition(room: Room, dataset: Dataset, ids: string[]) {
  return ids.some((id) => {
    const p = dataset.players.find((p) => p.id === id);
    return p && available(room, dataset, p).length > 0;
  });
}
export function nextLot(room: Room, dataset: Dataset, now: number) {
  if (!hasAcquisition(room, dataset, [...room.queue, ...room.unsold])) {
    room.status = "completed";
    return;
  }
  if (!room.queue.length) {
    room.status = room.unsold.length ? "unsold_decision" : "completed";
    return;
  }
  const playerId = room.queue.shift()!;
  room.lot = {
    id: randomUUID(),
    playerId,
    endsAt: now + room.settings.timerSeconds * 1000,
    bid: 0,
    passed: [],
    resolved: false,
  };
  room.status = "running";
}
export function resolveLot(room: Room, now: number) {
  const lot = room.lot;
  ensure(
    lot && !lot.resolved && room.status === "running",
    "LOT_RESOLVED",
    "Lot already resolved",
  );
  if (lot.highest) {
    const winner = room.members.find((m) => m.id === lot.highest);
    ensure(
      winner &&
        winner.budget >= lot.bid &&
        !winner.purchases.some((p) => p.playerId === lot.playerId),
      "INVALID_SALE",
      "Cannot resolve sale safely",
    );
    winner.purchases.push({
      lotId: lot.id,
      playerId: lot.playerId,
      amount: lot.bid,
    });
    winner.budget -= lot.bid;
    lot.result = "sold";
  } else {
    room.unsold.push(lot.playerId);
    lot.result = "unsold";
  }
  lot.resolved = true;
  lot.revealEndsAt = now + 2500;
  room.lots.push(structuredClone(lot));
  room.status = "reveal";
}
function earlyResolution(room: Room, dataset: Dataset, now: number) {
  const lot = room.lot!;
  const player = dataset.players.find((p) => p.id === lot.playerId)!;
  const challengers = room.members.filter(
    (m) =>
      m.id !== lot.highest &&
      active(m) &&
      !ineligible(room, m, player, dataset),
  );
  if (challengers.every((m) => lot.passed.includes(m.id)))
    resolveLot(room, now);
}
export function applyCommand(
  room: Room,
  dataset: Dataset,
  user: User,
  sessionId: string,
  command: Command,
  now = Date.now(),
) {
  const member = memberFor(room, user.id);
  ensure(
    member.sessionId === sessionId && member.connected,
    "INACTIVE_SESSION",
    "This room is controlled by another session. Reconnect to take over.",
  );
  const receipt = room.receipts[command.requestId];
  if (receipt) {
    ensure(
      receipt.userId === user.id,
      "REQUEST_CONFLICT",
      "Request ID already used",
    );
    return false;
  }
  ensure(
    command.expectedVersion === room.version,
    "STALE_VERSION",
    "Room changed. Review the latest state and try again.",
  );
  ensure(
    !["completed", "cancelled"].includes(room.status) ||
      ["lineup", "leave", "chat"].includes(command.type),
    "ROOM_CLOSED",
    "Auction is closed",
  );
  const host = () =>
    ensure(
      room.hostId === user.id,
      "HOST_REQUIRED",
      "Only the host can do this",
    );
  const lobby = () =>
    ensure(
      room.status === "lobby",
      "SETTINGS_FROZEN",
      "Settings are frozen after the auction starts",
    );
  const payload = command.payload;
  switch (command.type) {
    case "ready":
      lobby();
      member.ready = !member.ready;
      break;
    case "start":
      host();
      lobby();
      ensure(
        room.members.filter(active).length >= 2 &&
          room.members.filter(active).every((m) => m.connected && m.ready),
        "NOT_READY",
        "At least two connected owners must all be ready",
      );
      room.queue = dataset.players.map((p) => p.id);
      room.round = 1;
      nextLot(room, dataset, now);
      break;
    case "bid":
    case "pass": {
      ensure(
        room.status === "running" && room.lot && !room.lot.resolved,
        "NOT_RUNNING",
        "No active lot",
      );
      const lot = room.lot;
      ensure(
        command.lotId === lot.id,
        "STALE_LOT",
        "This player is no longer on the block",
      );
      ensure(now < lot.endsAt, "DEADLINE", "Bidding has closed");
      ensure(!member.left && !member.blocked, "FORBIDDEN", "Team is inactive");
      ensure(
        lot.highest !== member.id,
        "HIGHEST_BIDDER",
        "You already hold the highest bid",
      );
      ensure(
        !lot.passed.includes(member.id),
        "ALREADY_PASSED",
        "Pass is final for this lot",
      );
      const player = dataset.players.find((p) => p.id === lot.playerId)!;
      if (command.type === "bid") {
        const error = ineligible(room, member, player, dataset);
        ensure(!error, "INELIGIBLE", error ?? "Cannot bid");
        lot.bid = nextBid(room, player);
        lot.highest = member.id;
        lot.endsAt = now + room.settings.timerSeconds * 1000;
        room.bids.push({
          id: command.requestId,
          lotId: lot.id,
          memberId: member.id,
          amount: lot.bid,
          at: now,
        });
      } else lot.passed.push(member.id);
      earlyResolution(room, dataset, now);
      break;
    }
    case "team": {
      lobby();
      const teamId = String(payload.teamId);
      ensure(
        dataset.teams.some((t) => t.id === teamId) &&
          !room.members.some(
            (m) => active(m) && m.teamId === teamId && m.id !== member.id,
          ),
        "TEAM_TAKEN",
        "Team is unavailable",
      );
      member.teamId = teamId;
      room.members.forEach((m) => (m.ready = false));
      break;
    }
    case "settings": {
      host();
      lobby();
      const next = settingsSchema.parse({
        ...room.settings,
        ...payload,
        password: "",
        teamId: member.teamId,
      });
      ensure(
        next.datasetId === room.settings.datasetId,
        "DATASET_FROZEN",
        "Create a new room to change datasets",
      );
      ensure(
        next.maxTeams <= dataset.teams.length &&
          next.maxTeams >= room.members.filter(active).length,
        "CAPACITY",
        "Invalid team capacity",
      );
      const { password: _password, ...settings } = next;
      room.settings = settings;
      room.members.forEach((m) => {
        m.ready = false;
        m.budget = settings.budget;
      });
      break;
    }
    case "kick": {
      host();
      const target = room.members.find((m) => m.id === payload.memberId);
      ensure(
        target && target.userId !== user.id,
        "INVALID_MEMBER",
        "Select another owner",
      );
      target.blocked = true;
      target.connected = false;
      target.disconnectedAt = now;
      room.blocks.push(target.userId);
      if (room.status === "lobby")
        room.members = room.members.filter((m) => m.id !== target.id);
      break;
    }
    case "transfer": {
      host();
      const target = room.members.find(
        (m) => m.id === payload.memberId && active(m) && m.connected,
      );
      ensure(target, "INVALID_MEMBER", "Choose a connected owner");
      room.hostId = target.userId;
      break;
    }
    case "leave": {
      member.connected = false;
      member.left = true;
      member.disconnectedAt = now;
      delete member.sessionId;
      if (room.status === "lobby")
        room.members = room.members.filter((m) => m.id !== member.id);
      if (room.hostId === user.id) {
        const next = room.members
          .filter((m) => active(m) && m.connected)
          .sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (next) room.hostId = next.userId;
        else if (room.status === "lobby") room.status = "cancelled";
        else if (room.status === "running") room.status = "paused";
      }
      break;
    }
    case "pause":
      host();
      ensure(
        room.status === "running",
        "INVALID_STATE",
        "Only a running auction can be paused",
      );
      room.status = "paused";
      break;
    case "resume":
      host();
      ensure(
        room.status === "paused",
        "INVALID_STATE",
        "Auction is not paused",
      );
      if (room.lot && !room.lot.resolved) {
        room.lot.endsAt = now + room.settings.timerSeconds * 1000;
        room.status = "running";
      } else nextLot(room, dataset, now);
      break;
    case "rerun":
      host();
      ensure(
        room.status === "unsold_decision",
        "INVALID_STATE",
        "Wait until this round finishes",
      );
      room.queue = room.unsold;
      room.unsold = [];
      room.round++;
      nextLot(room, dataset, now);
      break;
    case "finish":
      host();
      ensure(
        room.status === "unsold_decision",
        "INVALID_STATE",
        "Finish after the current round",
      );
      room.status = "completed";
      break;
    case "cancel":
      host();
      lobby();
      room.status = "cancelled";
      break;
    case "chat": {
      ensure(!member.left, "FORBIDDEN", "Rejoin the room to chat");
      const text = String(payload.text ?? "").trim();
      ensure(
        text.length > 0 && text.length <= 500,
        "INVALID_MESSAGE",
        "Message must contain 1–500 characters",
      );
      const recent = room.chat.filter(
        (m) => m.userId === user.id && now - m.at < 10000,
      );
      ensure(
        recent.length < 5,
        "RATE_LIMIT",
        "Please wait before sending more messages",
      );
      room.chat.push({
        id: randomUUID(),
        requestId: command.requestId,
        userId: user.id,
        name: user.name,
        text,
        at: now,
      });
      room.chat = room.chat.slice(-1000);
      break;
    }
    case "lineup": {
      ensure(
        room.status === "completed",
        "INVALID_STATE",
        "Lineups can be saved after completion",
      );
      updateLineup(member, payload);
      break;
    }
  }
  if (
    ["kick", "leave"].includes(command.type) &&
    room.status === "running" &&
    room.lot &&
    !room.lot.resolved
  )
    earlyResolution(room, dataset, now);
  room.version++;
  room.receipts[command.requestId] = { userId: user.id, at: now };
  return true;
}
export function tickRoom(room: Room, dataset: Dataset, now: number) {
  let changed = false;
  for (const m of [...room.members])
    if (
      !m.connected &&
      !m.graceExpired &&
      m.disconnectedAt &&
      now - m.disconnectedAt >= 120000
    ) {
      m.graceExpired = true;
      changed = true;
      if (room.status === "lobby") {
        room.members = room.members.filter((x) => x.id !== m.id);
        changed = true;
      }
      if (room.hostId === m.userId) {
        const next = room.members
          .filter((x) => active(x) && x.connected)
          .sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (next) {
          room.hostId = next.userId;
          changed = true;
        } else if (room.status === "running") {
          room.status = "paused";
          changed = true;
        } else if (room.status === "lobby") {
          room.status = "cancelled";
          changed = true;
        }
      }
    }
  if (room.status === "running" && room.lot && now >= room.lot.endsAt) {
    resolveLot(room, now);
    changed = true;
  }
  if (
    room.status === "reveal" &&
    room.lot?.revealEndsAt &&
    now >= room.lot.revealEndsAt
  ) {
    nextLot(room, dataset, now);
    changed = true;
  }
  if (changed) room.version++;
  return changed;
}
