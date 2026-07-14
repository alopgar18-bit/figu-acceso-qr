import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { read, utils } from "xlsx";
import Papa from "papaparse";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEvents, useEventSessions } from "@/lib/use-events";
import {
  TARGET_FIELDS,
  IMPORT_STATUS_OPTIONS,
  DUPLICATE_STRATEGIES,
  IMPORT_QR_STATES,
  guessTarget,
  type TargetField,
  type DuplicateStrategy,
} from "@/lib/import-constants";
import {
  ATTENDEE_TYPE_OPTIONS,
  type ParticipantStatus,
  type AttendeeType,
  statusLabel,
} from "@/lib/participant-constants";
import { commitImport, analyzeImport } from "@/lib/imports.functions";
import {
  BLOCK_LABEL,
  BLOCK_DESCRIPTION,
  ACTION_LABEL,
  actionsForBlock,
  type DuplicateBlock,
  type RowAction,
} from "@/lib/import-constants";
import {
  FIELD_DEFS,
  resolveFieldRequirements,
  type FieldKey,
  type FieldRule,
} from "@/lib/field-requirements";
import { useKeepSessionAlive } from "@/hooks/use-keep-session-alive";

export const Route = createFileRoute("/_authenticated/importaciones/nueva")({
  component: ImportWizardPage,
});

type RawRow = Record<string, string>;

interface ParsedFile {
  filename: string;
  headers: string[];
  rows: RawRow[];
}

const STEPS = ["Archivo", "Evento", "Mapeo", "Validación", "Análisis", "Resultado"] as const;

type AnalysisRow = {
  rowIndex: number;
  block: DuplicateBlock;
  match_reason: "dni" | "email" | "phone" | "name" | null;
  existing: {
    participantId?: string;
    personId?: string;
    sessionId?: string | null;
    sessionName?: string | null;
    status?: string | null;
    hasTicket?: boolean;
  } | null;
};
type AnalysisResult = {
  rows: AnalysisRow[];
  counts: { A: number; B: number; C: number; D: number; B_with_ticket: number; C_with_ticket: number };
};

