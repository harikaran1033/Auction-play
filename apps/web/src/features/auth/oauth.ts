const redirectOrigin = "https://cricket-room.invalid";

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("\\") ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return "/";
  try {
    const target = new URL(value, redirectOrigin);
    if (
      target.origin !== redirectOrigin ||
      /^\/auth(?:\/|$)/.test(target.pathname)
    )
      return "/";
    return target.pathname + target.search + target.hash;
  } catch {
    return "/";
  }
}

export function googleCallbackUrl(origin: string, next: unknown): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeReturnTo(next));
  return callback.toString();
}

export function oauthError(search: string, hash: string): string | undefined {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const message =
    query.get("error_description") ?? fragment.get("error_description");
  if (message) return message.slice(0, 500);
  if (query.has("error") || fragment.has("error"))
    return "Google sign-in was cancelled or could not be completed. Please try again.";
}
