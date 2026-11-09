# Importación «espera.xlsx»: no está parada, va lenta

## Estado actual (comprobado ahora)
- La importación sigue avanzando: ya van 1.558 de 1.704 filas (la pantalla marcaba 1.500 porque no se había refrescado).
- Quedan 7 tandas de 86, todas en espera y sin errores. No se ha perdido nada ni hay duplicados.
- Cuando la pestaña está cerrada o en segundo plano, el vigilante del servidor procesa solo una tanda por minuto. Por eso parece atascada al final.

## Qué haré
1. Que el vigilante procese varias tandas seguidas en cada pasada (hasta unos 40 segundos de trabajo), no solo una. Una importación de 1.700 filas pasaría de ~85 minutos a unos pocos minutos aunque cierres la pestaña.
2. Que la pantalla del lote se refresque sola cada pocos segundos mientras está «procesando», para que veas el avance real.
3. No cambiar nada de la detección de duplicados, de las butacas ni de las entradas.

## Ahora mismo
No hace falta hacer nada: las 7 tandas que faltan terminarán solas en unos 7 minutos. No relances el Excel ni borres el lote.

## Detalles técnicos
- Tick de jobs: bucle claim_import_chunk + proceso hasta presupuesto de tiempo (~40 s) por batch.
- Página de detalle del lote: refetchInterval 5 s mientras status = procesando.
