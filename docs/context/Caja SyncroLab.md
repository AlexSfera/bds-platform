En este texto :
Contexto:
Estamos definiendo el módulo Caja SYNCROLAB dentro de la plataforma interna SYNCROSFERA.

SYNCROLAB tiene una particularidad operativa:
- Trabaja con dos sistemas operativos separados: Nubimed y FlyBy.
- Tiene un TPV físico unificado.
- Puede generar cargos a MEWS desde Nubimed y desde FlyBy.
- El Dashboard debe controlar diferencias de caja y conciliaciones con Recepción Hotel.

Importante:
- Escribir siempre SYNCROLAB, Nubimed, FlyBy, MEWS, TPV.
- No escribir MUSE.
- No escribir TPU.
- Usar MEWS para cargos habitación.
- Usar TPV para pagos con tarjeta física.

Objetivo:
Crear / ajustar el formulario de Caja SYNCROLAB con bloques separados para Nubimed, FlyBy, TPV conjunto, totales, diferencias, explicación y fondo final.

La caja debe ser clara para usuario operativo, con cálculos automáticos, validación de diferencias, persistencia correcta y reflejo en Dashboard.

==================================================
1. ESTRUCTURA GENERAL CAJA SYNCROLAB
==================================================

Caja SYNCROLAB debe dividirse visualmente en estos bloques:

1. Nubimed / Clínica
2. FlyBy
3. TPV conjunto
4. Totales SYNCROLAB
5. Diferencias y explicación
6. Fondo final
7. Dashboard / conciliación

Regla:
No mezclar Nubimed y FlyBy en un único bloque.
Cada sistema debe tener sus propios campos sistema y campos reales.

==================================================
2. BLOQUE NUBIMED / CLÍNICA
==================================================

Crear bloque llamado:

“Nubimed / Clínica”

Campos sistema Nubimed:
- Fondo inicial Nubimed
- Cash Nubimed
- Tarjeta Nubimed
- Stripe Nubimed
- Cargo MEWS Nubimed

Campos reales Nubimed:
- Cash real Nubimed
- Stripe plataforma Nubimed
- TPV Nubimed

Campos calculados Nubimed:
- Diferencia Cash Nubimed
- Diferencia Stripe Nubimed

Fórmulas Nubimed:
- Diferencia Cash Nubimed = Cash real Nubimed - Cash Nubimed
- Diferencia Stripe Nubimed = Stripe plataforma Nubimed - Stripe Nubimed

Reglas Nubimed:
- Fondo inicial Nubimed es editable.
- Cash Nubimed es valor sistema.
- Tarjeta Nubimed es valor sistema.
- Stripe Nubimed es valor sistema.
- Cargo MEWS Nubimed es importe de cargo a habitación / MEWS.
- Cash real Nubimed es valor contado real.
- Stripe plataforma Nubimed es valor real de Stripe.
- TPV Nubimed es la parte del TPV atribuida a Nubimed.
- En Nubimed NO comparar Tarjeta Nubimed de forma aislada contra un TPV real independiente.
- La tarjeta Nubimed entra en el control del TPV conjunto.
- Si Cash real Nubimed está vacío, calcular como 0 pero no mostrar NaN.
- Si Stripe plataforma Nubimed está vacío, calcular como 0 pero no mostrar NaN.
- No mostrar null, undefined, NaN, JSON ni IDs internos.

==================================================
3. BLOQUE FLYBY
==================================================

Crear bloque llamado:

“FlyBy”

Campos sistema FlyBy:
- Fondo inicial FlyBy
- Cash FlyBy
- Tarjeta FlyBy
- Stripe FlyBy
- Cargo MEWS FlyBy

Campos reales FlyBy:
- Cash real FlyBy
- Stripe plataforma FlyBy
- TPV FlyBy

Campos calculados FlyBy:
- Diferencia Cash FlyBy
- Diferencia Stripe FlyBy

Fórmulas FlyBy:
- Diferencia Cash FlyBy = Cash real FlyBy - Cash FlyBy
- Diferencia Stripe FlyBy = Stripe plataforma FlyBy - Stripe FlyBy

Reglas FlyBy:
- Fondo inicial FlyBy es editable.
- Cash FlyBy es valor sistema.
- Tarjeta FlyBy es valor sistema.
- Stripe FlyBy es valor sistema.
- Cargo MEWS FlyBy es importe de cargo a habitación / MEWS.
- Cash real FlyBy es valor contado real.
- Stripe plataforma FlyBy es valor real de Stripe.
- TPV FlyBy es la parte del TPV atribuida a FlyBy.
- En FlyBy NO comparar Tarjeta FlyBy de forma aislada contra un TPV real independiente.
- La tarjeta FlyBy entra en el control del TPV conjunto.
- Si Cash real FlyBy está vacío, calcular como 0 pero no mostrar NaN.
- Si Stripe plataforma FlyBy está vacío, calcular como 0 pero no mostrar NaN.
- No mostrar null, undefined, NaN, JSON ni IDs internos.

