import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CommitInput } from "./imports.functions";
import { runCommitChunk } from "./import-commit.server";

type Row = Record<string, any>;
function fakeDatabase() {
  const tables: Record<string, Row[]> = { people: [], event_participants: [], tickets: [], import_batches: [], event_sessions: [{ id: "sesion" }], import_row_results: [], audit_logs: [] };
  let sequence = 0;
  const client = { from(table: string) {
    let operation = "select", payload: Row | Row[] = {}, single = false, from = 0, to = Infinity;
    const filters: Array<(r: Row) => boolean> = [];
    const query = {
      select(..._args: unknown[]) { return query; }, order() { return query; }, limit(n: number) { to = n - 1; return query; },
      delete() { operation = "delete"; return query; },
      range(a: number, b: number) { from = a; to = b; return query; },
      eq(key: string, value: unknown) { filters.push((r) => r[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((r) => values.includes(r[key])); return query; },
      insert(value: Row | Row[]) { operation = "insert"; payload = value; return query; },
      update(value: Row) { operation = "update"; payload = value; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve: (value: { data: any; error: Row | null }) => unknown) {
        const records = tables[table] ?? (tables[table] = []);
        let rows = records.filter((r) => filters.every((f) => f(r)));
        if (operation === "insert") {
          rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            if (records.some((r) => r.id === row.id && row.id)) return resolve({ data: null, error: { code: "23505", message: "primary key" } });
            if (table === "people" && row.dni && records.some((r) => r.dni === row.dni)) return resolve({ data: null, error: { code: "23505", message: "uq_people_dni" } });
            if (table === "event_participants" && row.seat_zone && row.seat_row && row.seat_number && records.some((r) => r.session_id === row.session_id && r.seat_zone === row.seat_zone && r.seat_row === row.seat_row && r.seat_number === row.seat_number)) return resolve({ data: null, error: { code: "P0001", message: "Butaca ya ocupada: zona, fila y butaca" } });
            row.id ??= `id-${++sequence}`;
            records.push({ ...row });
          }
        } else if (operation === "delete") {
          tables[table] = records.filter((r) => !rows.includes(r));
        } else if (operation === "update") {
          for (const row of rows) Object.assign(row, payload);
        }
        rows = rows.slice(from, to + 1).map((r) => table === "event_participants" ? { ...r, people: tables.people?.find((p) => p.id === r.person_id) } : r);
        return resolve({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length } as { data: any; error: Row | null });
      },
    };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { client, tables };
}

const input = (rows: CommitInput["rows"]): CommitInput => ({ filename: "prueba.xlsx", eventId: "evento", sessionId: "sesion", defaultStatus: "aceptado_pendiente_envio", defaultAttendeeType: "publico", duplicateStrategy: "report_only", mappings: [], rows });
const row = (rowIndex: number, extra: Partial<CommitInput["rows"][number]> = {}): CommitInput["rows"][number] => ({ rowIndex, first_name: "Carmen", last_name: "Pino Vega", dni: "11111111A", email: "grupo@example.test", phone: "600000000", seat_zone: "Palco Platea", seat_row: "8", seat_number: String(rowIndex), ...extra });

describe("importación sin bloqueo por personas repetidas", () => {
  it("crea dos inscripciones y dos QR con los mismos datos y distintas butacas, sin sufijos", async () => {
    const { client, tables } = fakeDatabase();
    const result = await runCommitChunk(client, "admin", null, input([row(1), row(2)]));
    expect(result.imported).toBe(2);
    expect(result.errored).toBe(0);
    expect(tables.event_participants).toHaveLength(2);
    expect(tables.tickets).toHaveLength(2);
    expect(tables.people?.map((p) => p.last_name)).toEqual(["Pino Vega", "Pino Vega"]);
    expect(tables.people?.[1]?.notes).toContain("11111111A");
    expect(tables.import_row_results?.[1]?.raw_row.dni).toBe("11111111A");
  });
  it("nunca absorbe otro nombre que comparta el DNI", async () => {
    const { client, tables } = fakeDatabase();
    await runCommitChunk(client, "admin", null, input([row(1), row(2, { first_name: "Elisa", last_name: "Monzón Jiménez" })]));
    expect(tables.people?.map((p) => p.first_name)).toEqual(["Carmen", "Elisa"]);
    expect(tables.event_participants?.map((p) => p.seat_number)).toEqual(["1", "2"]);
  });
  it("conserva la restricción de una persona por zona, fila y butaca", async () => {
    const { client, tables } = fakeDatabase();
    const result = await runCommitChunk(client, "admin", null, input([row(1), row(2, { seat_number: "1" })]));
    expect(result.imported).toBe(1);
    expect(result.errored).toBe(1);
    expect(tables.event_participants).toHaveLength(1);
    expect(tables.event_participants?.[0]?.seat_number).toBe("1");
  });
  it("permite la misma fila y butaca en zonas distintas", async () => {
    const { client } = fakeDatabase();
    const result = await runCommitChunk(client, "admin", null, input([row(1), row(2, { seat_zone: "Palco Principales", seat_number: "1" })]));
    expect(result.imported).toBe(2);
    expect(result.errored).toBe(0);
  });
  it("reintenta el mismo lote sin crear otro participante ni otro QR", async () => {
    const { client, tables } = fakeDatabase();
    const data = input([row(1), row(2)]);
    const first = await runCommitChunk(client, "admin", null, data);
    await runCommitChunk(client, "admin", null, { ...data, batchId: first.batchId });
    expect(tables.event_participants).toHaveLength(2);
    expect(tables.tickets).toHaveLength(2);
  });
});