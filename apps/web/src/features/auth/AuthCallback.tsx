import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../../lib/api";
import { Loading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { oauthError, safeReturnTo } from "./oauth";

export function AuthCallback() {
  const { user, loaded, authError } = useAuth();
  const location = useLocation();
  const next = safeReturnTo(new URLSearchParams(location.search).get("next"));
  const error = oauthError(location.search, location.hash) ?? authError;
  if (error || (loaded && !user))
    return (
      <div className="state">
        <h1>Sign-in wasn’t completed.</h1>
        <p role="alert">
          {error ??
            "No sign-in session was returned. Please try Google again from this browser."}
        </p>
        <Button asChild>
          <Link to={`/auth?next=${encodeURIComponent(next)}`}>
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  if (!loaded) return <Loading message="Finishing your sign-in…" />;
  return <Navigate to={next} replace />;
}