==================================================
4. BLOQUE TPV CONJUNTO
==================================================

Crear bloque llamado:

“TPV conjunto”

SYNCROLAB tiene un único TPV físico compartido para Nubimed y FlyBy.

Campos:
- TPV Nubimed
- TPV FlyBy
- TPV real total
- TPV esperado total
- TPV asignado total
- Diferencia TPV total
- Diferencia asignación TPV

Fórmulas:
- TPV esperado total = Tarjeta Nubimed + Tarjeta FlyBy
- TPV asignado total = TPV Nubimed + TPV FlyBy
- Diferencia TPV total = TPV real total - TPV esperado total
- Diferencia asignación TPV = TPV real total - TPV asignado total

Reglas:
- TPV Nubimed es editable.
- TPV FlyBy es editable.
- TPV real total es editable.
- TPV esperado total es calculado readonly.
- TPV asignado total es calculado readonly.
- Diferencia TPV total es calculado readonly.
- Diferencia asignación TPV es calculado readonly.
- TPV Nubimed + TPV FlyBy debe coincidir con TPV real total.
- Si TPV Nubimed + TPV FlyBy no coincide con TPV real total, mostrar alerta:
  “El TPV total no coincide con la suma de TPV Nubimed + TPV FlyBy.”
- Si TPV real total no coincide con Tarjeta Nubimed + Tarjeta FlyBy, mostrar diferencia TPV total.
- Si cualquier diferencia TPV es distinta de 0, exigir explicación, acción tomada e informado responsable.
- No convertir falta de dato en 0 falso en Dashboard.
- En formulario, para evitar NaN, campos vacíos pueden calcular como 0.
- En Dashboard, si falta dato real, mostrar “Falta dato”.

==================================================
5. BLOQUE TOTALES SYNCROLAB
==================================================

Crear bloque llamado:

“Totales SYNCROLAB”

Campos calculados:
- Cash total sistema
- Cash total real
- Diferencia Cash total
- Stripe total sistema
- Stripe total real
- Diferencia Stripe total
- TPV esperado total
- TPV real total
- Diferencia TPV total
- Cargo MEWS total SYNCROLAB

Fórmulas:
- Cash total sistema = Cash Nubimed + Cash FlyBy
- Cash total real = Cash real Nubimed + Cash real FlyBy
- Diferencia Cash total = Cash total real - Cash total sistema

- Stripe total sistema = Stripe Nubimed + Stripe FlyBy
- Stripe total real = Stripe plataforma Nubimed + Stripe plataforma FlyBy
- Diferencia Stripe total = Stripe total real - Stripe total sistema

- TPV esperado total = Tarjeta Nubimed + Tarjeta FlyBy
- TPV real total = TPV real total introducido por usuario
- Diferencia TPV total = TPV real total - TPV esperado total

- Cargo MEWS total SYNCROLAB = Cargo MEWS Nubimed + Cargo MEWS FlyBy

Reglas:
- Todos los campos de totales deben ser readonly.
- Mostrar etiqueta “Calculado automáticamente”.
- Actualizar en tiempo real.
- Persistir o recalcular correctamente al recargar.
- Mostrar importes en formato €.
- No mostrar NaN, null, undefined ni errores internos.

==================================================
6. BLOQUE DIFERENCIAS Y EXPLICACIÓN
==================================================

Crear bloque llamado:

“Diferencias y explicación”

Campos:
- Explicación diferencia
- Acción tomada
- Informado responsable

Reglas:
Los campos Explicación diferencia, Acción tomada e Informado responsable son obligatorios si ocurre cualquiera de estas situaciones:

- Diferencia Cash Nubimed ≠ 0
- Diferencia Stripe Nubimed ≠ 0
- Diferencia Cash FlyBy ≠ 0
- Diferencia Stripe FlyBy ≠ 0
- Diferencia Cash total ≠ 0
- Diferencia Stripe total ≠ 0
- Diferencia TPV total ≠ 0
- Diferencia asignación TPV ≠ 0
- Fondo real ≠ Fondo esperado a traspasar

Informado responsable:
- Debe ser selector Sí / No.
- Debe persistir correctamente.
- No mostrar valores técnicos.

Mensaje de error:
“Hay diferencias de caja. Añade explicación, acción tomada e indica si se informó al responsable.”

Reglas:
- No permitir validar Caja SYNCROLAB con diferencias sin explicación.
- No permitir validar Caja SYNCROLAB con diferencias sin acción tomada.
- No permitir validar Caja SYNCROLAB con diferencias sin informar si se avisó al responsable.
- Usuario lineal no puede validar.
- Admin puede validar.
- Jefe Recepción SYNCROLAB puede validar si tiene permiso configurado.

==================================================
7. BLOQUE FONDO FINAL
==================================================

Crear bloque llamado:

“Fondo final”

Campos:
- Retiro caja fuerte
- Fondo esperado a traspasar
- Fondo real

Fórmula:
- Fondo esperado a traspasar = Fondo inicial Nubimed + Fondo inicial FlyBy + Cash real Nubimed + Cash real FlyBy - Retiro caja fuerte

