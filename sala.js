// ═══════════════════════════════════════════════════
// SALA — Funciones exclusivas de Sala
// Depende de: shared.js, checklist.js
// ═══════════════════════════════════════════════════

var _salaState = {};

function setSalaBlock(name, val) {
  _salaState[name] = val;
  var blockMap = {
    'descuentos':'block-descuentos',
    'anulaciones':'block-anulaciones',
    'invitaciones':'block-invitaciones',
    'devoluciones':'block-devoluciones',
  };
  if(blockMap[name]) {
    var block = document.getElementById(blockMap[name]);
    if(block) block.classList.toggle('visible', val==='si');
  }
  var allBtns = ['desc-si','desc-no','anul-si','anul-no','anulresp-si','anulresp-no',
                 'inv-si','inv-no','invpos-si','invpos-no','dev-si','dev-no','devcliente-si','devcliente-no'];
  allBtns.forEach(function(id){
    var el=document.getElementById(id);
    if(!el) return;
    var baseName=id.replace('-si','').replace('-no','');
    var keyMap={'desc':'descuentos','anul':'anulaciones','anulresp':'anulresp',
                'inv':'invitaciones','invpos':'invposmews','dev':'devoluciones','devcliente':'devcliente'};
    if(keyMap[baseName]===name){
      var isMatch=(id.endsWith('-si')&&val==='si')||(id.endsWith('-no')&&val==='no');
      el.classList.toggle('active',isMatch);
    }
  });
}

function collectSalaData() {
  var d={};
  d.descuentos_si=_salaState['descuentos']==='si';
  d.descuentos_num=parseInt((document.getElementById('s-desc-num')||{}).value)||0;
  d.descuentos_motivo=(document.getElementById('s-desc-motivo')||{}).value||'';
  d.descuentos_obs=(document.getElementById('s-desc-obs')||{}).value||'';
  d.anulaciones_si=_salaState['anulaciones']==='si';
  d.anulaciones_num=parseInt((document.getElementById('s-anul-num')||{}).value)||0;
  d.anulaciones_motivo=(document.getElementById('s-anul-motivo')||{}).value||'';
  d.anulaciones_resp_inf=_salaState['anulresp']==='si';
  d.invitaciones_si=_salaState['invitaciones']==='si';
  d.invitaciones_tipo=(document.getElementById('s-inv-tipo')||{}).value||'';
  d.invitaciones_num=parseInt((document.getElementById('s-inv-num')||{}).value)||0;
  d.invitaciones_producto=(document.getElementById('s-inv-producto')||{}).value||'';
  d.invitaciones_posmews=_salaState['invposmews']==='si';
  d.devoluciones_si=_salaState['devoluciones']==='si';
  d.devoluciones_num=parseInt((document.getElementById('s-dev-num')||{}).value)||0;
  d.devoluciones_motivo=(document.getElementById('s-dev-motivo')||{}).value||'';
  d.devoluciones_cliente=_salaState['devcliente']==='si';
  return d;
}

