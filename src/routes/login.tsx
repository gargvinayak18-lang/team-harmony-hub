import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

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

    // Try to resolve custom ID first
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
      // If it has no @ and couldn't be resolved, it's not a valid email either
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-8">
          <img 
            src="/logo.png" 
            alt="WorkDesk" 
            className="h-20 w-auto object-contain mix-blend-multiply dark:bg-white dark:mix-blend-normal dark:p-2 dark:rounded-xl"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee portal</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-identifier">User ID or Email</Label>
                    <Input
                      id="si-identifier"
                      type="text"
                      placeholder="e.g. emp_101 or name@company.com"
                      required
                      value={signInIdentifier}
                      onChange={(e) => setSignInIdentifier(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pw">Password</Label>
                    <Input
                      id="si-pw"
                      type="password"
                      required
                      value={signInPw}
                      onChange={(e) => setSignInPw(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full Name</Label>
                    <Input
                      id="su-name"
                      type="text"
                      required
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <Input
                      id="su-pw"
                      type="password"
                      required
                      value={signUpPw}
                      onChange={(e) => setSignUpPw(e.target.value)}
                      placeholder="Min 6 characters"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating account…" : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or explore WorkDesk</span>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              className="w-full border-primary/30 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-300 font-semibold cursor-pointer"
              onClick={handleDemoLogin}
              disabled={busy}
            >
              🚀 Launch Interactive Demo
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