Reglas:
- Retiro caja fuerte es editable.
- Fondo esperado a traspasar es calculado readonly.
- Fondo real es editable.
- Comparar Fondo real contra Fondo esperado a traspasar.
- Si Fondo real ≠ Fondo esperado a traspasar, mostrar alerta:
  “El fondo real no coincide con el fondo esperado a traspasar.”
- Si hay diferencia de fondo, exigir explicación, acción tomada e informado responsable.
- No incluir TPV en fondo esperado.
- No incluir Stripe en fondo esperado.
- No incluir Cargo MEWS en fondo esperado.
- No incluir tarjeta en fondo esperado.
- No mostrar NaN.

==================================================
8. CARGO MEWS Y CONCILIACIÓN CON RECEPCIÓN HOTEL
==================================================

SYNCROLAB debe tener cargos MEWS separados por origen:

Campos:
- Cargo MEWS Nubimed
- Cargo MEWS FlyBy
- Cargo MEWS total SYNCROLAB

Fórmula:
- Cargo MEWS total SYNCROLAB = Cargo MEWS Nubimed + Cargo MEWS FlyBy

Conciliación Dashboard:
- Origen A: Recepción Hotel / SYNCROLAB Charge talonario
- Origen B: Caja SYNCROLAB / Cargo MEWS total SYNCROLAB

Reglas:
- Si ambos valores coinciden, estado = Conciliado.
- Si son distintos, estado = Diferencia.
- Si falta cierre Recepción Hotel o falta Caja SYNCROLAB, estado = Falta dato.
- No usar Cargo MEWS Nubimed y Cargo MEWS FlyBy por separado para conciliar con Recepción si Recepción solo tiene un total.
- Mostrar desglose Nubimed / FlyBy como detalle.
- Mostrar total como valor conciliable.

==================================================
9. DASHBOARD CAJA SYNCROLAB
==================================================

En Dashboard, Caja SYNCROLAB debe mostrar:

Resumen:
- Cash total sistema
- Cash total real
- Diferencia Cash total
- Stripe total sistema
- Stripe total real
- Diferencia Stripe total
- TPV esperado total
- TPV real total
- Diferencia TPV total
- Diferencia asignación TPV
- Cargo MEWS total SYNCROLAB
- Fondo esperado a traspasar
- Fondo real
- Diferencia fondo

Conciliaciones:
1. SYNCROLAB Charge talonario Recepción Hotel
   vs
   Cargo MEWS total SYNCROLAB

2. TPV real total
   vs
   TPV Nubimed + TPV FlyBy

3. TPV real total
   vs
   Tarjeta Nubimed + Tarjeta FlyBy

Estados:
- Conciliado
- Diferencia
- Falta dato
- Informativo
- [NO DATA]

Reglas visuales:
- Verde: Conciliado
- Rojo: Diferencia
- Amarillo: Falta dato
- Gris: Informativo / [NO DATA]
- No mostrar nombres de tablas.
- No mostrar IDs internos.
- No mostrar JSON.
- No mostrar NaN.
- No mostrar null.
- No mostrar undefined.

==================================================
10. VALIDACIÓN DE CAJA SYNCROLAB
==================================================

En módulo Validación → Cierres de caja debe aparecer Caja SYNCROLAB.

Mostrar:
- Fecha
- Turno si existe
- Responsable
- Estado
- Diferencia Cash Nubimed
- Diferencia Stripe Nubimed
- Diferencia Cash FlyBy
- Diferencia Stripe FlyBy
- Diferencia TPV total
- Diferencia asignación TPV
- Diferencia fondo
- Cargo MEWS total
- Explicación
- Acción tomada
- Informado responsable

Acciones:
- Revisar
- Validar cierre
- Enviar a corrección
- Reabrir si aplica
- Eliminar solo Admin si la política lo permite

Reglas:
- No validar con diferencias sin explicación.
- No validar con diferencias sin acción tomada.
- No validar con diferencias sin informado responsable.
- Usuario lineal no puede validar.
- Admin puede validar.
- Jefe Recepción SYNCROLAB puede validar si está configurado.
- No mostrar datos técnicos.

==================================================
11. REGLAS DE DATOS
==================================================

Reglas generales:
- Todos los importes deben aceptar coma y punto decimal.
- Normalizar importes internamente como número.
- Campos calculados deben recalcularse en tiempo real.
- Campos calculados deben persistir o recalcularse correctamente al cargar.
- Al recargar, los datos guardados deben aparecer correctamente.
- Toggles Sí / No deben persistir.
- Selects deben mostrar valores correctos.
- No mostrar arrays tipo ["Mañana","Tarde"].
- No mostrar null.
- No mostrar undefined.
- No mostrar NaN.
- No mostrar JSON técnico.
- No mostrar IDs internos.
- No permitir fechas inválidas.
- No convertir falta de dato real en 0 falso en Dashboard.

