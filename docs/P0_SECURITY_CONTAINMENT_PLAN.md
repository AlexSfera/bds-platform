# SYNCRO SHIFT — Plan reversible de contención P0

## Estado y alcance

**Estado:** `PLANIFICADO`

Este documento define una propuesta técnica reversible para contener los
hallazgos `SEC-001` a `SEC-005`, `SEC-007` a `SEC-010`, `SEC-012` y `SEC-013`.
La experiencia de acceso por PIN se conserva, pero el mecanismo actual no se
conserva.

La implementación local en `codex/p0-security-containment` está autorizada. El
plan no autoriza todavía:

- cambios de esquema, datos, grants, RLS, policies, Auth o Storage LIVE;
- despliegues, commits, pushes o cambios adicionales de rama;
- pruebas destructivas o mutaciones de prueba en LIVE.

La auditoría funcional restante queda pausada mientras se decide y prepara la
contención de los P0 confirmados.

## Hechos que condicionan el diseño

1. La aplicación es JavaScript estático desplegado en Vercel y llama
   directamente a Supabase REST y Storage.
2. El navegador utiliza actualmente la clave publicable como `apikey` y como
   identidad Bearer `anon`.
3. Se localizaron accesos directos a Supabase en 16 archivos JavaScript. Cerrar
   el acceso anónimo antes de migrarlos provocaría una interrupción operativa.
4. El acceso actual descarga `employees`, compara el PIN en el navegador y
   guarda el empleado en una variable JavaScript. No existe una sesión
   autenticada ni revocable.
5. LIVE autoriza CRUD anónimo efectivo en 43 tablas, incluida `employees` y las
   cinco tablas POSMEWS.
6. El bucket `adjuntos` es público y admite lectura, inserción, actualización y
   borrado anónimos; no tiene límites configurados de tamaño o MIME.
7. La allowlist de IP del middleware reduce exposición accidental, pero no
   identifica al empleado y no sustituye autenticación ni autorización.
8. No existe actualmente `package.json`; cualquier SDK o dependencia nueva
   deberá introducirse y verificarse de forma explícita durante una corrección
   aprobada.

## Arquitectura objetivo recomendada

### 1. Identidad individual en Supabase Auth

Cada empleado activo tendrá una identidad técnica de Supabase Auth y una
relación server-side entre `auth.users.id` y `employees.id`. No se necesita
correo OTP para entrar. El correo técnico de Auth, si se requiere internamente,
no será el identificador que vea o escriba el empleado.

La interfaz enviará a `/api/auth/login`:

- un identificador individual de empleado; y
- su PIN personal.

El endpoint resolverá la identidad técnica y usará el flujo de contraseña de
Supabase Auth. Supabase almacenará únicamente el hash con salt del secreto. La
aplicación no almacenará una segunda copia del PIN ni su hash en `public`.

Los PIN compartidos por rol y los PIN codificados en JavaScript se retirarán.
Los usuarios privilegiados también tendrán identidad y PIN individuales.

### 2. Sesión y tokens

El login devolverá un access token corto para mantenerlo sólo en memoria del
navegador. El refresh token se guardará en una cookie `Secure`, `HttpOnly`,
`SameSite=Strict` y con prefijo `__Host-`.

Un endpoint `/api/auth/token` renovará el access token después de verificar la
cookie. `/api/auth/logout` revocará la sesión y borrará la cookie. El frontend no
guardará access ni refresh tokens en `localStorage` o `sessionStorage`.

Todas las llamadas directas a Supabase conservarán la clave publicable en
`apikey`, pero enviarán el JWT del empleado en `Authorization`. La clave
publicable seguirá siendo pública; la seguridad dependerá de la sesión y RLS,
no de ocultar esa clave.

### 3. Autorización server-side y RLS

La fuente de permisos será una relación protegida y administrada por servidor
que vincule `auth.uid()` con empleado, estado activo, rol, área y ámbitos
organizativos. Los campos enviados por el navegador no decidirán permisos.

Las policies se diseñarán por tabla y operación:

