## Generar informe Excel de rechazados (Aforo completo 30/06)

Crear `/mnt/documents/informe_rechazados_aforo_completo_v2.xlsx` con datos actualizados tras el reintento.

### Hojas
1. **Resumen** — totales: 4.764 destinatarios, enviados (incluyendo los 244 recuperados), fallidos finales, tasa éxito, plantilla, sesión, remitente, fechas.
2. **Enviados** — nombre, apellidos, DNI, email, teléfono, ciudad, fecha envío, message_id.
3. **Fallidos finales** — los 3 emails malformados con motivo y email actual en BBDD.
4. **Emails a corregir** — los 3 registros de `people` con email inválido, para limpieza manual (id, nombre, email actual sugerencia de corrección).

### Pasos
1. Query SQL: `communication_logs` últimas 48h, filtro plantilla aforo completo + status rechazado.
2. Join con `people` para datos personales.
3. Generar XLSX con openpyxl, formato profesional (encabezados bold, columnas auto-width, conteos en Resumen como fórmulas).
4. Verificar con `recalculate_formulas.py` y revisar visualmente.
5. Entregar con `<presentation-artifact>`.