Campos recomendados tabla Caja SYNCROLAB:
- id
- shift_id
- fecha
- turno
- responsable_id
- responsable_nombre
- estado

Nubimed:
- nubimed_fondo_inicial
- nubimed_cash_sistema
- nubimed_tarjeta_sistema
- nubimed_stripe_sistema
- nubimed_cargo_mews
- nubimed_cash_real
- nubimed_stripe_real
- nubimed_tpv
- nubimed_dif_cash
- nubimed_dif_stripe

FlyBy:
- flyby_fondo_inicial
- flyby_cash_sistema
- flyby_tarjeta_sistema
- flyby_stripe_sistema
- flyby_cargo_mews
- flyby_cash_real
- flyby_stripe_real
- flyby_tpv
- flyby_dif_cash
- flyby_dif_stripe

TPV conjunto:
- tpv_real_total
- tpv_esperado_total
- tpv_asignado_total
- dif_tpv_total
- dif_tpv_asignacion

Totales:
- cash_total_sistema
- cash_total_real
- dif_cash_total
- stripe_total_sistema
- stripe_total_real
- dif_stripe_total
- cargo_mews_total

Fondo final:
- retiro_caja_fuerte
- fondo_esperado_traspasar
- fondo_real
- dif_fondo

Diferencias:
- explicacion_diferencia
- accion_diferencia
- informado_responsable

Validación:
- validado_por
- validado_ts
- comentario_validador
- created_at
- updated_at

Importante:
- Revisar si ya existe tabla real para Caja SYNCROLAB.
- Si no existe, crear tabla syncrolab_cash_closures.
- Si existen columnas equivalentes con otros nombres, mapear sin duplicar.
- No romper datos existentes.
- No contar tablas legacy en Dashboard.

==================================================
12. REGLAS DE PERMISOS
==================================================

Usuario SYNCROLAB:
- Puede crear cierre de caja SYNCROLAB.
- Puede guardar su cierre.
- No puede validar.
- No puede eliminar.
- No puede modificar cierres validados.
- No puede ver cierres de otros departamentos salvo permiso explícito.

Admin:
- Puede ver Caja SYNCROLAB.
- Puede revisar.
- Puede validar.
- Puede enviar a corrección.
- Puede reabrir si está implementado.
- Puede eliminar si la política de eliminación lo permite.
- Puede ver Dashboard completo.

Jefe Recepción SYNCROLAB:
- Puede revisar Caja SYNCROLAB.
- Puede validar Caja SYNCROLAB si está configurado.
- Puede enviar a corrección.
- No puede hard delete salvo permiso explícito.

Si la matriz exacta de permisos no está definida:
- Marcar como [NO DATA].
- No inventar permisos nuevos.

==================================================
13. REQUISITOS UI/UX
==================================================

Estructura visual obligatoria:
1. Nubimed / Clínica
2. FlyBy
3. TPV conjunto
4. Totales SYNCROLAB
5. Diferencias y explicación
6. Fondo final

Reglas UI:
- Mantener diseño consistente con Caja Recepción Hotel y Caja Sala.
- Separar claramente Nubimed y FlyBy.
- Campos calculados readonly.
- Campos calculados con etiqueta “Calculado automáticamente”.
- Diferencias visibles con color y texto claro.
- Si no hay diferencia, mostrar “Sin diferencias”.
- Si hay diferencia, mostrar “Requiere explicación”.
- Botón principal: “Guardar cierre”.
- En Validación: “Validar cierre” / “Enviar a corrección”.
- No duplicar botones.
- No mostrar lenguaje técnico.
- No mostrar nombres de tablas.
- No mostrar IDs.
- Diseño responsive mobile.
- Escribir correctamente:
  - SYNCROSFERA
  - SYNCROLAB
  - Nubimed
  - FlyBy
  - MEWS
  - TPV

Si Claude Code tiene instalado UI UX Pro Max:
- Usarlo para revisar layout, jerarquía visual, accesibilidad, contraste, responsive y UX anti-patterns.

==================================================
14. CRITERIOS DE ACEPTACIÓN
==================================================

Formulario:
- Aparece bloque Nubimed / Clínica.
- Aparece bloque FlyBy.
- Aparece bloque TPV conjunto.
- Aparece bloque Totales SYNCROLAB.
- Aparece bloque Diferencias y explicación.
- Aparece bloque Fondo final.
- Todos los campos Nubimed existen.
- Todos los campos FlyBy existen.
- Todos los campos TPV conjunto existen.
- Cargo MEWS Nubimed y Cargo MEWS FlyBy existen.
- Cargo MEWS total se calcula correctamente.
- No aparece MUSE.
- No aparece TPU.

Cálculos Nubimed:
- Diferencia Cash Nubimed se calcula correctamente.
- Diferencia Stripe Nubimed se calcula correctamente.
- Tarjeta Nubimed no genera comparación aislada contra TPV independiente.

Cálculos FlyBy:
- Diferencia Cash FlyBy se calcula correctamente.
- Diferencia Stripe FlyBy se calcula correctamente.
- Tarjeta FlyBy no genera comparación aislada contra TPV independiente.

