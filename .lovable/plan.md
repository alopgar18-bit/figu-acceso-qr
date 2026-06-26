## Lanzar toda la cola pendiente

Confirmado: **todos** los pendientes · remitente **casting@figurarte.app** · Wati con saldo.

## Pasos al pasar a build

1. **Conteo inicial** (`communication_logs` con `status = 'pendiente'` y `archived_at IS NULL`):
   - Por canal (email / whatsapp_business / whatsapp_asistido).
   - Detectar y excluir filas sin `to_address` para no inflar el contador de fallos.

2. **Emails** — invocar `send-email` en bucle por lotes de 200 IDs con `from = "Figurarte Casting <casting@figurarte.app>"` hasta vaciar la cola. Reporto `enviados / fallidos` por lote.

3. **WhatsApp (Wati)** — invocar `send-whatsapp` con todos los IDs pendientes. La función ya los procesa en background; hago polling cada ~5 s sobre esos IDs y reporto progreso. Si aparece `WATI_NO_CREDITS`, paro y aviso.

4. **Resumen final** por canal: enviados, fallidos (con motivo agregado), y cualquier residual pendiente.

5. **Si quedan fallidos recuperables** (rate limit, timeouts), los dejo en `fallido` listos para reintento desde la pantalla de Cola — no los reencolo automáticamente para no entrar en bucle.

Apruébame el plan y lo ejecuto inmediatamente.
