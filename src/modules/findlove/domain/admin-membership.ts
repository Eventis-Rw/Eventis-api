export type Tier = "public" | "private";
export type Period = "week" | "month" | "year";
export type Permissions = Record<Tier, Record<Tier, boolean>>;
export interface Plan {
  id: string;
  tier: Tier;
  period: Period;
  days: number;
  price: number;
  active: boolean;
}
export interface Membership {
  tier: Tier;
  status: "active" | "revoked";
  startsAt: string;
  expiresAt: string;
  price: number;
  planId: string;
  permissions: Permissions;
}
export interface Member {
  id: string;
  name: string;
  username: string;
  country: string;
  dob: string;
  account: "active" | "suspended" | "banned";
  verification: "pending" | "verified" | "rejected" | "resubmission_required";
  document: "National ID" | "Passport";
  membership?: Membership;
}
export interface Payment {
  id: string;
  memberId: string;
  plan: Plan;
  permissions: Permissions;
  amount: number;
  method: "MTN MoMo" | "Airtel Money";
  status: "success" | "pending" | "failed";
  createdAt: string;
}
export interface Report {
  id: string;
  memberId: string;
  category: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
}
export interface Entry {
  actorName?: string;
  id: string;
  at: string;
  action: string;
  target: string;
  reason: string;
  details: string;
}
export interface Demo {
  version: 1;
  plans: Plan[];
  permissions: Permissions;
  members: Member[];
  payments: Payment[];
  reports: Report[];
  audit: Entry[];
}
export const MEMBERSHIP_KEY = "eventis.findlove.memberships.v1";
export const DAY = 86_400_000;
export const defaultPermissions = (): Permissions => ({
  public: { public: true, private: false },
  private: { public: true, private: true },
});
export const money = (amount: number) =>
  `RWF ${amount.toLocaleString("en-US")}`;
