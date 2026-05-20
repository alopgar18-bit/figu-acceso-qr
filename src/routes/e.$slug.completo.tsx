import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/e/$slug/completo")({
  component: () => (
    <PublicShell>
      <div className="text-center py-16">
        <Users className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="mt-6 text-3xl font-black uppercase tracking-tight">Sesión completa</h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">
          La sesión seleccionada ha alcanzado su aforo máximo y no admite lista de espera. Gracias por tu interés en
          FIGURARTE.
        </p>
        <Button asChild variant="outline" className="mt-8 uppercase tracking-wider">
          <Link to="/">Volver</Link>
        </Button>
      </div>
    </PublicShell>
  ),
});