TPV conjunto:
- TPV esperado total = Tarjeta Nubimed + Tarjeta FlyBy.
- TPV asignado total = TPV Nubimed + TPV FlyBy.
- Diferencia TPV total = TPV real total - TPV esperado total.
- Diferencia asignación TPV = TPV real total - TPV asignado total.
- Si TPV Nubimed + TPV FlyBy no coincide con TPV real total, se muestra alerta.

Fondo final:
- Fondo esperado a traspasar se calcula correctamente.
- Fondo real se compara contra fondo esperado.
- Si hay diferencia de fondo, exige explicación.

Validación:
- Si hay cualquier diferencia, explicación + acción + informado responsable son obligatorios.
- Usuario lineal no puede validar.
- Admin puede validar.
- Jefe Recepción SYNCROLAB puede validar si tiene permiso.
- No se valida caja con diferencias sin explicación.

Dashboard:
- Caja SYNCROLAB aparece en Dashboard.
- Totales Cash se muestran correctamente.
- Totales Stripe se muestran correctamente.
- TPV conjunto se muestra correctamente.
- Cargo MEWS total se muestra correctamente.
- Conciliación Recepción Hotel SYNCROLAB Charge talonario vs Cargo MEWS total SYNCROLAB funciona.
- Si falta dato, muestra Falta dato.
- Si hay diferencia, muestra Diferencia.
- Si coincide, muestra Conciliado.
- No aparecen null, undefined, NaN, JSON, arrays ni IDs técnicos.

Persistencia:
- Guardar cierre.
- Recargar.
- Verificar que todos los campos se mantienen.
- Verificar que campos calculados se recalculan correctamente.
- Verificar que selects y toggles mantienen valores.

==================================================
15. PRUEBAS OBLIGATORIAS QA
==================================================

Flujo creación:
1. Login usuario SYNCROLAB.
2. Abrir Caja SYNCROLAB.
3. Verificar bloques Nubimed, FlyBy, TPV conjunto, Totales, Diferencias y Fondo final.

Nubimed:
4. Introducir Fondo inicial Nubimed = 100.
5. Introducir Cash Nubimed = 200.
6. Introducir Cash real Nubimed = 200.
7. Verificar Diferencia Cash Nubimed = 0.
8. Introducir Stripe Nubimed = 150.
9. Introducir Stripe plataforma Nubimed = 140.
10. Verificar Diferencia Stripe Nubimed = -10.
11. Introducir Tarjeta Nubimed = 300.
12. Introducir Cargo MEWS Nubimed = 50.

FlyBy:
13. Introducir Fondo inicial FlyBy = 100.
14. Introducir Cash FlyBy = 250.
15. Introducir Cash real FlyBy = 250.
16. Verificar Diferencia Cash FlyBy = 0.
17. Introducir Stripe FlyBy = 200.
18. Introducir Stripe plataforma FlyBy = 200.
19. Verificar Diferencia Stripe FlyBy = 0.
20. Introducir Tarjeta FlyBy = 400.
21. Introducir Cargo MEWS FlyBy = 70.

TPV conjunto:
22. Introducir TPV Nubimed = 300.
23. Introducir TPV FlyBy = 400.
24. Introducir TPV real total = 700.
25. Verificar TPV esperado total = 700.
26. Verificar TPV asignado total = 700.
27. Verificar Diferencia TPV total = 0.
28. Verificar Diferencia asignación TPV = 0.

Diferencia TPV:
29. Cambiar TPV real total = 690.
30. Verificar Diferencia TPV total = -10.
31. Verificar Diferencia asignación TPV = -10.
32. Verificar que exige explicación, acción e informado responsable.

Cargo MEWS:
33. Verificar Cargo MEWS total SYNCROLAB = 120.

Fondo final:
34. Introducir Retiro caja fuerte = 100.
35. Verificar Fondo esperado a traspasar = 100 + 100 + 200 + 250 - 100 = 550.
36. Introducir Fondo real = 550.
37. Verificar sin diferencia fondo.
38. Cambiar Fondo real = 540.
39. Verificar alerta diferencia fondo.
40. Verificar que exige explicación.

Guardar y persistir:
41. Completar Explicación diferencia.
42. Completar Acción tomada.
43. Informado responsable = Sí.
44. Guardar cierre.
45. Recargar página.
46. Verificar persistencia de todos los campos.
47. Verificar recálculo correcto de todos los campos calculados.

Validación:
48. Login Admin.
49. Abrir Validación → Cierres de caja.
50. Ver Caja SYNCROLAB.
51. Revisar cierre.
52. Ver diferencias.
53. Ver explicación, acción e informado responsable.
54. Validar cierre.
55. Verificar estado validado.
56. Login usuario SYNCROLAB.
57. Verificar que no puede validar.

