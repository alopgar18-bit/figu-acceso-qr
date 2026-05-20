import { createFileRoute } from "@tanstack/react-router";
import { Shield, Plus, FileText, CheckCircle2, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/legal")({
  component: Page,
});

const KIND_LABELS: Record<string, string> = {
  privacidad: "Privacidad",
  imagen: "Imagen",
  futuros_procesos: "Futuros procesos",
  terminos: "Términos",
  otro: "Otro",
};

function Page() {
  const { data: legalTexts = [], isLoading } = useQuery({
    queryKey: ["legal-texts-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_texts")
        .select("id, kind, version, title, body, is_active, effective_from, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Legal / RGPD"
        description="Textos legales, versiones, política de privacidad, consentimientos y exportación RGPD."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : legalTexts.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-12 w-12" />}
          title="Sin versiones publicadas"
          description="Publica la primera versión del texto legal para empezar a registrar consentimientos."
        />
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Texto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vigente desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalTexts.map((text) => (
                  <TableRow key={text.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-semibold">{text.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 max-w-xl">{text.body}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{KIND_LABELS[text.kind] ?? text.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{text.version}</TableCell>
                    <TableCell>
                      <Badge variant={text.is_active ? "default" : "outline"} className="gap-1">
                        {text.is_active ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {text.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(text.effective_from).toLocaleDateString("es-ES")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
