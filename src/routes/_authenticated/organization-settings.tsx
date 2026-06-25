import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Settings, Wifi } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function DepartmentRulesDialog({ dept, onUpdated }: { dept: any, onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const rules = dept.attendance_rules || {};
  const [clockIn, setClockIn] = useState(rules.expected_clock_in || "09:00");
  const [clockOut, setClockOut] = useState(rules.expected_clock_out || "17:00");
  const [lateTol, setLateTol] = useState(rules.late_tolerance_mins || 15);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    const updatedRules = {
      ...rules,
      expected_clock_in: clockIn,
      expected_clock_out: clockOut,
      late_tolerance_mins: lateTol,
    };
    const { error } = await supabase.from("departments").update({ attendance_rules: updatedRules }).eq("id", dept.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Rules updated");
      setOpen(false);
      onUpdated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Edit Rules">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attendance Rules - {dept.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Expected Clock In</Label>
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Expected Clock Out</Label>
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Late Tolerance (minutes)</Label>
            <Input type="number" value={lateTol} onChange={(e) => setLateTol(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={busy}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/organization-settings")({
  component: OrganizationSettings,
});

const AVAILABLE_PERMISSIONS = [
  { id: "manage_organization", label: "Manage Organization (Create/Edit Roles & Depts)" },
  { id: "manage_employees", label: "Manage Employees" },
  { id: "assign_tasks_all", label: "Assign Tasks (Global)" },
  { id: "assign_tasks_dept", label: "Assign Tasks (Department Only)" },
  { id: "view_tasks_all", label: "View All Tasks" },
  { id: "view_attendance_all", label: "View All Attendance" },
  { id: "view_attendance_dept", label: "View Department Attendance" },
  { id: "manage_notes", label: "Manage Admin Notes" },
];

function OrganizationSettings() {
  const { isGlobalAdmin, hasPermission, profile, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<{ id: string; name: string; attendance_rules: any }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; level: number; permissions: string[]; department_id: string }[]>([]);
  const [leaveCategories, setLeaveCategories] = useState<{ id: string; name: string; description: string | null; max_days: number | null }[]>([]);
  
  // Organization details
  const [orgName, setOrgName] = useState("");
  const [wifis, setWifis] = useState<{ id: string; ssid: string }[]>([]);
  const [savingOrg, setSavingOrg] = useState(false);

  // Forms
  const [newWifiSSID, setNewWifiSSID] = useState("");
  const [savingWifi, setSavingWifi] = useState(false);

  const [newDeptName, setNewDeptName] = useState("");
  const [newRoleDeptId, setNewRoleDeptId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleLevel, setNewRoleLevel] = useState(1);
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatMaxDays, setNewCatMaxDays] = useState("");

  useEffect(() => {
    loadData();
  }, [profile?.organization_id]);

  async function loadData() {
    if (!profile?.organization_id) return;
    setLoading(true);
    const [{ data: depts }, { data: rls }, { data: cats }, { data: orgData }, { data: wifisData }] = await Promise.all([
      supabase.from("departments").select("*").order("created_at"),
      supabase.from("roles").select("*").order("level", { ascending: false }),
      supabase.from("leave_categories").select("*").order("name"),
      supabase.from("organizations").select("name").eq("id", profile.organization_id).single(),
      supabase.from("organization_wifis").select("*").order("ssid"),
    ]);
    setDepartments(depts || []);
    setRoles((rls || []).map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [] })));
    setLeaveCategories(cats || []);
    if (orgData) {
      setOrgName(orgData.name);
    }
    setWifis(wifisData || []);
    setLoading(false);
  }

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    if (!newDeptName.trim() || !profile?.organization_id) return;

    const { error } = await supabase.from("departments").insert({
      name: newDeptName.trim(),
      organization_id: profile.organization_id,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Department created");
      setNewDeptName("");
      loadData();
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Department deleted"); loadData(); }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    if (!newRoleName.trim() || !newRoleDeptId) {
      return toast.error("Role Name and Department are required");
    }

    if (!profile?.organization_id) return;

    const { error } = await supabase.from("roles").insert({
      name: newRoleName.trim(),
      level: newRoleLevel,
      permissions: newRolePerms,
      organization_id: profile.organization_id,
      department_id: newRoleDeptId,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Role created");
      setNewRoleName("");
      setNewRoleDeptId("");
      setNewRoleLevel(1);
      setNewRolePerms([]);
      loadData();
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Role deleted"); loadData(); }
  };

  const toggleNewRolePerm = (perm: string) => {
    setNewRolePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    if (!newCatName.trim() || !profile?.organization_id) return;

    const { error } = await supabase.from("leave_categories").insert({
      name: newCatName.trim(),
      description: newCatDesc.trim() || null,
      max_days: newCatMaxDays ? parseInt(newCatMaxDays) : null,
      organization_id: profile.organization_id,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Leave category created");
      setNewCatName("");
      setNewCatDesc("");
      setNewCatMaxDays("");
      loadData();
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    const { error } = await supabase.from("leave_categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Leave category deleted");
      loadData();
    }
  };

  const handleUpdateOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    if (!orgName.trim() || !profile?.organization_id) return;
    setSavingOrg(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: orgName.trim(),
      })
      .eq("id", profile.organization_id);
    setSavingOrg(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Organization name updated successfully!");
      await refresh();
    }
  };

  const handleCreateWifi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    if (!newWifiSSID.trim() || !profile?.organization_id) return;
    setSavingWifi(true);
    const { error } = await supabase.from("organization_wifis").insert({
      organization_id: profile.organization_id,
      ssid: newWifiSSID.trim(),
    });
    setSavingWifi(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Wi-Fi SSID added successfully!");
      setNewWifiSSID("");
      loadData();
    }
  };

  const handleDeleteWifi = async (id: string) => {
    if (profile?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Modifications are disabled for the dummy organization.");
      return;
    }
    const { error } = await supabase.from("organization_wifis").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Wi-Fi SSID deleted successfully!");
      loadData();
    }
  };

  if (!isGlobalAdmin && !hasPermission("manage_organization")) {
    return <div className="p-6">You do not have permission to manage the organization.</div>;
  }

  return (
    <div id="tour-settings-page" className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground mt-2">Manage custom departments, roles, and permissions.</p>
      </div>

      {loading ? (
        <Loader2 className="animate-spin w-6 h-6" />
      ) : (
        <div className="space-y-6">
          {/* GENERAL SETTINGS */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Configure your organization's general parameters.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateOrgName} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name-input">Organization Name</Label>
                    <Input
                      id="org-name-input"
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={savingOrg}>
                    {savingOrg ? "Saving..." : "Update Name"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Office Wi-Fi Networks</CardTitle>
                <CardDescription>Configure allowed Wi-Fi networks (SSIDs) for on-site attendance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleCreateWifi} className="flex gap-2">
                  <Input
                    placeholder="e.g. Office-WiFi-Main"
                    value={newWifiSSID}
                    onChange={e => setNewWifiSSID(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={savingWifi}>
                    {savingWifi ? "Adding..." : "Add WiFi"}
                  </Button>
                </form>

                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {wifis.map(wifi => (
                    <div key={wifi.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg border text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <Wifi className="h-4 w-4 text-primary" /> {wifi.ssid}
                      </span>
                      <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => handleDeleteWifi(wifi.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {wifis.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No office Wi-Fi networks configured yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
          
          {/* DEPARTMENTS */}
          <Card>
            <CardHeader>
              <CardTitle>Departments</CardTitle>
              <CardDescription>Create structural divisions for your company.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleCreateDept} className="flex gap-2">
                <Input 
                  placeholder="New Department Name" 
                  value={newDeptName} 
                  onChange={e => setNewDeptName(e.target.value)} 
                />
                <Button type="submit"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </form>
              <div className="space-y-2">
                {departments.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span>{d.name}</span>
                    <div className="flex gap-1">
                      <DepartmentRulesDialog dept={d} onUpdated={loadData} />
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteDept(d.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {departments.length === 0 && <p className="text-sm text-muted-foreground">No departments created yet.</p>}
              </div>
            </CardContent>
          </Card>

          {/* ROLES */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Roles</CardTitle>
              <CardDescription>Define scalable roles and assign specific powers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleCreateRole} className="space-y-4 border p-4 rounded-lg bg-muted/10">
                <h3 className="font-medium text-sm">Create New Role</h3>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label>Department</Label>
                    <Select value={newRoleDeptId} onValueChange={setNewRoleDeptId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Role Name</Label>
                    <Input placeholder="e.g. Senior Project Manager" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Power Level (0-100)</Label>
                    <Input type="number" min="0" max="100" value={newRoleLevel} onChange={e => setNewRoleLevel(parseInt(e.target.value))} />
                    <p className="text-xs text-muted-foreground">Higher levels can assign tasks to lower levels.</p>
                  </div>
                  <div className="space-y-2 mt-2">
                    <Label>Permissions</Label>
                    <div className="grid gap-2">
                      {AVAILABLE_PERMISSIONS.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <Checkbox 
                            checked={newRolePerms.includes(p.id)}
                            onCheckedChange={() => toggleNewRolePerm(p.id)}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="mt-2">Create Role</Button>
                </div>
              </form>

              <div className="space-y-6">
                {departments.map(d => {
                  const deptRoles = roles.filter(r => r.department_id === d.id);
                  if (deptRoles.length === 0) return null;
                  return (
                    <div key={d.id} className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{d.name}</h4>
                      {deptRoles.map(r => (
                        <div key={r.id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{r.name} <span className="text-muted-foreground text-xs font-normal ml-2">Level {r.level}</span></div>
                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDeleteRole(r.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {r.permissions.map(p => (
                              <span key={p} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full">
                                {p}
                              </span>
                            ))}
                            {r.permissions.length === 0 && <span className="text-xs text-muted-foreground">No permissions</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles created yet.</p>}
              </div>
            </CardContent>
          </Card>

          {/* LEAVE CATEGORIES */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Leave Categories</CardTitle>
              <CardDescription>
                Configure organization-wide leave categories and maximum yearly limits for employees.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleCreateCategory} className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-lg bg-muted/10">
                <div className="space-y-1">
                  <Label htmlFor="cat-name">Category Name</Label>
                  <Input 
                    id="cat-name"
                    placeholder="e.g. Sick Leave" 
                    value={newCatName} 
                    onChange={e => setNewCatName(e.target.value)} 
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cat-max-days">Max Days/Year (Optional)</Label>
                  <Input 
                    id="cat-max-days"
                    type="number" 
                    min="1"
                    placeholder="e.g. 12" 
                    value={newCatMaxDays} 
                    onChange={e => setNewCatMaxDays(e.target.value)} 
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label htmlFor="cat-desc">Description</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="cat-desc"
                      placeholder="Brief description of when this leave can be taken" 
                      value={newCatDesc} 
                      onChange={e => setNewCatDesc(e.target.value)} 
                    />
                    <Button type="submit"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                  </div>
                </div>
              </form>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category Name</TableHead>
                      <TableHead>Max Days/Year</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveCategories.map(cat => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell>{cat.max_days ?? "No Limit"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{cat.description ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive h-8 w-8" 
                            onClick={() => handleDeleteCategory(cat.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leaveCategories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          No leave categories created. Add one above to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      )}
    </div>
  );
}
