import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet, Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { read, utils } from "xlsx";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  applySeatCorrections,
  previewSeatCorrections,
  type CorrectionPlan,
  type CorrectionRowInput,
} from "@/lib/seat-corrections.functions";

function normH(h: string) {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function parseCorrectionFile(file: File): Promise<CorrectionRowInput[]> {
  const buf = await file.arrayBuffer();
  const wb = read(buf, { type: "array" });
  // Hoja preferida: "Listado corregido" → fallback: primera hoja con columnas finales
  const sheetName =
    wb.SheetNames.find((n) => normH(n).includes("corregido")) ??
    wb.SheetNames.find((n) => normH(n).includes("listado")) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName!];
  const json = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (json.length === 0) return [];

  const headers = Object.keys(json[0]!);
  const norm = new Map(headers.map((h) => [normH(h), h] as const));
  const find = (names: string[]) => {
    for (const n of names) {
      const k = norm.get(n);
      if (k) return k;
    }
    return undefined;
  };
  const kEmail = find(["email", "correo", "e-mail"]);
  const kName = find(["nombre completo", "nombre", "full_name"]);
  const kZone = find(["zona", "sector", "zone"]);
  const kRowFinal = find(["fila final", "fila_final", "nueva fila"]);
  const kSeatFinal = find(["asiento final", "asiento_final", "nuevo asiento"]);
  const kRowOrig = find(["fila original", "fila"]);
  const kSeatOrig = find(["asiento original", "asiento"]);

  if (!kName || !kZone) {
    throw new Error(
      "El Excel debe contener columnas 'Nombre completo' y 'Zona'. Hoja usada: " + sheetName,
    );
  }

  const out: CorrectionRowInput[] = [];
  for (const rec of json) {
    const get = (k?: string) => (k ? String(rec[k] ?? "").trim() : "");
    const name = get(kName);
    const zone = get(kZone);
    const rowFinal = get(kRowFinal) || get(kRowOrig);
    const seatFinal = get(kSeatFinal) || get(kSeatOrig);
    if (!name || !zone) continue;
    out.push({
      email: get(kEmail) || null,
      full_name: name,
      zone,
      row_final: rowFinal || null,
      number_final: seatFinal || null,
    });
  }
  return out;
}

