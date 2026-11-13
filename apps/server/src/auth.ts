import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { ensure, type User } from "@cricket/shared";
import { root } from "./data/catalog.js";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : undefined;
export const authMode = supabase ? "supabase" : "development";
if (process.env.NODE_ENV === "production" && !supabase)
  throw new Error("Production requires Supabase Auth");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key ?? "", "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
interface LocalAccount extends User {
  email: string;
  passwordHash: string;
}
let secret: string;
let accounts: LocalAccount[] = [];
let authTail: Promise<unknown> = Promise.resolve();
export async function initAuth() {
  if (supabase) return;
  await mkdir(`${root}/.runtime`, { recursive: true });
  try {
    secret = await readFile(`${root}/.runtime/auth.key`, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    secret = randomBytes(48).toString("hex");
    await writeFile(`${root}/.runtime/auth.key`, secret);
  }
  try {
    accounts = JSON.parse(
      await readFile(`${root}/.runtime/accounts.json`, "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
export async function localAuth(input: {
  email: string;
  password: string;
  name?: string;
  register?: boolean;
}) {
  ensure(!supabase, "AUTH_PROVIDER", "Use Supabase authentication");
  const run = authTail.then(async () => {
    const email = input.email.toLowerCase().trim();
    let account = accounts.find((a) => a.email === email);
    if (input.register) {
      ensure(!account, "EMAIL_EXISTS", "Account already exists");
      ensure(
        input.password.length >= 8,
        "WEAK_PASSWORD",
        "Use at least eight characters",
      );
      account = {
        id: randomUUID(),
        name: (input.name ?? email.split("@")[0]).slice(0, 40),
        email,
        passwordHash: hashPassword(input.password),
      };
      accounts.push(account);
      await writeFile(
        `${root}/.runtime/accounts.json`,
        JSON.stringify(accounts),
      );
    } else
      ensure(
        account && checkPassword(input.password, account.passwordHash),
        "LOGIN_FAILED",
        "Invalid email or password",
      );
    const user = { id: account!.id, name: account!.name };
    const payload = Buffer.from(
      JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    return { user, token: `${payload}.${signature}` };
  });
  authTail = run.catch(() => {});
  return run;
}
export async function authenticate(token?: string): Promise<User> {
  ensure(token, "UNAUTHENTICATED", "Sign in to continue");
  if (supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    ensure(
      !error && data.user,
      "UNAUTHENTICATED",
      "Session expired. Please sign in again.",
    );
    return {
      id: data.user.id,
      name: String(
        data.user.user_metadata.display_name ??
          data.user.user_metadata.full_name ??
          data.user.user_metadata.name ??
          data.user.email?.split("@")[0] ??
          "Owner",
      ),
      avatar:
        data.user.user_metadata.avatar_url ?? data.user.user_metadata.picture,
    };
  }
  const [payload, signature] = token.split(".");
  ensure(payload && signature, "UNAUTHENTICATED", "Invalid token");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  ensure(
    actual.length === expected.length && timingSafeEqual(actual, expected),
    "UNAUTHENTICATED",
    "Invalid token",
  );
  const user = JSON.parse(Buffer.from(payload, "base64url").toString());
  ensure(
    user.exp > Date.now() && accounts.some((a) => a.id === user.id),
    "UNAUTHENTICATED",
    "Session expired",
  );
  return { id: user.id, name: user.name };
}
