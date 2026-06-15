// ═══════════════════════════════════════════════════════════════════════
// FICHAJE.JS · Análisis de Alertas Bitrix24
// Admin/Adjunto: importar texto bruto → analítica ranking + deduplicado
// Empleado: ver sus alertas del periodo + contadores
// Tabla Supabase: bitrix_alerts
// ═══════════════════════════════════════════════════════════════════════

// ── PARSER ──────────────────────────────────────────────────────────────
// Detecta los dos tipos de mensaje Bitrix:
// Tipo A: "anomalía en el marcaje del horario del siguiente empleado: NOMBRE"
// Tipo B: "utilizando un método no autorizado para registrar su tiempo: NOMBRE [IP]"

function parseBitrixAlerts(rawText) {
  var lines = rawText.split('\n');
  var full  = rawText;
  var results = [];

  // Dividir por bloque — cada mensaje empieza con "Estimado"
  var blocks = full.split(/(?=Estimado\/a\s)/g).filter(function(b){ return b.trim().length > 0; });

  blocks.forEach(function(block) {
    var b = block.trim();

    // Detectar tipo A: anomalía marcaje
    var matchA = b.match(/anomal[íi]a en el marcaje del horario del siguiente empleado:\s*([^\n\.]+)/i);
    // Detectar tipo B: método no autorizado
    var matchB = b.match(/utilizando un m[eé]todo no autorizado[^:]*:\s*([^\n\.]+)/i);
    // Detectar mensaje personal (al propio empleado — "Estimado/a NOMBRE")
    var matchP = b.match(/Estimado\/a ([A-Z][a-zA-ZÁÉÍÓÚáéíóúÑñ\s]+),\s*\n.*superado horario planificado/i);
    // Extraer IP si existe (último token tipo x.x.x.x)
    var ipMatch = b.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*$/m);
    var ip = ipMatch ? ipMatch[1] : null;

    var nombre = null;
    var tipo   = null;

    if (matchA) {
      nombre = matchA[1].trim().replace(/\s+/g, ' ');
      tipo   = 'anomalia_marcaje';
    } else if (matchB) {
      nombre = matchB[1].trim().replace(/\s+/g, ' ');
      tipo   = 'metodo_no_autorizado';
    } else if (matchP) {
      nombre = matchP[1].trim().replace(/\s+/g, ' ');
      tipo   = 'horario_superado';
    }

    if (nombre && tipo) {
      // Limpiar nombre: eliminar trailing IP o texto extra después de punto/newline
      nombre = nombre.replace(/\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}.*$/, '').trim();
      nombre = nombre.replace(/\.$/, '').trim();
      results.push({ nombre: nombre, tipo: tipo, ip: ip });
    }
  });

  return results;
}

