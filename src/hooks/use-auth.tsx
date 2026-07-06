import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { resetSessionExpiredToast, tryRefreshSession } from "@/lib/session-refresh";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

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
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  rolesError: string | null;
  reloadRoles: () => Promise<void>;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const loadRolesAttemptRef = useRef(0);

  const BACKOFFS = [250, 750, 2000];

  const loadRoles = async (userId: string | undefined): Promise<void> => {
    if (!userId) {
      setRoles([]);
      setRolesError(null);
      setRolesLoading(false);
      return;
    }
    const attemptId = ++loadRolesAttemptRef.current;
    setRolesLoading(true);

    const tryOnce = async (): Promise<{ ok: boolean; roles?: AppRole[] }> => {
      const { data, error } = await supabase.rpc("get_my_roles");
      if (!error) {
        return { ok: true, roles: (data ?? []).map((r: { role: AppRole }) => r.role) };
      }
      console.error("[auth] get_my_roles failed", error);
      const { data: fb, error: fbErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!fbErr) {
        return { ok: true, roles: (fb ?? []).map((r) => r.role as AppRole) };
      }
      console.error("[auth] user_roles fallback failed", fbErr);
      return { ok: false };
    };

    for (let i = 0; i <= BACKOFFS.length; i++) {
      const res = await tryOnce();
      // Another loadRoles call superseded this one
      if (attemptId !== loadRolesAttemptRef.current) return;
      if (res.ok) {
        setRoles(res.roles ?? []);
        setRolesError(null);
        setRolesLoading(false);
        return;
      }
      if (i < BACKOFFS.length) {
        await new Promise((r) => setTimeout(r, BACKOFFS[i]));
        if (attemptId !== loadRolesAttemptRef.current) return;
      }
    }
    // All retries failed: keep previous roles, mark error.
    setRolesError("No se pudieron cargar tus permisos.");
    setRolesLoading(false);
  };

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[auth] profile load failed", error);
      setProfile(null);
      return;
    }
    setProfile(data);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      const newUserId = newSession?.user?.id ?? null;
      const prevUserId = currentUserIdRef.current;
      const userChanged = newUserId !== prevUserId;

      // Ignore noisy events that don't change identity (TOKEN_REFRESHED,
      // INITIAL_SESSION on the same user). They previously caused the UI to
      // briefly flash "Sin rol asignado".
      if (!userChanged && (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        return;
      }

      currentUserIdRef.current = newUserId;

      if (!newUserId) {
        setRoles([]);
        setProfile(null);
        setRolesError(null);
        setRolesLoading(false);
        return;
      }

      // Defer Supabase calls outside the callback
      setTimeout(() => {
        void Promise.all([loadRoles(newUserId), loadProfile(newUserId)]);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      currentUserIdRef.current = existing?.user?.id ?? null;
      void Promise.all([loadRoles(existing?.user?.id), loadProfile(existing?.user?.id)]).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  // Refresh proactivo: al volver el foco / cambiar visibilidad y cada 4 min
  // mientras la pestaña esté visible. Evita que un JWT expirado corte
  // procesos largos (envíos WhatsApp, importaciones) cuando el usuario
  // vuelve a la pestaña.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const maybeRefresh = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data?.session;
      if (!s) return;
      const expMs = s.expires_at ? s.expires_at * 1000 : null;
      // Si quedan menos de 5 min, refresca.
      if (expMs && expMs - Date.now() < 5 * 60 * 1000) {
        const ok = await tryRefreshSession();
        if (ok) resetSessionExpiredToast();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void maybeRefresh();
    };
    const onFocus = () => { void maybeRefresh(); };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") void maybeRefresh();
      }, 4 * 60 * 1000);
    };
    startInterval();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? translateAuthError(error.message) : null };
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
    return { error: error ? translateAuthError(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    loading,
    rolesLoading,
    rolesError,
    reloadRoles: () => loadRoles(currentUserIdRef.current ?? session?.user?.id),
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