import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";

type Assignment = {
  id: string;
  event_id: string;
  session_id: string | null;
  filter_config: { form_ids?: string[] } | null;
  events: { id: string; name: string } | null;
  event_sessions: { id: string; name: string } | null;
};

export function ClientAssignmentsPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["client-assignments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_assignments")
        .select("id, event_id, session_id, filter_config, events(id, name), event_sessions(id, name)")
        .eq("client_id", clientId)
        .eq("role", "cliente_productora")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-all-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events").select("id, name").order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [eventId, setEventId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("all");
  const [formId, setFormId] = useState<string>("all");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-assign", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions").select("id, name").eq("event_id", eventId).order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["public-forms-assign", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_forms").select("id, title").eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!eventId) throw new Error("Selecciona evento");
      const filter_config = formId !== "all" ? { form_ids: [formId] } : {};
      const { error } = await supabase.from("event_assignments").insert({
        event_id: eventId,
        session_id: sessionId === "all" ? null : sessionId,
        client_id: clientId,
        role: "cliente_productora",
        filter_config,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Asignación añadida");
      setEventId(""); setSessionId("all"); setFormId("all");
      qc.invalidateQueries({ queryKey: ["client-assignments", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Asignación eliminada");
      qc.invalidateQueries({ queryKey: ["client-assignments", clientId] });
    },
  });

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="text-sm font-medium">Eventos / sesiones asignados</div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : !assignments || assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay asignaciones.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const formIds = a.filter_config?.form_ids ?? [];
            return (
              <div key={a.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.events?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                    <span>{a.event_sessions?.name ?? "Todas las sesiones"}</span>
                    {formIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Solo {formIds.length} formulario{formIds.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Añadir asignación</div>
        <div>
          <Label className="text-xs">Evento</Label>
          <Select value={eventId} onValueChange={(v) => { setEventId(v); setSessionId("all"); setFormId("all"); }}>
            <SelectTrigger><SelectValue placeholder="Selecciona evento" /></SelectTrigger>
            <SelectContent>
              {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Sesión</Label>
            <Select value={sessionId} onValueChange={setSessionId} disabled={!eventId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sesiones</SelectItem>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origen (formulario)</Label>
            <Select value={formId} onValueChange={setFormId} disabled={!eventId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los orígenes</SelectItem>
                {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending || !eventId}>
          {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Plus className="h-4 w-4 mr-1" />Añadir
        </Button>
      </div>
    </div>
  );
}