import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, XCircle } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cancelAttendance } from "@/lib/confirmation.functions";

export const Route = createFileRoute("/c/$token/cancelar")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Cancelar asistencia · FIGURARTE" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Page() {
  const { token } = Route.useParams();
  const cancel = useServerFn(cancelAttendance);
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await cancel({
        data: {
          token,
          reason: reason.trim() || null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        },
      });
      if (!r.ok) {
        toast.error("No se pudo cancelar: " + r.code);
        return;
      }
      navigate({ to: "/c/$token/cancelada", params: { token }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <XCircle className="h-10 w-10 mx-auto text-destructive" />
          <h1 className="mt-4 text-3xl font-black uppercase tracking-tight">Cancelar asistencia</h1>
          <p className="mt-2 text-muted-foreground">
            Liberarás tu plaza para que pueda asignarse a otra persona.
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Confirmación</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handle} className="space-y-4">
              <div>
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Cuéntanos brevemente por qué no podrás asistir…"
                  className="mt-1.5"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between pt-2">
                <Button asChild type="button" variant="ghost">
                  <Link to="/c/$token" params={{ token }}>Volver</Link>
                </Button>
                <Button type="submit" variant="destructive" disabled={submitting} className="uppercase tracking-wider">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar cancelación
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}