Dashboard:
58. Abrir Dashboard.
59. Ver Caja SYNCROLAB.
60. Verificar Cash total sistema.
61. Verificar Cash total real.
62. Verificar Diferencia Cash total.
63. Verificar Stripe total sistema.
64. Verificar Stripe total real.
65. Verificar Diferencia Stripe total.
66. Verificar TPV esperado total.
67. Verificar TPV real total.
68. Verificar Diferencia TPV total.
69. Verificar Cargo MEWS total.
70. Crear / verificar valor Recepción Hotel SYNCROLAB Charge talonario = 120.
71. Verificar conciliación con Cargo MEWS total SYNCROLAB = Conciliado.
72. Cambiar valor Recepción Hotel a 100.
73. Verificar estado Diferencia.

Permisos y UX:
74. Verificar que usuario lineal no puede eliminar.
75. Verificar que Admin puede eliminar solo si está permitido.
76. Verificar responsive mobile.
77. Verificar que no aparecen null, undefined, NaN, JSON, arrays ni IDs técnicos.
78. Verificar que no aparece MUSE.
79. Verificar que no aparece TPU.

==================================================
16. NO ROMPER
==================================================

No romper:
- Login por PIN.
- Turnos.
- Caja Recepción Hotel.
- Caja Sala Restaurante.
- Caja SYNCROLAB si ya existe parcialmente.
- Validación de cierres.
- Dashboard actual.
- Conciliaciones existentes.
- Permisos Admin / usuario lineal.
- Estados pendiente / corrección / validado / cerrado.
- Persistencia en Supabase.
- Recalculo Dashboard.
- Responsive.
- Datos históricos existentes.

==================================================
17. SALIDA ESPERADA
==================================================

Entregar:
- Código corregido.
- Explicación breve de cambios.
- Lista de archivos modificados.
- Migración SQL si hace falta crear o ampliar tabla syncrolab_cash_closures.
- Mapeo de campos existentes vs campos nuevos.
- Checklist de pruebas realizadas.
- Riesgos detectados.
- Campos pendientes marcados como [NO DATA].

Necesito que añades : 
Logica de calculo y coinciliacion 
Fondo esperado a traspasar = Cash real contado clínica  - Retiro efectivo caja fuerte clínica
Δ Cash = Fondo recibido + Cash Nubimed  - Cash real contado Clinica
Fondo esperado a traspasar = Cash real contado training- Retiro efectivo caja fuerte Training
Δ Cash = Fondo recibido training+ Cash Flyby  - Cash real contado training


==================================================

7. BLOQUE FONDO FINAL — ACTUALIZADO

==================================================

Crear bloque llamado:

“Fondo final”

Este bloque debe estar dividido en:

1. Fondo final Clínica / Nubimed

2. Fondo final Training / FlyBy

3. Resumen total SYNCROLAB

--------------------------------------------------

7.1 Fondo final Clínica / Nubimed

--------------------------------------------------

Campos:

- Fondo recibido Clínica / Nubimed

- Cash Nubimed

- Cash real contado Clínica

- Retiro efectivo caja fuerte Clínica

- Fondo esperado a traspasar Clínica

- Fondo real Clínica

- Δ Cash Clínica

Fórmulas:

Fondo esperado a traspasar Clínica =

Cash real contado Clínica - Retiro efectivo caja fuerte Clínica

Δ Cash Clínica =

Fondo recibido Clínica + Cash Nubimed - Cash real contado Clínica

Descripción:

- Fondo esperado a traspasar Clínica representa el efectivo que debe quedar para traspasar después de retirar efectivo a caja fuerte.

- Δ Cash Clínica compara el efectivo esperado según fondo recibido + cash Nubimed contra el efectivo real contado en Clínica.

Reglas:

- Fondo recibido Clínica / Nubimed es editable.

- Cash Nubimed es valor sistema.

- Cash real contado Clínica es editable.

- Retiro efectivo caja fuerte Clínica es editable.

- Fondo esperado a traspasar Clínica es calculado readonly.

- Δ Cash Clínica es calculado readonly.

- Fondo real Clínica es editable.

- Comparar Fondo real Clínica contra Fondo esperado a traspasar Clínica.

- Si Fondo real Clínica ≠ Fondo esperado a traspasar Clínica, mostrar alerta:

  “El fondo real de Clínica no coincide con el fondo esperado a traspasar.”

- Si Δ Cash Clínica ≠ 0, exigir explicación, acción tomada e informado responsable.

- Si Fondo real Clínica ≠ Fondo esperado a traspasar Clínica, exigir explicación, acción tomada e informado responsable.

- No incluir TPV en fondo esperado Clínica.

- No incluir Stripe en fondo esperado Clínica.

- No incluir Cargo MEWS en fondo esperado Clínica.

- No incluir tarjeta en fondo esperado Clínica.

- No mostrar NaN, null, undefined ni errores técnicos.

Ejemplo correcto:

- Fondo recibido Clínica = 100 €

- Cash Nubimed = 200 €

- Cash real contado Clínica = 300 €

- Retiro efectivo caja fuerte Clínica = 150 €

Cálculos:

- Δ Cash Clínica = 100 + 200 - 300 = 0 €

