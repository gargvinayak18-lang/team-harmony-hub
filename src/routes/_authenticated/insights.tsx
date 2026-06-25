import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Users,
  CheckSquare,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Save,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addDays,
  subDays,
  addMonths,
  subMonths,
} from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
});

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  custom_id: string | null;
}

interface AttRecord {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
}

interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  assignee_id: string;
  assigner_id: string;
  created_at: string;
}

interface AdminNoteRecord {
  id: string;
  employee_id: string;
  created_by: string;
  period_type: "weekly" | "monthly";
  period_start: string;
  content: string;
  updated_at: string;
}

const isForgottenClockout = (record: { date: string; clock_in: string | null; clock_out: string | null }) => {
  if (!record.clock_in || record.clock_out) return false;
  const recordDate = new Date(record.date + "T00:00:00");
  const today = new Date();
  const recordDateStart = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (recordDateStart < todayStart) return true;
  if (recordDateStart.getTime() === todayStart.getTime()) {
    return today.getHours() >= 22;
  }
  return false;
};

const isOvertimeRecord = (r: { clock_out: string | null }) => {
  if (!r.clock_out) return false;
  const outTime = new Date(r.clock_out);
  return outTime.getHours() >= 18;
};

const getOvertimeHours = (r: { clock_out: string | null }) => {
  if (!r.clock_out) return 0;
  const outTime = new Date(r.clock_out);
  const outHours = outTime.getHours() + outTime.getMinutes() / 60;
  return outHours > 18 ? outHours - 18 : 0;
};

