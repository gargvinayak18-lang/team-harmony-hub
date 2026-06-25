import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const tourSteps = [
  {
    target: "#tour-welcome",
    route: "/dashboard",
    title: "Welcome to WorkDesk!",
    content: "Welcome to your employee portal. This interactive tour will guide you step-by-step through every feature of the app. Click Next to continue.",
    position: "bottom" as const
  },
  {
    target: "#tour-stats",
    route: "/dashboard",
    title: "Metrics Dashboard",
    content: "View live stats for open tasks, completed tasks, staff count, leaves, and today's attendance status. Click on cards to view details.",
    position: "bottom" as const
  },
  {
    target: "#tour-clockin",
    route: "/dashboard",
    title: "Instant Attendance Clock-In",
    content: "Clock in or out instantly! The system automatically scans your connected Wi-Fi network and checks it against organization settings to verify if you are On Site or WFH.",
    position: "bottom" as const
  },
  {
    target: "#tour-tasks",
    route: "/dashboard",
    title: "Your Kanban Board",
    content: "Manage your tasks using drag-and-drop cards. Easily move tasks from 'To Do', through 'In Progress', to 'Done' to update your work status in real-time.",
    position: "top" as const
  },
  {
    target: "#tour-sidebar",
    route: "/dashboard",
    title: "Global Navigation",
    content: "Use the sidebar to navigate between Tasks, Attendance log, Leave requests, Employee directory, and Organization settings.",
    position: "right" as const
  },
  {
    target: "#tour-tasks-page",
    route: "/tasks",
    title: "Task Delegation Hub",
    content: "Delegate and manage tasks across your organization. As an administrator or department supervisor, assign new tasks, set deadlines, and track status.",
    position: "bottom" as const
  },
  {
    target: "#tour-attendance-page",
    route: "/attendance",
    title: "Attendance & Wi-Fi Scanning",
    content: "View detailed check-in records for your organization. Refresh your connected network scanner here to verify your current host Wi-Fi SSID.",
    position: "bottom" as const
  },
  {
    target: "#tour-leaves-page",
    route: "/leaves",
    title: "Leave Management",
    content: "Apply for leaves with date-validations. If you are an administrator or supervisor, review pending requests in the Approvals tab to approve or reject them.",
    position: "bottom" as const
  },
  {
    target: "#tour-employees-page",
    route: "/employees",
    title: "Employee Management",
    content: "Add new employees, assign them unique login credentials, place them in departments, and configure system permissions/roles.",
    position: "bottom" as const
  },
  {
    target: "#tour-settings-page",
    route: "/organization-settings",
    title: "Organization Settings",
    content: "Configure allowed Wi-Fi networks (SSIDs) to automate On-Site check-ins, and set up custom Leave Categories (Casual, Sick, etc.) for leaves tracking.",
    position: "bottom" as const
  }
];

