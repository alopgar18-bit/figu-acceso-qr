/**
 * Per-event / per-session configurable field requirements.
 *
 * Replaces the old hardcoded "DNI/email/phone/name/last name are always
 * required" rule. Each event (and optionally each session) can declare
 * which fields are visible, required, used in imports, and included in
 * reports. Sessions inherit by default; toggle off to override.
 */

export type FieldKey =
  | "first_name"
  | "last_name"
  | "dni"
  | "email"
  | "phone"
  | "birth_date"
  | "photo"
  | "social_media"
  | "city"
  | "province"
  | "gender"
  | "profession"
  | "notes"
  | "special_needs"
  | "companions"
  | "consent_privacy"
  | "consent_participation"
  | "consent_image"
  | "consent_future_processes";

export type FieldRule = {
  visible: boolean;
  required: boolean;
  in_import: boolean;
  in_report: boolean;
};

export type FieldRequirements = Partial<Record<FieldKey, Partial<FieldRule>>>;

export interface FieldDef {
  key: FieldKey;
  label: string;
  group: "persona" | "contacto" | "perfil" | "extra" | "consentimientos";
  defaults: FieldRule;
  /** import target field name as used in import-constants */
  importTarget?: string;
}

export const FIELD_DEFS: FieldDef[] = [
  { key: "first_name", label: "Nombre", group: "persona", importTarget: "first_name",
    defaults: { visible: true, required: true, in_import: true, in_report: true } },
  { key: "last_name", label: "Apellidos", group: "persona", importTarget: "last_name",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "dni", label: "DNI / NIE / Pasaporte", group: "persona", importTarget: "dni",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "email", label: "Email", group: "contacto", importTarget: "email",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "phone", label: "Teléfono", group: "contacto", importTarget: "phone",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "birth_date", label: "Fecha de nacimiento", group: "perfil", importTarget: "birth_date",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "photo", label: "Foto", group: "perfil", importTarget: "photo_url",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
  { key: "social_media", label: "Redes sociales", group: "perfil",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
  { key: "city", label: "Ciudad", group: "perfil", importTarget: "city",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "province", label: "Provincia", group: "perfil", importTarget: "province",
    defaults: { visible: true, required: false, in_import: true, in_report: true } },
  { key: "gender", label: "Género", group: "perfil", importTarget: "gender",
    defaults: { visible: false, required: false, in_import: false, in_report: false } },
  { key: "profession", label: "Profesión", group: "perfil", importTarget: "profession",
    defaults: { visible: false, required: false, in_import: false, in_report: false } },
  { key: "notes", label: "Observaciones", group: "extra", importTarget: "notes",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
  { key: "special_needs", label: "Necesidades especiales", group: "extra",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
  { key: "companions", label: "Acompañantes", group: "extra",
    defaults: { visible: true, required: false, in_import: false, in_report: true } },
  { key: "consent_privacy", label: "Consentimiento política de privacidad", group: "consentimientos",
    defaults: { visible: true, required: true, in_import: false, in_report: false } },
  { key: "consent_participation", label: "Consentimiento participación / asistencia", group: "consentimientos",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
  { key: "consent_image", label: "Consentimiento de imagen", group: "consentimientos",
    defaults: { visible: false, required: false, in_import: false, in_report: false } },
  { key: "consent_future_processes", label: "Consentimiento para futuros procesos", group: "consentimientos",
    defaults: { visible: true, required: false, in_import: false, in_report: false } },
];

export const FIELD_GROUP_LABELS: Record<FieldDef["group"], string> = {
  persona: "Datos personales",
  contacto: "Contacto",
  perfil: "Perfil",
  extra: "Información adicional",
  consentimientos: "Consentimientos",
};

/** Build the "fully resolved" requirements map for an event/session pair. */
export function resolveFieldRequirements(
  event: { field_requirements?: unknown; requires_image_consent?: boolean | null } | null | undefined,
  session?: { inherit_event_fields?: boolean | null; field_requirements?: unknown } | null,
): Record<FieldKey, FieldRule> {
  const out = {} as Record<FieldKey, FieldRule>;
  for (const def of FIELD_DEFS) {
    out[def.key] = { ...def.defaults };
  }

  // Event override forces image consent if event-level toggle is true.
  if (event?.requires_image_consent) {
    out.consent_image = { ...out.consent_image, visible: true, required: true };
  }

  applyOverrides(out, event?.field_requirements);

  const useSession = session && session.inherit_event_fields === false;
  if (useSession) {
    applyOverrides(out, session?.field_requirements);
  }
  return out;
}

function applyOverrides(target: Record<FieldKey, FieldRule>, raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const obj = raw as Record<string, Partial<FieldRule> | undefined>;
  for (const def of FIELD_DEFS) {
    const v = obj[def.key];
    if (!v || typeof v !== "object") continue;
    target[def.key] = {
      visible: typeof v.visible === "boolean" ? v.visible : target[def.key].visible,
      required: typeof v.required === "boolean" ? v.required : target[def.key].required,
      in_import: typeof v.in_import === "boolean" ? v.in_import : target[def.key].in_import,
      in_report: typeof v.in_report === "boolean" ? v.in_report : target[def.key].in_report,
    };
    if (!target[def.key].visible) target[def.key].required = false;
  }
}

/** Convenience: list of required keys (after resolution). */
export function requiredFieldKeys(resolved: Record<FieldKey, FieldRule>): FieldKey[] {
  return FIELD_DEFS.filter((d) => resolved[d.key].required && resolved[d.key].visible).map((d) => d.key);
}

/** Convenience: list of import-required keys. */
export function importRequiredFieldKeys(resolved: Record<FieldKey, FieldRule>): FieldKey[] {
  return FIELD_DEFS.filter((d) => resolved[d.key].required && resolved[d.key].in_import).map((d) => d.key);
}

export function fieldLabel(key: FieldKey): string {
  return FIELD_DEFS.find((d) => d.key === key)?.label ?? key;
}