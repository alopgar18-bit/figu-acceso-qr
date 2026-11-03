import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { runCommitChunk } from "./import-commit.server";

const rowSchema = z.object({
  rowIndex: z.number().int().min(0),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().max(150).optional().nullable(),
  dni: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  profession: z.string().trim().max(150).optional().nullable(),
  photo_url: z.string().trim().max(500).optional().nullable(),
  instagram: z.string().trim().max(150).optional().nullable(),
  tiktok: z.string().trim().max(150).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  attendee_type: z
    .enum(["publico", "figurante", "casting", "vip", "prensa", "equipo", "acompanante", "otro"])
    .optional(),
  initial_status: z
    .enum([
      "pendiente_revision",
      "lista_espera",
      "rechazado",
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "confirmado",
      "acceso_validado",
    ])
    .optional(),
  companions_count: z.number().int().min(0).max(20).optional(),
  seat_zone: z.string().trim().max(40).optional().nullable(),
  seat_row: z.string().trim().max(20).optional().nullable(),
  seat_number: z.string().trim().max(20).optional().nullable(),
  /**
   * Rol de la fila dentro del Excel. Por defecto `titular`.
   * Los acompañantes NO crean participación propia: se ligan al
   * `event_participants` del titular resuelto y viven en `companions`.
   */
  role: z.enum(["titular", "acompanante"]).optional(),
  /** Nombre completo del titular declarado en la columna "Solicitante (Titular)". */
  titular_full_name: z.string().trim().max(200).optional().nullable(),
  /**
   * Índice de grupo asignado por el parser. Todas las filas del mismo
   * grupo (titular + N acompañantes contiguos) comparten `group_index`.
   * Se usa como último fallback para vincular acompañante ↔ titular.
   */
  group_index: z.number().int().min(0).optional(),
});

const commitSchema = z.object({
  filename: z.string().min(1).max(255),
  source: z.string().max(120).optional().nullable(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  defaultStatus: z.enum([
    "pendiente_revision",
    "lista_espera",
    "rechazado",
    "aceptado_pendiente_envio",
    "invitacion_enviada",
    "confirmado",
    "acceso_validado",
  ]),
  defaultAttendeeType: z
    .enum(["publico", "figurante", "casting", "vip", "prensa", "equipo", "acompanante", "otro"])
    .default("publico"),
  duplicateStrategy: z.enum(["skip", "update_person", "new_participation", "suffix_distinct"]),
  mappings: z
    .array(
      z.object({
        source_column: z.string().min(1).max(200),
        target_field: z.string().min(1).max(80),
        transform: z.string().max(120).nullable().optional(),
      }),
    )
    .max(60),
  rows: z.array(rowSchema).min(1).max(5000),
  /**
   * Acción explícita por fila decidida en el paso "Análisis". Cuando viene,
   * sobreescribe la estrategia global (`duplicateStrategy`) para esa fila.
   * La clave es `rowIndex` (mismo valor que `rowSchema.rowIndex`).
   */
  perRowActions: z
    .record(
      z.string(),
      z.enum(["update", "create_here", "create_bis", "skip", "create_new"]),
    )
    .optional(),
  /**
   * Importación por tramos: el navegador envía las filas en bloques pequeños
   * para no superar los límites de tiempo/peticiones del servidor.
   * - Primer tramo: sin batchId (crea el lote) y con totalRows = total del Excel.
   * - Siguientes: con el batchId devuelto.
   * - isFinal marca el último tramo (cierra el lote).
   * Sin estos campos se comporta como antes (un solo tramo final).
   */
  batchId: z.string().uuid().optional(),
  totalRows: z.number().int().min(1).max(5000).optional(),
  isFinal: z.boolean().optional(),
});

export type CommitInput = z.infer<typeof commitSchema>;

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await requireRole(supabase, userId, ["superadmin", "admin_figurarte", "coordinador"]);
    const actorEmail = (claims as { email?: string } | undefined)?.email ?? null;
    return runCommitChunk(supabase, userId, actorEmail, data);
  });

// ============================================================
// Audit backfill: rellena import_row_results para un batch
// histórico a partir de las filas del Excel original.
// No modifica event_participants ni tickets — sólo audita.
// ============================================================

