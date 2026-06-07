import { IdCard, Clock, AlertCircle, Info, ShieldCheck, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TicketNoticeIcon = "id" | "clock" | "alert" | "info" | "shield" | "map";

export interface TicketNotice {
  icon: TicketNoticeIcon;
  text: string; // may include simple HTML like <strong>
}

export interface TicketDesign {
  header_bg: string | null;
  header_text_color: string | null;
  notices: TicketNotice[];
  footer_note: string | null;
  instructions_override: string | null;
}

export const NOTICE_ICON_MAP: Record<TicketNoticeIcon, LucideIcon> = {
  id: IdCard,
  clock: Clock,
  alert: AlertCircle,
  info: Info,
  shield: ShieldCheck,
  map: MapPin,
};

export const NOTICE_ICON_OPTIONS: { value: TicketNoticeIcon; label: string }[] = [
  { value: "id", label: "DNI" },
  { value: "clock", label: "Reloj" },
  { value: "alert", label: "Aviso" },
  { value: "info", label: "Información" },
  { value: "shield", label: "Seguridad" },
  { value: "map", label: "Ubicación" },
];

export const DEFAULT_TICKET_NOTICES: TicketNotice[] = [
  { icon: "id", text: "<strong>DNI obligatorio</strong> en el acceso para verificar tu identidad." },
  { icon: "clock", text: "<strong>Puntualidad:</strong> llega con al menos 30 minutos de antelación. No se garantiza el acceso fuera del horario indicado." },
  { icon: "alert", text: "Este QR es <strong>personal e intransferible</strong> y de un solo uso. No lo compartas." },
];

export const DEFAULT_FOOTER_NOTE = "Conserva este enlace para volver a ver tu entrada.";

export function parseTicketDesign(raw: unknown): TicketDesign {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const noticesRaw = Array.isArray(d.notices) ? (d.notices as unknown[]) : [];
  const notices: TicketNotice[] = noticesRaw
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const obj = n as Record<string, unknown>;
      const icon = typeof obj.icon === "string" ? (obj.icon as TicketNoticeIcon) : "info";
      const text = typeof obj.text === "string" ? obj.text : "";
      if (!text.trim()) return null;
      return { icon: NOTICE_ICON_MAP[icon] ? icon : "info", text };
    })
    .filter((x): x is TicketNotice => x !== null);
  return {
    header_bg: typeof d.header_bg === "string" && d.header_bg ? d.header_bg : null,
    header_text_color: typeof d.header_text_color === "string" && d.header_text_color ? d.header_text_color : null,
    notices,
    footer_note: typeof d.footer_note === "string" ? d.footer_note : null,
    instructions_override: typeof d.instructions_override === "string" && d.instructions_override ? d.instructions_override : null,
  };
}