- `SELECT`: filas propias, asignadas o pertenecientes al ámbito autorizado;
- `INSERT`: valores y ámbito que el actor puede crear;
- `UPDATE`: fila existente y valores nuevos permitidos;
- `DELETE`: sólo roles y estados expresamente autorizados;
- columnas sensibles: separación en recurso protegido, vista segura, RPC o
  grants de columna, según corresponda.

La UI podrá ocultar botones, pero la misma operación deberá ser denegada por
RLS o por un endpoint backend si se intenta directamente.

### 4. Empleados y PIN

`employees.pin` dejará de ser fuente de autenticación. Durante la transición se
mantendrá sólo el tiempo imprescindible para aprovisionar identidades y validar
el corte; después se retirará mediante una migración separada y aprobada.

La lectura general de `employees` desde el navegador se sustituirá por:

- `/api/auth/me` para el perfil de la sesión;
- una vista o endpoint con las columnas mínimas para directorios operativos;
- operaciones administrativas autenticadas y autorizadas por fila y campo.

El alta y el restablecimiento no enviarán un PIN permanente arbitrario recibido
del navegador. El servidor generará un código temporal, de un solo uso lógico,
con caducidad y cambio obligatorio. Se enviará al correo individual cuando
exista; si no existe o el proveedor falla, se mostrará una sola vez al gestor
autorizado para entrega presencial.

### 5. Adjuntos

El bucket `adjuntos` pasará a privado después de migrar los consumidores. Las
policies usarán identidad y relación con el registro propietario. La descarga
se hará mediante sesión autorizada o URL firmada de corta duración.

Antes del corte se definirán y probarán:

- tamaño máximo;
- lista de MIME permitidos y validación real del contenido;
- nombres/rutas no predecibles;
- retirada de EXIF cuando aplique;
- coordinación o compensación entre objeto y metadato;
- denegaciones de lectura, subida, sustitución y borrado ajenos.

### 6. APIs de Vercel

La implementación local añade `/api/auth/provision`, `/api/auth/reset-pin` y
`/api/auth/employee`. Exigen sesión, rol, ámbito y fila; alta/reset construyen
destinatario, actor y PIN en servidor; edición, estado y eliminación rotan la
versión de autorización cuando corresponde. Todas aplican límites por actor, IP
y sistema. `/api/send-email` conserva el camino legacy únicamente con Auth
desactivado y responde 404 en modo seguro. Nada de esto está desplegado todavía.

`/api/bitrix-sync` conservará su autenticación de servicio separada. La
allowlist de IP seguirá como defensa adicional, nunca como identidad de usuario.

## Controles mínimos del PIN reconstruido

- PIN único por persona; ningún PIN compartido por rol.
- Longitud aprobada: seis dígitos aleatorios.
- Identificador individual más PIN en el login.
- Hash y salt administrados por Supabase Auth; ningún PIN en `public`, código,
  documentación, logs o respuestas posteriores al alta.
- Límite de intentos por identidad, IP y sistema, con retraso progresivo y
  bloqueo temporal.
- Mensaje de error genérico que no revele si el empleado existe.
- Registro de éxitos, fallos, bloqueos, resets, cierre de sesión y acciones
  privilegiadas, sin registrar el PIN.
- Revocación de sesiones al desactivar empleado, cambiar PIN o modificar un rol
  sensible.
- PIN temporal de un solo uso y cambio obligatorio para altas y resets.
- Caducidad local predeterminada de 24 horas para el PIN temporal; el valor
  efectivo de producción se verificará antes del corte.
- Segundo control para acciones administrativas críticas pendiente de definir;
  no es necesario para el acceso operativo ordinario.

Un PIN global sin identificador es materialmente más débil: cada intento se
compara implícitamente contra todas las cuentas y cualquier PIN válido abre
alguna identidad. Por ello no se recomienda conservar la pantalla de sólo PIN.

Seis dígitos ofrecen menos combinaciones que los ocho recomendados para un
secreto exclusivamente numérico. La decisión se acepta únicamente junto con el
identificador previo, PIN individual aleatorio, límites por identidad/IP/sistema,
retraso progresivo, bloqueo temporal y vigilancia de intentos distribuidos.

