import { test, expect, type BrowserContext, type Page } from "@playwright/test";
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
    localStorage.setItem("cricket-token", token);
    if (!localStorage.getItem("features-test-initialized")) {
      localStorage.setItem("features-test-initialized", "true");
      localStorage.setItem("cricket-sound", "false");
      localStorage.removeItem("cricket-auction-audio");
    }
    const globals = window as any;
    globals.auctionAudioTest = { spoken: [], effects: 0 };
    const synth = new EventTarget() as any;
    synth.getVoices = () => [];
    synth.cancel = () => {};
    synth.speak = (utterance: SpeechSynthesisUtterance) =>
      globals.auctionAudioTest.spoken.push(utterance.text);
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
    });
    const nativeOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      globals.auctionAudioTest.effects++;
      return nativeOscillator.call(this);
    };
  }, auth.token);
  return auth;
}
async function tools(page: Page, squad = false) {
  await page
    .getByRole("button", {
      name: squad ? "Trade players" : "Auction audio and trades",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Trades/ })
    .click();
}
async function close(page: Page) {
  await page
    .getByRole("button", { name: "Close audio and trades", exact: true })
    .click();
}
test("personal auction audio and mutually accepted trades update live and saved squads", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({ baseURL }),
    second = await browser.newContext({ baseURL });
  try {
    const a = await account(first, "TradeHost"),
      b = await account(second, "TradeGuest");
    const dataset = (await loadCatalog()).datasets.find(
      (dataset) => dataset.id === "ipl",
    )!;
    for (const context of [first, second])
      await context.route("**/api/leagues/ipl", (route) =>
        route.fulfill({ json: dataset }),
      );
    const created = await first.request.post("/api/rooms", {
      headers: { Authorization: `Bearer ${a.token}` },
      data: {
        name: "Audio and trade acceptance",
        datasetId: "ipl",
        teamId: dataset.teams[0].id,
        visibility: "private",
        maxTeams: 2,
        squadSize: 2,
        overseasCap: 2,
        budget: 10000,
        reserveBudget: false,
        timerSeconds: 5,
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
    const host = await first.newPage(),
      guest = await second.newPage();
    const read = async () =>
      (
        await first.request.get(`/api/rooms/${room.id}`, {
          headers: { Authorization: `Bearer ${a.token}` },
        })
      ).json();
    await host.goto(`/rooms/${room.id}/lobby`);
    await guest.goto(`/rooms/${room.id}/lobby`);
    await host
      .getByRole("button", { name: "Auction audio and trades", exact: true })
      .click();
    const dialog = host.getByRole("dialog");
    await dialog
      .getByRole("checkbox", { name: /Enable auction audio/ })
      .check();
    await dialog.getByRole("checkbox", { name: /Countdown sound/ }).uncheck();
    await dialog.getByRole("checkbox", { name: /Countdown sound/ }).check();
    await dialog
      .getByRole("button", { name: "Test auction audio", exact: true })
      .click();
    await expect
      .poll(() =>
        host.evaluate(() => (window as any).auctionAudioTest.spoken.length),
      )
      .toBeGreaterThan(0);
    await close(host);
    await host.evaluate(() => {
      (window as any).auctionAudioTest.spoken = [];
    });
    await host.getByRole("button", { name: "I’m ready" }).click();
    await guest.getByRole("button", { name: "I’m ready" }).click();
    await host
      .getByRole("button", { name: "Start auction", exact: true })
      .click();
    await expect(host).toHaveURL(/\/auction$/);
    await expect
      .poll(() =>
        host.evaluate(() =>
          (window as any).auctionAudioTest.spoken.includes("Going once!"),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        host.evaluate(() =>
          (window as any).auctionAudioTest.spoken.includes("Going twice!"),
        ),
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          host.evaluate(() =>
            (window as any).auctionAudioTest.spoken.some((text: string) =>
              text.startsWith("Unsold."),
            ),
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    expect(
      await guest.evaluate(() => (window as any).auctionAudioTest.spoken),
    ).toEqual([]);
    await expect(host.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 10000,
    });
    await host.getByRole("button", { name: /^Bid / }).click();
    await guest.getByRole("button", { name: "Pass", exact: true }).click();
    await expect
      .poll(() =>
        host.evaluate(() =>
          (window as any).auctionAudioTest.spoken.some((text: string) =>
            text.startsWith("Sold!"),
          ),
        ),
      )
      .toBe(true);
    await host.reload();
    await expect(host.locator(".my-signings")).toContainText(
      dataset.players[1].name,
    );
    expect(
      await host.evaluate(
        () =>
          (window as any).auctionAudioTest.spoken.filter((text: string) =>
            text.startsWith("Sold!"),
          ).length,
      ),
    ).toBe(0);
    expect(
      await host.evaluate(
        () =>
          JSON.parse(localStorage.getItem("cricket-auction-audio")!).enabled,
      ),
    ).toBe(true);
    await expect(guest.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 10000,
    });
    await guest.getByRole("button", { name: /^Bid / }).click();
    await host.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(guest.locator(".my-signings")).toContainText(
      dataset.players[2].name,
    );
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeEnabled({ timeout: 10000 });
    // Wait until the reveal has ended before pausing the next lot.
    await expect(host.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 10000,
    });
    await host.getByRole("button", { name: "Pause", exact: true }).click();
    const before = await read(),
      beforeA = before.members.find(
        (member: any) => member.userId === a.user.id,
      ),
      beforeB = before.members.find(
        (member: any) => member.userId === b.user.id,
      );
    await tools(host);
    await host.getByLabel("Credits you offer", { exact: true }).fill("0.50");
    await host
      .getByRole("checkbox", {
        name: `Request player: ${dataset.players[2].name}`,
        exact: true,
      })
      .check();
    await host
      .getByRole("button", { name: "Send trade offer", exact: true })
      .click();
    await expect(host.getByRole("status")).toContainText("Offer sent");
    const pending = await read();
    expect(pending.members).toEqual(before.members);
    await tools(guest);
    await guest.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(guest.getByRole("status")).toContainText("Offer rejected");
    await host
      .getByRole("checkbox", {
        name: `Offer player: ${dataset.players[1].name}`,
        exact: true,
      })
      .check();
    await host
      .getByRole("checkbox", {
        name: `Request player: ${dataset.players[2].name}`,
        exact: true,
      })
      .check();
    await host.getByLabel("Credits you offer", { exact: true }).fill("0.50");
    await host
      .getByRole("button", { name: "Send trade offer", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Accept trade", exact: true })
      .click();
    await expect(guest.getByRole("status")).toContainText("Trade completed");
    const swapped = await read(),
      afterA = swapped.members.find(
        (member: any) => member.userId === a.user.id,
      ),
      afterB = swapped.members.find(
        (member: any) => member.userId === b.user.id,
      );
    expect(afterA.budget).toBe(beforeA.budget - 50);
    expect(afterB.budget).toBe(beforeB.budget + 50);
    expect(afterA.purchases[0].playerId).toBe(dataset.players[2].id);
    expect(afterB.purchases[0].playerId).toBe(dataset.players[1].id);
    expect(afterA.purchases[0].tradeId).toBeTruthy();
    await host.locator(".room-tools-body").evaluate((element) => {
      element.scrollTop = 0;
    });
    await host.setViewportSize({ width: 390, height: 844 });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.screenshot({ path: ".runtime/trade-desk-mobile.png" });
    await host.setViewportSize({ width: 360, height: 800 });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.screenshot({ path: ".runtime/trade-desk-desktop.png" });
    await close(host);
    await close(guest);
    await host
      .getByRole("button", { name: "Auction audio and trades", exact: true })
      .click();
    await host
      .getByRole("dialog")
      .getByRole("button", { name: "Audio", exact: true })
      .click();
    await host
      .getByRole("checkbox", { name: /Enable auction audio/ })
      .uncheck();
    await close(host);
    const mutedCount = await host.evaluate(
      () => (window as any).auctionAudioTest.spoken.length,
    );
    await host.getByRole("button", { name: "Resume", exact: true }).click();
    await host.getByRole("button", { name: /^Bid / }).click();
    await guest.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(guest.getByRole("button", { name: /^Bid / })).toBeEnabled({
      timeout: 10000,
    });
    await guest.getByRole("button", { name: /^Bid / }).click();
    await expect(host).toHaveURL(/\/results$/, { timeout: 15000 });
    await expect(guest).toHaveURL(/\/results$/);
    expect(
      await host.evaluate(() => (window as any).auctionAudioTest.spoken.length),
    ).toBe(mutedCount);
    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await guest.getByRole("button", { name: "Leave", exact: true }).click();
    await host.goto(`/squads/${room.id}`);
    await guest.goto(`/squads/${room.id}`);
    const complete = await read(),
      completeA = complete.members.find(
        (member: any) => member.userId === a.user.id,
      ),
      completeB = complete.members.find(
        (member: any) => member.userId === b.user.id,
      );
    for (const page of [host, guest]) {
      await page.locator(".lineup-panel input[type=checkbox]").first().check();
      await page.locator(".lineup-panel input[type=checkbox]").nth(1).check();
    }
    const outgoingA = completeA.purchases[0].playerId,
      outgoingB = completeB.purchases[0].playerId,
      nameA = dataset.players.find((player) => player.id === outgoingA)!.name,
      nameB = dataset.players.find((player) => player.id === outgoingB)!.name;
    await host
      .getByRole("combobox", { name: "Captain", exact: true })
      .selectOption(outgoingA);
    await host
      .getByRole("combobox", { name: "Vice-captain", exact: true })
      .selectOption(completeA.purchases[1].playerId);
    await host
      .getByRole("button", { name: "Save lineup", exact: true })
      .click();
    await expect(host.getByRole("status")).toHaveText("Playing XI saved.");
    await tools(host, true);
    await host
      .getByRole("checkbox", { name: `Offer player: ${nameA}`, exact: true })
      .check();
    await host
      .getByRole("checkbox", { name: `Request player: ${nameB}`, exact: true })
      .check();
    await host.getByLabel("Credits you offer", { exact: true }).fill("0.25");
    await host
      .getByRole("button", { name: "Send trade offer", exact: true })
      .click();
    await tools(guest, true);
    await guest
      .getByRole("button", { name: "Accept trade", exact: true })
      .click();
    await expect(guest.getByRole("status")).toContainText("Trade completed");
    await close(host);
    await close(guest);
    await expect(host.locator(".lineup-panel")).toContainText(nameB);
    await expect(host.locator(".lineup-panel")).not.toContainText(nameA);
    await expect(
      host.getByRole("combobox", { name: "Captain", exact: true }),
    ).toHaveValue("");
    await expect(host.locator(".saved-squad-summary")).toContainText(
      `${(completeA.budget - 25) / 100}`,
    );
    const final = await read();
    expect(
      final.members.find((member: any) => member.userId === b.user.id).budget,
    ).toBe(completeB.budget + 25);
    await host.reload();
    await expect(host.locator(".lineup-panel")).toContainText(nameB);
    await expect(host.locator(".lineup-panel")).not.toContainText(nameA);
  } finally {
    await first.close();
    await second.close();
  }
});
