import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loadCatalog } from "../../apps/server/src/data/catalog.js";
async function register(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/auth", {
    data: {
      email: `${name}-${Date.now()}@example.test`,
      password: "Cricket123!",
      name,
      register: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  const auth = await response.json();
  await context.addInitScript((token) => {
    if (location.protocol === "http:" || location.protocol === "https:")
      localStorage.setItem("cricket-token", token);
  }, auth.token);
  return auth;
}
async function waitReady(page: Page) {
  await expect(page.getByRole("button", { name: "I’m ready" })).toBeEnabled({
    timeout: 15000,
  });
}
test("two owners create, join, ready, bid, pass, reconnect, complete and retain squads", async ({
  browser,
  request,
}) => {
  const health = await request.get("/api/health");
  test.skip(
    (await health.json()).authMode !== "development",
    "The local-account auction flow requires development Auth; configured Supabase OAuth is tested separately.",
  );
  const first = await browser.newContext();
  const second = await browser.newContext();
  // Serve the actual imported catalog deterministically; room commands and sockets remain real.
  const ipl = (await loadCatalog()).datasets.find(
    (dataset) => dataset.id === "ipl",
  )!;
  for (const context of [first, second]) {
    await context.route("**/api/leagues/ipl", (route) =>
      route.fulfill({ json: ipl }),
    );
  }
  await register(first, "Alice");
  const bob = await register(second, "Bob");
  const a = await first.newPage();
  const b = await second.newPage();
  await a.goto("/rooms/create?league=ipl");
  await a.getByRole("button", { name: "CSK Chennai Super Kings" }).click();
  await a.getByLabel("Room name").fill("Browser acceptance auction");
  await a.getByLabel("Players per squad").fill("1");
  await a.getByLabel("Overseas player cap").fill("1");
  await a.getByLabel("Maximum owners").fill("2");
  await a.getByLabel("Reserve minimum budget").uncheck();
  await a.getByRole("button", { name: "Create my room" }).click();
  await expect(a).toHaveURL(/\/lobby$/);
  await waitReady(a);
  const roomId = a.url().split("/rooms/")[1].split("/")[0];
  const snapshot = await first.request.get(`/api/rooms/${roomId}`, {
    headers: {
      Authorization: `Bearer ${await a.evaluate(() => localStorage.getItem("cricket-token"))}`,
    },
  });
  const room = await snapshot.json();
  expect(room.passwordHash).toBeUndefined();
  expect(
    (
      await second.request.get(`/api/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      })
    ).status(),
  ).toBe(403);
  await b.goto(`/join?code=${room.code}`);
  await b.getByRole("button", { name: "Find room" }).click();
  await b.getByRole("button", { name: "DC Delhi Capitals" }).click();
  await b.getByRole("button", { name: "Join the room", exact: true }).click();
  await waitReady(b);
  await a.getByRole("button", { name: "I’m ready" }).click();
  await b.getByRole("button", { name: "I’m ready" }).click();
  await expect(a.getByRole("button", { name: "Start auction" })).toBeEnabled();
  await a.getByRole("button", { name: "Start auction" }).click();
  await expect(a).toHaveURL(/\/auction$/);
  await expect(b).toHaveURL(/\/auction$/);
  await a.getByRole("button", { name: /^Bid / }).click();
  await expect(
    a.getByRole("button", { name: "You hold the bid" }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(a.locator(".sold-stamp")).toContainText("SOLD");
  await expect(a.locator(".my-signings")).toContainText("DEWALD BREVIS");
  await a.reload();
  await expect(a.locator(".my-signings")).toContainText("DEWALD BREVIS");
  await expect(b.getByRole("button", { name: /^Bid / })).toBeEnabled({
    timeout: 15000,
  });
  await b.getByRole("button", { name: /^Bid / }).click();
  await expect(a).toHaveURL(/\/results$/, { timeout: 20000 });
  await expect(b).toHaveURL(/\/results$/, { timeout: 20000 });
  await a.screenshot({ path: ".runtime/ui-results.png", fullPage: true });
  await a.getByRole("button", { name: "Leave", exact: true }).click();
  await a.goto("/squads");
  await expect(
    a.getByRole("heading", { name: "Browser acceptance auction" }),
  ).toBeVisible();
  await expect(a.getByText(/1 signings/)).toBeVisible();
  await a.getByRole("link", { name: "Manage squad" }).click();
  await a.getByRole("checkbox").check();
  await a
    .getByRole("combobox", { name: "Captain", exact: true })
    .selectOption({ label: "DEWALD BREVIS" });
  await a.getByRole("button", { name: "Save lineup" }).click();
  await expect(a.getByRole("status")).toHaveText("Playing XI saved.");
  await a.reload();
  await expect(a.getByRole("checkbox")).toBeChecked();
  await a.screenshot({ path: ".runtime/ui-saved-lineup.png", fullPage: true });
  await first.close();
  await second.close();
});
test("mobile home has no horizontal overflow and dataset search works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to the clubhouse." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Explore players", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Search players" }).fill("Hasan Ali");
  await expect(page.getByRole("dialog")).toContainText("Hasan Ali");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
});
