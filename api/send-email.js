// api/send-email.js
// Vercel Edge Function — intermediario entre SYNCRO SHIFT y Resend.
// La API key de Resend vive como variable de entorno en Vercel (nunca en el frontend).
// Despliega colocando este archivo en la carpeta /api/ del repositorio.

import { isAuthEnabled, jsonResponse } from '../lib/auth-server.js';

export const config = { runtime: 'edge' };

// ── Plantilla A — nueva invitación / reenvío ─────────────────────────────
function htmlInvitacion(nombre, pin, url) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
body{margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a2e}
.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.hdr{background:#1a1a2e;padding:28px;text-align:center;color:#e2e8f0;font-size:20px;font-weight:700;letter-spacing:1px}
.body{padding:32px 36px}
.text{font-size:14px;line-height:1.7;color:#374151;margin:0 0 18px}
.pin-box{background:#f0f4ff;border:2px solid #4f46e5;border-radius:10px;padding:18px;text-align:center;margin:20px 0}
.pin-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.pin-val{font-size:38px;font-weight:800;color:#4f46e5;letter-spacing:10px;font-family:monospace}
.pin-warn{font-size:12px;color:#dc2626;font-weight:600;margin-top:10px;background:#fee2e2;border-radius:6px;padding:8px 12px}
.url-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;font-size:13px;color:#374151}
.url-box a{color:#4f46e5;font-weight:600}
.note{font-size:12px;color:#6b7280;border-left:3px solid #fbbf24;padding:10px 14px;background:#fffbeb;margin-top:20px}
.ftr{background:#f9fafb;padding:16px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="wrap">
  <div class="hdr">⚡ SYNCROSFERA</div>
  <div class="body">
    <p class="text"><strong>Hola ${nombre},</strong></p>
    <p class="text">Tu perfil en <strong>SYNCRO SHIFT</strong>, la plataforma operativa de SYNCROSFERA, ha sido creado. Ya puedes acceder para registrar tu turno, gestiones e incidencias.</p>
    <div class="pin-box">
      <div class="pin-label">Tu PIN de acceso es</div>
      <div class="pin-val">${pin}</div>
      <div class="pin-warn">⚠ Este PIN es estrictamente personal.<br>Nunca lo compartas con nadie — ni compañeros, ni jefes, nadie.<br>Es exclusivamente tuyo.</div>
    </div>
    <div class="url-box">Accede en: <a href="${url}">${url}</a></div>
    <p class="text" style="margin-top:18px">Introduce tu PIN en la pantalla de inicio. Si tienes algún problema, contacta con tu responsable o administrador.</p>
    <div class="note"><strong>🔒 Seguridad:</strong> Si recibes este correo sin haberlo solicitado, contacta de inmediato con el administrador del sistema.</div>
  </div>
  <div class="ftr">SYNCROSFERA · Este mensaje es confidencial y está dirigido únicamente a su destinatario.</div>
</div>
</body></html>`;
}

// ── Plantilla B — PIN restablecido ───────────────────────────────────────
function htmlPinCambiado(nombre, pin, url, enviado_por) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
body{margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a2e}
.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.hdr{background:#1a1a2e;padding:28px;text-align:center;color:#e2e8f0;font-size:20px;font-weight:700;letter-spacing:1px}
.body{padding:32px 36px}
.text{font-size:14px;line-height:1.7;color:#374151;margin:0 0 18px}
.pin-box{background:#f0f4ff;border:2px solid #4f46e5;border-radius:10px;padding:18px;text-align:center;margin:20px 0}
.pin-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.pin-val{font-size:38px;font-weight:800;color:#4f46e5;letter-spacing:10px;font-family:monospace}
.pin-warn{font-size:12px;color:#dc2626;font-weight:600;margin-top:10px;background:#fee2e2;border-radius:6px;padding:8px 12px}
.alert{background:#fff7ed;border:1px solid #f97316;border-radius:8px;padding:14px 16px;margin-top:20px;font-size:13px;color:#7c2d12}
.ftr{background:#f9fafb;padding:16px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="wrap">
  <div class="hdr">⚡ SYNCROSFERA</div>
  <div class="body">
    <p class="text"><strong>Hola ${nombre},</strong></p>
    <p class="text">Tu PIN de acceso a <strong>SYNCRO SHIFT</strong> ha sido restablecido por <strong>${enviado_por}</strong>.</p>
    <div class="pin-box">
      <div class="pin-label">Tu nuevo PIN de acceso es</div>
      <div class="pin-val">${pin}</div>
      <div class="pin-warn">⚠ Este PIN es estrictamente personal.<br>Nunca lo compartas con nadie — ni compañeros, ni jefes, nadie.<br>Es exclusivamente tuyo.</div>
    </div>
    <p class="text">Usa este PIN la próxima vez que entres en la plataforma: <a href="${url}" style="color:#4f46e5">${url}</a></p>
    <div class="alert"><strong>⚠ ¿No has solicitado este cambio?</strong><br>Si no pediste que se restableciera tu PIN, contacta de inmediato con tu responsable o con el administrador del sistema.</div>
  </div>
  <div class="ftr">SYNCROSFERA · Este mensaje es confidencial y está dirigido únicamente a su destinatario.</div>
</div>
</body></html>`;
}

// ── Handler principal ─────────────────────────────────────────────────────
export default async function handler(req) {

  // En el modo seguro, el navegador no puede elegir destinatario, PIN ni actor.
  // Alta y reset envían el correo desde endpoints autenticados server-side.
  if (isAuthEnabled()) return jsonResponse({ error: 'Not found' }, 404);

  // Solo POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Leer API key de Resend desde variable de entorno de Vercel
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('[send-email] RESEND_API_KEY no configurada en Vercel');
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { tipo, nombre, email, pin, url, enviado_por } = body;

  if (!email || !nombre || !tipo) {
    return new Response(JSON.stringify({ error: 'Faltan campos obligatorios: tipo, nombre, email' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Elegir asunto y cuerpo según tipo
  let subject, html;
  const appUrl = url || 'https://syncro-shift.vercel.app';

  if (tipo === 'nueva_invitacion' || tipo === 'reenvio_invitacion') {
    subject = 'Bienvenido/a a SYNCROSFERA — tu acceso está listo';
    html    = htmlInvitacion(nombre, pin || '——', appUrl);
  } else if (tipo === 'pin_cambiado') {
    subject = 'Tu acceso a SYNCROSFERA ha sido actualizado';
    html    = htmlPinCambiado(nombre, pin || '——', appUrl, enviado_por || 'el administrador');
  } else {
    return new Response(JSON.stringify({ error: 'tipo no reconocido: ' + tipo }), { status: 400 });
  }

  // Llamar a la API de Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'SYNCROSFERA <no-reply@syncrosfera.com>',  // ← cambia al dominio verificado
      to:   [email],
      subject,
      html
    })
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error('[send-email] Resend error:', resendRes.status, errBody);
    return new Response(JSON.stringify({ error: 'Resend error', detail: errBody }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
