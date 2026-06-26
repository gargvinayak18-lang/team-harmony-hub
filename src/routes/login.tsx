import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password dialog state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      return toast.error("Please enter your email address");
    }
    setResetBusy(true);
    const toastId = toast.loading("Sending recovery email...");
    try {
      const redirectToUrl = window.location.origin + "/reset-password";
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: redirectToUrl,
      });
      if (error) throw error;
      toast.success("Password reset recovery email has been sent!", { id: toastId });
      setResetDialogOpen(false);
      setResetEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset link", { id: toastId });
    } finally {
      setResetBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  // Sign in
  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [signInPw, setSignInPw] = useState("");

  // Sign up
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPw, setSignUpPw] = useState("");
  const [signUpName, setSignUpName] = useState("");

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);

    const inputIdentifier = signInIdentifier.trim();
    let emailToUse = inputIdentifier;

    const { data: resolvedEmail, error: rpcError } = await supabase.rpc("resolve_custom_id_to_email", {
      _custom_id: inputIdentifier,
    });
    
    if (rpcError) {
      setBusy(false);
      return toast.error("Failed to check User ID: " + rpcError.message);
    }
    
    if (resolvedEmail) {
      emailToUse = resolvedEmail;
    } else if (!inputIdentifier.includes("@")) {
      setBusy(false);
      return toast.error("No employee found with that User ID");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: signInPw,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    
    if (signUpPw.length < 6) {
      setBusy(false);
      return toast.error("Password must be at least 6 characters");
    }
    
    try {
      const { data: isAuth, error: authError } = await supabase.rpc("is_email_authorized", {
        _email: signUpEmail.trim(),
      });
      
      if (authError) {
        setBusy(false);
        return toast.error("Authorization check failed: " + authError.message);
      }
      
      if (!isAuth) {
        setBusy(false);
        return toast.error("This email is not authorized to sign up. Please contact your administrator.");
      }
    } catch (err: any) {
      setBusy(false);
      return toast.error("Failed to verify email authorization: " + err.message);
    }
    
    const { error } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPw,
      options: {
        data: {
          name: signUpName,
        }
      }
    });
    
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Please check your email to verify your account.");
  };

  const handleDemoLogin = async () => {
    setBusy(true);
    const toastId = toast.loading("Logging into Demo Organization...");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: "demo@workdesk.local",
        password: "demo123",
      });
      if (error) throw error;
      
      localStorage.setItem("show_demo_mode", "true");
      toast.success("Welcome to Demo Mode!", { id: toastId });
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error("Failed to start demo: " + (err.message || err), { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-50 dark:bg-zinc-950">
      {/* Left Panel: Hero Graphic with Office Image */}
      <div className="relative col-span-5 h-full w-full hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden select-none">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/office-bg.png"
            alt="Office workspace"
            className="object-cover w-full h-full transform scale-105"
          />
          {/* Soft dark primary-themed overlay */}
          <div className="absolute inset-0 bg-zinc-950/75 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950/95 via-primary/60 to-transparent opacity-85" />
        </div>

        {/* Brand/Content - Top */}
        <div className="relative z-10 flex flex-col pt-8">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight max-w-md">
            Work Smarter.<br />Sync Teams Faster.
          </h1>
          <p className="mt-4 text-slate-100/80 text-sm xl:text-base max-w-sm font-light leading-relaxed">
            End-to-end task delegation, automated attendance tracking, and leave coordination — built for modern workplaces.
          </p>
        </div>

        {/* Brand/Logo - Bottom */}
        <div className="relative z-10 flex items-center gap-2.5">
          <BrandLogo className="h-8 w-auto object-contain" />
        </div>
      </div>

      {/* Right Panel: Content Form */}
      <div className="col-span-7 flex items-center justify-center p-6 sm:p-12 md:p-16">
        <div className="w-full max-w-md bg-white dark:bg-card p-8 sm:p-10 rounded-2xl shadow-xl border border-slate-100/80 dark:border-zinc-800/80 transition-all duration-300">
          
          {/* Card Top Logo */}
          <div className="flex items-center gap-2 mb-8 select-none">
            <img 
              src="/logo.png" 
              alt="WorkDesk" 
              className="h-12 w-auto object-contain mix-blend-multiply dark:bg-white dark:mix-blend-normal dark:p-1.5 dark:rounded-lg"
            />
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-100/80 dark:bg-zinc-800/50 p-1 rounded-lg">
              <TabsTrigger value="signin" className="rounded-md py-2 text-sm font-semibold select-none cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-md py-2 text-sm font-semibold select-none cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Sign Up</TabsTrigger>
            </TabsList>
            
            {/* Sign In Tab */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="si-identifier" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                    User ID or Email
                  </Label>
                  <Input
                    id="si-identifier"
                    type="text"
                    placeholder="e.g. emp_101 or name@company.com"
                    required
                    className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 px-4 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                    value={signInIdentifier}
                    onChange={(e) => setSignInIdentifier(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1.5 relative">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="si-pw" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                      Password
                    </Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline select-none font-medium cursor-pointer"
                      onClick={() => setResetDialogOpen(true)}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="si-pw"
                      type={showPassword ? "text" : "password"}
                      required
                      className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 pl-4 pr-10 text-slate-800 dark:text-slate-200 rounded-lg"
                      value={signInPw}
                      onChange={(e) => setSignInPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg shadow-sm transition-colors mt-2 select-none cursor-pointer" 
                  disabled={busy}
                >
                  {busy ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            
            {/* Sign Up Tab */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                    Full Name
                  </Label>
                  <Input
                    id="su-name"
                    type="text"
                    required
                    className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 px-4 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="su-email" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                    Email
                  </Label>
                  <Input
                    id="su-email"
                    type="email"
                    required
                    className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 px-4 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                    Password
                  </Label>
                  <Input
                    id="su-pw"
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 px-4 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                    value={signUpPw}
                    onChange={(e) => setSignUpPw(e.target.value)}
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg shadow-sm transition-colors mt-2 select-none cursor-pointer" 
                  disabled={busy}
                >
                  {busy ? "Creating account…" : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-8 select-none">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-card px-3 text-slate-400 dark:text-zinc-500 font-semibold tracking-wider text-[10px]">
                Or explore WorkDesk
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            type="button"
            className="w-full border-primary/30 text-primary hover:bg-primary/5 hover:text-primary transition-all font-semibold h-11 rounded-lg flex items-center justify-center gap-2 cursor-pointer select-none"
            onClick={handleDemoLogin}
            disabled={busy}
          >
            <Sparkles size={16} className="animate-spin text-primary" style={{ animationDuration: '3s' }} /> Launch Interactive Demo
          </Button>
        </div>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a recovery link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                required
                placeholder="e.g. name@company.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 px-4 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="submit" disabled={resetBusy} className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg w-full cursor-pointer select-none">
                {resetBusy ? "Sending link…" : "Send Reset Link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  const [src, setSrc] = useState("/logo.png");

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/logo.png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Check if pixel is dark/black (R, G, B all below 60 and not transparent)
          if (a > 50 && r < 60 && g < 60 && b < 60) {
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setSrc(canvas.toDataURL());
      } catch (e) {
        console.error("Failed to process logo image:", e);
      }
    };
  }, []);

  return (
    <img
      src={src}
      alt="WorkDesk Logo"
      className={className}
    />
  );
}

