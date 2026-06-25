import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";
import { supabaseAdmin } from "./client.server";

// Helper to fetch roles and organization_id for the caller
async function getCallerContext(userId: string) {
  const [rolesRes, profileRes] = await Promise.all([
    supabaseAdmin.from("user_roles").select("is_global_admin, roles(permissions)").eq("user_id", userId),
    supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle()
  ]);
  
  if (rolesRes.error) throw new Error(rolesRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);
  
  let isGlobalAdmin = false;
  const permissions = new Set<string>();

  for (const r of rolesRes.data ?? []) {
    if (r.is_global_admin) isGlobalAdmin = true;
    if (r.roles && (r.roles as any).permissions) {
      for (const p of (r.roles as any).permissions) permissions.add(p);
    }
  }

  return {
    isGlobalAdmin,
    permissions,
    hasPerm: (p: string) => isGlobalAdmin || permissions.has(p),
    orgId: profileRes.data?.organization_id,
    departmentId: profileRes.data?.department_id,
    isDemoUser: profileRes.data?.email === "demo@workdesk.local",
  };
}

export const adminChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, isDemoUser } = await getCallerContext(context.userId);
    if (isDemoUser) throw new Error("Demo Mode: Modifications are disabled for the dummy organization.");
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    if (!hasPerm("manage_employees") && !hasPerm("manage_organization")) {
      throw new Error("Unauthorized: Only administrators can change employee passwords.");
    }
    if (data.password.length < 6) throw new Error("Password must be at least 6 characters long.");

    // Ensure target employee is in same org
    const target = await supabaseAdmin.from("profiles").select("*").eq("id", data.employeeId).single();
    if (target.error || (target.data.organization_id && target.data.organization_id !== orgId)) {
      throw new Error("Employee not found in your organization.");
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.employeeId, { password: data.password });
    if (updateError) throw new Error(updateError.message);
    return { success: true };
  });

export const getEmployeeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, departmentId } = await getCallerContext(context.userId);
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    
    // Check if user is allowed to view ANY employee details
    const canViewAll = hasPerm("manage_employees") || hasPerm("view_attendance_all") || hasPerm("assign_tasks_all");
    const canViewDept = hasPerm("view_attendance_dept") || hasPerm("assign_tasks_dept");
    
    if (!canViewAll && !canViewDept && context.userId !== data.employeeId) {
      throw new Error("Unauthorized: You do not have permission to inspect employee details.");
    }
    
    const { data: employeeProfile, error: profileError } = await supabaseAdmin
      .from("profiles").select("*").eq("id", data.employeeId).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!employeeProfile || (employeeProfile.organization_id && employeeProfile.organization_id !== orgId)) throw new Error("Employee not found.");

    if (!canViewAll && canViewDept && context.userId !== data.employeeId) {
      if (departmentId !== employeeProfile.department_id) {
        throw new Error("Unauthorized: You can only view status details for employees in your department.");
      }
    }

    const [tasksRes, attendanceRes] = await Promise.all([
      supabaseAdmin.from("tasks").select("*").eq("assignee_id", data.employeeId).eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabaseAdmin.from("attendance").select("*").eq("employee_id", data.employeeId).eq("organization_id", orgId).order("date", { ascending: false }),
    ]);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (attendanceRes.error) throw new Error(attendanceRes.error.message);

    return { tasks: tasksRes.data ?? [], attendance: attendanceRes.data ?? [] };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, isDemoUser } = await getCallerContext(context.userId);
    if (isDemoUser) throw new Error("Demo Mode: Modifications are disabled.");
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    if (!hasPerm("manage_organization") && !hasPerm("manage_employees")) {
      throw new Error("Unauthorized: Only administrators can delete employees.");
    }
    if (context.userId === data.employeeId) throw new Error("Forbidden: You cannot delete your own account.");

    const target = await supabaseAdmin.from("profiles").select("*").eq("id", data.employeeId).single();
    if (target.error || (target.data.organization_id && target.data.organization_id !== orgId)) {
      throw new Error("Employee not found.");
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.employeeId);
    if (deleteError) throw new Error(deleteError.message);
    return { success: true };
  });

export const getAttendanceRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filterDate?: string }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, departmentId } = await getCallerContext(context.userId);
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    
    let query = supabaseAdmin.from("attendance").select("*").eq("organization_id", orgId).order("date", { ascending: false });
    if (data.filterDate) query = query.eq("date", data.filterDate);

    if (hasPerm("view_attendance_all") || hasPerm("manage_employees")) {
      // see all org records
    } else if (hasPerm("view_attendance_dept") && departmentId) {
      const { data: deptProfiles } = await supabaseAdmin.from("profiles").select("id").eq("department_id", departmentId).eq("organization_id", orgId);
      const deptUserIds = (deptProfiles ?? []).map((p) => p.id);
      if (!deptUserIds.includes(context.userId)) deptUserIds.push(context.userId);
      query = query.in("employee_id", deptUserIds);
    } else {
      query = query.eq("employee_id", context.userId);
    }

    const { data: attendanceData, error: attError } = await query;
    if (attError) throw new Error(attError.message);
    return attendanceData as any[];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; description: string | null; assigneeId: string; dueDate: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, departmentId, isDemoUser } = await getCallerContext(context.userId);
    if (isDemoUser) throw new Error("Demo Mode: Task assignment is disabled.");
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");

    if (context.userId !== data.assigneeId) {
      if (hasPerm("assign_tasks_all")) {
        // allowed
      } else if (hasPerm("assign_tasks_dept") && departmentId) {
        const assigneeProfileRes = await supabaseAdmin.from("profiles").select("department_id, organization_id").eq("id", data.assigneeId).maybeSingle();
        if (assigneeProfileRes.data?.organization_id !== orgId) throw new Error("Assignee not found in your organization.");
        if (assigneeProfileRes.data?.department_id !== departmentId) {
          throw new Error("Unauthorized: You can only assign tasks to employees in your department.");
        }
      } else {
        throw new Error("Unauthorized: You do not have permission to assign tasks to this employee.");
      }
    }

    const { error: insertError } = await supabaseAdmin.from("tasks").insert({
      title: data.title,
      description: data.description,
      assignee_id: data.assigneeId,
      assigner_id: context.userId,
      due_date: data.dueDate,
      organization_id: orgId,
    });
    if (insertError) throw new Error(insertError.message);
    return { success: true };
  });

