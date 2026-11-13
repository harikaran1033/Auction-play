import { Check, Crown, MoreHorizontal, UserMinus, WifiOff } from "lucide-react";
import type { Dataset, Member, Command } from "@cricket/shared";
import { TeamBadge } from "../../components/common";
import type { ReactNode } from "react";
export function RoomMemberMenu({
  memberName,
  children,
}: {
  memberName: string;
  children: ReactNode;
}) {
  return (
    <details className="member-menu">
      <summary aria-label={`Manage ${memberName}`}>
        <MoreHorizontal size={18} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function RoomMember({
  member,
  dataset,
  isMe,
  isHost,
  canManage,
  locked,
  act,
}: {
  member: Member;
  dataset: Dataset;
  isMe: boolean;
  isHost: boolean;
  canManage: boolean;
  locked: boolean;
  act: (type: Command["type"], payload?: Command["payload"]) => Promise<void>;
}) {
  return (
    <div className={`room-member ${member.ready ? "is-ready" : ""}`}>
      <TeamBadge
        team={dataset.teams.find((team) => team.id === member.teamId)}
        size="tiny"
      />
      <div>
        <strong>
          {member.name}
          {isMe && " (you)"}
          {isHost && <Crown size={12} />}
        </strong>
        <small>
          {dataset.teams.find((team) => team.id === member.teamId)?.shortName} ·{" "}
          {member.connected
            ? member.ready
              ? "Ready to play"
              : "Getting ready"
            : "Disconnected owner"}
        </small>
      </div>
      {member.connected ? (
        member.ready ? (
          <Check size={17} aria-label="Ready" />
        ) : (
          <span className="member-waiting" aria-label="Not ready" />
        )
      ) : (
        <WifiOff size={16} aria-label="Disconnected" />
      )}
      {canManage && (
        <RoomMemberMenu memberName={member.name}>
          <button
            disabled={locked || !member.connected}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void act("transfer", { memberId: member.id });
            }}
          >
            <Crown size={15} />
            Make host
          </button>
          <button
            className="danger-text"
            disabled={locked}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void act("kick", { memberId: member.id });
            }}
          >
            <UserMinus size={15} />
            Remove owner
          </button>
        </RoomMemberMenu>
      )}
    </div>
  );
}
