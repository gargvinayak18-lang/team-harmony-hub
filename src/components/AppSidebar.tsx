import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, CheckSquare, Clock, Users, LogOut, TrendingUp, Settings, CalendarDays } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Leaves", url: "/leaves", icon: CalendarDays },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { profile, roles, hasPermission, signOut } = useAuth();
  
  const showEmployees = hasPermission("manage_employees") || hasPermission("view_attendance_all");
  const showInsights = hasPermission("assign_tasks_all") || hasPermission("manage_employees");
  const showSettings = hasPermission("manage_organization");

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex items-center justify-center flex-shrink-0">
            <img 
              src="/logo.png" 
              alt="WorkDesk" 
              className="h-8 w-auto object-contain mix-blend-multiply dark:bg-white dark:mix-blend-normal dark:p-1 dark:rounded-md"
            />
          </div>
          {state !== "collapsed" && (
            <div className="flex flex-col overflow-hidden leading-tight">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{profile?.organization_name || "Organization"}</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {profile?.department_name || "—"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {showEmployees && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/employees"}>
                    <Link to="/employees" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Employees</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {showInsights && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/insights"}>
                    <Link to="/insights" className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span>Insights</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {showSettings && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/organization-settings"}>
                    <Link to="/organization-settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2 space-y-2">
          <div className="text-xs">
            <div className="font-medium truncate">{profile?.name ?? "—"}</div>
            <div className="text-muted-foreground truncate">
              {roles.length ? roles.map((r) => r.name).join(", ") : "No role yet"}
            </div>
          </div>
          <ChangePasswordSelfDialog />
          <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign out
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function ChangePasswordSelfDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return toast.error("Please enter a new password");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setOpen(false);
      setPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <KeyRound className="h-3.5 w-3.5 mr-2" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Update your login password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="self-new-password">New Password</Label>
            <Input
              id="self-new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Updating…" : "Update Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
