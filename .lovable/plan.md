# Butacas: comprobar zona + fila + asiento en importaciones

## Causa (confirmada)
La regla de "butaca ocupada" reduce la zona a una familia: cualquier zona que contenga "Palco" cuenta como "PALCO" (igual con "Club" y "Platea"). Así, "Palco Principales fila 10 butaca 1" choca con "Palco Puerta 5-6 fila 10 butaca 1", aunque son butacas distintas. De ahí los 119 errores.

## Cambios
1. **Regla de la base de datos**: la clave de la butaca pasa a ser la zona completa normalizada (mayúsculas, sin espacios dobles ni tildes) + fila + asiento. Sigue bloqueando duplicados reales en la misma zona.
2. **Comprobaciones relacionadas** que usan la misma clave (estadísticas de butacas, Excel de incidencias, butacas liberadas/reasignadas) se revisan para usar la zona completa, para que los informes no marquen dobles falsos.
3. **Revisar antes**: consulta de las sesiones futuras para detectar parejas que hoy colisionarían solo por familia y confirmar que pasan a ser válidas; y duplicados reales (misma zona exacta) que deben seguir saliendo.
4. **Reimportar (lo haces tú)**: subes el mismo Excel otra vez, sin borrar nada. Lo que ya existe no se toca y solo se crean las 119 filas que fallaron.

## No se toca
Deduplicación por nombre+apellido, estados, aforo, control de acceso, entradas ya emitidas.

## Riesgo
Si un mismo palco aparece escrito con nombres distintos en Excel y plano (p. ej. "Palco Ppal" vs "Palco Principales"), ya no se detectaría como el mismo. En el paso 3 listo las variantes de nombre de zona existentes para unificarlas si hace falta.

## Técnico
Migración: `seat_physical_key` -> `upper(unaccent-like normalización de btrim(zone)) | lower(btrim(row)) | btrim(num)`; `prevent_duplicate_seat`, `session_seat_stats`, `session_seat_issues` heredan la clave. Aplicar fuera de horario de grabación.

