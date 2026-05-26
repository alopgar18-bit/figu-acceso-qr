## Plan de pruebas E2E con los 3 asistentes reales

Vas a permitir envíos reales a Yuri, Alejandro y Javier. Procedo con el test completo end-to-end sobre el evento "El Perro Andaluz".

### Pasos

1. **Verificar estado inicial** de los 3 participantes (status, ticket_id, confirmation_token) en BBDD.
2. **Aprobar solicitudes** pendientes (si las hay) → status `aprobado`.
3. **Generar QR / ticket** para cada uno → status `qr_generado`.
4. **Enviar email de invitación/QR real** a los 3 vía Lovable Email (template existente) — un envío por persona, con `idempotencyKey` único.
5. **Verificar logs**: consultar `email_send_log` para confirmar `sent` en los 3 (dedupe por `message_id`).
6. **Simular check-in** de 1 de los 3 escaneando QR (registro en `checkins`).
7. **Probar exportaciones**: CSV, PDF y Excel del listado de asistentes del evento.
8. **Probar control de acceso**: verificar que los roles ven lo correcto en sidebar/dashboard.
9. **NO ejecutar anonimización** sobre los reales (sería destructivo) — la dejo documentada como probada solo en QA si quieres después.

### Qué NO se toca

- No se borra ni anonimiza a Yuri/Alejandro/Javier.
- No se modifican los 3 clientes/productoras.
- No se crean datos de prueba adicionales.

### Riesgos

- Los 3 recibirán **emails reales** en sus bandejas. Asegúrate de haberles avisado.
- Si algún email rebota, quedará en `suppressed_emails` y futuros envíos a esa dirección se bloquearán automáticamente.

¿Apruebo el plan y ejecuto?