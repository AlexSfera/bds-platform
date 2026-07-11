export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };

// IPs fijas de instalación (recinto, oficina) — gestión manual via commit.
// Las IPs de empleados (jefes de depto, etc.) se gestionan desde la app
// (tabla employee_ips en Supabase) y se cargan dinámicamente abajo.
const STATIC_ALLOWED_IPS = [
  '81.0.50.118',    // SYNCROSFERA — red recinto
  '77.208.169.57',  // Teléfono 1
  '77.208.160.208', // Teléfono 2
  '45.153.97.234',  // Casa
  '90.167.42.33',   // [POR DEFINIR]
  '89.131.180.187', // [POR DEFINIR]
  '37.29.174.46',   // [POR DEFINIR]
  '45.153.97.24',   // [POR DEFINIR] — revisar: muy similar a 45.153.97.234, posible typo
];

// Rutas API que se autentican por Bearer token (no por IP)
const BEARER_AUTH_PATHS = [
  '/api/bitrix-sync',
];

const SUPABASE_URL = 'https://tsfhrpdpbkciofvejrao.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3GWGNkIs6byRG1F1BIxlkg_qhiRUgBt';
const CACHE_TTL_MS = 60000; // 60s

// Cache en memoria del runtime Edge (se reinicia entre cold starts — aceptable)
let _ipCache = null;
let _ipCacheTs = 0;

async function getDynamicIPs() {
  const now = Date.now();
  if (_ipCache && (now - _ipCacheTs) < CACHE_TTL_MS) {
    return _ipCache;
  }
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/employee_ips?active=eq.true&select=ip',
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
      }
    );
    if (!res.ok) throw new Error('Supabase respondió ' + res.status);
    const rows = await res.json();
    _ipCache = rows.map(r => r.ip);
    _ipCacheTs = now;
    return _ipCache;
  } catch (e) {
    // FAIL-OPEN: si Supabase no responde, no añadimos IPs dinámicas,
    // pero tampoco bloqueamos el acceso de las IPs estáticas.
    // Si había cache previa (aunque caducada), la reutilizamos como mejor esfuerzo.
    console.error('employee_ips fetch failed (fail-open):', e.message);
    return _ipCache || [];
  }
}

export default async function middleware(req) {
  // ── Bypass IP para rutas API autenticadas por Bearer token ──
  // Permite que cron externos (cron-job.org, Vercel Cron) accedan
  // sin estar en la whitelist de IP, siempre que el token sea correcto.
  // La validación real del token se hace dentro del propio endpoint.
  const pathname = req.nextUrl?.pathname || new URL(req.url).pathname;
  if (BEARER_AUTH_PATHS.some(p => pathname === p)) {
    const auth = req.headers.get('authorization') || '';
    if (auth.startsWith('Bearer ') && auth.length > 20) {
      return; // dejar pasar — el endpoint valida el token
    }
  }

  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim();

  if (STATIC_ALLOWED_IPS.includes(ip)) {
    return; // permitir
  }

  const dynamicIPs = await getDynamicIPs();
  if (dynamicIPs.includes(ip)) {
    return; // permitir — IP de empleado autorizada desde la app
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acceso denegado — SYNCROSFERA</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1b2e;
    color: #f1f5f9;
    font-family: 'Inter', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 32px;
    padding: 24px;
  }
  .logo {
    font-size: 13px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #64a0d4;
    font-weight: 600;
  }
  .rower {
    width: 180px;
    height: 180px;
  }
  .boat { animation: rock 1.8s ease-in-out infinite; transform-origin: center bottom; }
  .oar-left  { animation: rowL 1.8s ease-in-out infinite; transform-origin: 52% 62%; }
  .oar-right { animation: rowR 1.8s ease-in-out infinite; transform-origin: 48% 62%; }
  .water { animation: wave 2.2s ease-in-out infinite; }
  @keyframes rock {
    0%,100% { transform: rotate(-2deg); }
    50%      { transform: rotate(2deg);  }
  }
  @keyframes rowL {
    0%,100% { transform: rotate(-30deg); }
    50%      { transform: rotate(20deg);  }
  }
  @keyframes rowR {
    0%,100% { transform: rotate(30deg);  }
    50%      { transform: rotate(-20deg); }
  }
  @keyframes wave {
    0%,100% { transform: translateX(0);   }
    50%      { transform: translateX(-8px);}
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    color: #f1f5f9;
    text-align: center;
    line-height: 1.4;
  }
  p {
    font-size: 14px;
    color: #94a3b8;
    text-align: center;
    max-width: 340px;
    line-height: 1.7;
  }
  .ip-badge {
    background: #142639;
    border: 1px solid #2a4365;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 12px;
    color: #64a0d4;
    font-family: monospace;
    letter-spacing: 1px;
  }
</style>
</head>
<body>
  <div class="logo">SYNCROSFERA · Portal Operativo</div>
  <svg class="rower" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <g class="water">
      <ellipse cx="100" cy="155" rx="85" ry="12" fill="#1a3a5c" opacity="0.8"/>
      <ellipse cx="100" cy="158" rx="75" ry="8"  fill="#142f50" opacity="0.6"/>
    </g>
    <g class="boat">
      <path d="M40 148 Q100 168 160 148 L155 138 Q100 155 45 138 Z" fill="#1e4d7b"/>
      <path d="M45 138 Q100 155 155 138 L150 130 Q100 147 50 130 Z" fill="#2563a0"/>
      <ellipse cx="100" cy="125" rx="10" ry="14" fill="#64a0d4"/>
      <circle cx="100" cy="108" r="9" fill="#f1c27d"/>
      <line class="oar-left"  x1="100" y1="130" x2="55"  y2="158" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
      <line class="oar-right" x1="100" y1="130" x2="145" y2="158" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
      <line x1="100" y1="122" x2="88"  y2="130" stroke="#4a86c0" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="100" y1="122" x2="112" y2="130" stroke="#4a86c0" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  </svg>
  <h1>No estás autorizado<br>para entrar</h1>
  <p>El acceso al portal operativo de SYNCROSFERA está restringido a las instalaciones del recinto.<br>Conéctate desde la red de SYNCROSFERA.</p>
  <div class="ip-badge">IP detectada: ${ip || 'desconocida'}</div>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