const backfillSchema = z.object({
  batchId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        rowIndex: z.number().int().min(0),
        first_name: z.string().trim().min(1).max(120),
        last_name: z.string().trim().max(150).optional().nullable(),
        raw: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(10000),
});

export const backfillBatchRowResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => backfillSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, ["superadmin", "admin_figurarte"]);

    const { data: batch, error: bErr } = await supabase
      .from("import_batches")
      .select("id, session_id, event_id, created_at, completed_at")
      .eq("id", data.batchId)
      .single();
    if (bErr || !batch) throw new Error("Lote no encontrado");
    if (!batch.session_id) throw new Error("El lote no tiene sesión asociada");
    if (!batch.event_id) throw new Error("El lote no tiene evento asociado");

    // Wipe any previous backfill for this batch so re-runs are idempotent.
    await supabase.from("import_row_results").delete().eq("batch_id", data.batchId);

    const normalize = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const nameKey = (f?: string | null, l?: string | null) =>
      `${normalize(f)}|${normalize(l)}`;

    // Carga TODAS las participaciones del evento + sus sesiones para poder
    // decir si una persona quedó en otra sesión distinta a la del batch.
    const { data: roster } = await supabase
      .from("event_participants")
      .select(
        "id, session_id, import_batch_id, created_at, people:person_id(first_name, last_name), event_sessions:session_id(name)",
      )
      .eq("event_id", batch.event_id);
    type RosterEntry = {
      id: string;
      session_id: string | null;
      session_name: string | null;
      import_batch_id: string | null;
      created_at: string | null;
    };
    const byName = new Map<string, RosterEntry[]>();
    for (const ep of roster ?? []) {
      const ppl = ep.people as { first_name?: string | null; last_name?: string | null } | null;
      if (!ppl) continue;
      const sess = ep.event_sessions as { name?: string | null } | null;
      const key = nameKey(ppl.first_name, ppl.last_name);
      const entry: RosterEntry = {
        id: ep.id as string,
        session_id: (ep.session_id as string | null) ?? null,
        session_name: sess?.name ?? null,
        import_batch_id: (ep.import_batch_id as string | null) ?? null,
        created_at: (ep.created_at as string | null) ?? null,
      };
      const arr = byName.get(key);
      if (arr) arr.push(entry);
      else byName.set(key, [entry]);
    }

    // Personas que existen pero no tienen ninguna participación en el evento.
    const allNames = data.rows.map((r) => nameKey(r.first_name, r.last_name));
    const missingNames = allNames.filter((k) => !byName.has(k));
    const personByName = new Map<string, string>();
    if (missingNames.length > 0) {
      // Sondeo en bloque (limitado para no inflar la consulta): obtenemos
      // personas con esos nombres y vemos si tienen alguna participación.
      const firstParts = Array.from(
        new Set(missingNames.map((k) => k.split("|")[0]).filter(Boolean)),
      ).slice(0, 500);
      if (firstParts.length > 0) {
        const { data: candidatePeople } = await supabase
          .from("people")
          .select("id, first_name, last_name")
          .in("first_name", firstParts as string[]);
        for (const p of candidatePeople ?? []) {
          personByName.set(
            nameKey(p.first_name as string, p.last_name as string | null),
            p.id as string,
          );
        }
      }
    }

    const batchStart = batch.created_at ? new Date(batch.created_at).getTime() : 0;
    const batchEnd = batch.completed_at
      ? new Date(batch.completed_at).getTime() + 60_000 // +1 min de margen
      : Date.now();

    type Outcome =
      | "inserted_in_session"
      | "updated_in_session"
      | "updated_in_other_session"
      | "person_exists_no_participation"
      | "not_found"
      | "errored";

    const results: Array<{
      batch_id: string;
      row_number: number;
      outcome: Outcome;
      participant_id: string | null;
      match_reason: string | null;
      error_message: string | null;
      raw_row: unknown;
    }> = [];

    const tally: Record<Outcome, number> = {
      inserted_in_session: 0,
      updated_in_session: 0,
      updated_in_other_session: 0,
      person_exists_no_participation: 0,
      not_found: 0,
      errored: 0,
    };

    for (const r of data.rows) {
      const key = nameKey(r.first_name, r.last_name);
      const matches = byName.get(key);
      const raw = r.raw ?? { first_name: r.first_name, last_name: r.last_name };
      if (!matches || matches.length === 0) {
        const personId = personByName.get(key);
        if (personId) {
          tally.person_exists_no_participation++;
          results.push({
            batch_id: data.batchId,
            row_number: r.rowIndex,
            outcome: "person_exists_no_participation",
            participant_id: null,
            match_reason: "La persona existe en la base, pero sin participación en este evento",
            error_message: null,
            raw_row: raw,
          });
        } else {
          tally.not_found++;
          results.push({
            batch_id: data.batchId,
            row_number: r.rowIndex,
            outcome: "not_found",
            participant_id: null,
            match_reason: null,
            error_message: "Nombre+apellido no encontrado en el evento",
            raw_row: raw,
          });
        }
        continue;
      }

      // Preferimos participación en la sesión del batch; si no, la primera del evento.
      const inSession = matches.find((m) => m.session_id === batch.session_id);
      const target = inSession ?? matches[0];
      const createdMs = target.created_at ? new Date(target.created_at).getTime() : 0;
      const wasCreatedByThisBatch =
        target.import_batch_id === data.batchId &&
        createdMs >= batchStart &&
        createdMs <= batchEnd;

      if (inSession) {
        if (wasCreatedByThisBatch) {
          tally.inserted_in_session++;
          results.push({
            batch_id: data.batchId,
            row_number: r.rowIndex,
            outcome: "inserted_in_session",
            participant_id: inSession.id,
            match_reason: "Creada por este lote en la sesión correcta",
            error_message: null,
            raw_row: raw,
          });
        } else {
          tally.updated_in_session++;
          results.push({
            batch_id: data.batchId,
            row_number: r.rowIndex,
            outcome: "updated_in_session",
            participant_id: inSession.id,
            match_reason: "Ya existía en la sesión y este lote la re-etiquetó",
            error_message: null,
            raw_row: raw,
          });
        }
      } else {
        // No está en la sesión del batch pero sí en otra(s) del evento.
        tally.updated_in_other_session++;
        const sessionsTxt = matches
          .map((m) => m.session_name ?? m.session_id ?? "?")
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ");
        results.push({
          batch_id: data.batchId,
          row_number: r.rowIndex,
          outcome: "updated_in_other_session",
          participant_id: target.id,
          match_reason: `La persona figura en otra sesión del evento: ${sessionsTxt}`,
          error_message: null,
          raw_row: raw,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < results.length; i += CHUNK) {
      const { error } = await supabase
        .from("import_row_results")
        .insert(results.slice(i, i + CHUNK) as never);
      if (error) throw new Error(`No se pudo guardar la auditoría: ${error.message}`);
    }

    return {
      total: data.rows.length,
      inserted: tally.inserted_in_session,
      updated_in_session: tally.updated_in_session,
      updated_in_other_session: tally.updated_in_other_session,
      person_exists_no_participation: tally.person_exists_no_participation,
      not_found: tally.not_found,
    };
  });

// ============================================================
// Lista de resultados fila a fila para la UI del detalle.
// ============================================================

export const getImportBatchRowResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("import_row_results")
      .select(
        "id, row_number, outcome, participant_id, match_reason, error_message, raw_row, event_participants:participant_id(id, people:person_id(first_name, last_name, email, phone))",
      )
      .eq("batch_id", data.batchId)
      .order("row_number", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============================================================
// Análisis previo de duplicados — sin escribir en la base.
// Clasifica cada fila en A/B/C/D y devuelve la coincidencia
// existente para que el usuario decida qué hacer con cada bloque.
// ============================================================

const analyzeSchema = z.object({
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        rowIndex: z.number().int().min(0),
        first_name: z.string().trim().min(1).max(120),
        last_name: z.string().trim().max(150).optional().nullable(),
        dni: z.string().trim().max(30).optional().nullable(),
        email: z.string().trim().max(255).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
      }),
    )
    .min(1)
    .max(10000),
});

