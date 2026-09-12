import type { Member } from "../../shared/types.ts";

export function Avatar({ member, size = 24 }: { member: Member; size?: number }) {
  return (
    <div
      className="avatar"
      title={member.name}
      style={{
        width: size,
        height: size,
        background: member.color,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {member.initials}
    </div>
  );
}

export function AvatarStack({ members, size = 24 }: { members: Member[]; size?: number }) {
  return (
    <div className="avatar-stack">
      {members.map((m) => <Avatar key={m.userId} member={m} size={size} />)}
    </div>
  );
}
