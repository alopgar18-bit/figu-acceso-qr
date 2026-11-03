import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CommitInput } from "./imports.functions";
import { runCommitChunk } from "./import-commit.server";

/**
 * Cola de importación en segundo plano.
 *
 * El Excel se guarda en tramos (import_chunks) al pulsar «Importar». Cada
 * tramo se procesa en una petición corta e independiente. Lo procesa el
 * navegador mientras la pestaña sigue abierta y, si se cierra o se cambia de
 * página, lo continúa solo el vigilante programado (/api/public/jobs/tick).
 * Un único tramo en curso por lote (reserva atómica en claim_import_chunk).
 */

type Admin = SupabaseClient<Database>;

export type ChunkTotals = {
  imported: number;
  skipped: number;
  updated: number;
  errored: number;
  qrGenerated: number;
  noContactChannel: number;
  seatsNotInPlan: number;
  errors: Array<{ row: number; reason: string }>;
};

export type BatchProgress = {
  batchId: string;
  totalChunks: number;
  doneChunks: number;
  failedChunks: number;
  pendingChunks: number;
  totalRows: number;
  doneRows: number;
  complete: boolean;
  finalStatus: string | null;
  totals: ChunkTotals;
  lastError: string | null;
};

const MAX_ATTEMPTS = 4;

/** Reserva y procesa un tramo pendiente (de un lote concreto o de cualquiera). */
export async function processNextImportChunk(
  admin: Admin,
  opts: { batchId?: string; owner: string },
): Promise<{ status: "processed" | "failed_attempt" | "idle"; batchId?: string }> {
  const { data: claimed, error: claimErr } = await admin.rpc("claim_import_chunk", {
    _batch_id: (opts.batchId ?? null) as unknown as string,
    _owner: opts.owner,
    _lock_seconds: 180,
  });
  if (claimErr) throw new Error(`No se pudo reservar el tramo: ${claimErr.message}`);
  const chunk = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!chunk?.id) return { status: "idle" };

  try {
    const payload = chunk.payload as unknown as CommitInput;
    const res = await runCommitChunk(
      admin,
      chunk.created_by ?? "",
      chunk.actor_email ?? null,
      { ...payload, batchId: chunk.batch_id, isFinal: false },
    );
    await admin
      .from("import_chunks")
      .update({
        status: "done",
        result: {
          imported: res.imported,
          skipped: res.skipped,
          updated: res.updated,
          errored: res.errored,
          qrGenerated: res.qrGenerated,
          noContactChannel: res.noContactChannel,
          seatsNotInPlan: Number(res.seatsNotInPlan ?? 0),
          errors: res.errors ?? [],
        },
        error: null,
        finished_at: new Date().toISOString(),
        lock_owner: null,
        lock_expires_at: null,
      })
      .eq("id", chunk.id);
    await finalizeBatchIfComplete(admin, chunk.batch_id);
    return { status: "processed", batchId: chunk.batch_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[import-queue] tramo fallido", chunk.batch_id, chunk.chunk_index, msg);
    const exhausted = chunk.attempts >= (chunk.max_attempts ?? MAX_ATTEMPTS);
    await admin
      .from("import_chunks")
      .update({
        status: exhausted ? "failed" : "queued",
        error: msg.slice(0, 1000),
        next_attempt_at: exhausted ? null : new Date(Date.now() + 15_000 * chunk.attempts).toISOString(),
        finished_at: exhausted ? new Date().toISOString() : null,
        lock_owner: null,
        lock_expires_at: null,
      })
      .eq("id", chunk.id);
    if (exhausted) {
      // Las filas del tramo cuentan como errores en el lote.
      const { data: b } = await admin
        .from("import_batches")
        .select("error_rows, errors")
        .eq("id", chunk.batch_id)
        .single();
      const prev = Array.isArray(b?.errors) ? (b!.errors as unknown[]) : [];
      await admin
        .from("import_batches")
        .update({
          error_rows: (b?.error_rows ?? 0) + (chunk.row_count ?? 0),
          errors: [
            ...prev,
            { row: -1, reason: `Tramo ${chunk.chunk_index + 1} sin importar (${chunk.row_count} filas): ${msg.slice(0, 200)}` },
          ].slice(0, 200) as never,
        })
        .eq("id", chunk.batch_id);
      await finalizeBatchIfComplete(admin, chunk.batch_id);
    }
    return { status: "failed_attempt", batchId: chunk.batch_id };
  }
}

