import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Wand2, CheckCircle2, Trash2, Loader2, Plus, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ATTENDEE_TYPE_OPTIONS, attendeeLabel } from "@/lib/participant-constants";
import { SEAT_OVERRIDE_LABELS } from "@/lib/seats.functions";
import {
  listAssignmentRules,
  upsertAssignmentRule,
  deleteAssignmentRule,
} from "@/lib/assignment-rules.functions";
import {
  generateAssignmentProposal,
  listProposalsForSession,
  getProposalDetail,
  applyProposal,
  discardProposal,
} from "@/lib/assignment-engine.functions";

export const Route = createFileRoute("/_authenticated/sesiones/$sessionId/asignacion")({
  component: AsignacionPage,
});

const AVOIDABLE_CATEGORIES = [
  "reservado_camaras",
  "bloqueado",
  "reservado_movilidad_reducida",
  "reservado_vip",
  "reservado_prensa",
  "reservado_equipo",
] as const;

function AsignacionPage() {
  const { sessionId } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  // Session + plan
  const sessionQuery = useQuery({
    queryKey: ["session-light", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, event_id, title, venue_plan_id, starts_at")
        .eq("id", sessionId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const planId = sessionQuery.data?.venue_plan_id ?? null;

  const zonesQuery = useQuery({
    queryKey: ["plan-zones-min", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_zones")
        .select("id, name")
        .eq("plan_id", planId!)
        .order("display_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const listRulesFn = useServerFn(listAssignmentRules);
  const rulesQuery = useQuery({
    queryKey: ["assignment-rules", planId],
    enabled: !!planId,
    queryFn: () => listRulesFn({ data: { plan_id: planId! } }),
  });

  const listProposalsFn = useServerFn(listProposalsForSession);
  const proposalsQuery = useQuery({
    queryKey: ["assignment-proposals", sessionId],
    queryFn: () => listProposalsFn({ data: { session_id: sessionId } }),
  });

  const generateFn = useServerFn(generateAssignmentProposal);
  const generateMut = useMutation({
    mutationFn: () => generateFn({ data: { session_id: sessionId } }),
    onSuccess: (res) => {
      toast.success(`Propuesta generada: ${res.total_assigned} asignados · ${res.total_unassigned} sin sitio`);
      qc.invalidateQueries({ queryKey: ["assignment-proposals", sessionId] });
      setSelectedProposal(res.proposal_id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule?: RuleEdit }>({ open: false });

  if (sessionQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!planId) {
    return (
      <div className="p-8 space-y-4">
        <PageHeader title="Asignación automática" description="Esta sesión no tiene plano físico." />
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm">
              Para usar la asignación automática, primero vincula un plano físico
              a la sesión desde la pantalla de edición de la sesión.
            </p>
            <Button asChild variant="outline">
              <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId: sessionQuery.data!.event_id, sessionId }}>
                Editar sesión
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sesiones/$sessionId/plano" params={{ sessionId }}>
            <ArrowLeft className="size-4 mr-1" /> Volver al plano
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Asignación automática de butacas"
        description={sessionQuery.data?.title ?? ""}
      />

      {/* Reglas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Reglas por tipo de asistente</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={() => setRuleDialog({ open: true })}>
              <Plus className="size-4 mr-1" /> Nueva regla
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {rulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando reglas…</p>
          ) : (rulesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin reglas definidas. Se usará el comportamiento por defecto:
              evitar cámaras, bloqueados, MR y VIP; mantener acompañantes juntos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Prio.</TableHead>
                  <TableHead>Zonas preferidas</TableHead>
                  <TableHead>Evita</TableHead>
                  <TableHead>Juntos</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rulesQuery.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{attendeeLabel(r.attendee_type)}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell className="text-xs">
                      {(r.preferred_zone_ids ?? []).length === 0
                        ? "Todas"
                        : (r.preferred_zone_ids as string[])
                            .map((id) => (zonesQuery.data ?? []).find((z) => z.id === id)?.name ?? id)
                            .join(", ")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {(r.avoid_categories ?? []).length === 0
                        ? "—"
                        : (r.avoid_categories as string[])
                            .map((c) => SEAT_OVERRIDE_LABELS[c as keyof typeof SEAT_OVERRIDE_LABELS] ?? c)
                            .join(", ")}
                    </TableCell>
                    <TableCell>
                      {r.keep_companions_together ? "Sí" : "No"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setRuleDialog({
                                open: true,
                                rule: {
                                  id: r.id,
                                  attendee_type: r.attendee_type,
                                  priority: r.priority,
                                  preferred_zone_ids: r.preferred_zone_ids as string[],
                                  avoid_categories: r.avoid_categories as string[],
                                  keep_companions_together: r.keep_companions_together,
                                  allow_split_if_full: r.allow_split_if_full,
                                },
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DeleteRuleButton id={r.id} planId={planId} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generate */}
      <Card>
        <CardHeader>
          <CardTitle>Generar propuesta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La propuesta calcula los asientos en memoria para revisar antes de
            aplicar. No se modifican butacas hasta que pulses «Aplicar».
          </p>
          {isAdmin && (
            <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
              {generateMut.isPending ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Wand2 className="size-4 mr-1" />
              )}
              Generar propuesta nueva
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Proposals */}
      <Card>
        <CardHeader>
          <CardTitle>Propuestas</CardTitle>
        </CardHeader>
        <CardContent>
          {(proposalsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin propuestas todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignados</TableHead>
                  <TableHead>Sin sitio</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(proposalsQuery.data ?? []).map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedProposal(p.id)}
                  >
                    <TableCell>{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "applied" ? "default" : p.status === "discarded" ? "outline" : "secondary"}>
                        {p.status === "applied" ? "Aplicada" : p.status === "discarded" ? "Descartada" : "Borrador"}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.total_assigned}</TableCell>
                    <TableCell>{p.total_unassigned}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedProposal(p.id); }}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedProposal && (
        <ProposalDetail
          proposalId={selectedProposal}
          isAdmin={isAdmin}
          onClose={() => setSelectedProposal(null)}
        />
      )}

      {ruleDialog.open && (
        <RuleDialog
          planId={planId}
          rule={ruleDialog.rule}
          zones={zonesQuery.data ?? []}
          onClose={() => setRuleDialog({ open: false })}
        />
      )}
    </div>
  );
}

type RuleEdit = {
  id?: string;
  attendee_type: string;
  priority: number;
  preferred_zone_ids: string[];
  avoid_categories: string[];
  keep_companions_together: boolean;
  allow_split_if_full: boolean;
};

function RuleDialog({
  planId,
  rule,
  zones,
  onClose,
}: {
  planId: string;
  rule?: RuleEdit;
  zones: { id: string; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RuleEdit>(
    rule ?? {
      attendee_type: "publico",
      priority: 100,
      preferred_zone_ids: [],
      avoid_categories: [...AVOIDABLE_CATEGORIES.slice(0, 4)],
      keep_companions_together: true,
      allow_split_if_full: true,
    },
  );

  const upsertFn = useServerFn(upsertAssignmentRule);
  const mut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: form.id,
          plan_id: planId,
          attendee_type: form.attendee_type as never,
          priority: form.priority,
          preferred_zone_ids: form.preferred_zone_ids,
          avoid_categories: form.avoid_categories,
          keep_companions_together: form.keep_companions_together,
          allow_split_if_full: form.allow_split_if_full,
        },
      }),
    onSuccess: () => {
      toast.success("Regla guardada");
      qc.invalidateQueries({ queryKey: ["assignment-rules", planId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleZone(id: string) {
    setForm((f) => ({
      ...f,
      preferred_zone_ids: f.preferred_zone_ids.includes(id)
        ? f.preferred_zone_ids.filter((x) => x !== id)
        : [...f.preferred_zone_ids, id],
    }));
  }
  function toggleAvoid(c: string) {
    setForm((f) => ({
      ...f,
      avoid_categories: f.avoid_categories.includes(c)
        ? f.avoid_categories.filter((x) => x !== c)
        : [...f.avoid_categories, c],
    }));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar regla" : "Nueva regla"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de asistente</Label>
              <Select
                value={form.attendee_type}
                onValueChange={(v) => setForm((f) => ({ ...f, attendee_type: v }))}
                disabled={!!form.id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ATTENDEE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad (menor = primero)</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 100 }))}
              />
            </div>
          </div>

          <div>
            <Label>Zonas preferidas (vacío = todas)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {zones.map((z) => (
                <label key={z.id} className="flex items-center gap-1.5 text-sm border rounded px-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={form.preferred_zone_ids.includes(z.id)}
                    onCheckedChange={() => toggleZone(z.id)}
                  />
                  {z.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Categorías a evitar</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {AVOIDABLE_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm border rounded px-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={form.avoid_categories.includes(c)}
                    onCheckedChange={() => toggleAvoid(c)}
                  />
                  {SEAT_OVERRIDE_LABELS[c as keyof typeof SEAT_OVERRIDE_LABELS] ?? c}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.keep_companions_together}
              onCheckedChange={(v) => setForm((f) => ({ ...f, keep_companions_together: !!v }))}
              id="kct"
            />
            <Label htmlFor="kct" className="cursor-pointer">Mantener acompañantes juntos</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.allow_split_if_full}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allow_split_if_full: !!v }))}
              id="asf"
            />
            <Label htmlFor="asf" className="cursor-pointer">Permitir separar si no hay consecutivos</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleButton({ id, planId }: { id: string; planId: string }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deleteAssignmentRule);
  const mut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Regla eliminada");
      qc.invalidateQueries({ queryKey: ["assignment-rules", planId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

function ProposalDetail({
  proposalId,
  isAdmin,
  onClose,
}: {
  proposalId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getProposalDetail);
  const detail = useQuery({
    queryKey: ["proposal-detail", proposalId],
    queryFn: () => getFn({ data: { proposal_id: proposalId } }),
  });

  const applyFn = useServerFn(applyProposal);
  const discardFn = useServerFn(discardProposal);

  const applyMut = useMutation({
    mutationFn: () => applyFn({ data: { proposal_id: proposalId } }),
    onSuccess: (r) => {
      toast.success(`Aplicada: ${r.applied} participantes actualizados`);
      qc.invalidateQueries({ queryKey: ["proposal-detail", proposalId] });
      qc.invalidateQueries({ queryKey: ["assignment-proposals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const discardMut = useMutation({
    mutationFn: () => discardFn({ data: { proposal_id: proposalId } }),
    onSuccess: () => {
      toast.success("Propuesta descartada");
      qc.invalidateQueries({ queryKey: ["assignment-proposals"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportExcel() {
    if (!detail.data) return;
    const rows = detail.data.items.map((it) => {
      const p = it.participant as { first_name?: string | null; last_name?: string | null; dni?: string | null; attendee_type?: string } | null;
      return {
        Nombre: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—",
        DNI: p?.dni ?? "",
        Tipo: p?.attendee_type ?? "",
        Acompañante: it.is_companion ? `#${it.companion_index}` : "",
        Zona: it.zone_name ?? "",
        Fila: it.row_label ?? "",
        Butaca: it.seat_number ?? "",
        Motivo: it.reason ?? "",
        "Sin asignar": it.unassigned_reason ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Propuesta");
    XLSX.writeFile(wb, `propuesta-${proposalId.slice(0, 8)}.xlsx`);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de propuesta</DialogTitle>
        </DialogHeader>
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !detail.data ? null : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-3 text-sm">
                <Badge variant="secondary">Asignados: {detail.data.proposal.total_assigned}</Badge>
                <Badge variant="outline">Sin sitio: {detail.data.proposal.total_unassigned}</Badge>
                <Badge>{detail.data.proposal.status}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportExcel}>
                  <Download className="size-4 mr-1" /> Exportar Excel
                </Button>
                {isAdmin && detail.data.proposal.status === "draft" && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => discardMut.mutate()} disabled={discardMut.isPending}>
                      Descartar
                    </Button>
                    <Button size="sm" onClick={() => applyMut.mutate()} disabled={applyMut.isPending}>
                      {applyMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
                      Aplicar definitivamente
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asistente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Acomp.</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Fila</TableHead>
                  <TableHead>Butaca</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.data.items.map((it) => {
                  const p = it.participant as { first_name?: string | null; last_name?: string | null; attendee_type?: string } | null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs">
                        {[p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{p?.attendee_type ?? ""}</TableCell>
                      <TableCell className="text-xs">{it.is_companion ? `#${it.companion_index}` : "—"}</TableCell>
                      <TableCell className="text-xs">{it.zone_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{it.row_label ?? "—"}</TableCell>
                      <TableCell className="text-xs">{it.seat_number ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {it.reason || it.unassigned_reason || ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}