## Despliegue reversible

### Etapa A — Preservación

**Estado:** `PLANIFICADO`

1. Exportar de forma reproducible esquemas, grants, policies y configuración de
   Auth/Storage antes de cualquier cambio.
2. Preparar SQL de avance y SQL de reversión con nombres exactos y alcance
   limitado.
3. Completar la matriz rol × tabla × operación × fila × columna.
4. Definir usuarios y datos de prueba que no sean datos operativos LIVE.
5. Definir ventana de corte, responsable, criterios de aborto y canal de
   comunicación.

No se cambia el comportamiento productivo en esta etapa.

### Etapa B — Base aditiva

**Estado:** `PLANIFICADO`

1. Añadir la relación protegida entre Auth y empleados, sin retirar columnas ni
   policies existentes.
2. Aprovisionar identidades de prueba y configurar Auth.
3. Añadir endpoints de login, token, perfil, logout, alta/reset y auditoría.
4. Añadir cliente de acceso autenticado y feature flag, inicialmente desactivado.
5. Crear policies de `authenticated` sin retirar todavía el camino `anon`.

Reversión: desactivar el feature flag y volver al despliegue anterior. Los
objetos aditivos permanecen inertes para análisis; no es necesario borrarlos de
urgencia.

### Etapa C — Prueba paralela

**Estado:** `PLANIFICADO`

1. Activar el login nuevo sólo para usuarios de prueba.
2. Migrar primero lecturas y después escrituras de los 16 archivos afectados a
   un único helper autenticado.
3. Verificar que no queda ningún `Authorization: Bearer` con la clave publicable
   en flujos de usuario.
4. Añadir policies nuevas para `authenticated` y probarlas mientras `anon`
   continúa disponible para la versión antigua.
5. Cuando una policy heredada dirigida a `PUBLIC` también alcance a
   `authenticated`, usar una policy restrictiva de techo durante la convivencia.
   Las policies permisivas se combinan con `OR`; las restrictivas, con `AND`, y
   debe existir al menos una policy permisiva aplicable.
6. Ejecutar pruebas positivas y negativas por rol, fila, operación y campo.

Reversión: apagar el feature flag. No se retira aún el acceso antiguo, por lo
que el despliegue anterior continúa funcionando.

### Etapa D — Corte coordinado

**Estado:** `PLANIFICADO`

La ejecución requiere autorización expresa porque modifica código y LIVE.

1. Suspender temporalmente operaciones sensibles durante la ventana acordada.
2. Desplegar la versión autenticada y confirmar sesiones de usuarios piloto.
3. En una transacción controlada, retirar policies `anon`/`PUBLIC` abiertas y
   revocar a `anon` los grants no públicos.
4. Confirmar las policies restrictivas de `authenticated` y los grants mínimos.
5. Hacer privado `adjuntos` y activar sus policies autenticadas.
6. Deshabilitar el login anterior, retirar PINs de rol y rotar credenciales
   privilegiadas.
7. Validar operaciones permitidas y denegadas antes de reabrir la operativa.

Reversión de emergencia: restaurar temporalmente las policies y grants exactos
del inventario previo y volver al despliegue anterior. Esta reversión recupera
servicio, pero reabre los P0; sólo se usará ante una interrupción operativa y
durante el tiempo mínimo.

### Etapa E — Retirada y cierre

**Estado:** `PLANIFICADO`

1. Tras el periodo de estabilidad aprobado, retirar `employees.pin`, el código
   de comparación local y las rutas antiguas.
2. Invalidar sesiones y credenciales de transición.
3. Revisar logs y alertas de 401, 403, 429 y operaciones sensibles.
4. Repetir el inventario LIVE de grants, RLS, policies, Auth y Storage.
5. Cambiar hallazgos a `CORREGIDO` y después a `VERIFICADO` únicamente con
   evidencia de pruebas.

La retirada de datos o estructuras antiguas es una migración separada y no forma
parte del primer corte reversible.

## Matriz mínima de pruebas

