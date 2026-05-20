import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, Clock } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const search = z.object({ waitlist: z.boolean().optional() });

export const Route = createFileRoute("/e/$slug/gracias")({
  validateSearch: (s) => search.parse(s),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const { waitlist } = useSearch({ from: "/e/$slug/gracias" });
  return (
    <PublicShell>
      <div className="text-center py-12">
        {waitlist ? (
          <Clock className="h-14 w-14 mx-auto text-primary" />
        ) : (
          <CheckCircle2 className="h-14 w-14 mx-auto text-primary" />
        )}
        <h1 className="mt-6 text-3xl md:text-4xl font-black uppercase tracking-tight">
          {waitlist ? "Estás en lista de espera" : "Solicitud recibida"}
        </h1>
        <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
          {waitlist
            ? "La sesión está completa, te hemos añadido a la lista de espera. Si se libera una plaza, el equipo de FIGURARTE se pondrá en contacto contigo."
            : "El equipo de FIGURARTE revisará tu solicitud y te confirmará por email si puedes asistir."}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="outline" className="uppercase tracking-wider">
            <Link to="/e/$slug" params={{ slug }}>Volver al evento</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}