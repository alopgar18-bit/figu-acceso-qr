import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/$token/cancelada")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Asistencia cancelada · FIGURARTE" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Page() {
  return (
    <PublicShell>
      <div className="text-center py-16">
        <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
        <h1 className="mt-6 text-3xl font-black uppercase tracking-tight">
          Gracias por avisarnos
        </h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">
          Hemos registrado tu cancelación y tu plaza ha sido liberada. Si tu
          situación cambia o necesitas ayuda, contacta con el equipo de
          FIGURARTE.
        </p>
        <Button asChild variant="outline" className="mt-8 uppercase tracking-wider">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </PublicShell>
  );
}