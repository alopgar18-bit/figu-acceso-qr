## Lo que he encontrado para la sesión "Grabación 2 de julio"

He revisado los 4 batches de importación de asientos (los 3.802 del 29-jun no traían asiento, así que esos duplicados sin asiento no dejan butaca vacía).

**35 nombres se importaron por duplicado** (mismo nombre+apellido, ignorando mayúsculas y espacios). En todos los casos del bug: la primera fila creó/asignó un asiento al participante existente, y la segunda fila — al hacer match por nombre+apellido — sobrescribió ese asiento con el de la segunda fila. **El primer asiento queda vacío en el plano**.

### Asientos "huérfanos" (los que se ven libres y no deberían) — 16 casos con asiento

```
BATCH 1 — OKK BBDD General_Publico_2jl (1c4207cc…)
  Ana Piñero Domínguez         → vacía: Platea puerta 3 · F25 · A7   (ocupa F24 A25)
  David Pozo Fernandez         → vacía: Platea puerta 3 · F26 · A14  (ocupa F24 A18)
  Inmaculada Sosa Borrego      → vacía: Platea puerta 3 · F19 · A12  (ocupa F19 A11)
  Juan Felipe Vazquez          → vacía: Platea puerta 3 · F20 · A7   (ocupa F20 A30)
  Kenia Arjona Dorado          → vacía: Platea puerta 3 · F21 · A2   (ocupa F22 A3)
  Pedro González León          → vacía: Platea puerta 3 · F20 · A16  (ocupa Placo 6y7 F3 A9)

BATCH 2 — Bus Puebla de Cazalla (8d6e0d43…)
  Miguel Luque Luque           → vacía: Platea puerta 3 · F6 · A29   (ocupa F7 A41)
  Raquel Cabello Berlanga      → vacía: Platea puerta 3 · F8 · A36   (ocupa F8 A32)

BATCH 3 — Invitados 16 Escalones (e42c3af7…)
  Alberto Garrido Mata         → vacía: Platea puerta 2 · F5 · A26   (ocupa F6 A2)
  Andrea Albalat Carmona       → vacía: Platea puerta 2 · F5 · A11   (ocupa F6 A1)
  Ángeles Pavón Vázquez        → vacía: Platea puerta 2 · F5 · A25   (ocupa F7 A7)
  Carmen Vera Galindo          → vacía: Platea puerta 2 · F9 · A29   (ocupa F10 A36)
  Emilio Cano Rueda            → vacía: Platea puerta 2 · F8 · A16   (ocupa F10 A35)
  Habiba Yahi                  → vacía: Platea puerta 2 · F5 · A9    (ocupa F7 A5)
  Jade García Pavón            → vacía: Platea puerta 2 · F5 · A24   (ocupa F7 A8)
  Juan Bautista Bermejo García → vacía: Platea puerta 2 · F9 · A28   (ocupa F10 A38)
  María José Villegas Pineda   → vacía: Platea puerta 2 · F5 · A12   (ocupa F7 A11)
  Miguel Ángel Labrador Labrador → vacía: Platea puerta 2 · F5 · A23 (ocupa F7 A3)
  Pablo Garrido Díaz           → vacía: Platea puerta 2 · F5 · A10   (ocupa F7 A10)
  Pablo Márquez                → vacía: Platea puerta 2 · F8 · A21   (ocupa F10 A31)
  Raquel Díaz Silva            → vacía: Platea puerta 2 · F5 · A22   (ocupa F7 A9)
```

Además, en el batch BBDD_ok (3.802) hay 19 nombres duplicados sin asiento (no afectan al plano, solo es que una de las dos personas no se importó como registro separado — siguen siendo 1 persona en BBDD en lugar de 2).

## Qué propongo hacer ahora (sesión del 2 de julio)

1. **Genero Excel `huerfanos_2julio.xlsx`** con las 35 filas afectadas: nombre, apellido, batch, asiento original (vacío) y asiento final (ocupado), para que decidas en cada caso.
2. **Para cada uno de los 21 con asiento**, dos posibles correcciones — necesito que me digas cuál:
   - **A) Son la misma persona** (duplicado real del fichero): dejar como está, marcar el asiento "huérfano" como libre real en el plano y reasignable.
   - **B) Son dos personas distintas** (mismo nombre+apellido por casualidad / familiares): crear el segundo participante a mano con el asiento original y reenviar QR solo a ese nuevo (la persona ya importada conserva su URL).
   La forma rápida: te paso el Excel, marcas A/B en una columna y yo ejecuto el SQL.

## Mejora futura: sufijo "VIS 1 / VIS 2" en importación

Añadir al diálogo de importación una opción **"Tratar duplicados nombre+apellido como personas distintas"** con dos modos:

- **Modo actual (por defecto):** match por nombre+apellido → update (lo que hace hoy).
- **Modo nuevo "Personas distintas":** si dentro del mismo fichero aparece un nombre+apellido ya visto, al segundo se le añade automáticamente `VIS 2` al apellido (`VIS 3`, `VIS 4`…). Así el match falla y se crea como participante nuevo con su propio asiento y su propia URL/QR.
  - El sufijo aparece **solo internamente** (apellido en BBDD), no en la plantilla del WhatsApp/email enviados al asistente (el saludo seguirá usando solo el primer apellido, o el campo "nombre visible").
  - Se muestra en el resumen post-importación: "X duplicados detectados, marcados como VIS 2/VIS 3 — revisa si son la misma persona".

### Detalles técnicos

- `src/lib/imports.functions.ts`: añadir flag `duplicate_handling: 'update' | 'suffix'` al payload, mantener un `Map<fn+ln, count>` durante el proceso del batch, y al insertar aplicar el sufijo si `count > 1`.
- `src/components/seat-import-dialog.tsx` (y/o el diálogo de importación de asistentes): añadir un checkbox "Tratar duplicados como personas distintas (VIS 2, VIS 3…)" con tooltip explicativo.
- `import_row_results.match_reason`: añadir nuevo valor `'sufijo VIS aplicado'` para que sea auditable.
- Saludo en plantillas: usar `first_name` + primer token de `last_name` (ya lo hace), así "VIS 2" no se cuela en el mensaje.

¿Lo lanzo así? (1º genero el Excel de huérfanos para hoy, 2º implemento el modo VIS para próximas importaciones)