export const analyzeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => analyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);

    const normStr = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const normDni = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toUpperCase().replace(/[\s-]/g, "");
    const normEmail = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase();
    const normPhone = (s: string | null | undefined) => {
      const d = (s ?? "").toString().replace(/\D/g, "");
      return d.length >= 9 ? d.slice(-9) : d;
    };
    const nameKey = (f: string | null | undefined, l: string | null | undefined) =>
      `${normStr(f)}|${normStr(l)}`;

    // AISLAMIENTO POR SESIÓN: sólo miramos el roster de la sesión destino.
    // Las coincidencias en otras sesiones del evento se ignoran a efectos de
    // duplicado (se tratan como participantes nuevos con VIS si el DNI ya
    // existe en otra sesión).
    const { data: roster } = await supabase
      .from("event_participants")
      .select(
        "id, session_id, status, person_id, people:person_id(first_name, last_name, dni, email, phone), event_sessions:session_id(name), tickets(id)",
      )
      .eq("session_id", data.sessionId);

    // DNIs del Excel que ya están asociados a participantes en OTRA sesión
    // del mismo evento — se etiquetan como aviso en el bloque A.
    const rowDnisAn = new Set<string>();
    for (const r of data.rows) {
      const d = normDni(r.dni);
      if (d) rowDnisAn.add(d);
    }
    const dniInOtherSess = new Set<string>();
    if (rowDnisAn.size > 0) {
      const arrDn = [...rowDnisAn];
      const CH = 200;
      for (let i = 0; i < arrDn.length; i += CH) {
        const slice = arrDn.slice(i, i + CH);
        const { data: ppl } = await supabase
          .from("people")
          .select("id, dni")
          .in("dni", slice as string[]);
        const idByDni = new Map<string, string>();
        for (const p of ppl ?? []) {
          const k = normDni(p.dni as string | null);
          if (k) idByDni.set(k, p.id as string);
        }
        const ids = [...idByDni.values()];
        if (ids.length === 0) continue;
        for (let j = 0; j < ids.length; j += CH) {
          const idsChunk = ids.slice(j, j + CH);
          const { data: parts } = await supabase
            .from("event_participants")
            .select("person_id, session_id")
            .eq("event_id", data.eventId)
            .in("person_id", idsChunk as string[]);
          for (const pp of parts ?? []) {
            if ((pp.session_id as string) === data.sessionId) continue;
            for (const [dni, pid] of idByDni.entries()) {
              if (pid === (pp.person_id as string)) dniInOtherSess.add(dni);
            }
          }
        }
      }
    }

    type RosterEntry = {
      participantId: string;
      sessionId: string;
      sessionName: string | null;
      personId: string;
      status: string | null;
      hasTicket: boolean;
    };
    const byDni = new Map<string, RosterEntry[]>();
    const byName = new Map<string, RosterEntry[]>();
    const push = (m: Map<string, RosterEntry[]>, k: string, e: RosterEntry) => {
      if (!k) return;
      const a = m.get(k);
      if (a) a.push(e);
      else m.set(k, [e]);
    };
    for (const ep of roster ?? []) {
      const ppl = ep.people as {
        first_name?: string | null;
        last_name?: string | null;
        dni?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
      if (!ppl) continue;
      const sess = ep.event_sessions as { name?: string | null } | null;
      const tk = ep.tickets as { id: string }[] | null;
      const entry: RosterEntry = {
        participantId: ep.id as string,
        sessionId: (ep.session_id as string | null) ?? "",
        sessionName: sess?.name ?? null,
        personId: ep.person_id as string,
        status: (ep.status as string | null) ?? null,
        hasTicket: Array.isArray(tk) && tk.length > 0,
      };
      push(byDni, normDni(ppl.dni), entry);
      push(byName, nameKey(ppl.first_name, ppl.last_name), entry);
    }

    // (Bloque D eliminado: el aislamiento por sesión ya no reutiliza
    // personas fuera del evento — las filas nuevas quedan en el bloque A.)

    type Block = "A" | "B" | "C" | "D";
    type MatchReason = "dni" | "name" | null;
    type RowAnalysis = {
      rowIndex: number;
      block: Block;
      match_reason: MatchReason;
      existing: {
        participantId?: string;
        personId?: string;
        sessionId?: string | null;
        sessionName?: string | null;
        status?: string | null;
        hasTicket?: boolean;
      } | null;
      dni_in_other_session?: boolean;
    };

    const analyses: RowAnalysis[] = [];
    const counts = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      B_with_ticket: 0,
      C_with_ticket: 0,
    };

    for (const r of data.rows) {
      const dni = normDni(r.dni);
      const nk = nameKey(r.first_name, r.last_name);
      const dniHit = dni ? byDni.get(dni) : undefined;
      const nameHit = byName.get(nk);
      const hit = dniHit?.[0] ?? nameHit?.[0];
      const reason: MatchReason = dniHit ? "dni" : nameHit ? "name" : null;

      if (hit) {
        // Coincidencia dentro de la sesión destino → Bloque B.
        analyses.push({
          rowIndex: r.rowIndex,
          block: "B",
          match_reason: reason,
          existing: {
            participantId: hit.participantId,
            personId: hit.personId,
            sessionId: hit.sessionId,
            sessionName: hit.sessionName,
            status: hit.status,
            hasTicket: hit.hasTicket,
          },
        });
        counts.B++;
        if (hit.hasTicket) counts.B_with_ticket++;
      } else {
        // Bloque A: fila nueva para esta sesión. Marcamos si el DNI ya está
        // usado en otra sesión del evento (se importará como VIS).
        analyses.push({
          rowIndex: r.rowIndex,
          block: "A",
          match_reason: null,
          existing: null,
          dni_in_other_session: dni ? dniInOtherSess.has(dni) : false,
        });
        counts.A++;
      }
    }

    return { rows: analyses, counts };
  });

