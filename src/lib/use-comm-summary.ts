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
  details: PersonDetail[];
}

export interface PersonDetail {
  key: string;
  person_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  email_status: CommStatus | null;
  email_confirmed_resend: boolean;
  email_error: string | null;
  whatsapp_status: CommStatus | null;
  whatsapp_confirmed_wassenger: boolean;
  whatsapp_error: string | null;
  has_failure: boolean;
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
  error_message: string | null;
  person_id: string | null;
  people: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
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
          "id, batch_id, channel, status, to_address, created_at, metadata, error_message, person_id, people(first_name, last_name, email, phone), events(name), event_sessions(name), import_batches(id, filename, created_at)",
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
          details: buildPersonDetails(items),
        });
      }
      rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

      return { rows, ...computeStats(logs), details: [] };
    },
  });
}

function buildPersonDetails(items: Log[]): PersonDetail[] {
  const byPerson = new Map<string, PersonDetail>();
  for (const l of items) {
    const key = l.person_id ?? `addr:${l.to_address ?? l.id}`;
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const person = l.people;
    let d = byPerson.get(key);
    if (!d) {
      d = {
        key,
        person_id: l.person_id,
        first_name: person?.first_name ?? "",
        last_name: person?.last_name ?? "",
        email: person?.email ?? "",
        phone: person?.phone ?? "",
        email_status: null,
        email_confirmed_resend: false,
        email_error: null,
        whatsapp_status: null,
        whatsapp_confirmed_wassenger: false,
        whatsapp_error: null,
        has_failure: false,
      };
      byPerson.set(key, d);
    }
    const isWa = isWhatsapp(l.channel);
    if (l.channel === "email") {
      d.email_status = l.status;
      if (typeof meta.resend_id === "string" && meta.resend_id) d.email_confirmed_resend = true;
      if (l.status === "fallido") {
        d.email_error = l.error_message ?? d.email_error ?? "Error desconocido";
        d.has_failure = true;
      }
      if (!d.email && l.to_address) d.email = l.to_address;
    } else if (isWa) {
      d.whatsapp_status = l.status;
      if (typeof meta.wassenger_id === "string" && meta.wassenger_id) d.whatsapp_confirmed_wassenger = true;
      if (l.status === "fallido") {
        d.whatsapp_error = l.error_message ?? d.whatsapp_error ?? "Error desconocido";
        d.has_failure = true;
      }
      if (!d.phone && l.to_address) d.phone = l.to_address;
    }
  }
  return Array.from(byPerson.values()).sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "es"),
  );
}

const DEFAULT_EMAIL_FROM = "casting@figurarte.app";

function computeStats(items: Log[]) {
  let enviados_email = 0,
    enviados_whatsapp = 0,
    fallidos_email = 0,
    fallidos_whatsapp = 0,
    sin_email = 0,
    sin_telefono = 0,
    pendientes = 0,
    email_confirmados_resend = 0,
    email_sin_confirmacion = 0,
    whatsapp_confirmados_wassenger = 0;
  const email_por_remitente: Record<string, number> = {};
  for (const l of items) {
    const wa = isWhatsapp(l.channel);
    const email = l.channel === "email";
    const missing = !l.to_address || !l.to_address.trim();
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    if (l.status === "enviado") {
      if (email) {
        enviados_email++;
        const resendId = typeof meta.resend_id === "string" ? meta.resend_id : null;
        if (resendId) email_confirmados_resend++;
        else email_sin_confirmacion++;
        const fromRaw = typeof meta.from === "string" && meta.from.trim().length > 0 ? meta.from.trim() : DEFAULT_EMAIL_FROM;
        const match = fromRaw.match(/<([^>]+)>/);
        const fromAddr = (match ? match[1] : fromRaw).toLowerCase();
        email_por_remitente[fromAddr] = (email_por_remitente[fromAddr] ?? 0) + 1;
      } else if (wa) {
        enviados_whatsapp++;
        if (typeof meta.wassenger_id === "string" && meta.wassenger_id) whatsapp_confirmados_wassenger++;
      }
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
    email_confirmados_resend,
    email_sin_confirmacion,
    whatsapp_confirmados_wassenger,
    email_por_remitente,
  };
}