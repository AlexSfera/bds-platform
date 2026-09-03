-- Reversión de 20260903161437_incidencias_visibilidad_habitacion.sql
ALTER TABLE public.incidencias
  DROP COLUMN IF EXISTS visible_companeros,
  DROP COLUMN IF EXISTS room;
