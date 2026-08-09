# SYNCRO SHIFT — Implementación local de Auth P0

## Estado

**Estado:** `CORREGIDO` exclusivamente en la rama local
`codex/p0-security-containment` y con los dos flags desactivados.

Este estado no significa que `SEC-013` esté corregido en producción. No se ha
desplegado código ni se han ejecutado migraciones o cambios en Supabase LIVE.
El hallazgo maestro continúa `PLANIFICADO` hasta completar el corte.

## Protección contra activación accidental

El camino nuevo necesita simultáneamente:

1. cambiar `AUTH_ENABLED` a `true` en `auth-client.js`; y
2. configurar `SYNCRO_AUTH_ENABLED=true` en el servidor.

Con `AUTH_ENABLED=false`, el cliente conserva el transporte legacy y no llama al
flujo nuevo. Con `SYNCRO_AUTH_ENABLED=false`, las rutas `/api/auth/*` responden
como inexistentes. Ambos deben estar en `true` para el corte completo de la UI;
ninguno de los flags ejecuta por sí mismo una migración o altera Supabase.

## Componentes implementados

### Backend Auth

- `GET /api/auth/directory`: directorio mínimo de empleados activos por portal;
  nunca devuelve PIN, correo o coste.
- `POST /api/auth/login`: identificador seleccionado + PIN exacto de seis
  dígitos; comprobación de origen, rate limit atómico y respuesta genérica.
- `POST /api/auth/token`: renueva la sesión mediante refresh token en cookie.
- `GET /api/auth/me`: devuelve únicamente el perfil mínimo de la sesión.
- `POST /api/auth/change-pin`: revalida el PIN temporal, rechaza secuencias
  simples y PIN ya asignados, cambia el PIN, incrementa la versión de
  autorización y revoca la sesión.
- `POST /api/auth/logout`: revoca la sesión y elimina la cookie.
- `POST /api/auth/provision`: exige sesión y autorización de gestión, deriva el
  área desde el puesto, crea empleado e identidad Auth sin guardar el PIN en
  `employees` y entrega un PIN temporal generado por el servidor.
- `POST /api/auth/reset-pin`: exige sesión, rol, ámbito y fila autorizados;
  genera el PIN en servidor, fuerza su cambio e invalida los tokens anteriores.
- `PATCH|DELETE /api/auth/employee`: aplica la misma matriz a edición,
  activación/baja y eliminación; los cambios de autorización rotan la versión y
  la eliminación exige admin, estado Baja, auditoría previa y prohíbe borrar la
  propia cuenta.

Alta y reset tienen límites independientes por actor, IP y sistema. El PIN
temporal caduca por defecto a las 24 horas, configurable entre 5 minutos y 7
días. La huella HMAC que impide PIN duplicados usa un secreto server-side
separado; ni esa huella ni el PIN se entregan a usuarios no autorizados.

El access token permanece sólo en memoria. El refresh token no aparece en JSON
y utiliza cookie `__Host-`, `Secure`, `HttpOnly` y `SameSite=Strict`.

### Cliente

- la tarjeta de empleado conserva ahora el `employee_id` seleccionado;
- el modo seguro exige exactamente seis dígitos;
- altas con `force_pin_change` no pueden entrar hasta cambiar el PIN;
- existe restauración de sesión y logout server-side;
- 85 llamadas REST/Storage directas de 15 archivos pasan por
  `syncroSupabaseFetch()`;
- alta y reset ya no permiten que el navegador elija el PIN, destinatario o
  nombre del actor en modo seguro;
- los dos POST legacy de correo permanecen sólo para compatibilidad con el modo
  desactivado; `/api/send-email` responde 404 cuando Auth seguro está activo.

La autorización backend reproduce de forma conservadora la matriz frontend:
admin gestiona todo; adjunto no gestiona cuentas admin; F&B queda limitado a su
ámbito; los responsables sólo gestionan empleados de sus departamentos. La
misma capa cubre alta, edición, estado, reset y eliminación. Las restantes
tablas todavía necesitan sus policies/RPC antes del corte.

### Middleware

Cuando el modo seguro se active, la lectura server-side de `employee_ips`
exigirá `SUPABASE_SERVICE_KEY`. No existe fallback a `anon` en modo seguro. Si
falta la clave, sólo continúan funcionando las IP estáticas y la incidencia
queda en el log.

### Migraciones preparadas y verificación local

- `supabase/migrations/202608080001_p0_auth_foundation.sql`:
  relación Auth↔empleado, huella única, caducidad temporal, rate limit,
  auditoría, versión de autorización y contexto RLS. Aplicada dos veces sin
  error sobre PostgreSQL 17.10 local para comprobar sintaxis e idempotencia.
- `supabase/rollback/202608080001_p0_auth_foundation_rollback.sql`:
  reversión destructiva únicamente antes del corte y con aprobación. Verificada
  en una segunda base local aislada, confirmando la retirada de las tres tablas
  y las funciones nuevas.
