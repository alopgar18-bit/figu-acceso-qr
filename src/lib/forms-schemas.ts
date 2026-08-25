import { z } from "zod";

export const attendeeSchema = z.enum([
  "publico",
  "figurante",
  "casting",
  "vip",
  "prensa",
  "equipo",
  "acompanante",
  "otro",
]);

export const formStatusSchema = z.enum(["borrador", "publicado", "cerrado", "archivado"]);