- Fondo esperado a traspasar Clínica = 300 - 150 = 150 €

Resultado:

- Cash Clínica sin diferencia.

- Fondo esperado Clínica = 150 €.

--------------------------------------------------

7.2 Fondo final Training / FlyBy

--------------------------------------------------

Campos:

- Fondo recibido Training / FlyBy

- Cash FlyBy

- Cash real contado Training

- Retiro efectivo caja fuerte Training

- Fondo esperado a traspasar Training

- Fondo real Training

- Δ Cash Training

Fórmulas:

Fondo esperado a traspasar Training =

Cash real contado Training - Retiro efectivo caja fuerte Training

Δ Cash Training =

Fondo recibido Training + Cash FlyBy - Cash real contado Training

Descripción:

- Fondo esperado a traspasar Training representa el efectivo que debe quedar para traspasar después de retirar efectivo a caja fuerte.

- Δ Cash Training compara el efectivo esperado según fondo recibido Training + cash FlyBy contra el efectivo real contado en Training.

Reglas:

- Fondo recibido Training / FlyBy es editable.

- Cash FlyBy es valor sistema.

- Cash real contado Training es editable.

- Retiro efectivo caja fuerte Training es editable.

- Fondo esperado a traspasar Training es calculado readonly.

- Δ Cash Training es calculado readonly.

- Fondo real Training es editable.

- Comparar Fondo real Training contra Fondo esperado a traspasar Training.

- Si Fondo real Training ≠ Fondo esperado a traspasar Training, mostrar alerta:

  “El fondo real de Training no coincide con el fondo esperado a traspasar.”

- Si Δ Cash Training ≠ 0, exigir explicación, acción tomada e informado responsable.

- Si Fondo real Training ≠ Fondo esperado a traspasar Training, exigir explicación, acción tomada e informado responsable.

- No incluir TPV en fondo esperado Training.

- No incluir Stripe en fondo esperado Training.

- No incluir Cargo MEWS en fondo esperado Training.

- No incluir tarjeta en fondo esperado Training.

- No mostrar NaN, null, undefined ni errores técnicos.

Ejemplo correcto:

- Fondo recibido Training = 100 €

- Cash FlyBy = 250 €

- Cash real contado Training = 350 €

- Retiro efectivo caja fuerte Training = 200 €

Cálculos:

- Δ Cash Training = 100 + 250 - 350 = 0 €

- Fondo esperado a traspasar Training = 350 - 200 = 150 €

Resultado:

- Cash Training sin diferencia.

- Fondo esperado Training = 150 €.

--------------------------------------------------

7.3 Resumen total SYNCROLAB

--------------------------------------------------

Campos calculados:

- Fondo esperado total a traspasar SYNCROLAB

- Fondo real total SYNCROLAB

- Retiro efectivo total caja fuerte

- Δ Cash total SYNCROLAB

- Diferencia fondo total SYNCROLAB

Fórmulas:

Fondo esperado total a traspasar SYNCROLAB =

Fondo esperado a traspasar Clínica + Fondo esperado a traspasar Training

Fondo real total SYNCROLAB =

Fondo real Clínica + Fondo real Training

Retiro efectivo total caja fuerte =

Retiro efectivo caja fuerte Clínica + Retiro efectivo caja fuerte Training

Δ Cash total SYNCROLAB =

Δ Cash Clínica + Δ Cash Training

Diferencia fondo total SYNCROLAB =

Fondo real total SYNCROLAB - Fondo esperado total a traspasar SYNCROLAB

Reglas:

- Todos los campos de resumen total deben ser readonly.

- Mostrar etiqueta “Calculado automáticamente”.

- Si Δ Cash total SYNCROLAB ≠ 0, exigir explicación, acción tomada e informado responsable.

- Si Diferencia fondo total SYNCROLAB ≠ 0, exigir explicación, acción tomada e informado responsable.

- No incluir TPV, Stripe, tarjeta ni Cargo MEWS en el fondo esperado total.

- No mostrar NaN, null, undefined ni errores técnicos.

==================================================

CAMBIOS NECESARIOS EN CAMPOS RECOMENDADOS TABLA CAJA SYNCROLAB

==================================================

Sustituir el bloque anterior de Fondo final por estos campos:

Fondo Clínica / Nubimed:

- nubimed_fondo_recibido

- nubimed_cash_real_contado

- nubimed_retiro_caja_fuerte

- nubimed_fondo_esperado_traspasar

- nubimed_fondo_real

- nubimed_delta_cash

Fondo Training / FlyBy:

- flyby_fondo_recibido

- flyby_cash_real_contado

- flyby_retiro_caja_fuerte

- flyby_fondo_esperado_traspasar

- flyby_fondo_real

- flyby_delta_cash

Resumen fondo SYNCROLAB:

- fondo_esperado_total_traspasar

- fondo_real_total

- retiro_total_caja_fuerte

- delta_cash_total

- diferencia_fondo_total

Mantener también:

- explicacion_diferencia

- accion_diferencia

- informado_responsable

==================================================

