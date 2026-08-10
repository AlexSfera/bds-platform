import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  executeIdentityCutover,
  loadIdentityCutoverPlan,
  summarizeIdentityCutoverPlan
} from '../lib/auth-cutover-server.js';

function argument(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function hasFlag(name) {
  return process.argv.slice(2).includes('--' + name);
}

function targetProjectRef() {
  const url = new URL(process.env.SUPABASE_URL || '');
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (!match) throw new Error('SUPABASE_URL no identifica un proyecto Supabase');
  return match[1];
}

async function writeManualHandoff(filePath, rows) {
  if (!path.isAbsolute(filePath)) throw new Error('--manual-output debe ser una ruta absoluta');
  const repository = path.resolve(new URL('..', import.meta.url).pathname);
  const resolved = path.resolve(filePath);
  if (resolved === repository || resolved.startsWith(repository + path.sep)) {
    throw new Error('El archivo de PIN no puede guardarse dentro del repositorio');
  }
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = resolved + '.tmp-' + process.pid;
  const payload = {
    created_at: new Date().toISOString(),
    warning: 'CONFIDENCIAL: entregar una sola vez y eliminar después de confirmar el cambio de PIN.',
    employees: rows.map(row => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      temporary_pin: row.temporary_pin
    }))
  };
  await writeFile(temporary, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, resolved);
  await chmod(resolved, 0o600);
  return resolved;
}

async function main() {
  const projectRef = targetProjectRef();
  const plan = await loadIdentityCutoverPlan();
  const summary = summarizeIdentityCutoverPlan(plan);
  if (!hasFlag('execute')) {
    process.stdout.write(JSON.stringify({ mode: 'preflight', project_ref: projectRef, ...summary }) + '\n');
    return;
  }

  if (argument('confirm-project') !== projectRef) {
    throw new Error('Falta --confirm-project=' + projectRef);
  }
  const appUrl = argument('app-url');
  if (!/^https:\/\//i.test(appUrl)) throw new Error('Falta --app-url=https://...');
  const manualOutput = argument('manual-output');
  if (summary.in_person > 0 && !manualOutput) {
    throw new Error('Hay entregas presenciales; falta --manual-output con ruta segura fuera del repositorio');
  }

  const results = await executeIdentityCutover(plan, {
    appUrl,
    actor: { nombre: 'Administración SYNCRO SHIFT' }
  });
  const manual = results.filter(row => row.temporary_pin);
  let handoff = '';
  if (manual.length) {
    if (!manualOutput) {
      throw new Error('Falló una entrega por correo y no existe --manual-output seguro');
    }
    handoff = await writeManualHandoff(manualOutput, manual);
  }
  const output = {
    mode: 'execute',
    project_ref: projectRef,
    ready: results.filter(row => row.status === 'ready').length,
    email_sent: results.filter(row => row.status === 'email_sent').length,
    manual_required: manual.length,
    failed: results.filter(row => row.status === 'failed').length,
    manual_handoff_file: handoff || null
  };
  process.stdout.write(JSON.stringify(output) + '\n');
  if (output.failed > 0) process.exitCode = 2;
}

main().catch(error => {
  process.stderr.write('AUTH_CUTOVER_ABORTED: ' + (error && error.message ? error.message : 'unknown error') + '\n');
  process.exitCode = 1;
});
