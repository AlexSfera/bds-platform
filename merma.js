// ═══════════════════════════════════════════════════════════════════════
// MERMA — módulo dedicado · SYNCRO HUB · Balcón de la Sella
//
// Depende de (shared.js, cargado antes):
//   - getDB, dbInsert, dbUpdate, invalidateCache, auditLog, toast
//   - genId, today, localTs, currentUser, isAdmin, isSupervisor
//   - fmtDate
//
// Tablas Supabase:
//   - merma              → registros de merma (existente)
//   - productos_compra   → catálogo con coste_por_g (nueva, P1)
//   - platos_carta       → platos con PVP (nueva, P1)
//   - escandallo_lineas  → ingredientes por plato (nueva, P1)
//
// Funciones expuestas (window.*):
//   - renderMermaScreen()
//   - openMermaModal()
//   - closeMermaModal()
//   - saveMerma()
//   - mermaSearchProducto(query)
// ═══════════════════════════════════════════════════════════════════════

// ── DEPARTAMENTOS con acceso a merma ──────────────────────────────────
var MERMA_DEPTS = ['Cocina', 'Friegue', 'FnB'];

function canRegistrarMerma(u) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  return MERMA_DEPTS.indexOf(u.area || '') >= 0;
}

function canGestionarMerma(u) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  if (typeof isSupervisor === 'function' && isSupervisor(u)) return true;
  return false;
}

// ── CAUSAS DE MERMA ───────────────────────────────────────────────────
var MERMA_CAUSAS = [
  'Caducidad / fecha vencida',
  'Mal almacenamiento',
  'Error de producción',
  'Exceso de producción',
  'Rotura / accidente',
  'Deterioro por temperatura',
  'Devolución cliente',
  'Control de calidad',
  'Otra causa'
];

// ── CACHE LOCAL DE PRODUCTOS (para autocomplete rápido) ───────────────
var _mermaProductosCache = null;
var _mermaPlatosCache = null;

// Búsqueda server-side con ilike — fetch directo sin Prefer:return=minimal
async function _mermaFetchDirect(params) {
  var url = SUPABASE_URL + '/rest/v1/' + params;
  try {
    var res = await syncroSupabaseFetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      var err = await res.text();
      console.error('merma fetch error:', err);
      return [];
    }
    var text = await res.text();
    if (!text || text === 'null') return [];
    return JSON.parse(text);
  } catch(e) {
    console.error('merma fetch exception:', e);
    return [];
  }
}

async function _loadMermaProductos() {
  // No cachear — búsqueda server-side por query
  return []; // placeholder, la búsqueda se hace en mermaSearchProducto
}

async function _loadMermaPlatos() {
  if (_mermaPlatosCache) return _mermaPlatosCache;
  try {
    _mermaPlatosCache = await _mermaFetchDirect(
      'platos_carta?select=id,nombre,nombre_busqueda,categoria,precio_venta,activo&order=nombre.asc&limit=100'
    );
  } catch(e) { _mermaPlatosCache = []; }
  return _mermaPlatosCache || [];
}

