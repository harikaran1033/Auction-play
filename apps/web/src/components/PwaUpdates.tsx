import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./ui/button";
export function PwaUpdates() {
  const {
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!refresh) return null;
  return (
    <div className="connection-banner" role="status">
      A new AuctionPlay version is ready.
      <Button
        size="sm"
        onClick={() => {
          void updateServiceWorker(true);
        }}
      >
        Reload
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setRefresh(false)}>
        Later
      </Button>
    </div>
  );
}
