import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveLegalText } from "@/lib/use-public-event";

export const Route = createFileRoute("/privacidad")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Política de privacidad — FIGURARTE Access" },
      { name: "description", content: "Política de privacidad y tratamiento de datos personales de FIGURARTE Casting & Producción." },
    ],
  }),
});

function Page() {
  const { data, isLoading } = useActiveLegalText("privacidad");
  return (
    <PublicShell>
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Política de privacidad</h1>
      {isLoading ? (
        <Skeleton className="h-64 mt-6" />
      ) : data ? (
        <article className="prose prose-sm md:prose-base mt-6 max-w-none whitespace-pre-line">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Versión {data.version} · vigente desde {new Date(data.effective_from).toLocaleDateString("es-ES")}
          </div>
          {data.body}
        </article>
      ) : (
        <p className="mt-6 text-muted-foreground">
          No hay un texto de privacidad publicado en este momento. Para cualquier consulta sobre el tratamiento de tus
          datos personales, contacta con FIGURARTE Casting &amp; Producción.
        </p>
      )}
    </PublicShell>
  );
}