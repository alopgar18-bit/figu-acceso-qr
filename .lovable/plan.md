## Diagnóstico

Los logs de `send-whatsapp` muestran que **todos los envíos fallan con el mismo error de Wati**:

```
400 {"result":false,"info":"Not enough credits to send the message"}
```

El código funciona — **la cuenta de Wati no tiene saldo**. Wati rechaza cada petición antes de entregarla.

## Plan

### 1. Acción del usuario (fuera del código)
- **Recargar créditos en Wati** (panel Wati → Billing / Wallet). Sin esto no hay envío posible.
- Verificar que la plantilla `entrada_grabacin` sigue aprobada por Meta.

### 2. Cambios en el código

**a) `supabase/functions/send-whatsapp/index.ts`**
- Detectar la respuesta `"Not enough credits"` de Wati.
- Escribir un motivo legible en `communication_logs.whatsapp_failed_detail`: *"Sin créditos en Wati — recarga la cuenta antes de reintentar"*.
- Guardar `metadata.wati_error_code = "WATI_NO_CREDITS"` para poder filtrar después.
- **Circuit breaker**: al detectar el error, abortar el resto del lote y marcar los pendientes como `fallido` con el mismo motivo (sin gastar más llamadas a Wati).
- Devolver `error_code: "WATI_NO_CREDITS"` en la respuesta JSON.

**b) `src/routes/_authenticated/comunicaciones.cola.tsx`**
- Tras invocar `send-whatsapp`, si la respuesta trae `error_code === "WATI_NO_CREDITS"`, mostrar un toast de error claro y de larga duración: *"Wati ha rechazado los envíos por falta de créditos. Recarga tu cuenta de Wati y vuelve a intentarlo."*
- Añadir botón **"Reintentar fallidos sin créditos"** que busca los logs WhatsApp en estado `fallido` con `metadata.wati_error_code = "WATI_NO_CREDITS"` y los vuelve a poner a `pendiente` (reutilizando `retryCommunication`), de manera que tras recargar Wati no haya que regenerar el envío masivo.

## Archivos modificados
- `supabase/functions/send-whatsapp/index.ts`
- `src/routes/_authenticated/comunicaciones.cola.tsx`

Confirmado por el usuario ("hazlo todo") — listo para pasar a build mode e implementarlo.