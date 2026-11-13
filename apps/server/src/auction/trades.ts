import {
  ensure,
  isForeign,
  memberFor,
  type Room,
  type Dataset,
  type Member,
  type TradeOffer,
  type TradeProposal,
} from "@cricket/shared";
export function tradeMember(room: Room, userId: string, sessionId?: string) {
  ensure(
    !["lobby", "cancelled"].includes(room.status),
    "TRADE_CLOSED",
    "Trading opens after bidding starts and remains available in saved squads.",
  );
  const member = memberFor(room, userId);
  if (room.status !== "completed")
    ensure(
      member.connected &&
        !member.left &&
        !!sessionId &&
        member.sessionId === sessionId,
      "INACTIVE_SESSION",
      "Rejoin this auction before trading.",
    );
  return member;
}
function participant(room: Room, id: string) {
  const member = room.members.find((member) => member.id === id);
  ensure(
    member &&
      !member.blocked &&
      !room.blocks.includes(member.userId) &&
      (room.status === "completed" || !member.left),
    "TRADE_MEMBER",
    "A team in this offer is no longer available to trade.",
  );
  return member;
}
function owns(member: Member, ids: string[]) {
  return ids.every((id) =>
    member.purchases.some((purchase) => purchase.playerId === id),
  );
}
function validate(
  room: Room,
  dataset: Dataset,
  offer: Pick<
    TradeOffer,
    | "fromMemberId"
    | "toMemberId"
    | "offeredPlayerIds"
    | "requestedPlayerIds"
    | "offeredCash"
    | "requestedCash"
  >,
) {
  ensure(
    offer.fromMemberId !== offer.toMemberId,
    "SELF_TRADE",
    "Choose another franchise.",
  );
  const from = participant(room, offer.fromMemberId),
    to = participant(room, offer.toMemberId);
  const all = [...offer.offeredPlayerIds, ...offer.requestedPlayerIds];
  ensure(
    new Set(all).size === all.length,
    "DUPLICATE_PLAYER",
    "Include each player only once.",
  );
  ensure(
    owns(from, offer.offeredPlayerIds) && owns(to, offer.requestedPlayerIds),
    "OWNERSHIP_CHANGED",
    "Player ownership changed. Create a new offer using the current squads.",
  );
  const fromPurchases = [
    ...from.purchases.filter(
      (purchase) => !offer.offeredPlayerIds.includes(purchase.playerId),
    ),
    ...to.purchases.filter((purchase) =>
      offer.requestedPlayerIds.includes(purchase.playerId),
    ),
  ];
  const toPurchases = [
    ...to.purchases.filter(
      (purchase) => !offer.requestedPlayerIds.includes(purchase.playerId),
    ),
    ...from.purchases.filter((purchase) =>
      offer.offeredPlayerIds.includes(purchase.playerId),
    ),
  ];
  const balances = [
    from.budget - offer.offeredCash + offer.requestedCash,
    to.budget + offer.offeredCash - offer.requestedCash,
  ];
  const minimum = Math.min(
    ...dataset.players.map((player) => player.basePrice),
  );
  for (const [i, member] of [from, to].entries()) {
    const purchases = i === 0 ? fromPurchases : toPurchases;
    const standingBid =
      room.status !== "completed" &&
      room.lot &&
      !room.lot.resolved &&
      room.lot.highest === member.id
        ? room.lot
        : undefined;
    const reservedSlots = purchases.length + (standingBid ? 1 : 0);
    ensure(
      Number.isSafeInteger(balances[i]) && balances[i] >= 0,
      "TRADE_BUDGET",
      `${member.name} does not have enough credits for this trade.`,
    );
    ensure(
      reservedSlots <= room.settings.squadSize,
      "TRADE_SQUAD",
      `${member.name}'s squad would exceed its limit. Offer a player swap instead.`,
    );
    const ids = [
      ...purchases.map((purchase) => purchase.playerId),
      ...(standingBid ? [standingBid.playerId] : []),
    ];
    ensure(
      ids.every((id) => dataset.players.some((player) => player.id === id)),
      "INVALID_PLAYER",
      "A player in this trade is not in the room dataset.",
    );
    ensure(
      ids.filter((id) =>
        isForeign(
          dataset.players.find((player) => player.id === id)!,
          dataset,
        ),
      ).length <= room.settings.overseasCap,
      "TRADE_OVERSEAS",
      `${member.name}'s overseas limit would be exceeded.`,
    );
    const commitment = standingBid?.bid ?? 0;
    ensure(
      balances[i] >= commitment,
      "TRADE_COMMITMENT",
      `${member.name}'s accepted highest bid must remain funded.`,
    );
    if (room.status !== "completed" && room.settings.reserveBudget)
      ensure(
        balances[i] - commitment >=
          Math.max(0, room.settings.squadSize - reservedSlots) * minimum,
        "TRADE_RESERVE",
        `${member.name} must retain the minimum budget for remaining squad slots.`,
      );
  }
  return { from, to, fromPurchases, toPurchases, balances };
}
export function proposeTrade(
  room: Room,
  dataset: Dataset,
  userId: string,
  input: TradeProposal,
  now = Date.now(),
) {
  const from = tradeMember(room, userId, input.sessionId);
  const fields = {
    fromMemberId: from.id,
    toMemberId: input.toMemberId,
    offeredPlayerIds: [...input.offeredPlayerIds].sort(),
    requestedPlayerIds: [...input.requestedPlayerIds].sort(),
    offeredCash: input.offeredCash,
    requestedCash: input.requestedCash,
  };
  const existing = room.trades?.find((offer) => offer.id === input.requestId);
  if (existing) {
    ensure(
      Object.entries(fields).every(
        ([key, value]) =>
          JSON.stringify(existing[key as keyof TradeOffer]) ===
          JSON.stringify(value),
      ),
      "REQUEST_CONFLICT",
      "This trade request ID has already been used.",
    );
    return existing;
  }
  validate(room, dataset, fields);
  ensure(
    (room.trades?.length ?? 0) < 500,
    "TRADE_LIMIT",
    "This room's trade history limit has been reached.",
  );
  ensure(
    (room.trades ?? []).filter(
      (offer) =>
        offer.fromMemberId === from.id &&
        offer.status === "pending" &&
        offer.expiresAt > now,
    ).length < 10,
    "TRADE_LIMIT",
    "Cancel or resolve an existing offer before sending more than ten pending offers.",
  );
  const offer: TradeOffer = {
    id: input.requestId,
    ...fields,
    status: "pending",
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
  (room.trades ??= []).push(offer);
  room.version++;
  return offer;
}
function cleanLineup(member: Member) {
  member.lineup = member.lineup.filter((id) =>
    member.purchases.some((purchase) => purchase.playerId === id),
  );
  if (!member.lineup.includes(member.captain ?? "")) delete member.captain;
  if (!member.lineup.includes(member.viceCaptain ?? ""))
    delete member.viceCaptain;
}
export function respondTrade(
  room: Room,
  dataset: Dataset,
  userId: string,
  id: string,
  action: "accept" | "reject" | "cancel",
  sessionId?: string,
  now = Date.now(),
) {
  const actor = tradeMember(room, userId, sessionId);
  const offer = room.trades?.find((offer) => offer.id === id);
  ensure(offer, "TRADE_NOT_FOUND", "Trade offer not found.");
  ensure(
    actor.id === (action === "cancel" ? offer.fromMemberId : offer.toMemberId),
    "FORBIDDEN",
    action === "cancel"
      ? "Only the sender can cancel this offer."
      : "Only the receiving owner can accept or reject this offer.",
  );
  const result =
    action === "accept"
      ? "accepted"
      : action === "reject"
        ? "rejected"
        : "cancelled";
  if (offer.status === result) return offer;
  ensure(
    offer.status === "pending",
    "TRADE_RESOLVED",
    "This offer is no longer pending.",
  );
  ensure(
    offer.expiresAt > now,
    "TRADE_EXPIRED",
    "This offer expired. Send a new offer.",
  );
  if (action === "accept") {
    const { from, to, fromPurchases, toPurchases, balances } = validate(
      room,
      dataset,
      offer,
    );
    from.purchases = fromPurchases.map((purchase) =>
      offer.requestedPlayerIds.includes(purchase.playerId)
        ? { ...purchase, tradeId: offer.id }
        : purchase,
    );
    to.purchases = toPurchases.map((purchase) =>
      offer.offeredPlayerIds.includes(purchase.playerId)
        ? { ...purchase, tradeId: offer.id }
        : purchase,
    );
    from.budget = balances[0];
    to.budget = balances[1];
    cleanLineup(from);
    cleanLineup(to);
    const moved = new Set([
      ...offer.offeredPlayerIds,
      ...offer.requestedPlayerIds,
    ]);
    for (const other of room.trades ?? [])
      if (
        other.id !== offer.id &&
        other.status === "pending" &&
        [...other.offeredPlayerIds, ...other.requestedPlayerIds].some((id) =>
          moved.has(id),
        )
      ) {
        other.status = "invalidated";
        other.reason = "A player moved in another accepted trade.";
        other.resolvedAt = now;
      }
  }
  offer.status = result;
  offer.resolvedAt = now;
  room.version++;
  return offer;
}