// ── BUSCADOR DUAL: productos raw + platos preparados ──────────────────
// Busca simultáneamente en productos_compra Y platos_carta
// Devuelve array de resultados con tipo: 'producto' | 'plato'
async function mermaSearchProducto(query) {
  if (!query || query.trim().length < 2) return [];

  // Normalizar query: minúsculas sin tildes
  var q = query.trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Búsqueda server-side con ilike en nombre_busqueda
  var encQ = encodeURIComponent('*' + q + '*');

  var resProductos = await _mermaFetchDirect(
    'productos_compra?select=id,nombre,nombre_busqueda,categoria,unidad_compra,cantidad_unidad_g,merma_pct,coste_unidad_compra,coste_por_g,unidad_escandallo' +
    '&nombre_busqueda=ilike.' + encQ +
    '&activo=eq.true' +
    '&order=nombre.asc&limit=8'
  );

  var productos = (resProductos || []).map(function(p) {
    return {
      tipo: 'producto',
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria || '',
      unidad_compra: p.unidad_compra || 'unidad',
      unidad_escandallo: p.unidad_escandallo || 'g',
      coste_por_g: p.coste_por_g || null,
      coste_unidad: p.coste_unidad_compra || 0,
      cantidad_unidad_g: p.cantidad_unidad_g || null,
      merma_pct: p.merma_pct || 0
    };
  });

  // Platos: buscar en cache local (solo 29 platos)
  var todosPlatos = await _loadMermaPlatos();
  var platos = todosPlatos
    .filter(function(p) {
      var nombre = (p.nombre_busqueda || p.nombre || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return nombre.indexOf(q) >= 0;
    })
    .slice(0, 4)
    .map(function(p) {
      return {
        tipo: 'plato',
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria || '',
        precio_venta: p.precio_venta || 0,
        unidad_compra: 'ración',
        unidad_escandallo: 'ración'
      };
    });

  return productos.concat(platos);
}

// ── FORMATEAR COSTE PARA MOSTRAR EN BUSCADOR ──────────────────────────
function _mermaFormatCoste(item) {
  if (item.tipo === 'plato') {
    return 'Plato: ' + (item.precio_venta || '?') + '€/ración (PVP)';
  }
  if (item.coste_por_g) {
    var por100 = (item.coste_por_g * 100).toFixed(2);
    return por100 + '€/100g';
  }
  if (item.coste_unidad) {
    return item.coste_unidad.toFixed(2) + '€/' + (item.unidad_compra || 'unidad');
  }
  return 'Sin precio';
}

function _mermaGetUnidadLabel(item) {
  if (item.tipo === 'plato') return 'raciones';
  if (item.unidad_escandallo === 'ml') return 'ml';
  if (item.unidad_escandallo === 'unidad') return 'unidades';
  return 'g';
}

// ── CALCULAR COSTE TOTAL DE LA MERMA ─────────────────────────────────
function _mermaCalcCoste(item, cantidad) {
  var cant = parseFloat(cantidad) || 0;
  if (!cant) return 0;

  if (item.tipo === 'plato') {
    // Para platos: coste estimado = 30% del PVP (food cost estándar)
    return cant * (item.precio_venta || 0) * 0.30;
  }

  if (item.coste_por_g) {
    return cant * item.coste_por_g;
  }

  if (item.coste_unidad && item.cantidad_unidad_g) {
    var coste_g = item.coste_unidad / item.cantidad_unidad_g;
    return cant * coste_g;
  }

  // Si solo hay coste por unidad de compra (vinos, etc.)
  if (item.coste_unidad) {
    return cant * item.coste_unidad;
  }

  return 0;
}

// ── RENDER PANTALLA MERMA ─────────────────────────────────────────────

// ── MODAL GLOBAL — se inyecta en body al cargar merma.js ─────────────
// Así está disponible desde cualquier pantalla (Mi Turno, Merma, etc.)
function _mermaEnsureModal() {
  if (document.getElementById('modal-merma')) return; // ya existe
  var div = document.createElement('div');
  div.innerHTML = _mermaModalHTML();
  document.body.appendChild(div.firstElementChild);
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _mermaEnsureModal);
} else {
  _mermaEnsureModal();
}

