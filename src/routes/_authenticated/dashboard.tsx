import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, Users, ListTodo } from "lucide-react";
import { ROLE_LABELS, DEPARTMENT_LABELS, canAssignTasks } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, roles } = useAuth();

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: stats, refetch } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [tasksRes, attRes, empRes] = await Promise.all([
        supabase.from("tasks").select("id,status,assignee_id"),
        supabase
          .from("attendance")
          .select("id,clock_in,clock_out")
          .eq("employee_id", user!.id)
          .eq("date", today)
          .maybeSingle(),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      const tasks = tasksRes.data ?? [];
      const my = tasks.filter((t) => t.assignee_id === user!.id);
      return {
        total: tasks.length,
        myOpen: my.filter((t) => t.status !== "done").length,
        myDone: my.filter((t) => t.status === "done").length,
        attendance: attRes.data,
        employees: empRes.count ?? 0,
      };
    },
  });

  const clockIn = async () => {
    const { error } = await supabase
      .from("attendance")
      .upsert(
        { employee_id: user!.id, date: today, clock_in: new Date().toISOString() },
        { onConflict: "employee_id,date" },
      );
    if (error) toast.error(error.message);
    else {
      toast.success("Clocked in");
      refetch();
    }
  };

  const clockOut = async () => {
    const { error } = await supabase
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("employee_id", user!.id)
      .eq("date", today);
    if (error) toast.error(error.message);
    else {
      toast.success("Clocked out");
      refetch();
    }
  };

  const att = stats?.attendance;
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}
        </h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {profile?.department && (
            <Badge variant="secondary">{DEPARTMENT_LABELS[profile.department]}</Badge>
          )}
          {roles.map((r) => (
            <Badge key={r}>{ROLE_LABELS[r]}</Badge>
          ))}
          {!roles.length && (
            <Badge variant="outline">No role assigned — ask your admin</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ListTodo} label="My open tasks" value={stats?.myOpen ?? "—"} />
        <StatCard icon={CheckSquare} label="My done" value={stats?.myDone ?? "—"} />
        <StatCard icon={Users} label="Employees" value={stats?.employees ?? "—"} />
        <StatCard
          icon={Clock}
          label="Today"
          value={
            att?.clock_in ? (att.clock_out ? "Done" : "On the clock") : "Not started"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>Today — {format(new Date(), "PPPP")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <div>
              <span className="text-muted-foreground">Clock-in: </span>
              <span className="font-medium">
                {att?.clock_in ? format(new Date(att.clock_in), "p") : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Clock-out: </span>
              <span className="font-medium">
                {att?.clock_out ? format(new Date(att.clock_out), "p") : "—"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button onClick={clockIn} disabled={!!att?.clock_in}>
              Clock In
            </Button>
            <Button onClick={clockOut} disabled={!att?.clock_in || !!att?.clock_out} variant="secondary">
              Clock Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {canAssignTasks(roles) && (
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>You have assignment privileges</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Go to <strong>Tasks</strong> to create and delegate work.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
          </div>
          <Icon className="h-8 w-8 text-muted-foreground/40" />
        </div>
      </CardContent>
    </Card>
  );
}
