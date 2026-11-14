import { test, expect, type BrowserContext } from "@playwright/test";
import { money } from "@cricket/shared";

async function account(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/auth", {
    data: {
      email: `${name}-${Date.now()}@example.test`,
      password: "Cricket123!",
      name,
      register: true,
    },
  });
  expect(response.ok()).toBe(true);
  const auth = await response.json();
  await context.addInitScript((token) => {
    if (location.protocol === "http:")
      localStorage.setItem("cricket-token", token);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copiedSquad = text;
        },
      },
    });
  }, auth.token);
  return auth;
}

test("season controls, set labels, lakh bids, squad copying and personal room deletion work on mobile", async ({
  browser,
}) => {
  const first = await browser.newContext({
      baseURL: "http://127.0.0.1:5175",
      viewport: { width: 390, height: 844 },
    }),
    second = await browser.newContext({ baseURL: "http://127.0.0.1:5175" });
  try {
    const a = await account(first, "OptionsHost"),
      b = await account(second, "OptionsGuest");
    const host = await first.newPage(),
      guest = await second.newPage();
    await host.goto("/rooms/create?league=hundred");
    await expect(host.getByLabel("Currency display")).toHaveValue("inr");
    await expect(host.getByLabel("Player order")).toHaveValue("sets");
    await expect(host.getByLabel("Player pool")).toHaveValue("current");
    await expect(host.getByLabel("Bid increments")).toHaveValue("tiered");
    await expect(
      host.getByRole("button", { name: /London Spirit/ }).first(),
    ).toBeVisible();
    await expect(
      host.getByRole("button", { name: /SunRisers Leeds/ }).first(),
    ).toBeVisible();
    const catalogs = await (await first.request.get("/api/leagues")).json(),
      dataset = await (await first.request.get("/api/leagues/fixture")).json();
    expect(catalogs.find((d: any) => d.id === "hundred").teams).toHaveLength(8);
    const headers = { Authorization: `Bearer ${a.token}` };
    const created = await first.request.post("/api/rooms", {
      headers,
      data: {
        name: "Season options browser auction",
        datasetId: "fixture",
        teamId: dataset.teams[0].id,
        maxTeams: 2,
        squadSize: 1,
        overseasCap: 1,
        budget: 10000,
        timerSeconds: 120,
        reserveBudget: false,
        currency: "inr",
        bidMode: "tiered",
        auctionOrder: "sets",
      },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    const joined = await second.request.post(`/api/rooms/${room.id}/join`, {
      headers: { Authorization: `Bearer ${b.token}` },
      data: { teamId: dataset.teams[1].id },
    });
    expect(joined.ok()).toBe(true);
    const read = async () =>
      await (
        await first.request.get(`/api/rooms/${room.id}`, { headers })
      ).json();
    await host.goto(`/rooms/${room.id}/lobby`);
    await guest.goto(`/rooms/${room.id}/lobby`);
    await host.getByRole("button", { name: "I’m ready" }).click();
    await guest.getByRole("button", { name: "I’m ready" }).click();
    await host
      .getByRole("button", { name: "Start auction", exact: true })
      .click();
    await expect(host.locator(".auction-set-banner")).toBeVisible();
    await guest.getByRole("button", { name: /^Bid / }).click();
    await expect.poll(async () => (await read()).lot.highest).toBeTruthy();
    const firstBid = (await read()).lot.bid;
    await expect(
      host.getByRole("button", {
        name: `Bid ${money(firstBid + 50, undefined, "inr")}`,
        exact: true,
      }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "Pass", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await read()).members.find((m: any) => m.userId === b.user.id)
            .purchases.length,
      )
      .toBe(1);
    await expect(host.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 15000,
    });
    await host.getByRole("button", { name: /^Bid / }).click();
    await expect
      .poll(
        async () =>
          (await read()).members.find((m: any) => m.userId === a.user.id)
            .purchases.length,
      )
      .toBe(1);
    await expect
      .poll(async () => (await read()).status, { timeout: 15000 })
      .toBe("completed");
    await host.goto(`/squads/${room.id}`);
    await host.getByRole("button", { name: "Copy squad", exact: true }).click();
    await expect(
      host.getByRole("status").filter({ hasText: "Squad copied." }),
    ).toBeVisible();
    const text = await host.evaluate(() => (window as any).copiedSquad);
    expect(text).toContain("AuctionPlay");
    expect(text).toContain("Purse remaining: ₹");
    expect(text).toContain("Squad: 1 players");
    await host.screenshot({
      path: ".runtime/mobile-squad-options.png",
      fullPage: true,
    });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.goto("/");
    await host
      .getByRole("button", {
        name: `Delete room: ${room.settings.name}`,
        exact: true,
      })
      .click();
    await host
      .getByRole("button", { name: "Delete from My rooms", exact: true })
      .click();
    await expect(
      host.getByRole("button", {
        name: `Delete room: ${room.settings.name}`,
        exact: true,
      }),
    ).toHaveCount(0);
    const squads = await (
      await first.request.get("/api/squads", { headers })
    ).json();
    expect(squads.some((s: any) => s.roomId === room.id)).toBe(true);
    expect((await read()).status).toBe("completed");
  } finally {
    await first.close();
    await second.close();
  }
});
