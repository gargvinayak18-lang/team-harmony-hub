import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";
import { supabaseAdmin } from "./client.server";

export const adminChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Check if the logged-in user is an admin or HR head
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    
    if (rolesError) {
      throw new Error(rolesError.message);
    }
    
    const roles = (userRoles ?? []).map((r) => r.role);
    const isAdmin = roles.includes("global_admin") || roles.includes("hr_head");
    if (!isAdmin) {
      throw new Error("Unauthorized: Only administrators can change employee passwords.");
    }
    
    if (data.password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    // 2. Change the password of the employee using Supabase admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      data.employeeId,
      { password: data.password }
    );
    if (updateError) {
      throw new Error(updateError.message);
    }
    
    return { success: true };
  });

export const getEmployeeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Check if the logged-in user is authorized to see employee details
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    
    if (rolesError) {
      throw new Error(rolesError.message);
    }
    
    const roles = (userRoles ?? []).map((r) => r.role);
    const isAuthorized = roles.some((r) =>
      ["global_admin", "hr_head", "tech_pm", "marketing_head"].includes(r)
    );
    if (!isAuthorized) {
      throw new Error("Unauthorized: Only admins and team heads can inspect employee details.");
    }
    
    // 2. Fetch target employee profile to check department if caller is a department lead
    const { data: employeeProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("department")
      .eq("id", data.employeeId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!employeeProfile) {
      throw new Error("Employee not found.");
    }

    const isDeptLead = roles.includes("tech_pm") || roles.includes("marketing_head");
    const isGlobalAdminOrHr = roles.includes("global_admin") || roles.includes("hr_head");

    if (isDeptLead && !isGlobalAdminOrHr) {
      // Fetch caller's department
      const { data: callerProfile, error: callerError } = await supabaseAdmin
        .from("profiles")
        .select("department")
        .eq("id", context.userId)
        .maybeSingle();

      if (callerError) {
        throw new Error(callerError.message);
      }

      if (!callerProfile || callerProfile.department !== employeeProfile.department) {
        throw new Error("Unauthorized: You can only view status details for employees in your department.");
      }
    }

    // 3. Fetch tasks and attendance logs using supabaseAdmin (bypassing client-side RLS restrictions)
    const [tasksRes, attendanceRes] = await Promise.all([
      supabaseAdmin
        .from("tasks")
        .select("*")
        .eq("assignee_id", data.employeeId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("attendance")
        .select("*")
        .eq("employee_id", data.employeeId)
        .order("date", { ascending: false }),
    ]);

    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (attendanceRes.error) throw new Error(attendanceRes.error.message);

    return {
      tasks: tasksRes.data ?? [],
      attendance: attendanceRes.data ?? [],
    };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Check if the logged-in user is an admin or HR head
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    
    if (rolesError) {
      throw new Error(rolesError.message);
    }
    
    const roles = (userRoles ?? []).map((r) => r.role);
    const isAdmin = roles.includes("global_admin") || roles.includes("hr_head");
    if (!isAdmin) {
      throw new Error("Unauthorized: Only administrators can delete employees.");
    }

    // 2. Prevent self-deletion
    if (context.userId === data.employeeId) {
      throw new Error("Forbidden: You cannot delete your own account.");
    }

    // 3. Delete the employee user credentials using Supabase Admin client.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      data.employeeId
    );
    
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return { success: true };
  });