- `supabase/migrations/202608080002_p0_rls_cutover_TEMPLATE.sql`:
  plantilla deliberadamente no ejecutable hasta completar la matriz de las 51
  tablas.

Las nuevas tablas propuestas revocan todo acceso a `public`, `anon` y
`authenticated`; las operaciones de login quedan reservadas a `service_role`.
La función de contexto sólo devuelve al usuario autenticado su propia relación
de autorización. Devuelve vacío mientras exista cambio obligatorio de PIN o si
la versión del JWT no coincide con la versión vigente de la identidad.

## Variables de entorno

Se documentaron sin valores en `.env.example`:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_KEY`;
- `SUPABASE_PUBLISHABLE_KEY`;
- `SYNCRO_AUTH_ENABLED=false`;
- `SYNCRO_AUTH_RATE_LIMIT_SECRET`;
- `SYNCRO_AUTH_PIN_FINGERPRINT_SECRET`;
- `SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN`;
- `SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES=1440`;
- `SYNCRO_EMAIL_FROM` y `RESEND_API_KEY`.

Los secretos no deben copiarse al frontend, documentación, logs o repositorio.

## Verificación local

Comandos ejecutados:

```text
npm test
npm run check
node --check <todos los archivos JavaScript>
git diff --check
psql <fixture + migración base repetida + pruebas SQL>
psql <fixture + migración base + rollback + pruebas de retirada>
node --test tests/auth-supabase-e2e.test.js <contra Supabase local>
```

Resultado actual:

- 20 pruebas ordinarias superadas y una prueba E2E Supabase adicional superada
  cuando se habilita explícitamente el entorno local;
- 0 pruebas fallidas;
- sintaxis JavaScript válida;
- sin errores de whitespace;
- comprobación estática: las 85 llamadas Supabase auditadas usan el transporte
  central;
- comprobación de compatibilidad: con Auth desactivado el wrapper devuelve la
  petición legacy sin modificar;
- comprobaciones de alta/reset: PIN generado en servidor, ausencia de PIN en
  `employees`, respuesta sin PIN cuando el correo funciona, visualización única
  para entrega presencial y denegación fuera de ámbito;
- comprobación de estado del empleado: desactivación server-side y rotación de
  versión en identidad y Supabase Auth;
- PostgreSQL 17.10 local: migración base aplicada dos veces, RLS activado en las
  tres tablas, ausencia de grants directos para `anon`/`authenticated`, acceso
  de `service_role`, contexto vacío para PIN temporal, empleado inactivo o JWT
  obsoleto, unicidad case-insensitive de correo y de huella HMAC;
- rate limit SQL verificado: intento 11 bloqueado y bloqueo tras cinco fallos,
  con eventos de auditoría;
- rollback aplicado en una base separada y verificado;
- colisión simulada de PIN: el servidor descarta el primer candidato y genera
  otro antes de crear la identidad;
- stack local real de Supabase verificado con Postgres, Auth, PostgREST, Kong y
  Mailpit; sus puertos `54321`, `54322` y `54324` quedaron vinculados
  exclusivamente a `127.0.0.1`;
- E2E local verificado con un empleado ficticio: alta de usuario Auth, PIN
  temporal aleatorio de seis dígitos, ausencia de PIN en claro en `employees`,
  login, cambio obligatorio a PIN personal, revocación de sesión y PIN
  anteriores, nuevo login y eventos de auditoría;
- peticiones anónimas reales a `employees` y `syncro_auth_identities` rechazadas
  por PostgREST con HTTP 401.

Las pruebas usan PostgreSQL real y una fixture mínima separada, marcada como
exclusiva de test, para suplir la ausencia de una migración base versionada de
`employees`. La integración Auth/PostgREST ya está confirmada sobre esa fixture;
aún falta repetirla con el esquema operativo completo y la matriz definitiva de
policies. No se ha tocado LIVE ni se han usado empleados o PIN reales.

## Trabajo pendiente antes de activar

- confirmar en la configuración objetivo no productiva y posteriormente LIVE
  que Auth mantiene longitud mínima compatible con PIN de seis dígitos;
- completar la matriz de permisos de las 51 tablas;
- crear y probar policies `authenticated` y sus denegaciones;
- diseñar grants/policies de columnas para que la lectura general de
  `employees` no entregue PIN, coste o correo fuera de los roles autorizados;
- diseñar las policies y URLs firmadas de `adjuntos`;
- ampliar la integración local ya superada al esquema operativo completo y a
  todas las policies/RPC de la matriz;
- aprovisionar las identidades iniciales sin reutilizar los PIN legacy;
- definir ventana de corte y autorización LIVE.

## Decisión de entrega resuelta

El 08/08/2026 se aprobó el canal híbrido:

1. correo individual cuando exista y el proveedor confirme el envío;
2. entrega presencial cuando no haya correo;
3. fallback presencial, mostrando el PIN una sola vez, si el proveedor de
   correo falla después de crear o restablecer el acceso.

Esto no convierte el login habitual en correo OTP. El correo sólo transporta el
PIN temporal del alta o restablecimiento; después el empleado entra con su
nombre y PIN personal.