| Identidad | Caso | Resultado esperado |
|---|---|---|
| Sin sesión | Leer o escribir tablas internas | 401/403, sin efecto |
| Empleado activo | Leer perfil propio | Permitido, columnas mínimas |
| Empleado activo | Leer o modificar empleado ajeno | Denegado salvo permiso explícito |
| Empleado activo | Cambiar rol, coste, PIN o validador | Denegado |
| Responsable | Operar dentro de su ámbito | Permitido según matriz |
| Responsable | Operar fuera de su ámbito | Denegado |
| Admin individual | Acción administrativa autorizada | Permitido y auditado |
| Usuario desactivado | Renovar o usar sesión | Denegado y sesión revocada |
| Cualquier usuario | Repetir PIN incorrecto | 429/bloqueo sin enumerar cuenta |
| Sin sesión | Leer, subir, sustituir o borrar adjunto | Denegado |
| Usuario autorizado | Acceder a adjunto vinculado | Permitido y trazable |
| Usuario autenticado | Manipular JWT, ID, rol o departamento | Denegado |

Cada prueba de escritura se ejecutará con datos controlados y verificará tanto
el HTTP recibido como el efecto real en base de datos o Storage.

## Observabilidad y criterios de aborto

El corte se abortará y se aplicará la reversión si ocurre cualquiera de estos
casos:

- un usuario sin sesión obtiene datos internos;
- una identidad modifica una fila o campo fuera de su matriz;
- una operación crítica autorizada falla de forma generalizada;
- aparecen pérdidas, duplicados o divergencias entre Storage y metadatos;
- no se puede revocar una sesión o una credencial comprometida;
- el despliegue nuevo necesita recurrir silenciosamente a `anon`.

Se monitorizarán logins, fallos, bloqueos, refresh, cierres de sesión, 401/403,
429, altas/resets, cambios de rol y operaciones administrativas. Los logs no
incluirán PIN, tokens, claves ni contenido sensible.

## Datos y decisiones pendientes

- Matriz funcional completa por rol, tabla, operación, fila y columna:
  `[NO DATA]`.
- Disponibilidad de correo individual para todos los empleados: `[NO DATA]`.
- Plan y límites actuales de Supabase Auth aplicables al proyecto: `[NO DATA]`.
- Plan de Vercel y límites efectivos de Functions: `[NO DATA]`.
- Requisitos de tiempo de sesión e inactividad: `[NO DATA]`.
- Política de segundo control para administradores: `[NO DATA]`.
- Identificador visible aprobado: selección del nombre del empleado.
- Longitud aprobada del PIN personal: seis dígitos.

## Decisión resuelta

El 08/08/2026 se aprobó sustituir el acceso de sólo PIN por **selección del
empleado más PIN personal de seis dígitos**. Esta decisión permite limitar
intentos por cuenta, eliminar PIN compartido y asociar la sesión a una persona
antes de autorizar datos.

También se aprobó la entrega híbrida del PIN temporal: correo individual cuando
exista y entrega presencial cuando no exista. La implementación local añade
fallback presencial si el proveedor de correo falla, sin registrar ni devolver
posteriormente el PIN.

La implementación aditiva y la migración base pueden prepararse localmente en
la rama autorizada. No se desplegará el código ni se ejecutará ninguna migración
en LIVE sin una autorización posterior específica.

## Referencias técnicas

- [Supabase Auth](https://supabase.com/docs/guides/auth): identidad JWT integrada
  con RLS.
- [Autenticación con contraseña](https://supabase.com/docs/guides/auth/passwords):
  flujo de acceso con email o teléfono y contraseña.
- [Seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security):
  hash `bcrypt` con salt y recomendación de ocho caracteres como mínimo.
- [Sesiones de usuario](https://supabase.com/docs/guides/auth/sessions): access
  token, refresh token, renovación y revocación.
- [Límites de Auth](https://supabase.com/docs/guides/auth/rate-limits): límites de
  frecuencia y tratamiento de IP cuando existe un proxy.
- [RBAC y claims](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac):
  atributos de autorización consumidos por policies.
- [RLS de PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html):
  combinación de policies permisivas y restrictivas.
