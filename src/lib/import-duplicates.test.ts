import { describe, expect, it } from "vitest";
import { buildImportDuplicateReport, importRowId, type DuplicateReportEntry } from "./import-duplicates";

const person = (overrides: Partial<DuplicateReportEntry> = {}): DuplicateReportEntry => ({
  first_name: "Carmen", last_name: "Pino Vega", dni: "11111111A", email: "grupo@example.test", phone: "600000000",
  seat_zone: "Palco Platea", seat_row: "8", seat_number: "1", participant_id: null, row_number: 1,
  origin: "archivo", outcome: null, note: null, ...overrides,
});

describe("informe orientativo de personas", () => {
  it("incluye todas las filas repetidas del archivo con sus butacas distintas", () => {
    const report = buildImportDuplicateReport([person(), person({ row_number: 2, seat_number: "2" })], []);
    expect(report.groups).toBe(1);
    expect(report.possibleDuplicateRows).toBe(2);
    expect(report.entries.map((r) => r.seat_number)).toEqual(["1", "2"]);
  });
  it("no considera duplicados los distintos nombres que comparten DNI o contacto", () => {
    const report = buildImportDuplicateReport([person(), person({ first_name: "Elisa", last_name: "Monzón Jiménez", row_number: 2 })], []);
    expect(report.groups).toBe(0);
  });
  it("incluye una coincidencia con una inscripción anterior de la misma sesión", () => {
    const report = buildImportDuplicateReport([person()], [person({ origin: "sesión", participant_id: "anterior", row_number: null })]);
    expect(report.entries).toHaveLength(2);
    expect(report.possibleDuplicateRows).toBe(1);
  });
  it("no cuenta la inscripción recién creada dos veces al consultar el informe final", () => {
    expect(buildImportDuplicateReport([person({ participant_id: "nuevo" })], [person({ participant_id: "nuevo", origin: "sesión" })]).groups).toBe(0);
  });
  it("conserva el DNI compartido para revisión sin usarlo para fusionar nombres", () => {
    const report = buildImportDuplicateReport([person({ note: "DNI compartido: inscripción independiente" })], []);
    expect(report.dniWarnings[0]?.dni).toBe("11111111A");
  });
});

describe("reintentos de importación", () => {
  it("usa la misma identidad al repetir un tramo, pero distinta para cada fila y lote", async () => {
    const id = await importRowId("lote-a", 1, "participante");
    expect(await importRowId("lote-a", 1, "participante")).toBe(id);
    expect(await importRowId("lote-a", 2, "participante")).not.toBe(id);
    expect(await importRowId("lote-b", 1, "participante")).not.toBe(id);
    expect(await importRowId("lote-a", 1, "persona")).not.toBe(id);
  });
});