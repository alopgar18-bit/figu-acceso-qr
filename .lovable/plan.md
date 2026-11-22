# Importación Canarias 25 nov: no está colgada

## Situación actual (comprobada)
- El lote va avanzando: hay 12 de 27 tramos terminados y el 13 se está procesando ahora. Quedan unos 15 tramos de 20 filas.
- El contador «Importadas: 0» no se refresca bien en pantalla y, además, las filas que ya existían cuentan como actualizadas, no como importadas. Por eso parece parado.
- Hay 3 errores reales (filas 158, 159 y 176). Esas butacas ya las ocupa una persona «VIS 2» creada en la importación anterior: mismo asiento y misma zona, así que la regla nueva acierta al bloquearlas.

## Pasos
1. Dejar que termine. No hay que borrar ni relanzar nada. Si un tramo falla, se reintenta solo.
2. Cuando acabe, revisar las 3 filas: comprobar si cada «VIS 2» es la misma persona que la del Excel, creada por duplicado en la importación fallida. Te propongo para cada caso quedarnos con la ficha buena y cancelar la otra, para liberar la butaca. No lo hago sin tu confirmación.
3. Opcional: arreglar el contador de la pantalla para que se actualice solo y muestre también las filas actualizadas.