function clearSalaFields() {
  _salaState={};
  ['s-desc-num','s-desc-obs','s-anul-num','s-anul-obs',
   's-inv-num','s-inv-producto','s-dev-num','s-dev-obs'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  ['s-desc-motivo','s-anul-motivo','s-inv-tipo','s-dev-motivo'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  ['block-descuentos','block-anulaciones','block-invitaciones','block-devoluciones'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.classList.remove('visible');
  });
}

// ── AJUSTES MODAL (antes del checklist) ──
var _ajustesChoice = null;
var _ajustesLines = [];
var _ajToggles = {};

function openAjustesModal() {
  _ajustesChoice=null;
  _ajustesLines=[];
  document.getElementById('ajustes-lines-block').style.display='none';
  document.getElementById('ajustes-lines').innerHTML='';
  document.getElementById('ajustes-confirm-btn').disabled=true;
  ['ajustes-no-btn','ajustes-si-btn'].forEach(function(id){
    var el=document.getElementById(id); if(el){el.style.outline='none';el.style.boxShadow='none';}
  });
  document.getElementById('modal-ajustes').style.display='flex';
}

function ajustesChoice(choice) {
  _ajustesChoice=choice;
  var noBtn=document.getElementById('ajustes-no-btn');
  var siBtn=document.getElementById('ajustes-si-btn');
  var linesBlock=document.getElementById('ajustes-lines-block');
  var confirmBtn=document.getElementById('ajustes-confirm-btn');
  if(choice==='no'){
    if(noBtn) noBtn.style.boxShadow='0 0 0 2px var(--green)';
    if(siBtn) siBtn.style.boxShadow='none';
    if(linesBlock) linesBlock.style.display='none';
    if(confirmBtn) confirmBtn.disabled=false;
  } else {
    if(siBtn) siBtn.style.boxShadow='0 0 0 2px #3b82f6';
    if(noBtn) noBtn.style.boxShadow='none';
    if(linesBlock) linesBlock.style.display='block';
    if(!document.getElementById('ajustes-lines').children.length) addAjusteLine();
    if(confirmBtn) confirmBtn.disabled=false;
  }
}

function addAjusteLine() {
  var container=document.getElementById('ajustes-lines');
  var idx=container.children.length;
  var div=document.createElement('div');
  div.className='card';
  div.style.marginBottom='8px';
  div.style.padding='10px';
  div.style.borderLeft='3px solid #3b82f6';
  div.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    +'<div class="fg"><label>Tipo</label>'
    +'<select id="aj-tipo-'+idx+'" style="font-size:13px;">'
    +'<option>Anulación</option><option>Devolución</option><option>Invitación</option>'
    +'<option>Error TPV</option><option>Error cobro</option>'
    +'<option>Cargo incorrecto</option><option>Otro</option>'
    +'</select></div>'
    +'<div class="fg"><label>Nº operaciones</label>'
    +'<input type="number" id="aj-num-'+idx+'" min="1" value="1" style="font-size:13px;"></div>'
    +'<div class="fg"><label>Importe estimado (€)</label>'
    +'<input type="number" id="aj-imp-'+idx+'" min="0" step="0.01" placeholder="0.00" style="font-size:13px;"></div>'
    +'<div class="fg"><label>¿Comunicado al responsable?</label>'
    +'<div class="toggle-group">'
    +'<button class="tbtn" id="aj-resp-si-'+idx+'" data-idx="'+idx+'" data-val="si" onclick="setAjToggleBtn(this)">SÍ</button>'
    +'<button class="tbtn" id="aj-resp-no-'+idx+'" data-idx="'+idx+'" data-val="no" onclick="setAjToggleBtn(this)">NO</button>'
    +'</div></div>'
    +'<div class="fg sp2"><label>Motivo</label>'
    +'<input type="text" id="aj-motivo-'+idx+'" placeholder="Describe brevemente" style="font-size:13px;"></div>'
    +'</div>'
    +'<button onclick="this.parentElement.remove()" style="margin-top:6px;background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;">✕ Eliminar línea</button>';
  container.appendChild(div);
}

function setAjToggle(idx,val){ _ajToggles[idx]=val; }

function setAjToggleBtn(btn) {
  var idx=btn.getAttribute('data-idx');
  var val=btn.getAttribute('data-val');
  _ajToggles[String(idx)]=val;
  var si=document.getElementById('aj-resp-si-'+idx);
  var no=document.getElementById('aj-resp-no-'+idx);
  if(si){si.classList.toggle('active',val==='si');si.style.background=val==='si'?'var(--green)':'';si.style.color=val==='si'?'#fff':'';}
  if(no){no.classList.toggle('active',val==='no');no.style.background=val==='no'?'var(--red)':'';no.style.color=val==='no'?'#fff':'';}
}

function collectAjusteLines() {
  var lines=[];
  var container=document.getElementById('ajustes-lines');
  if(!container) return lines;
  var count=container.children.length;
  for(var i=0;i<count;i++){
    var tipo=(document.getElementById('aj-tipo-'+i)||{}).value||'';
    var num=parseInt((document.getElementById('aj-num-'+i)||{}).value)||1;
    var imp=parseFloat((document.getElementById('aj-imp-'+i)||{}).value)||0;
    var motivo=(document.getElementById('aj-motivo-'+i)||{}).value||'';
    var comunicado=_ajToggles[i]||'';
    if(tipo) lines.push({tipo,num,importe:imp,motivo,comunicado_responsable:comunicado});
  }
  return lines;
}

function confirmAjustes() {
  if(_ajustesChoice==='si'){
    _ajustesLines=collectAjusteLines();
    if(_ajustesLines.length===0){toast('Añade al menos una línea de ajuste','err');return;}
  } else {
    _ajustesLines=[];
  }
  document.getElementById('modal-ajustes').style.display='none';
  chkOpen({});
}

function closeAjustesModal() {
  document.getElementById('modal-ajustes').style.display='none';
}
