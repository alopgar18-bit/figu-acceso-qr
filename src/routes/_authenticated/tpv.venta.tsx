import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Minus, Trash2, CreditCard, Banknote, Check, X, Delete } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listPosCatalog, checkoutPosOrder } from "@/lib/tpv.functions";

export const Route = createFileRoute("/_authenticated/tpv/venta")({
  component: Page,
});

type Cat = { id: string; name: string; color: string; sort_order: number };
type Prod = {
  id: string; category_id: string; name: string;
  price_gross: number; vat_rate: number; color: string | null; sort_order: number;
};
type Line = { product_id: string; name: string; unit_price: number; quantity: number };

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function Page() {
  const fetchCatalog = useServerFn(listPosCatalog);
  const { data, isLoading } = useQuery({
    queryKey: ["pos", "catalog"],
    queryFn: () => fetchCatalog(),
  });

  const categories = (data?.categories ?? []) as Cat[];
  const products = (data?.products ?? []) as Prod[];

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [lastTicket, setLastTicket] = useState<number | null>(null);

  const activeCat = selectedCat ?? categories[0]?.id ?? null;
  const catProducts = useMemo(
    () => products.filter((p) => p.category_id === activeCat),
    [products, activeCat],
  );

  const total = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);

  const addProduct = (p: Prod) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, name: p.name, unit_price: p.price_gross, quantity: 1 }];
    });
  };

  const adjustLine = (productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.product_id === productId ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.product_id !== productId));

  return (
    <div className="-m-4 md:-m-8 h-[calc(100vh-3.5rem)] flex flex-col bg-muted/30">
      {lastTicket !== null && (
        <div className="bg-emerald-600 text-white px-6 py-2 text-center font-bold uppercase tracking-wider text-sm">
          Ticket nº {lastTicket} cobrado
        </div>
      )}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 p-2 min-h-0">
        {/* LEFT: catalog */}
        <div className="lg:col-span-2 flex flex-col gap-2 min-h-0">
          <div className="flex flex-wrap gap-2">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-32" />
            ))}
            {categories.map((c) => {
              const active = c.id === activeCat;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCat(c.id)}
                  style={{
                    backgroundColor: active ? c.color : undefined,
                    borderColor: c.color,
                    color: active ? "white" : c.color,
                  }}
                  className="h-16 min-w-32 px-5 rounded-md border-2 font-black uppercase tracking-wider text-sm transition-all active:scale-95"
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-auto rounded-md bg-background border p-3 min-h-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {catProducts.map((p) => {
                const cat = categories.find((c) => c.id === p.category_id);
                const color = p.color ?? cat?.color ?? "#64748b";
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    style={{ backgroundColor: color }}
                    className="h-24 rounded-md text-white font-bold flex flex-col items-center justify-center px-2 text-center shadow-sm active:scale-95 transition-transform"
                  >
                    <span className="text-sm leading-tight">{p.name}</span>
                    <span className="text-lg mt-1">{eur(p.price_gross)}</span>
                  </button>
                );
              })}
              {!isLoading && catProducts.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-12 text-sm">
                  Sin productos en esta categoría.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: ticket */}
        <div className="flex flex-col bg-background border rounded-md min-h-0">
          <div className="px-4 py-3 border-b">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ticket en curso</div>
          </div>
          <div className="flex-1 overflow-auto">
            {lines.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Toca productos para añadirlos.
              </div>
            )}
            {lines.map((l) => (
              <div key={l.product_id} className="px-4 py-3 border-b">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-semibold text-sm leading-tight">{l.name}</div>
                  <div className="font-bold tabular-nums">{eur(l.unit_price * l.quantity)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0"
                    onClick={() => adjustLine(l.product_id, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="font-bold w-8 text-center tabular-nums">{l.quantity}</span>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0"
                    onClick={() => adjustLine(l.product_id, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive"
                    onClick={() => removeLine(l.product_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="uppercase text-xs tracking-[0.2em] text-muted-foreground">Total</span>
              <span className="text-3xl font-black tabular-nums">{eur(total)}</span>
            </div>
            <Button
              size="lg"
              className="w-full h-16 text-lg font-black uppercase tracking-wider"
              disabled={lines.length === 0}
              onClick={() => { setLastTicket(null); setPayOpen(true); }}
            >
              Cobrar
            </Button>
          </div>
        </div>
      </div>

      <PayDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        lines={lines}
        onPaid={(ticketNum) => {
          setLines([]);
          setSelectedCat(null);
          setPayOpen(false);
          setLastTicket(ticketNum);
          window.setTimeout(() => setLastTicket((n) => (n === ticketNum ? null : n)), 5000);
        }}
      />
    </div>
  );
}

function PayDialog({
  open, onClose, total, lines, onPaid,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  lines: Line[];
  onPaid: (ticketNumber: number) => void;
}) {
  const [mode, setMode] = useState<"choose" | "cash" | "card">("choose");
  const [tendered, setTendered] = useState("");
  const qc = useQueryClient();
  const checkout = useServerFn(checkoutPosOrder);

  const mutation = useMutation({
    mutationFn: (input: { lines: Line[]; method: "cash" | "card"; tendered?: number }) =>
      checkout({
        data: {
          lines: input.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
          payment_method: input.method,
          tendered: input.tendered,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pos", "sales-today"] });
      onPaid(res.order_number);
      setMode("choose");
      setTendered("");
    },
    onError: (err: Error) => toast.error(err.message || "Error al cobrar"),
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    setMode("choose");
    setTendered("");
    onClose();
  };

  const tenderedNum = Number(tendered.replace(",", ".")) || 0;
  const change = Math.max(0, tenderedNum - total);

  const pushDigit = (d: string) => {
    setTendered((prev) => {
      if (d === "." && prev.includes(".")) return prev;
      if (prev === "0" && d !== ".") return d;
      return (prev + d).slice(0, 8);
    });
  };
  const backspace = () => setTendered((p) => p.slice(0, -1));
  const quickAmount = (n: number) => setTendered(String(n));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider">Cobrar</DialogTitle>
        </DialogHeader>

        <div className="bg-muted rounded-md p-6 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Total</div>
          <div className="text-4xl font-black tabular-nums">{eur(total)}</div>
        </div>

        {mode === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-24 text-base font-black uppercase tracking-wider"
              onClick={() => setMode("cash")}
            >
              <Banknote className="h-6 w-6 mr-2" /> Efectivo
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-24 text-base font-black uppercase tracking-wider"
              onClick={() => setMode("card")}
            >
              <CreditCard className="h-6 w-6 mr-2" /> Tarjeta
            </Button>
          </div>
        )}

        {mode === "cash" && (
          <div className="space-y-3">
            <div className="bg-background border rounded-md p-4 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Entregado</div>
                <div className="text-2xl font-black tabular-nums">{eur(tenderedNum)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Cambio</div>
                <div className={`text-2xl font-black tabular-nums ${tenderedNum >= total ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {eur(change)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 20, 50].map((n) => (
                <Button key={n} variant="outline" className="h-12 font-bold"
                  onClick={() => quickAmount(n)}>{n}€</Button>
              ))}
            </div>
            <Button variant="outline" className="w-full h-12 font-bold uppercase tracking-wider"
              onClick={() => setTendered(total.toFixed(2))}>
              Importe exacto
            </Button>

            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9",".","0"].map((d) => (
                <Button key={d} variant="outline" className="h-14 text-xl font-black"
                  onClick={() => pushDigit(d)}>{d}</Button>
              ))}
              <Button variant="outline" className="h-14" onClick={backspace}>
                <Delete className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="ghost" className="h-12" onClick={() => setMode("choose")}>
                <X className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button
                className="h-12 font-black uppercase tracking-wider"
                disabled={tenderedNum < total || mutation.isPending}
                onClick={() => mutation.mutate({ lines, method: "cash", tendered: tenderedNum })}
              >
                <Check className="h-4 w-4 mr-2" /> Confirmar
              </Button>
            </div>
          </div>
        )}

        {mode === "card" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center px-4">
              Cobra en el datáfono externo y confirma aquí para registrar la venta.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="h-12" onClick={() => setMode("choose")}>
                <X className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button
                className="h-12 font-black uppercase tracking-wider"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ lines, method: "card" })}
              >
                <Check className="h-4 w-4 mr-2" /> Confirmar tarjeta
              </Button>
            </div>
          </div>
        )}

        {mode === "choose" && (
          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}