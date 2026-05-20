import type { Database } from "@/integrations/supabase/types";

export type EventType = Database["public"]["Enums"]["event_type"];
export type EventStatus = Database["public"]["Enums"]["event_status"];
export type SessionStatus = Database["public"]["Enums"]["session_status"];
export type CompanionsQrMode = Database["public"]["Enums"]["companions_qr_mode"];
export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "publico_tv", label: "Público TV" },
  { value: "grabacion", label: "Grabación" },
  { value: "casting", label: "Casting" },
  { value: "premiere", label: "Premiere" },
  { value: "evento_privado", label: "Evento privado" },
  { value: "produccion", label: "Producción audiovisual" },
  { value: "otro", label: "Otro" },
];

export const EVENT_STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "publicado", label: "Publicado" },
  { value: "cerrado", label: "Cerrado" },
  { value: "archivado", label: "Archivado" },
];

export const SESSION_STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: "programada", label: "Programada" },
  { value: "abierta", label: "Abierta" },
  { value: "cerrada", label: "Cerrada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "completada", label: "Finalizada" },
];

export const COMPANIONS_QR_MODE_OPTIONS: { value: CompanionsQrMode; label: string }[] = [
  { value: "mismo_qr", label: "Mismo QR para todos" },
  { value: "qr_propio", label: "QR propio por acompañante" },
];

export function labelOf<T extends string>(
  options: { value: T; label: string }[],
  value: T | null | undefined,
) {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}