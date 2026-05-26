## Objetivo

Auditoría completa y autónoma de la plataforma con los 4 perfiles + público. Corrijo en el momento los bugs claros y bajo riesgo; lo demás queda en un informe final para tu aprobación.

## Reglas de actuación

**Arreglo automáticamente** (sin pedir permiso) si el bug es:
- Routing: rutas padre sin `<Outlet />`, `<Link to="...">` a rutas inexistentes, tarjetas que parecen clickeables y no navegan, redirecciones rotas, F5 que rompe.
- Permisos UI: ítem del sidebar visible pero ruta redirige (o viceversa) para el rol — alineo la guard al diseño existente.
- Errores triviales: keys de React duplicadas, imports rotos, textos en inglés en pantallas en español, fechas mal formateadas, botones sin `type="button"` que recargan formularios, `console.error` por null-checks faltantes en render.
- UX evidente: skeleton infinito por query sin `enabled`, botón "volver" que va a sitio incorrecto, breadcrumbs rotos.
- Accesibilidad mínima: `role`/`tabIndex` en elementos clickeables, `aria-label` en iconos sin texto.

**Paso a informe final para tu aprobación** si requiere:
- Cambios de RLS o migraciones de BD.
- Cambios de modelo de permisos / `visibility_permissions` / roles.
- Refactor de un componente grande o flujo entero (comunicaciones, importaciones, control de acceso).
- Decisiones de producto (ej. "el cliente debería poder ver X que ahora no ve", "este botón debería existir").
- Acciones destructivas o de escritura masiva (borrar, enviar emails, generar QR en lote).
- Cambios visuales/diseño que no son claramente un bug.

**No toco en ningún caso**:
- Datos reales en BD (solo lecturas y queries de diagnóstico).
- Envío de emails / generación de tickets en masa.
- Configuración de auth / secrets / dominio.
- Archivos auto-generados (`routeTree.gen.ts`, `client.ts`, `types.ts`, `auth-*.ts`).

Ante duda → al informe, no al código.

---

## Fase 1 — Auditoría estática

Antes de tocar el navegador, escaneo el repo buscando el patrón del incidente anterior:

1. Cada archivo de `src/routes/` con rutas hijas debe tener `<Outlet />` o `component: () => <Outlet />`. Candidatos:
   - `_authenticated.tsx`, `portal.tsx`, `portal.eventos.tsx`
   - `_authenticated/eventos.$eventId.tsx` (hijos: `editar`, `sesiones.$sessionId`, `sesiones.nueva`)
   - `_authenticated/solicitudes.tsx` (hijo: `$participantId`)
   - `_authenticated/importaciones.tsx` (hijos: `nueva`, `$batchId`)
   - `_authenticated/informes.tsx` (hijo: `$eventId`)
   - `_authenticated/comunicaciones.tsx` (hijos: `cola`, `envio`)
   - `_authenticated/control-acceso.tsx` (hijo: `$sessionId`)
   - `c.$token.tsx` (hijos: `entrada`, `cancelar`)
2. Grep de `<Link to=` y `navigate({ to:` cruzado con los archivos reales → links a rutas que no existen.
3. Tarjetas/filas con `cursor-pointer` sin handler de navegación.
4. Botones sin `type="button"` dentro de `<form>`.
5. Queries con `enabled: !!x` donde `x` nunca llega → skeleton infinito.
6. Coherencia entre sidebar (`app-sidebar.tsx` / `client-portal-shell.tsx`) y guards de rutas para cada rol.

Bugs claros se arreglan ya. El resto se anota.

---

## Fase 2 — Recorrido funcional por perfil (en el navegador)

Para cada perfil hago login → recorro cada ruta del menú y sub-rutas → en cada pantalla observo: consola, network, datos, botones que abren diálogos, F5 en ruta profunda, "volver"/breadcrumb.

### A. Público (sin login)
- `/`, `/login`, `/privacidad`
- `/e/$slug` + `inscripcion` / `gracias` / `cerrado` / `completo` sobre evento publicado real
- `/c/$token` + `entrada` / `cancelar` con token real de la BD

