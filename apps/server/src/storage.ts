import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { Pool } from "pg";
import type { Room } from "@cricket/shared";
import { root } from "./data/catalog.js";
import { databaseConnectionString } from "./database.js";

export interface Repository {
  all(): Promise<Room[]>;
  get(id: string): Promise<Room | undefined>;
  create(room: Room): Promise<void>;
  mutate(id: string, fn: (room: Room) => void): Promise<Room>;
}
// One instance, serialized mutations. The local adapter uses atomic file replacement.
export class FileRepository implements Repository {
  private rooms: Room[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private file = `${root}/.runtime/rooms.json`) {}
  async init() {
    try {
      this.rooms = JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return this;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  private async persist(rooms: Room[]) {
    await mkdir(`${root}/.runtime`, { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(rooms));
    await rename(`${this.file}.tmp`, this.file);
    this.rooms = rooms;
  }
  async all() {
    await this.tail;
    return structuredClone(this.rooms);
  }
  async get(id: string) {
    return (await this.all()).find((r) => r.id === id);
  }
  async create(room: Room) {
    return this.serial(async () => {
      if (this.rooms.some((r) => r.id === room.id || r.code === room.code))
        throw new Error("Duplicate room code");
      await this.persist([...this.rooms, room]);
    });
  }
  async mutate(id: string, fn: (r: Room) => void) {
    return this.serial(async () => {
      const rooms = structuredClone(this.rooms);
      const room = rooms.find((r) => r.id === id);
      if (!room) throw new Error("Room not found");
      fn(room);
      await this.persist(rooms);
      return structuredClone(room);
    });
  }
}
export class PgRepository implements Repository {
  constructor(public pool: Pool) {}
  async all() {
    const { rows } = await this.pool.query("select state from rooms");
    return rows.map((r) => r.state as Room);
  }
  async get(id: string) {
    const { rows } = await this.pool.query(
      "select state from rooms where id=$1",
      [id],
    );
    return rows[0]?.state as Room | undefined;
  }
  async create(room: Room) {
    await this.pool.query(
      "insert into rooms(id,code,host_id,dataset_id,status,version,state) values($1,$2,$3,$4,$5,$6,$7)",
      [
        room.id,
        room.code,
        room.hostId,
        room.settings.datasetId,
        room.status,
        room.version,
        room,
      ],
    );
  }
  async mutate(id: string, fn: (r: Room) => void) {
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      const { rows } = await db.query(
        "select state from rooms where id=$1 for update",
        [id],
      );
      if (!rows.length) throw new Error("Room not found");
      const room = rows[0].state as Room;
      fn(room);
      await db.query(
        "update rooms set host_id=$2,status=$3,version=$4,state=$5 where id=$1",
        [id, room.hostId, room.status, room.version, room],
      );
      await db.query(
        // Lobby leave/kick/grace expiry can remove a membership from the snapshot.
        // Delete its dependent lineup first; auction bid/purchase foreign keys
        // deliberately remain restrictive to protect historical ownership.
        `delete from saved_lineups as lineup using room_memberships as member
         where lineup.membership_id=member.id and member.room_id=$1
         and not (member.id=any($2::uuid[]))`,
        [id, room.members.map((m) => m.id)],
      );
      await db.query(
        "delete from room_memberships where room_id=$1 and not (id=any($2::uuid[]))",
        [id, room.members.map((m) => m.id)],
      );
      await db.query(
        `insert into room_memberships(id,room_id,user_id,team_id,budget,blocked)
         select x.id,$1,x.user_id,x.team_id,x.budget,x.blocked from jsonb_to_recordset($2::jsonb) as x(id uuid,user_id uuid,team_id text,budget integer,blocked boolean)
         on conflict(id) do update set team_id=excluded.team_id,budget=excluded.budget,blocked=excluded.blocked`,
        [
          id,
          JSON.stringify(
            room.members.map((m) => ({
              id: m.id,
              user_id: m.userId,
              team_id: m.teamId,
              budget: m.budget,
              blocked: !!m.blocked,
            })),
          ),
        ],
      );
      await db.query(
        `insert into saved_lineups(membership_id,players,captain,vice_captain)
         select x.membership_id,x.players,x.captain,x.vice_captain from jsonb_to_recordset($1::jsonb) as x(membership_id uuid,players text[],captain text,vice_captain text)
         on conflict(membership_id) do update set players=excluded.players,captain=excluded.captain,vice_captain=excluded.vice_captain`,
        [
          JSON.stringify(
            room.members.map((m) => ({
              membership_id: m.id,
              players: m.lineup,
              captain: m.captain ?? null,
              vice_captain: m.viceCaptain ?? null,
            })),
          ),
        ],
      );
      await db.query(
        `insert into room_blocks(room_id,user_id) select $1,x.user_id from jsonb_to_recordset($2::jsonb) as x(user_id uuid) on conflict do nothing`,
        [
          id,
          JSON.stringify(room.blocks.map((userId) => ({ user_id: userId }))),
        ],
      );
      const lots = [
        ...room.lots,
        ...(room.lot && !room.lots.some((l) => l.id === room.lot!.id)
          ? [room.lot]
          : []),
      ];
      await db.query(
        `insert into auction_lots(id,room_id,player_id,state) select x.id,$1,x.player_id,x.state from jsonb_to_recordset($2::jsonb) as x(id uuid,player_id text,state jsonb)
         on conflict(id) do update set state=excluded.state`,
        [
          id,
          JSON.stringify(
            lots.map((lot) => ({
              id: lot.id,
              player_id: lot.playerId,
              state: lot,
            })),
          ),
        ],
      );
      await db.query(
        `insert into purchases(lot_id,room_id,membership_id,player_id,amount) select x.lot_id,$1,x.membership_id,x.player_id,x.amount from jsonb_to_recordset($2::jsonb) as x(lot_id uuid,membership_id uuid,player_id text,amount integer) on conflict(lot_id) do update set membership_id=excluded.membership_id`,
        [
          id,
          JSON.stringify(
            room.members.flatMap((m) =>
              m.purchases.map((p) => ({
                lot_id: p.lotId,
                membership_id: m.id,
                player_id: p.playerId,
                amount: p.amount,
              })),
            ),
          ),
        ],
      );
      await db.query(
        `insert into bids(id,room_id,lot_id,membership_id,amount,created_at) select x.id,$1,x.lot_id,x.membership_id,x.amount,to_timestamp(x.at/1000.0) from jsonb_to_recordset($2::jsonb) as x(id uuid,lot_id uuid,membership_id uuid,amount integer,at bigint) on conflict(id) do nothing`,
        [
          id,
          JSON.stringify(
            room.bids.map((bid) => ({
              id: bid.id,
              lot_id: bid.lotId,
              membership_id: bid.memberId,
              amount: bid.amount,
              at: bid.at,
            })),
          ),
        ],
      );
      await db.query(
        `insert into chat_messages(id,room_id,user_id,display_name,body,created_at) select x.id,$1,x.user_id,x.display_name,x.body,to_timestamp(x.at/1000.0) from jsonb_to_recordset($2::jsonb) as x(id uuid,user_id uuid,display_name text,body text,at bigint) on conflict(id) do nothing`,
        [
          id,
          JSON.stringify(
            room.chat.map((message) => ({
              id: message.id,
              user_id: message.userId,
              display_name: message.name,
              body: message.text,
              at: message.at,
            })),
          ),
        ],
      );
      await db.query(
        "delete from chat_messages where room_id=$1 and id not in (select id from chat_messages where room_id=$1 order by created_at desc limit 1000)",
        [id],
      );
      await db.query("commit");
      return room;
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      db.release();
    }
  }
}
export async function createRepository() {
  if (process.env.DATABASE_URL)
    return new PgRepository(
      new Pool({
        connectionString: databaseConnectionString(process.env.DATABASE_URL),
        connectionTimeoutMillis: 15000,
        statement_timeout: 30000,
      }),
    );
  if (process.env.NODE_ENV === "production")
    throw new Error("Production requires DATABASE_URL and Supabase Auth");
  return new FileRepository().init();
}
