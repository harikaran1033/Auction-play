import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { money, type Dataset, type Member } from "@cricket/shared";
import { api } from "../lib/api";
import { Button } from "./ui/button";

export function squadText(member: Member, dataset: Dataset, roomName: string) {
  const team =
    dataset.teams.find((team) => team.id === member.teamId)?.name ??
    member.name;
  return [
    `AuctionPlay · ${roomName}`,
    `${team} · ${member.name}`,
    `Purse remaining: ${money(member.budget, dataset)}`,
    `Squad: ${member.purchases.length} players`,
    "",
    ...member.purchases.map((purchase, index) => {
      const player = dataset.players.find(
        (player) => player.id === purchase.playerId,
      );
      const tags = [
        member.lineup.includes(purchase.playerId) ? "XI" : "",
        member.captain === purchase.playerId ? "Captain" : "",
        member.viceCaptain === purchase.playerId ? "Vice-captain" : "",
        purchase.tradeId ? "Traded" : "",
      ].filter(Boolean);
      return `${index + 1}. ${player?.name ?? purchase.playerId} — ${player?.role.replaceAll("-", " ") ?? "player"} · auction value ${money(purchase.amount, dataset)}${tags.length ? ` [${tags.join(", ")}]` : ""}`;
    }),
  ].join("\n");
}
async function copy(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* Try the browser selection fallback. */
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  const focused = document.activeElement as HTMLElement | null;
  document.body.append(input);
  input.select();
  try {
    if (!document.execCommand("copy"))
      throw new Error("Clipboard permission is blocked in this browser.");
  } finally {
    input.remove();
    focused?.focus();
  }
}
export function CopySquadButton({
  member,
  dataset,
  datasetId,
  currency,
  roomName,
}: {
  member: Member;
  dataset?: Dataset;
  datasetId?: string;
  currency?: "credits" | "inr";
  roomName: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="copy-squad-control">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("");
          try {
            const source =
              dataset ??
              (await queryClient.fetchQuery({
                queryKey: ["dataset", datasetId],
                queryFn: () => api<Dataset>(`/leagues/${datasetId}`),
              }));
            if (!source)
              throw new Error(
                "Player details could not be loaded. Try copying again.",
              );
            await copy(
              squadText(
                member,
                { ...source, unit: currency === "inr" ? "inr" : source.unit },
                roomName,
              ),
            );
            setStatus("Squad copied.");
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : "Could not copy the squad.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {status === "Squad copied." ? <Check size={16} /> : <Copy size={16} />}
        Copy squad
      </Button>
      <span role="status">{status}</span>
    </div>
  );
}