async function renderMermaScreen() {
  var el = document.getElementById('screen-merma-mod');
  if (!el) return;

  if (!canRegistrarMerma(currentUser) && !canGestionarMerma(currentUser)) {
    el.innerHTML = '<div class="page-header"><div class="page-title">📦 Merma</div>'
      + '<div class="page-sub">Solo Cocina, Friegue y FnB.</div></div>';
    return;
  }

  var all = [];
  try { all = await getDB('merma'); } catch(e) { all = []; }

  var esManager = canGestionarMerma(currentUser);

  // Cocinero: solo ve su departamento y el día de hoy
  if (!esManager) {
    var dept = currentUser.area || '';
    var hoy = today();
    all = all.filter(function(m) {
      return (m.departamento === dept || m.area === dept) && (m.fecha || '').slice(0,10) === hoy;
    });
  }

  all.sort(function(a, b) {
    return (b.created_at || b.fecha || '').localeCompare(a.created_at || a.fecha || '');
  });

  // Render simple: botón grande + lista de lo registrado hoy
  el.innerHTML = '<div class="page-header">'
    + '<div class="page-title">📦 Merma</div>'
    + '<div class="page-sub">' + (esManager ? 'Gestión de merma del departamento' : 'Registra lo que has tirado hoy') + '</div>'
    + '</div>'
    + '<div style="margin-bottom:16px;">'
    + '<button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;" onclick="openMermaModal()">+ Añadir merma</button>'
    + '</div>'
    + (esManager ? _mermaFiltrosHTML() : '')
    + '<div id="merma-tabla-container"></div>';

  _renderMermaTabla(all, esManager);
}

function _mermaFiltrosHTML() {
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">'
    + '<select id="mfilt-causa" onchange="_mermaRefresh()" style="font-size:13px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;">'
    + '<option value="">Todas las causas</option>'
    + MERMA_CAUSAS.map(function(c) { return '<option>' + c + '</option>'; }).join('')
    + '</select>'
    + '<input id="mfilt-fecha" type="date" onchange="_mermaRefresh()" style="font-size:13px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;">'
    + '</div>';
}

async function _mermaRefresh() {
  var all = [];
  try { all = await getDB('merma'); } catch(e) {}
  all.sort(function(a, b) {
    return (b.created_at || b.fecha || '').localeCompare(a.created_at || a.fecha || '');
  });
  _renderMermaTabla(all, true);
}


function _renderMermaTabla(all, esManager) {
  var el = document.getElementById('merma-tabla-container');
  if (!el) return;

  var causa = (document.getElementById('mfilt-causa') || {}).value || '';
  var desde = (document.getElementById('mfilt-fecha') || {}).value || '';

  var filtered = all.slice();
  if (causa) filtered = filtered.filter(function(m) { return m.causa === causa; });
  if (desde) filtered = filtered.filter(function(m) { return (m.fecha || '') >= desde; });

  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin merma registrada — pulsa + Añadir merma</div></div>';
    return;
  }

  // Vista cocinero: tarjetas simples
  if (!esManager) {
    el.innerHTML = filtered.map(function(m) {
      var hora = '';
      try { hora = new Date(m.created_at || m.fecha).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); } catch(e){}
      return '<div class="task-card" style="margin-bottom:8px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '  <span style="font-weight:600;font-size:14px;">' + (m.producto || '—') + '</span>'
        + '  <span class="badge b-orange">' + (m.cantidad || '—') + ' ' + (m.unidad || '') + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-top:4px;">' + (m.causa || '—') + '</div>'
        + (hora ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;font-family:var(--font-mono);">' + hora + '</div>' : '')
        + '</div>';
    }).join('');
    return;
  }

  // Vista manager: tabla completa con coste
  el.innerHTML = '<div style="overflow-x:auto;">'
    + '<table>'
    + '<tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Causa</th><th>Coste</th><th>Dept.</th><th>Empleado</th></tr>'
    + filtered.map(function(m) {
        var sinC = !m.coste_unitario || parseFloat(m.coste_unitario) === 0;
        var esPlato = m.tipo === 'plato';
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">' + fmtDate(m.fecha) + '</td>'
          + '<td><span style="font-weight:600">' + (m.producto || '—') + '</span>'
          + (esPlato ? ' <span class="badge b-blue" style="font-size:10px">Plato</span>' : '') + '</td>'
          + '<td style="font-family:var(--font-mono)">' + (m.cantidad || '—') + ' ' + (m.unidad || '') + '</td>'
          + '<td style="font-size:12px;color:var(--text2)">' + (m.causa || '—') + '</td>'
          + '<td style="font-family:var(--font-mono);' + (sinC ? 'color:var(--amber)' : 'color:var(--orange);font-weight:600') + '">'
          + (sinC ? '⚠ Sin coste' : (parseFloat(m.coste_total) || 0).toFixed(2) + '€') + '</td>'
          + '<td style="font-size:12px">' + (m.departamento || '—') + '</td>'
          + '<td style="font-size:12px;color:var(--text2)">' + (m.nombre || '—') + '</td>'
          + '</tr>';
      }).join('')
    + '</table></div>';
}


