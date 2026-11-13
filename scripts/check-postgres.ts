import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { databaseConnectionString } from "../apps/server/src/database.js";
import { settingsSchema, type Command, type User } from "@cricket/shared";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
import { makeRoom, joinRoom } from "../apps/server/src/rooms.js";
import { PgRepository } from "../apps/server/src/storage.js";
import { applyCommand, tickRoom } from "../apps/server/src/auction/engine.js";
import {
  proposeTrade,
  respondTrade,
} from "../apps/server/src/auction/trades.js";

const pool = new Pool({
  connectionString: databaseConnectionString(process.env.DATABASE_URL),
  connectionTimeoutMillis: 15000,
});
let db: PoolClient | undefined;
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  db = await pool.connect();
  await db.query("begin");
  const owner = { id: randomUUID(), name: "Postgres check owner" },
    guest = { id: randomUUID(), name: "Postgres check guest" };
  for (const user of [owner, guest])
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [user.id, `${user.id}@example.invalid`, { display_name: user.name }],
    );
  // Repository commits release a savepoint, keeping every synthetic row inside the outer rollback.
  const connection = db;
  const testingPool = {
    query: (sql: string, values?: unknown[]) => connection.query(sql, values),
    connect: async () => ({
      query: (sql: string, values?: unknown[]) => {
        const command = sql.trim().toLowerCase();
        return connection.query(
          command === "begin"
            ? "savepoint repository_check"
            : command === "commit"
              ? "release savepoint repository_check"
              : command === "rollback"
                ? "rollback to savepoint repository_check"
                : sql,
          values,
        );
      },
      release: () => {},
    }),
  } as unknown as Pool;
  const repository = new PgRepository(testingPool);
  const dataset = (await loadCatalog()).datasets.find(
    (d) => d.id === "fixture",
  )!;
  // Exercise the real foreign keys for the startup failure: every lobby seat
  // already has a saved_lineups row, including seats that have never bought.
  for (const reason of ["leave", "kick", "expiry"] as const) {
    const lobby = makeRoom(
      owner,
      dataset,
      settingsSchema.parse({
        name: `Rollback-only lobby ${reason}`,
        datasetId: dataset.id,
        teamId: dataset.teams[0].id,
        maxTeams: 2,
        squadSize: 2,
        overseasCap: 2,
        budget: 1000,
        reserveBudget: false,
      }),
    );
    await repository.create(lobby);
    const joined = await repository.mutate(lobby.id, (r) => {
      joinRoom(r, guest, dataset, dataset.teams[1].id, "");
      for (const member of r.members) {
        member.connected = true;
        member.sessionId = member.userId;
      }
    });
    const departing = joined.members.find((m) => m.userId === guest.id)!;
    const lineups = async () =>
      (
        await connection.query(
          "select membership_id from saved_lineups where membership_id=any($1::uuid[]) order by membership_id",
          [joined.members.map((m) => m.id)],
        )
      ).rows
        .map((row) => row.membership_id)
        .sort();
    assert.equal((await lineups()).length, 2);
    if (reason === "leave") {
      await assert.rejects(
        repository.mutate(lobby.id, (r) => {
          r.members = r.members.filter((m) => m.id !== departing.id);
          r.members[0].budget = -1;
        }),
        { code: "23514" },
      );
      assert.equal(
        (await lineups()).length,
        2,
        "failed cleanup must restore dependent lineups",
      );
      assert.equal((await repository.get(lobby.id))!.members.length, 2);
    }
    const removed = await repository.mutate(lobby.id, (r) => {
      if (reason === "expiry") {
        const member = r.members.find((m) => m.id === departing.id)!;
        member.connected = false;
        member.disconnectedAt = Date.now() - 120001;
        tickRoom(r, dataset, Date.now());
      } else {
        const actor = reason === "leave" ? guest : owner;
        applyCommand(r, dataset, actor, actor.id, {
          requestId: randomUUID(),
          roomId: r.id,
          expectedVersion: r.version,
          type: reason,
          payload: reason === "kick" ? { memberId: departing.id } : {},
        });
      }
    });
    assert.equal(removed.members.length, 1);
    assert.deepEqual(await lineups(), [removed.members[0].id]);
    assert.equal(
      (
        await connection.query(
          "select count(*)::int as count from room_memberships where room_id=$1",
          [lobby.id],
        )
      ).rows[0].count,
      1,
    );
    if (reason !== "kick") {
      const rejoined = await repository.mutate(lobby.id, (r) => {
        joinRoom(r, guest, dataset, dataset.teams[1].id, "");
      });
      const newSeat = rejoined.members.find((m) => m.userId === guest.id)!;
      assert.notEqual(newSeat.id, departing.id);
      assert.equal(
        (
          await connection.query(
            "select count(*)::int as count from saved_lineups where membership_id=$1",
            [newSeat.id],
          )
        ).rows[0].count,
        1,
      );
    }
  }
  const room = makeRoom(
    owner,
    dataset,
    settingsSchema.parse({
      name: "Rollback-only repository check",
      datasetId: dataset.id,
      teamId: dataset.teams[0].id,
      maxTeams: 2,
      budget: 1000,
      squadSize: 2,
      overseasCap: 2,
      timerSeconds: 120,
      reserveBudget: false,
      visibility: "private",
    }),
  );
  await repository.create(room);
  await repository.mutate(room.id, (r) => {
    joinRoom(r, guest, dataset, dataset.teams[1].id, "");
    r.members.forEach((m) => {
      m.connected = true;
      m.sessionId = m.userId;
      m.ready = true;
    });
  });
  async function command(
    actor: User,
    type: Command["type"],
    payload: Command["payload"] = {},
  ) {
    const current = (await repository.get(room.id))!;
    return repository.mutate(room.id, (r) => {
      applyCommand(r, dataset, actor, actor.id, {
        requestId: randomUUID(),
        roomId: room.id,
        lotId: current.lot?.id,
        expectedVersion: current.version,
        type,
        payload,
      });
    });
  }
  await command(owner, "start");
  await command(owner, "bid");
  const sold = await command(guest, "pass");
  await command(owner, "chat", { text: "Rollback-only chat check" });
  await repository.mutate(room.id, (r) => {
    r.version++;
  });
  await db.query("set constraints all immediate");
  const ledger = await db.query(
    "select (select count(*)::int from room_memberships where room_id=$1) as members,(select count(*)::int from auction_lots where room_id=$1) as lots,(select count(*)::int from bids where room_id=$1) as bids,(select count(*)::int from purchases where room_id=$1) as purchases,(select count(*)::int from chat_messages where room_id=$1) as messages",
    [room.id],
  );
  assert.deepEqual(ledger.rows[0], {
    members: 2,
    lots: 1,
    bids: 1,
    purchases: 1,
    messages: 1,
  });
  let balance = sold.members.find((m) => m.userId === owner.id)!.budget;
  assert.equal(balance, 1000 - dataset.players[0].basePrice);
  const tradeRequest = randomUUID();
  await repository.mutate(room.id, (room) => {
    proposeTrade(room, dataset, guest.id, {
      requestId: tradeRequest,
      toMemberId: room.members.find((member) => member.userId === owner.id)!.id,
      offeredPlayerIds: [],
      requestedPlayerIds: [dataset.players[0].id],
      offeredCash: 100,
      requestedCash: 0,
      sessionId: guest.id,
    });
  });
  await repository.mutate(room.id, (room) => {
    respondTrade(room, dataset, owner.id, tradeRequest, "accept", owner.id);
  });
  const traded = (await repository.get(room.id))!;
  const newOwner = traded.members.find((member) => member.userId === guest.id)!;
  assert.equal(traded.trades?.[0].status, "accepted");
  assert.equal(newOwner.purchases[0].playerId, dataset.players[0].id);
  const custody = await db.query(
    "select membership_id,amount from purchases where room_id=$1 and player_id=$2",
    [room.id, dataset.players[0].id],
  );
  assert.equal(custody.rows[0].membership_id, newOwner.id);
  assert.equal(custody.rows[0].amount, dataset.players[0].basePrice);
  balance += 100;
  await assert.rejects(
    repository.mutate(room.id, (r) => {
      r.members[0].budget = -1;
    }),
    { code: "23514" },
  );
  assert.equal((await repository.get(room.id))!.members[0].budget, balance);
  await db.query("rollback");
  console.log(
    "Postgres verification passed: lobby leave/kick/expiry/rejoin, cleanup rollback, batch writes, auction ledgers, atomic trade balances/custody, deduplication and foreign keys. All synthetic data rolled back.",
  );
} catch (error) {
  if (db) await db.query("rollback");
  console.error(
    `Postgres verification failed (${(error as { code?: string }).code ?? "CHECK_FAILED"}); synthetic data rolled back.`,
  );
  process.exitCode = 1;
} finally {
  db?.release();
  await pool.end();
}
