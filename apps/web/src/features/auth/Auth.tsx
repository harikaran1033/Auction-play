import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { api, supabase, useAuth } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { googleCallbackUrl, oauthError, safeReturnTo } from "./oauth";
const schema = z.object({
  name: z.string().max(40).optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least eight characters"),
});
export function Auth() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const { user, set } = useAuth();
  const location = useLocation();
  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const from = safeReturnTo(
    location.state?.from ?? new URLSearchParams(location.search).get("next"),
  );
  const callbackError = oauthError(location.search, location.hash);
  if (user) return <Navigate to={from} replace />;
  async function googleSignIn() {
    if (!supabase) return;
    setGoogleBusy(true);
    setError("");
    setNotice("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: googleCallbackUrl(window.location.origin, from),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Google sign-in could not be started. Please try again.",
      );
      setGoogleBusy(false);
    }
  }
  const submit = handleSubmit(async (values) => {
    setError("");
    try {
      if (supabase) {
        if (register) {
          const { data, error } = await supabase.auth.signUp({
            email: values.email,
            password: values.password,
            options: {
              data: { display_name: values.name || values.email.split("@")[0] },
            },
          });
          if (error) throw error;
          if (!data.session)
            setNotice(
              "Check your email to confirm your account, then sign in.",
            );
        } else {
          const { error } = await supabase.auth.signInWithPassword(values);
          if (error) throw error;
        }
      } else {
        const data = await api("/auth", {
          method: "POST",
          body: JSON.stringify({ ...values, register }),
        });
        set(data.user, data.token);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  });
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <div className="eyebrow">EVERY GREAT SQUAD STARTS SOMEWHERE</div>
        <h1>
          The next big bid
          <br />
          has your name on it<span className="accent">.</span>
        </h1>
        <p>
          Your own franchise. Your favourite rivals. A whole new way to love the
          game.
        </p>
        <span className="auth-number">
          01<span>/ YOUR AUCTION STORY</span>
        </span>
      </div>
      <div className="panel auth-panel">
        <LockKeyhole className="accent" size={26} />
        <h2>{register ? "Join the clubhouse" : "Welcome back, skipper."}</h2>
        <p>
          {register
            ? "Create an account and find your next auction."
            : "Sign in to pick up where your squad left off."}
        </p>
        {supabase && (
          <div className="auth-providers">
            <Button
              type="button"
              variant="secondary"
              className="google-sign-in"
              onClick={() => {
                void googleSignIn();
              }}
              disabled={googleBusy || isSubmitting}
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
              >
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A6 6 0 0 1 12 5.96Z"
                />
              </svg>
              {googleBusy ? "Opening Google…" : "Continue with Google"}
            </Button>
            <div
              className="auth-divider"
              role="separator"
              aria-label="Or continue with email"
            >
              <span>or continue with email</span>
            </div>
          </div>
        )}
        {(error || callbackError) && (
          <p role="alert" className="form-error">
            {error || callbackError}
          </p>
        )}
        <form onSubmit={submit}>
          {register && (
            <label>
              Display name
              <input
                {...field("name")}
                placeholder="What should we call you?"
                autoComplete="nickname"
              />
            </label>
          )}
          <label>
            Email address
            <input
              {...field("email")}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
            {errors.email && (
              <small className="error-text">{errors.email.message}</small>
            )}
          </label>
          <label>
            Password
            <input
              {...field("password")}
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
            />
            {errors.password && (
              <small className="error-text">{errors.password.message}</small>
            )}
          </label>
          {notice && <p className="notice">{notice}</p>}
          <Button type="submit" disabled={isSubmitting || googleBusy}>
            {isSubmitting
              ? "One moment…"
              : register
                ? "Create account"
                : "Sign in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          {register ? "Already in the club?" : "New to the room?"}{" "}
          <button
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        {!supabase && (
          <small className="dev-notice">
            Local development accounts. Configure Supabase for hosted
            authentication.
          </small>
        )}
      </div>
    </div>
  );
}