// ── MODAL HTML ────────────────────────────────────────────────────────
function _mermaModalHTML() {
  return '<div id="modal-merma" class="modal-overlay" onclick="_mermaBackdropClose(event)">'    + '<div class="modal" style="max-width:520px;width:100%;" onclick="event.stopPropagation()">'    + '  <div class="modal-h">'    + '    <h3>📦 Registrar merma</h3>'    + '    <button class="modal-x" onclick="closeMermaModal()">✕</button>'    + '  </div>'    + '  <div class="modal-b">'    + '  <div>'    + '    <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Producto o plato <span style="color:var(--red)">*</span></label>'    + '    <input id="merma-search-input" type="text" placeholder="Escribe nombre del producto o plato..." autocomplete="off"'    + '      style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;"'    + '      oninput="_mermaBuscarDebounce(this.value)">'    + '    <div id="merma-search-results" style="display:none;background:var(--bg2);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;max-height:220px;overflow-y:auto;"></div>'    + '    <div id="merma-seleccionado" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--orange);">'    + '      <div style="font-weight:600;font-size:14px" id="merma-sel-nombre"></div>'    + '      <div style="font-size:12px;color:var(--text2);margin-top:2px" id="merma-sel-coste"></div>'    + '    </div>'    + '  </div>'    + '  <div style="display:flex;gap:10px;align-items:flex-end;margin-top:12px;">'    + '    <div style="flex:1">'    + '      <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Cantidad <span style="color:var(--red)">*</span></label>'    + '      <input id="merma-cantidad" type="number" min="0" step="0.1" placeholder="0"'    + '        style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;"'    + '        oninput="_mermaActualizarCoste()">'    + '    </div>'    + '    <div style="padding-bottom:10px;font-size:14px;color:var(--text2);min-width:50px;text-align:center" id="merma-unidad-label">g</div>'    + '  </div>'    + '  <div id="merma-coste-calc" style="display:none;padding:10px 12px;background:var(--bg3);border-radius:8px;text-align:center;margin-top:8px;">'    + '    <span style="font-size:12px;color:var(--text2)">Coste estimado: </span>'    + '    <span id="merma-coste-val" style="font-size:18px;font-weight:700;color:var(--orange)">0.00€</span>'    + '  </div>'    + '  <div style="margin-top:12px;">'    + '    <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Causa <span style="color:var(--red)">*</span></label>'    + '    <select id="merma-causa" style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;">'    + '      <option value="">— Selecciona causa —</option>'    + '      <option>Caducidad / fecha vencida</option>'    + '      <option>Mal almacenamiento</option>'    + '      <option>Error de producción</option>'    + '      <option>Exceso de producción</option>'    + '      <option>Rotura / accidente</option>'    + '      <option>Deterioro por temperatura</option>'    + '      <option>Devolución cliente</option>'    + '      <option>Control de calidad</option>'    + '      <option>Otra causa</option>'    + '    </select>'    + '  </div>'    + '  <div style="margin-top:12px;">'    + '    <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Notas (opcional)</label>'    + '    <textarea id="merma-notas" rows="2" placeholder="Descripción adicional..."'    + '      style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;resize:vertical;"></textarea>'    + '  </div>'    + '  </div>'    + '  <div class="modal-f">'    + '    <button class="btn btn-secondary" onclick="closeMermaModal()">Cancelar</button>'    + '    <button class="btn btn-primary" onclick="saveMerma()">💾 Guardar merma</button>'    + '  </div>'    + '</div></div>';
}

// ── ESTADO DEL MODAL ──────────────────────────────────────────────────
var _mermaItemSeleccionado = null;
var _mermaBuscarTimer = null;

