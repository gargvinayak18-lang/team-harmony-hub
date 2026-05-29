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
import {
  ALL_ROLES,
  DEPARTMENT_LABELS,
  ROLES_BY_DEPARTMENT,
  ROLE_LABELS,
  type AppRole,
  type Department,
} from "@/lib/roles";


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

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-8">
          <img 
            src="/logo.png" 
            alt="Nexora Solutions" 
            className="h-20 w-auto object-contain mix-blend-multiply dark:bg-white dark:mix-blend-normal dark:p-2 dark:rounded-xl"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee portal</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/" className="hover:underline">
            ← Back
          </Link>
        </p>
      </div>
    </div>
  );
}

