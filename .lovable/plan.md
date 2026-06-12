## Problema

La hoja **Detalle** del Excel ahora mismo:
- Solo muestra titulares (1000 filas, 0 acompañantes) porque la consulta a Supabase no pagina y choca con el límite por defecto de 1000 filas, tanto en `event_participants` como en el `.in()` sobre `companions`.
- No deja claro quién es solicitante y quién acompañante: la columna "Titular" está vacía en filas de titular, y muchos `people` antiguos tienen el nombre completo en `first_name` con `last_name` vacío.

## Cambios en `src/lib/report-export.ts` (hoja Detalle)

### 1. Paginar las consultas para que aparezcan TODOS los acompañantes
- Cargar `event_participants` por lotes de 1000 con `.range(from, to)` hasta agotar resultados.
- Cargar `companions` por lotes troceando `partIds` en chunks de 300 IDs y concatenando resultados (evita el límite implícito del `.in()` con 1000+ IDs y la cap de 1000 filas).

### 2. Reestructurar columnas para que la jerarquía sea evidente

Reemplazar el header actual por:

```
Grupo | Rol | Solicitante (titular) | Nombre | Apellidos | Nombre completo | DNI | Email | Teléfono | Sesión | Estado | Zona | Fila | Asiento | Check-in
```

Reglas de llenado:
- **Grupo**: número correlativo por titular (1, 1, 1, 2, 2, …). El mismo número se repite en el titular y en todos sus acompañantes → permite filtrar/ordenar en Excel y ver el bloque de un vistazo.
- **Rol**: `"Solicitante"` para el titular, `"Acompañante"` para cada acompañante (en lugar del actual "Titular" / "  Acompañante" con sangría que se pierde al ordenar).
- **Solicitante (titular)**: nombre completo del titular en TODAS las filas del grupo (incluida la suya), para que cada fila sea autoexplicativa aunque se filtre o se ordene la hoja.
- **Nombre completo**: `first_name + " " + last_name` ya combinado, para los casos en que los datos antiguos tienen todo en `first_name`.
- Mantener `Nombre` y `Apellidos` separados para quien los necesite.
- Email/Teléfono del acompañante: si están vacíos, dejar la celda vacía (no rellenar con los del titular — distorsionaría reporting).

### 3. Orden y formato

- Ordenar por `Sesión → Apellidos titular → Nombre titular → Rol (titular primero) → Apellidos acompañante`.
- Aplicar negrita a las filas de titular y un fondo gris muy claro a las de acompañante (usando `openpyxl`-style ya no, aquí XLSX vía `xlsx`/SheetJS: añadir `!cols` con anchos razonables y, si es viable con `sheet_to_json`/`aoa_to_sheet`, marcar las celdas de titular con estilo `font.bold = true` mediante `cell.s`). Si añadir estilos con SheetJS resulta inviable sin la versión styled, dejar al menos el orden + columna Rol + columna Grupo, que ya bastan para distinguir.
- Congelar la fila de cabecera (`ws['!freeze'] = { ySplit: 1 }` o equivalente vía `XLSX.utils`).

### 4. Respetar permisos PII

Sin cambios: seguir aplicando los flags `hideNames`, `hideDni`, `hideEmail`, `hidePhone` también a las nuevas columnas "Solicitante (titular)" y "Nombre completo".

## No se toca

- Hojas Resumen, Sesiones, Asistentes e Incidencias quedan igual.
- Sin cambios de schema ni de backend.

## Resultado para el usuario

Abrir la hoja **Detalle** y poder:
- Ver claramente "Solicitante" vs "Acompañante" en cada fila (columna Rol).
- Saber a qué titular pertenece cada acompañante (columna "Solicitante (titular)").
- Agrupar/filtrar por el número de Grupo.
- Que aparezcan TODOS los acompañantes, no solo titulares.