function openMermaModal() {
  _mermaItemSeleccionado = null;
  _mermaEnsureModal(); // garantiza que el modal está en el DOM
  var m = document.getElementById('modal-merma');
  if (!m) return;

  // Reset form
  var inp = document.getElementById('merma-search-input');
  if (inp) inp.value = '';
  var cant = document.getElementById('merma-cantidad');
  if (cant) cant.value = '';
  var causa = document.getElementById('merma-causa');
  if (causa) causa.value = '';
  var notas = document.getElementById('merma-notas');
  if (notas) notas.value = '';
  var res = document.getElementById('merma-search-results');
  if (res) { res.style.display = 'none'; res.innerHTML = ''; }
  var sel = document.getElementById('merma-seleccionado');
  if (sel) sel.style.display = 'none';
  var calc = document.getElementById('merma-coste-calc');
  if (calc) calc.style.display = 'none';

  m.classList.add('open');
  setTimeout(function() {
    var inp2 = document.getElementById('merma-search-input');
    if (inp2) inp2.focus();
  }, 100);
}

function closeMermaModal() {
  var m = document.getElementById('modal-merma');
  if (m) m.classList.remove('open');
  _mermaItemSeleccionado = null;
}

function _mermaBackdropClose(e) {
  if (e.target === document.getElementById('modal-merma')) closeMermaModal();
}

// ── BUSCADOR CON DEBOUNCE ─────────────────────────────────────────────
function _mermaBuscarDebounce(val) {
  clearTimeout(_mermaBuscarTimer);
  if (!val || val.trim().length < 2) {
    var res = document.getElementById('merma-search-results');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    return;
  }
  _mermaBuscarTimer = setTimeout(function() {
    _mermaBuscar(val);
  }, 250);
}

async function _mermaBuscar(val) {
  var resultados = await mermaSearchProducto(val);
  var el = document.getElementById('merma-search-results');
  if (!el) return;

  if (!resultados.length) {
    el.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:var(--text2)">Sin resultados para "' + val + '"</div>';
    el.style.display = 'block';
    return;
  }

  el.innerHTML = resultados.map(function(item, i) {
    var icono = item.tipo === 'plato' ? '🍽️' : '📦';
    var badge = item.tipo === 'plato'
      ? '<span style="font-size:10px;background:var(--blue)22;color:var(--blue);padding:2px 6px;border-radius:10px;margin-left:6px">Plato</span>'
      : '<span style="font-size:10px;background:var(--orange)22;color:var(--orange);padding:2px 6px;border-radius:10px;margin-left:6px">' + (item.categoria || 'Materia prima') + '</span>';
    var costeLabel = _mermaFormatCoste(item);
    return '<div onclick="_mermaSeleccionar(' + i + ')" data-idx="' + i + '"'
      + ' style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;"'
      + ' onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'\'">'
      + '  <div>'
      + '    <span style="font-size:13px;font-weight:500">' + icono + ' ' + item.nombre + '</span>'
      + badge
      + '  </div>'
      + '  <div style="font-size:12px;color:var(--text2);font-family:var(--font-mono)">' + costeLabel + '</div>'
      + '</div>';
  }).join('');

  // Guardar resultados en dataset para acceso al seleccionar
  el._resultados = resultados;
  el.style.display = 'block';
}

function _mermaSeleccionar(idx) {
  var el = document.getElementById('merma-search-results');
  if (!el || !el._resultados) return;

  var item = el._resultados[idx];
  if (!item) return;

  _mermaItemSeleccionado = item;

  // Ocultar resultados
  el.style.display = 'none';
  el.innerHTML = '';

  // Mostrar seleccionado
  var inp = document.getElementById('merma-search-input');
  if (inp) inp.value = item.nombre;

  var selDiv = document.getElementById('merma-seleccionado');
  var selNombre = document.getElementById('merma-sel-nombre');
  var selCoste = document.getElementById('merma-sel-coste');
  if (selDiv && selNombre && selCoste) {
    selNombre.textContent = item.nombre;
    selCoste.textContent = _mermaFormatCoste(item);
    selDiv.style.display = 'block';
  }

  // Actualizar label de unidad
  var unidadLabel = document.getElementById('merma-unidad-label');
  if (unidadLabel) {
    unidadLabel.textContent = _mermaGetUnidadLabel(item);
  }

  // Actualizar coste si ya hay cantidad
  _mermaActualizarCoste();

  // Focus en cantidad
  var cant = document.getElementById('merma-cantidad');
  if (cant) cant.focus();
}

