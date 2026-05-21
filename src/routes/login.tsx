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
import { Building2 } from "lucide-react";

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
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPw, setSignInPw] = useState("");

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPw,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };

  // Sign up
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [dept, setDept] = useState<Department | "">("");
  const [role, setRole] = useState<AppRole | "">("");

  const roleOptions: AppRole[] = dept ? ROLES_BY_DEPARTMENT[dept] : ALL_ROLES;

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return toast.error("Pick a role");
    if (role !== "global_admin" && !dept) return toast.error("Pick a department");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          name,
          department: role === "global_admin" ? "" : dept,
          role,
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — signing you in");
    // auto sign-in
    await supabase.auth.signInWithPassword({ email, password: pw });
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">EMS</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee portal</CardTitle>
            <CardDescription>Sign in or create your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Email</Label>
                    <Input
                      id="si-email"
                      type="email"
                      required
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
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
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input
                      id="su-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <Input
                      id="su-pw"
                      type="password"
                      required
                      minLength={6}
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={dept}
                      onValueChange={(v) => {
                        setDept(v as Department);
                        setRole("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a department (skip for Global Admin)" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                          <SelectItem key={d} value={d}>
                            {DEPARTMENT_LABELS[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                        {!dept && (
                          <SelectItem value="global_admin">Global Admin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    In production, only Admin/HR creates employees. Open self-signup is for demo.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
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
