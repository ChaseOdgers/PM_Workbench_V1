// Who can do what. One table, so a client build can map it to their own SSO groups.
export const PERSONAS = {
  director: { label: "Director / Group PM", icon: "ti-hierarchy-2", blurb: "Reviews signals across streams, approves opportunities, sees all agents" },
  pm: { label: "Product Manager", icon: "ti-bulb", blurb: "Triages signals, shapes opportunities, runs the prototype loop, hands off" },
  admin: { label: "Workspace Admin", icon: "ti-settings", blurb: "Adds users and roles, connects sources, manages agents and policies" },
  reviewer: { label: "Reviewer", icon: "ti-gavel", blurb: "Approves or rejects governance gates and leaves comments" },
};

const MATRIX = {
  director: ["signal.triage", "signal.rules", "opp.create", "opp.edit", "opp.approve", "proto.edit", "handoff", "agents.toggle"],
  pm: ["signal.triage", "signal.rules", "opp.create", "opp.edit", "proto.edit", "handoff"],
  admin: ["sources.manage", "agents.manage", "agents.toggle", "gov.manage", "users.manage"],
  reviewer: ["gate.review"],
};

export const can = (user, action) => !!user && (MATRIX[user.persona] || []).includes(action);
export const canReview = (user, gate) => can(user, "gate.review") && user.approverRoles.includes(gate.approverRole);
export const APPROVER_ROLES = ["Legal", "Security", "Accessibility", "Compliance"];
