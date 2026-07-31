export type ActorRole = "student" | "teacher" | "parent" | "administrator";
export type SessionStrength = "password" | "reauthenticated";

export interface Actor {
  userId: string;
  role: ActorRole;
  sessionStrength: SessionStrength;
}

export type AuthorizationAction =
  | "class.read"
  | "class.manage"
  | "membership.manage"
  | "guardian.manage"
  | "assignment.create"
  | "assignment.publish"
  | "submission.create"
  | "review.decide"
  | "report.read"
  | "sync.write"
  | "account.manage"
  | "privacy.read"
  | "privacy.withdraw"
  | "content.create"
  | "content.review"
  | "parent.summary";

export interface ResourceContext {
  classId: string | null;
  ownerTeacherId: string | null;
  ownerUserId: string | null;
  activeMember: boolean;
  guardianLinked: boolean;
}

export type AuthorizationDecision =
  | { allowed: true }
  | {
    allowed: false;
    code: "reauthentication_required" | "resource_forbidden";
  };

const sensitiveActions = new Set<AuthorizationAction>([
  "class.manage",
  "membership.manage",
  "guardian.manage",
  "assignment.publish",
  "review.decide",
  "account.manage",
  "privacy.withdraw",
  "content.review",
]);

function ownsClass(actor: Actor, resource: ResourceContext): boolean {
  return actor.role === "teacher" && resource.ownerTeacherId === actor.userId;
}

function ownsUserResource(actor: Actor, resource: ResourceContext): boolean {
  return resource.ownerUserId === actor.userId;
}

export function authorize(
  actor: Actor,
  action: AuthorizationAction,
  resource: ResourceContext,
): AuthorizationDecision {
  let roleAndResourceAllowed = false;
  switch (action) {
    case "class.read":
      roleAndResourceAllowed = actor.role === "administrator"
        || ownsClass(actor, resource)
        || resource.activeMember
        || resource.guardianLinked;
      break;
    case "class.manage":
    case "membership.manage":
    case "guardian.manage":
    case "assignment.create":
    case "assignment.publish":
    case "review.decide":
      roleAndResourceAllowed = actor.role === "administrator" || ownsClass(actor, resource);
      break;
    case "submission.create":
      roleAndResourceAllowed = actor.role === "student" && resource.activeMember;
      break;
    case "report.read":
      roleAndResourceAllowed = actor.role === "administrator"
        || ownsClass(actor, resource)
        || ownsUserResource(actor, resource)
        || (actor.role === "parent" && resource.guardianLinked);
      break;
    case "sync.write":
    case "privacy.read":
    case "privacy.withdraw":
      roleAndResourceAllowed = ownsUserResource(actor, resource);
      break;
    case "content.create":
      roleAndResourceAllowed = actor.role === "teacher" || actor.role === "administrator";
      break;
    case "parent.summary":
      roleAndResourceAllowed = actor.role === "parent" && resource.guardianLinked;
      break;
    case "account.manage":
    case "content.review":
      roleAndResourceAllowed = actor.role === "administrator";
      break;
  }

  if (!roleAndResourceAllowed) return { allowed: false, code: "resource_forbidden" };
  if (sensitiveActions.has(action) && actor.sessionStrength !== "reauthenticated") {
    return { allowed: false, code: "reauthentication_required" };
  }
  return { allowed: true };
}
