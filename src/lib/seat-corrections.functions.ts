import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { UNAVAILABLE_OVERRIDE_CATEGORIES, type SeatOverrideCategory } from "./seats.functions";

// ──────────────────────────────────────────────────────────────────────────────
// Aplicar correcciones de butacas desde un Excel ("Listado corregido")
// NO toca confirmation_token, status ni tickets. Solo seat_zone/row/number.
// Las URLs/QR ya enviadas siguen válidas.
// ──────────────────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const normZone = (s: string | null | undefined) => norm(s);

const seatKey = (
  zone: string | null | undefined,
  row: string | null | undefined,
  num: string | null | undefined,
) => `${normZone(zone)}||${(row ?? "").toString().trim()}||${(num ?? "").toString().trim()}`;

export const correctionRowSchema = z.object({
  email: z.string().trim().optional().nullable(),
  full_name: z.string().trim().min(1),
  zone: z.string().trim().min(1),
  row_final: z.string().trim().optional().nullable(),
  number_final: z.string().trim().optional().nullable(),
});

export type CorrectionRowInput = z.infer<typeof correctionRowSchema>;

export type CorrectionPlanItem = {
  full_name: string;
  email: string | null;
  zone: string;
  row_final: string | null;
  number_final: string | null;
  status:
    | "applied" // se aplica un cambio
    | "unchanged" // ya está en ese asiento
    | "no_match" // no se ha encontrado a la persona
    | "ambiguous" // varios candidatos
    | "missing_seat" // sin fila/asiento final
    | "dest_unavailable" // butaca destino está reservada/bloqueada
    | "dest_dup_in_excel"; // el propio Excel asigna el mismo asiento a otro
  occupant_kind?: "titular" | "acompanante";
  occupant_id?: string;
  current_zone?: string | null;
  current_row?: string | null;
  current_number?: string | null;
  message?: string;
};

export type CorrectionPlan = {
  session_id: string;
  totals: {
    rows: number;
    applied: number;
    unchanged: number;
    no_match: number;
    ambiguous: number;
    missing_seat: number;
    dest_unavailable: number;
    dest_dup_in_excel: number;
  };
  items: CorrectionPlanItem[];
};

