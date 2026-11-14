import { test, expect, type BrowserContext } from "@playwright/test";
import { loadCatalog } from "../../apps/server/src/data/catalog.js";
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
  }, auth.token);
  return auth;
}
test("an owner finds and rejoins a full private auction from Home and its invitation without losing purchases", async ({
  browser,
}) => {
  const first = await browser.newContext({ baseURL: "http://127.0.0.1:5175" }),
    second = await browser.newContext({ baseURL: "http://127.0.0.1:5175" });
  try {
    const a = await account(first, "RejoinHost"),
      b = await account(second, "RejoinGuest");
    const fallbackCatalog = (await loadCatalog()).datasets.find(
      (dataset) => dataset.id === "ipl",
    )!;
    for (const context of [first, second]) {
      await context.route("**/api/leagues/ipl", (route) =>
        route.fulfill({ json: fallbackCatalog }),
      );
    }
    const catalogs = await (
      await first.request.get("/api/leagues", { timeout: 15000 })
    ).json();
    const catalog = catalogs.find((d: { id: string }) => d.id === "ipl");
    const response = await first.request.post("/api/rooms", {
      headers: { Authorization: `Bearer ${a.token}` },
      data: {
        name: "Private rejoin acceptance",
        auctionOrder: "source",
        datasetId: "ipl",
        teamId: catalog.teams[0].id,
        visibility: "private",
        password: "room-password",
        maxTeams: 2,
        budget: 10000,
        squadSize: 3,
        overseasCap: 3,
        timerSeconds: 120,
        increment: 10,
        reserveBudget: false,
        voice: false,
      },
    });
    expect(response.ok()).toBe(true);
    const room = await response.json();
    const joined = await second.request.post(`/api/rooms/${room.id}/join`, {
      headers: { Authorization: `Bearer ${b.token}` },
      data: { teamId: catalog.teams[1].id, password: "room-password" },
    });
    expect(joined.ok()).toBe(true);
    let host = await first.newPage();
    const guest = await second.newPage();
    await host.goto(`/rooms/${room.id}/lobby`);
    await guest.goto(`/rooms/${room.id}/lobby`);
    await expect(host.locator(".franchise-stage")).toContainText(
      "Selected by you",
    );
    await host
      .locator(".franchise-list")
      .getByRole("button", { name: new RegExp(catalog.teams[1].name) })
      .click();
    await expect(host.locator(".franchise-stage")).toContainText(
      "Taken by RejoinGuest",
    );
    await expect(
      host.getByRole("button", { name: "Franchise unavailable" }),
    ).toBeDisabled();
    await host
      .locator(".franchise-list")
      .getByRole("button", { name: new RegExp(catalog.teams[2].name) })
      .click();
    await host
      .getByRole("button", { name: "Select team", exact: true })
      .click();
    await expect(
      host.locator(".franchise-stage .franchise-ownership"),
    ).toContainText("Selected by you");
    await host
      .locator(".franchise-list")
      .getByRole("button", { name: new RegExp(catalog.teams[0].name) })
      .click();
    await host
      .getByRole("button", { name: "Select team", exact: true })
      .click();
    await expect(
      host.locator(".franchise-stage .franchise-ownership"),
    ).toContainText("Selected by you");
    await host.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await host
        .locator(".franchise-card")
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
      [360, 800],
    ]) {
      await host.setViewportSize({ width, height });
      expect(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await host.screenshot({
        path: `.runtime/ui-lobby-${width}x${height}.png`,
      });
    }
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.emulateMedia({ reducedMotion: "no-preference" });
    await guest.goto("/");
    await host
      .locator(".franchise-list")
      .getByRole("button", { name: new RegExp(catalog.teams[1].name) })
      .click();
    await expect(host.locator(".franchise-ownership")).toContainText(
      "disconnected owner",
    );
    await guest.goto(`/rooms/${room.id}/lobby`);
    await expect(host.locator(".franchise-ownership")).toContainText(
      "Taken by RejoinGuest",
    );
    await host
      .locator(".franchise-list")
      .getByRole("button", { name: new RegExp(catalog.teams[0].name) })
      .click();
    await host.getByRole("button", { name: "I’m ready" }).click();
    await guest.getByRole("button", { name: "I’m ready" }).click();
    await host.getByRole("button", { name: "Start auction" }).click();
    await expect(host).toHaveURL(/\/auction$/);
    await expect(guest).toHaveURL(/\/auction$/);
    await host.getByLabel("Manage RejoinGuest", { exact: true }).click();
    await expect(
      host
        .locator(".member-menu[open]")
        .getByRole("button", { name: "Remove RejoinGuest", exact: true }),
    ).toBeVisible();
    await host.getByLabel("Manage RejoinGuest", { exact: true }).click();
    await host.setViewportSize({ width: 1440, height: 900 });
    await expect(host.locator(".player-quick-stats > div")).toHaveCount(4);
    await expect(host.locator(".sidebar")).toHaveCount(0);
    const playerCard = host.getByRole("button", { name: /^View stats for / });
    await playerCard.click();
    const details = host.getByRole("dialog");
    await expect(details).toContainText("DEWALD BREVIS");
    await expect(details.locator(".detail-live-note")).toBeVisible();
    const clockText = await details.locator(".detail-live-note b").innerText();
    await expect
      .poll(() => details.locator(".detail-live-note b").innerText())
      .not.toBe(clockText);
    await details.getByRole("button", { name: "Batting", exact: true }).click();
    await expect(details.locator(".detail-metrics")).toContainText("Runs");
    await host.screenshot({ path: ".runtime/ui-player-stats.png" });
    await host.keyboard.press("Escape");
    await expect(playerCard).toBeFocused();
    await host.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Auction paused", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Chat", exact: true }).click();
    await host
      .getByRole("textbox", { name: "Chat message" })
      .fill("Keep this draft through the next lot");
    await host.getByRole("button", { name: "Teams", exact: true }).click();
    await guest.getByRole("button", { name: "Chat", exact: true }).click();
    await guest
      .getByRole("textbox", { name: "Chat message" })
      .fill("Ready for the auction");
    await guest.getByRole("button", { name: "Send message" }).click();
    await expect(host.locator(".unread-count")).toHaveText("1");
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
      [360, 800],
    ]) {
      await host.setViewportSize({ width, height });
      await expect(host.locator(".bid-controls")).toBeVisible();
      expect(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const bounds = await host.locator(".bid-controls").boundingBox();
      expect(bounds!.y).toBeGreaterThan(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      if (width >= 1000) {
        const strip = await host.locator(".player-quick-stats").boundingBox();
        const content = await host.locator(".lot-content").boundingBox();
        expect(strip!.y + strip!.height).toBeLessThanOrEqual(
          content!.y + content!.height,
        );
      }
      await host.screenshot({
        path: `.runtime/ui-auction-${width}x${height}.png`,
      });
    }
    const mobileNav = host.getByRole("navigation", { name: "Auction panels" });
    await mobileNav.getByRole("button", { name: /Chat/ }).click();
    await expect(
      host.getByRole("textbox", { name: "Chat message" }),
    ).toHaveValue("Keep this draft through the next lot");
    await expect(host.locator(".chat-messages")).toContainText(
      "Ready for the auction",
    );
    await host.screenshot({ path: ".runtime/ui-mobile-chat.png" });
    await host.getByRole("textbox", { name: "Chat message" }).focus();
    await host.setViewportSize({ width: 360, height: 500 });
    await expect(
      host.getByRole("textbox", { name: "Chat message" }),
    ).toBeFocused();
    await expect
      .poll(async () => {
        const bounds = await host
          .getByRole("textbox", { name: "Chat message" })
          .boundingBox();
        return bounds!.y + bounds!.height;
      })
      .toBeLessThanOrEqual(500);
    await host.screenshot({ path: ".runtime/ui-mobile-chat-short.png" });
    await host.setViewportSize({ width: 360, height: 800 });
    await host
      .getByRole("button", { name: "Close room panels", exact: true })
      .click();
    await mobileNav.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(host.getByRole("dialog", { name: "My squad" })).toBeVisible();
    await host.keyboard.press("Escape");
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(host.getByRole("dialog")).toContainText("Leave");
    await host.getByRole("button", { name: "Stay in room" }).click();
    // Local presentation fixtures only: the authoritative server room is unchanged.
    await host.evaluate(async () => {
      const modulePath = "/src/features/auction/transport.ts";
      const { useRoom } = await import(modulePath);
      const state = useRoom.getState();
      useRoom.setState({
        connected: false,
        room: {
          ...state.room,
          chat: Array.from({ length: 75 }, (_, i) => ({
            id: `ui-message-${i}`,
            userId: "ui-fixture",
            name: "Layout fixture",
            text: `Message ${i}: a longer cricket discussion to verify independent scrolling.`,
            at: Date.now() + i,
          })),
        },
      });
    });
    await expect(
      host.getByRole("button", { name: "Reconnecting…", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: /Chat/, exact: true }).click();
    await expect(host.locator(".chat-message")).toHaveCount(50);
    expect(
      await host
        .locator(".chat-messages")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    const bidBounds = await host.locator(".bid-controls").boundingBox();
    expect(bidBounds!.y + bidBounds!.height).toBeLessThanOrEqual(900);
    await host.screenshot({ path: ".runtime/ui-reconnecting-chat.png" });
    await host.evaluate(async () => {
      const modulePath = "/src/features/auction/transport.ts";
      const { useRoom } = await import(modulePath);
      useRoom.setState({ connected: true });
    });
    await host.getByRole("button", { name: "Resume", exact: true }).click();
    await host.getByRole("button", { name: /^Bid / }).click();
    await expect(
      host.getByRole("button", { name: "You hold the bid" }),
    ).toBeVisible();
    await guest.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(host.locator(".my-signings")).toContainText("DEWALD BREVIS");
    await expect(host.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 10000,
    });
    await host.getByRole("button", { name: /Chat/, exact: true }).click();
    await expect(
      host.getByRole("textbox", { name: "Chat message" }),
    ).toHaveValue("Keep this draft through the next lot");
    const before = await (
      await first.request.get(`/api/rooms/${room.id}`, {
        headers: { Authorization: `Bearer ${a.token}` },
      })
    ).json();
    const member = before.members.find((m: any) => m.userId === a.user.id);
    await host.close();
    host = await first.newPage();
    await host.goto("/");
    const list = host.getByRole("region", { name: "My rooms" });
    await expect(list).toContainText(room.settings.name);
    await host.setViewportSize({ width: 390, height: 844 });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await list.getByRole("link", { name: "Rejoin auction" }).click();
    await expect(host).toHaveURL(`/rooms/${room.id}/auction`);
    await expect(host.locator(".my-signings")).toContainText("DEWALD BREVIS");
    const after = await (
      await first.request.get(`/api/rooms/${room.id}`, {
        headers: { Authorization: `Bearer ${a.token}` },
      })
    ).json();
    const restored = after.members.find((m: any) => m.userId === a.user.id);
    expect(restored.teamId).toBe(member.teamId);
    expect(restored.budget).toBe(member.budget);
    expect(restored.purchases).toEqual(member.purchases);
    expect(after.members).toHaveLength(2);
    await host.goto(`/join?code=${room.code}`);
    await host.getByRole("button", { name: "Find room" }).click();
    await expect(host).toHaveURL(`/rooms/${room.id}/auction`);
    await expect(host.locator(".my-signings")).toContainText("DEWALD BREVIS");
    await host.goto("/rooms");
    await expect(host.getByRole("region", { name: "My rooms" })).toContainText(
      room.settings.name,
    );
    // Exercise the fallback with a missing image, absent stats and a long name.
    await host.route("**/api/leagues/ipl", async (route) => {
      const dataset = structuredClone(fallbackCatalog);
      for (const player of dataset.players) {
        player.name =
          "A very long international cricket player name for layout verification";
        player.stats = {};
        player.imageUrl = "/missing-ui-fixture-portrait.png";
      }
      await route.fulfill({ json: dataset });
    });
    await host.goto(`/rooms/${room.id}/auction`);
    await expect(host.locator(".player-quick-stats > div")).toHaveCount(4);
    await expect(host.locator(".player-quick-stats strong")).toHaveText([
      "—",
      "—",
      "—",
      "—",
    ]);
    await expect(host.locator(".player-portrait img")).toHaveCount(0);
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.getByRole("button", { name: /^View stats for/ }).click();
    await host
      .getByRole("dialog")
      .getByRole("button", { name: "Bowling", exact: true })
      .click();
    await expect(host.locator(".detail-empty")).toBeVisible();
    await host.screenshot({ path: ".runtime/ui-missing-player-data.png" });
    await host.keyboard.press("Escape");
    await host.goto("/");
    await host.screenshot({
      path: ".runtime/ui-home-mobile.png",
      fullPage: true,
    });
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.screenshot({
      path: ".runtime/ui-home-desktop.png",
      fullPage: true,
    });
    for (const screen of ["rooms", "squads", "settings"]) {
      await host.goto(`/${screen}`);
      await expect(host.locator("main h1")).toBeVisible();
      expect(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await host.screenshot({
        path: `.runtime/ui-${screen}.png`,
        fullPage: true,
      });
    }
    expect((await first.request.get("/api/me/rooms")).status()).toBe(401);
  } finally {
    await first.close();
    await second.close();
  }
});
