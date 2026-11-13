import { createClient, type Session } from "@supabase/supabase-js";
import { create } from "zustand";
import type { User } from "@cricket/shared";
export const base = import.meta.env.VITE_API_URL ?? "";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          auth: {
            flowType: "pkce",
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
          },
        },
      )
    : undefined;
type Auth = {
  user?: User;
  token?: string;
  loaded: boolean;
  authError?: string;
  set: (user: User | undefined, token?: string) => void;
};
export const useAuth = create<Auth>((set) => ({
  loaded: false,
  set: (user, token) => {
    if (!supabase) {
      if (token) localStorage.setItem("cricket-token", token);
      else localStorage.removeItem("cricket-token");
    }
    set({ user, token, loaded: true, authError: undefined });
  },
}));
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuth.getState().token;
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(65000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "Unable to connect. Please retry.");
  return data;
}
export async function initAuth() {
  if (supabase) {
    const sync = (session: Session | null) => {
      useAuth.getState().set(
        session
          ? {
              id: session.user.id,
              name:
                session.user.user_metadata.display_name ??
                session.user.user_metadata.full_name ??
                session.user.user_metadata.name ??
                session.user.email?.split("@")[0] ??
                "Owner",
              avatar:
                session.user.user_metadata.avatar_url ??
                session.user.user_metadata.picture,
            }
          : undefined,
        session?.access_token,
      );
    };
    supabase.auth.onAuthStateChange((_event, session) => sync(session));
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      sync(data.session);
    } catch (error) {
      useAuth.setState({
        user: undefined,
        token: undefined,
        loaded: true,
        authError:
          error instanceof Error
            ? error.message
            : "Sign-in could not be completed. Please try again.",
      });
    }
  } else {
    const token = localStorage.getItem("cricket-token") ?? undefined;
    if (token) {
      useAuth.setState({ token });
      try {
        useAuth.getState().set(await api<User>("/me"), token);
      } catch {
        useAuth.getState().set(undefined);
      }
    } else useAuth.getState().set(undefined);
  }
}
export async function logout() {
  if (supabase) await supabase.auth.signOut();
  useAuth.getState().set(undefined);
}