// ── NORMALIZAR NOMBRE ────────────────────────────────────────────────────
// Capitaliza correctamente (NOMBRE → Nombre Apellido)
function normalizarNombre(n) {
  if (!n) return '';
  return n.split(/\s+/).map(function(w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// ── MATCHING EMPLEADO ────────────────────────────────────────────────────
// Devuelve { emp, tipo } o null
// tipo: 'exact' | 'fuzzy'
function fichajeMatchEmpleado(alertaNombre, employees) {
  var a = alertaNombre.toLowerCase().trim();
  var tokA = a.split(/\s+/).filter(function(t){ return t.length > 2; });

  var exactMatch = null;
  var fuzzyMatch = null;

  employees.forEach(function(e) {
    var eName = (e.nombre || '').toLowerCase().trim();
    if (eName === a) {
      exactMatch = { emp: e, tipo: 'exact' };
      return;
    }
    if (!exactMatch) {
      var tokE = eName.split(/\s+/);
      var hits = tokA.filter(function(t){ return tokE.indexOf(t) !== -1; });
      if (hits.length >= 1 && !fuzzyMatch) {
        fuzzyMatch = { emp: e, tipo: 'fuzzy' };
      }
    }
  });

  return exactMatch || fuzzyMatch || null;
}

// ── CREAR PERFIL MÍNIMO ─────────────────────────────────────────────────
// Genera un empleado sin rol/área para que el admin lo complete
async function fichajeCrearPerfilMinimo(nombre) {
  var pinTmp = 'AUTO' + Date.now().toString().slice(-6);
  var newEmp = {
    id:          'E' + Date.now(),
    nombre:      nombre,
    pin:         pinTmp,
    area:        '',
    puesto:      '',
    coste:       0,
    estado:      'Sin asignar',
    responsable: 0,
    validador:   0,
    rol:         'empleado',
    obs:         'Perfil creado automáticamente desde Alertas Fichaje. Pendiente asignar área y rol.',
    fecha_alta:  typeof today === 'function' ? today() : new Date().toISOString().slice(0,10),
    created_at:  typeof localTs === 'function' ? localTs() : new Date().toISOString()
  };
  var result = await dbInsert('employees', newEmp);
  if (result === null) return null;
  invalidateCache('employees');
  if (typeof auditLog === 'function') {
    auditLog('FICHAJE_CREATE_EMP', nombre + ' — perfil auto desde alertas fichaje');
  }
  return newEmp;
}

// ── ESTADO DEL MÓDULO ───────────────────────────────────────────────────
var _fichajeImportMode    = 'semanal';   // 'semanal' | 'mensual'
var _fichajeInicioSemana  = '';
var _fichajeFinSemana     = '';
var _fichajeMes           = '';          // YYYY-MM
var _fichajePreview       = [];          // parsed antes de confirmar
var _fichajeFilterPeriodo = '';          // filtro vista admin
var _fichajeFilterEmp     = '';          // filtro empleado concreto
var _fichajeMatchResult   = null;        // resultado del último matching

// ── RENDER PRINCIPAL ────────────────────────────────────────────────────
async function renderFichaje() {
  var el = document.getElementById('fichaje-content');
  if (!el) return;

  var isGestor = canActAsAdmin(currentUser);

  if (isGestor) {
    await renderFichajeAdmin(el);
  } else {
    await renderFichajeEmpleado(el);
  }
}

// ════════════════════════════════════════════════════════════════════════
// VISTA ADMIN
// ════════════════════════════════════════════════════════════════════════
async function renderFichajeAdmin(el) {
  // Cargar periodos únicos para filtro
  var allAlerts = await cargarBitrixAlerts();
  var periodosUnicos = [];
  allAlerts.forEach(function(a) {
    if (periodosUnicos.indexOf(a.periodo_control) === -1) {
      periodosUnicos.push(a.periodo_control);
    }
  });
  periodosUnicos.sort(function(a, b) { return b.localeCompare(a); });

  if (!_fichajeFilterPeriodo && periodosUnicos.length > 0) {
    _fichajeFilterPeriodo = periodosUnicos[0];
  }

  var alertasFiltradas = _fichajeFilterPeriodo
    ? allAlerts.filter(function(a) { return a.periodo_control === _fichajeFilterPeriodo; })
    : allAlerts;

  // ── Panel de matching (si hay resultado reciente) ──
  var matchPanel = _fichajeMatchResult
    ? renderFichajeMatchPanel(_fichajeMatchResult)
    : '';

  el.innerHTML = `
    ${matchPanel ? '<div id="fichaje-match-panel" style="margin-bottom:20px;">' + matchPanel + '</div>' : ''}

    <div class="two-col" style="gap:20px;align-items:flex-start;">

      <!-- COLUMNA IZQUIERDA: Importador -->
      <div>
        <div class="card">
          <div class="card-title">📥 IMPORTAR ALERTAS BITRIX24</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:14px;">
            Selecciona el periodo al que corresponden los mensajes de Bitrix24 que vas a importar.
            Los mensajes no contienen fecha exacta; el sistema usará este periodo para agrupar las incidencias.
          </p>

          <!-- Tipo de importación -->
          <div class="fg" style="margin-bottom:12px;">
            <label>Tipo de importación</label>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button class="tbtn ${_fichajeImportMode==='semanal'?'t-si':''}" 
                onclick="fichajeSetMode('semanal')" style="max-width:100px;">📅 Semanal</button>
              <button class="tbtn ${_fichajeImportMode==='mensual'?'t-si':''}" 
                onclick="fichajeSetMode('mensual')" style="max-width:100px;">📆 Mensual</button>
            </div>
          </div>

          <!-- Campos semanal -->
          <div id="fichaje-campos-semanal" style="display:${_fichajeImportMode==='semanal'?'block':'none'};">
            <div class="grid2" style="margin-bottom:12px;">
              <div class="fg">
                <label>Fecha inicio <span class="req">*</span></label>
                <input type="date" id="fich-inicio" value="${_fichajeInicioSemana}"
                  onchange="fichajeSemanaChange()">
              </div>
              <div class="fg">
                <label>Fecha fin <span class="req">*</span></label>
                <input type="date" id="fich-fin" value="${_fichajeFinSemana}"
                  onchange="_fichajeFinSemana=this.value">
              </div>
            </div>
          </div>

          <!-- Campos mensual -->
          <div id="fichaje-campos-mensual" style="display:${_fichajeImportMode==='mensual'?'block':'none'};">
            <div class="fg" style="margin-bottom:12px;">
              <label>Mes y año <span class="req">*</span></label>
              <input type="month" id="fich-mes" value="${_fichajeMes}"
                onchange="_fichajeMes=this.value">
            </div>
          </div>

          <!-- Textarea -->
          <div class="fg" style="margin-bottom:12px;">
            <label>Texto bruto de mensajes Bitrix24 <span class="req">*</span></label>
            <textarea id="fich-raw" rows="8" 
              placeholder="Pega aquí todos los mensajes copiados de Bitrix24..."></textarea>
          </div>

          <!-- Preview / Analizar -->
          <div class="btn-row">
            <button class="btn btn-secondary" onclick="fichajePreview()">🔍 Previsualizar</button>
            <button class="btn btn-primary" onclick="fichajeImportar()">💾 Importar</button>
          </div>

          <!-- Preview area -->
          <div id="fichaje-preview-area" style="margin-top:14px;"></div>
        </div>
      </div>

      <!-- COLUMNA DERECHA: Analítica -->
      <div>
        <div class="card">
          <div class="card-title">📊 RANKING DE ALERTAS</div>

          <!-- Filtro periodo -->
          <div class="fg" style="margin-bottom:14px;">
            <label>Periodo</label>
            <select onchange="_fichajeFilterPeriodo=this.value;renderFichaje()">
              <option value="">— Todos —</option>
              ${periodosUnicos.map(function(p){
                return '<option value="'+p+'"'+(p===_fichajeFilterPeriodo?' selected':'')+'>'+p+'</option>';
              }).join('')}
            </select>
          </div>

          ${renderFichajeRanking(alertasFiltradas)}
        </div>

        <!-- Resumen del periodo -->
        ${renderFichajeSummaryCards(alertasFiltradas)}
      </div>
    </div>
  `;
}

function renderFichajeRanking(alertas) {
  if (!alertas || alertas.length === 0) {
    return '<div style="color:var(--text3);font-size:13px;text-align:center;padding:24px;">Sin alertas para este periodo</div>';
  }

  // Agrupar por empleado
  var byEmp = {};
  alertas.forEach(function(a) {
    var k = normalizarNombre(a.nombre_empleado);
    if (!byEmp[k]) byEmp[k] = { nombre: k, anomalia: 0, no_autorizado: 0, superado: 0, total: 0, ips: [] };
    if (a.tipo_alerta === 'anomalia_marcaje')   byEmp[k].anomalia++;
    if (a.tipo_alerta === 'metodo_no_autorizado') byEmp[k].no_autorizado++;
    if (a.tipo_alerta === 'horario_superado')   byEmp[k].superado++;
    byEmp[k].total++;
    if (a.ip_detectada && byEmp[k].ips.indexOf(a.ip_detectada) === -1) byEmp[k].ips.push(a.ip_detectada);
  });

  var sorted = Object.values(byEmp).sort(function(a, b) { return b.total - a.total; });
  var maxTotal = sorted[0] ? sorted[0].total : 1;

  var rows = sorted.map(function(emp, i) {
    var barW = Math.round((emp.total / maxTotal) * 100);
    var alertColor = emp.total >= 10 ? 'var(--red)' : emp.total >= 5 ? 'var(--orange)' : 'var(--amber)';
    return `
      <tr>
        <td style="font-weight:600;font-size:13px;">${i+1}. ${emp.nombre}</td>
        <td style="text-align:center;">
          <span style="background:var(--orange-dim);color:var(--orange);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">${emp.anomalia}</span>
        </td>
        <td style="text-align:center;">
          <span style="background:var(--red-dim);color:var(--red);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">${emp.no_autorizado}</span>
        </td>
        <td style="text-align:center;">
          <span style="background:var(--blue-dim);color:var(--blue);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">${emp.superado}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;background:var(--bg4);border-radius:4px;height:8px;overflow:hidden;">
              <div style="width:${barW}%;background:${alertColor};height:100%;border-radius:4px;transition:width .3s;"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${alertColor};min-width:20px;">${emp.total}</span>
          </div>
          ${emp.ips.length ? '<div style="font-size:10px;color:var(--text3);margin-top:2px;">📍 '+emp.ips.join(', ')+'</div>' : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Empleado</th>
            <th style="text-align:center;">⚠ Anomalía</th>
            <th style="text-align:center;">🔴 No autorizado</th>
            <th style="text-align:center;">🔵 Horario</th>
            <th>Total / Barra</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderFichajeSummaryCards(alertas) {
  var totalAlertas   = alertas.length;
  var totalEmpleados = new Set(alertas.map(function(a){ return normalizarNombre(a.nombre_empleado); })).size;
  var anomalias      = alertas.filter(function(a){ return a.tipo_alerta === 'anomalia_marcaje'; }).length;
  var noAutorizados  = alertas.filter(function(a){ return a.tipo_alerta === 'metodo_no_autorizado'; }).length;

  return `
    <div class="three-col" style="margin-top:14px;">
      <div class="card" style="text-align:center;padding:14px;">
        <div style="font-size:28px;font-weight:700;color:var(--amber);font-family:var(--font-mono);">${totalAlertas}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">ALERTAS TOTALES</div>
      </div>
      <div class="card" style="text-align:center;padding:14px;">
        <div style="font-size:28px;font-weight:700;color:var(--orange);font-family:var(--font-mono);">${anomalias}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">ANOMALÍAS MARCAJE</div>
      </div>
      <div class="card" style="text-align:center;padding:14px;">
        <div style="font-size:28px;font-weight:700;color:var(--red);font-family:var(--font-mono);">${noAutorizados}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">MÉTODO NO AUTORIZADO</div>
      </div>
    </div>
    <div class="card" style="text-align:center;padding:14px;margin-top:0;">
      <div style="font-size:22px;font-weight:700;color:var(--blue);font-family:var(--font-mono);">${totalEmpleados} empleados</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;">con alertas en este periodo</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// PANEL DE MATCHING — resultado post-importación
// ════════════════════════════════════════════════════════════════════════
function renderFichajeMatchPanel(matchResult) {
  if (!matchResult || !matchResult.length) return '';

  var sinPerfil  = matchResult.filter(function(r){ return r.status === 'sin_perfil'; });
  var creados    = matchResult.filter(function(r){ return r.status === 'creado'; });
  var matchExact = matchResult.filter(function(r){ return r.status === 'exact'; });
  var matchFuzzy = matchResult.filter(function(r){ return r.status === 'fuzzy'; });

  var rows = matchResult.map(function(r) {
    var statusHtml;
    if (r.status === 'exact') {
      statusHtml = '<span style="background:var(--green-dim);color:var(--green);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">✓ Match exacto</span>';
    } else if (r.status === 'fuzzy') {
      statusHtml = '<span style="background:var(--blue-dim);color:var(--blue);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">≈ Match aproximado</span>';
    } else if (r.status === 'creado') {
      statusHtml = '<span style="background:var(--amber-dim);color:var(--amber);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">🆕 Perfil creado</span>';
    } else {
      statusHtml = '<span style="background:var(--red-dim);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">✗ Error al crear</span>';
    }
    var empInfo = r.empNombre
      ? '<span style="font-size:11px;color:var(--text2);">' + r.empNombre + (r.empArea ? ' · ' + r.empArea : '') + '</span>'
      : '<span style="font-size:11px;color:var(--text3);">—</span>';

    return '<tr>'
      + '<td style="font-weight:600;">' + r.alertaNombre + '</td>'
      + '<td>' + statusHtml + '</td>'
      + '<td>' + empInfo + '</td>'
      + '</tr>';
  }).join('');

  var resumen = [];
  if (matchExact.length) resumen.push('<span style="color:var(--green);">✓ ' + matchExact.length + ' exacto(s)</span>');
  if (matchFuzzy.length) resumen.push('<span style="color:var(--blue);">≈ ' + matchFuzzy.length + ' aproximado(s)</span>');
  if (creados.length)    resumen.push('<span style="color:var(--amber);">🆕 ' + creados.length + ' perfil(es) creado(s)</span>');
  if (sinPerfil.length)  resumen.push('<span style="color:var(--red);">✗ ' + sinPerfil.length + ' error(es)</span>');

  return '<div class="card" style="border-left:3px solid var(--amber);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    + '<div class="card-title" style="margin:0;">👥 MATCHING DE EMPLEADOS</div>'
    + '<button class="btn btn-secondary btn-sm" onclick="_fichajeMatchResult=null;renderFichaje()">✕ Cerrar</button>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;">'
    + resumen.join(' &nbsp;·&nbsp; ')
    + '</div>'
    + (creados.length
      ? '<div style="font-size:11px;background:var(--amber-dim);color:var(--amber);padding:8px;border-radius:6px;margin-bottom:10px;">'
        + '⚠ Los perfiles creados automáticamente tienen PIN temporal y sin área/rol asignados. '
        + 'Ve a <b>Maestro</b> para completarlos.'
        + '</div>'
      : '')
    + '<div class="tbl-wrap">'
    + '<table>'
    + '<thead><tr><th>Nombre en alerta</th><th>Estado</th><th>Perfil en sistema</th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════════════
// VISTA EMPLEADO
// ════════════════════════════════════════════════════════════════════════
async function renderFichajeEmpleado(el) {
  var nombre = currentUser.nombre || '';
  var allAlerts = await cargarBitrixAlerts();

  // Buscar sus alertas — match por nombre normalizado (fuzzy: contiene)
  var nombreNorm = nombre.toLowerCase().trim();
  var misAlertas = allAlerts.filter(function(a) {
    var empNorm = (a.nombre_empleado || '').toLowerCase().trim();
    return empNorm === nombreNorm || empNorm.indexOf(nombreNorm.split(' ')[0]) !== -1;
  });

  // Periodos únicos propios
  var misPeriodos = [];
  misAlertas.forEach(function(a) {
    if (misPeriodos.indexOf(a.periodo_control) === -1) misPeriodos.push(a.periodo_control);
  });
  misPeriodos.sort(function(a, b) { return b.localeCompare(a); });

  if (!_fichajeFilterPeriodo && misPeriodos.length > 0) _fichajeFilterPeriodo = misPeriodos[0];

  var alertasPeriodo = _fichajeFilterPeriodo
    ? misAlertas.filter(function(a) { return a.periodo_control === _fichajeFilterPeriodo; })
    : misAlertas;

  var anomalia     = alertasPeriodo.filter(function(a){ return a.tipo_alerta === 'anomalia_marcaje'; }).length;
  var noAutorizado = alertasPeriodo.filter(function(a){ return a.tipo_alerta === 'metodo_no_autorizado'; }).length;
  var total        = alertasPeriodo.length;

  el.innerHTML = `
    <div class="card">
      <div class="card-title">📋 MIS ALERTAS DE FICHAJE</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:14px;">
        Alertas detectadas por Bitrix24 asociadas a tu ficha.
      </p>

      <!-- Filtro periodo -->
      <div class="fg" style="margin-bottom:18px;max-width:300px;">
        <label>Periodo</label>
        <select onchange="_fichajeFilterPeriodo=this.value;renderFichaje()">
          <option value="">— Todos los periodos —</option>
          ${misPeriodos.map(function(p){
            return '<option value="'+p+'"'+(p===_fichajeFilterPeriodo?' selected':'')+'>'+p+'</option>';
          }).join('')}
        </select>
      </div>

      <!-- Contadores -->
      <div class="three-col" style="margin-bottom:18px;">
        <div style="background:var(--orange-dim);border:1px solid var(--orange);border-radius:var(--radius2);padding:14px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:var(--orange);font-family:var(--font-mono);">${anomalia}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">⚠ Anomalía marcaje</div>
        </div>
        <div style="background:var(--red-dim);border:1px solid var(--red);border-radius:var(--radius2);padding:14px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:var(--red);font-family:var(--font-mono);">${noAutorizado}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">🔴 Método no autorizado</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius2);padding:14px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:var(--text);font-family:var(--font-mono);">${total}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">TOTAL</div>
        </div>
      </div>

      ${total === 0
        ? '<div style="text-align:center;padding:32px;color:var(--green);font-size:14px;">✅ Sin alertas en este periodo</div>'
        : renderFichajeEmpleadoTabla(alertasPeriodo)
      }
    </div>
  `;
}

function renderFichajeEmpleadoTabla(alertas) {
  var TIPO_LABEL = {
    'anomalia_marcaje':    '⚠ Anomalía de marcaje',
    'metodo_no_autorizado':'🔴 Método no autorizado',
    'horario_superado':    '🔵 Horario superado'
  };
  var TIPO_STYLE = {
    'anomalia_marcaje':    'background:var(--orange-dim);color:var(--orange);',
    'metodo_no_autorizado':'background:var(--red-dim);color:var(--red);',
    'horario_superado':    'background:var(--blue-dim);color:var(--blue);'
  };

  var rows = alertas.map(function(a) {
    return `<tr>
      <td>${a.periodo_control}</td>
      <td><span style="border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;${TIPO_STYLE[a.tipo_alerta]||''}">${TIPO_LABEL[a.tipo_alerta]||a.tipo_alerta}</span></td>
      <td style="font-size:11px;color:var(--text3);">${a.ip_detectada || '—'}</td>
      <td style="font-size:11px;color:var(--text3);">[NO DATA]</td>
    </tr>`;
  }).join('');

  return `<div class="tbl-wrap">
    <table>
      <thead><tr><th>Periodo</th><th>Tipo de alerta</th><th>IP detectada</th><th>Fecha exacta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// IMPORTAR — FUNCIONES DE UI
// ════════════════════════════════════════════════════════════════════════

function fichajeSetMode(mode) {
  _fichajeImportMode = mode;
  document.getElementById('fichaje-campos-semanal').style.display = mode === 'semanal' ? 'block' : 'none';
  document.getElementById('fichaje-campos-mensual').style.display = mode === 'mensual' ? 'block' : 'none';
  // Update button styles
  document.querySelectorAll('#fichaje-content .tbtn').forEach(function(b) { b.classList.remove('t-si'); });
  renderFichaje();
}

function fichajeSemanaChange() {
  var ini = document.getElementById('fich-inicio');
  if (!ini) return;
  _fichajeInicioSemana = ini.value;
  // Auto-calcular fin = inicio + 6 días
  if (_fichajeInicioSemana) {
    var d = new Date(_fichajeInicioSemana + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    var fin = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    _fichajeFinSemana = fin;
    var finEl = document.getElementById('fich-fin');
    if (finEl) finEl.value = fin;
  }
}

function fichajeGetPeriodo() {
  if (_fichajeImportMode === 'semanal') {
    var ini = (document.getElementById('fich-inicio') || {}).value || _fichajeInicioSemana;
    var fin = (document.getElementById('fich-fin')    || {}).value || _fichajeFinSemana;
    if (!ini || !fin) return null;
    // Formatear DD/MM/YYYY
    function fmt(d) { var p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
    return fmt(ini) + '–' + fmt(fin);
  } else {
    var mes = (document.getElementById('fich-mes') || {}).value || _fichajeMes;
    if (!mes) return null;
    var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var parts = mes.split('-');
    return MESES[parseInt(parts[1])-1] + ' ' + parts[0];
  }
}

function fichajePreview() {
  var raw = (document.getElementById('fich-raw') || {}).value || '';
  if (!raw.trim()) { toast('Pega el texto de los mensajes primero','warn'); return; }

  var periodo = fichajeGetPeriodo();
  if (!periodo) { toast('Selecciona el periodo de importación','warn'); return; }

  var parsed = parseBitrixAlerts(raw);
  if (!parsed.length) { toast('No se detectaron alertas en el texto','warn'); return; }

  // Deduplicar para la preview (mismo nombre + tipo)
  var unique = {};
  parsed.forEach(function(p) {
    var k = normalizarNombre(p.nombre) + '|' + p.tipo;
    if (!unique[k]) unique[k] = { nombre: normalizarNombre(p.nombre), tipo: p.tipo, ip: p.ip, count: 0 };
    unique[k].count++;
  });
  _fichajePreview = Object.values(unique);

  var TIPO_LABEL = {
    'anomalia_marcaje':    '⚠ Anomalía marcaje',
    'metodo_no_autorizado':'🔴 Método no autorizado',
    'horario_superado':    '🔵 Horario superado'
  };

  var html = `
    <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius2);padding:14px;">
      <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--amber);margin-bottom:10px;letter-spacing:.12em;">
        PREVISUALIZACIÓN — ${periodo} · ${parsed.length} registros detectados (${_fichajePreview.length} únicos)
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Empleado</th><th>Tipo</th><th>IP</th><th>Repeticiones</th></tr></thead>
          <tbody>
            ${_fichajePreview.map(function(r){
              return '<tr><td>'+r.nombre+'</td><td>'+TIPO_LABEL[r.tipo]+'</td><td style="font-size:11px;color:var(--text3);">'+(r.ip||'—')+'</td><td style="font-family:var(--font-mono);font-weight:700;">'+r.count+'</td></tr>';
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--text3);margin-top:8px;">
        ⚠ Se guardarán ${parsed.length} registros individuales. Fecha exacta: [NO DATA].
      </p>
    </div>`;

  var area = document.getElementById('fichaje-preview-area');
  if (area) area.innerHTML = html;
}

async function fichajeImportar() {
  var raw = (document.getElementById('fich-raw') || {}).value || '';
  if (!raw.trim()) { toast('Pega el texto de los mensajes primero','warn'); return; }

  var periodo = fichajeGetPeriodo();
  if (!periodo) { toast('Selecciona el periodo antes de importar','warn'); return; }

  var parsed = parseBitrixAlerts(raw);
  if (!parsed.length) { toast('No se detectaron alertas en el texto','warn'); return; }

  var confirmMsg = 'Importar ' + parsed.length + ' alertas para el periodo "' + periodo + '"?';
  if (!confirm(confirmMsg)) return;

  var rows = parsed.map(function(p) {
    return {
      id:               genId(),
      ts:               localTs(),
      periodo_control:  periodo,
      nombre_empleado:  normalizarNombre(p.nombre),
      tipo_alerta:      p.tipo,
      ip_detectada:     p.ip || null,
      fecha_exacta:     null,
      importado_por:    currentUser.nombre,
      importado_rol:    currentUser.rol
    };
  });

  // Insertar en lotes de 50 para no saturar
  var BATCH = 50;
  var errores = 0;
  for (var i = 0; i < rows.length; i += BATCH) {
    var lote = rows.slice(i, i + BATCH);
    var res = await sbRequest('POST', 'bitrix_alerts', lote);
    if (!res) errores++;
  }

  if (errores === 0) {
    await auditLog('bitrix_alerts_import', periodo + ' · ' + rows.length + ' registros · por ' + currentUser.nombre);
    invalidateCache('bitrix_alerts');
    toast('✅ ' + rows.length + ' alertas importadas para ' + periodo, 'ok');

    // Limpiar textarea
    var rawEl = document.getElementById('fich-raw');
    if (rawEl) rawEl.value = '';
    var prevEl = document.getElementById('fichaje-preview-area');
    if (prevEl) prevEl.innerHTML = '';
    _fichajeFilterPeriodo = periodo;

    // ── MATCHING POST-IMPORT ─────────────────────────────────────────
    await fichajeEjecutarMatching(rows);

    await renderFichaje();
  } else {
    toast('Error al guardar. Revisa la consola.', 'error');
  }
}

// ── MATCHING: lógica principal ───────────────────────────────────────────
// Recibe las rows recién importadas, hace matching contra employees,
// crea perfiles para los que no tienen perfil, guarda resultado en _fichajeMatchResult
async function fichajeEjecutarMatching(rows) {
  // Nombres únicos de las alertas importadas
  var nombresUnicos = [];
  var seen = {};
  rows.forEach(function(r) {
    var n = normalizarNombre(r.nombre_empleado);
    if (!seen[n]) { seen[n] = true; nombresUnicos.push(n); }
  });

  // Cargar empleados actuales
  var employees = [];
  try { employees = await getDB('employees'); } catch(e) {}
  // Excluir estado Sin asignar ya creados (por si se reimporta)
  var activeEmps = employees.filter(function(e){ return e.estado !== 'Sin asignar'; });

  var resultados = [];

  for (var i = 0; i < nombresUnicos.length; i++) {
    var alertaNombre = nombresUnicos[i];
    var match = fichajeMatchEmpleado(alertaNombre, employees); // busca en todos (incluso sin asignar)

    if (match) {
      resultados.push({
        alertaNombre: alertaNombre,
        status: match.tipo,
        empNombre: match.emp.nombre,
        empArea: match.emp.area || '—'
      });
    } else {
      // Sin perfil → crear perfil mínimo
      var newEmp = await fichajeCrearPerfilMinimo(alertaNombre);
      if (newEmp) {
        resultados.push({
          alertaNombre: alertaNombre,
          status: 'creado',
          empNombre: newEmp.nombre,
          empArea: '— (pendiente asignar)'
        });
        // Añadir al array local para que el siguiente ciclo lo encuentre
        employees.push(newEmp);
      } else {
        resultados.push({
          alertaNombre: alertaNombre,
          status: 'sin_perfil',
          empNombre: null,
          empArea: null
        });
      }
    }
  }

  _fichajeMatchResult = resultados;
}

// ── CARGA DE DATOS ───────────────────────────────────────────────────────
async function cargarBitrixAlerts() {
  var data = await sbRequest('GET', 'bitrix_alerts', null, 'order=ts.desc');
  return data || [];
}

// ── HOOK: showScreen ─────────────────────────────────────────────────────
// Se llama desde showScreen cuando id === 'fichaje'
window._fichajeOnShow = function() {
  _fichajeFilterPeriodo = '';
  _fichajeMatchResult   = null;
  renderFichaje();
};
