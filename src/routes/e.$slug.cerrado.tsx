import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/e/$slug/cerrado")({
  component: () => (
    <PublicShell>
      <div className="text-center py-16">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="mt-6 text-3xl font-black uppercase tracking-tight">Inscripciones cerradas</h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">
          Las inscripciones a este evento no están disponibles en este momento. Puede que el evento haya finalizado o
          aún no se hayan abierto las plazas.
        </p>
        <Button asChild variant="outline" className="mt-8 uppercase tracking-wider">
          <Link to="/">Volver</Link>
        </Button>
      </div>
    </PublicShell>
  ),
});