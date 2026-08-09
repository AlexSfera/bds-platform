import { optionalEnv } from './auth-server.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function temporaryPinHtml({ kind, targetName, pin, actorName, appUrl }) {
  const title = kind === 'provision'
    ? 'Tu acceso a SYNCRO SHIFT está listo'
    : 'Tu PIN de SYNCRO SHIFT ha sido restablecido';
  const action = kind === 'provision'
    ? 'Se ha creado tu acceso.'
    : 'Tu acceso ha sido restablecido por ' + escapeHtml(actorName || 'un responsable autorizado') + '.';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a2e">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
<div style="background:#1a1a2e;padding:28px;text-align:center;color:#e2e8f0;font-size:20px;font-weight:700">SYNCROSFERA</div>
<div style="padding:32px 36px">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
<p>Hola <strong>${escapeHtml(targetName)}</strong>. ${action}</p>
<div style="background:#f0f4ff;border:2px solid #4f46e5;border-radius:10px;padding:18px;text-align:center;margin:20px 0">
<div style="font-size:12px;color:#6b7280">PIN TEMPORAL DE SEIS DÍGITOS</div>
<div style="font-size:38px;font-weight:800;color:#4f46e5;letter-spacing:10px;font-family:monospace">${escapeHtml(pin)}</div>
</div>
<p>Accede en <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a>. Tendrás que elegir un PIN personal nuevo antes de usar la aplicación.</p>
<p style="font-size:12px;color:#b91c1c"><strong>No compartas este PIN.</strong> Si no esperabas este mensaje, avisa al administrador.</p>
</div></div></body></html>`;
}

export async function sendTemporaryPinEmail({ kind, target, pin, actor, appUrl }) {
  const key = optionalEnv('RESEND_API_KEY');
  if (!key) return { ok: false, reason: 'email_not_configured' };
  const from = optionalEnv('SYNCRO_EMAIL_FROM', 'SYNCROSFERA <no-reply@syncrosfera.com>');
  const subject = kind === 'provision'
    ? 'Tu acceso temporal a SYNCRO SHIFT'
    : 'Tu PIN temporal de SYNCRO SHIFT';
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [target.email],
        subject,
        html: temporaryPinHtml({
          kind,
          targetName: target.nombre,
          pin,
          actorName: actor && actor.nombre,
          appUrl
        })
      })
    });
  } catch (_) {
    return { ok: false, reason: 'email_network_error' };
  }
  if (!response.ok) return { ok: false, reason: 'email_provider_error' };
  return { ok: true };
}
