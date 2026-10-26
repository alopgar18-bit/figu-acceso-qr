import { describe, expect, it } from "vitest";
import { sortSessionsUpcomingFirst } from "./session-sort";
import { formatSessionLongDate, renderTemplate } from "./communication-constants";

describe("orden de sesiones", () => {
  it("pone primero la próxima, luego futuras y después pasadas de más reciente a más antigua", () => {
    const now = new Date("2026-10-26T12:00:00Z").getTime();
    const list = [
      { id: "8oct", starts_at: "2026-10-08T10:00:00Z" },
      { id: "5nov", starts_at: "2026-11-05T20:30:00Z" },
      { id: "22oct", starts_at: "2026-10-22T18:00:00Z" },
      { id: "29oct", starts_at: "2026-10-29T20:30:00Z" },
    ];
    expect(sortSessionsUpcomingFirst(list, now).map((s) => s.id)).toEqual(["29oct", "5nov", "22oct", "8oct"]);
  });
});

describe("etiquetas de asunto", () => {
  it("genera el asunto del 29 de octubre igual que el texto fijo anterior", () => {
    const subject = renderTemplate("Tu invitación para {{evento}} {{fecha_larga}}", {
      evento: "EL PERRO ANDALUZ by Manu Sánchez",
      fecha_larga: formatSessionLongDate("2026-10-29T20:30:00Z"),
    });
    expect(subject).toBe("Tu invitación para EL PERRO ANDALUZ by Manu Sánchez jueves 29 de octubre");
  });
  it("rellena la hora de directo", () => {
    expect(renderTemplate("Directo: {{hora_directo}} h", { hora_directo: "23:00" })).toBe("Directo: 23:00 h");
  });
});
