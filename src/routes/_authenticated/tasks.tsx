import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createTask, updateTaskDetails, deleteTask } from "@/integrations/supabase/actions";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  canAssignTasks,
  canAssignTo,
  ROLE_LABELS,
  isAdmin,
  type AppRole,
  type Department,
} from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

type Status = "todo" | "in_progress" | "done";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  due_date: string | null;
  assignee_id: string;
  assigner_id: string;
  created_at: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  department: Department | null;
  roles: AppRole[];
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};
const STATUS_VARIANT: Record<Status, "outline" | "secondary" | "default"> = {
  todo: "outline",
  in_progress: "secondary",
  done: "default",
};

function TasksPage() {
  const { user, roles } = useAuth();
  const canAssign = canAssignTasks(roles);

  const { data: tasks, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TaskRow[];
    },
  });

  // All visible profiles (RLS allows authenticated read)
  const { data: employees } = useQuery({
    queryKey: ["employees-with-roles"],
    queryFn: async () => {
      const [{ data: profs }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,department"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const map = new Map<string, AppRole[]>();
      for (const r of rs ?? []) {
        const arr = map.get((r as { user_id: string }).user_id) ?? [];
        arr.push((r as { role: AppRole }).role);
        map.set((r as { user_id: string }).user_id, arr);
      }
      return (profs ?? []).map((p) => ({
        ...(p as Omit<EmployeeRow, "roles">),
        roles: map.get((p as { id: string }).id) ?? [],
      })) as EmployeeRow[];
    },
  });

  const empMap = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    for (const e of employees ?? []) m.set(e.id, e);
    return m;
  }, [employees]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated");
      refetch();
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {canAssign
              ? "Assign work and track progress"
              : "View and update your assigned tasks"}
          </p>
        </div>
        {canAssign && (
          <CreateTaskDialog
            employees={employees ?? []}
            myRoles={roles}
            myId={user!.id}
            onCreated={refetch}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All visible tasks</CardTitle>
          <CardDescription>
            {tasks?.length ?? 0} task{tasks?.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Assigner</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tasks ?? []).map((t) => {
                  const assignee = empMap.get(t.assignee_id);
                  const assigner = empMap.get(t.assigner_id);
                  const canUpdate = t.assignee_id === user!.id || t.assigner_id === user!.id;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.title}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{assignee?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{assigner?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {t.due_date ? format(new Date(t.due_date), "MMM d, h:mm a") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[t.status]}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canUpdate ? (
                            <Select
                              value={t.status}
                              onValueChange={(v) => updateStatus(t.id, v as Status)}
                            >
                              <SelectTrigger className="w-28 text-xs h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todo">To Do</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="done">Done</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground mr-2">—</span>
                          )}
                          {(t.assigner_id === user!.id || isAdmin(roles)) && (
                            <>
                              <EditTaskDialog
                                task={t}
                                employees={employees ?? []}
                                myRoles={roles}
                                myId={user!.id}
                                onUpdated={refetch}
                              />
                              <DeleteTaskButton
                                taskId={t.id}
                                taskTitle={t.title}
                                onDeleted={refetch}
                              />
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!tasks?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No tasks yet
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

function CreateTaskDialog({
  employees,
  myRoles,
  myId,
  onCreated,
}: {
  employees: EmployeeRow[];
  myRoles: AppRole[];
  myId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Filter assignees by hierarchical rules (mirrors DB)
  const eligible = useMemo(
    () =>
      employees.filter((e) => {
        if (e.id === myId && !isAdmin(myRoles)) return false;
        return canAssignTo(myRoles, e.roles, e.department);
      }),
    [employees, myRoles, myId],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignee) return toast.error("Pick an assignee");
    setBusy(true);
    const isoDueDate = due ? new Date(due).toISOString() : null;
    try {
      await createTask({
        data: {
          title,
          description: desc || null,
          assigneeId: assignee,
          dueDate: isoDueDate,
        },
      });
      toast.success("Task assigned");
      setOpen(false);
      setTitle("");
      setDesc("");
      setAssignee("");
      setDue("");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Assignee list is filtered by your role — you only see people you may assign to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={eligible.length ? "Pick a person" : "No eligible assignees"} />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.roles.map((r) => ROLE_LABELS[r]).join(", ") || "no role"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-due">Due date &amp; time</Label>
            <Input id="t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTaskDialog({
  task,
  employees,
  myRoles,
  myId,
  onUpdated,
}: {
  task: TaskRow;
  employees: EmployeeRow[];
  myRoles: AppRole[];
  myId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || "");
  const [assignee, setAssignee] = useState<string>(task.assignee_id);
  
  // Format the existing ISO due date to local string for the datetime-local input
  const formatForDateTimeLocal = (dateString: string | null) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [due, setDue] = useState<string>(formatForDateTimeLocal(task.due_date));
  const [busy, setBusy] = useState(false);

  // Filter assignees by hierarchical rules (mirrors DB)
  const eligible = useMemo(
    () =>
      employees.filter((e) => {
        if (e.id === myId && !isAdmin(myRoles)) return false;
        return canAssignTo(myRoles, e.roles, e.department);
      }),
    [employees, myRoles, myId],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignee) return toast.error("Pick an assignee");
    setBusy(true);
    const isoDueDate = due ? new Date(due).toISOString() : null;
    try {
      await updateTaskDetails({
        data: {
          taskId: task.id,
          title,
          description: desc || null,
          assigneeId: assignee,
          dueDate: isoDueDate,
        },
      });
      toast.success("Task updated");
      setOpen(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Failed to update task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Modify task details and assignee.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2 flex flex-col text-left">
            <Label htmlFor={`edit-title-${task.id}`}>Title</Label>
            <Input
              id={`edit-title-${task.id}`}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2 flex flex-col text-left">
            <Label htmlFor={`edit-desc-${task.id}`}>Description</Label>
            <Textarea
              id={`edit-desc-${task.id}`}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="space-y-2 flex flex-col text-left">
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={eligible.length ? "Pick a person" : "No eligible assignees"} />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.roles.map((r) => ROLE_LABELS[r]).join(", ") || "no role"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex flex-col text-left">
            <Label htmlFor={`edit-due-${task.id}`}>Due date &amp; time</Label>
            <Input
              id={`edit-due-${task.id}`}
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaskButton({
  taskId,
  taskTitle,
  onDeleted,
}: {
  taskId: string;
  taskTitle: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteTask({
        data: {
          taskId,
        },
      });
      toast.success("Task deleted");
      setOpen(false);
      onDeleted();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Task</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete task "<strong>{taskTitle}</strong>"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            {busy ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