function AuthLayout() {
  const { session, loading, profile, refresh, signOut } = useAuth();
  const navigate = useNavigate();

  const [showDemoTour, setShowDemoTour] = useState(false);
  const [currentTourStep, setCurrentTourStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showCompletionOptions, setShowCompletionOptions] = useState(false);

  const pathname = useRouterState({ select: (r) => r.location.pathname });

  // Handle auto-start on demo login
  useEffect(() => {
    if (localStorage.getItem("show_demo_mode") === "true") {
      localStorage.removeItem("show_demo_mode");
      setShowDemoTour(true);
      setCurrentTourStep(0);
      setShowCompletionOptions(false);
    }
  }, []);

  // Listen to manual start custom event
  useEffect(() => {
    const handleStartTour = () => {
      setShowDemoTour(true);
      setCurrentTourStep(0);
      setShowCompletionOptions(false);
    };

    window.addEventListener("start-tour", handleStartTour);
    return () => window.removeEventListener("start-tour", handleStartTour);
  }, []);

  const currentStep = tourSteps[currentTourStep];

  // Monitor steps and route changes to position elements
  useEffect(() => {
    if (!showDemoTour || showCompletionOptions || !currentStep) {
      setTargetRect(null);
      return;
    }

    let active = true;
    let timerId: any;
    let attempts = 0;

    const updateRect = () => {
      if (!active) return;
      const element = document.querySelector(currentStep.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
        if (attempts === 0) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        setTargetRect(null);
        if (attempts < 30) {
          attempts++;
          timerId = setTimeout(updateRect, 100);
        }
      }
    };

    updateRect();

    const handleScrollOrResize = () => {
      const element = document.querySelector(currentStep.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      active = false;
      clearTimeout(timerId);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [showDemoTour, currentTourStep, currentStep?.target, pathname, showCompletionOptions]);

  // Freeze background scrolling when tour is active
  useEffect(() => {
    if (showDemoTour) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showDemoTour]);

  const nextTourStep = () => {
    if (currentTourStep < tourSteps.length - 1) {
      const nextStepIndex = currentTourStep + 1;
      const nextStep = tourSteps[nextStepIndex];
      setCurrentTourStep(nextStepIndex);
      if (nextStep.route !== pathname) {
        navigate({ to: nextStep.route });
      }
    } else {
      setShowCompletionOptions(true);
    }
  };

  const prevTourStep = () => {
    if (currentTourStep > 0) {
      const prevStepIndex = currentTourStep - 1;
      const prevStep = tourSteps[prevStepIndex];
      setCurrentTourStep(prevStepIndex);
      if (prevStep.route !== pathname) {
        navigate({ to: prevStep.route });
      }
    }
  };

  const handleSkipOrFinish = () => {
    setShowCompletionOptions(true);
  };

  const handleReplayTour = () => {
    setShowCompletionOptions(false);
    setCurrentTourStep(0);
    if (pathname !== "/dashboard") {
      navigate({ to: "/dashboard" });
    }
  };

  const handleExitAndLogout = async () => {
    setShowCompletionOptions(false);
    setShowDemoTour(false);
    setCurrentTourStep(0);
    setTargetRect(null);
    const toastId = toast.loading("Logging out...");
    try {
      if (typeof window !== 'undefined') {
        const keysToClear = Object.keys(localStorage).filter(key => key.startsWith('demo_'));
        for (const key of keysToClear) {
          localStorage.removeItem(key);
        }
      }
      await signOut();
      toast.success("Goodbye!", { id: toastId });
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message || "Failed to log out", { id: toastId });
    }
  };

  const getTooltipStyle = () => {
    if (!targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed" as const,
      };
    }

    const step = tourSteps[currentTourStep];
    const position = step.position;
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const margin = 16;

    let top = 0;
    let left = 0;

    if (window.innerWidth < 768) {
      return {
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        position: "fixed" as const,
        width: "90%",
        maxWidth: "340px",
      };
    }

    switch (position as string) {
      case "top":
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
        break;
      case "bottom":
        top = targetRect.bottom + margin;
        left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
        break;
      case "left":
        top = targetRect.top + (targetRect.height - tooltipHeight) / 2;
        left = targetRect.left - tooltipWidth - margin;
        break;
      case "right":
        top = targetRect.top + (targetRect.height - tooltipHeight) / 2;
        left = targetRect.right + margin;
        break;
      default:
        top = (window.innerHeight - tooltipHeight) / 2;
        left = (window.innerWidth - tooltipWidth) / 2;
    }

    const maxLeft = window.innerWidth - tooltipWidth - 20;
    const maxTop = window.innerHeight - tooltipHeight - 20;

    left = Math.max(20, Math.min(left, maxLeft));
    top = Math.max(20, Math.min(top, maxTop));

    return {
      top: `${top}px`,
      left: `${left}px`,
      position: "fixed" as const,
    };
  };

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // Check if user has an organization
  if (profile && !profile.organization_id) {
    return <OnboardingFlow onComplete={refresh} />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-background px-4 gap-2">
            <SidebarTrigger />
            <div className="h-4 w-px bg-border" />
            <h1 className="text-sm font-medium text-muted-foreground">
              Employee Management System
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {showDemoTour && (
        <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none select-none">
          {/* Backdrop Mask */}
          <div 
            className="fixed inset-0 bg-black/60 transition-all duration-300 pointer-events-auto"
            style={{
              clipPath: (!showCompletionOptions && targetRect)
                ? `polygon(
                    0% 0%, 
                    0% 100%, 
                    ${targetRect.left}px 100%, 
                    ${targetRect.left}px ${targetRect.top}px, 
                    ${targetRect.right}px ${targetRect.top}px, 
                    ${targetRect.right}px ${targetRect.bottom}px, 
                    ${targetRect.left}px ${targetRect.bottom}px, 
                    ${targetRect.left}px 100%, 
                    100% 100%, 
                    100% 0%
                  )`
                : 'none'
            }}
          />

          {/* Highlight Border Ring */}
          {!showCompletionOptions && targetRect && (
            <div 
              className="fixed rounded-xl border-2 border-primary shadow-[0_0_15px_rgba(140,98,57,0.5)] transition-all duration-300 z-50 pointer-events-none"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}

          {/* Floating Tooltip Card */}
          <div 
            className="fixed bg-card border border-border rounded-xl shadow-2xl p-5 w-80 z-50 transition-all duration-300 pointer-events-auto flex flex-col justify-between"
            style={getTooltipStyle()}
          >
            {showCompletionOptions ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Tour Completed
                  </span>
                  <h4 className="font-bold text-base text-foreground">Congratulations!</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You have finished the interactive tour. Would you like to replay it or exit and log out?
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <Button
                    onClick={handleReplayTour}
                    className="w-full text-xs font-semibold h-9 cursor-pointer"
                  >
                    Replay Tour
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExitAndLogout}
                    className="w-full text-xs font-semibold h-9 border-destructive/20 text-destructive hover:bg-destructive/5 cursor-pointer"
                  >
                    Exit & Log Out
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      Step {currentTourStep + 1} of {tourSteps.length}
                    </span>
                    <button 
                      onClick={handleSkipOrFinish} 
                      className="text-muted-foreground hover:text-foreground text-xs font-medium cursor-pointer"
                    >
                      Skip
                    </button>
                  </div>
                  <h4 className="font-bold text-sm text-foreground">{currentStep?.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{currentStep?.content}</p>
                </div>

                <div className="flex justify-between items-center mt-5 pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevTourStep}
                    disabled={currentTourStep === 0}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 h-8"
                  >
                    Back
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={nextTourStep}
                    className="text-xs cursor-pointer h-8"
                  >
                    {currentTourStep === tourSteps.length - 1 ? "Finish Tour" : "Next"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}

function OnboardingFlow({ onComplete }: { onComplete: () => Promise<void> }) {
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setBusy(true);

    const { error } = await supabase.rpc("create_organization", {
      _name: orgName.trim(),
    });

    setBusy(false);

    if (error) {
      toast.error("Failed to create organization: " + error.message);
    } else {
      toast.success("Organization created successfully!");
      await onComplete();
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to WorkDesk Portal</CardTitle>
          <CardDescription>
            You don't belong to any organization yet. Create one to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="e.g. Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating..." : "Create Organization"}
              </Button>
              <Button variant="outline" type="button" className="w-full" onClick={handleLogout} disabled={busy}>
                Back to Login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
