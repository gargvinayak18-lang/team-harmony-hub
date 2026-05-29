import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { adminChangePassword, getEmployeeDetails, deleteEmployee } from "@/integrations/supabase/actions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Calendar, Clock, CheckSquare, ListTodo, AlertCircle, Eye, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_ROLES,
  DEPARTMENT_LABELS,
  ROLES_BY_DEPARTMENT,
  ROLE_LABELS,
  canManageEmployees,
  canViewEmployeeDetails,
  type AppRole,
  type Department,
} from "@/lib/roles";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/employees")({
  component: EmployeesPage,
});

interface Profile {
  id: string;
  name: string;
  email: string;
  department: Department | null;
  custom_id: string | null;
}

function EmployeesPage() {
  const navigate = useNavigate();
  const { roles, user } = useAuth();
  const isManager = canManageEmployees(roles);
  const isViewer = canViewEmployeeDetails(roles);
  const allowed = isManager || isViewer;

  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);

  useEffect(() => {
    if (!allowed) navigate({ to: "/dashboard" });
  }, [allowed, navigate]);

  const { data: rows, refetch, isLoading, error } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const [profsRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id,name,email,department,custom_id").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);

      if (profsRes.error) {
        console.error("Error loading profiles:", profsRes.error);
        toast.error("Failed to load profiles: " + profsRes.error.message);
        throw profsRes.error;
      }
      if (rolesRes.error) {
        console.error("Error loading user roles:", rolesRes.error);
        toast.error("Failed to load roles: " + rolesRes.error.message);
        throw rolesRes.error;
      }

      const profs = profsRes.data;
      const rs = rolesRes.data;

      const map = new Map<string, AppRole[]>();
      for (const r of rs ?? []) {
        const arr = map.get((r as { user_id: string }).user_id) ?? [];
        arr.push((r as { role: AppRole }).role);
        map.set((r as { user_id: string }).user_id, arr);
      }
      return ((profs ?? []) as Profile[]).map((p) => ({
        ...p,
        roles: map.get(p.id) ?? [],
      }));
    },
  });

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const query = search.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const email = (p.email || "").toLowerCase();
      const customId = (p.custom_id || "").toLowerCase();
      const label = p.department ? (DEPARTMENT_LABELS[p.department] || "").toLowerCase() : "";
      return (
        name.includes(query) ||
        email.includes(query) ||
        label.includes(query) ||
        customId.includes(query)
      );
    });
  }, [rows, search]);

  if (!allowed) return null;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee directory</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Manage employees, departments, and roles" : "View employees and their statuses"}
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <AddEmployeeDialog onChanged={refetch} />
            <EditRolesDialog
              employees={rows ?? []}
              onChanged={refetch}
            />
            <ChangePasswordAdminDialog employees={rows ?? []} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>All employees</CardTitle>
              <CardDescription>
                {filteredRows.length} shown of {rows?.length ?? 0} total
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-background"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Loading employees...
                    </TableCell>
                  </TableRow>
                )}
                {error && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-red-500 text-center text-sm py-8">
                      Error loading employees: {(error as Error).message || "An unexpected error occurred."}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !error && filteredRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.custom_id || "—"}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      {p.department ? (
                        <Badge variant="secondary">{DEPARTMENT_LABELS[p.department]}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.roles.length ? (
                          p.roles.map((r) => (
                            <Badge key={r} variant="outline">
                              {ROLE_LABELS[r]}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No role</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs inline-flex gap-1.5 items-center text-primary hover:text-primary hover:bg-primary/5"
                          onClick={() => setSelectedEmployee(p)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Status</span>
                        </Button>
                        {isManager && p.id !== user?.id && (
                          <DeleteEmployeeDialog
                            employee={p}
                            onChanged={refetch}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && !error && !filteredRows.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      {search ? "No matching employees found" : "No employees yet"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle>Adding new employees</CardTitle>
            <CardDescription>
              Admins and HR heads can add new employees directly using the <strong>Add Employee</strong> button above. Employees can then log in using the custom User ID and password assigned to them.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {selectedEmployee && (
        <EmployeeStatusDialog
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function AddEmployeeDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customId, setCustomId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dept, setDept] = useState<Department | "">("");
  const [role, setRole] = useState<AppRole | "">("");
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo<AppRole[]>(() => {
    if (!dept) return ALL_ROLES;
    return ["global_admin", ...ROLES_BY_DEPARTMENT[dept]];
  }, [dept]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !customId || !password || !role) {
      return toast.error("Please fill in name, User ID, password, and role");
    }

    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    setBusy(true);

    // If the custom User ID contains '@', sanitize it to a dot in the default email prefix to maintain a valid email format
    const sanitizedPrefix = customId.trim().replace(/@/g, ".");
    const emailToUse = email.trim() || `${sanitizedPrefix}@harmonyhub.local`;

    try {
      // Create isolated supabase client to prevent admin sign out
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );

      const { data, error: signUpError } = await tempClient.auth.signUp({
        email: emailToUse,
        password,
        options: {
          data: {
            name,
            custom_id: customId.trim(),
            department: role === "global_admin" ? "" : dept,
            role,
          },
        },
      });

      if (signUpError) {
        setBusy(false);
        return toast.error(signUpError.message);
      }

      toast.success("Employee added successfully!");
      setOpen(false);
      setName("");
      setCustomId("");
      setEmail("");
      setPassword("");
      setDept("");
      setRole("");
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>
            Create an employee login with a custom User ID and initial role.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Full Name</Label>
            <Input
              id="new-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-custom-id">Custom User ID</Label>
            <Input
              id="new-custom-id"
              required
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="e.g. john_doe or john@company"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">Email (Optional)</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Defaults to username@harmonyhub.local"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={dept}
              onValueChange={(v) => {
                setDept(v as Department);
                setRole("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Department (none = Global Admin)" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRolesDialog({
  employees,
  onChanged,
}: {
  employees: (Profile & { roles: AppRole[] })[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const [dept, setDept] = useState<Department | "">("");
  const [role, setRole] = useState<AppRole | "">("");
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo<AppRole[]>(() => {
    if (!dept) return ALL_ROLES;
    return ["global_admin", ...ROLES_BY_DEPARTMENT[dept]];
  }, [dept]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !role) return toast.error("Pick employee and role");
    setBusy(true);

    if (role === "global_admin") {
      await supabase.from("profiles").update({ department: null }).eq("id", empId);
    } else if (dept) {
      await supabase.from("profiles").update({ department: dept }).eq("id", empId);
    }
    // wipe existing roles, set the new one (single role for simplicity)
    await supabase.from("user_roles").delete().eq("user_id", empId);
    const { error } = await supabase.from("user_roles").insert({ user_id: empId, role });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setOpen(false);
    setEmpId("");
    setDept("");
    setRole("");
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Set role &amp; department
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set employee access</DialogTitle>
          <DialogDescription>
            Assign a department and single role. Replaces any existing role.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.email} {e.custom_id ? `(${e.custom_id})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={dept}
              onValueChange={(v) => {
                setDept(v as Department);
                setRole("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Department (none = Global Admin)" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordAdminDialog({
  employees,
}: {
  employees: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !password) return toast.error("Pick employee and enter password");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);

    try {
      const res = await adminChangePassword({ data: { employeeId: empId, password } });
      if (res.success) {
        toast.success("Employee password changed successfully!");
        setOpen(false);
        setEmpId("");
        setPassword("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Employee Password</DialogTitle>
          <DialogDescription>
            Change the login password for any registered employee.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.email} {e.custom_id ? `(${e.custom_id})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-new-password">New Password</Label>
            <Input
              id="admin-new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeStatusDialog({
  employee,
  onClose,
}: {
  employee: Profile;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"tasks" | "attendance">("tasks");

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-details", employee.id],
    queryFn: () => getEmployeeDetails({ data: { employeeId: employee.id } }),
    enabled: !!employee.id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "todo":
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800";
      case "in_progress":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-500 dark:border-amber-900/30";
      case "done":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-500 dark:border-emerald-900/30";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "todo":
        return "To Do";
      case "in_progress":
        return "In Progress";
      case "done":
        return "Done";
      default:
        return status;
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px]">
              Status Inspection
            </Badge>
            {employee.department && (
              <Badge variant="outline" className="capitalize text-[10px]">
                {DEPARTMENT_LABELS[employee.department]}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {employee.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground break-all">
            {employee.email} {employee.custom_id ? `(${employee.custom_id})` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selection */}
        <div className="flex border-b w-full gap-2">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${
              activeTab === "tasks"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListTodo className="h-4 w-4" />
            <span>Tasks</span>
          </button>
          <button
            onClick={() => setActiveTab("attendance")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${
              activeTab === "attendance"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Attendance</span>
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              <span>Loading employee status details...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 border border-destructive/20 bg-destructive/5 text-destructive p-4 rounded-lg text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{(error as Error).message || "Failed to load status details."}</span>
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              {activeTab === "tasks" && (
                <div className="space-y-3">
                  {data.tasks && data.tasks.length > 0 ? (
                    data.tasks.map((task: any) => (
                      <div
                        key={task.id}
                        className="p-3 border rounded-lg bg-muted/10 hover:bg-muted/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <h4 className="font-semibold text-sm break-words">{task.title}</h4>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                              {task.description}
                            </p>
                          )}
                          {task.due_date && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>Due: {format(new Date(task.due_date), "PP")}</span>
                            </div>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`capitalize self-start sm:self-center font-medium ${getStatusColor(
                            task.status
                          )}`}
                        >
                          {getStatusLabel(task.status)}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                      No tasks assigned to this employee.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "attendance" && (
                <div className="space-y-3">
                  {data.attendance && data.attendance.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Date</TableHead>
                            <TableHead>Clock In</TableHead>
                            <TableHead>Clock Out</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.attendance.map((att: any) => {
                            const isForgotten = att.clock_in && !att.clock_out && (
                              new Date().getHours() >= 22 || 
                              format(new Date(), "yyyy-MM-dd") !== att.date
                            );
                            
                            return (
                              <TableRow key={att.id} className="hover:bg-muted/10">
                                <TableCell className="font-medium text-xs">
                                  {format(new Date(att.date), "PPP")}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono">
                                  {att.clock_in ? format(new Date(att.clock_in), "p") : "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono">
                                  {att.clock_out ? format(new Date(att.clock_out), "p") : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {isForgotten ? (
                                    <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none text-[10px] font-medium">
                                      Absent (No Clockout)
                                    </Badge>
                                  ) : att.clock_out ? (
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-medium dark:bg-emerald-950/20 dark:text-emerald-500">
                                      Present
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-600 bg-amber-500/5 border-amber-200/50 text-[10px] font-medium">
                                      Active
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                      No attendance records found for this employee.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button onClick={onClose} variant="secondary" className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEmployeeDialog({
  employee,
  onChanged,
}: {
  employee: Profile;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await deleteEmployee({ data: { employeeId: employee.id } });
      if (res.success) {
        toast.success("Employee removed successfully");
        setOpen(false);
        onChanged();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-xs inline-flex gap-1.5 items-center text-destructive hover:text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Remove</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Remove Employee</span>
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2">
            <p className="text-sm">
              Are you sure you want to permanently remove <strong>{employee.name}</strong> (User ID: {employee.custom_id || "—"})?
            </p>
            <div className="rounded-md bg-destructive/5 border border-destructive/10 p-3 text-xs text-destructive">
              <strong className="font-semibold block mb-1">Warning: This action is permanent and cannot be undone!</strong>
              <ul className="list-disc pl-4 space-y-1">
                <li>Permanently deletes login credentials</li>
                <li>Removes profile and role mappings</li>
                <li>Deletes all associated tasks and attendance history</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
          >
            {busy ? "Removing..." : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



