import { describe, it, expect, beforeAll } from "vitest";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
import { makeRoom } from "../apps/server/src/rooms.js";
import { settingsSchema, type Dataset } from "@cricket/shared";
import {
  assertVoiceMember,
  voiceIceServers,
} from "../apps/server/src/voice.js";
let dataset: Dataset;
beforeAll(async () => {
  dataset = (await loadCatalog()).datasets.find(
    (dataset) => dataset.id === "ipl",
  )!;
});
function room() {
  const result = makeRoom(
    { id: "owner", name: "Owner" },
    dataset,
    settingsSchema.parse({
      name: "Voice room",
      datasetId: dataset.id,
      teamId: dataset.teams[0].id,
      voice: true,
    }),
  );
  result.members[0].connected = true;
  result.members[0].sessionId = "current-session";
  return result;
}
describe("voice membership", () => {
  it("allows the connected owner's current auction session without changing game state", () => {
    const state = room(),
      before = structuredClone(state);
    expect(assertVoiceMember(state, "owner", "current-session").userId).toBe(
      "owner",
    );
    expect(state).toEqual(before);
  });
  it.each(["completed", "cancelled"] as const)(
    "rejects voice in a %s room",
    (status) => {
      const state = room();
      state.status = status;
      expect(() =>
        assertVoiceMember(state, "owner", "current-session"),
      ).toThrow("membership");
    },
  );
  it.each([
    "connected",
    "left",
    "blocked",
    "disabled",
    "session",
    "outsider",
    "blocklist",
  ])("rejects invalid voice access: %s", (condition) => {
    const state = room();
    if (condition === "connected") state.members[0].connected = false;
    if (condition === "left") state.members[0].left = true;
    if (condition === "blocked") state.members[0].blocked = true;
    if (condition === "disabled") state.settings.voice = false;
    if (condition === "blocklist") state.blocks.push("owner");
    expect(() =>
      assertVoiceMember(
        state,
        condition === "outsider" ? "outsider" : "owner",
        condition === "session" ? "old-session" : "current-session",
      ),
    ).toThrow();
  });
  it("validates ICE configuration and supports local-only and TURN deployments", () => {
    expect(voiceIceServers("")).toHaveLength(1);
    expect(voiceIceServers("[]")).toEqual([]);
    expect(
      voiceIceServers(
        JSON.stringify([
          {
            urls: "turns:relay.example.test:5349",
            username: "voice",
            credential: "test",
          },
        ]),
      )[0].urls,
    ).toContain("turns:");
    expect(() =>
      voiceIceServers('[{"urls":"https://invalid.test"}]'),
    ).toThrow();
  });
});