function InsightsPage() {
  const navigate = useNavigate();
  const { user, profile, isGlobalAdmin, hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const allowed = isGlobalAdmin || hasPermission("assign_tasks_all") || hasPermission("manage_employees") || hasPermission("view_attendance_all");

  const [viewType, setViewType] = useState<"weekly" | "monthly">("weekly");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [noteContent, setNoteContent] = useState<string>("");

  if (!allowed) {
    navigate({ to: "/dashboard" });
    return null;
  }

  const periodBounds = useMemo(() => {
    if (viewType === "weekly") {
      const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
      const sunday = endOfWeek(currentDate, { weekStartsOn: 1 });
      return {
        start: monday,
        end: sunday,
        startStr: format(monday, "yyyy-MM-dd"),
        endStr: format(sunday, "yyyy-MM-dd"),
        label: `${format(monday, "MMM d")} - ${format(sunday, "MMM d, yyyy")}`,
      };
    } else {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        start: monthStart,
        end: monthEnd,
        startStr: format(monthStart, "yyyy-MM-dd"),
        endStr: format(monthEnd, "yyyy-MM-dd"),
        label: format(currentDate, "MMMM yyyy"),
      };
    }
  }, [viewType, currentDate]);

  const handlePrevPeriod = () => {
    if (viewType === "weekly") setCurrentDate((prev) => subDays(prev, 7));
    else setCurrentDate((prev) => subMonths(prev, 1));
  };

  const handleNextPeriod = () => {
    if (viewType === "weekly") setCurrentDate((prev) => addDays(prev, 7));
    else setCurrentDate((prev) => addMonths(prev, 1));
  };

  const { data: depts } = useQuery({
    queryKey: ["insights-departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,name");
      return data ?? [];
    }
  });

  const { data: employees } = useQuery<EmployeeRow[]>({
    queryKey: ["insights-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name,email,department_id,custom_id");
      return data ?? [];
    },
  });

  const { data: attendance } = useQuery<AttRecord[]>({
    queryKey: ["insights-attendance", periodBounds.startStr, periodBounds.endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("date", periodBounds.startStr)
        .lte("date", periodBounds.endStr);
      if (error) throw error;
      return data as AttRecord[];
    },
  });

  const { data: tasks } = useQuery<TaskRecord[]>({
    queryKey: ["insights-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TaskRecord[];
    },
  });

  const { data: notes, refetch: refetchNotes } = useQuery<AdminNoteRecord[]>({
    queryKey: ["insights-notes", periodBounds.startStr, viewType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notes")
        .select("*")
        .eq("period_type", viewType)
        .eq("period_start", periodBounds.startStr);
      if (error) throw error;
      return data as AdminNoteRecord[];
    },
  });

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => {
      const deptMatch = deptFilter === "all" || emp.department_id === deptFilter;
      const empMatch = employeeFilter === "all" || emp.id === employeeFilter;
      return deptMatch && empMatch;
    });
  }, [employees, deptFilter, employeeFilter]);

  const filteredEmpIds = useMemo(() => {
    return new Set(filteredEmployees.map((e) => e.id));
  }, [filteredEmployees]);

  const activeNote = useMemo(() => {
    if (!notes || employeeFilter === "all") return null;
    const found = notes.find((n) => n.employee_id === employeeFilter);
    return found || null;
  }, [notes, employeeFilter]);

  useMemo(() => {
    setNoteContent(activeNote?.content || "");
  }, [activeNote]);

  const saveNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (employeeFilter === "all" || !user) return;
      const { error } = await supabase.from("admin_notes").upsert(
        {
          employee_id: employeeFilter,
          created_by: user.id,
          period_type: viewType,
          period_start: periodBounds.startStr,
          content: content.trim(),
          updated_at: new Date().toISOString(),
          organization_id: profile!.organization_id!,
        },
        { onConflict: "employee_id,period_type,period_start" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review note saved successfully!");
      refetchNotes();
    },
    onError: (err: any) => {
      toast.error("Failed to save note: " + err.message);
    },
  });

  const handleSaveNote = () => {
    if (!noteContent.trim()) {
      return toast.error("Note content cannot be empty.");
    }
    saveNoteMutation.mutate(noteContent);
  };

  const stats = useMemo(() => {
    const totalEmployees = filteredEmployees.length;
    if (totalEmployees === 0) {
      return { totalTasks: 0, completedTasks: 0, pendingTasks: 0, taskCompletionRate: 0, averageAttendanceRate: 0, totalAttendanceEntries: 0 };
    }

    const periodTasks = (tasks ?? []).filter((t) => filteredEmpIds.has(t.assignee_id));
    const completedTasks = periodTasks.filter((t) => t.status === "done").length;
    const pendingTasks = periodTasks.length - completedTasks;
    const taskCompletionRate = periodTasks.length ? Math.round((completedTasks / periodTasks.length) * 100) : 0;

    const periodAttendance = (attendance ?? []).filter((a) => filteredEmpIds.has(a.employee_id) && !isForgottenClockout(a));
    const totalPossibleDays = eachDayOfInterval({ start: periodBounds.start, end: periodBounds.end }).filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length;
    const totalPossibleChecks = totalEmployees * totalPossibleDays;
    const actualChecks = periodAttendance.length;
    const averageAttendanceRate = totalPossibleChecks ? Math.round((actualChecks / totalPossibleChecks) * 100) : 0;

    return {
      totalTasks: periodTasks.length,
      completedTasks,
      pendingTasks,
      taskCompletionRate,
      averageAttendanceRate: Math.min(averageAttendanceRate, 100),
      totalAttendanceEntries: actualChecks,
    };
  }, [filteredEmployees, tasks, attendance, filteredEmpIds, periodBounds]);

  const attendanceChartData = useMemo(() => {
    if (!attendance || filteredEmployees.length === 0) return [];
    const days = eachDayOfInterval({ start: periodBounds.start, end: periodBounds.end });
    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayName = format(day, viewType === "weekly" ? "EEEE (MMM d)" : "d");
      const presentCount = attendance.filter((a) => a.date === dateStr && filteredEmpIds.has(a.employee_id) && !isForgottenClockout(a)).length;
      const rate = filteredEmployees.length ? Math.round((presentCount / filteredEmployees.length) * 100) : 0;
      return { name: dayName, Present: presentCount, Rate: rate };
    });
  }, [attendance, filteredEmployees, periodBounds, filteredEmpIds, viewType]);

  const tasksChartData = useMemo(() => {
    const periodTasks = (tasks ?? []).filter((t) => filteredEmpIds.has(t.assignee_id));
    if (employeeFilter === "all") {
      const deptsMap = new Map<string, string>();
      depts?.forEach(d => deptsMap.set(d.id, d.name));
      
      const countsByDept: Record<string, { todo: number; in_progress: number; done: number }> = {};
      countsByDept["unassigned"] = { todo: 0, in_progress: 0, done: 0 };
      depts?.forEach(d => { countsByDept[d.id] = { todo: 0, in_progress: 0, done: 0 }; });

      const empDeptMap = new Map<string, string>();
      (employees ?? []).forEach((e) => empDeptMap.set(e.id, e.department_id || "unassigned"));

      periodTasks.forEach((t) => {
        const d = empDeptMap.get(t.assignee_id) || "unassigned";
        if (countsByDept[d]) countsByDept[d][t.status]++;
      });

      return Object.entries(countsByDept)
        .filter(([key]) => deptFilter === "all" || key === deptFilter)
        .map(([key, value]) => ({
          name: key === "unassigned" ? "Unassigned" : (deptsMap.get(key) || "No Dept"),
          "To Do": value.todo,
          "In Progress": value.in_progress,
          Done: value.done,
        }));
    } else {
      const counts = { todo: 0, in_progress: 0, done: 0 };
      periodTasks.forEach((t) => { counts[t.status]++; });
      return [
        { name: "To Do", value: counts.todo, color: "#94a3b8" },
        { name: "In Progress", value: counts.in_progress, color: "#f59e0b" },
        { name: "Done", value: counts.done, color: "#10b981" },
      ].filter((x) => x.value > 0);
    }
  }, [tasks, filteredEmpIds, employeeFilter, employees, deptFilter, depts]);

  const overtimeDailyData = useMemo(() => {
    if (!attendance || filteredEmployees.length === 0) return [];
    const days = eachDayOfInterval({ start: periodBounds.start, end: periodBounds.end });
    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayName = format(day, viewType === "weekly" ? "EEEE (MMM d)" : "d");
      const dayRecords = attendance.filter((a) => a.date === dateStr && filteredEmpIds.has(a.employee_id));
      const staffAfter6PM = dayRecords.filter(isOvertimeRecord).length;
      const totalOvertimeHours = dayRecords.reduce((acc, a) => acc + getOvertimeHours(a), 0);
      return {
        name: dayName,
        "Staff Working After 6PM": staffAfter6PM,
        "Total Overtime Hours": Math.round(totalOvertimeHours * 10) / 10,
      };
    });
  }, [attendance, filteredEmployees, periodBounds, filteredEmpIds, viewType]);

  const employeeOvertimeData = useMemo(() => {
    if (!attendance || filteredEmployees.length === 0) return [];
    const data = filteredEmployees.map((emp) => {
      const empRecords = attendance.filter((a) => a.employee_id === emp.id);
      const totalHours = empRecords.reduce((acc, r) => acc + getOvertimeHours(r), 0);
      const overtimeDays = empRecords.filter(isOvertimeRecord).length;
      return {
        name: emp.name,
        "Overtime Hours": Math.round(totalHours * 10) / 10,
        "Overtime Days": overtimeDays,
      };
    }).filter((x) => x["Overtime Hours"] > 0 || x["Overtime Days"] > 0);
    return data.sort((a, b) => b["Overtime Hours"] - a["Overtime Hours"]);
  }, [attendance, filteredEmployees]);

  const eligibleEmployeesForDropdown = useMemo(() => {
    if (!employees) return [];
    if (deptFilter === "all") return employees;
    return employees.filter((e) => e.department_id === deptFilter);
  }, [employees, deptFilter]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights & Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Monitor attendance rates, task allocations, and keep notes on weekly/monthly performance.
          </p>
        </div>
        <div className="flex items-center bg-muted p-1 rounded-lg self-start">
          <Button variant={viewType === "weekly" ? "default" : "ghost"} size="sm" onClick={() => { setViewType("weekly"); setCurrentDate(new Date()); setEmployeeFilter("all"); }}>Weekly View</Button>
          <Button variant={viewType === "monthly" ? "default" : "ghost"} size="sm" onClick={() => { setViewType("monthly"); setCurrentDate(new Date()); setEmployeeFilter("all"); }}>Monthly View</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={handlePrevPeriod}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="flex items-center gap-2 min-w-[180px] justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{periodBounds.label}</span>
              </div>
              <Button variant="outline" size="icon" onClick={handleNextPeriod}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <div className="flex flex-wrap gap-4 flex-1 justify-end">
              <div className="w-full sm:w-48 space-y-1.5">
                <Label className="text-xs">Filter Department</Label>
                <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setEmployeeFilter("all"); }}>
                  <SelectTrigger><SelectValue placeholder="All Departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {depts?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-60 space-y-1.5">
                <Label className="text-xs">Filter Employee</Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger><SelectValue placeholder="All Employees" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {eligibleEmployeesForDropdown.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} {emp.custom_id ? `(${emp.custom_id})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground uppercase">Avg Attendance</p><h3 className="text-2xl font-bold mt-1">{stats.averageAttendanceRate}%</h3></div><Clock className="h-8 w-8 text-primary/30" /></div><div className="mt-2 text-xs text-muted-foreground">{stats.totalAttendanceEntries} check-ins recorded</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground uppercase">Task Completion</p><h3 className="text-2xl font-bold mt-1">{stats.taskCompletionRate}%</h3></div><CheckSquare className="h-8 w-8 text-success/30" /></div><div className="mt-2 text-xs text-muted-foreground">{stats.completedTasks} of {stats.totalTasks} tasks done</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground uppercase">Pending Tasks</p><h3 className="text-2xl font-bold mt-1">{stats.pendingTasks}</h3></div><TrendingUp className="h-8 w-8 text-warning/30" /></div><div className="mt-2 text-xs text-muted-foreground">Tasks needing completion</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground uppercase">Monitored Employees</p><h3 className="text-2xl font-bold mt-1">{filteredEmployees.length}</h3></div><Users className="h-8 w-8 text-info/30" /></div><div className="mt-2 text-xs text-muted-foreground">Matching current filters</div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Attendance Trend</CardTitle>
            <CardDescription>{viewType === "weekly" ? "Daily attendance percentage for the active week" : "Daily attendance rate over the active month"}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] h-[300px]">
            {attendanceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceChartData}>
                  <defs>
                    <linearGradient id="attendanceColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary, #3b82f6)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-primary, #3b82f6)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}%`, "Attendance Rate"]} />
                  <Area type="monotone" dataKey="Rate" stroke="var(--color-primary, #3b82f6)" strokeWidth={2} fillOpacity={1} fill="url(#attendanceColor)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No attendance records for this period</div>}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Tasks Distribution</CardTitle>
            <CardDescription>{employeeFilter === "all" ? "Task statuses grouped by department" : "Active task status distribution for selected employee"}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] h-[300px] flex items-center justify-center">
            {tasksChartData.length > 0 ? (
              employeeFilter === "all" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tasksChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="To Do" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="In Progress" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Done" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col sm:flex-row items-center justify-around gap-4">
                  <div className="w-48 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={tasksChartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {(tasksChartData as any[]).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value) => [value, "Tasks"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {(tasksChartData as any[]).map((item) => (
                      <div key={item.name} className="flex items-center gap-3 text-sm">
                        <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-medium">{item.name}:</span>
                        <span className="text-muted-foreground">{item.value} tasks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : <div className="text-sm text-muted-foreground">No active tasks matching filter criteria</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Overtime Attendance (After 6:00 PM)</CardTitle>
            <CardDescription>{viewType === "weekly" ? "Daily count of staff members staying after 6:00 PM this week" : "Daily count of staff members staying after 6:00 PM this month"}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] h-[300px]">
            {overtimeDailyData.length > 0 && overtimeDailyData.some(d => d["Staff Working After 6PM"] > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overtimeDailyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Staff Working After 6PM" fill="var(--color-primary, #3b82f6)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No staff worked after 6:00 PM in this period</div>}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Overtime Hours by Employee</CardTitle>
            <CardDescription>Total overtime hours accumulated by staff member (hours after 6:00 PM)</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] h-[300px]">
            {employeeOvertimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeOvertimeData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} hrs`, "Overtime Hours"]} />
                  <Bar dataKey="Overtime Hours" fill="var(--color-primary, #3b82f6)" opacity={0.8} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No overtime hours recorded for this period</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Performance & Review Notes</CardTitle>
          </div>
          <CardDescription>
            {employeeFilter === "all" ? "Select a specific employee in the filter above to read or write performance notes for this period." : `Review notes for the selected period (${viewType})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {employeeFilter === "all" ? (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-4 flex items-center gap-3 border text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                Select an employee from the filter dropdown above to draft or edit their review note.
              </div>
              {notes && notes.length > 0 ? (
                <div className="space-y-4 mt-6">
                  <h4 className="text-sm font-semibold">Active Notes for this Period:</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {notes.map((n) => {
                      const emp = (employees ?? []).find((e) => e.id === n.employee_id);
                      return (
                        <Card key={n.id} className="bg-card">
                          <CardHeader className="py-3 flex flex-row items-center justify-between border-b">
                            <span className="font-semibold text-xs text-primary">{emp?.name || "Unknown Employee"}</span>
                            <Badge variant="outline" className="text-[10px]">{format(new Date(n.updated_at), "MMM d, h:mm a")}</Badge>
                          </CardHeader>
                          <CardContent className="pt-3 text-sm">
                            <p className="whitespace-pre-wrap line-clamp-4 text-muted-foreground">{n.content}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : <div className="text-center text-xs text-muted-foreground py-8">No review notes created for this period yet.</div>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm">Note for: {filteredEmployees[0]?.name || "Selected Employee"}</h4>
                  <p className="text-xs text-muted-foreground">Period: <span className="font-medium text-primary capitalize">{viewType}</span> ({periodBounds.label})</p>
                </div>
                {activeNote && <span className="text-xs text-muted-foreground">Last modified: {format(new Date(activeNote.updated_at), "PPp")}</span>}
              </div>
              <div className="space-y-2">
                <Textarea placeholder="Keep a note of attendance, work progress, tasks completed, or general performance observations..." className="min-h-[140px]" value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveNote} disabled={saveNoteMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {saveNoteMutation.isPending ? "Saving Note..." : "Save Note"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
