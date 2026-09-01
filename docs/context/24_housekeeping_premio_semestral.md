# 24 — Premio semestral de Housekeeping

## Finalidad

Gestionar el reconocimiento semestral por continuidad y compromiso del Departamento de Housekeeping. La fuente operativa es SYNCRO HUB: si el dato no está registrado en el sistema, no entra en la liquidación.

## Responsable y acceso

- La **jefa de Housekeeping** registra los días de baja laboral de cada empleada.
- Dirección puede revisar los datos y registrar la liquidación.
- La aplicación guarda solamente el número total de días de baja por período. No se introducen diagnósticos, partes médicos ni otra información clínica.

## Períodos

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

## Flujo en la plataforma

1. Abrir **Informes → Housekeeping → Premio semestral**.
2. Seleccionar el semestre y registrar los días de baja de cada empleada.
3. El sistema calcula antigüedad, elegibilidad, nivel e importe.
4. Abrir **Informes → Housekeeping → Liquidación**.
5. Dirección revisa el total y confirma individualmente cada liquidación. Tras confirmarla, los días de ese período quedan bloqueados.

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
