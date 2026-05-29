export type Department = "tech" | "marketing" | "hr";
export type AppRole =
  | "global_admin"
  | "tech_pm"
  | "tech_sr_dev"
  | "tech_jr_dev"
  | "marketing_head"
  | "marketing_staff"
  | "hr_head"
  | "hr_staff"
  | "supervisor";

export const ROLE_LABELS: Record<AppRole, string> = {
  global_admin: "Global Admin",
  tech_pm: "Project Manager",
  tech_sr_dev: "Senior Developer",
  tech_jr_dev: "Developer",
  marketing_head: "Marketing Head",
  marketing_staff: "Marketing Staff",
  hr_head: "HR Head",
  hr_staff: "HR Staff",
  supervisor: "Supervisor",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  tech: "Tech",
  marketing: "Marketing",
  hr: "HR",
};

export const ROLES_BY_DEPARTMENT: Record<Department, AppRole[]> = {
  tech: ["tech_pm", "tech_jr_dev"],
  marketing: ["marketing_head", "marketing_staff"],
  hr: ["hr_head", "hr_staff"],
};

export const ALL_ROLES: AppRole[] = [
  "global_admin",
  "tech_pm",
  "tech_jr_dev",
  "marketing_head",
  "marketing_staff",
  "hr_head",
  "hr_staff",
];

export function canAssignTasks(roles: AppRole[]): boolean {
  return roles.some((r) =>
    ["global_admin", "tech_pm", "marketing_head", "hr_head"].includes(r),
  );
}

export function isAdmin(roles: AppRole[]): boolean {
  return roles.includes("global_admin");
}

export function isDepartmentLead(roles: AppRole[]): boolean {
  return roles.some((r) => ["tech_pm", "marketing_head", "hr_head"].includes(r));
}

export function canManageEmployees(roles: AppRole[]): boolean {
  return roles.includes("global_admin") || roles.includes("hr_head");
}

export function canViewEmployeeDetails(roles: AppRole[]): boolean {
  return roles.some((r) =>
    ["global_admin", "hr_head", "tech_pm", "marketing_head"].includes(r)
  );
}

// Mirror of DB can_assign() — used to filter "Assign To" dropdown client-side
export function canAssignTo(
  assignerRoles: AppRole[],
  assigneeRoles: AppRole[],
  assigneeDept: Department | null,
): boolean {
  if (isAdmin(assignerRoles)) return true;
  if (assignerRoles.includes("tech_pm") && assigneeDept === "tech") {
    return assigneeRoles.includes("tech_jr_dev");
  }
  if (assignerRoles.includes("marketing_head") && assigneeDept === "marketing") return true;
  if (assignerRoles.includes("hr_head") && assigneeDept === "hr") return true;
  return false;
}
