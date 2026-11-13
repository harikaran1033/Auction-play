import { describe, it, expect } from "vitest";
import {
  safeReturnTo,
  googleCallbackUrl,
  oauthError,
} from "../apps/web/src/features/auth/oauth";
describe("OAuth return handling", () => {
  it("retains room invitations and protected routes", () => {
    expect(safeReturnTo("/join?code=AB123")).toBe("/join?code=AB123");
    expect(safeReturnTo("/rooms/create?league=ipl")).toBe(
      "/rooms/create?league=ipl",
    );
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth",
    "/auth/callback?next=/auth",
    null,
    42,
    "/\n/evil.example",
  ])("rejects unsafe or looping return targets: %s", (value) => {
    expect(safeReturnTo(value)).toBe("/");
  });
  it("keeps the callback on the current app origin", () => {
    const callback = new URL(
      googleCallbackUrl("http://127.0.0.1:5173", "/join?code=ABC"),
    );
    expect(callback.origin).toBe("http://127.0.0.1:5173");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/join?code=ABC");
  });
  it("handles provider cancellation and error messages in either callback format", () => {
    expect(oauthError("?error=access_denied", "")).toContain("cancelled");
    expect(oauthError("", "#error_description=Login+denied")).toBe(
      "Login denied",
    );
    expect(oauthError("?code=valid", "")).toBeUndefined();
  });
});
