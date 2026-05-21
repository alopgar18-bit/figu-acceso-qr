import type { ParticipantStatus, AttendeeType } from "./participant-constants";

export type TargetField =
  | "first_name"
  | "last_name"
  | "dni"
  | "email"
  | "phone"
  | "birth_date"
  | "city"
  | "province"
  | "gender"
  | "profession"
  | "photo_url"
  | "instagram"
  | "tiktok"
  | "notes"
  | "attendee_type"
  | "initial_status"
  | "companions_count";

export interface TargetFieldDef {
  value: TargetField;
  label: string;
  required?: boolean;
  group: "persona" | "redes" | "participacion";
  hint?: string;
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  { value: "first_name", label: "Nombre", group: "persona" },
  { value: "last_name", label: "Apellidos", group: "persona" },
  { value: "dni", label: "DNI / NIE", group: "persona" },
  { value: "email", label: "Email", group: "persona" },
  { value: "phone", label: "Teléfono", group: "persona" },
  { value: "birth_date", label: "Fecha de nacimiento", group: "persona", hint: "YYYY-MM-DD o DD/MM/YYYY" },
  { value: "city", label: "Ciudad", group: "persona" },
  { value: "province", label: "Provincia", group: "persona" },
  { value: "gender", label: "Género", group: "persona" },
  { value: "profession", label: "Profesión", group: "persona" },
  { value: "photo_url", label: "Foto (URL)", group: "redes" },
  { value: "instagram", label: "Instagram", group: "redes" },
  { value: "tiktok", label: "TikTok", group: "redes" },
  { value: "notes", label: "Observaciones", group: "participacion" },
  { value: "attendee_type", label: "Tipo de participante", group: "participacion" },
  { value: "initial_status", label: "Estado inicial (por fila)", group: "participacion" },
  { value: "companions_count", label: "Nº de acompañantes", group: "participacion" },
];

export const IMPORT_STATUS_OPTIONS: { value: ParticipantStatus; label: string; description: string }[] = [
  { value: "pendiente_revision", label: "Pendiente revisión", description: "Quedan a la espera de aprobación manual." },
  { value: "aprobado", label: "Aprobado", description: "Aprobados pero sin confirmar asistencia ni QR." },
  { value: "pendiente_confirmacion", label: "Pendiente confirmación", description: "Aprobados, esperando que confirmen para emitir QR." },
  { value: "confirmado", label: "Confirmado (genera QR)", description: "Confirmados directamente. Se genera ticket y QR." },
  { value: "lista_espera", label: "Lista de espera", description: "Aparecen en la lista de espera del evento." },
];

export const DEFAULT_ATTENDEE_TYPE: AttendeeType = "publico";

export type DuplicateStrategy = "skip" | "update_person" | "new_participation";

export const DUPLICATE_STRATEGIES: { value: DuplicateStrategy; label: string; description: string }[] = [
  { value: "skip", label: "Saltar duplicados", description: "No importar filas cuya persona ya existe." },
  { value: "update_person", label: "Actualizar persona global", description: "Actualizar datos de la persona y crear participación si no existe en este evento/sesión." },
  { value: "new_participation", label: "Crear participación nueva", description: "Reutilizar persona existente y crear una nueva participación, aunque ya exista en otro evento/sesión." },
];

/** Auto-detect a target field from a header name. */
export function guessTarget(header: string): TargetField | null {
  const h = header.toLowerCase().trim().replace(/[._-]/g, " ");
  const map: Record<string, TargetField> = {
    nombre: "first_name",
    "nombre completo": "first_name",
    "first name": "first_name",
    "first": "first_name",
    apellido: "last_name",
    apellidos: "last_name",
    surname: "last_name",
    "last name": "last_name",
    "last": "last_name",
    dni: "dni",
    nie: "dni",
    pasaporte: "dni",
    passport: "dni",
    "dni nie": "dni",
    "dni/nie": "dni",
    documento: "dni",
    "documento identidad": "dni",
    "documento de identidad": "dni",
    email: "email",
    "correo": "email",
    "correo electronico": "email",
    "correo electrónico": "email",
    "e mail": "email",
    mail: "email",
    telefono: "phone",
    teléfono: "phone",
    movil: "phone",
    móvil: "phone",
    phone: "phone",
    "numero de telefono": "phone",
    "número de teléfono": "phone",
    "numero telefono": "phone",
    tel: "phone",
    whatsapp: "phone",
    "fecha nacimiento": "birth_date",
    "fecha de nacimiento": "birth_date",
    nacimiento: "birth_date",
    birthdate: "birth_date",
    ciudad: "city",
    poblacion: "city",
    población: "city",
    provincia: "province",
    genero: "gender",
    género: "gender",
    sexo: "gender",
    profesion: "profession",
    profesión: "profession",
    ocupacion: "profession",
    foto: "photo_url",
    "foto url": "photo_url",
    instagram: "instagram",
    ig: "instagram",
    tiktok: "tiktok",
    tt: "tiktok",
    notas: "notes",
    observaciones: "notes",
    comentarios: "notes",
    tipo: "attendee_type",
    "tipo asistente": "attendee_type",
    estado: "initial_status",
    status: "initial_status",
    acompanantes: "companions_count",
    acompañantes: "companions_count",
    companions: "companions_count",
  };
  return map[h] ?? null;
}