import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Key } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }

    setBusy(true);
    const toastId = toast.loading("Updating password...");

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success("Password updated successfully!", { id: toastId });
      // Redirect to login page
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message || "Failed to update password", { id: toastId });
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
          <span className="text-primary font-semibold tracking-widest text-xs uppercase mb-3 drop-shadow-sm filter brightness-125">
            WorkDesk Security
          </span>
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight max-w-md">
            Reset Your<br />Password.
          </h1>
          <p className="mt-4 text-slate-100/80 text-sm xl:text-base max-w-sm font-light leading-relaxed">
            Choose a new, secure password to regain access to your employee profile and coordination tools.
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

          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Create new password
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-8">
            Please enter your new password below.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5 relative">
              <Label htmlFor="new-pw" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Min 6 characters"
                  className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 pl-4 pr-10 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="space-y-1.5 relative">
              <Label htmlFor="confirm-pw" className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-pw"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Confirm your new password"
                  className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-zinc-800/50 focus-visible:bg-white dark:focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-primary h-11 pl-4 pr-10 text-slate-800 dark:text-slate-200 rounded-lg placeholder:text-slate-400/80 dark:placeholder:text-zinc-500"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg shadow-sm transition-colors mt-2 select-none cursor-pointer flex items-center justify-center gap-2" 
              disabled={busy}
            >
              <Key size={16} /> {busy ? "Updating…" : "Update Password"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-xs text-primary hover:underline select-none font-medium cursor-pointer"
              onClick={() => navigate({ to: "/login" })}
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
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
