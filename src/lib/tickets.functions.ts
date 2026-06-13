import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

function genToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const inputSchema = z.object({
  event_id: z.string().uuid(),
  session_id: z.string().uuid(),
  // If provided, only generate for these participants. Otherwise, all participants of the session.
  participant_ids: z.array(z.string().uuid()).max(2000).optional(),
  // Optional batch filter (only participants imported in this batch).
  batch_id: z.string().uuid().optional(),
});

/**
 * Generates QR tickets for participants (and companions, when the session is in
 * `qr_propio` mode) that don't have an active ticket yet.
 * Does NOT require DNI, email or phone. Uses crypto-safe random token.
 */
export const generateMissingTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);

    // 0. Load session to know the QR mode.
    const { data: session, error: sErr } = await supabase
      .from("event_sessions")
      .select("id, companions_qr_mode")
      .eq("id", data.session_id)
      .single();
    if (sErr || !session) throw new Error(`No se pudo leer la sesión: ${sErr?.message ?? "no encontrada"}`);
    const qrMode = session.companions_qr_mode as "mismo_qr" | "qr_propio";

    // 1. Resolve target participants.
    let query = supabase
      .from("event_participants")
      .select("id, person_id, submission_id")
      .eq("event_id", data.event_id)
      .eq("session_id", data.session_id);
    if (data.participant_ids && data.participant_ids.length > 0) {
      query = query.in("id", data.participant_ids);
    }
    if (data.batch_id) {
      // Restrict to people imported via this batch by joining via people.source = "import:<filename>" is fragile.
      // Instead, we rely on caller passing participant_ids; ignore batch_id if no list given.
    }
    const { data: participants, error: pErr } = await query.limit(5000);
    if (pErr) throw new Error(`No se pudieron leer los participantes: ${pErr.message}`);
    if (!participants || participants.length === 0) {
      return {
        generated: 0,
        skipped: 0,
        generated_titulars: 0,
        generated_companions: 0,
        skipped_titulars: 0,
        skipped_companions: 0,
        mode: qrMode,
        errors: [] as Array<{ participant_id: string; reason: string }>,
      };
    }

    // 2. Find existing active tickets (by titular and by companion).
    const ids = participants.map((p) => p.id);
    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("participant_id, companion_id")
      .in("participant_id", ids)
      .eq("revoked", false);
    const haveTitularTicket = new Set(
      (existingTickets ?? []).filter((t) => !t.companion_id).map((t) => t.participant_id),
    );
    const haveCompanionTicket = new Set(
      (existingTickets ?? []).filter((t) => t.companion_id).map((t) => t.companion_id as string),
    );

    // 2b. Load companions for these participants (only relevant if qr_propio).
    let companionsByParticipant = new Map<string, Array<{ id: string }>>();
    if (qrMode === "qr_propio") {
      const { data: comps } = await supabase
        .from("companions")
        .select("id, participant_id")
        .in("participant_id", ids)
        .order("created_at", { ascending: true });
      for (const c of comps ?? []) {
        const arr = companionsByParticipant.get(c.participant_id) ?? [];
        arr.push({ id: c.id });
        companionsByParticipant.set(c.participant_id, arr);
      }
    }

    let generated_titulars = 0;
    let generated_companions = 0;
    let skipped_titulars = 0;
    let skipped_companions = 0;
    const errors: Array<{ participant_id: string; reason: string }> = [];

    for (const p of participants) {
      const comps = companionsByParticipant.get(p.id) ?? [];
      const hasCompanions = comps.length > 0;
      // 3. Titular ticket
      if (haveTitularTicket.has(p.id)) {
        skipped_titulars++;
      } else {
        try {
          const token = genToken();
          const kind =
            qrMode === "qr_propio" && hasCompanions
              ? "titular"
              : "grupo";
          const { error: tErr } = await supabase.from("tickets").insert({
            event_id: data.event_id,
            session_id: data.session_id,
            participant_id: p.id,
            qr_token: token,
            qr_payload: {
              kind,
              token,
              event_id: data.event_id,
              session_id: data.session_id,
              participant_id: p.id,
            },
          });
          if (tErr) throw new Error(tErr.message);
          generated_titulars++;
        } catch (err) {
          errors.push({
            participant_id: p.id,
            reason: err instanceof Error ? err.message : "error",
          });
        }
      }

      // 4. Companion tickets (only in qr_propio mode)
      if (qrMode === "qr_propio") {
        let idx = 0;
        for (const c of comps) {
          idx++;
          if (haveCompanionTicket.has(c.id)) {
            skipped_companions++;
            continue;
          }
          try {
            const token = genToken();
            const { error: cErr } = await supabase.from("tickets").insert({
              event_id: data.event_id,
              session_id: data.session_id,
              participant_id: p.id,
              companion_id: c.id,
              qr_token: token,
              qr_payload: {
                kind: "acompanante",
                index: idx,
                token,
                event_id: data.event_id,
                session_id: data.session_id,
                participant_id: p.id,
                companion_id: c.id,
              },
            });
            if (cErr) throw new Error(cErr.message);
            generated_companions++;
          } catch (err) {
            errors.push({
              participant_id: p.id,
              reason: `acompañante ${c.id}: ${err instanceof Error ? err.message : "error"}`,
            });
          }
        }
      }
    }

    return {
      // Back-compat aliases
      generated: generated_titulars + generated_companions,
      skipped: skipped_titulars + skipped_companions,
      generated_titulars,
      generated_companions,
      skipped_titulars,
      skipped_companions,
      mode: qrMode,
      errors,
    };
  });