export function ApplySeatCorrectionsDialog({
  sessionId,
  onApplied,
}: {
  sessionId: string;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CorrectionRowInput[] | null>(null);
  const [plan, setPlan] = useState<CorrectionPlan | null>(null);

  const previewFn = useServerFn(previewSeatCorrections);
  const applyFn = useServerFn(applySeatCorrections);

  const previewMut = useMutation({
    mutationFn: async (parsed: CorrectionRowInput[]) =>
      previewFn({ data: { session_id: sessionId, rows: parsed } }),
    onSuccess: (p) => {
      setPlan(p);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al validar"),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!rows) throw new Error("Sin filas");
      return applyFn({
        data: { session_id: sessionId, rows, file_name: file?.name },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Aplicadas ${res.applied} correcciones${res.errors.length ? `, ${res.errors.length} fallidas` : ""}`,
      );
      onApplied();
      setOpen(false);
      setFile(null);
      setRows(null);
      setPlan(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al aplicar"),
  });

  async function handleFile(f: File) {
    setFile(f);
    try {
      const parsed = await parseCorrectionFile(f);
      if (parsed.length === 0) {
        toast.error("No se encontraron filas válidas en el Excel");
        return;
      }
      setRows(parsed);
      previewMut.mutate(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  function reset() {
    setFile(null);
    setRows(null);
    setPlan(null);
    previewMut.reset();
    applyMut.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-3 w-3 mr-1" /> Aplicar correcciones (Excel)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aplicar correcciones de butacas desde Excel</DialogTitle>
          <DialogDescription>
            Sube el Excel con la hoja <strong>Listado corregido</strong> (columnas{" "}
            <code>Email</code>, <code>Nombre completo</code>, <code>Zona</code>,{" "}
            <code>Fila final</code>, <code>Asiento final</code>). Solo se actualizan zona, fila
            y asiento. <strong>No se reenvían entradas ni se regeneran QR</strong>; las URLs
            ya enviadas siguen siendo válidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-3 border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-muted/50 transition">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-sm">
              {file ? (
                <span>
                  <strong>{file.name}</strong>
                  {rows ? ` — ${rows.length} filas` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Selecciona el Excel con las correcciones
                </span>
              )}
            </div>
            {file && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  reset();
                }}
              >
                Quitar
              </Button>
            )}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>

          {previewMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analizando el Excel…
            </div>
          )}

          {plan && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="default">A aplicar: {plan.totals.applied}</Badge>
                  <Badge variant="secondary">Sin cambios: {plan.totals.unchanged}</Badge>
                  {plan.totals.no_match > 0 && (
                    <Badge variant="destructive">No encontrados: {plan.totals.no_match}</Badge>
                  )}
                  {plan.totals.ambiguous > 0 && (
                    <Badge variant="destructive">Ambiguos: {plan.totals.ambiguous}</Badge>
                  )}
                  {plan.totals.missing_seat > 0 && (
                    <Badge variant="outline">Sin asiento final: {plan.totals.missing_seat}</Badge>
                  )}
                  {plan.totals.dest_unavailable > 0 && (
                    <Badge variant="destructive">
                      Destino reservado: {plan.totals.dest_unavailable}
                    </Badge>
                  )}
                  {plan.totals.dest_dup_in_excel > 0 && (
                    <Badge variant="destructive">
                      Duplicados en Excel: {plan.totals.dest_dup_in_excel}
                    </Badge>
                  )}
                </div>

                {plan.totals.dest_dup_in_excel > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>El Excel asigna la misma butaca a varias personas</AlertTitle>
                    <AlertDescription>
                      Estas filas se omitirán para no crear nuevos conflictos. Corrígelas en el
                      Excel y vuelve a subirlo.
                    </AlertDescription>
                  </Alert>
                )}

                {(plan.totals.no_match > 0 ||
                  plan.totals.ambiguous > 0 ||
                  plan.totals.dest_unavailable > 0 ||
                  plan.totals.dest_dup_in_excel > 0 ||
                  plan.totals.missing_seat > 0) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Ver filas problemáticas (
                      {plan.totals.no_match +
                        plan.totals.ambiguous +
                        plan.totals.dest_unavailable +
                        plan.totals.dest_dup_in_excel +
                        plan.totals.missing_seat}
                      )
                    </summary>
                    <ScrollArea className="h-48 mt-2 border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-1">Estado</th>
                            <th className="text-left p-1">Nombre</th>
                            <th className="text-left p-1">Email</th>
                            <th className="text-left p-1">Destino</th>
                            <th className="text-left p-1">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.items
                            .filter(
                              (i) =>
                                i.status !== "applied" && i.status !== "unchanged",
                            )
                            .slice(0, 200)
                            .map((i, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-1">
                                  <Badge variant="outline" className="text-[10px]">
                                    {i.status}
                                  </Badge>
                                </td>
                                <td className="p-1">{i.full_name}</td>
                                <td className="p-1 text-muted-foreground">{i.email ?? "—"}</td>
                                <td className="p-1">
                                  {i.zone} F{i.row_final} #{i.number_final}
                                </td>
                                <td className="p-1 text-muted-foreground">{i.message ?? ""}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </details>
                )}

                {plan.totals.applied > 0 && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Listo para aplicar</AlertTitle>
                    <AlertDescription>
                      Se actualizarán {plan.totals.applied} asientos. Los QR/URLs ya enviados
                      seguirán funcionando.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={!plan || plan.totals.applied === 0 || applyMut.isPending}
          >
            {applyMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Aplicar {plan?.totals.applied ?? 0} correcciones
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}