export const updateTaskDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; title: string; description: string | null; assigneeId: string; dueDate: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, isDemoUser } = await getCallerContext(context.userId);
    if (isDemoUser) throw new Error("Demo Mode: Modifying tasks is disabled.");
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    const task = await supabaseAdmin.from("tasks").select("*").eq("id", data.taskId).maybeSingle();
    if (task.error || !task.data || task.data.organization_id !== orgId) throw new Error("Task not found.");

    if (task.data.assigner_id !== context.userId && !hasPerm("assign_tasks_all")) {
      throw new Error("Unauthorized: Only the creator of the task or an administrator can edit it.");
    }

    // verify new assignee is in same org
    const target = await supabaseAdmin.from("profiles").select("*").eq("id", data.assigneeId).single();
    if (target.error || (target.data.organization_id && target.data.organization_id !== orgId)) {
      throw new Error("Assignee not found in your organization.");
    }

    const { error: updateError } = await supabaseAdmin.from("tasks").update({
      title: data.title, description: data.description, assignee_id: data.assigneeId, due_date: data.dueDate,
    }).eq("id", data.taskId);
    if (updateError) throw new Error(updateError.message);
    return { success: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { hasPerm, orgId, isDemoUser } = await getCallerContext(context.userId);
    if (isDemoUser) throw new Error("Demo Mode: Deleting tasks is disabled.");
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");
    const task = await supabaseAdmin.from("tasks").select("*").eq("id", data.taskId).maybeSingle();
    if (task.error || !task.data || task.data.organization_id !== orgId) throw new Error("Task not found.");

    if (task.data.assigner_id !== context.userId && !hasPerm("assign_tasks_all")) {
      throw new Error("Unauthorized: Only the creator of the task or an administrator can delete it.");
    }

    const { error: deleteError } = await supabaseAdmin.from("tasks").delete().eq("id", data.taskId);
    if (deleteError) throw new Error(deleteError.message);
    return { success: true };
  });

export const getCurrentWifiSSID = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      if (process.platform === "win32") {
        const { stdout } = await execAsync("netsh wlan show interfaces");
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("SSID")) {
            const parts = line.split(":");
            if (parts.length > 1) {
              return { ssid: parts[1].trim() };
            }
          }
        }
      } else if (process.platform === "darwin") {
        const { stdout } = await execAsync("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I");
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("SSID")) {
            const parts = line.split(":");
            if (parts.length > 1) {
              return { ssid: parts[1].trim() };
            }
          }
        }
      } else {
        const { stdout } = await execAsync("iwgetid -r");
        if (stdout.trim()) {
          return { ssid: stdout.trim() };
        }
      }
      return { ssid: null, error: "Not connected to Wi-Fi" };
    } catch (err: any) {
      console.error("Failed to detect Wi-Fi:", err);
      return { ssid: null, error: err.message };
    }
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { today: string }) => d)
  .handler(async ({ data, context }) => {
    const { orgId } = await getCallerContext(context.userId);
    if (!orgId) throw new Error("Unauthorized: Organization ID is required.");

    const [tasksRes, attRes, empRes] = await Promise.all([
      supabaseAdmin.from("tasks").select("*").eq("organization_id", orgId),
      supabaseAdmin
        .from("attendance")
        .select("id,clock_in,clock_out,attendance_type,clock_in_wifi_ssid")
        .eq("employee_id", context.userId)
        .eq("date", data.today)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    ]);

    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (attRes.error) throw new Error(attRes.error.message);

    let leaves: any[] = [];
    try {
      const { data: leavesData } = await supabaseAdmin
        .from("leave_requests")
        .select("id, start_date, end_date")
        .eq("status", "approved")
        .eq("organization_id", orgId);
      leaves = leavesData || [];
    } catch (err) {
      console.error("Leave requests query failed:", err);
    }

    const tasks = tasksRes.data || [];
    const my = tasks.filter((t) => t.assignee_id === context.userId);
    const onLeaveTodayCount = leaves.filter((l) => l.start_date <= data.today && l.end_date >= data.today).length;

    return {
      total: tasks.length,
      myOpen: my.filter((t) => t.status !== "done").length,
      myDone: my.filter((t) => t.status === "done").length,
      attendance: attRes.data,
      employees: empRes.count ?? 0,
      rawTasks: tasks,
      onLeaveTodayCount,
    };
  });


