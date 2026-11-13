import { ensure, type Member } from "@cricket/shared";
export function updateLineup(member: Member, payload: Record<string, unknown>) {
  const ids = Array.isArray(payload.players) ? payload.players.map(String) : [];
  ensure(
    ids.length === Math.min(11, member.purchases.length) &&
      new Set(ids).size === ids.length &&
      ids.every((id) => member.purchases.some((p) => p.playerId === id)),
    "INVALID_LINEUP",
    "Choose a complete XI from your purchased players",
  );
  const captain = String(payload.captain ?? "");
  const vice = String(payload.viceCaptain ?? "");
  if (!member.purchases.length && !ids.length && !captain && !vice) {
    member.lineup = [];
    delete member.captain;
    delete member.viceCaptain;
    return;
  }
  ensure(
    ids.includes(captain) &&
      (ids.length < 2 ? vice === "" : ids.includes(vice) && captain !== vice),
    "INVALID_CAPTAINS",
    "Choose different captain and vice-captain from your XI (vice-captain is optional for a one-player squad)",
  );
  member.lineup = ids;
  member.captain = captain;
  member.viceCaptain = vice || undefined;
}
