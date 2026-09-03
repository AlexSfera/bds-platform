-- Incidencias: visibilidad interna voluntaria y trazabilidad por habitación.
-- No modifica registros existentes: las incidencias históricas permanecen privadas
-- por defecto y sin habitación cuando ese dato no se registró.
ALTER TABLE public.incidencias
  ADD COLUMN IF NOT EXISTS visible_companeros boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS room text;
