import { lazy, Suspense, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import {
  House,
  Compass,
  Trophy,
  Settings,
  LogOut,
  Menu,
  ArrowUpRight,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth, logout } from "./lib/api";
import { closeRoom } from "./features/auction/transport";
import { Home } from "./features/leagues/Home";
const Auth = lazy(() =>
  import("./features/auth/Auth").then((m) => ({ default: m.Auth })),
);
const AuthCallback = lazy(() =>
  import("./features/auth/AuthCallback").then((m) => ({
    default: m.AuthCallback,
  })),
);
const Rooms = lazy(() =>
  import("./features/rooms/Rooms").then((m) => ({ default: m.Rooms })),
);
const CreateRoom = lazy(() =>
  import("./features/rooms/Rooms").then((m) => ({ default: m.CreateRoom })),
);
const JoinRoom = lazy(() =>
  import("./features/rooms/Rooms").then((m) => ({ default: m.JoinRoom })),
);
const RoomScreen = lazy(() =>
  import("./features/auction/RoomScreen").then((m) => ({
    default: m.RoomScreen,
  })),
);
const Squads = lazy(() =>
  import("./features/squads/Squads").then((m) => ({ default: m.Squads })),
);
const SquadDetail = lazy(() =>
  import("./features/squads/Squads").then((m) => ({ default: m.SquadDetail })),
);
const Preferences = lazy(() =>
  import("./features/settings/Preferences").then((m) => ({
    default: m.Preferences,
  })),
);
import { Button } from "./components/ui/button";
import { Loading } from "./components/common";
import { PwaUpdates } from "./components/PwaUpdates";
import { ThemeToggle } from "./components/ThemePicker";
function Protected() {
  const { user, loaded } = useAuth();
  const location = useLocation();
  if (!loaded) return <Loading />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to="/auth"
      state={{ from: location.pathname + location.search }}
      replace
    />
  );
}
function Layout() {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const auctionLayout = /^\/rooms\/[^/]+\/(auction|lobby)\/?$/.test(
    location.pathname,
  );
  const pageLabel = location.pathname.includes("/auction")
    ? "Live auction"
    : location.pathname.includes("/lobby")
      ? "Room lobby"
      : location.pathname.includes("/results")
        ? "Auction results"
        : location.pathname === "/rooms/create"
          ? "Create a room"
          : location.pathname.startsWith("/auth")
            ? "Your account"
            : location.pathname.startsWith("/squads")
              ? "Squad studio"
              : location.pathname === "/settings"
                ? "Preferences"
                : location.pathname === "/join"
                  ? "Join a room"
                  : location.pathname === "/rooms"
                    ? "Discover rooms"
                    : "Clubhouse";
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <div className={`app-shell ${auctionLayout ? "auction-shell" : ""}`}>
      {!auctionLayout && (
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link className="brand" to="/" aria-label="AuctionPlay home">
            <span className="brand-ball">
              <img src="/icon.svg" alt="" />
            </span>
            <span>
              Auction<span className="accent">Play</span>
              <small>THE AUCTION CLUB</small>
            </span>
          </Link>
          <div className="nav-label">YOUR CLUBHOUSE</div>
          <nav>
            {[
              [House, "Home", "/"],
              [Compass, "Discover rooms", "/rooms"],
              [Trophy, "My squads", "/squads"],
            ].map(([Icon, label, path]) => {
              const I = Icon as typeof House;
              return (
                <NavLink end key={String(path)} to={String(path)}>
                  <I size={19} />
                  {String(label)}
                </NavLink>
              );
            })}
            <NavLink to="/settings">
              <Settings size={19} />
              Settings
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <span className={`status-dot ${online ? "" : "offline"}`} />{" "}
            {online ? "DEVICE ONLINE" : "OFFLINE"}{" "}
            <a
              href="https://www.lords.org/mcc/the-laws-of-cricket"
              target="_blank"
              rel="noreferrer"
              aria-label="Cricket laws"
            >
              <ArrowUpRight size={14} />
            </a>
          </div>
        </aside>
      )}
      <div className="main-shell">
        {!auctionLayout && (
          <header className="topbar">
            <button
              className="mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
            <span className="topbar-label">
              CONTROL ROOM <span>/</span>
              <b>{pageLabel}</b>
            </span>
            <div className="topbar-actions">
              <ThemeToggle />
              <span className="local-tag">YOUR AUCTION. YOUR CALL.</span>
              {user ? (
                <>
                  <span className="avatar">
                    {user.name.slice(0, 2).toUpperCase()}
                    {user.avatar && (
                      <img
                        src={user.avatar}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </span>
                  <span className="username">{user.name}</span>
                  <button
                    className="icon-button"
                    aria-label="Sign out"
                    onClick={() => {
                      closeRoom();
                      void logout();
                    }}
                  >
                    <LogOut size={17} />
                  </button>
                </>
              ) : (
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/auth">
                    Sign in <ArrowUpRight size={14} />
                  </Link>
                </Button>
              )}
            </div>
          </header>
        )}
        {!online && (
          <div className="connection-banner">
            <WifiOff size={16} /> You’re offline. Reconnect to resume your
            auction.
          </div>
        )}
        <PwaUpdates />
        <main>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
        {!auctionLayout && (
          <footer>
            BUILT FOR THE LOVE OF THE GAME.
            <span>AuctionPlay © {new Date().getFullYear()}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="auth" element={<Auth />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="rooms" element={<Rooms />} />
        <Route element={<Protected />}>
          <Route path="rooms/create" element={<CreateRoom />} />
          <Route path="join" element={<JoinRoom />} />
          <Route path="rooms/:roomId/:screen" element={<RoomScreen />} />
          <Route path="squads" element={<Squads />} />
          <Route path="squads/:squadId" element={<SquadDetail />} />
          <Route path="settings" element={<Preferences />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="state">
              <h1>That’s outside the boundary.</h1>
              <Link to="/">Return to the clubhouse</Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