### B. Cliente / Productora (`cliente.demo`)
- `/portal`, `/portal/eventos`, `/portal/eventos/$eventId` (tabs sesiones/stats/incidencias), `/portal/incidencias`, `/portal/informes`
- Acceso indebido: probar `/dashboard`, `/eventos`, `/usuarios` → debe redirigir
- Permisos reales del cliente demo (check-ins, export, incidencias)

### C. Validador (`validador.demo`)
- `/control-acceso`, `/control-acceso/$sessionId` (escáner abre, búsqueda funciona, alta de incidencia sin guardar)
- Acceso indebido: `/dashboard`, `/eventos`, `/portal`, `/usuarios` → debe bloquear

### D. Coordinador (`coordinador.demo`)
- `/dashboard`, `/eventos`, `/eventos/$eventId` (+ editar, sesiones.$id, sesiones/nueva)
- `/solicitudes` + `/solicitudes/$participantId`
- `/comunicaciones` + `cola` + `envio`
- `/incidencias`, `/sesiones`, `/personas`
- `/importaciones` + `$batchId` + `nueva`
- `/informes` + `$eventId`
- Acceso indebido: `/usuarios`, `/clientes`, `/branding`, `/legal`, `/logs`

### E. Admin FIGURARTE (`admin.demo`)
- Todo lo anterior + `/usuarios`, `/clientes`, `/branding`, `/legal`, `/logs`, `/informes/$eventId`

### Checks transversales por pantalla
- Sin errores en consola
- Sin 4xx/5xx no esperados en Network
- Cada ítem del sidebar lleva a la ruta correcta
- Tarjetas/filas navegan al detalle
- Detalle carga datos (no skeleton infinito)
- Botones de acción abren diálogo/asistente (no se ejecutan acciones destructivas)
- F5 en ruta profunda sigue funcionando
- "Volver"/breadcrumb regresa al sitio correcto

---

## Fase 3 — Acciones no destructivas

Pruebo que el flujo "se abre y muestra datos", sin guardar/enviar/borrar:
- Cliente: abrir tarjeta evento → tabs → click "Informe" → intentar CSV si tiene permiso
- Validador: abrir sesión → cargar escáner → buscar asistente por nombre
- Coordinador: abrir participante → abrir asistente "Comunicar" con 1 seleccionado (cerrar sin enviar) → abrir cola
- Admin: abrir gestión usuarios/clientes/branding → editor de plantilla / legal (cerrar sin guardar)

---

## Fase 4 — Capa de datos / RLS

Durante el recorrido, en Network observo Supabase:
- Listados `[]` sospechosos → RLS demasiado restrictiva → al informe
- 401/403 inesperados → al informe
- Realtime: subscripciones en `/portal/eventos/$eventId` (cliente con check-in) y `/control-acceso/$sessionId` (validador)

Queries SQL read-only para entender qué debería ver cada perfil (`event_assignments`, `client_users`, `visibility_permissions`, tokens reales para `/c/$token` y eventos publicados para `/e/$slug`).

---

## Entregables

1. **Código corregido durante la noche** — un commit por cada bug claro arreglado, con descripción corta. Lista de cambios al inicio del informe.

2. **Informe final** en `/mnt/documents/qa-report-2026-05-27.md` con cuatro secciones:
   - **Arreglado automáticamente**: archivo, bug, fix.
   - **Pendiente de tu aprobación — rápido (<30 min)**: hallazgo, causa, propuesta, riesgo.
   - **Pendiente de tu aprobación — medio (refactor o RLS)**: hallazgo, causa, opciones, riesgo.
   - **Decisiones de producto**: cosas que parecen mal pero pueden ser intencionales (ej. "cliente no ve botón X" — ¿debería?).

   Cada fila: perfil · ruta · pasos · síntoma · evidencia · severidad (alta/media/baja).

---

## Notas técnicas

- Todo el recorrido en el preview de Lovable, no producción.
- Sesión SQL solo lectura para diagnóstico; ninguna migración sin tu OK.
- Si un fix automático rompe build/lint, lo reverto y lo paso al informe.
- Tras cada perfil hago commit parcial para que puedas revisar incrementalmente por la mañana.

## Confirmación antes de empezar

¿Confirmas las reglas de actuación de arriba (qué arreglo solo vs. qué dejo al informe)? Si me dices "adelante" entro en modo build y empiezo por Fase 1.