export const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Africa/Kigali",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function adult(dob: string, now: number): boolean {
  const birth = new Date(dob),
    today = new Date(now);
  if (!Number.isFinite(birth.getTime()) || birth.getTime() > now) return false;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() < birth.getUTCDate())
  )
    age--;
  return age >= 18;
}
export function activeMembership(member: Member, now: number): boolean {
  const m = member.membership;
  return (
    !!m &&
    m.status === "active" &&
    Number.isFinite(Date.parse(m.expiresAt)) &&
    Date.parse(m.startsAt) <= now &&
    Date.parse(m.expiresAt) > now
  );
}
export function accessReason(member: Member, now: number): string {
  if (member.account !== "active") return `Account ${member.account}`;
  if (!adult(member.dob, now)) return "18+ required";
  if (member.verification !== "verified") return "Verification required";
  if (!activeMembership(member, now))
    return member.membership?.status === "revoked"
      ? "Membership revoked"
      : "Active membership required";
  return "Access enabled";
}
export function connectionDecision(
  sender: Member,
  target: Member,
  now: number,
  accepting = false,
): string {
  if (sender.id === target.id) return "Choose two different members";
  for (const m of [sender, target])
    if (accessReason(m, now) !== "Access enabled")
      return `${m.name}: ${accessReason(m, now)}`;
  if (sender.country !== target.country)
    return "Discovery is limited to the member’s country";
  if (accepting)
    return "Allowed: received requests can be accepted by either tier";
  return sender.membership!.permissions[sender.membership!.tier][
    target.membership!.tier
  ]
    ? "Allowed: connection can be initiated"
    : "Blocked by the sender’s purchased connection permissions";
}
export type Command =
  | { type: "plan"; id: string; price: number; active: boolean; reason: string }
  | { type: "rules"; permissions: Permissions; reason: string }
  | {
      type: "member";
      id: string;
      action: "grant" | "extend" | "revoke" | "suspend" | "restore" | "ban";
      planId?: string;
      days?: number;
      reason: string;
    }
  | {
      type: "checkout";
      id: string;
      planId: string;
      method: Payment["method"];
      outcome: Payment["status"];
      reason: string;
    }
  | {
      type: "settle";
      id: string;
      outcome: "success" | "failed";
      reason: string;
    }
  | {
      type: "verify";
      id: string;
      decision: Member["verification"];
      reason: string;
    }
  | {
      type: "report";
      id: string;
      decision: "dismiss" | "resolve" | "suspend" | "ban";
      reason: string;
    };
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function activate(
  member: Member,
  plan: Plan,
  permissions: Permissions,
  now: number,
) {
  const existing = member.membership;
  requireValue(
    !activeMembership(member, now) || existing?.tier === plan.tier,
    "Revoke the current membership before switching tiers. Remaining days are preserved for same-tier renewals.",
  );
  const base = activeMembership(member, now)
    ? Date.parse(existing!.expiresAt)
    : now;
  member.membership = {
    tier: plan.tier,
    status: "active",
    startsAt: new Date(now).toISOString(),
    expiresAt: new Date(base + plan.days * DAY).toISOString(),
    price: plan.price,
    planId: plan.id,
    permissions: structuredClone(
      activeMembership(member, now) ? existing!.permissions : permissions,
    ),
  };
}
export function applyMembershipCommand(
  current: Demo,
  command: Command,
  now: number,
  id: string,
): Demo {
  requireValue(
    command.reason.trim().length >= 5,
    "Provide a reason of at least 5 characters.",
  );
  requireValue(Number.isFinite(now), "Invalid operation time.");
  const state = structuredClone(current);
  let details = "";
  const member =
    "id" in command
      ? state.members.find((m) => m.id === command.id)
      : undefined;
  const plan =
    "planId" in command
      ? state.plans.find((p) => p.id === command.planId)
      : undefined;
  switch (command.type) {
    case "plan": {
      const p = state.plans.find((p) => p.id === command.id);
      requireValue(p, "Plan not found.");
      requireValue(
        Number.isSafeInteger(command.price) && command.price > 0,
        "Price must be a positive whole RWF amount.",
      );
      details = `${p.tier} ${p.period}: RWF ${p.price} → ${command.price}; ${command.active ? "enabled" : "disabled"} for new purchases`;
      p.price = command.price;
      p.active = command.active;
      break;
    }
    case "rules":
      requireValue(
        ["public", "private"].every((a) =>
          ["public", "private"].every(
            (b) =>
              typeof command.permissions[a as Tier]?.[b as Tier] === "boolean",
          ),
        ),
        "All four connection permissions are required.",
      );
      details = `New memberships: ${JSON.stringify(command.permissions)}`;
      state.permissions = structuredClone(command.permissions);
      break;
    case "member":
      requireValue(member, "Member not found.");
      if (command.action === "grant") {
        requireValue(plan?.active, "Choose an enabled plan.");
        requireValue(
          member.account === "active" &&
            member.verification === "verified" &&
            adult(member.dob, now),
          "Grants require an active, verified adult account.",
        );
        activate(member, plan, state.permissions, now);
      } else if (command.action === "extend") {
        requireValue(
          member.membership && member.membership.status !== "revoked",
          "Grant a membership before extending it.",
        );
        requireValue(
          Number.isInteger(command.days) &&
            command.days! > 0 &&
            command.days! <= 365,
          "Extension must be between 1 and 365 days.",
        );
        member.membership.expiresAt = new Date(
          Math.max(now, Date.parse(member.membership.expiresAt)) +
            command.days! * DAY,
        ).toISOString();
      } else if (command.action === "revoke") {
        requireValue(member.membership, "This member has no membership.");
        member.membership.status = "revoked";
      } else
        member.account =
          command.action === "restore"
            ? "active"
            : command.action === "ban"
              ? "banned"
              : "suspended";
      break;
    case "checkout": {
      requireValue(
        member && plan?.active,
        "Choose a member and an enabled plan.",
      );
      requireValue(
        member.account === "active" &&
          member.verification === "verified" &&
          adult(member.dob, now),
        "Checkout requires an active, verified adult account.",
      );
      requireValue(
        !activeMembership(member, now) || member.membership?.tier === plan.tier,
        "Choose the current tier to renew, or revoke it before switching tiers.",
      );
      requireValue(
        !state.payments.some(
          (p) => p.memberId === member.id && p.status === "pending",
        ),
        "Resolve this member’s pending payment before starting another checkout.",
      );
      requireValue(
        ["MTN MoMo", "Airtel Money"].includes(command.method),
        "Unsupported payment method.",
      );
      const payment: Payment = {
        id,
        memberId: member.id,
        plan: { ...plan },
        permissions: structuredClone(state.permissions),
        amount: plan.price,
        method: command.method,
        status: command.outcome,
        createdAt: new Date(now).toISOString(),
      };
      if (payment.status === "success")
        activate(member, payment.plan, payment.permissions, now);
      details = `${plan.id}; RWF ${payment.amount}; ${payment.method}; ${payment.status}`;
      state.payments.unshift(payment);
      break;
    }
    case "settle": {
      const payment = state.payments.find((p) => p.id === command.id);
      requireValue(
        payment?.status === "pending",
        "Only pending payments can be resolved.",
      );
      const owner = state.members.find((m) => m.id === payment.memberId)!;
      if (command.outcome === "success")
        activate(owner, payment.plan, payment.permissions, now);
      payment.status = command.outcome;
      break;
    }
    case "verify":
      requireValue(member, "Member not found.");
      requireValue(
        command.decision !== "verified" || adult(member.dob, now),
        "A member under 18 cannot be verified.",
      );
      member.verification = command.decision;
      break;
    case "report": {
      const report = state.reports.find((r) => r.id === command.id);
      requireValue(report?.status === "open", "This report is already closed.");
      if (command.decision === "suspend" || command.decision === "ban")
        state.members.find((m) => m.id === report.memberId)!.account =
          command.decision === "ban" ? "banned" : "suspended";
      report.status = command.decision === "dismiss" ? "dismissed" : "resolved";
      break;
    }
  }
  state.audit.unshift({
    id,
    at: new Date(now).toISOString(),
    action:
      command.type +
      ("action" in command
        ? `: ${command.action}`
        : "decision" in command
          ? `: ${command.decision}`
          : "outcome" in command
            ? `: ${command.outcome}`
            : " updated"),
    details,
    target: "id" in command ? command.id : "Connection rules",
    reason: command.reason.trim(),
  });
  return state;
}
