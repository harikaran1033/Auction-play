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
  await context.addInitScript(
    (token) => localStorage.setItem("cricket-token", token),
    auth.token,
  );
  return auth;
}
test("personal themes cover settings, routes, dialogs and a live auction without changing room state", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
  });
  const second = await browser.newContext({ baseURL });
  try {
    const a = await account(first, "ThemeHost"),
      b = await account(second, "ThemeGuest");
    const host = await first.newPage(),
      guest = await second.newPage();
    await host.goto("/settings");
    await expect(host.locator("html")).toHaveAttribute("data-theme", "night");
    await host.getByRole("radio", { name: /Ember Arena/ }).check();
    await expect(host.locator("html")).toHaveAttribute("data-theme", "ember");
    await expect(
      host.getByRole("button", { name: "Save preferences" }),
    ).toHaveCSS("background-color", "rgb(255, 212, 59)");
    await host.screenshot({
      path: ".runtime/theme-ember-settings.png",
      fullPage: true,
    });
    const anotherTab = await first.newPage();
    await anotherTab.goto("/");
    await expect(anotherTab.locator("html")).toHaveAttribute(
      "data-theme",
      "ember",
    );
    await host.getByRole("radio", { name: /Night Club/ }).check();
    await expect(anotherTab.locator("html")).toHaveAttribute(
      "data-theme",
      "night",
    );
    // Standard radio keyboard navigation switches the palette immediately.
    await host.getByRole("radio", { name: /Night Club/ }).focus();
    await host.keyboard.press("ArrowRight");
    await expect(
      host.getByRole("radio", { name: /Ember Arena/ }),
    ).toBeChecked();
    await expect(anotherTab.locator("html")).toHaveAttribute(
      "data-theme",
      "ember",
    );
    await anotherTab.close();
    await host.reload();
    await expect(
      host.getByRole("radio", { name: /Ember Arena/ }),
    ).toBeChecked();
    for (const route of [
      "/",
      "/rooms",
      "/rooms/create?league=ipl",
      "/join",
      "/squads",
    ]) {
      await host.goto(route);
      await expect(host.locator("html")).toHaveAttribute("data-theme", "ember");
      await expect(host.locator("body")).toHaveCSS(
        "background-color",
        "rgb(9, 9, 9)",
      );
    }
    await host.goto("/");
    await expect(host.locator(".league-card").first()).toBeVisible();
    await host.screenshot({
      path: ".runtime/theme-ember-home.png",
      fullPage: true,
    });
    const dataset = (await loadCatalog()).datasets.find((d) => d.id === "ipl")!;
    for (const context of [first, second])
      await context.route("**/api/leagues/ipl", (route) =>
        route.fulfill({ json: dataset }),
      );
    const created = await first.request.post("/api/rooms", {
      headers: { Authorization: `Bearer ${a.token}` },
      data: {
        name: "Theme acceptance",
        datasetId: "ipl",
        teamId: dataset.teams[0].id,
        visibility: "private",
        maxTeams: 2,
        squadSize: 2,
        overseasCap: 2,
        budget: 10000,
        timerSeconds: 120,
        reserveBudget: false,
        voice: false,
      },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    expect(
      (
        await second.request.post(`/api/rooms/${room.id}/join`, {
          headers: { Authorization: `Bearer ${b.token}` },
          data: { teamId: dataset.teams[1].id },
        })
      ).ok(),
    ).toBe(true);
    await host.goto(`/rooms/${room.id}/lobby`);
    await guest.goto(`/rooms/${room.id}/lobby`);
    await expect(guest.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(host.getByRole("button", { name: "I’m ready" })).toBeEnabled();
    await host.screenshot({
      path: ".runtime/theme-ember-lobby.png",
      fullPage: true,
    });
    await host.getByRole("button", { name: "I’m ready" }).click();
    await expect(guest.locator(".lobby-ready-note")).toContainText("1/2");
    await guest.getByRole("button", { name: "I’m ready" }).click();
    await host
      .getByRole("button", { name: "Start auction", exact: true })
      .click();
    await expect(host.getByRole("button", { name: /^Bid / })).toBeEnabled();
    const read = async () =>
      (
        await first.request.get(`/api/rooms/${room.id}`, {
          headers: { Authorization: `Bearer ${a.token}` },
        })
      ).json();
    const before = await read();
    const teamColor = await host
      .locator(".player-stage")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--team-primary"),
      );
    await host
      .getByRole("button", { name: "Switch to Night Club theme", exact: true })
      .click();
    await expect(host.locator("html")).toHaveAttribute("data-theme", "night");
    await host
      .getByRole("button", { name: "Switch to Ember Arena theme", exact: true })
      .click();
    expect((await read()).members).toEqual(before.members);
    expect((await read()).lot.id).toBe(before.lot.id);
    expect(
      await host
        .locator(".player-stage")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--team-primary"),
        ),
    ).toBe(teamColor);
    await host.screenshot({
      path: ".runtime/theme-ember-auction.png",
      fullPage: true,
    });
    await host.getByRole("button", { name: /^View stats for / }).click();
    await expect(host.getByRole("dialog")).toBeVisible();
    await host.screenshot({ path: ".runtime/theme-ember-player.png" });
    await host.keyboard.press("Escape");
    await host
      .getByRole("button", { name: "Auction audio and trades", exact: true })
      .click();
    await expect(host.getByRole("dialog")).toBeVisible();
    await host.screenshot({ path: ".runtime/theme-ember-audio.png" });
    await host
      .getByRole("button", { name: "Close audio and trades", exact: true })
      .click();
    for (const width of [390, 360]) {
      await host.setViewportSize({ width, height: 844 });
      expect(
        (await host.locator(".room-top h1").boundingBox())!.width,
      ).toBeGreaterThan(250);
      expect(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await host.screenshot({
        path: `.runtime/theme-ember-auction-${width}.png`,
        fullPage: true,
      });
    }
    await host.getByRole("button", { name: /^Bid / }).click();
    await guest.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(host.locator(".sold-stamp")).toContainText("SOLD");
    await expect(guest.locator("html")).toHaveAttribute("data-theme", "night");
    await host.goto("/settings");
    await expect(
      host.getByRole("radio", { name: /Ember Arena/ }),
    ).toBeChecked();
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.screenshot({
      path: ".runtime/theme-ember-settings-mobile.png",
      fullPage: true,
    });
  } finally {
    await first.close();
    await second.close();
  }
});
