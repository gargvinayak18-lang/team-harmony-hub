import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, useMemo, useEffect } from "react";
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
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/employees")({
  component: EmployeesPage,
});

interface Profile {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  custom_id: string | null;
}

interface Dept { id: string; name: string }
interface Role { id: string; name: string; department_id: string; level: number; }

function EmployeesPage() {
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  
  const isManager = hasPermission("manage_employees");
  const isViewer = hasPermission("view_attendance_all") || isManager;
  const allowed = isManager || isViewer;

  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Profile & { deptName: string } | null>(null);

  useEffect(() => {
    if (!allowed) navigate({ to: "/dashboard" });
  }, [allowed, navigate]);

  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ["all-employees-data"],
    queryFn: async () => {
      const [profsRes, rolesRes, allDepts, allRoles] = await Promise.all([
        supabase.from("profiles").select("id,name,email,department_id,custom_id, departments(name)").order("created_at"),
        supabase.from("user_roles").select("user_id, roles(name)"),
        supabase.from("departments").select("id, name"),
        supabase.from("roles").select("id, name, department_id, level"),
      ]);

      if (profsRes.error) throw profsRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const profs = profsRes.data;
      const rs = rolesRes.data;

      const map = new Map<string, string[]>();
      for (const r of rs ?? []) {
        const arr = map.get(r.user_id) ?? [];
        if (r.roles && (r.roles as any).name) {
          arr.push((r.roles as any).name);
        }
        map.set(r.user_id, arr);
      }
      
      const employees = ((profs ?? []) as any[]).map((p) => ({
        ...p,
        deptName: p.departments?.name || "",
        roles: map.get(p.id) ?? [],
      }));

      return { employees, depts: allDepts.data || [], sysRoles: allRoles.data || [] };
    },
  });

  const filteredRows = useMemo(() => {
    if (!data?.employees) return [];
    const query = search.toLowerCase().trim();
    if (!query) return data.employees;
    return data.employees.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const email = (p.email || "").toLowerCase();
      const customId = (p.custom_id || "").toLowerCase();
      const label = (p.deptName || "").toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        label.includes(query) ||
        customId.includes(query)
      );
    });
  }, [data, search]);

  if (!allowed) return null;

  return (
    <div id="tour-employees-page" className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee directory</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Manage employees, departments, and roles" : "View employees and their statuses"}
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <AddEmployeeDialog depts={data?.depts || []} roles={data?.sysRoles || []} onChanged={refetch} />
            <AuthorizeEmailDialog depts={data?.depts || []} roles={data?.sysRoles || []} />
            <EditRolesDialog
              employees={data?.employees ?? []}
              depts={data?.depts || []} 
              sysRoles={data?.sysRoles || []}
              onChanged={refetch}
            />
            <ChangePasswordAdminDialog employees={data?.employees ?? []} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>All employees</CardTitle>
              <CardDescription>
                {filteredRows.length} shown of {data?.employees?.length ?? 0} total
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
                      {p.deptName ? (
                        <Badge variant="secondary">{p.deptName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.roles.length ? (
                          p.roles.map((r: string) => (
                            <Badge key={r} variant="outline">
                              {r}
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

      {selectedEmployee && (
        <EmployeeStatusDialog
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function AddEmployeeDialog({ depts, roles, onChanged }: { depts: Dept[], roles: Role[], onChanged: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customId, setCustomId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const filteredRoles = useMemo(() => {
    if (!deptId) return [];
    return roles.filter(r => r.department_id === deptId);
  }, [deptId, roles]);

  const handleDeptChange = (newDept: string) => {
    setDeptId(newDept);
    setRoleId(""); // Clear role when department changes
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !customId || !email || !password || !deptId || !roleId) {
      return toast.error("Please fill in name, User ID, email, password, department, and role");
    }

    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    setBusy(true);

    const emailToUse = email.trim();

    // Check if the email already exists in profiles
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", emailToUse)
      .maybeSingle();

    if (checkError) {
      setBusy(false);
      return toast.error("Failed to check existing email: " + checkError.message);
    }
    if (existingProfile) {
      setBusy(false);
      return toast.error(`An employee with email "${emailToUse}" already exists.`);
    }

    // Check if custom ID already exists in profiles (scoped to this org)
    const { data: existingCustomId, error: checkCustomIdError } = await supabase
      .from("profiles")
      .select("id")
      .eq("custom_id", customId.trim())
      .eq("organization_id", profile?.organization_id!)
      .maybeSingle();

    if (checkCustomIdError) {
      setBusy(false);
      return toast.error("Failed to check custom user ID: " + checkCustomIdError.message);
    }
    if (existingCustomId) {
      setBusy(false);
      return toast.error(`An employee with Custom User ID "${customId.trim()}" already exists in this organization.`);
    }

    try {
      let signUpData: any;
      if (profile?.email === "demo@workdesk.local") {
        const dummyUserId = "demo-user-" + Math.random().toString(36).substring(2, 11);
        signUpData = {
          user: {
            id: dummyUserId,
            email: emailToUse,
          }
        };
        const { error: profileError } = await supabase.from("profiles").insert({
          id: dummyUserId,
          name,
          email: emailToUse,
          custom_id: customId.trim(),
          organization_id: profile.organization_id,
          department_id: deptId || null,
        });
        if (profileError) {
          setBusy(false);
          return toast.error(profileError.message);
        }
      } else {
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
              organization_id: profile?.organization_id,
            },
          },
        });

        if (signUpError) {
          setBusy(false);
          return toast.error(signUpError.message);
        }
        signUpData = data;
      }

      if (signUpData.user?.id && profile?.organization_id) {
        await supabase.from("profiles").update({ organization_id: profile.organization_id, department_id: deptId || null }).eq("id", signUpData.user.id);
        await supabase.from("user_roles").insert({ user_id: signUpData.user.id, role_id: roleId, organization_id: profile.organization_id });
      }

      toast.success("Employee added successfully!");
      setOpen(false);
      setName("");
      setCustomId("");
      setEmail("");
      setPassword("");
      setDeptId("");
      setRoleId("");
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
            <Label>Full Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Doe" />
          </div>
          <div className="space-y-2">
            <Label>Custom User ID</Label>
            <Input required value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="e.g. john_doe" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. employee@company.com" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={deptId} onValueChange={handleDeptChange}>
              <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
              <SelectContent>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={!deptId}>
              <SelectTrigger>
                <SelectValue placeholder={deptId ? "Select Role" : "Select Department First"} />
              </SelectTrigger>
              <SelectContent>
                {filteredRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                {filteredRoles.length === 0 && deptId && (
                  <div className="p-2 text-sm text-muted-foreground">No roles in this department.</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create Employee"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AuthorizeEmailDialog({ depts, roles }: { depts: Dept[], roles: Role[] }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const filteredRoles = useMemo(() => {
    if (!deptId) return [];
    return roles.filter(r => r.department_id === deptId);
  }, [deptId, roles]);

  const handleDeptChange = (newDept: string) => {
    setDeptId(newDept);
    setRoleId("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !deptId || !roleId) {
      return toast.error("Please fill in email, department, and role");
    }
    setBusy(true);

    try {
      // 1. Check if email already exists in profiles
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim())
        .maybeSingle();

      if (existingProfile) {
        setBusy(false);
        return toast.error("An employee with this email is already registered.");
      }

      // 2. Check if email is already in authorized_emails
      const { data: existingAuth } = await supabase
        .from("authorized_emails" as any)
        .select("email")
        .eq("email", email.trim())
        .maybeSingle();

      if (existingAuth) {
        setBusy(false);
        return toast.error("This email is already pre-authorized.");
      }

      // 3. Insert into authorized_emails
      const { error } = await supabase
        .from("authorized_emails" as any)
        .insert({
          email: email.trim(),
          organization_id: profile?.organization_id!,
          department_id: deptId,
          role_id: roleId,
        });

      if (error) throw error;

      toast.success("Email pre-authorized successfully!");
      setOpen(false);
      setEmail("");
      setDeptId("");
      setRoleId("");
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Authorize Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pre-Authorize Email for Signup</DialogTitle>
          <DialogDescription>
            Authorize an email address so the employee can sign up themselves with their chosen password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input 
              type="email" 
              required 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="e.g. employee@company.com" 
            />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={deptId} onValueChange={handleDeptChange}>
              <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
              <SelectContent>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={!deptId}>
              <SelectTrigger>
                <SelectValue placeholder={deptId ? "Select Role" : "Select Department First"} />
              </SelectTrigger>
              <SelectContent>
                {filteredRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Authorizing…" : "Authorize"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRolesDialog({ employees, depts, sysRoles, onChanged }: { employees: Profile[]; depts: Dept[]; sysRoles: Role[]; onChanged: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const filteredRoles = useMemo(() => {
    if (!deptId) return [];
    return sysRoles.filter(r => r.department_id === deptId);
  }, [deptId, sysRoles]);

  const handleDeptChange = (newDept: string) => {
    setDeptId(newDept);
    setRoleId(""); // Clear role when department changes
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !deptId || !roleId) return toast.error("Pick employee, department, and role");
    setBusy(true);

    await supabase.from("profiles").update({ department_id: deptId || null }).eq("id", empId);
    await supabase.from("user_roles").delete().eq("user_id", empId);
    const { error } = await supabase.from("user_roles").insert({ user_id: empId, role_id: roleId, organization_id: profile?.organization_id! });
    
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setOpen(false);
    setEmpId("");
    setDeptId("");
    setRoleId("");
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Set role &amp; department</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set employee access</DialogTitle>
          <DialogDescription>Assign a department and single role. Replaces any existing role.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={deptId} onValueChange={handleDeptChange}>
              <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
              <SelectContent>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={!deptId}>
              <SelectTrigger>
                <SelectValue placeholder={deptId ? "Select Role" : "Select Department First"} />
              </SelectTrigger>
              <SelectContent>
                {filteredRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                {filteredRoles.length === 0 && deptId && (
                  <div className="p-2 text-sm text-muted-foreground">No roles in this department.</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordAdminDialog({ employees }: { employees: Profile[] }) {
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
      <DialogTrigger asChild><Button variant="outline">Change password</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Employee Password</DialogTitle>
          <DialogDescription>Change the login password for any registered employee.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Updating…" : "Update Password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeStatusDialog({ employee, onClose }: { employee: Profile & { deptName: string }; onClose: () => void; }) {
  const [activeTab, setActiveTab] = useState<"tasks" | "attendance">("tasks");

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-details", employee.id],
    queryFn: () => getEmployeeDetails({ data: { employeeId: employee.id } }),
    enabled: !!employee.id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "todo": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800";
      case "in_progress": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-500 dark:border-amber-900/30";
      case "done": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-500 dark:border-emerald-900/30";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px]">Status Inspection</Badge>
            {employee.deptName && <Badge variant="outline" className="capitalize text-[10px]">{employee.deptName}</Badge>}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">{employee.name}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground break-all">{employee.email}</DialogDescription>
        </DialogHeader>

        <div className="flex border-b w-full gap-2">
          <button onClick={() => setActiveTab("tasks")} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${activeTab === "tasks" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><ListTodo className="h-4 w-4" /><span>Tasks</span></button>
          <button onClick={() => setActiveTab("attendance")} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${activeTab === "attendance" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><Clock className="h-4 w-4" /><span>Attendance</span></button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {isLoading && <div className="flex flex-col items-center justify-center py-12"><span className="animate-spin h-5 w-5 border-b-2 border-primary" /></div>}
          {!isLoading && !error && data && (
            <>
              {activeTab === "tasks" && (
                <div className="space-y-3">
                  {data.tasks && data.tasks.length > 0 ? (
                    data.tasks.map((task: any) => (
                      <div key={task.id} className="p-3 border rounded-lg bg-muted/10 flex justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <h4 className="font-semibold text-sm">{task.title}</h4>
                          {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                        </div>
                        <Badge variant="outline" className={`capitalize self-start font-medium ${getStatusColor(task.status)}`}>{task.status.replace("_", " ")}</Badge>
                      </div>
                    ))
                  ) : <div className="text-center text-sm py-12 border-2 border-dashed rounded-lg">No tasks assigned.</div>}
                </div>
              )}
              {activeTab === "attendance" && (
                <div className="space-y-3">
                  {data.attendance && data.attendance.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {data.attendance.map((att: any) => (
                            <TableRow key={att.id}>
                              <TableCell className="font-medium text-xs">{format(new Date(att.date), "PPP")}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{att.clock_in ? format(new Date(att.clock_in), "p") : "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{att.clock_out ? format(new Date(att.clock_out), "p") : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : <div className="text-center text-sm py-12 border-2 border-dashed rounded-lg">No attendance records found.</div>}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="border-t pt-4">
          <Button onClick={onClose} variant="secondary">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEmployeeDialog({ employee, onChanged }: { employee: Profile; onChanged: () => void; }) {
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
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs inline-flex gap-1.5 items-center text-destructive"><Trash2 className="h-3.5 w-3.5" /><span>Remove</span></Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /><span>Remove Employee</span></DialogTitle>
          <DialogDescription>Permanently remove {employee.name}?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>{busy ? "Removing..." : "Delete Permanently"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
