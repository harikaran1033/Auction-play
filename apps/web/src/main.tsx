import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import App from "./App";
import { initAuth } from "./lib/api";
import { usePreferences } from "./lib/preferences";
import { useVisualViewport } from "./lib/useVisualViewport";
import "./styles.css";
import "./design.css";
import "./broadcast.css";
import "./game.css";
import "./features/voice/voice.css";
import "./features/trades/trades.css";
import "./themes.css";
void initAuth();
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30000, refetchOnWindowFocus: true },
  },
});
function Root() {
  useVisualViewport();
  const motion = usePreferences((s) => s.motion);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion={motion === "reduce" ? "always" : "user"}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
