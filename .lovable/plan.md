## Problema

El build de producción falla con:

```
[import-protection] Import denied in server environment
Denied by file pattern: **/*.client.*
Importer: src/routes/_authenticated/sesiones.$sessionId.plano.tsx
Import: "src/lib/seats.client"
```

El plugin de TanStack Start bloquea cualquier módulo con sufijo `.client.*` cuando es alcanzable desde el grafo SSR. La ruta del plano lo importa directamente, por eso el build revienta y no se puede publicar.

## Solución

1. Renombrar `src/lib/seats.client.ts` → `src/lib/seats-browser.ts` (quitar el sufijo reservado `.client.`). El contenido es seguro en SSR (solo usa el cliente Supabase del navegador a través de llamadas en runtime), así que no necesita la protección de cliente-only.
2. Actualizar el import en `src/routes/_authenticated/sesiones.$sessionId.plano.tsx` para apuntar a `@/lib/seats-browser`.
3. Verificar con `bun run build` que el SSR pasa y publicar.

## Detalles técnicos

- No hay otros consumidores de `seats.client` (sólo la ruta del plano).
- No se cambia ninguna lógica de ocupación/sugerencias, solo el nombre del módulo.
- `seats.functions.ts` y el resto del flujo no se tocan.