export const getAttendanceRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filterDate?: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Fetch caller's roles
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    
    if (rolesError) {
      throw new Error(rolesError.message);
    }
    
    const roles = (userRoles ?? []).map((r) => r.role);
    const isGlobalAdminOrHr = roles.includes("global_admin") || roles.includes("hr_head");
    const isDeptLead = roles.includes("tech_pm") || roles.includes("marketing_head");
    
    // Start building query
    let query = supabaseAdmin
      .from("attendance")
      .select("*")
      .order("date", { ascending: false });

    // Apply specific date filter if provided
    if (data.filterDate) {
      query = query.eq("date", data.filterDate);
    }

    if (isGlobalAdminOrHr) {
      // Global Admin / HR Head: see all records
    } else if (isDeptLead) {
      // Department Lead: see records of employees in their department
      const { data: callerProfile, error: callerError } = await supabaseAdmin
        .from("profiles")
        .select("department")
        .eq("id", context.userId)
        .maybeSingle();

      if (callerError) {
        throw new Error(callerError.message);
      }

      const department = callerProfile?.department;
      if (department) {
        // Fetch all profile IDs in this department
        const { data: deptProfiles, error: deptError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("department", department);

        if (deptError) {
          throw new Error(deptError.message);
        }

        const deptUserIds = (deptProfiles ?? []).map((p) => p.id);
        // Include self
        if (!deptUserIds.includes(context.userId)) {
          deptUserIds.push(context.userId);
        }
        query = query.in("employee_id", deptUserIds);
      } else {
        query = query.eq("employee_id", context.userId);
      }
    } else {
      // Regular employee: see only own records
      query = query.eq("employee_id", context.userId);
    }

    const { data: attendanceData, error: attError } = await query;
    if (attError) {
      throw new Error(attError.message);
    }

    return attendanceData as any[];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; description: string | null; assigneeId: string; dueDate: string | null }) => d)
  .handler(async ({ data, context }) => {
    // 1. Fetch caller's roles
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const callerRoles = (userRoles ?? []).map((r) => r.role);
    const callerIsAdmin = callerRoles.includes("global_admin") || callerRoles.includes("hr_head");

    // 2. Check assignment permission
    if (context.userId === data.assigneeId) {
      if (!callerIsAdmin) {
        throw new Error("Unauthorized: Only administrators can assign tasks to themselves.");
      }
    } else if (!callerIsAdmin) {
      // Fetch assignee details
      const [assigneeProfileRes, assigneeRolesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("department").eq("id", data.assigneeId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.assigneeId),
      ]);

      const assigneeDept = assigneeProfileRes.data?.department;
      const assigneeRoles = (assigneeRolesRes.data ?? []).map((r) => r.role);

      let allowed = false;
      if (callerRoles.includes("tech_pm") && assigneeDept === "tech") {
        allowed = assigneeRoles.includes("tech_jr_dev");
      } else if (callerRoles.includes("marketing_head") && assigneeDept === "marketing") {
        allowed = true;
      } else if (callerRoles.includes("hr_head") && assigneeDept === "hr") {
        allowed = true;
      }

      if (!allowed) {
        throw new Error("Unauthorized: You do not have permission to assign tasks to this employee.");
      }
    }

    // 3. Insert task
    const { error: insertError } = await supabaseAdmin
      .from("tasks")
      .insert({
        title: data.title,
        description: data.description,
        assignee_id: data.assigneeId,
        assigner_id: context.userId,
        due_date: data.dueDate,
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    return { success: true };
  });

export const updateTaskDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; title: string; description: string | null; assigneeId: string; dueDate: string | null }) => d)
  .handler(async ({ data, context }) => {
    // 1. Fetch task to check assigner_id
    const { data: task, error: fetchError } = await supabaseAdmin
      .from("tasks")
      .select("assigner_id")
      .eq("id", data.taskId)
      .maybeSingle();

    if (fetchError || !task) {
      throw new Error(fetchError?.message || "Task not found.");
    }

    // 2. Fetch caller's roles
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const callerRoles = (userRoles ?? []).map((r) => r.role);
    const callerIsAdmin = callerRoles.includes("global_admin") || callerRoles.includes("hr_head");

    // 3. Authorization check
    if (task.assigner_id !== context.userId && !callerIsAdmin) {
      throw new Error("Unauthorized: Only the creator of the task or an administrator can edit it.");
    }

    // 4. Update task details
    const { error: updateError } = await supabaseAdmin
      .from("tasks")
      .update({
        title: data.title,
        description: data.description,
        assignee_id: data.assigneeId,
        due_date: data.dueDate,
      })
      .eq("id", data.taskId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { success: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Fetch task to check assigner_id
    const { data: task, error: fetchError } = await supabaseAdmin
      .from("tasks")
      .select("assigner_id")
      .eq("id", data.taskId)
      .maybeSingle();

    if (fetchError || !task) {
      throw new Error(fetchError?.message || "Task not found.");
    }

    // 2. Fetch caller's roles
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const callerRoles = (userRoles ?? []).map((r) => r.role);
    const callerIsAdmin = callerRoles.includes("global_admin") || callerRoles.includes("hr_head");

    // 3. Authorization check
    if (task.assigner_id !== context.userId && !callerIsAdmin) {
      throw new Error("Unauthorized: Only the creator of the task or an administrator can delete it.");
    }

    // 4. Delete task
    const { error: deleteError } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("id", data.taskId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return { success: true };
  });



