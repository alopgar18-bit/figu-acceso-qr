import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CommitInput } from "./imports.functions";

/**
 * Núcleo de la importación de un tramo de filas. Se usa tanto desde la
 * petición directa del navegador como desde la cola de tramos en segundo
 * plano (import-queue.server.ts), para que ambos caminos sean idénticos.
 */
function genToken(): string {
  // 32-char URL-safe token
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runCommitChunk(
  supabase: SupabaseClient<Database>,
  userId: string,
  actorEmail: string | null,
  data: CommitInput,
) {

    // 1. Crear lote (primer tramo) o reutilizar el existente (tramos siguientes)
    const isFinal = data.isFinal ?? !data.batchId;
    let batch: { id: string; imported_rows: number; error_rows: number; errors: unknown };
    if (data.batchId) {
      const { data: existing, error: exErr } = await supabase
        .from("import_batches")
        .select("id, session_id, imported_rows, error_rows, errors")
        .eq("id", data.batchId)
        .single();
      if (exErr || !existing) throw new Error("No se encontró el lote de importación en curso.");
      if (existing.session_id !== data.sessionId) throw new Error("El lote no corresponde a esta sesión.");
      batch = existing;
    } else {
      const { data: created, error: batchErr } = await supabase
        .from("import_batches")
        .insert({
          filename: data.filename,
          source: data.source ?? null,
          event_id: data.eventId,
          session_id: data.sessionId,
          total_rows: data.totalRows ?? data.rows.length,
          status: "procesando",
          created_by: userId,
        })
        .select()
        .single();
      if (batchErr) throw new Error(`No se pudo crear el batch: ${batchErr.message}`);
      batch = created;
    }

    // 2. Save mappings (solo en el primer tramo)
    if (!data.batchId && data.mappings.length > 0) {
      await supabase.from("import_mappings").insert(
        data.mappings.map((m) => ({
          batch_id: batch.id,
          source_column: m.source_column,
          target_field: m.target_field,
          transform: m.transform ?? null,
        })),
      );
    }

    const QR_STATES = new Set([
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "confirmado",
      "acceso_validado",
    ]);
    let imported = 0;
    let qrGenerated = 0;
    let noContactChannel = 0;
    let skipped = 0;
    let updated = 0;
    let errored = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const rowResults: Array<{
      batch_id: string;
      row_number: number;
      outcome: "inserted" | "updated" | "skipped" | "errored";
      participant_id: string | null;
      match_reason: string | null;
      error_message: string | null;
      raw_row: unknown;
    }> = [];
    const logRow = (
      row: typeof data.rows[number],
      outcome: "inserted" | "updated" | "skipped" | "errored",
      participantId: string | null,
      matchReason: string | null,
      errorMessage: string | null = null,
    ) => {
      rowResults.push({
        batch_id: batch.id,
        row_number: row.rowIndex,
        outcome,
        participant_id: participantId,
        match_reason: matchReason,
        error_message: errorMessage,
        raw_row: row as unknown,
      });
    };

    // Duplicate detection rule: a row is a duplicate ONLY when first_name +
    // last_name (normalized) match an existing participation in the SAME
    // session. Email / phone collisions are ignored on purpose — it is common
    // for several people in a group to share contact details.
    const normalize = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const nameKey = (first: string | null | undefined, last: string | null | undefined) =>
      `${normalize(first)}|${normalize(last)}`;
    const normDniLocal = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toUpperCase().replace(/[\s-]/g, "");
    // Paginado: sin esto, en sesiones de más de 1.000 inscritos la detección
    // de duplicados solo veía los primeros 1.000.
    const sessionRoster: Array<{ id: string; person_id: string; people: unknown }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: rErr } = await supabase
        .from("event_participants")
        .select("id, person_id, people:person_id(first_name, last_name)")
        .eq("session_id", data.sessionId)
        .order("id")
        .range(from, from + 999);
      if (rErr) throw new Error(`No se pudo leer la sesión: ${rErr.message}`);
      sessionRoster.push(...((page ?? []) as typeof sessionRoster));
      if (!page || page.length < 1000) break;
    }
    const nameToPersonId = new Map<string, string>();
    const sessionPersonIds = new Set<string>();
    for (const ep of sessionRoster ?? []) {
      const ppl = ep.people as { first_name?: string | null; last_name?: string | null } | null;
      if (ep.person_id) sessionPersonIds.add(ep.person_id as string);
      if (!ppl) continue;
      nameToPersonId.set(nameKey(ppl.first_name, ppl.last_name), ep.person_id as string);
    }

    // ------------------------------------------------------------------
    // AISLAMIENTO POR SESIÓN
    // Sólo se mantienen índices scoped a la sesión destino (nombre y DNI).
    // Nunca se reutiliza una persona por DNI si está en OTRA sesión del
    // mismo evento — en ese caso se fuerza VIS N para tratarla como
    // participante nuevo de esta sesión.
    // ------------------------------------------------------------------
    type SessionEntry = { participantId: string; personId: string };
    const sessionByDni = new Map<string, SessionEntry>();
    for (const ep of sessionRoster ?? []) {
      const ppl = ep.people as { first_name?: string | null; last_name?: string | null; dni?: string | null } | null;
      if (!ppl) continue;
      const dK = normDniLocal(ppl.dni);
      if (dK) sessionByDni.set(dK, { participantId: ep.id as string, personId: ep.person_id as string });
    }

    // DNIs ya vinculados a participaciones en OTRAS sesiones del evento.
    // Sólo se consulta si hay al menos un DNI en el Excel.
    const rowDnis = new Set<string>();
    for (const r of data.rows) {
      const d = normDniLocal(r.dni);
      if (d) rowDnis.add(d);
    }
    const dniInOtherSession = new Set<string>();
    if (rowDnis.size > 0) {
      const arr = [...rowDnis];
      const CH = 200;
      for (let i = 0; i < arr.length; i += CH) {
        const slice = arr.slice(i, i + CH);
        const { data: ppl } = await supabase
          .from("people")
          .select("id, dni")
          .in("dni", slice as string[]);
        const idByDni = new Map<string, string>();
        for (const p of ppl ?? []) {
          const k = normDniLocal(p.dni as string | null);
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
              if (pid === (pp.person_id as string)) dniInOtherSession.add(dni);
            }
          }
        }
      }
    }

    // Match ONLY dentro de la sesión destino (por nombre o DNI).
    const resolveSessionMatch = (row: typeof data.rows[number]): SessionEntry | undefined => {
      const d = normDniLocal(row.dni);
      if (d && sessionByDni.has(d)) return sessionByDni.get(d);
      const pid = nameToPersonId.get(nameKey(row.first_name, row.last_name));
      if (pid) {
        // buscar el participantId asociado (puede ser la primera coincidencia)
        for (const ep of sessionRoster ?? []) {
          if ((ep.person_id as string) === pid) return { participantId: ep.id as string, personId: pid };
        }
      }
      return undefined;
    };

    // Load physical plan seats (only if the session has one assigned). The
    // import marks every imported participant whose seat exists in the plan as
    // seat_locked, so the auto-assigner won't move them. Missing seats stay
    // unlocked and surface in the conflicts panel — never block the import.
    let planSeatKeys: Set<string> | null = null;
    let seatsNotInPlan = 0;
    const { data: sessionRow } = await supabase
      .from("event_sessions")
      .select("venue_plan_id")
      .eq("id", data.sessionId)
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
    const seatKeyOf = (zone?: string | null, row?: string | null, num?: string | null) =>
      zone && row && num
        ? `${zone.trim().toLowerCase()}|${row.trim().toLowerCase()}|${num.trim().toLowerCase()}`
        : null;
    const seatExistsInPlan = (zone?: string | null, row?: string | null, num?: string | null) => {
      if (!planSeatKeys) return false;
      const k = seatKeyOf(zone, row, num);
      return k ? planSeatKeys.has(k) : false;
    };

    // ------- helpers para el modo perRowActions -------
    const batchId = batch.id;

    // Estados con entrada (QR) emitida. Nunca se degradan al reimportar.
    const RANK: Record<string, number> = {
      rechazado: 0,
      lista_espera: 1,
      pendiente_revision: 2,
      aceptado_pendiente_envio: 3,
      invitacion_enviada: 4,
      confirmado: 5,
      acceso_validado: 6,
    };
    const rank = (s: string | null | undefined) =>
      (s && s in RANK ? RANK[s] : -1);

    // Busca una persona por DNI probando variantes (con/sin guion, mayúsculas).
    async function findPersonIdByDni(rawDni: string | null | undefined): Promise<string | null> {
      const raw = (rawDni ?? "").toString().trim();
      if (!raw) return null;
      const stripped = normDniLocal(raw);
      if (!stripped) return null;
      const withHyphen = stripped.replace(/^(\d{5,10})([A-Z])$/, "$1-$2");
      const variants = Array.from(new Set([raw, stripped, withHyphen].filter(Boolean)));
      const { data: ps } = await supabase
        .from("people")
        .select("id")
        .in("dni", variants)
        .limit(1);
      return ps && ps.length > 0 ? (ps[0].id as string) : null;
    }

    async function insertNewPerson(
      row: typeof data.rows[number],
      opts: { omitDni?: boolean } = {},
    ): Promise<string> {
      const { data: created, error: pErr } = await supabase
        .from("people")
        .insert({
          first_name: row.first_name,
          last_name: row.last_name ?? null,
          dni: opts.omitDni ? null : (row.dni ?? null),
          email: row.email ?? null,
          phone: row.phone ?? null,
          birth_date: row.birth_date ?? null,
          city: row.city ?? null,
          province: row.province ?? null,
          gender: row.gender ?? null,
          notes: row.notes ?? null,
          source: data.source ?? `import:${data.filename}`,
          created_by: userId,
        })
        .select("id")
        .single();
      if (pErr) {
        // DNI ya existente → reutilizar en vez de fallar.
        if (
          !opts.omitDni &&
          (pErr.code === "23505" || /uq_people_dni|people_dni/.test(pErr.message))
        ) {
          const existing = await findPersonIdByDni(row.dni);
          if (existing) return existing;
        }
        throw new Error(`No se pudo crear la persona (${pErr.message})`);
      }
      return created.id as string;
    }

    async function insertParticipationFor(
      personId: string,
      row: typeof data.rows[number],
    ): Promise<{ id: string; status: string; reused?: boolean }> {
      const status = row.initial_status ?? data.defaultStatus;
      const approvedLike =
        status !== "pendiente_revision" && status !== "lista_espera" && status !== "rechazado";
      const attendeeType = row.attendee_type ?? data.defaultAttendeeType;

      // Si ya existe participación en la sesión: fusionar con regla de no-degradación.
      const { data: existingParticipation } = await supabase
        .from("event_participants")
        .select("id, status, companions_count, seat_zone, seat_row, seat_number")
        .eq("session_id", data.sessionId)
        .eq("person_id", personId)
        .maybeSingle();
      if (existingParticipation) {
        const currentStatus = (existingParticipation.status as typeof status) ?? status;
        // No degradar un estado superior (con entrada) a uno inferior.
        const finalStatus: typeof status =
          rank(currentStatus) >= rank(status) ? currentStatus : status;
        const currComp = (existingParticipation.companions_count as number) ?? 0;
        const finalComp = Math.max(currComp, row.companions_count ?? 0);
        await supabase
          .from("event_participants")
          .update({
            status: finalStatus,
            attendee_type: attendeeType,
            companions_count: finalComp,
            import_batch_id: batchId,
            seat_zone: row.seat_zone?.trim() || existingParticipation.seat_zone || null,
            seat_row: row.seat_row?.trim() || existingParticipation.seat_row || null,
            seat_number: row.seat_number?.trim() || existingParticipation.seat_number || null,
            seat_locked: seatExistsInPlan(
              row.seat_zone ?? existingParticipation.seat_zone as string | null,
              row.seat_row ?? existingParticipation.seat_row as string | null,
              row.seat_number ?? existingParticipation.seat_number as string | null,
            ),
          })
          .eq("id", existingParticipation.id as string);
        if (
          planSeatKeys &&
          row.seat_zone &&
          row.seat_row &&
          row.seat_number &&
          !seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number)
        ) {
          seatsNotInPlan++;
        }
        return {
          id: existingParticipation.id as string,
          status: finalStatus,
          reused: true,
        };
      }

      const { data: participant, error: partErr } = await supabase
        .from("event_participants")
        .insert({
          event_id: data.eventId,
          session_id: data.sessionId,
          person_id: personId,
          status,
          attendee_type: attendeeType,
          companions_count: row.companions_count ?? 0,
          approved_by: approvedLike ? userId : null,
          approved_at: approvedLike ? new Date().toISOString() : null,
          confirmed_at:
            status === "confirmado" || status === "acceso_validado"
              ? new Date().toISOString()
              : null,
          import_batch_id: batchId,
          seat_zone: row.seat_zone ?? null,
          seat_row: row.seat_row ?? null,
          seat_number: row.seat_number ?? null,
          seat_locked: seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number),
        })
        .select("id")
        .single();
      if (partErr) {
        // Carrera: alguien insertó la participación entre el select y el insert.
        // Releemos y aplicamos la misma fusión con no-degradación.
        if (
          partErr.code === "23505" ||
          /duplicate key value/i.test(partErr.message) ||
          /event_participants_session_id_person_id_key/.test(partErr.message)
        ) {
          const { data: existing } = await supabase
            .from("event_participants")
            .select("id, status, companions_count, seat_zone, seat_row, seat_number")
            .eq("session_id", data.sessionId)
            .eq("person_id", personId)
            .maybeSingle();
           if (existing) {
            const currentStatus = (existing.status as typeof status) ?? status;
            const finalStatus: typeof status =
              rank(currentStatus) >= rank(status) ? currentStatus : status;
            const currComp = (existing.companions_count as number) ?? 0;
            const finalComp = Math.max(currComp, row.companions_count ?? 0);
            await supabase
              .from("event_participants")
              .update({
                status: finalStatus,
                companions_count: finalComp,
                import_batch_id: batchId,
                seat_zone: row.seat_zone?.trim() || existing.seat_zone || null,
                seat_row: row.seat_row?.trim() || existing.seat_row || null,
                seat_number: row.seat_number?.trim() || existing.seat_number || null,
                seat_locked: seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number),
              })
              .eq("id", existing.id);
            if (
              planSeatKeys &&
              row.seat_zone &&
              row.seat_row &&
              row.seat_number &&
              !seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number)
            ) {
              seatsNotInPlan++;
            }
            return { id: existing.id as string, status: finalStatus, reused: true };
          }
        }
        throw new Error(`No se pudo crear la participación (${partErr.message})`);
      }
      if (
        planSeatKeys &&
        row.seat_zone &&
        row.seat_row &&
        row.seat_number &&
        !seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number)
      ) {
        seatsNotInPlan++;
      }
      return { id: participant.id as string, status };
    }

    async function maybeGenerateTicketFor(
      participantId: string,
      status: string,
      row: typeof data.rows[number],
    ) {
      if (!QR_STATES.has(status)) return;
      // No duplicar ticket si ya hay uno emitido para este asistente.
      const { data: existingTicket } = await supabase
        .from("tickets")
        .select("id")
        .eq("participant_id", participantId)
        .limit(1);
      if (existingTicket && existingTicket.length > 0) return;
      const token = genToken();
      const { data: ticket, error: tErr } = await supabase
        .from("tickets")
        .insert({
          event_id: data.eventId,
          session_id: data.sessionId,
          participant_id: participantId,
          qr_token: token,
          qr_payload: {
            token,
            event_id: data.eventId,
            session_id: data.sessionId,
            participant_id: participantId,
          },
        })
        .select("id")
        .single();
      if (tErr) throw new Error(`No se pudo crear el ticket (${tErr.message})`);
      qrGenerated++;
      if (status === "acceso_validado") {
        await supabase.from("checkins").insert({
          event_id: data.eventId,
          session_id: data.sessionId,
          participant_id: participantId,
          ticket_id: ticket?.id ?? null,
          validator_id: userId,
          result: "ok",
          companions_validated: row.companions_count ?? 0,
          notes: "Check-in registrado durante importación",
        });
      }
      if (!row.email && !row.phone) noContactChannel++;
    }

    for (const row of data.rows) {
      try {
        // ---- Rama nueva: acción explícita por fila (paso "Análisis") ----
        const explicitAction = data.perRowActions?.[String(row.rowIndex)];
        if (explicitAction) {
          const match = resolveSessionMatch(row);

          if (explicitAction === "skip") {
            skipped++;
            logRow(row, "skipped", match?.participantId ?? null, "acción manual: no importar");
            continue;
          }

          if (explicitAction === "update" && match) {
            await supabase
              .from("people")
              .update({
                first_name: row.first_name,
                last_name: row.last_name ?? null,
                dni: row.dni ?? null,
                email: row.email ?? null,
                phone: row.phone ?? null,
              })
              .eq("id", match.personId);
            await supabase
              .from("event_participants")
              .update({
                import_batch_id: batch.id,
                seat_zone: row.seat_zone?.trim() || null,
                seat_row: row.seat_row?.trim() || null,
                seat_number: row.seat_number?.trim() || null,
                seat_locked: seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number),
              })
              .eq("id", match.participantId);
            // No-degradación de estado y emisión de QR si corresponde.
            {
              const { data: existingPart } = await supabase
                .from("event_participants")
                .select("status")
                .eq("id", match.participantId)
                .maybeSingle();
              const desiredStatus = row.initial_status ?? data.defaultStatus;
              const currentStatus =
                (existingPart?.status as typeof desiredStatus | undefined) ?? desiredStatus;
              const finalStatus =
                rank(currentStatus) >= rank(desiredStatus) ? currentStatus : desiredStatus;
              if (finalStatus !== currentStatus) {
                await supabase
                  .from("event_participants")
                  .update({ status: finalStatus })
                  .eq("id", match.participantId);
              }
              await maybeGenerateTicketFor(match.participantId, finalStatus, row);
            }
            if (
              planSeatKeys &&
              row.seat_zone &&
              row.seat_row &&
              row.seat_number &&
              !seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number)
            ) {
              seatsNotInPlan++;
            }
            updated++;
            logRow(
              row,
              "updated",
              match.participantId,
              "acción manual: actualizar en esta sesión (QR emitido si faltaba)",
            );
            continue;
          }

          if (explicitAction === "create_here" && match) {
            // Reutiliza la persona pero crea nueva participación en la sesión destino.
            const part = await insertParticipationFor(match.personId, row);
            if (part.reused) {
              await maybeGenerateTicketFor(part.id, part.status, row);
              updated++;
              logRow(row, "updated", part.id, "ya existía en la sesión (asiento/lote actualizado, QR emitido si faltaba)");
            } else {
              await maybeGenerateTicketFor(part.id, part.status, row);
              imported++;
              logRow(
                row,
                "inserted",
                part.id,
                "acción manual: crear participación en esta sesión (persona ya existente en el evento)",
              );
            }
            continue;
          }

          if (explicitAction === "create_bis") {
            // Sufijo VIS N para tratar como persona distinta dentro de la sesión.
            const baseLast = (row.last_name ?? "").trim();
            let n = 2;
            const collides = (last: string) =>
              nameToPersonId.has(nameKey(row.first_name, last));
            while (collides(`${baseLast} VIS ${n}`.trim())) n++;
            row.last_name = `${baseLast} VIS ${n}`.trim();
            const personId = await insertNewPerson(row, { omitDni: true });
            const part = await insertParticipationFor(personId, row);
            await maybeGenerateTicketFor(part.id, part.status, row);
            nameToPersonId.set(nameKey(row.first_name, row.last_name), personId);
            imported++;
            logRow(row, "inserted", part.id, "acción manual: crear bis (sufijo VIS)");
            continue;
          }

          if (explicitAction === "create_new") {
            // Aislamiento por sesión: si el DNI ya existe en OTRA sesión
            // del evento, se fuerza VIS para no compartir persona.
            const d = normDniLocal(row.dni);
            const forceVis = d ? dniInOtherSession.has(d) : false;
            if (forceVis) {
              const baseLast = (row.last_name ?? "").trim();
              let n = 2;
              while (nameToPersonId.has(nameKey(row.first_name, `${baseLast} VIS ${n}`.trim()))) n++;
              row.last_name = `${baseLast} VIS ${n}`.trim();
            }
            const personId = await insertNewPerson(row, { omitDni: forceVis });
            const part = await insertParticipationFor(personId, row);
            nameToPersonId.set(nameKey(row.first_name, row.last_name), personId);
            await maybeGenerateTicketFor(part.id, part.status, row);
            if (part.reused) {
              updated++;
              logRow(row, "updated", part.id, "persona ya participaba en la sesión (asiento/lote actualizado, QR emitido si faltaba)");
            } else {
              imported++;
              logRow(
                row,
                "inserted",
                part.id,
                forceVis ? "aislamiento: DNI ya en otra sesión → VIS" : "acción manual: crear",
              );
            }
            continue;
          }

          // Si la acción no era aplicable al estado real (ej. update sin match), cae al legado.
        }

        let key = nameKey(row.first_name, row.last_name);
        let existingPersonId = nameToPersonId.get(key);
        let suffixApplied = false;

        // Modo "personas distintas": al detectar colisión por nombre+apellido
        // (con el roster o con filas anteriores del propio batch), se renombra
        // el apellido añadiendo "VIS 2", "VIS 3"… y se crea como persona nueva.
        if (existingPersonId && data.duplicateStrategy === "suffix_distinct") {
          const baseLast = (row.last_name ?? "").trim();
          let n = 2;
          while (nameToPersonId.has(nameKey(row.first_name, `${baseLast} VIS ${n}`.trim()))) {
            n++;
          }
          row.last_name = `${baseLast} VIS ${n}`.trim();
          key = nameKey(row.first_name, row.last_name);
          existingPersonId = undefined;
          suffixApplied = true;
        }

        if (existingPersonId) {
          // Duplicate (same name in same session): keep ticket/QR/status,
          // only refresh contact details on the people row.
          if (data.duplicateStrategy === "skip") {
            skipped++;
            logRow(row, "skipped", null, "nombre+apellido coincide en la sesión");
            continue;
          }
          await supabase
            .from("people")
            .update({
              first_name: row.first_name,
              last_name: row.last_name ?? null,
              email: row.email ?? null,
              phone: row.phone ?? null,
            })
            .eq("id", existingPersonId);
          // Re-tag the existing participation with the current batch so it
          // appears when filtering "Ver solicitudes" by this import.
          await supabase
            .from("event_participants")
            .update({
              import_batch_id: batch.id,
              seat_zone: row.seat_zone?.trim() || null,
              seat_row: row.seat_row?.trim() || null,
              seat_number: row.seat_number?.trim() || null,
              seat_locked: seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number),
            })
            .eq("session_id", data.sessionId)
            .eq("person_id", existingPersonId);
          const { data: existingPart } = await supabase
            .from("event_participants")
            .select("id, status")
            .eq("session_id", data.sessionId)
            .eq("person_id", existingPersonId)
            .maybeSingle();
          if (existingPart?.id) {
            const desiredStatus = row.initial_status ?? data.defaultStatus;
            const currentStatus =
              (existingPart.status as typeof desiredStatus | undefined) ?? desiredStatus;
            const finalStatus =
              rank(currentStatus) >= rank(desiredStatus) ? currentStatus : desiredStatus;
            if (finalStatus !== currentStatus) {
              await supabase
                .from("event_participants")
                .update({ status: finalStatus })
                .eq("id", existingPart.id as string);
            }
            await maybeGenerateTicketFor(existingPart.id as string, finalStatus, row);
          }
          if (
            planSeatKeys &&
            row.seat_zone &&
            row.seat_row &&
            row.seat_number &&
            !seatExistsInPlan(row.seat_zone, row.seat_row, row.seat_number)
          ) {
            seatsNotInPlan++;
          }
          updated++;
          logRow(row, "updated", existingPart?.id ?? null, "nombre+apellido coincide en la sesión (QR emitido si faltaba)");
          continue;
        }

        // Aislamiento por sesión: si el DNI ya existe en OTRA sesión del
        // evento, NO reutilizamos la persona — creamos una nueva con VIS.
        const dniStr = normDniLocal(row.dni);
        const forceVisByOtherSession = !suffixApplied && !!dniStr && dniInOtherSession.has(dniStr);
        if (forceVisByOtherSession) {
          const baseLast = (row.last_name ?? "").trim();
          let n = 2;
          while (nameToPersonId.has(nameKey(row.first_name, `${baseLast} VIS ${n}`.trim()))) n++;
          row.last_name = `${baseLast} VIS ${n}`.trim();
          key = nameKey(row.first_name, row.last_name);
          suffixApplied = true;
        }

        // Not a duplicate → create a brand-new person. Email or phone collisions
        // with other people are allowed on purpose. If VIS was applied, omit DNI
        // so la persona nueva no colisione con la original.
        const personId = await insertNewPerson(row, { omitDni: suffixApplied });
        const part = await insertParticipationFor(personId, row);
        nameToPersonId.set(key, personId);
        await maybeGenerateTicketFor(part.id, part.status, row);
        if (part.reused) {
          updated++;
          logRow(row, "updated", part.id, "persona ya participaba en la sesión (QR emitido si faltaba)");
        } else {
          imported++;
          logRow(
            row,
            "inserted",
            part.id,
            forceVisByOtherSession
              ? "aislamiento: DNI ya en otra sesión → VIS"
              : suffixApplied
                ? "sufijo VIS aplicado por duplicado nombre+apellido"
                : null,
          );
        }
      } catch (err) {
        errored++;
        errors.push({ row: row.rowIndex, reason: err instanceof Error ? err.message : "error" });
        logRow(row, "errored", null, null, err instanceof Error ? err.message : "error");
      }
    }

    // Persist row-level audit log. Chunked to avoid hitting payload limits.
    if (rowResults.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < rowResults.length; i += CHUNK) {
      await supabase
        .from("import_row_results")
        .insert(rowResults.slice(i, i + CHUNK) as never);
      }
    }

    // Acumula con los tramos anteriores del mismo lote
    const totalImported = (data.batchId ? batch.imported_rows ?? 0 : 0) + imported;
    const totalErrored = (data.batchId ? batch.error_rows ?? 0 : 0) + errored;
    const prevErrors = data.batchId && Array.isArray(batch.errors) ? (batch.errors as typeof errors) : [];
    const allErrors = [...prevErrors, ...errors].slice(0, 200);
    const { data: finalBatch } = await supabase
      .from("import_batches")
      .update({
        imported_rows: totalImported,
        error_rows: totalErrored,
        errors: allErrors,
        ...(isFinal
          ? {
              status:
                totalErrored > 0 && totalImported === 0
                  ? ("fallida" as const)
                  : totalErrored > 0
                    ? ("completada_con_errores" as const)
                    : ("completada" as const),
              completed_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", batch.id)
      .select()
      .single();

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_email: actorEmail,
      action: "import.commit",
      entity_type: "import_batch",
      entity_id: batch.id,
      event_id: data.eventId,
      session_id: data.sessionId,
      changes: {
        filename: data.filename,
        total_rows: data.rows.length,
        imported,
        skipped,
        updated,
        errored,
        qr_generated: qrGenerated,
        no_contact_channel: noContactChannel,
        default_status: data.defaultStatus,
        duplicate_strategy: data.duplicateStrategy,
        seats_not_in_plan: seatsNotInPlan,
      },
    });

    return {
      batchId: batch.id,
      total: data.rows.length,
      imported,
      skipped,
      updated,
      errored,
      qrGenerated,
      noContactChannel,
      errors,
      finalStatus: finalBatch?.status ?? (isFinal ? "completada" : "procesando"),
      seatsNotInPlan,
    };
}