ACTUALIZAR REGLAS DE DIFERENCIAS Y EXPLICACIÓN

==================================================

Los campos Explicación diferencia, Acción tomada e Informado responsable son obligatorios si ocurre cualquiera de estas situaciones:

- Δ Cash Clínica ≠ 0

- Δ Cash Training ≠ 0

- Δ Cash total SYNCROLAB ≠ 0

- Fondo real Clínica ≠ Fondo esperado a traspasar Clínica

- Fondo real Training ≠ Fondo esperado a traspasar Training

- Fondo real total SYNCROLAB ≠ Fondo esperado total a traspasar SYNCROLAB

- Diferencia Stripe Nubimed ≠ 0

- Diferencia Stripe FlyBy ≠ 0

- Diferencia TPV total ≠ 0

- Diferencia asignación TPV ≠ 0

Mensaje de error:

“Hay diferencias de caja. Añade explicación, acción tomada e indica si se informó al responsable.”

==================================================

ACTUALIZAR DASHBOARD CAJA SYNCROLAB

==================================================

En Dashboard, Caja SYNCROLAB debe mostrar también:

Clínica / Nubimed:

- Fondo recibido Clínica

- Cash Nubimed

- Cash real contado Clínica

- Retiro efectivo caja fuerte Clínica

- Fondo esperado a traspasar Clínica

- Fondo real Clínica

- Δ Cash Clínica

Training / FlyBy:

- Fondo recibido Training

- Cash FlyBy

- Cash real contado Training

- Retiro efectivo caja fuerte Training

- Fondo esperado a traspasar Training

- Fondo real Training

- Δ Cash Training

Resumen total:

- Fondo esperado total a traspasar SYNCROLAB

- Fondo real total SYNCROLAB

- Retiro efectivo total caja fuerte

- Δ Cash total SYNCROLAB

- Diferencia fondo total SYNCROLAB

Estados:

- Si Δ Cash Clínica = 0 → Sin diferencia

- Si Δ Cash Clínica ≠ 0 → Diferencia

- Si Δ Cash Training = 0 → Sin diferencia

- Si Δ Cash Training ≠ 0 → Diferencia

- Si Diferencia fondo total SYNCROLAB = 0 → Conciliado

- Si Diferencia fondo total SYNCROLAB ≠ 0 → Diferencia

- Si falta dato obligatorio → Falta dato

==================================================

QA AÑADIDO — FONDO Y CASH SYNCROLAB

==================================================

Añadir estos casos a las pruebas obligatorias QA:

Caso Clínica / Nubimed sin diferencia:

1. Introducir Fondo recibido Clínica = 100.

2. Introducir Cash Nubimed = 200.

3. Introducir Cash real contado Clínica = 300.

4. Introducir Retiro efectivo caja fuerte Clínica = 150.

5. Verificar Δ Cash Clínica = 0.

6. Verificar Fondo esperado a traspasar Clínica = 150.

7. Introducir Fondo real Clínica = 150.

8. Verificar sin diferencia de fondo Clínica.

Caso Clínica / Nubimed con diferencia:

1. Introducir Fondo recibido Clínica = 100.

2. Introducir Cash Nubimed = 200.

3. Introducir Cash real contado Clínica = 290.

4. Introducir Retiro efectivo caja fuerte Clínica = 150.

5. Verificar Δ Cash Clínica = 10.

6. Verificar Fondo esperado a traspasar Clínica = 140.

7. Verificar que exige explicación, acción tomada e informado responsable.

Caso Training / FlyBy sin diferencia:

1. Introducir Fondo recibido Training = 100.

2. Introducir Cash FlyBy = 250.

3. Introducir Cash real contado Training = 350.

4. Introducir Retiro efectivo caja fuerte Training = 200.

5. Verificar Δ Cash Training = 0.

6. Verificar Fondo esperado a traspasar Training = 150.

7. Introducir Fondo real Training = 150.

8. Verificar sin diferencia de fondo Training.

Caso Training / FlyBy con diferencia:

1. Introducir Fondo recibido Training = 100.

2. Introducir Cash FlyBy = 250.

3. Introducir Cash real contado Training = 340.

4. Introducir Retiro efectivo caja fuerte Training = 200.

5. Verificar Δ Cash Training = 10.

6. Verificar Fondo esperado a traspasar Training = 140.

7. Verificar que exige explicación, acción tomada e informado responsable.

Caso resumen total:

1. Clínica Fondo esperado = 150.

2. Training Fondo esperado = 150.

3. Verificar Fondo esperado total a traspasar SYNCROLAB = 300.

4. Clínica Fondo real = 150.

5. Training Fondo real = 150.

6. Verificar Fondo real total SYNCROLAB = 300.

7. Verificar Diferencia fondo total SYNCROLAB = 0.

8. Cambiar Fondo real Training = 140.

9. Verificar Fondo real total SYNCROLAB = 290.

10. Verificar Diferencia fondo total SYNCROLAB = -10.

11. Verificar que exige explicación, acción tomada e informado responsable.