import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import wordmark from "@/assets/figurarte-logo-dark.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { consumeSessionNotice } from "@/lib/client-recovery";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    const message = consumeSessionNotice();
    if (message) toast.info(message);
  }, []);

  if (!loading && session) return <Navigate to="/dashboard" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setSubmitting(false);
    if (error) {
      toast.error("Error al iniciar sesión", { description: error });
      return;
    }
    toast.success("Bienvenido a FIGURARTE Access");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left: brand panel */}
      <div className="relative hidden md:flex md:w-1/2 bg-secondary text-secondary-foreground p-12 flex-col justify-between overflow-hidden">
        <div className="absolute -bottom-32 -left-32 h-96 w-96 bg-primary/90" />
        <div className="absolute top-1/3 -right-20 h-72 w-72 bg-primary/10 rotate-12" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 bg-white px-4 py-3">
            <img src={wordmark} alt="FIGURARTE" width={1536} height={1024} className="h-8 w-auto" />
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/60">
            Access
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-5xl font-black uppercase leading-none tracking-tight">
            Gestiona<br />tu audiencia.<br />
            <span className="text-primary">Valida el acceso.</span>
          </h1>
          <p className="mt-6 text-sm text-white/70 leading-relaxed">
            Plataforma privada de FIGURARTE Casting &amp; Producción para
            eventos, formularios públicos, invitaciones, QR y control de
            acceso en directo.
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/40 uppercase tracking-widest">
          © FIGURARTE Casting &amp; Producción
        </div>
      </div>

      {/* Right: auth form */}
      <div className="flex flex-1 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-8 flex items-center gap-3">
            <img src={wordmark} alt="FIGURARTE" width={1536} height={1024} className="h-8 w-auto" />
            <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Access</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Acceso al panel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Introduce tus credenciales del equipo FIGURARTE.
          </p>

          <form onSubmit={handleLogin} className="space-y-4 mt-8">
            <div className="space-y-2">
              <Label htmlFor="login-email">Correo electrónico</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full uppercase tracking-wider" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              El registro está cerrado. Solicita acceso a un administrador de FIGURARTE.
            </p>
          </form>

          <p className="mt-8 text-xs text-muted-foreground leading-relaxed">
            Esta plataforma está reservada al equipo de FIGURARTE y a clientes
            autorizados. Todas las acciones quedan registradas.
          </p>
        </div>
      </div>
    </div>
  );
}