import {
  adminRequest,
  directoryAreas,
  filterDirectory,
  jsonResponse,
  requireAuthEnabled,
  requireMethod
} from '../../lib/auth-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'GET');
  if (wrongMethod) return wrongMethod;

  const department = new URL(req.url).searchParams.get('department') || '';
  if (!directoryAreas(department)) {
    return jsonResponse({ error: 'Invalid department' }, 400);
  }

  try {
    const rows = await adminRequest(
      'employees?estado=eq.Activo'
        + '&select=id,nombre,area,puesto,rol,responsable,validador,estado'
        + '&order=nombre.asc'
    );
    return jsonResponse({ employees: filterDirectory(rows, department) });
  } catch (_) {
    return jsonResponse({ error: 'Directory unavailable' }, 503);
  }
}
