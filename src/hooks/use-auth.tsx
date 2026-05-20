import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Credenciales incorrectas. Revisa tu email y contraseña.",
    "Email not confirmed": "El email no ha sido confirmado. Revisa tu bandeja de entrada.",
    "User not found": "Usuario no encontrado.",
    "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres.",
    "Signup requires a valid password": "La contraseña no es válida.",
    "An account already exists with this email": "Ya existe una cuenta con este email.",
    "Email rate limit exceeded": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    "Request failed": "Error de conexión. Inténtalo de nuevo.",
  };
  return map[message] ?? message;
}

export type AppRole =
  | "superadmin"
  | "admin_figurarte"
  | "coordinador"
  | "validador"
  | "cliente_productora";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (userId: string | undefined) => {
    if (!userId) {
      setRoles([]);
      return;
    }
    // Use security-definer RPC to avoid any RLS edge cases.
    const { data, error } = await supabase.rpc("get_my_roles");
    if (error) {
      console.error("[auth] get_my_roles failed", error);
      // Fallback to direct table read
      const { data: fb } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      setRoles((fb ?? []).map((r) => r.role as AppRole));
      return;
    }
    setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Defer Supabase calls outside the callback
      setTimeout(() => {
        void loadRoles(newSession?.user?.id);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      void loadRoles(existing?.user?.id).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole: (role) => roles.includes(role),
    hasAnyRole: (rs) => rs.some((r) => roles.includes(r)),
    isAdmin:
      roles.includes("superadmin") || roles.includes("admin_figurarte"),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}