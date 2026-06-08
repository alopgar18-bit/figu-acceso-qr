import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommChannel, CommStatus } from "./communication-constants";

export interface CommSummaryFilters {
  eventId?: string;
  sessionId?: string;
  includeArchived?: boolean;
}

export interface CommSummaryRow {
  batch_id: string | null;
  batch_label: string;
  event_name: string | null;
  session_name: string | null;
  created_at: string | null;
  total: number;
  enviados_email: number;
  enviados_whatsapp: number;
  fallidos_email: number;
  fallidos_whatsapp: number;
  sin_email: number;
  sin_telefono: number;
  pendientes: number;
  email_confirmados_resend: number;
  email_sin_confirmacion: number;
  whatsapp_confirmados_wassenger: number;
  email_por_remitente: Record<string, number>;
}

export interface CommSummaryAggregate extends Omit<CommSummaryRow, "batch_id" | "batch_label" | "event_name" | "session_name" | "created_at"> {
  rows: CommSummaryRow[];
}

type Log = {
  id: string;
  batch_id: string | null;
  channel: CommChannel;
  status: CommStatus;
  to_address: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  events: { name: string | null } | null;
  event_sessions: { name: string | null } | null;
  import_batches: { id: string; filename: string | null; created_at: string | null } | null;
};

const isWhatsapp = (c: CommChannel) =>
  c === "whatsapp_asistido" || c === "whatsapp_business";

export function useCommSummary(filters: CommSummaryFilters = {}) {
  return useQuery({
    queryKey: ["comm_summary", filters],
    queryFn: async (): Promise<CommSummaryAggregate> => {
      let q = supabase
        .from("communication_logs")
        .select(
          "id, batch_id, channel, status, to_address, created_at, metadata, events(name), event_sessions(name), import_batches(id, filename, created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (filters.eventId) q = q.eq("event_id", filters.eventId);
      if (filters.sessionId) q = q.eq("session_id", filters.sessionId);
      if (!filters.includeArchived) q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      const logs = (data ?? []) as unknown as Log[];

      const buckets = new Map<string, Log[]>();
      for (const l of logs) {
        const key = l.batch_id ?? "__none__";
        const arr = buckets.get(key) ?? [];
        arr.push(l);
        buckets.set(key, arr);
      }

      const rows: CommSummaryRow[] = [];
      for (const [key, items] of buckets) {
        const first = items[0];
        const batchInfo = first.import_batches;
        const batchLabel = key === "__none__"
          ? "Sin lote (envíos manuales)"
          : batchInfo?.filename ?? `Lote ${key.slice(0, 8)}`;
        rows.push({
          batch_id: key === "__none__" ? null : key,
          batch_label: batchLabel,
          event_name: first.events?.name ?? null,
          session_name: first.event_sessions?.name ?? null,
          created_at: batchInfo?.created_at ?? first.created_at,
          ...computeStats(items),
        });
      }
      rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

      return { rows, ...computeStats(logs) };
    },
  });
}

function computeStats(items: Log[]) {
  let enviados_email = 0,
    enviados_whatsapp = 0,
    fallidos_email = 0,
    fallidos_whatsapp = 0,
    sin_email = 0,
    sin_telefono = 0,
    pendientes = 0;
  for (const l of items) {
    const wa = isWhatsapp(l.channel);
    const email = l.channel === "email";
    const missing = !l.to_address || !l.to_address.trim();
    if (l.status === "enviado") {
      if (email) enviados_email++;
      else if (wa) enviados_whatsapp++;
    } else if (l.status === "fallido") {
      if (email) fallidos_email++;
      else if (wa) fallidos_whatsapp++;
    } else if (l.status === "pendiente" || l.status === "programado") {
      pendientes++;
    }
    if (missing) {
      if (email) sin_email++;
      else if (wa) sin_telefono++;
    }
  }
  return {
    total: items.length,
    enviados_email,
    enviados_whatsapp,
    fallidos_email,
    fallidos_whatsapp,
    sin_email,
    sin_telefono,
    pendientes,
  };
}