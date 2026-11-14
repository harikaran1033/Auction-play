import type { Pool } from "pg";
import type { Dataset } from "@cricket/shared";

// Add/update catalogue rows only. Historical player/team rows are never deleted.
export async function seedCatalog(pool: Pool, datasets: Dataset[]) {
  const teams = datasets.flatMap((d) =>
    d.teams.map((t) => ({ ...t, dataset_id: d.id })),
  );
  const players = [
    ...new Map(
      datasets.flatMap((d) => d.players).map((p) => [p.id, p]),
    ).values(),
  ];
  const entries = datasets.flatMap((d) =>
    d.players.map((p) => ({
      dataset_id: d.id,
      player_id: p.id,
      role: p.role,
      base_price: p.basePrice,
      source_team_id: d.teams.find((t) => t.name === p.sourceTeam)?.id ?? null,
      batting_style: p.battingStyle ?? null,
      bowling_style: p.bowlingStyle ?? null,
      image_url: p.imageUrl ?? null,
      stats: p.stats,
    })),
  );
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query(
      `insert into leagues(id,name)
      select id,league from jsonb_to_recordset($1::jsonb) as x(id text,league text)
      on conflict(id) do update set name=excluded.name`,
      [JSON.stringify(datasets.map((d) => ({ id: d.id, league: d.league })))],
    );
    await db.query(
      `insert into datasets(id,league_id,name,domestic_nations,unit,scale,fixture,source)
      select id,id,name,domestic_nations,unit,scale,fixture,source
      from jsonb_to_recordset($1::jsonb) as x(id text,name text,domestic_nations text[],unit text,scale integer,fixture boolean,source text)
      on conflict(id) do update set name=excluded.name,domestic_nations=excluded.domestic_nations,
        unit=excluded.unit,scale=excluded.scale,fixture=excluded.fixture,source=excluded.source`,
      [
        JSON.stringify(
          datasets.map((d) => ({
            ...d,
            players: undefined,
            teams: undefined,
            domestic_nations: d.domesticNations,
          })),
        ),
      ],
    );
    await db.query(
      `insert into league_teams(id,dataset_id,name,short_name,color)
      select id,dataset_id,name,"shortName",color from jsonb_to_recordset($1::jsonb)
        as x(id text,dataset_id text,name text,"shortName" text,color text)
      on conflict(id) do update set name=excluded.name,short_name=excluded.short_name,color=excluded.color`,
      [JSON.stringify(teams)],
    );
    await db.query(
      `insert into players(id,name,nation)
      select id,name,nation from jsonb_to_recordset($1::jsonb) as x(id text,name text,nation text)
      on conflict(id) do update set name=excluded.name,nation=excluded.nation`,
      [JSON.stringify(players)],
    );
    await db.query(
      `insert into dataset_players(dataset_id,player_id,role,base_price,source_team_id,batting_style,bowling_style,image_url,stats)
      select dataset_id,player_id,role,base_price,source_team_id,batting_style,bowling_style,image_url,stats
      from jsonb_to_recordset($1::jsonb) as x(dataset_id text,player_id text,role text,base_price integer,source_team_id text,batting_style text,bowling_style text,image_url text,stats jsonb)
      on conflict(dataset_id,player_id) do update set role=excluded.role,base_price=excluded.base_price,
        source_team_id=excluded.source_team_id,batting_style=excluded.batting_style,bowling_style=excluded.bowling_style,
        image_url=excluded.image_url,stats=excluded.stats`,
      [JSON.stringify(entries)],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