async function buildCorrectionPlan(
  sb: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  sessionId: string,
  rows: CorrectionRowInput[],
): Promise<CorrectionPlan> {
  // Cargar overrides (cámaras/bloqueado) para validar destinos
  const { data: ovData, error: ovErr } = await sb
    .from("session_seat_overrides")
    .select("seat_zone, seat_row, seat_number, category")
    .eq("session_id", sessionId);
  if (ovErr) throw new Error(ovErr.message);
  const blockedSeats = new Set<string>();
  for (const o of ovData ?? []) {
    if (UNAVAILABLE_OVERRIDE_CATEGORIES.has(o.category as SeatOverrideCategory)) {
      blockedSeats.add(seatKey(o.seat_zone, o.seat_row, o.seat_number));
    }
  }

  // Cargar titulares de la sesión + personas (email/nombre)
  const { data: parts, error: pErr } = await sb
    .from("event_participants")
    .select(
      "id, seat_zone, seat_row, seat_number, people(email, first_name, last_name)",
    )
    .eq("session_id", sessionId);
  if (pErr) throw new Error(pErr.message);

  type PartRow = {
    id: string;
    seat_zone: string | null;
    seat_row: string | null;
    seat_number: string | null;
    people: {
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null;
  };
  const participants = (parts ?? []) as PartRow[];
  const participantIds = participants.map((p) => p.id);

  // Cargar acompañantes
  type CompRow = {
    id: string;
    participant_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    seat_zone: string | null;
    seat_row: string | null;
    seat_number: string | null;
  };
  const comps: CompRow[] = [];
  for (let i = 0; i < participantIds.length; i += 500) {
    const chunk = participantIds.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const { data, error } = await sb
      .from("companions")
      .select(
        "id, participant_id, first_name, last_name, email, seat_zone, seat_row, seat_number",
      )
      .in("participant_id", chunk);
    if (error) throw new Error(error.message);
    comps.push(...((data ?? []) as CompRow[]));
  }

  // Índices de matching
  // Titulares: email→[participant]; (email, fullName)→[participant]; fullName→[participant]
  const titByEmailName = new Map<string, PartRow[]>();
  const titByEmail = new Map<string, PartRow[]>();
  const titByName = new Map<string, PartRow[]>();
  for (const p of participants) {
    const email = norm(p.people?.email);
    const fullName = norm(
      [p.people?.first_name, p.people?.last_name].filter(Boolean).join(" "),
    );
    if (email && fullName) {
      const k = `${email}|${fullName}`;
      (titByEmailName.get(k) ?? titByEmailName.set(k, []).get(k))!.push(p);
    }
    if (email) {
      (titByEmail.get(email) ?? titByEmail.set(email, []).get(email))!.push(p);
    }
    if (fullName) {
      (titByName.get(fullName) ?? titByName.set(fullName, []).get(fullName))!.push(p);
    }
  }

  // Acompañantes: (titularEmail, compFullName)→[comp]; compFullName→[comp]
  const compByEmailName = new Map<string, CompRow[]>();
  const compByName = new Map<string, CompRow[]>();
  const partEmailById = new Map<string, string>();
  for (const p of participants) {
    const e = norm(p.people?.email);
    if (e) partEmailById.set(p.id, e);
  }
  for (const c of comps) {
    const fullName = norm([c.first_name, c.last_name].filter(Boolean).join(" "));
    if (!fullName) continue;
    (compByName.get(fullName) ?? compByName.set(fullName, []).get(fullName))!.push(c);
    const tEmail = partEmailById.get(c.participant_id);
    if (tEmail) {
      const k = `${tEmail}|${fullName}`;
      (compByEmailName.get(k) ?? compByEmailName.set(k, []).get(k))!.push(c);
    }
  }

  // Detectar duplicados de destino dentro del Excel
  const destCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.zone || !r.row_final || !r.number_final) continue;
    const k = seatKey(r.zone, r.row_final, r.number_final);
    destCounts.set(k, (destCounts.get(k) ?? 0) + 1);
  }

  const items: CorrectionPlanItem[] = [];
  const totals = {
    rows: rows.length,
    applied: 0,
    unchanged: 0,
    no_match: 0,
    ambiguous: 0,
    missing_seat: 0,
    dest_unavailable: 0,
    dest_dup_in_excel: 0,
  };

  for (const r of rows) {
    const fullName = norm(r.full_name);
    const email = norm(r.email);

    const base: CorrectionPlanItem = {
      full_name: r.full_name,
      email: r.email ?? null,
      zone: r.zone,
      row_final: r.row_final ?? null,
      number_final: r.number_final ?? null,
      status: "no_match",
    };

    if (!r.row_final || !r.number_final) {
      items.push({ ...base, status: "missing_seat", message: "Sin fila/asiento final" });
      totals.missing_seat++;
      continue;
    }

    // Intento titular: (email, fullName) → (email) si fullName igual → (fullName) único
    let titMatch: PartRow[] = [];
    if (email) titMatch = titByEmailName.get(`${email}|${fullName}`) ?? [];
    if (titMatch.length === 0 && email) {
      // si el email pertenece a un titular cuyo nombre es éste
      const byMail = titByEmail.get(email) ?? [];
      const filtered = byMail.filter((p) => {
        const n = norm([p.people?.first_name, p.people?.last_name].filter(Boolean).join(" "));
        return n === fullName;
      });
      if (filtered.length > 0) titMatch = filtered;
    }
    if (titMatch.length === 0) titMatch = titByName.get(fullName) ?? [];

    // Intento acompañante (si no es titular o titular ambiguo): (email titular, fullName)
    let compMatch: CompRow[] = [];
    if (titMatch.length === 0) {
      if (email) compMatch = compByEmailName.get(`${email}|${fullName}`) ?? [];
      if (compMatch.length === 0) compMatch = compByName.get(fullName) ?? [];
    }

    if (titMatch.length === 1 && compMatch.length === 0) {
      const p = titMatch[0];
      const destK = seatKey(r.zone, r.row_final, r.number_final);
      const sameSeat =
        normZone(p.seat_zone) === normZone(r.zone) &&
        (p.seat_row ?? "").trim() === r.row_final.trim() &&
        (p.seat_number ?? "").trim() === r.number_final.trim();
      if (sameSeat) {
        items.push({
          ...base,
          status: "unchanged",
          occupant_kind: "titular",
          occupant_id: p.id,
          current_zone: p.seat_zone,
          current_row: p.seat_row,
          current_number: p.seat_number,
        });
        totals.unchanged++;
      } else if (blockedSeats.has(destK)) {
        items.push({
          ...base,
          status: "dest_unavailable",
          occupant_kind: "titular",
          occupant_id: p.id,
          message: "Butaca reservada/bloqueada en el plano",
        });
        totals.dest_unavailable++;
      } else if ((destCounts.get(destK) ?? 0) > 1) {
        items.push({
          ...base,
          status: "dest_dup_in_excel",
          occupant_kind: "titular",
          occupant_id: p.id,
          message: "El Excel asigna esta butaca a más de una persona",
        });
        totals.dest_dup_in_excel++;
      } else {
        items.push({
          ...base,
          status: "applied",
          occupant_kind: "titular",
          occupant_id: p.id,
          current_zone: p.seat_zone,
          current_row: p.seat_row,
          current_number: p.seat_number,
        });
        totals.applied++;
      }
      continue;
    }

    if (compMatch.length === 1 && titMatch.length === 0) {
      const c = compMatch[0];
      const destK = seatKey(r.zone, r.row_final, r.number_final);
      const sameSeat =
        normZone(c.seat_zone) === normZone(r.zone) &&
        (c.seat_row ?? "").trim() === r.row_final.trim() &&
        (c.seat_number ?? "").trim() === r.number_final.trim();
      if (sameSeat) {
        items.push({
          ...base,
          status: "unchanged",
          occupant_kind: "acompanante",
          occupant_id: c.id,
          current_zone: c.seat_zone,
          current_row: c.seat_row,
          current_number: c.seat_number,
        });
        totals.unchanged++;
      } else if (blockedSeats.has(destK)) {
        items.push({
          ...base,
          status: "dest_unavailable",
          occupant_kind: "acompanante",
          occupant_id: c.id,
          message: "Butaca reservada/bloqueada en el plano",
        });
        totals.dest_unavailable++;
      } else if ((destCounts.get(destK) ?? 0) > 1) {
        items.push({
          ...base,
          status: "dest_dup_in_excel",
          occupant_kind: "acompanante",
          occupant_id: c.id,
          message: "El Excel asigna esta butaca a más de una persona",
        });
        totals.dest_dup_in_excel++;
      } else {
        items.push({
          ...base,
          status: "applied",
          occupant_kind: "acompanante",
          occupant_id: c.id,
          current_zone: c.seat_zone,
          current_row: c.seat_row,
          current_number: c.seat_number,
        });
        totals.applied++;
      }
      continue;
    }

    if (titMatch.length + compMatch.length === 0) {
      items.push({ ...base, status: "no_match", message: "Persona no encontrada en la sesión" });
      totals.no_match++;
    } else {
      items.push({
        ...base,
        status: "ambiguous",
        message: `${titMatch.length} titulares y ${compMatch.length} acompañantes coinciden`,
      });
      totals.ambiguous++;
    }
  }

  return { session_id: sessionId, totals, items };
}