// ============================================================
// Reparar un lote ya importado sin volver a subir el Excel.
// - Recupera filas absorbidas por email/teléfono (algoritmo antiguo)
//   creando participaciones independientes cuando el nombre real
//   del raw_row no coincide con el participante enlazado.
// - Re-etiqueta con import_batch_id todas las participaciones
//   asociadas a las filas del lote.
// - Emite QR pendientes en estados con entrada (regla de no
//   degradación). Idempotente.
// ============================================================

const repairSchema = z.object({ batchId: z.string().uuid() });

export const repairImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => repairSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, ["superadmin", "admin_figurarte"]);

    const { data: batch, error: bErr } = await supabase
      .from("import_batches")
      .select("id, event_id, session_id, filename, source")
      .eq("id", data.batchId)
      .single();
    if (bErr || !batch) throw new Error("Lote no encontrado");
    if (!batch.event_id || !batch.session_id)
      throw new Error("El lote no tiene evento o sesión asociados");

    const eventId = batch.event_id as string;
    const sessionId = batch.session_id as string;

    const normalize = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const nameKey = (f?: string | null, l?: string | null) =>
      `${normalize(f)}|${normalize(l)}`;
    const normDni = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toUpperCase().replace(/[\s-]/g, "");

    const RANK: Record<string, number> = {
      rechazado: 0,
      lista_espera: 1,
      pendiente_revision: 2,
      aceptado_pendiente_envio: 3,
      invitacion_enviada: 4,
      confirmado: 5,
      acceso_validado: 6,
    };
    const rank = (s: string | null | undefined) => (s && s in RANK ? RANK[s] : -1);
    const QR_STATES = new Set([
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "confirmado",
      "acceso_validado",
    ]);

    // 1. Cargar filas originales del lote
    const { data: rowsRaw, error: rErr } = await supabase
      .from("import_row_results")
      .select("id, row_number, participant_id, raw_row")
      .eq("batch_id", data.batchId)
      .order("row_number", { ascending: true });
    if (rErr) throw new Error(`No se pudieron leer las filas del lote: ${rErr.message}`);
    const rows = rowsRaw ?? [];
    if (rows.length === 0) {
      return { total: 0, recovered: 0, tagged: 0, ticketsCreated: 0, rowResultsFixed: 0 };
    }

    // 2. Roster actual de la sesión, indexado por nombre y persona
    const { data: sessionRoster } = await supabase
      .from("event_participants")
      .select(
        "id, person_id, status, import_batch_id, people:person_id(first_name, last_name, dni)",
      )
      .eq("session_id", sessionId);
    type RosterEntry = {
      participantId: string;
      personId: string;
      status: string | null;
      importBatchId: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    const rosterByName = new Map<string, RosterEntry>();
    const rosterByDni = new Map<string, RosterEntry>();
    const rosterByParticipantId = new Map<string, RosterEntry>();
    for (const ep of sessionRoster ?? []) {
      const ppl = ep.people as {
        first_name?: string | null;
        last_name?: string | null;
        dni?: string | null;
      } | null;
      const entry: RosterEntry = {
        participantId: ep.id as string,
        personId: ep.person_id as string,
        status: (ep.status as string | null) ?? null,
        importBatchId: (ep.import_batch_id as string | null) ?? null,
        firstName: ppl?.first_name ?? null,
        lastName: ppl?.last_name ?? null,
      };
      rosterByParticipantId.set(entry.participantId, entry);
      if (ppl) {
        rosterByName.set(nameKey(ppl.first_name, ppl.last_name), entry);
        const d = normDni(ppl.dni);
        if (d) rosterByDni.set(d, entry);
      }
    }

    // 3. Preload plan seats para bloquear asientos existentes
    let planSeatKeys: Set<string> | null = null;
    const { data: sessionRow } = await supabase
      .from("event_sessions")
      .select("venue_plan_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionRow?.venue_plan_id) {
      const { data: planSeats } = await supabase
        .from("venue_seats")
        .select("row_label, seat_number, venue_zones!inner(name)")
        .eq("plan_id", sessionRow.venue_plan_id);
      planSeatKeys = new Set(
        (planSeats ?? []).map((s: any) =>
          `${(s.venue_zones?.name ?? "").trim().toLowerCase()}|${String(s.row_label).trim().toLowerCase()}|${String(s.seat_number).trim().toLowerCase()}`,
        ),
      );
    }
    const seatExistsInPlan = (
      zone?: string | null,
      row?: string | null,
      num?: string | null,
    ) => {
      if (!planSeatKeys || !zone || !row || !num) return false;
      return planSeatKeys.has(
        `${zone.trim().toLowerCase()}|${row.trim().toLowerCase()}|${num.trim().toLowerCase()}`,
      );
    };

    async function findPersonIdByDni(rawDni: string | null | undefined): Promise<string | null> {
      const raw = (rawDni ?? "").toString().trim();
      if (!raw) return null;
      const stripped = normDni(raw);
      if (!stripped) return null;
      const withHyphen = stripped.replace(/^(\d{5,10})([A-Z])$/, "$1-$2");
      const variants = Array.from(new Set([raw, stripped, withHyphen].filter(Boolean)));
      const { data: ps } = await supabase
        .from("people")
        .select("id")
        .in("dni", variants as string[])
        .limit(1);
      return ps && ps.length > 0 ? (ps[0].id as string) : null;
    }

    function genToken(): string {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    let recovered = 0;
    let tagged = 0;
    let ticketsCreated = 0;
    let rowResultsFixed = 0;
    let skipped = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    type Raw = {
      first_name?: string;
      last_name?: string | null;
      dni?: string | null;
      email?: string | null;
      phone?: string | null;
      birth_date?: string | null;
      city?: string | null;
      province?: string | null;
      gender?: string | null;
      notes?: string | null;
      attendee_type?: string | null;
      initial_status?: string | null;
      companions_count?: number | null;
      seat_zone?: string | null;
      seat_row?: string | null;
      seat_number?: string | null;
    };

    async function ensureTicket(
      participantId: string,
      status: string | null | undefined,
    ): Promise<void> {
      if (!status || !QR_STATES.has(status)) return;
      const { data: existing } = await supabase
        .from("tickets")
        .select("id")
        .eq("participant_id", participantId)
        .limit(1);
      if (existing && existing.length > 0) return;
      const token = genToken();
      const { error: tErr } = await supabase.from("tickets").insert({
        event_id: eventId,
        session_id: sessionId,
        participant_id: participantId,
        qr_token: token,
        qr_payload: {
          token,
          event_id: eventId,
          session_id: sessionId,
          participant_id: participantId,
        },
      });
      if (tErr) throw new Error(`No se pudo crear el ticket (${tErr.message})`);
      ticketsCreated++;
    }

    for (const rr of rows) {
      try {
        const raw = (rr.raw_row ?? {}) as Raw;
        const rawFirst = raw.first_name ?? "";
        const rawLast = raw.last_name ?? null;
        if (!rawFirst) {
          skipped++;
          continue;
        }
        const rowNameKey = nameKey(rawFirst, rawLast);
        const rowDni = normDni(raw.dni);
        const desiredStatus = (raw.initial_status ?? null) as string | null;

        // ¿Está ya bien enlazado?
        const linked = rr.participant_id
          ? rosterByParticipantId.get(rr.participant_id as string)
          : undefined;
        const linkedMatches =
          linked && nameKey(linked.firstName, linked.lastName) === rowNameKey;

        // Búsqueda del participante correcto por nombre o DNI en la sesión
        const correct =
          rosterByName.get(rowNameKey) ??
          (rowDni ? rosterByDni.get(rowDni) : undefined);

        if (linkedMatches && linked) {
          // Sólo asegurar tag + QR
          if (linked.importBatchId !== data.batchId) {
            await supabase
              .from("event_participants")
              .update({ import_batch_id: data.batchId })
              .eq("id", linked.participantId);
            linked.importBatchId = data.batchId;
            tagged++;
          }
          await ensureTicket(linked.participantId, linked.status);
          continue;
        }

        if (correct) {
          // La fila estaba mal enlazada (o sin enlazar) pero existe el
          // participante correcto: reasignar row_result y re-etiquetar.
          if (rr.participant_id !== correct.participantId) {
            await supabase
              .from("import_row_results")
              .update({
                participant_id: correct.participantId,
                outcome: "updated",
                match_reason:
                  "reparación: fila reasignada al participante correcto por nombre/DNI",
              })
              .eq("id", rr.id);
            rowResultsFixed++;
          }
          if (correct.importBatchId !== data.batchId) {
            await supabase
              .from("event_participants")
              .update({ import_batch_id: data.batchId })
              .eq("id", correct.participantId);
            correct.importBatchId = data.batchId;
            tagged++;
          }
          await ensureTicket(correct.participantId, correct.status);
          continue;
        }

        // No existe → crear persona (con VIS si colisiona por nombre en la
        // sesión) + participación + QR.
        let personId: string | null = null;
        if (rowDni) personId = await findPersonIdByDni(raw.dni);

        let workingFirst = rawFirst;
        let workingLast = rawLast;
        let workingKey = rowNameKey;

        // Si el nombre ya está en la sesión pero apuntando a otra persona,
        // aplicar sufijo VIS N.
        if (rosterByName.has(workingKey)) {
          const baseLast = (rawLast ?? "").trim();
          let n = 2;
          while (rosterByName.has(nameKey(rawFirst, `${baseLast} VIS ${n}`.trim()))) n++;
          workingLast = `${baseLast} VIS ${n}`.trim();
          workingKey = nameKey(workingFirst, workingLast);
          personId = null; // fuerza persona nueva sin DNI para no colisionar
        }

        if (!personId) {
          const { data: created, error: pErr } = await supabase
            .from("people")
            .insert({
              first_name: workingFirst,
              last_name: workingLast,
              // Omitimos DNI si aplicamos VIS o si no hay DNI válido
              dni:
                workingLast !== rawLast
                  ? null
                  : raw.dni ?? null,
              email: raw.email ?? null,
              phone: raw.phone ?? null,
              birth_date: raw.birth_date ?? null,
              city: raw.city ?? null,
              province: raw.province ?? null,
              gender: raw.gender ?? null,
              notes: raw.notes ?? null,
              source: batch.source ?? `import:${batch.filename ?? "repair"}`,
              created_by: userId,
            })
            .select("id")
            .single();
          if (pErr) {
            // Colisión DNI: reutilizar persona existente.
            if (
              pErr.code === "23505" &&
              raw.dni &&
              workingLast === rawLast
            ) {
              const found = await findPersonIdByDni(raw.dni);
              if (found) personId = found;
              else throw new Error(`No se pudo crear persona (${pErr.message})`);
            } else {
              throw new Error(`No se pudo crear persona (${pErr.message})`);
            }
          } else {
            personId = created.id as string;
          }
        }

        // Crear participación con no-degradación si ya existiera (carrera)
        const status = desiredStatus ?? "pendiente_revision";
        const approvedLike =
          status !== "pendiente_revision" &&
          status !== "lista_espera" &&
          status !== "rechazado";
        const nowIso = new Date().toISOString();

        const insertPayload = {
          event_id: eventId,
          session_id: sessionId,
          person_id: personId!,
          status: status as never,
          attendee_type: (raw.attendee_type ?? "publico") as never,
          companions_count: raw.companions_count ?? 0,
          approved_by: approvedLike ? userId : null,
          approved_at: approvedLike ? nowIso : null,
          confirmed_at:
            status === "confirmado" || status === "acceso_validado" ? nowIso : null,
          import_batch_id: data.batchId,
          seat_zone: raw.seat_zone ?? null,
          seat_row: raw.seat_row ?? null,
          seat_number: raw.seat_number ?? null,
          seat_locked: seatExistsInPlan(raw.seat_zone, raw.seat_row, raw.seat_number),
        };

        let newParticipantId: string | null = null;
        let finalStatus = status;
        const { data: partRow, error: partErr } = await supabase
          .from("event_participants")
          .insert(insertPayload)
          .select("id, status")
          .single();
        if (partErr) {
          if (partErr.code === "23505") {
            const { data: existing } = await supabase
              .from("event_participants")
              .select("id, status")
              .eq("session_id", sessionId)
              .eq("person_id", personId!)
              .maybeSingle();
            if (existing) {
              const curr = (existing.status as string) ?? status;
              finalStatus = rank(curr) >= rank(status) ? curr : status;
              await supabase
                .from("event_participants")
                .update({
                  status: finalStatus as never,
                  import_batch_id: data.batchId,
                })
                .eq("id", existing.id as string);
              newParticipantId = existing.id as string;
            } else {
              throw new Error(`No se pudo crear participación (${partErr.message})`);
            }
          } else {
            throw new Error(`No se pudo crear participación (${partErr.message})`);
          }
        } else {
          newParticipantId = partRow.id as string;
          finalStatus = (partRow.status as string) ?? status;
        }

        if (!newParticipantId) continue;

        // Registrar en roster para no repetir en siguientes filas
        const newEntry: RosterEntry = {
          participantId: newParticipantId,
          personId: personId!,
          status: finalStatus,
          importBatchId: data.batchId,
          firstName: workingFirst,
          lastName: workingLast,
        };
        rosterByParticipantId.set(newParticipantId, newEntry);
        rosterByName.set(workingKey, newEntry);
        if (rowDni) rosterByDni.set(rowDni, newEntry);

        // Actualizar el row_result para apuntar al nuevo participante
        await supabase
          .from("import_row_results")
          .update({
            participant_id: newParticipantId,
            outcome: "inserted",
            match_reason:
              workingLast !== rawLast
                ? "reparación: creado con sufijo VIS por colisión de nombre"
                : "reparación: creado (fila absorbida por email/teléfono en el algoritmo antiguo)",
          })
          .eq("id", rr.id);
        recovered++;
        rowResultsFixed++;

        await ensureTicket(newParticipantId, finalStatus);
      } catch (err) {
        errors.push({
          row: rr.row_number as number,
          reason: err instanceof Error ? err.message : "error",
        });
      }
    }

    // Recalcular imported_rows del lote como nº real de participantes vinculados
    const { count: linkedCount } = await supabase
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", data.batchId);

    if (typeof linkedCount === "number") {
      await supabase
        .from("import_batches")
        .update({ imported_rows: linkedCount })
        .eq("id", data.batchId);
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "import_batch.repair",
      entity_type: "import_batch",
      entity_id: data.batchId,
      event_id: eventId,
      session_id: sessionId,
      changes: {
        total_rows: rows.length,
        recovered,
        tagged,
        tickets_created: ticketsCreated,
        row_results_fixed: rowResultsFixed,
        skipped,
        errors: errors.slice(0, 50),
        linked_count: linkedCount ?? null,
      },
    });

    return {
      total: rows.length,
      recovered,
      tagged,
      ticketsCreated,
      rowResultsFixed,
      skipped,
      errors,
      linkedCount: linkedCount ?? null,
    };
  });
