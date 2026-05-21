import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_ROLES,
  DEPARTMENT_LABELS,
  ROLES_BY_DEPARTMENT,
  ROLE_LABELS,
  canManageEmployees,
  type AppRole,
  type Department,
} from "@/lib/roles";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/employees")({
  component: EmployeesPage,
});

interface Profile {
  id: string;
  name: string;
  email: string;
  department: Department | null;
}

function EmployeesPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const allowed = canManageEmployees(roles);

  useEffect(() => {
    if (!allowed) navigate({ to: "/dashboard" });
  }, [allowed, navigate]);

  const { data: rows, refetch } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const [{ data: profs }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,department").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
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

  if (!allowed) return null;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee directory</h1>
          <p className="text-sm text-muted-foreground">
            Manage employees, departments, and roles
          </p>
        </div>
        <EditRolesDialog
          employees={rows ?? []}
          onChanged={refetch}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All employees</CardTitle>
          <CardDescription>{rows?.length ?? 0} total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((p) => (
                  <TableRow key={p.id}>
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
                  </TableRow>
                ))}
                {!rows?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                      No employees yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adding new employees</CardTitle>
          <CardDescription>
            New hires sign up via the login page (Sign up tab). After they create their account, use{" "}
            <strong>Set role &amp; department</strong> above to confirm or adjust their access.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
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
        <Button>
          <Plus className="h-4 w-4 mr-2" />
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
                    {e.name} — {e.email}
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
