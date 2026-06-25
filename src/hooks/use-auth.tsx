import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface RoleData {
  id: string;
  name: string;
  level: number;
  permissions: string[];
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  department_name?: string | null;
  organization_id: string | null;
  organization_name?: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isGlobalAdmin: boolean;
  roles: RoleData[];
  permissions: string[];
  hasPermission: (perm: string) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (userId: string) => {
    const [{ data: pData }, { data: rData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,name,email,department_id, departments(name), organization_id, organizations(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("is_global_admin, roles(id, name, level, permissions)")
        .eq("user_id", userId),
    ]);
    
    let profileData: Profile | null = null;
    if (pData) {
      const anyP = pData as any;
      profileData = {
        id: anyP.id,
        name: anyP.name,
        email: anyP.email,
        department_id: anyP.department_id,
        department_name: anyP.departments?.name ?? null,
        organization_id: anyP.organization_id,
        organization_name: anyP.organizations?.name ?? null,
      };
    }

    setProfile(profileData);

    let globalAdmin = false;
    const loadedRoles: RoleData[] = [];
    const perms = new Set<string>();

    if (rData) {
      for (const row of rData) {
        if (row.is_global_admin) globalAdmin = true;
        if (row.roles) {
          const r = row.roles as any;
          const rolePerms = Array.isArray(r.permissions) ? r.permissions : [];
          loadedRoles.push({
            id: r.id,
            name: r.name,
            level: r.level || 0,
            permissions: rolePerms,
          });
          for (const p of rolePerms) perms.add(p);
        }
      }
    }

    setIsGlobalAdmin(globalAdmin);
    setRoles(loadedRoles);
    setPermissions(Array.from(perms));
  };

  const hasPermission = (perm: string) => {
    if (isGlobalAdmin) return true;
    return permissions.includes(perm);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => void loadUserData(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setIsGlobalAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void loadUserData(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadUserData(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        roles,
        permissions,
        isGlobalAdmin,
        hasPermission,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