/** Cierra el lote cuando ya no quedan tramos pendientes ni en curso. */
export async function finalizeBatchIfComplete(admin: Admin, batchId: string): Promise<void> {
  const { count } = await admin
    .from("import_chunks")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .in("status", ["queued", "running"]);
  if ((count ?? 0) > 0) return;
  const { data: b } = await admin
    .from("import_batches")
    .select("status, imported_rows, error_rows")
    .eq("id", batchId)
    .single();
  if (!b || b.status !== "procesando") return;
  const imp = b.imported_rows ?? 0;
  const err = b.error_rows ?? 0;
  await admin
    .from("import_batches")
    .update({
      status: err > 0 && imp === 0 ? "fallida" : err > 0 ? "completada_con_errores" : "completada",
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .eq("status", "procesando");
}

/** Estado agregado de un lote encolado. */
export async function getBatchProgress(admin: Admin, batchId: string): Promise<BatchProgress> {
  const { data: chunks, error } = await admin
    .from("import_chunks")
    .select("status, row_count, result, error, chunk_index")
    .eq("batch_id", batchId)
    .order("chunk_index");
  if (error) throw new Error(error.message);
  const { data: batch } = await admin
    .from("import_batches")
    .select("status")
    .eq("id", batchId)
    .single();
  const totals: ChunkTotals = {
    imported: 0, skipped: 0, updated: 0, errored: 0, qrGenerated: 0, noContactChannel: 0, seatsNotInPlan: 0, errors: [],
  };
  let doneChunks = 0, failedChunks = 0, pendingChunks = 0, totalRows = 0, doneRows = 0;
  let lastError: string | null = null;
  for (const c of chunks ?? []) {
    totalRows += c.row_count ?? 0;
    if (c.status === "done") {
      doneChunks++;
      doneRows += c.row_count ?? 0;
      const r = (c.result ?? {}) as Partial<ChunkTotals>;
      totals.imported += r.imported ?? 0;
      totals.skipped += r.skipped ?? 0;
      totals.updated += r.updated ?? 0;
      totals.errored += r.errored ?? 0;
      totals.qrGenerated += r.qrGenerated ?? 0;
      totals.noContactChannel += r.noContactChannel ?? 0;
      totals.seatsNotInPlan += r.seatsNotInPlan ?? 0;
      if (Array.isArray(r.errors)) totals.errors.push(...r.errors);
    } else if (c.status === "failed") {
      failedChunks++;
      doneRows += c.row_count ?? 0;
      totals.errored += c.row_count ?? 0;
      totals.errors.push({ row: -1, reason: `Tramo ${c.chunk_index + 1} sin importar: ${c.error ?? "error"}` });
    } else {
      pendingChunks++;
      if (c.error) lastError = c.error;
    }
  }
  totals.errors = totals.errors.slice(0, 200);
  return {
    batchId,
    totalChunks: chunks?.length ?? 0,
    doneChunks,
    failedChunks,
    pendingChunks,
    totalRows,
    doneRows,
    complete: pendingChunks === 0,
    finalStatus: batch?.status ?? null,
    totals,
    lastError,
  };
}

/** Procesa tramos de cualquier lote dentro de un presupuesto (vigilante). */
export async function drainImportQueue(admin: Admin, budgetMs: number, maxChunks: number) {
  const owner = `tick-${crypto.randomUUID()}`;
  const started = Date.now();
  let processed = 0;
  for (let i = 0; i < maxChunks; i++) {
    if (Date.now() - started > budgetMs) break;
    const r = await processNextImportChunk(admin, { owner });
    if (r.status === "idle") break;
    processed++;
  }
  return processed;
}
