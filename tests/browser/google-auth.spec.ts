import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  test.skip(
    (await response.json()).authMode !== "supabase",
    "Google sign-in requires Supabase configuration.",
  );
});

test("Google button starts PKCE and restores an OAuth session to the original invitation", async ({
  page,
}) => {
  let authorize: URL | undefined;
  await page.route("**/auth/v1/authorize?**", async (route) => {
    authorize = new URL(route.request().url());
    await route.fulfill({
      contentType: "text/html",
      body: "<title>Mock Google authorization</title><p>Provider handoff intercepted by the test.</p>",
    });
  });
  await page.goto("/join?code=FRIENDS");
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveTitle("Mock Google authorization");
  expect(authorize?.searchParams.get("provider")).toBe("google");
  expect(authorize?.searchParams.get("code_challenge_method")).toBe("s256");
  expect(authorize?.searchParams.get("code_challenge")?.length).toBeGreaterThan(
    20,
  );
  const callback = new URL(authorize!.searchParams.get("redirect_to")!);
  expect(callback.origin).toBe("http://127.0.0.1:5173");
  expect(callback.pathname).toBe("/auth/callback");
  expect(callback.searchParams.get("next")).toBe("/join?code=FRIENDS");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const id = "b783e2f8-6e1e-4d0f-bd98-1e49d23a365f";
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: expires })).toString("base64url")}.test-signature`;
  let exchanged = false;
  await page.route("**/auth/v1/token?grant_type=pkce", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.auth_code).toBe("mock-google-code");
    expect(body.code_verifier.length).toBeGreaterThan(20);
    exchanged = true;
    await route.fulfill({
      json: {
        access_token: token,
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: expires,
        user: {
          id,
          aud: "authenticated",
          role: "authenticated",
          email: "google-test@example.invalid",
          app_metadata: { provider: "google", providers: ["google"] },
          user_metadata: { full_name: "Google Test Owner" },
          created_at: new Date().toISOString(),
        },
      },
    });
  });
  callback.searchParams.set("code", "mock-google-code");
  await page.goto(callback.toString());
  await expect(page).toHaveURL("http://127.0.0.1:5173/join?code=FRIENDS");
  await expect(
    page.getByText("Google Test Owner", { exact: true }),
  ).toBeVisible();
  expect(exchanged).toBe(true);
  await page.reload();
  await expect(
    page.getByText("Google Test Owner", { exact: true }),
  ).toBeVisible();
});

test("cancelled Google authorization offers sign-in again and keeps the invitation", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback?error=access_denied&error_description=Google+sign-in+was+cancelled&next=%2Fjoin%3Fcode%3DFRIENDS",
  );
  await expect(
    page.getByRole("heading", { name: "Sign-in wasn’t completed." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  expect(new URL(page.url()).searchParams.get("next")).toBe(
    "/join?code=FRIENDS",
  );
});
