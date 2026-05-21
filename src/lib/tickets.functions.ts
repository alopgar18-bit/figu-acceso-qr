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
 * Generates QR tickets for all participants in a session that don't have an active ticket yet.
 * Does NOT require DNI, email or phone. Uses crypto-safe random token (no gen_random_bytes).
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
      return { generated: 0, skipped: 0, errors: [] as Array<{ participant_id: string; reason: string }> };
    }

    // 2. Find which already have an active ticket.
    const ids = participants.map((p) => p.id);
    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("participant_id")
      .in("participant_id", ids)
      .eq("revoked", false);
    const haveTicket = new Set((existingTickets ?? []).map((t) => t.participant_id));

    let generated = 0;
    let skipped = 0;
    const errors: Array<{ participant_id: string; reason: string }> = [];

    for (const p of participants) {
      if (haveTicket.has(p.id)) {
        skipped++;
        continue;
      }
      try {
        const token = genToken();
        const { error: tErr } = await supabase.from("tickets").insert({
          event_id: data.event_id,
          session_id: data.session_id,
          participant_id: p.id,
          qr_token: token,
          qr_payload: {
            token,
            event_id: data.event_id,
            session_id: data.session_id,
            participant_id: p.id,
          },
        });
        if (tErr) throw new Error(tErr.message);
        generated++;
      } catch (err) {
        errors.push({
          participant_id: p.id,
          reason: err instanceof Error ? err.message : "error",
        });
      }
    }

    return { generated, skipped, errors };
  });
