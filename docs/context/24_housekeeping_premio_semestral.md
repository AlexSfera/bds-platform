# 24 — Premio semestral de Housekeeping

## Finalidad

Gestionar el reconocimiento semestral por continuidad y compromiso del Departamento de Housekeeping. La fuente operativa es SYNCRO HUB: si la baja no está registrada en un informe publicado, no se incorpora al cálculo.

## Responsables y accesos

- La **jefa de Housekeeping** registra las bajas laborales desde **Informes → Housekeeping → Informe de Jefe**.
- Dirección revisa y liquida los premios desde la única pestaña **Liquidación**.
- No se introducen diagnósticos, partes médicos ni otra información clínica: solo empleada, fecha de inicio y fecha de fin.
- La pestaña **Liquidación** no permite editar días de baja.

## Registro de bajas en Informes

1. Abrir **Informes** y seleccionar **Housekeeping**.
2. Abrir **Informe de Jefe** y pulsar **Registrar bajas laborales** o crear/editar un informe.
3. En **Bajas laborales de Housekeeping** aparece toda la plantilla activa del departamento. Pulsar **+ Añadir baja** en la empleada correspondiente e indicar inicio y fin.
4. El sistema muestra los días calculados. Si la misma empleada tiene otra baja, pulsar **+ Añadir otra baja de esta empleada**.
5. Publicar el informe. Un borrador no modifica la liquidación.

Las fechas son inclusivas: una baja del 10 al 10 cuenta como 1 día. Si un intervalo cruza el 30 de junio o el 31 de diciembre, el sistema reparte automáticamente los días entre los dos semestres. Los intervalos solapados de una misma empleada no duplican días.

Una vez liquidado un semestre, no se admiten cambios de bajas que afecten a ese semestre. Si la sincronización no puede completarse, el informe permanece como borrador para su corrección.

## Liquidación unificada

Existe una sola pestaña **Liquidación**, basada en la anterior pantalla de Liquidación Entrenadores:

- **Entrenadores:** selección de período mensual y liquidación mensual existente.
- **Housekeeping:** selección de período semestral, consulta de días calculados, nivel, importe, estado y fecha de liquidación.

Dirección pulsa **Marcar liquidado** para cada persona. El sistema registra quién realizó la liquidación y la fecha. No se mezclan liquidaciones con la introducción de datos en Informes. Housekeeping solo permite liquidar semestres que ya han finalizado.

## Períodos de Housekeeping

Los períodos son siempre fijos:

- `S1`: 1 de enero a 30 de junio.
- `S2`: 1 de julio a 31 de diciembre.

El pago se prepara en agosto para `S1` y en Navidad para `S2`.

## Regla de cálculo

Una empleada puede recibir el premio únicamente si, al inicio del período:

1. Lleva **más de seis meses** trabajados. Exactamente seis meses no cumple el requisito.
2. Tiene un máximo de **10 días de baja laboral** en ese semestre.

Importes por períodos consecutivos que cumplen ambas condiciones:

| Nivel | Importe semestral |
|---|---:|
| Primer período válido | 250 € |
| Segundo período válido consecutivo | 320 € |
| Tercero y siguientes consecutivos | 400 € |

Si una empleada supera 10 días de baja, no recibe premio en ese período. El siguiente período que vuelva a cumplir empieza otra vez en el nivel 1 (250 €). La ausencia de registro del período anterior también rompe la consecutividad.

Si `fecha_alta` no está registrada en el Maestro, el sistema no calcula premio: muestra `[NO DATA]` para evitar una liquidación sin evidencia.

## Datos iniciales del informe de junio de 2026

El informe recibido indica que estas liquidaciones de `2026-S1` están pendientes, con 0 días de baja declarados:

| Empleada | Nivel | Importe |
|---|---:|---:|
| Yessica | 3.º | 400 € |
| Kristina | 3.º | 400 € |
| Isabel | 3.º | 400 € |
| Anyely | 1.º | 250 € |
| Ingrid | 3.º | 400 € |
| Vero | 3.º | 400 € |
| Irina | 1.º | 250 € |
| **Total pendiente** |  | **2.500 €** |

Los niveles de 2025 se conservan solo como histórico de continuidad. El informe no aporta los días de baja de esos períodos, por lo que quedan como `[NO DATA]` y no se inventan. Leonor no figura con premio en `2026-S1`; el motivo concreto no consta en el informe.
