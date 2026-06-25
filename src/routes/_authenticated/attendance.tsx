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
import { getAttendanceRecords, getCurrentWifiSSID } from "@/integrations/supabase/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wifi, Home, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

interface AttRow {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  attendance_type?: string;
  clock_in_wifi_ssid?: string | null;
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
  const { user, profile, isGlobalAdmin, hasPermission } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const hasAccess = isGlobalAdmin || hasPermission("view_attendance_all") || hasPermission("manage_employees");

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
      const { data } = await supabase.from("profiles").select("id,name,department_id, departments(name, attendance_rules)");
      return data ?? [];
    },
  });

  const profMap = useMemo(() => {
    const m = new Map<string, { name: string; deptName: string; rules: any }>();
    for (const p of profiles ?? []) {
      m.set((p as any).id, {
        name: (p as any).name,
        deptName: (p as any).departments?.name || "—",
        rules: (p as any).departments?.attendance_rules || {},
      });
    }
    return m;
  }, [profiles]);

  const { data: wifisData } = useQuery({
    queryKey: ["org-wifis", profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_wifis")
        .select("ssid")
        .eq("organization_id", profile!.organization_id!);
      if (error) throw error;
      return data ?? [];
    }
  });

  const officeWifiList = useMemo(() => wifisData?.map(w => w.ssid) || [], [wifisData]);

  const { data: detectedWifi, isLoading: detectingWifi, refetch: scanWifi } = useQuery({
    queryKey: ["current-wifi-network"],
    queryFn: async () => {
      const res = await getCurrentWifiSSID();
      return res.ssid || "Unknown Network";
    }
  });

  const activeSSID = detectedWifi || "Scanning...";

  const todayRec = records?.find((r) => r.employee_id === user!.id && r.date === today);

  const clockIn = async () => {
    toast.loading("Scanning network & clocking in...", { id: "clock-in-page" });
    try {
      const wifiRes = await scanWifi();
      const detectedSSID = wifiRes.data || "Unknown Network";
      
      const isOfficeWiFi = officeWifiList.includes(detectedSSID) || (officeWifiList.length === 0 && detectedSSID === "Office-WiFi");
      const attType = isOfficeWiFi ? "on_site" : "work_from_home";

      const { error } = await supabase
        .from("attendance")
        .upsert(
          { 
            employee_id: user!.id, 
            date: today, 
            clock_in: new Date().toISOString(), 
            organization_id: profile!.organization_id!,
            attendance_type: attType,
            clock_in_wifi_ssid: detectedSSID,
          },
          { onConflict: "employee_id,date" },
        );
      if (error) throw error;
      toast.success(`Clocked in (${isOfficeWiFi ? "On Site" : "WFH"} via ${detectedSSID})`, { id: "clock-in-page" });
      refetch();
    } catch (err: any) {
      toast.error("Failed to clock in: " + err.message, { id: "clock-in-page" });
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
        <CardContent className="flex flex-wrap gap-6 items-center justify-between">
          <div className="flex flex-wrap gap-8 items-center">
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

            {/* WiFi Connection Status */}
            {!todayRec?.clock_in && (
              <div className="flex items-center gap-3 border p-2.5 rounded-lg bg-muted/20">
                <Wifi className={`h-4 w-4 text-primary ${detectingWifi ? "animate-spin" : "animate-pulse"}`} />
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Connected Network</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {detectingWifi ? "Scanning Wi-Fi..." : activeSSID}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => void scanWifi()} disabled={detectingWifi}>
                      <RefreshCw className={`h-3 w-3 ${detectingWifi ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {todayRec?.clock_in && (
              <div className="flex items-center gap-2 text-xs border p-2 rounded-lg bg-muted/10">
                {todayRec.attendance_type === "work_from_home" ? (
                  <>
                    <Home className="h-4 w-4 text-indigo-500 animate-bounce" />
                    <span className="font-medium text-indigo-700 dark:text-indigo-400">
                      Work From Home <span className="text-muted-foreground font-normal">(via {todayRec.clock_in_wifi_ssid || "Remote WiFi"})</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      On Site <span className="text-muted-foreground font-normal">(via {todayRec.clock_in_wifi_ssid})</span>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {todayRec && isForgottenClockout(todayRec) && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none font-medium">
              Absent (Forgot Clockout)
            </Badge>
          )}

          <div className="flex gap-2">
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
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(records ?? []).map((r) => {
                  const p = profMap.get(r.employee_id);
                  const rules = p?.rules || { expected_clock_in: "09:00", expected_clock_out: "17:00", late_tolerance_mins: 15 };
                  
                  let isLate = false;
                  let leftEarly = false;

                  if (r.clock_in) {
                    const inTime = new Date(r.clock_in);
                    const [expHr, expMin] = (rules.expected_clock_in || "09:00").split(":").map(Number);
                    const expectedIn = new Date(inTime);
                    expectedIn.setHours(expHr, expMin + (rules.late_tolerance_mins || 0), 0, 0);
                    if (inTime > expectedIn) isLate = true;
                  }

                  if (r.clock_out) {
                    const outTime = new Date(r.clock_out);
                    const [expOutHr, expOutMin] = (rules.expected_clock_out || "17:00").split(":").map(Number);
                    const expectedOut = new Date(outTime);
                    expectedOut.setHours(expOutHr, expOutMin, 0, 0);
                    if (outTime < expectedOut) leftEarly = true;
                  }

                  return (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.date), "PP")}</TableCell>
                      <TableCell>{p?.name ?? "—"}</TableCell>
                      <TableCell className="capitalize">{p?.deptName ?? "—"}</TableCell>
                      <TableCell>
                        {r.clock_in ? (
                          r.attendance_type === "work_from_home" ? (
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/50 flex items-center gap-1 w-fit text-[10px] py-0.5 px-2">
                              <Home className="h-3 w-3" /> WFH {r.clock_in_wifi_ssid ? `(${r.clock_in_wifi_ssid})` : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50 flex items-center gap-1 w-fit text-[10px] py-0.5 px-2">
                              <Wifi className="h-3 w-3" /> On Site {r.clock_in_wifi_ssid ? `(${r.clock_in_wifi_ssid})` : ""}
                            </Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
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
                            {isLate ? (
                              <Badge className="bg-orange-500/10 text-orange-600 border-none font-medium">Late</Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-medium">On Time</Badge>
                            )}
                            {leftEarly && (
                              <Badge className="bg-destructive/10 text-destructive border-none font-medium">Left Early</Badge>
                            )}
                            {isOvertimeRecord(r) && (
                              <Badge className="bg-amber-500/10 text-amber-600 border-none font-medium">Overtime</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Badge className="bg-blue-500/10 text-blue-600 border-none font-medium animate-pulse">On the clock</Badge>
                            {isLate && <Badge className="bg-orange-500/10 text-orange-600 border-none font-medium">Late</Badge>}
                          </div>
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