function ImportWizardPage() {
  const navigate = useNavigate();
  const commit = useServerFn(commitImport);
  const analyze = useServerFn(analyzeImport);

  const [step, setStep] = useState(0);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadError, setUploadError] = useState(false);
  const [source, setSource] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [defaultStatus, setDefaultStatus] = useState<ParticipantStatus>("pendiente_revision");
  const [defaultAttendeeType, setDefaultAttendeeType] = useState<AttendeeType>("publico");
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("suffix_distinct");
  const [mapping, setMapping] = useState<Record<string, TargetField | "">>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);
  const [duplicateHits, setDuplicateHits] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Mantiene viva la sesión mientras se analiza/importa un fichero grande.
  useKeepSessionAlive(submitting || analyzing);
  const [blockActions, setBlockActions] = useState<Record<DuplicateBlock, RowAction>>({
    A: "create_new",
    B: "update",
    C: "create_here",
    D: "create_new",
  });
  const [rowOverrides, setRowOverrides] = useState<Record<number, RowAction>>({});

  const { data: events = [] } = useEvents();
  const { data: sessions = [] } = useEventSessions(eventId || undefined);

  // Resolve field requirements for selected event/session pair.
  const resolved = useMemo<Record<FieldKey, FieldRule> | null>(() => {
    const ev = events.find((e) => e.id === eventId) as
      | { field_requirements?: unknown; requires_image_consent?: boolean | null }
      | undefined;
    if (!ev) return null;
    const sess = sessions.find((s) => s.id === sessionId) as
      | { inherit_event_fields?: boolean | null; field_requirements?: unknown }
      | undefined;
    return resolveFieldRequirements(ev, sess);
  }, [events, sessions, eventId, sessionId]);

  /** Required field keys for this import (only those marked required AND in_import). */
  const requiredImportKeys = useMemo<FieldKey[]>(() => {
    if (!resolved) return [];
    return FIELD_DEFS.filter(
      (d) => resolved[d.key].required && resolved[d.key].in_import && d.importTarget,
    ).map((d) => d.key);
  }, [resolved]);

  const requiredImportTargets = useMemo<Set<string>>(() => {
    return new Set(
      requiredImportKeys
        .map((k) => FIELD_DEFS.find((d) => d.key === k)?.importTarget)
        .filter((v): v is string => !!v),
    );
  }, [requiredImportKeys]);

  // Auto-guess mapping when file changes
  function autoGuessMapping(headers: string[]) {
    const next: Record<string, TargetField | ""> = {};
    const used = new Set<TargetField>();
    for (const h of headers) {
      const g = guessTarget(h);
      if (g && !used.has(g)) {
        next[h] = g;
        used.add(g);
      } else {
        next[h] = "";
      }
    }
    setMapping(next);
  }

  async function handleFile(file: File) {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let headers: string[] = [];
      let rows: RawRow[] = [];
      if (ext === "csv") {
        const text = await file.text();
        const result = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
        headers = result.meta.fields ?? [];
        rows = result.data.filter((r) => Object.values(r).some((v) => v && String(v).trim() !== ""));
      } else {
        const buf = await file.arrayBuffer();
        const wb = read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: false });
        headers = json.length > 0 ? Object.keys(json[0]) : [];
        rows = json.filter((r) => Object.values(r).some((v) => v && String(v).trim() !== ""));
      }
      if (headers.length === 0 || rows.length === 0) {
        toast.error("El archivo no contiene filas válidas");
        return;
      }
      setParsed({ filename: file.name, headers, rows });
      setUploadError(false);
      autoGuessMapping(headers);
      setStep(1);
    } catch (err) {
      toast.error("No se pudo leer el archivo", { description: err instanceof Error ? err.message : "Error" });
    }
  }

  // ----- Normalization & validation -----
  const normalized = useMemo(() => {
    if (!parsed) return { rows: [] as Array<Record<string, unknown> & { rowIndex: number }>, errors: [] as Array<{ row: number; msg: string }> };
    const inv: Partial<Record<TargetField, string>> = {};
    for (const [src, tgt] of Object.entries(mapping)) {
      if (tgt) inv[tgt as TargetField] = src;
    }
    const rows: Array<Record<string, unknown> & { rowIndex: number }> = [];
    const errors: Array<{ row: number; msg: string }> = [];
    parsed.rows.forEach((raw, i) => {
      const get = (t: TargetField): string => {
        const col = inv[t];
        return col ? String(raw[col] ?? "").trim() : "";
      };
      const birth = normalizeDate(get("birth_date"));
      const dni = get("dni").toUpperCase();
      const email = get("email").toLowerCase();
      const phone = get("phone").replace(/\s+/g, "");
      const row: Record<string, unknown> & { rowIndex: number } = {
        rowIndex: i + 1,
        first_name: get("first_name"),
        last_name: get("last_name") || null,
        dni: dni || null,
        email: email || null,
        phone: phone || null,
        birth_date: birth,
        city: get("city") || null,
        province: get("province") || null,
        gender: get("gender") || null,
        profession: get("profession") || null,
        photo_url: get("photo_url") || null,
        instagram: get("instagram") || null,
        tiktok: get("tiktok") || null,
        notes: get("notes") || null,
        attendee_type: normalizeAttendee(get("attendee_type")),
        initial_status: normalizeStatus(get("initial_status")),
        companions_count: Number(get("companions_count")) || 0,
        seat_zone: get("seat_zone") || null,
        seat_row: get("seat_row") || null,
        seat_number: get("seat_number") || null,
      };
      // Per-event/session required validation
      for (const key of requiredImportTargets) {
        const def = FIELD_DEFS.find((d) => d.importTarget === key);
        const val = String(row[key as keyof typeof row] ?? "").trim();
        if (!val) {
          errors.push({ row: i + 1, msg: `Falta ${def?.label ?? key}` });
        } else if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          errors.push({ row: i + 1, msg: "Email no válido" });
        } else if (key === "phone" && val.length < 5) {
          errors.push({ row: i + 1, msg: "Teléfono no válido" });
        }
      }
      rows.push(row);
    });
    return { rows, errors };
  }, [parsed, mapping, requiredImportTargets]);

  const validRows = useMemo(() => {
    const bad = new Set(normalized.errors.map((e) => e.row));
    return normalized.rows.filter((r) => !bad.has(r.rowIndex));
  }, [normalized]);

  const requiredMissing = useMemo(() => {
    const used = new Set(Object.values(mapping));
    return FIELD_DEFS.filter(
      (d) => requiredImportTargets.has(d.importTarget ?? "") && !used.has(d.importTarget as TargetField),
    ).map((d) => d.label);
  }, [mapping, requiredImportTargets]);

  async function preflightDuplicates() {
    if (validRows.length === 0) {
      setDuplicateHits(0);
      return;
    }
    const dnis = Array.from(new Set(validRows.map((r) => r.dni as string | null).filter((v): v is string => !!v))).slice(0, 200);
    const emails = Array.from(new Set(validRows.map((r) => r.email as string | null).filter((v): v is string => !!v))).slice(0, 200);
    const orParts: string[] = [];
    if (dnis.length > 0) orParts.push(`dni.in.(${dnis.map((d) => `"${d}"`).join(",")})`);
    if (emails.length > 0) orParts.push(`email.in.(${emails.map((e) => `"${e}"`).join(",")})`);
    if (orParts.length === 0) { setDuplicateHits(0); return; }
    const { data, error } = await supabase
      .from("people")
      .select("id")
      .or(orParts.join(","));
    if (error) {
      setDuplicateHits(null);
      return;
    }
    setDuplicateHits(data?.length ?? 0);
  }

  async function handleCommit() {
    if (!parsed || !eventId || !sessionId) return;
    setSubmitting(true);
    try {
      const mappingsArr = Object.entries(mapping)
        .filter(([, v]) => v)
        .map(([source_column, target_field]) => ({ source_column, target_field: target_field as string, transform: null }));
      // Construye perRowActions a partir del análisis (bloque + overrides).
      let perRowActions: Record<string, RowAction> | undefined;
      if (analysis) {
        perRowActions = {};
        for (const a of analysis.rows) {
          const act = rowOverrides[a.rowIndex] ?? blockActions[a.block];
          perRowActions[String(a.rowIndex)] = act;
        }
      }
      const res = await commit({
        data: {
          filename: parsed.filename,
          source: source || null,
          eventId,
          sessionId,
          defaultStatus,
          defaultAttendeeType,
          duplicateStrategy,
          mappings: mappingsArr,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: validRows as any,
          perRowActions,
        },
      });
      setResult(res);
      setStep(5);
      toast.success(`Importación completada: ${res.imported} de ${res.total}`);
    } catch (err) {
      toast.error("Error en la importación", { description: err instanceof Error ? err.message : "Error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function runAnalysis() {
    if (validRows.length === 0 || !eventId || !sessionId) return;
    setAnalyzing(true);
    try {
      const slim = validRows.map((r) => ({
        rowIndex: r.rowIndex,
        first_name: String(r.first_name ?? ""),
        last_name: (r.last_name as string | null) ?? null,
        dni: (r.dni as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
      }));
      const res = await analyze({ data: { eventId, sessionId, rows: slim } });
      setAnalysis(res as AnalysisResult);
      setRowOverrides({});
    } catch (err) {
      toast.error("No se pudo analizar", {
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  const canNextFromConfig = !!eventId && !!sessionId;
  const canNextFromMapping = requiredMissing.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Nueva importación"
        description="Asistente paso a paso para importar invitados desde Excel o CSV."
        actions={
          <Button variant="outline" asChild>
            <Link to="/importaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
          </Button>
        }
      />

      <Stepper step={step} />

      {step === 0 && (
        <UploadStep onFile={handleFile} source={source} setSource={setSource} error={uploadError} />
      )}

      {step === 1 && parsed && (
        <ConfigStep
          parsed={parsed}
          events={events}
          sessions={sessions}
          eventId={eventId}
          setEventId={setEventId}
          sessionId={sessionId}
          setSessionId={setSessionId}
          defaultStatus={defaultStatus}
          setDefaultStatus={setDefaultStatus}
          defaultAttendeeType={defaultAttendeeType}
          setDefaultAttendeeType={setDefaultAttendeeType}
          duplicateStrategy={duplicateStrategy}
          setDuplicateStrategy={setDuplicateStrategy}
        />
      )}

      {step === 2 && parsed && (
        <MappingStep parsed={parsed} mapping={mapping} setMapping={setMapping} requiredMissing={requiredMissing} requiredImportTargets={requiredImportTargets} resolved={resolved} />
      )}

      {step === 3 && parsed && (
        <ValidationStep
          normalized={normalized}
          validRows={validRows}
          duplicateHits={duplicateHits}
          onPreflight={preflightDuplicates}
          defaultStatus={defaultStatus}
          duplicateStrategy={duplicateStrategy}
          setDuplicateStrategy={setDuplicateStrategy}
          resolved={resolved}
        />
      )}

      {step === 4 && parsed && (
        <AnalysisStep
          analysis={analysis}
          analyzing={analyzing}
          onRunAnalysis={runAnalysis}
          blockActions={blockActions}
          setBlockActions={setBlockActions}
          rowOverrides={rowOverrides}
          setRowOverrides={setRowOverrides}
          validRows={validRows}
        />
      )}

      {step === 5 && result && (
        <ResultStep
          result={result}
          eventId={eventId}
          sessionId={sessionId}
          onNew={() => {
            setParsed(null);
            setResult(null);
            setAnalysis(null);
            setRowOverrides({});
            setStep(0);
          }}
          onViewBatch={() => navigate({ to: "/importaciones/$batchId", params: { batchId: result.batchId } })}
        />
      )}

      {step < 5 && (
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />Anterior
          </Button>
          {step === 4 ? (
            (() => {
              const willImport = analysis
                ? analysis.rows.filter((r) => {
                    const act = rowOverrides[r.rowIndex] ?? blockActions[r.block];
                    return act !== "skip";
                  }).length
                : validRows.length;
              return (
                <Button
                  onClick={handleCommit}
                  disabled={submitting || analyzing || !analysis || willImport === 0}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Importar {willImport} filas
                </Button>
              );
            })()
          ) : (
            <Button
              onClick={() => {
                if (step === 0 && !parsed) {
                  setUploadError(true);
                  return;
                }
                setUploadError(false);
                const next = step + 1;
                setStep(next);
                // Al entrar al paso "Análisis", lanza el análisis automáticamente.
                if (next === 4) void runAnalysis();
              }}
              disabled={
                (step === 1 && !canNextFromConfig) ||
                (step === 2 && !canNextFromMapping)
              }
            >
              Siguiente<ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 " +
                (done
                  ? "bg-primary text-primary-foreground border-primary"
                  : active
                    ? "border-primary text-primary"
                    : "border-muted text-muted-foreground")
              }
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={"text-sm font-medium uppercase tracking-wider " + (active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({ onFile, source, setSource, error }: { onFile: (f: File) => void; source: string; setSource: (v: string) => void; error?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Subir archivo</CardTitle>
        <CardDescription>Formatos aceptados: .xlsx, .csv (máx 5.000 filas).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="source">Origen del archivo (cliente / productora)</Label>
          <Input id="source" placeholder="Ej: Mediapro – Casting marzo" value={source} onChange={(e) => setSource(e.target.value)} className="mt-2 max-w-md" />
        </div>
        <div>
          <label className={"block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 transition " + (error ? "border-destructive bg-destructive/5" : "")}>
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="font-semibold">Selecciona o arrastra un archivo</p>
            <p className="text-sm text-muted-foreground mt-1">.xlsx · .csv</p>
            <input
              type="file"
              accept=".xlsx,.csv,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          {error && (
            <p className="text-sm text-destructive mt-2">Debes subir un archivo .xlsx o .csv para continuar</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigStep(props: {
  parsed: ParsedFile;
  events: Array<{ id: string; name: string; status: string }>;
  sessions: Array<{ id: string; name: string; starts_at: string; capacity: number }>;
  eventId: string;
  setEventId: (v: string) => void;
  sessionId: string;
  setSessionId: (v: string) => void;
  defaultStatus: ParticipantStatus;
  setDefaultStatus: (v: ParticipantStatus) => void;
  defaultAttendeeType: AttendeeType;
  setDefaultAttendeeType: (v: AttendeeType) => void;
  duplicateStrategy: DuplicateStrategy;
  setDuplicateStrategy: (v: DuplicateStrategy) => void;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Archivo</CardTitle>
          <CardDescription className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />{props.parsed.filename}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Filas detectadas</span><strong>{props.parsed.rows.length}</strong></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Columnas</span><strong>{props.parsed.headers.length}</strong></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destino</CardTitle>
          <CardDescription>Evento y sesión a los que se asignarán las personas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Evento</Label>
            <Select value={props.eventId} onValueChange={(v) => { props.setEventId(v); props.setSessionId(""); }}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
              <SelectContent>
                {props.events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sesión</Label>
            <Select value={props.sessionId} onValueChange={props.setSessionId} disabled={!props.eventId}>
              <SelectTrigger className="mt-2"><SelectValue placeholder={props.eventId ? "Selecciona una sesión" : "Primero selecciona evento"} /></SelectTrigger>
              <SelectContent>
                {props.sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {new Date(s.starts_at).toLocaleString("es-ES")} (aforo {s.capacity})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Reglas de importación</CardTitle>
          <CardDescription>Se aplican a todas las filas salvo que el archivo indique lo contrario.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Estado inicial</Label>
            <Select value={props.defaultStatus} onValueChange={(v) => props.setDefaultStatus(v as ParticipantStatus)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMPORT_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{IMPORT_STATUS_OPTIONS.find((o) => o.value === props.defaultStatus)?.description}</p>
          </div>
          <div>
            <Label>Tipo de asistente</Label>
            <Select value={props.defaultAttendeeType} onValueChange={(v) => props.setDefaultAttendeeType(v as AttendeeType)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTENDEE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1">
              Duplicados por nombre+apellido
              {(props.duplicateStrategy === "update_person" ||
                props.duplicateStrategy === "skip") && (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              )}
            </Label>
            <Select value={props.duplicateStrategy} onValueChange={(v) => props.setDuplicateStrategy(v as DuplicateStrategy)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DUPLICATE_STRATEGIES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{DUPLICATE_STRATEGIES.find((o) => o.value === props.duplicateStrategy)?.description}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MappingStep({
  parsed,
  mapping,
  setMapping,
  requiredMissing,
  requiredImportTargets,
  resolved,
}: {
  parsed: ParsedFile;
  mapping: Record<string, TargetField | "">;
  setMapping: (m: Record<string, TargetField | "">) => void;
  requiredMissing: string[];
  requiredImportTargets: Set<string>;
  resolved: Record<FieldKey, FieldRule> | null;
}) {
  const previewRows = parsed.rows.slice(0, 5);
  const importable = resolved
    ? FIELD_DEFS.filter((d) => d.importTarget && resolved[d.key].in_import)
    : FIELD_DEFS.filter((d) => d.importTarget);
  return (
    <div className="space-y-6">
      {resolved && (
        <Card>
          <CardHeader>
            <CardTitle>Requisitos de esta sesión</CardTitle>
            <CardDescription>Configurados en el evento o sobrescritos en la sesión.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Obligatorios</div>
              <div className="flex flex-wrap gap-1">
                {importable.filter((d) => resolved[d.key].required).length === 0 && (
                  <span className="text-sm text-muted-foreground">Ninguno — solo importará lo que detecte.</span>
                )}
                {importable.filter((d) => resolved[d.key].required).map((d) => (
                  <Badge key={d.key} variant="default">{d.label}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Opcionales</div>
              <div className="flex flex-wrap gap-1">
                {importable.filter((d) => !resolved[d.key].required).map((d) => (
                  <Badge key={d.key} variant="outline">{d.label}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {requiredMissing.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Faltan campos obligatorios</AlertTitle>
          <AlertDescription>Asigna columnas para: {requiredMissing.join(", ")}.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>3. Mapeo de columnas</CardTitle>
          <CardDescription>Asocia cada columna del archivo a un campo de FIGURARTE. Los campos sin mapear se ignoran.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {parsed.headers.map((h) => (
              <div key={h} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center border rounded-md p-3">
                <div>
                  <div className="font-mono text-sm font-semibold">{h}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {previewRows.map((r, i) => <span key={i} className="mr-2">{String(r[h] ?? "").slice(0, 30) || "—"}</span>)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground justify-self-center" />
                <Select
                  value={mapping[h] ?? ""}
                  onValueChange={(v) => setMapping({ ...mapping, [h]: (v === "__none__" ? "" : (v as TargetField)) })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin mapear" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sin mapear —</SelectItem>
                    {TARGET_FIELDS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}{requiredImportTargets.has(t.value) ? " *" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ValidationStep({
  normalized,
  validRows,
  duplicateHits,
  onPreflight,
  defaultStatus,
  duplicateStrategy,
  setDuplicateStrategy,
  resolved,
}: {
  normalized: { rows: Array<Record<string, unknown> & { rowIndex: number }>; errors: Array<{ row: number; msg: string }> };
  validRows: Array<Record<string, unknown> & { rowIndex: number }>;
  duplicateHits: number | null;
  onPreflight: () => void;
  defaultStatus: ParticipantStatus;
  duplicateStrategy: DuplicateStrategy;
  setDuplicateStrategy: (v: DuplicateStrategy) => void;
  resolved: Record<FieldKey, FieldRule> | null;
}) {
  const preview = normalized.rows.slice(0, 20);
  const errSet = new Set(normalized.errors.map((e) => e.row));
  void resolved;
  const willOverwrite =
    duplicateHits !== null &&
    duplicateHits > 0 &&
    (duplicateStrategy === "update_person" || duplicateStrategy === "skip");
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Filas totales" value={normalized.rows.length} />
        <StatCard label="Válidas" value={validRows.length} tone="success" />
        <StatCard label="Con errores" value={normalized.errors.length} tone={normalized.errors.length > 0 ? "danger" : "neutral"} />
        <StatCard
          label="Duplicados detectados"
          value={duplicateHits === null ? "—" : duplicateHits}
          tone={duplicateHits && duplicateHits > 0 ? "warning" : "neutral"}
          action={<Button size="sm" variant="outline" onClick={onPreflight}>Comprobar</Button>}
        />
      </div>

      {willOverwrite && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {duplicateHits} filas con nombre+apellido ya existentes en esta sesión
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Estrategia actual: <strong>{DUPLICATE_STRATEGIES.find((d) => d.value === duplicateStrategy)?.label}</strong>.
              {" "}
              {duplicateStrategy === "update_person"
                ? "Estas filas se fusionarán con la persona existente y su asiento se sobrescribirá con el de la fila importada (podría dejar butacas huérfanas en el plano)."
                : "Estas filas se saltarán sin importar."}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDuplicateStrategy("suffix_distinct")}
              >
                Cambiar a "Tratar como personas distintas (VIS 2, VIS 3…)"
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {IMPORT_QR_STATES.includes(defaultStatus) && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Se generarán códigos QR ({validRows.length})</AlertTitle>
          <AlertDescription>
            {IMPORT_STATUS_OPTIONS.find((o) => o.value === defaultStatus)?.description}
            {" "}Las filas sin email ni teléfono se marcarán como "sin canal de contacto" y quedarán excluidas del envío masivo individual.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>4. Validación</CardTitle>
          <CardDescription>Estrategia de duplicados: <strong>{DUPLICATE_STRATEGIES.find((d) => d.value === duplicateStrategy)?.label}</strong>. Solo se importarán las filas válidas.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((r) => {
                  const hasErr = errSet.has(r.rowIndex);
                  return (
                    <TableRow key={r.rowIndex} className={hasErr ? "bg-destructive/10" : undefined}>
                      <TableCell>{r.rowIndex}</TableCell>
                      <TableCell>{String(r.first_name)} {String(r.last_name ?? "")}</TableCell>
                      <TableCell className="font-mono text-xs">{String(r.dni)}</TableCell>
                      <TableCell className="text-xs">{String(r.email)}</TableCell>
                      <TableCell className="text-xs">{String(r.phone)}</TableCell>
                      <TableCell>
                        {hasErr ? <Badge variant="destructive">Error</Badge> : <Badge variant="secondary">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {normalized.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Errores detectados ({normalized.errors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorsList errors={normalized.errors} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalysisStep({
  analysis,
  analyzing,
  onRunAnalysis,
  blockActions,
  setBlockActions,
  rowOverrides,
  setRowOverrides,
  validRows,
}: {
  analysis: AnalysisResult | null;
  analyzing: boolean;
  onRunAnalysis: () => void;
  blockActions: Record<DuplicateBlock, RowAction>;
  setBlockActions: (u: Record<DuplicateBlock, RowAction>) => void;
  rowOverrides: Record<number, RowAction>;
  setRowOverrides: (u: Record<number, RowAction>) => void;
  validRows: Array<Record<string, unknown> & { rowIndex: number }>;
}) {
  const [expanded, setExpanded] = useState<DuplicateBlock | null>(null);
  const rowsByIdx = useMemo(() => {
    const m = new Map<number, Record<string, unknown> & { rowIndex: number }>();
    for (const r of validRows) m.set(r.rowIndex, r);
    return m;
  }, [validRows]);

  if (analyzing || !analysis) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando duplicados contra el evento…
          </div>
          <Button variant="outline" size="sm" onClick={onRunAnalysis} disabled={analyzing}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const blocks: DuplicateBlock[] = ["A", "B", "C", "D"];
  const rowsByBlock: Record<DuplicateBlock, AnalysisRow[]> = { A: [], B: [], C: [], D: [] };
  for (const r of analysis.rows) rowsByBlock[r.block].push(r);

  const willImport = analysis.rows.filter((r) => {
    const act = rowOverrides[r.rowIndex] ?? blockActions[r.block];
    return act !== "skip";
  }).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <StatCard
          label="Nuevos en esta sesión (A)"
          value={analysis.counts.A}
          tone="success"
          action={
            (() => {
              const visCount = analysis.rows.filter(
                (r) => r.block === "A" && (r as AnalysisRow & { dni_in_other_session?: boolean }).dni_in_other_session,
              ).length;
              return visCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {visCount} con DNI en otra sesión → VIS
                </span>
              ) : null;
            })()
          }
        />
        <StatCard
          label="Ya en esta sesión (B)"
          value={analysis.counts.B}
          tone={analysis.counts.B_with_ticket > 0 ? "danger" : "warning"}
          action={
            analysis.counts.B_with_ticket > 0 ? (
              <span className="text-xs text-destructive">
                {analysis.counts.B_with_ticket} con entrada enviada
              </span>
            ) : null
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Aislamiento por sesión activo: los solicitantes son exclusivos de la sesión destino. Si un DNI ya está en otra sesión del mismo evento, se importa como persona VIS (nuevo participante independiente).
      </p>

      <Alert>
        <AlertTitle>Se importarán {willImport} de {analysis.rows.length} filas</AlertTitle>
        <AlertDescription>
          Elige qué hacer con cada bloque de duplicados. Puedes sobreescribir fila a fila expandiendo el bloque.
        </AlertDescription>
      </Alert>

      {blocks.map((block) => {
        const rows = rowsByBlock[block];
        if (rows.length === 0) return null;
        const { options, default: defaultAction } = actionsForBlock(block);
        const current = blockActions[block] ?? defaultAction;
        const isOpen = expanded === block;
        return (
          <Card key={block}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="outline">{block}</Badge>
                    {BLOCK_LABEL[block]}
                    <Badge variant="secondary">{rows.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">{BLOCK_DESCRIPTION[block]}</CardDescription>
                </div>
                <div className="min-w-[240px]">
                  {options.length === 1 ? (
                    <Badge>{ACTION_LABEL[options[0]]}</Badge>
                  ) : (
                    <Select
                      value={current}
                      onValueChange={(v) =>
                        setBlockActions({ ...blockActions, [block]: v as RowAction })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o} value={o}>
                            {ACTION_LABEL[o]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(isOpen ? null : block)}
              >
                {isOpen ? "Ocultar detalle" : "Ver detalle por fila"}
              </Button>
              {isOpen && (
                <ScrollArea className="h-[320px] mt-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Coincidencia</TableHead>
                        <TableHead>Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const src = rowsByIdx.get(r.rowIndex);
                        const act = rowOverrides[r.rowIndex] ?? current;
                        return (
                          <TableRow key={r.rowIndex}>
                            <TableCell className="tabular-nums">{r.rowIndex}</TableCell>
                            <TableCell className="text-xs">
                              {String(src?.first_name ?? "")} {String(src?.last_name ?? "")}
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.match_reason ? (
                                <Badge variant="outline">{r.match_reason}</Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.existing?.sessionName && (
                                <div>{r.existing.sessionName}</div>
                              )}
                              {r.existing?.status && (
                                <div className="text-muted-foreground">
                                  {statusLabel(r.existing.status as never)}
                                </div>
                              )}
                              {r.existing?.hasTicket && (
                                <Badge variant="destructive" className="mt-1">
                                  entrada enviada
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {options.length === 1 ? (
                                <span className="text-xs">{ACTION_LABEL[options[0]]}</span>
                              ) : (
                                <Select
                                  value={act}
                                  onValueChange={(v) =>
                                    setRowOverrides({
                                      ...rowOverrides,
                                      [r.rowIndex]: v as RowAction,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map((o) => (
                                      <SelectItem key={o} value={o}>
                                        {ACTION_LABEL[o]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ResultStep({
  result,
  eventId,
  sessionId,
  onNew,
  onViewBatch,
}: {
  result: { batchId: string; total: number; imported: number; skipped: number; updated: number; errored: number; qrGenerated?: number; noContactChannel?: number; finalStatus: string };
  eventId: string;
  sessionId: string;
  onNew: () => void;
  onViewBatch: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" />Importación finalizada</CardTitle>
        <CardDescription>Estado del lote: <strong>{result.finalStatus}</strong></CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={result.total} />
          <StatCard label="Importadas" value={result.imported} tone="success" />
          <StatCard label="Actualizadas" value={result.updated} tone="info" />
          <StatCard label="Saltadas" value={result.skipped} tone="warning" />
          <StatCard label="QR generados" value={result.qrGenerated ?? 0} tone="info" />
          <StatCard label="Sin canal contacto" value={result.noContactChannel ?? 0} tone={(result.noContactChannel ?? 0) > 0 ? "warning" : "neutral"} />
          <StatCard label="Errores" value={result.errored} tone={result.errored > 0 ? "danger" : "neutral"} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onNew}>Nueva importación</Button>
          <Button asChild variant="outline">
            <Link to="/solicitudes" search={{ eventId, sessionId, importBatchId: result.batchId }}>Ver solicitudes</Link>
          </Button>
          <Button onClick={onViewBatch}>Ver detalle del lote</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorsList({ errors }: { errors: Array<{ row: number; msg: string }> }) {
  const INITIAL = 100;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? errors : errors.slice(0, INITIAL);
  return (
    <>
      <ScrollArea className={showAll ? "h-96" : "h-48"}>
        <ul className="text-sm space-y-1">
          {visible.map((e, i) => (
            <li key={i}>
              <Badge variant="outline" className="mr-2">Fila {e.row}</Badge>
              {e.msg}
            </li>
          ))}
        </ul>
      </ScrollArea>
      {errors.length > INITIAL && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {showAll
              ? `Mostrando todos los ${errors.length} errores.`
              : `Mostrando los primeros ${INITIAL} de ${errors.length}.`}
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Mostrar solo ${INITIAL}` : `Ver todos (${errors.length})`}
          </Button>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, tone = "neutral", action }: { label: string; value: number | string; tone?: "neutral" | "success" | "warning" | "danger" | "info"; action?: React.ReactNode }) {
  const toneClass = {
    neutral: "",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-destructive",
    info: "text-primary",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={"text-3xl font-bold mt-1 " + toneClass}>{value}</div>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

// ----- helpers -----
function normalizeDate(v: string): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, d, m, y] = m1;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) {
    const [, d, m, y] = m2;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // try Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeAttendee(v: string): AttendeeType | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase().trim();
  const found = ATTENDEE_TYPE_OPTIONS.find((o) => o.value === s || o.label.toLowerCase() === s);
  return found?.value;
}

function normalizeStatus(v: string): ParticipantStatus | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase().trim().replace(/\s+/g, "_");
  const found = IMPORT_STATUS_OPTIONS.find((o) => o.value === s);
  return found?.value;
}