function _mermaActualizarCoste() {
  if (!_mermaItemSeleccionado) return;
  var cantEl = document.getElementById('merma-cantidad');
  var cant = parseFloat((cantEl || {}).value) || 0;
  var coste = _mermaCalcCoste(_mermaItemSeleccionado, cant);

  var calcDiv = document.getElementById('merma-coste-calc');
  var calcVal = document.getElementById('merma-coste-val');
  if (calcDiv && calcVal) {
    if (cant > 0) {
      calcVal.textContent = coste.toFixed(2) + '€';
      calcDiv.style.display = 'block';
    } else {
      calcDiv.style.display = 'none';
    }
  }
}

// ── GUARDAR MERMA ─────────────────────────────────────────────────────
async function saveMerma() {
  if (!currentUser) { toast('Sin sesión', 'err'); return; }

  var item = _mermaItemSeleccionado;
  if (!item) { toast('Selecciona un producto o plato', 'err'); return; }

  var cantEl = document.getElementById('merma-cantidad');
  var cant = parseFloat((cantEl || {}).value);
  if (!cant || cant <= 0) { toast('Indica la cantidad', 'err'); return; }

  var causa = (document.getElementById('merma-causa') || {}).value;
  if (!causa) { toast('Selecciona la causa', 'err'); return; }

  var notas = ((document.getElementById('merma-notas') || {}).value || '').trim();

  var costeUnitario = 0;
  var costeTotal = 0;

  if (item.tipo === 'plato') {
    costeUnitario = (item.precio_venta || 0) * 0.30;
    costeTotal = costeUnitario * cant;
  } else if (item.coste_por_g) {
    costeUnitario = item.coste_por_g;
    costeTotal = item.coste_por_g * cant;
  } else if (item.coste_unidad && item.cantidad_unidad_g) {
    costeUnitario = item.coste_unidad / item.cantidad_unidad_g;
    costeTotal = costeUnitario * cant;
  } else if (item.coste_unidad) {
    costeUnitario = item.coste_unidad;
    costeTotal = item.coste_unidad * cant;
  }

  var ts = localTs();
  var record = {
    id:              genId(),
    fecha:           today(),
    producto:        item.nombre,
    tipo:            item.tipo,
    producto_id:     item.tipo === 'producto' ? (item.id || null) : null,
    plato_id:        item.tipo === 'plato' ? (item.id || null) : null,
    cantidad:        cant,
    unidad:          _mermaGetUnidadLabel(item),
    causa:           causa,
    notas:           notas || null,
    coste_unitario:  parseFloat(costeUnitario.toFixed(5)),
    coste_total:     parseFloat(costeTotal.toFixed(2)),
    nombre:          currentUser.nombre,
    empleado_id:     currentUser.id || null,
    departamento:    currentUser.area || '',
    created_at:      ts,
    updated_at:      ts
  };

  try {
    await dbInsert('merma', record);
    invalidateCache('merma');
    auditLog('MERMA_REGISTRADA',
      currentUser.nombre + ' | ' + item.nombre +
      ' | ' + cant + ' ' + record.unidad +
      ' | causa: ' + causa +
      ' | coste: ' + costeTotal.toFixed(2) + '€'
    );
    toast('Merma registrada — ' + costeTotal.toFixed(2) + '€', 'ok');
    closeMermaModal();
    // Limpiar cache de productos para forzar recarga si hay actualizaciones
    _mermaProductosCache = null;
    _mermaPlatosCache = null;
    renderMermaScreen();
  } catch(e) {
    toast('Error al guardar: ' + (e.message || e), 'err');
  }
}