export const previewSeatCorrections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        rows: z.array(correctionRowSchema).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CorrectionPlan> => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildCorrectionPlan(supabaseAdmin, data.session_id, data.rows);
  });

export const applySeatCorrections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        rows: z.array(correctionRowSchema).min(1).max(5000),
        file_name: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const plan = await buildCorrectionPlan(supabaseAdmin, data.session_id, data.rows);

    let applied = 0;
    const errors: Array<{ name: string; error: string }> = [];
    for (const item of plan.items) {
      if (item.status !== "applied" || !item.occupant_id || !item.occupant_kind) continue;
      const patch = {
        seat_zone: item.zone.trim(),
        seat_row: (item.row_final ?? "").trim(),
        seat_number: (item.number_final ?? "").trim(),
      };
      const table = item.occupant_kind === "titular" ? "event_participants" : "companions";
      const { error } = await supabaseAdmin
        .from(table)
        .update(patch as never)
        .eq("id", item.occupant_id);
      if (error) {
        errors.push({ name: item.full_name, error: error.message });
      } else {
        applied++;
      }
    }

    const { data: sess } = await supabaseAdmin
      .from("event_sessions")
      .select("event_id")
      .eq("id", data.session_id)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.bulk_correction",
      entity_type: "event_participants",
      event_id: sess?.event_id ?? null,
      session_id: data.session_id,
      actor_id: context.userId,
      changes: {
        file_name: data.file_name ?? null,
        totals: plan.totals,
        applied,
        errors,
        // muestra primeras 20 aplicaciones (suficiente para auditoría sin saturar)
        sample_applied: plan.items.filter((i) => i.status === "applied").slice(0, 20),
        skipped_sample: plan.items.filter((i) => i.status !== "applied" && i.status !== "unchanged").slice(0, 20),
      },
    } as never);

    return { plan, applied, errors };
  });