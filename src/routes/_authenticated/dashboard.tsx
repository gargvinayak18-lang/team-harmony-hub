import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, Users, ListTodo, AlertCircle, Calendar, User, Search, Eye } from "lucide-react";
import { ROLE_LABELS, DEPARTMENT_LABELS, canAssignTasks, canViewEmployeeDetails } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { getEmployeeDetails } from "@/integrations/supabase/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  assignee_id: string;
  assigner_id: string;
  created_at: string;
}

function Dashboard() {
  const { user, profile, roles } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const isTodayForgottenClockout = (clockIn: string | null, clockOut: string | null) => {
    if (!clockIn || clockOut) return false;
    return new Date().getHours() >= 22;
  };

  // Drag and drop local state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<"todo" | "in_progress" | "done" | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [tasksListType, setTasksListType] = useState<"open" | "done" | null>(null);
  const [showEmployeesModal, setShowEmployeesModal] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  const { data: stats, refetch } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [tasksRes, attRes, empRes] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase
          .from("attendance")
          .select("id,clock_in,clock_out")
          .eq("employee_id", user!.id)
          .eq("date", today)
          .maybeSingle(),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      const tasks = (tasksRes.data ?? []) as TaskRow[];
      const my = tasks.filter((t) => t.assignee_id === user!.id);
      return {
        total: tasks.length,
        myOpen: my.filter((t) => t.status !== "done").length,
        myDone: my.filter((t) => t.status === "done").length,
        attendance: attRes.data,
        employees: empRes.count ?? 0,
        rawTasks: tasks,
      };
    },
  });

  // Query profiles for employee name mapping
  const { data: profiles, error: profilesError, isLoading: isProfilesLoading } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,email,department,custom_id");
      if (error) {
        console.error("Error loading profiles list:", error);
        toast.error("Failed to load profiles: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });

  const empMap = useMemo(() => {
    const s = new Map<string, string>();
    for (const a of profiles ?? []) {
      s.set(a.id, a.name);
    }
    return s;
  }, [profiles]);

  const updateTaskStatus = async (id: string, status: "todo" | "in_progress" | "done") => {
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status: " + error.message);
    } else {
      toast.success(
        "Task updated to " +
          (status === "in_progress"
            ? "In Progress"
            : status === "done"
            ? "Done"
            : "To Do")
      );
      refetch();
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingTaskId(id);
    e.dataTransfer.setData("text/plain", id);
    e.currentTarget.classList.add("opacity-50");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingTaskId(null);
    setDragOverCol(null);
    e.currentTarget.classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent, col: "todo" | "in_progress" | "done") => {
    e.preventDefault();
    setDragOverCol(col);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, status: "todo" | "in_progress" | "done") => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggingTaskId;
    setDragOverCol(null);
    setDraggingTaskId(null);
    if (taskId) {
      const task = stats?.rawTasks.find((t) => t.id === taskId);
      if (task && task.status !== status) {
        void updateTaskStatus(taskId, status);
      }
    }
  };

  const clockIn = async () => {
    const { error } = await supabase
      .from("attendance")
      .upsert(
        {
          employee_id: user!.id,
          date: today,
          clock_in: new Date().toISOString(),
        },
        { onConflict: "employee_id,date" }
      );
    if (error) {
      toast.error(error.message);
    } else {
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
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Clocked out");
      refetch();
    }
  };

  const myTasks = useMemo(() => {
    if (!stats?.rawTasks) return [];
    return stats.rawTasks.filter((s) => s.assignee_id === user!.id);
  }, [stats?.rawTasks, user]);

  const kanbanData = useMemo(() => ({
    todo: myTasks.filter((s) => s.status === "todo"),
    in_progress: myTasks.filter((s) => s.status === "in_progress"),
    done: myTasks.filter((s) => s.status === "done"),
  }), [myTasks]);

  const filteredListTasks = useMemo(() => {
    if (!tasksListType) return [];
    return tasksListType === "open"
      ? myTasks.filter((s) => s.status !== "done")
      : myTasks.filter((s) => s.status === "done");
  }, [myTasks, tasksListType]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const query = employeeSearch.toLowerCase().trim();
    if (!query) return profiles;
    return profiles.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const email = (p.email || "").toLowerCase();
      const customId = (p.custom_id || "").toLowerCase();
      const label = p.department ? (DEPARTMENT_LABELS[p.department as keyof typeof DEPARTMENT_LABELS] || "").toLowerCase() : "";
      return (
        name.includes(query) ||
        email.includes(query) ||
        label.includes(query) ||
        customId.includes(query)
      );
    });
  }, [profiles, employeeSearch]);

  const att = stats?.attendance;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}
        </h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {profile?.department && (
            <Badge variant="secondary">{DEPARTMENT_LABELS[profile.department as keyof typeof DEPARTMENT_LABELS] || profile.department}</Badge>
          )}
          {roles.map((r) => (
            <Badge key={r}>{ROLE_LABELS[r] || r}</Badge>
          ))}
          {!roles.length && (
            <Badge variant="outline">No role assigned — ask your admin</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ListTodo}
          label="My open tasks"
          value={stats?.myOpen ?? "—"}
          onClick={() => setTasksListType("open")}
        />
        <StatCard
          icon={CheckSquare}
          label="My done"
          value={stats?.myDone ?? "—"}
          onClick={() => setTasksListType("done")}
        />
        <StatCard
          icon={Users}
          label="My employees"
          value={stats?.employees ?? "—"}
          onClick={() => setShowEmployeesModal(true)}
        />
        <StatCard
          icon={Clock}
          label="Today"
          value={
            att?.clock_in ? (
              isTodayForgottenClockout(att.clock_in, att.clock_out) ? "Absent" : att.clock_out ? "Done" : "On the clock"
            ) : "Not started"
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
          {att?.clock_in && isTodayForgottenClockout(att.clock_in, att.clock_out) && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none font-medium ml-2">
              Absent (Forgot Clockout)
            </Badge>
          )}
          <div className="flex gap-2 ml-auto">
            <Button onClick={clockIn} disabled={!!att?.clock_in}>
              Clock In
            </Button>
            <Button
              onClick={clockOut}
              disabled={!att?.clock_in || !!att?.clock_out || isTodayForgottenClockout(att.clock_in, att.clock_out)}
              variant="secondary"
            >
              Clock Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">My Tasks Board</h2>
          <p className="text-xs text-muted-foreground">Drag and drop cards to update progress status</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* To Do Column */}
          <div
            onDragOver={(e) => handleDragOver(e, "todo")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, "todo")}
            className={`flex flex-col rounded-xl border p-4 bg-muted/20 min-h-[400px] transition-all duration-200 ${
              dragOverCol === "todo" ? "bg-muted border-dashed border-primary shadow-sm scale-[1.01]" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-semibold text-sm">To Do</span>
              </div>
              <Badge variant="outline">{kanbanData.todo.length}</Badge>
            </div>
            <div className="flex-1 space-y-3">
              {kanbanData.todo.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  assignerName={empMap.get(task.assigner_id) || "Manager"}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedTask(task)}
                />
              ))}
              {kanbanData.todo.length === 0 && (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-muted/55 rounded-lg py-8 text-xs text-muted-foreground">
                  No tasks to do
                </div>
              )}
            </div>
          </div>

          {/* In Progress Column */}
          <div
            onDragOver={(e) => handleDragOver(e, "in_progress")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, "in_progress")}
            className={`flex flex-col rounded-xl border p-4 bg-muted/20 min-h-[400px] transition-all duration-200 ${
              dragOverCol === "in_progress" ? "bg-amber-500/5 border-dashed border-amber-500/50 shadow-sm scale-[1.01]" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-semibold text-sm">In Progress</span>
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-none">
                {kanbanData.in_progress.length}
              </Badge>
            </div>
            <div className="flex-1 space-y-3">
              {kanbanData.in_progress.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  assignerName={empMap.get(task.assigner_id) || "Manager"}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedTask(task)}
                />
              ))}
              {kanbanData.in_progress.length === 0 && (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-muted/55 rounded-lg py-8 text-xs text-muted-foreground">
                  No active tasks
                </div>
              )}
            </div>
          </div>

          {/* Done Column */}
          <div
            onDragOver={(e) => handleDragOver(e, "done")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, "done")}
            className={`flex flex-col rounded-xl border p-4 bg-muted/20 min-h-[400px] transition-all duration-200 ${
              dragOverCol === "done" ? "bg-emerald-500/5 border-dashed border-emerald-500/50 shadow-sm scale-[1.01]" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-sm">Done</span>
              </div>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-none">
                {kanbanData.done.length}
              </Badge>
            </div>
            <div className="flex-1 space-y-3">
              {kanbanData.done.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  assignerName={empMap.get(task.assigner_id) || "Manager"}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedTask(task)}
                />
              ))}
              {kanbanData.done.length === 0 && (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-muted/55 rounded-lg py-8 text-xs text-muted-foreground">
                  No completed tasks
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

      {/* Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant={
                  selectedTask?.status === "todo"
                    ? "outline"
                    : selectedTask?.status === "in_progress"
                    ? "secondary"
                    : "default"
                }
              >
                {selectedTask?.status === "todo" ? "To Do" : selectedTask?.status === "in_progress" ? "In Progress" : "Done"}
              </Badge>
            </div>
            <DialogTitle className="text-base font-semibold tracking-tight break-words">
              {selectedTask?.title}
            </DialogTitle>
            <DialogDescription className="text-[10px]">
              Task Details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Description</span>
              <div className="bg-muted/30 border rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap break-words min-h-[60px] max-h-[180px] overflow-y-auto">
                {selectedTask?.description || <span className="italic text-muted-foreground">No description provided.</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-3">
              <div className="space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase font-semibold">Assigner</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs truncate">
                    {selectedTask ? (empMap.get(selectedTask.assigner_id) || "Manager") : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase font-semibold">Due Date</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs">
                    {selectedTask?.due_date ? format(new Date(selectedTask.due_date), "PPp") : "No due date"}
                  </span>
                </div>
              </div>
            </div>

            {selectedTask?.created_at && (
              <div className="text-[9px] text-muted-foreground text-right border-t pt-2.5">
                Assigned on {format(new Date(selectedTask.created_at), "PPp")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Tasks List Dialog */}
      <Dialog open={!!tasksListType} onOpenChange={(open) => !open && setTasksListType(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {tasksListType === "open" ? "My Open Tasks" : "My Completed Tasks"}
            </DialogTitle>
            <DialogDescription>
              {tasksListType === "open"
                ? "These tasks are currently active (To Do or In Progress)."
                : "These tasks have been successfully completed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {filteredListTasks.length > 0 ? (
              <div className="space-y-3">
                {filteredListTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg bg-muted/20 gap-3"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <h4 className="font-semibold text-sm break-words">{t.title}</h4>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                          {t.description}
                        </p>
                      )}
                      {t.due_date && (
                        <p className="text-[10px] text-muted-foreground">
                          Due: {format(new Date(t.due_date), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      <Select
                        value={t.status}
                        onValueChange={(v) => {
                          void updateTaskStatus(t.id, v as "todo" | "in_progress" | "done");
                        }}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                No {tasksListType} tasks found.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Employees List Dialog */}
      <Dialog open={showEmployeesModal} onOpenChange={setShowEmployeesModal}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle>Employees List</DialogTitle>
            <DialogDescription>
              A directory of all registered staff members and their departments.
            </DialogDescription>
          </DialogHeader>

          {/* Search bar in Dashboard Dialog */}
          <div className="relative my-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, department..."
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="pl-8 bg-background"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-4">
            {isProfilesLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Loading employees...
              </div>
            ) : profilesError ? (
              <div className="text-center text-sm text-red-500 py-8">
                Error loading employees: {(profilesError as Error).message || "An unexpected error occurred."}
              </div>
            ) : filteredProfiles && filteredProfiles.length > 0 ? (
              <div className="space-y-3">
                {filteredProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <h4 className="font-semibold text-sm break-words">{p.name}</h4>
                      <p className="text-xs text-muted-foreground break-all">{p.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.custom_id && (
                        <Badge variant="outline" className="text-[10px]">
                          {p.custom_id}
                        </Badge>
                      )}
                      {p.department && (
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {DEPARTMENT_LABELS[p.department as keyof typeof DEPARTMENT_LABELS] || p.department}
                        </Badge>
                      )}
                      {canViewEmployeeDetails(roles) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[10px] inline-flex gap-1 items-center text-primary hover:text-primary hover:bg-primary/5 cursor-pointer"
                          onClick={() => {
                            setSelectedEmployee(p);
                            setShowEmployeesModal(false); // Close dashboard overview modal when viewing details
                          }}
                        >
                          <Eye className="h-3 w-3" />
                          <span>View Status</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                {employeeSearch ? "No matching employees found" : "No employees found."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedEmployee && (
        <EmployeeStatusDialog
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

// StatCard Component
function StatCard({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:border-primary/50 hover:shadow-xs transition-all duration-200" : ""}
    >
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

// Kanban Card Component
function KanbanCard({
  task,
  assignerName,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  task: TaskRow;
  assignerName: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const isOverdue = useMemo(() => {
    if (!task.due_date || task.status === "done") return false;
    return new Date(task.due_date) < new Date();
  }, [task.due_date, task.status]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-card border rounded-lg p-3 shadow-xs cursor-grab active:cursor-grabbing hover:shadow-md hover:border-muted-foreground/30 transition-all duration-200 select-none group"
    >
      <div className="space-y-2">
        <h4 className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors duration-150 break-words">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 break-words">
            {task.description}
          </p>
        )}
        <div className="flex flex-col gap-1.5 pt-2 border-t text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">From: {assignerName}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5 flex-shrink-0" />
                <span>Due: {format(new Date(task.due_date), "MMM d, h:mm a")}</span>
              </div>
              {isOverdue && (
                <Badge
                  variant="destructive"
                  className="h-4 py-0 text-[8px] flex gap-0.5 items-center bg-destructive/10 text-destructive border-none font-medium"
                >
                  <AlertCircle className="h-2 w-2" />
                  Overdue
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeStatusDialog({
  employee,
  onClose,
}: {
  employee: any;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"tasks" | "attendance">("tasks");
  const { roles } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-details-dashboard", employee.id],
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
                {DEPARTMENT_LABELS[employee.department as keyof typeof DEPARTMENT_LABELS] || employee.department}
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
                          {data.attendance.map((attItem: any) => {
                            const isForgotten = attItem.clock_in && !attItem.clock_out && (
                              new Date().getHours() >= 22 || 
                              format(new Date(), "yyyy-MM-dd") !== attItem.date
                            );
                            
                            return (
                              <TableRow key={attItem.id} className="hover:bg-muted/10">
                                <TableCell className="font-medium text-xs">
                                  {format(new Date(attItem.date), "PPP")}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono">
                                  {attItem.clock_in ? format(new Date(attItem.clock_in), "p") : "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono">
                                  {attItem.clock_out ? format(new Date(attItem.clock_out), "p") : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {isForgotten ? (
                                    <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none text-[10px] font-medium">
                                      Absent (No Clockout)
                                    </Badge>
                                  ) : attItem.clock_out ? (
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
