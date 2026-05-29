import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useMemo, useState } from "react";
import { getAttendanceRecords } from "@/integrations/supabase/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canViewEmployeeDetails } from "@/lib/roles";

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

const isForgottenClockout = (r: AttRow | undefined) => {
  if (!r || !r.clock_in || r.clock_out) return false;
  const recDate = new Date(r.date + "T00:00:00");
  const today = new Date();
  const recDateStart = new Date(recDate.getFullYear(), recDate.getMonth(), recDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (recDateStart < todayStart) return true;
  if (recDateStart.getTime() === todayStart.getTime()) {
    return today.getHours() >= 22;
  }
  return false;
};

const isOvertimeRecord = (r: AttRow) => {
  if (!r.clock_out) return false;
  const outTime = new Date(r.clock_out);
  return outTime.getHours() >= 18;
};

function AttendancePage() {
  const { user, roles } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const hasAccess = canViewEmployeeDetails(roles || []);

  const [filterDate, setFilterDate] = useState("");

  const { data: records, refetch } = useQuery({
    queryKey: ["attendance-all", filterDate],
    queryFn: async () => {
      const data = await getAttendanceRecords({
        data: {
          filterDate: filterDate || undefined,
        },
      });
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
          {todayRec && isForgottenClockout(todayRec) && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none font-medium ml-2">
              Absent (Forgot Clockout)
            </Badge>
          )}
          <div className="flex gap-2 ml-auto">
            <Button onClick={clockIn} disabled={!!todayRec?.clock_in}>
              Clock In
            </Button>
            <Button
              variant="secondary"
              onClick={clockOut}
              disabled={!todayRec?.clock_in || !!todayRec?.clock_out || isForgottenClockout(todayRec)}
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
            {hasAccess
              ? "Filter and view team attendance logs by specific date"
              : "Filter and view your personal attendance logs by specific date"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Filter */}
          <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg bg-muted/20 border">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="filter-date" className="text-xs font-semibold text-muted-foreground">Select Date</Label>
              <Input
                id="filter-date"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-background"
              />
            </div>
            {filterDate && (
              <Button
                variant="ghost"
                onClick={() => setFilterDate("")}
                className="text-xs h-10 px-3 hover:bg-muted"
              >
                Clear Filter
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Status</TableHead>
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
                      <TableCell>
                        {isForgottenClockout(r) ? (
                          <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none font-medium">
                            Absent
                          </Badge>
                        ) : r.clock_out ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-medium">
                              Present
                            </Badge>
                            {isOvertimeRecord(r) && (
                              <Badge className="bg-amber-500/10 text-amber-600 border-none font-medium">
                                Overtime
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Badge className="bg-blue-500/10 text-blue-600 border-none font-medium animate-pulse">
                            On the clock
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!records?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
