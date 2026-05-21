import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

interface AttRow {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
}

function AttendancePage() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: records, refetch } = useQuery({
    queryKey: ["attendance-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as AttRow[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-for-attendance"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name,department");
      return data ?? [];
    },
  });

  const profMap = useMemo(() => {
    const m = new Map<string, { name: string; department: string | null }>();
    for (const p of profiles ?? []) m.set((p as { id: string }).id, p as { name: string; department: string | null });
    return m;
  }, [profiles]);

  const todayRec = records?.find((r) => r.employee_id === user!.id && r.date === today);

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

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your hours and review team records</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>{format(new Date(), "PPPP")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-center">
          <div className="text-sm">
            <div>
              <span className="text-muted-foreground">In: </span>
              <span className="font-medium">
                {todayRec?.clock_in ? format(new Date(todayRec.clock_in), "p") : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Out: </span>
              <span className="font-medium">
                {todayRec?.clock_out ? format(new Date(todayRec.clock_out), "p") : "—"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button onClick={clockIn} disabled={!!todayRec?.clock_in}>
              Clock In
            </Button>
            <Button
              variant="secondary"
              onClick={clockOut}
              disabled={!todayRec?.clock_in || !!todayRec?.clock_out}
            >
              Clock Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>
            You see your own records; admins and department heads see their team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(records ?? []).map((r) => {
                  const p = profMap.get(r.employee_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.date), "PP")}</TableCell>
                      <TableCell>{p?.name ?? "—"}</TableCell>
                      <TableCell className="capitalize">{p?.department ?? "—"}</TableCell>
                      <TableCell>
                        {r.clock_in ? format(new Date(r.clock_in), "p") : "—"}
                      </TableCell>
                      <TableCell>
                        {r.clock_out ? format(new Date(r.clock_out), "p") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!records?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No attendance records yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
