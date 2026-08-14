# P0 — Contención de Storage `adjuntos`

**Estado LIVE:** `CONFIRMADO` como exposición pendiente (`SEC-012`).
**Estado local:** `VERIFICADO` para migración, doble aplicación y rollback en
fixture PostgreSQL; integración real de Storage y navegador `[NO DATA]`.

## Alcance preparado

La preparación local sustituye las URLs públicas por URLs firmadas de cinco
minutos y las subidas públicas por URLs firmadas de subida. Los endpoints exigen
una sesión Auth vigente, que no esté pendiente de cambio de PIN, y comprueban
que la sesión puede leer el registro padre antes de emitir la firma.

La migración `20260814192801_p0_private_attachments.sql`:

- conserva todos los objetos y todos los arrays `adjuntos` existentes;
- guarda la configuración anterior del bucket y las policies afectadas en
  `syncro_private`;
- cambia `adjuntos` a privado;
- retira las policies que mencionan expresamente ese bucket;
- limita cada archivo a 10 MiB;
- admite únicamente JPEG, PNG, WebP, PDF, CSV, XLSX y DOCX.

Las imágenes nuevas se recodifican en el navegador antes de subirlas. Esto
retira EXIF y otros metadatos embebidos; si la limpieza falla, la imagen no se
sube. Los objetos ya existentes no se transforman en esta fase.

## Consistencia preparada

- Si una subida termina pero falla la persistencia de metadatos, el cliente
  intenta retirar los objetos recién creados y comunica error.
- En una eliminación, primero se retira la referencia; si falla la eliminación
  del objeto, el cliente intenta restaurar el array anterior y comunica error.
- No se registra ni muestra éxito si `dbUpdate()` devuelve error.

La actualización del array completo todavía puede colisionar con otra sesión.
`SUP-012` continúa `CONFIRMADO`; resolverla requiere una operación atómica y las
reglas definitivas de escritura por fila.

## Riesgo residual de autorización

La comprobación del registro padre hereda la contención autenticada intermedia.
Por ello bloquea a `anon`, pero todavía no separa correctamente todos los
usuarios autenticados. No debe confundirse con autorización definitiva por
rol, departamento y fila. Las decisiones empresariales pendientes de
`docs/P0_RLS_ACCESS_MATRIX.md` continúan `[NO DATA]`.

## Preflight obligatorio antes de LIVE

1. Confirmar por catálogo el bucket, sus límites, sus policies y el número
   agregado de objetos, sin descargar contenido.
2. Confirmar que cada referencia actual pertenece a `gestiones`, `incidencias`
   o `tareas`; cualquier otra tabla o formato queda `[NO DATA]` hasta resolverlo.
3. Desplegar primero el código compatible con URLs firmadas y verificarlo con
   un objeto ficticio no sensible en Preview.
4. Probar lectura, subida y eliminación con sesión válida; probar 401/403 sin
   sesión y comprobar la compensación ante fallo de metadatos.
5. Aplicar la migración sólo después de validar Preview y disponer de una
   ventana de rollback.
6. Repetir las pruebas en Production y confirmar que ningún objeto ni referencia
   cambió de cardinalidad.

## Rollback

`supabase/rollback/20260814192801_p0_private_attachments_rollback.sql` restaura
la configuración previa del bucket y recrea las policies guardadas. No modifica
objetos. Su ejecución LIVE requiere aprobación explícita.

## Resultado de pruebas locales — 14/08/2026

- migración aplicada dos veces en una base PostgreSQL temporal aislada;
- bucket privado, límite y MIME verificados;
- policies específicas retiradas y copia reconstruible confirmada;
- objeto fixture y cardinalidad conservados;
- rollback completo verificado;
- base temporal eliminada;
- pruebas JavaScript y sintaxis verificadas.

La migración no se ha aplicado a LIVE.
