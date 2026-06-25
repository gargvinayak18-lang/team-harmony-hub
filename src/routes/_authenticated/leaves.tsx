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
import { format, differenceInDays, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Calendar, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

function LeavesPage() {
  const { user, profile, isGlobalAdmin, hasPermission } = useAuth();
  const isManager = isGlobalAdmin || hasPermission("manage_employees");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // State
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Queries
  const { data: categories = [] } = useQuery({
    queryKey: ["leave-categories", profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_categories")
        .select("*")
        .eq("organization_id", profile!.organization_id!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myLeaves = [], refetch: refetchMyLeaves } = useQuery({
    queryKey: ["my-leaves", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select(`
          *,
          leave_categories(name),
          approved_by_profile:profiles!leave_requests_approved_by_fkey(name)
        `)
        .eq("employee_id", user!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allLeaves = [], refetch: refetchAllLeaves } = useQuery({
    queryKey: ["all-leaves", profile?.organization_id],
    enabled: !!profile?.organization_id && isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select(`
          *,
          leave_categories(name),
          employee:profiles!leave_requests_employee_id_fkey(name, email),
          approved_by_profile:profiles!leave_requests_approved_by_fkey(name)
        `)
        .eq("organization_id", profile!.organization_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Calculations for stats
  const stats = useMemo(() => {
    let approvedDays = 0;
    let pendingCount = 0;
    let approvedCount = 0;

    const currentYear = new Date().getFullYear();

    myLeaves.forEach((leave) => {
      if (leave.status === "approved") {
        approvedCount++;
        const start = parseISO(leave.start_date);
        const end = parseISO(leave.end_date);
        // Only count days in the current year
        if (start.getFullYear() === currentYear) {
          approvedDays += differenceInDays(end, start) + 1;
        }
      } else if (leave.status === "pending") {
        pendingCount++;
      }
    });

    return {
      approvedDays,
      pendingCount,
      approvedCount,
    };
  }, [myLeaves]);

  // Form submit handler
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !startDate || !endDate) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (startDate < todayStr) {
      toast.error("Leave start date must be today or in the future.");
      return;
    }

    if (endDate < startDate) {
      toast.error("End date cannot be earlier than start date.");
      return;
    }

    if (user?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Applying for leave is disabled.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("leave_requests").insert({
        organization_id: profile!.organization_id!,
        employee_id: user!.id,
        category_id: selectedCategory,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Leave applied successfully!");
      setApplyOpen(false);
      setSelectedCategory("");
      setStartDate("");
      setEndDate("");
      setReason("");
      refetchMyLeaves();
      if (isManager) refetchAllLeaves();
    } catch (err: any) {
      toast.error("Failed to apply for leave: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel/delete pending leave request
  const handleCancelLeave = async (id: string) => {
    if (user?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Cancelling leave requests is disabled.");
      return;
    }
    try {
      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", id)
        .eq("employee_id", user!.id)
        .eq("status", "pending");

      if (error) throw error;

      toast.success("Leave request cancelled successfully.");
      refetchMyLeaves();
      if (isManager) refetchAllLeaves();
    } catch (err: any) {
      toast.error("Failed to cancel leave: " + err.message);
    }
  };

  // Approve or Reject handler
  const handleProcessLeave = async (id: string, status: "approved" | "rejected") => {
    if (user?.email === "demo@workdesk.local") {
      toast.error("Demo Mode: Approving or rejecting leave requests is disabled.");
      return;
    }
    setActioningId(id);
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status,
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success(`Leave request ${status} successfully.`);
      refetchMyLeaves();
      refetchAllLeaves();
    } catch (err: any) {
      toast.error(`Failed to ${status} leave: ` + err.message);
    } finally {
      setActioningId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Pending</Badge>;
    }
  };

  return (
    <div id="tour-leaves-page" className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leaves Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Apply for future time off and track approval records.
          </p>
        </div>

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Apply for Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
              <DialogDescription>
                Submit your time off request. Leaves must be requested prior to the start date.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleApplyLeave} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="leave-category">Leave Category <span className="text-destructive">*</span></Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory} required>
                  <SelectTrigger id="leave-category">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name} {cat.max_days ? `(Max ${cat.max_days} days/yr)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="start-date"
                    type="date"
                    min={todayStr}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="end-date"
                    type="date"
                    min={startDate || todayStr}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {startDate && endDate && startDate <= endDate && (
                <div className="text-xs text-muted-foreground bg-muted p-2.5 rounded-md flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>
                    Duration: <strong>{differenceInDays(parseISO(endDate), parseISO(startDate)) + 1} day(s)</strong>
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Leave</Label>
                <Textarea
                  id="reason"
                  placeholder="Provide a brief explanation for your leave request"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Days Approved ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-500">{stats.approvedDays} day(s)</div>
            <p className="text-xs text-muted-foreground mt-1">Across all approved requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">{stats.pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting manager approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{myLeaves.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All-time leaves requested</p>
          </CardContent>
        </Card>
      </div>

      {/* TABS CONTAINER */}
      <Tabs defaultValue="my-leaves" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="my-leaves">My Leaves</TabsTrigger>
          {isManager && (
            <TabsTrigger value="approvals" className="relative">
              Approvals
              {allLeaves.filter((l) => l.status === "pending").length > 0 && (
                <span className="ml-1.5 flex h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="my-leaves">
          <Card>
            <CardHeader>
              <CardTitle>My Leave Applications</CardTitle>
              <CardDescription>View, monitor, or cancel your submitted leaves.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed By</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myLeaves.map((leave) => {
                      const start = parseISO(leave.start_date);
                      const end = parseISO(leave.end_date);
                      const duration = differenceInDays(end, start) + 1;

                      return (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium">
                            {(leave.leave_categories as any)?.name ?? "Unknown"}
                          </TableCell>
                          <TableCell>
                            {format(start, "MMM dd, yyyy")} – {format(end, "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>{duration} day(s)</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground" title={leave.reason ?? ""}>
                            {leave.reason ?? "—"}
                          </TableCell>
                          <TableCell>{getStatusBadge(leave.status)}</TableCell>
                          <TableCell className="text-sm">
                            {(leave.approved_by_profile as any)?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {leave.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 h-8 px-2"
                                onClick={() => handleCancelLeave(leave.id)}
                              >
                                <X className="w-3.5 h-3.5 mr-1" /> Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {myLeaves.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No leave applications found. Apply for one using the button above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="approvals">
            <Card>
              <CardHeader>
                <CardTitle>Organization Leave Approvals</CardTitle>
                <CardDescription>Review, approve, or reject time off requests from team members.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Processed By</TableHead>
                        <TableHead className="w-[180px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allLeaves.map((leave) => {
                        const start = parseISO(leave.start_date);
                        const end = parseISO(leave.end_date);
                        const duration = differenceInDays(end, start) + 1;
                        const isPending = leave.status === "pending";

                        return (
                          <TableRow key={leave.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{(leave.employee as any)?.name ?? "Unknown"}</span>
                                <span className="text-xs text-muted-foreground">{(leave.employee as any)?.email ?? ""}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {(leave.leave_categories as any)?.name ?? "Unknown"}
                            </TableCell>
                            <TableCell>
                              {format(start, "MMM dd, yyyy")} – {format(end, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>{duration} day(s)</TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground" title={leave.reason ?? ""}>
                              {leave.reason ?? "—"}
                            </TableCell>
                            <TableCell>{getStatusBadge(leave.status)}</TableCell>
                            <TableCell className="text-sm">
                              {(leave.approved_by_profile as any)?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {isPending ? (
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 h-8 px-2.5 border-emerald-200 dark:border-emerald-900"
                                    disabled={actioningId !== null}
                                    onClick={() => handleProcessLeave(leave.id, "approved")}
                                  >
                                    {actioningId === leave.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-900/30 h-8 px-2.5 border-red-200 dark:border-red-900"
                                    disabled={actioningId !== null}
                                    onClick={() => handleProcessLeave(leave.id, "rejected")}
                                  >
                                    <X className="w-3.5 h-3.5 mr-1" /> Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Processed</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {allLeaves.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No leave requests found for your organization.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
