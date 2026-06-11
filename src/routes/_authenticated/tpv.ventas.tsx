import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, CreditCard } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listTodayPosSales } from "@/lib/tpv.functions";

export const Route = createFileRoute("/_authenticated/tpv/ventas")({
  component: Page,
});

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function Page() {
  const fetchSales = useServerFn(listTodayPosSales);
  const { data, isLoading } = useQuery({
    queryKey: ["pos", "sales-today"],
    queryFn: () => fetchSales(),
    refetchInterval: 15000,
  });

  const totalDay = (data ?? []).reduce((s, o) => s + o.total_gross, 0);

  return (
    <div>
      <PageHeader
        eyebrow="TPV"
        title="Ventas del día"
        description="Listado de tickets cobrados hoy."
        actions={
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total</div>
            <div className="text-2xl font-black tabular-nums">{eur(totalDay)}</div>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Sin ventas todavía" description="Cuando cobres un ticket aparecerá aquí." />
      ) : (
        <div className="rounded-md border bg-background overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((o) => {
                const time = o.closed_at
                  ? new Date(o.closed_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                  : "—";
                const method = o.pos_payments[0]?.method;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-black tabular-nums">#{o.order_number}</TableCell>
                    <TableCell className="tabular-nums">{time}</TableCell>
                    <TableCell>
                      {method === "cash" && (
                        <Badge variant="secondary"><Banknote className="h-3 w-3 mr-1" />Efectivo</Badge>
                      )}
                      {method === "card" && (
                        <Badge variant="secondary"><CreditCard className="h-3 w-3 mr-1" />Tarjeta</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{eur(o.total_gross)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}