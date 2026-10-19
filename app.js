(() => {
  const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const MES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const START = '08:00', MID = '12:30', BASE_END = '17:00';
  const PRIO = ['#A9D3BC','#B9D7A7','#CCDB9C','#E0DB93','#EFCF84','#F2BC75','#F2A66B','#EE8C63','#E6705A','#D85650'];
  const END_OPTS = []; for (let m = 17*60; m <= 22*60; m += 30) END_OPTS.push(hhmm(m));
  const LOCAL_KEY = 'cronograma-semanal.v1';

  const $ = id => document.getElementById(id);
  function pad(n){ return String(n).padStart(2,'0'); }
  function hhmm(m){ return pad(Math.floor(m/60)) + ':' + pad(m%60); }
  function toMin(s){ const [h,m] = String(s).split(':').map(Number); return h*60 + (m||0); }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function mondayOf(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function parseISO(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function clampInt(v, lo, hi, def){ v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; }
  function fmtDur(n){ const w = Math.floor(n/2), h = n%2; if (!w) return '½ día'; return w + (h ? '½' : '') + (n === 2 ? ' día' : ' días'); }
  function fmtH(h){ return h.toLocaleString('es-AR', {maximumFractionDigits:1}) + ' h'; }
  function prioColor(p){ return PRIO[clampInt(p,1,10,5)-1]; }
  function level(p){ return p <= 3 ? 'Baja' : p <= 6 ? 'Media' : p <= 8 ? 'Alta' : 'Crítica'; }
  function weekLabel(wk, long){
    const a = parseISO(wk), b = addDays(a, 4);
    if (long) return `${a.getDate()} de ${MES_L[a.getMonth()]} al ${b.getDate()} de ${MES_L[b.getMonth()]} de ${b.getFullYear()}`;
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MES[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]} ${b.getFullYear()}`;
  }

  const state = { week: iso(mondayOf(new Date())), tasks: [], ends: {}, sort: 'start', mode: 'pending', canWrite: true };
  let db = null, downloads = null, standalone = false, unsubTasks = null, unsubWeek = null, local = null;

  const startSlot = t => t.day*2 + t.half;
  const endSlot = t => Math.min(9, startSlot(t) + t.dur - 1);
  const endOf = d => state.ends[d] || BASE_END;
  const slotHours = s => (s % 2 === 0) ? (toMin(MID) - toMin(START))/60 : (toMin(endOf(Math.floor(s/2))) - toMin(MID))/60;
  const taskHours = t => { let h = 0; for (let s = startSlot(t); s <= endSlot(t); s++) h += slotHours(s); return h; };
  const slotName = s => `${DAYS[Math.floor(s/2)]} ${s%2 ? 'tarde' : 'mañana'}`;

  function normTask(id, d){
    return {
      id, week: String(d.week || state.week),
      name: String(d.name || 'Sin nombre').slice(0,120),
      desc: String(d.desc || '').slice(0,2000),
      priority: clampInt(d.priority,1,10,5),
      day: clampInt(d.day,0,4,0), half: clampInt(d.half,0,1,0),
      dur: clampInt(d.dur,1,10,1)
    };
  }

  function sortedTasks(list){
    const a = list.slice();
    if (state.sort === 'prio') a.sort((x,y) => y.priority - x.priority || startSlot(x) - startSlot(y) || x.name.localeCompare(y.name));
    else a.sort((x,y) => startSlot(x) - startSlot(y) || y.priority - x.priority || x.name.localeCompare(y.name));
    return a;
  }

  /* ---------- render ---------- */
  function render(){
    const mon = parseISO(state.week);
    const todayIso = iso(new Date());
    $('weekLabel').textContent = weekLabel(state.week);
    const extDays = [0,1,2,3,4].filter(d => endOf(d) !== BASE_END);
    $('sub').textContent = '08:00 – 17:00 · Mañana 08:00–12:30 · Tarde 12:30–17:00' +
      (extDays.length ? ' · ' + extDays.map(d => `${DAYS[d]} hasta ${endOf(d)}`).join(', ') : '');

    let h = '<div class="grid head"><div class="corner"><span class="k">Tarea</span></div>';
    for (let d = 0; d < 5; d++) {
      const date = addDays(mon, d), isToday = iso(date) === todayIso, ext = endOf(d) !== BASE_END;
      const sel = state.canWrite && state.mode !== 'pending'
        ? `<label class="endsel" title="Hora de salida del ${DAYS[d].toLowerCase()}">hasta <select id="end-${d}" data-end="${d}" aria-label="Hora de fin del ${DAYS[d]}">${END_OPTS.map(o => `<option${o===endOf(d)?' selected':''}>${o}</option>`).join('')}</select></label>`
        : `<span class="endsel">hasta ${endOf(d)}</span>`;
      h += `<div class="day${ext?' ext':''}${isToday?' today':''}"><span><span class="dname">${DAYS[d]}</span><span class="date">${pad(date.getDate())}/${pad(date.getMonth()+1)}</span></span>${sel}</div>`;
    }
    for (let s = 0; s < 10; s++) {
      const d = Math.floor(s/2), ext = s%2 && endOf(d) !== BASE_END;
      h += `<div class="half ${s%2?'pm':'am'}${ext?' ext':''}" style="grid-column:${s+2}"><b>${s%2?'Tarde':'Mañana'}</b>${s%2 ? MID+'–'+endOf(d) : START+'–'+MID}</div>`;
    }
    h += '</div>';

    const list = sortedTasks(state.tasks);
    let bg = '';
    for (let s = 0; s < 10; s++) { const ext = s%2 && endOf(Math.floor(s/2)) !== BASE_END; bg += `<div class="cell ${s%2?'pm':'am'}${ext?' ext':''}" style="grid-column:${s+2}"></div>`; }

    if (state.mode === 'pending') {
      h += '<div class="grid row"><div class="empty"><span>Cargando…</span></div></div>';
    } else if (!state.tasks.length) {
      h += `<div class="grid row"><div class="empty"><strong>Sin tareas esta semana</strong><span>${state.canWrite ? 'Agregá una con «Nueva tarea» o tocando un turno abajo.' : 'Cuando se carguen tareas, van a aparecer acá.'}</span></div></div>`;
    }
    for (const t of list) {
      const s0 = startSlot(t), s1 = endSlot(t);
      h += `<div class="grid row task${state.canWrite?'':' ro'}" data-edit="${esc(t.id)}" ${state.canWrite?'tabindex="0" role="button"':''} aria-label="${esc(t.name)}, prioridad ${t.priority}, ${slotName(s0)} a ${slotName(s1)}">
        <div class="info"><span class="prio" style="--p:${prioColor(t.priority)}" title="Prioridad ${t.priority} · ${level(t.priority)}">${t.priority}</span>
          <div class="txt"><span class="t">${esc(t.name)}</span>${t.desc?`<span class="d">${esc(t.desc)}</span>`:''}</div></div>
        ${bg}
        <div class="bar" style="--p:${prioColor(t.priority)};grid-column:${s0+2} / span ${s1-s0+1}" title="${esc(t.name)} · ${slotName(s0)} → ${slotName(s1)} · ${fmtH(taskHours(t))}">${esc(t.name)}<small>${fmtDur(s1-s0+1)} · ${fmtH(taskHours(t))}</small></div>
      </div>`;
    }
    if (state.canWrite && state.mode !== 'pending') {
      h += `<div class="grid row add"><div class="info"><span>+ Tocá un turno para agregar</span></div>`;
      for (let s = 0; s < 10; s++) h += `<button class="slot ${s%2?'pm':'am'}" style="grid-column:${s+2}" data-add="${s}" aria-label="Nueva tarea desde el ${slotName(s)}">+</button>`;
      h += '</div>';
    }
    $('board').innerHTML = h;

    $('sortStart').setAttribute('aria-pressed', state.sort === 'start');
    $('sortPrio').setAttribute('aria-pressed', state.sort === 'prio');
    $('newTask').hidden = !state.canWrite;
    $('newTask').disabled = state.mode === 'pending';
    $('import').hidden = !state.canWrite;
    $('import').disabled = state.mode === 'pending';

    const total = state.tasks.reduce((a,t) => a + taskHours(t), 0);
    $('status').textContent = state.mode === 'pending' ? 'Cargando…' :
      `${state.tasks.length} ${state.tasks.length===1?'tarea':'tareas'} · ${fmtH(total)} planificadas` + (state.mode === 'local' && !standalone ? ' · guardado en este navegador' : '');
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg){ const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 3500); }

  /* ---------- storage ---------- */
  function loadLocal(){
    try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { local = null; }
    if (!local || typeof local !== 'object') local = {tasks: [], weeks: {}};
    local.tasks = Array.isArray(local.tasks) ? local.tasks : []; local.weeks = local.weeks || {};
  }
  function saveLocal(){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch {} }
  function pullLocal(){
    state.tasks = local.tasks.filter(t => t.week === state.week).map(t => normTask(t.id, t));
    state.ends = (local.weeks[state.week] || {}).ends || {};
  }

  function subscribe(){
    if (state.mode === 'local') { pullLocal(); render(); return; }
    if (state.mode !== 'db') { render(); return; }
    if (unsubTasks) unsubTasks(); if (unsubWeek) unsubWeek();
    const wk = state.week;
    state.tasks = []; state.ends = {};
    unsubTasks = db.collection('tasks').where('week','==',wk).onSnapshot(snap => {
      if (wk !== state.week) return;
      state.tasks = snap.docs.filter(d => d.exists).map(d => normTask(d.id, d.data()));
      render();
    }, () => toast('Se perdió la conexión con los datos. Recargá la página.'));
    unsubWeek = db.doc('weeks/' + wk).onSnapshot(s => {
      if (wk !== state.week) return;
      const d = s.exists ? s.data() : null;
      state.ends = (d && d.ends && typeof d.ends === 'object') ? {...d.ends} : {};
      for (const k of Object.keys(state.ends)) if (!END_OPTS.includes(state.ends[k])) delete state.ends[k];
      render();
    }, () => {});
    render();
  }

  function writeFailed(e){
    if (e && e.code === 'invalid_argument') { state.canWrite = false; render(); toast('Tenés acceso de solo lectura a este cronograma.'); }
    else if (e && e.code === 'quota_exceeded') toast('Se llenó el espacio de datos. Borrá tareas viejas para seguir cargando.');
    else toast('No se pudo guardar. Probá de nuevo en unos segundos.');
  }

  function taskBody(t){ return {week:t.week, name:t.name, desc:t.desc, priority:t.priority, day:t.day, half:t.half, dur:t.dur, updatedAt: Date.now()}; }
  async function putTask(t){
    const body = taskBody(t);
    if (state.mode === 'db') { try { await db.collection('tasks').doc(t.id).set(body); return true; } catch(e){ writeFailed(e); return false; } }
    const i = local.tasks.findIndex(x => x.id === t.id);
    if (i >= 0) local.tasks[i] = {id:t.id, ...body}; else local.tasks.push({id:t.id, ...body});
    saveLocal(); pullLocal(); render(); return true;
  }
  async function removeTask(id){
    if (state.mode === 'db') { try { await db.doc('tasks/' + id).delete(); return true; } catch(e){ writeFailed(e); return false; } }
    local.tasks = local.tasks.filter(x => x.id !== id); saveLocal(); pullLocal(); render(); return true;
  }
  async function setEnd(day, val){
    const ends = {...state.ends};
    if (val === BASE_END) delete ends[day]; else ends[day] = val;
    if (state.mode === 'db') {
      state.ends = ends; render();
      try { await db.doc('weeks/' + state.week).set({ends}); } catch(e){ writeFailed(e); }
    } else { local.weeks[state.week] = {ends}; saveLocal(); pullLocal(); render(); }
    toast(val === BASE_END ? `${DAYS[day]}: hasta 17:00` : `${DAYS[day]} extendido hasta ${val}`);
  }
  function newId(){
    if (state.mode === 'db') return db.collection('tasks').doc().id;
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  /* ---------- dialog ---------- */
  const dlg = $('dlg');
  let editing = null;
  $('prios').innerHTML = PRIO.map((c,i) => `<input type="radio" name="prio" id="p${i+1}" value="${i+1}"><label for="p${i+1}">${i+1}</label>`).join('');

  function fillDays(){
    const mon = parseISO(state.week);
    $('f-day').innerHTML = DAYS.map((d,i) => { const x = addDays(mon,i); return `<option value="${i}">${d} ${pad(x.getDate())}/${pad(x.getMonth()+1)}</option>`; }).join('');
  }
  function formVals(){
    const day = Number($('f-day').value), half = Number(document.querySelector('input[name=half]:checked').value);
    const prio = Number((document.querySelector('input[name=prio]:checked') || {}).value || 5);
    return {day, half, dur: Number($('f-dur').value) || 1, priority: prio};
  }
  function fillDur(keep){
    const {day, half} = formVals();
    const max = 10 - (day*2 + half);
    const cur = Math.min(keep || Number($('f-dur').value) || 2, max);
    let o = '';
    for (let n = 1; n <= max; n++) o += `<option value="${n}"${n===cur?' selected':''}>${fmtDur(n)}</option>`;
    $('f-dur').innerHTML = o;
    updSum();
  }
  function updSum(){
    const v = formVals(); const t = {day:v.day, half:v.half, dur:v.dur};
    $('f-sum').innerHTML = `De <b>${slotName(startSlot(t)).toLowerCase()}</b> a <b>${slotName(endSlot(t)).toLowerCase()}</b> · ${fmtH(taskHours(t))}`;
  }
  function openDialog(t){
    editing = t;
    fillDays();
    $('dlgTitle').textContent = t.id ? 'Editar tarea' : 'Nueva tarea';
    $('f-name').value = t.name || ''; $('f-desc').value = t.desc || '';
    resetAI();
    $('p' + (t.priority || 5)).checked = true;
    $('f-day').value = String(t.day || 0);
    $('h' + (t.half || 0)).checked = true;
    fillDur(t.dur || 2);
    $('delWrap').hidden = !t.id; $('del').hidden = false; $('confirmDel').hidden = true;
    dlg.showModal();
    setTimeout(() => $('f-name').focus(), 30);
  }
  $('f-day').addEventListener('change', () => fillDur());
  document.querySelectorAll('input[name=half]').forEach(r => r.addEventListener('change', () => fillDur()));
  $('f-dur').addEventListener('change', updSum);
  $('cancel').addEventListener('click', () => dlg.close());
  $('del').addEventListener('click', () => { $('del').hidden = true; $('confirmDel').hidden = false; $('delNo').focus(); });
  $('delNo').addEventListener('click', () => { $('del').hidden = false; $('confirmDel').hidden = true; });
  $('delYes').addEventListener('click', async () => {
    const id = editing && editing.id; if (!id) return;
    dlg.close();
    if (await removeTask(id)) toast('Tarea eliminada');
  });
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('f-name').value.trim();
    if (!name) { $('f-name').setCustomValidity('Escribí un nombre para la tarea'); $('f-name').reportValidity(); return; }
    const v = formVals();
    const t = normTask(editing.id || newId(), {week: state.week, name, desc: $('f-desc').value.trim(), ...v});
    const isNew = !editing.id;
    dlg.close();
    if (await putTask(t)) toast(isNew ? 'Tarea agregada' : 'Cambios guardados');
  });
  $('f-name').addEventListener('input', () => $('f-name').setCustomValidity(''));

  /* ---------- IA para descripciones ---------- */
  const KEY_STORE = 'cronograma.geminiKey';
  const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest'];
  let aiSample = null, aiPrev = null, aiBusy = false;
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
  const setKey = k => { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch {} };
  function aiPrompt(name, points){
    return `Sos un asistente que redacta descripciones de tareas para un cronograma de trabajo semanal.

Tarea: ${name || '(sin nombre)'}
Puntos clave que escribió la persona:
${points}

Escribí una descripción clara y profesional en español de Argentina, de 60 a 120 palabras, en un solo párrafo. Desarrollá esos puntos: qué se hace, cómo se encara y qué resultado se espera. No inventes datos concretos (nombres, cifras, fechas, lugares) que no estén en los puntos. Devolvé solo el texto de la descripción, sin título, sin comillas y sin viñetas.`;
  }
  async function gemini(prompt, key){
    let last = {code:'http'};
    for (const model of GEMINI_MODELS) {
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key': key},
          body: JSON.stringify({contents:[{role:'user', parts:[{text: prompt}]}], generationConfig:{temperature:0.6}})
        });
      } catch { throw {code:'network'}; }
      const j = await res.json().catch(() => ({}));
      if (res.status === 404) { last = {code:'model'}; continue; }
      if (!res.ok) {
        const msg = (j.error && j.error.message) || '';
        if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw {code:'key'};
        if (res.status === 429) throw {code:'quota'};
        throw {code:'http', message: msg};
      }
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      return parts.filter(x => !x.thought).map(x => x.text || '').join('').trim();
    }
    throw last;
  }
  function resetAI(){
    aiPrev = null;
    $('aiUndo').hidden = true; $('aiKey').hidden = true; $('f-key').value = '';
    $('aiGen').hidden = !(aiSample || standalone);
    $('aiKeyChange').hidden = !(standalone && !aiSample && getKey());
  }
  async function runAI(){
    if (aiBusy) return;
    const points = $('f-desc').value.trim();
    if (!points) { toast('Escribí primero los puntos clave en la descripción.'); $('f-desc').focus(); return; }
    let key = '';
    if (!aiSample) {
      key = getKey();
      if (!key) { $('aiKey').hidden = false; $('f-key').focus(); return; }
    }
    aiBusy = true;
    const btn = $('aiGen'), lbl = btn.querySelector('span');
    btn.disabled = true; lbl.textContent = 'Generando…';
    $('f-desc').readOnly = true; $('f-desc').classList.add('busy');
    try {
      const prompt = aiPrompt($('f-name').value.trim(), points);
      let text;
      if (aiSample) { const r = await aiSample(prompt, {modelTier:'quick'}); text = ((r && r.text) || '').trim(); }
      else text = await gemini(prompt, key);
      text = (text || '').replace(/^["“«]+|["”»]+$/g, '').trim();
      if (!text) throw {code:'empty'};
      aiPrev = $('f-desc').value;
      $('f-desc').value = text.slice(0, 2000);
      $('aiUndo').hidden = false;
    } catch (e) {
      const c = e && e.code;
      if (c === 'key') { setKey(''); $('aiKeyChange').hidden = true; $('aiKey').hidden = false; $('f-key').focus(); toast('La API key no es válida o no tiene permiso. Pegá una nueva.'); }
      else if (c === 'quota' || c === 'rate_limited') toast('Se alcanzó el límite de uso de la IA. Probá de nuevo en un rato.');
      else if (c === 'not_granted') toast('No se dio permiso para usar la IA en esta página.');
      else if (c === 'network') toast('No hay conexión con Gemini. Revisá internet y probá de nuevo.');
      else if (c === 'empty') toast('La IA no devolvió texto. Probá de nuevo o ajustá los puntos.');
      else if (c === 'model') toast('El modelo de Gemini no está disponible para tu API key.');
      else toast('No se pudo generar la descripción. Probá de nuevo.');
    } finally {
      aiBusy = false; btn.disabled = false; lbl.textContent = 'Generar con IA';
      $('f-desc').readOnly = false; $('f-desc').classList.remove('busy');
    }
  }
  $('aiGen').addEventListener('click', runAI);
  $('aiUndo').addEventListener('click', () => { if (aiPrev !== null) $('f-desc').value = aiPrev; aiPrev = null; $('aiUndo').hidden = true; });
  $('aiKeyChange').addEventListener('click', () => { $('aiKey').hidden = false; $('f-key').focus(); });
  $('keySave').addEventListener('click', () => {
    const k = $('f-key').value.trim();
    if (!k) { $('f-key').focus(); return; }
    setKey(k); $('f-key').value = ''; $('aiKey').hidden = true; $('aiKeyChange').hidden = false;
    runAI();
  });
  $('f-key').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('keySave').click(); } });

  /* ---------- events ---------- */
  $('board').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { const s = Number(add.dataset.add); openDialog({day: Math.floor(s/2), half: s%2, dur: 2, priority: 5}); return; }
    if (e.target.closest('select,label.endsel')) return;
    const row = e.target.closest('[data-edit]');
    if (row && state.canWrite) { const t = state.tasks.find(x => x.id === row.dataset.edit); if (t) openDialog(t); }
  });
  $('board').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-edit]')) { e.preventDefault(); e.target.click(); }
  });
  $('board').addEventListener('change', e => {
    const s = e.target.closest('select[data-end]'); if (s) setEnd(Number(s.dataset.end), s.value);
  });
  $('sortStart').addEventListener('click', () => { state.sort = 'start'; render(); });
  $('sortPrio').addEventListener('click', () => { state.sort = 'prio'; render(); });
  $('newTask').addEventListener('click', () => openDialog({day:0, half:0, dur:2, priority:5}));
  const goWeek = wk => { state.week = wk; subscribe(); };
  $('prev').addEventListener('click', () => goWeek(iso(addDays(parseISO(state.week), -7))));
  $('next').addEventListener('click', () => goWeek(iso(addDays(parseISO(state.week), 7))));
  $('thisWeek').addEventListener('click', () => goWeek(iso(mondayOf(new Date()))));
  $('export').addEventListener('click', () => exportExcel('full'));
  $('exportSimple').addEventListener('click', () => exportExcel('simple'));

  /* ---------- Excel ---------- */
  function loadExcelJS(){
    if (window.ExcelJS) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
      s.onload = () => window.ExcelJS ? res() : rej(new Error('ExcelJS'));
      s.onerror = () => rej(new Error('ExcelJS'));
      document.head.appendChild(s);
    });
  }

  async function exportExcel(kind){
    if (!downloads && !standalone) return;
    const btn = $(kind === 'simple' ? 'exportSimple' : 'export'); btn.disabled = true;
    const lbl = btn.querySelector('span'), label = lbl.textContent; lbl.textContent = 'Generando…';
    try {
      try { await loadExcelJS(); } catch { toast('No se pudo cargar el generador de Excel. Revisá la conexión y probá de nuevo.'); return; }
      const buf = kind === 'simple' ? await buildSimple() : await buildWorkbook();
      const file = (kind === 'simple' ? 'Planificación ' : 'Cronograma ') + state.week + '.xlsx';
      const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      if (downloads) await downloads.save({filename: file, data: blob});
      else {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      toast('Excel guardado');
    } catch (e) {
      const c = e && e.code;
      if (c === 'declined') toast('Descarga cancelada');
      else if (c === 'rate_limited') toast('Ya hay una descarga esperando confirmación.');
      else if (c) toast('La exportación no está disponible en esta vista.');
      else { console.error(e); toast('No se pudo generar el Excel.'); }
    } finally { btn.disabled = false; lbl.textContent = label; }
  }

  /* Paleta y helpers de estilo para los Excel */
  function xlKit(){
    const C = {ink:'18181B', head:'27272A', soft:'F4F4F5', soft2:'FAFAFA', line:'E4E4E7', hair:'EFEFF1', zebra:'FAFAFA',
      ext:'FBF3E2', extLight:'FDF9F0', extInk:'8A6A1F', muted:'71717A', white:'FFFFFF'};
    const A = h => 'FF' + h.replace('#','').toUpperCase();
    const fill = h => ({type:'pattern', pattern:'solid', fgColor:{argb:A(h)}});
    const side = (h, style='thin') => ({style, color:{argb:A(h)}});
    const box = (h, style) => ({top:side(h,style), left:side(h,style), bottom:side(h,style), right:side(h,style)});
    const font = (o={}) => { const {color, ...rest} = o; return {name:'Calibri', size:11, ...rest, color:{argb:A(color || C.ink)}}; };
    return {C, A, fill, side, box, font};
  }
  const byStart = list => list.slice().sort((x,y) => startSlot(x) - startSlot(y) || y.priority - x.priority || x.name.localeCompare(y.name));

  /* Excel completo: cronograma tipo Gantt + detalle */
  async function buildWorkbook(){
    const X = window.ExcelJS, {C, A, fill, side, box, font} = xlKit();
    const wb = new X.Workbook(); wb.creator = 'Cronograma semanal'; wb.created = new Date();
    const mon = parseISO(state.week);
    const tasks = sortedTasks(state.tasks);
    const extDays = [0,1,2,3,4].filter(d => endOf(d) !== BASE_END);
    const wkLong = weekLabel(state.week, true);
    const S0 = 4, LAST = 13; // primera columna de turnos y última columna

    const ws = wb.addWorksheet('Cronograma', {
      views:[{state:'frozen', xSplit:3, ySplit:5, showGridLines:false}],
      pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0, horizontalCentered:true,
        margins:{left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.3, footer:0.3}, printTitlesRow:'4:5'},
      headerFooter:{oddFooter:'&L&8Cronograma semanal · ' + weekLabel(state.week) + '&R&8Página &P de &N'}
    });
    ws.columns = [{width:5},{width:42},{width:9}, ...Array.from({length:10}, () => ({width:15}))];
    ws.mergeCells(1,1,1,LAST);
    Object.assign(ws.getCell(1,1), {value:'Cronograma semanal', font:font({size:18, bold:true}), alignment:{vertical:'middle'}});
    ws.getRow(1).height = 30;
    ws.mergeCells(2,1,2,LAST);
    Object.assign(ws.getCell(2,1), {
      value:`Semana del ${wkLong}  ·  Horario 08:00 a 17:00  ·  Mañana 08:00–12:30  ·  Tarde 12:30–17:00` + (extDays.length ? `  ·  Extendido: ${extDays.map(d => DAYS[d] + ' hasta ' + endOf(d)).join(', ')}` : ''),
      font:font({size:10, color:C.muted}), alignment:{vertical:'middle'}});
    ws.getRow(2).height = 20; ws.getRow(3).height = 8;

    [[1,'#'],[2,'Tarea'],[3,'Prior.']].forEach(([c,l]) => {
      ws.mergeCells(4,c,5,c);
      Object.assign(ws.getCell(4,c), {value:l, fill:fill(C.head), font:font({bold:true, color:C.white}),
        alignment:{vertical:'middle', horizontal: c===2 ? 'left' : 'center', indent: c===2 ? 1 : 0}, border:box(C.head)});
    });
    for (let d = 0; d < 5; d++) {
      const c = S0 + d*2, date = addDays(mon, d), ext = endOf(d) !== BASE_END;
      ws.mergeCells(4,c,4,c+1);
      Object.assign(ws.getCell(4,c), {value:`${DAYS[d]} ${pad(date.getDate())}/${pad(date.getMonth()+1)}` + (ext ? `  ·  hasta ${endOf(d)}` : ''),
        fill:fill(C.head), font:font({bold:true, color:C.white}), alignment:{vertical:'middle', horizontal:'center'},
        border:{left:side('52525B'), top:side(C.head), bottom:side(C.head), right:side('52525B')}});
      Object.assign(ws.getCell(5,c), {value:`Mañana\n${START}–${MID}`, fill:fill(C.soft), font:font({size:9, bold:true}), alignment:{wrapText:true, horizontal:'center', vertical:'middle'},
        border:{left:side(C.line), bottom:side(C.ink)}});
      Object.assign(ws.getCell(5,c+1), {value:`Tarde\n${MID}–${endOf(d)}`, fill:fill(ext ? C.ext : C.soft), font:font({size:9, bold:true, color: ext ? C.extInk : C.ink}),
        alignment:{wrapText:true, horizontal:'center', vertical:'middle'}, border:{left:side(C.line,'hair'), right:side(C.line), bottom:side(C.ink)}});
    }
    ws.getRow(4).height = 24; ws.getRow(5).height = 30;

    let r = 6;
    if (!tasks.length) {
      ws.mergeCells(r,1,r,LAST);
      Object.assign(ws.getCell(r,1), {value:'No hay tareas cargadas para esta semana.', font:font({italic:true, color:C.muted}), alignment:{horizontal:'center', vertical:'middle'}});
      ws.getRow(r).height = 30; r++;
    }
    tasks.forEach((t, i) => {
      ws.getRow(r).height = 30;
      const z = i % 2 ? fill(C.zebra) : fill(C.white);
      const bottom = side(C.hair);
      Object.assign(ws.getCell(r,1), {value:i+1, fill:z, font:font({size:10, color:C.muted}), alignment:{horizontal:'center', vertical:'middle'}, border:{bottom}});
      const nc = ws.getCell(r,2);
      Object.assign(nc, {value:t.name, fill:z, font:font({bold:true}), alignment:{vertical:'middle', indent:1, wrapText:true}, border:{bottom}});
      if (t.desc) nc.note = t.desc;
      Object.assign(ws.getCell(r,3), {value:t.priority, fill:fill(prioColor(t.priority)), font:font({bold:true}), alignment:{horizontal:'center', vertical:'middle'},
        border:{bottom:side(C.white,'medium'), top:side(C.white,'medium'), right:side(C.line)}});
      for (let s = 0; s < 10; s++) {
        const ext = s%2 && endOf(Math.floor(s/2)) !== BASE_END;
        Object.assign(ws.getCell(r,S0+s), {fill: ext ? fill(C.extLight) : z,
          border: s%2 ? {bottom, left:side(C.hair,'hair'), right:side(C.line)} : {bottom, left:side(C.line)}});
      }
      const s0 = startSlot(t), s1 = endSlot(t);
      if (s1 > s0) ws.mergeCells(r, S0+s0, r, S0+s1);
      Object.assign(ws.getCell(r,S0+s0), {value:`${fmtDur(s1-s0+1)} · ${fmtH(taskHours(t))}`, fill:fill(prioColor(t.priority)),
        font:font({bold:true, size:10}), alignment:{horizontal:'center', vertical:'middle', shrinkToFit:true},
        border:{top:side(C.white,'thick'), bottom:side(C.white,'thick'), left:side(C.white), right:side(C.white)}});
      r++;
    });

    ws.getRow(r).height = 22;
    ws.mergeCells(r,1,r,3);
    Object.assign(ws.getCell(r,1), {value:'Tareas por turno', font:font({bold:true, size:10}), fill:fill(C.soft), alignment:{horizontal:'right', vertical:'middle', indent:1}, border:{top:side(C.ink)}});
    for (let s = 0; s < 10; s++) {
      const n = tasks.filter(t => startSlot(t) <= s && endSlot(t) >= s).length;
      Object.assign(ws.getCell(r,S0+s), {value:n, font:font({bold:true, size:10, color: n ? C.ink : C.muted}), fill:fill(C.soft), alignment:{horizontal:'center', vertical:'middle'}, border:{top:side(C.ink)}});
    }
    r += 2;
    Object.assign(ws.getCell(r,2), {value:'Prioridad (1 baja · 10 crítica)', font:font({size:9, color:C.muted}), alignment:{horizontal:'right', vertical:'middle'}});
    for (let p = 1; p <= 10; p++) Object.assign(ws.getCell(r,3+p), {value:p, fill:fill(prioColor(p)), font:font({bold:true, size:9}), alignment:{horizontal:'center', vertical:'middle'}, border:box(C.white,'medium')});
    r++;
    Object.assign(ws.getCell(r,2), {value:'Turno extendido', font:font({size:9, color:C.muted}), alignment:{horizontal:'right', vertical:'middle'}});
    Object.assign(ws.getCell(r,S0), {fill:fill(C.ext), border:box('E9DDBF')});

    /* Hoja 2: Detalle */
    const wd = wb.addWorksheet('Detalle', {views:[{state:'frozen', ySplit:4, showGridLines:false}],
      pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}});
    const cols = [['Tarea',32],['Descripción',60],['Prioridad',10],['Nivel',10],['Inicio',20],['Fin',20],['Duración',11],['Horas',9]];
    wd.columns = cols.map(([,w]) => ({width:w}));
    wd.mergeCells(1,1,1,cols.length);
    Object.assign(wd.getCell(1,1), {value:'Detalle de tareas', font:font({size:16, bold:true})}); wd.getRow(1).height = 26;
    wd.mergeCells(2,1,2,cols.length);
    Object.assign(wd.getCell(2,1), {value:`Semana del ${wkLong}`, font:font({size:10, color:C.muted})});
    wd.getRow(4).height = 24;
    const center = i => i >= 2;
    cols.forEach(([l], i) => Object.assign(wd.getCell(4,i+1), {value:l, fill:fill(C.head), font:font({bold:true, color:C.white}), alignment:{vertical:'middle', horizontal: center(i) ? 'center' : 'left', indent: center(i) ? 0 : 1}, border:box(C.head)}));
    let dr = 5;
    tasks.forEach((t, i) => {
      const z = i % 2 ? fill(C.zebra) : fill(C.white);
      const vals = [t.name, t.desc || '—', t.priority, level(t.priority), slotName(startSlot(t)), slotName(endSlot(t)), fmtDur(endSlot(t)-startSlot(t)+1), Math.round(taskHours(t)*10)/10];
      vals.forEach((v, c) => Object.assign(wd.getCell(dr, c+1), {value:v, fill:z, border:{bottom:side(C.hair)},
        alignment:{vertical:'top', wrapText: c < 2, horizontal: center(c) ? 'center' : 'left', indent: center(c) ? 0 : 1},
        font:font({bold: c===0, color: c===1 && !t.desc ? C.muted : C.ink})}));
      wd.getCell(dr,3).fill = fill(prioColor(t.priority)); wd.getCell(dr,3).font = font({bold:true});
      wd.getCell(dr,8).numFmt = '0.0';
      const lines = Math.max(1, textLines(t.desc || '', 68), textLines(t.name, 34));
      wd.getRow(dr).height = Math.max(22, 15 * lines + 6);
      dr++;
    });
    if (tasks.length) {
      wd.autoFilter = {from:{row:4, column:1}, to:{row:dr-1, column:cols.length}};
      wd.mergeCells(dr,1,dr,7);
      Object.assign(wd.getCell(dr,1), {value:'Total de horas planificadas', font:font({bold:true}), fill:fill(C.soft), alignment:{horizontal:'right', indent:1, vertical:'middle'}, border:{top:side(C.ink)}});
      const tot = tasks.reduce((a,t) => a + taskHours(t), 0);
      Object.assign(wd.getCell(dr,8), {value:{formula:`SUM(H5:H${dr-1})`, result: Math.round(tot*10)/10}, numFmt:'0.0', font:font({bold:true}), fill:fill(C.soft), alignment:{horizontal:'center', vertical:'middle'}, border:{top:side(C.ink)}});
      wd.getRow(dr).height = 24;
    }

    addConfig(wb);
    return wb.xlsx.writeBuffer();
  }

  function textLines(text, perLine){
    return String(text).split(/\r?\n/).reduce((a, l) => a + Math.max(1, Math.ceil(l.length / perLine)), 0);
  }

  /* Hoja oculta con la semana y los horarios, para poder volver a cargar el archivo */
  function addConfig(wb){
    const c = wb.addWorksheet('_config', {state:'hidden'});
    const rows = [['semana', state.week]];
    for (let d = 0; d < 5; d++) rows.push(['fin_' + d, endOf(d)]);
    rows.push(['nota', 'Hoja usada por Cronograma Semanal para volver a cargar este archivo.']);
    rows.forEach(([k, v], i) => { c.getCell(i+1, 1).value = k; c.getCell(i+1, 2).value = v; });
  }

  /* Excel para enviar: día, turno, tarea y descripción */
  async function buildSimple(){
    const X = window.ExcelJS, {C, fill, side, font} = xlKit();
    const wb = new X.Workbook(); wb.creator = 'Cronograma semanal'; wb.created = new Date();
    const mon = parseISO(state.week);
    const tasks = byStart(state.tasks);
    const extDays = [0,1,2,3,4].filter(d => endOf(d) !== BASE_END);
    const ws = wb.addWorksheet('Planificación', {
      views:[{state:'frozen', ySplit:4, showGridLines:false}],
      pageSetup:{paperSize:9, orientation:'portrait', fitToPage:true, fitToWidth:1, fitToHeight:0, horizontalCentered:true,
        margins:{left:0.45, right:0.45, top:0.55, bottom:0.55, header:0.3, footer:0.3}, printTitlesRow:'4:4'},
      headerFooter:{oddFooter:'&L&8Planificación semanal · ' + weekLabel(state.week) + '&R&8Página &P de &N'}
    });
    ws.columns = [{width:14},{width:16},{width:32},{width:70}];

    ws.mergeCells(1,1,1,4);
    Object.assign(ws.getCell(1,1), {value:'Planificación semanal', font:font({size:18, bold:true}), alignment:{vertical:'middle'}});
    ws.getRow(1).height = 30;
    ws.mergeCells(2,1,2,4);
    Object.assign(ws.getCell(2,1), {value:`Semana del ${weekLabel(state.week, true)}`, font:font({size:11, color:C.muted}), alignment:{vertical:'middle'}});
    ws.getRow(2).height = 20; ws.getRow(3).height = 10;
    ['Día','Turno','Tarea','Descripción'].forEach((h, i) => Object.assign(ws.getCell(4, i+1), {value:h, fill:fill(C.head),
      font:font({bold:true, color:C.white}), alignment:{vertical:'middle', indent:1}, border:{bottom:side(C.head)}}));
    ws.getRow(4).height = 26;

    let r = 5;
    for (let d = 0; d < 5; d++) {
      const dayStart = r, date = addDays(mon, d);
      for (let half = 0; half < 2; half++) {
        const s = d*2 + half, turnStart = r, ext = half && endOf(d) !== BASE_END;
        const items = tasks.filter(t => startSlot(t) <= s && endSlot(t) >= s);
        const rows = items.length ? items.map(t => {
          const cont = startSlot(t) !== s;
          return {name:t.name, cont, desc: cont ? `↳ Continúa desde el ${slotName(startSlot(t)).toLowerCase()}` : (t.desc || '—'), noDesc: !cont && !t.desc};
        }) : [{name:'—', empty:true, desc:''}];
        for (const it of rows) {
          const top = r === dayStart ? side(C.ink, 'medium') : r === turnStart ? side(C.line) : side(C.hair);
          ws.getCell(r,1).border = {top};
          ws.getCell(r,1).fill = fill(C.soft);
          ws.getCell(r,2).border = {top: r === dayStart ? top : side(C.line)};
          ws.getCell(r,2).fill = fill(ext ? C.ext : C.soft2);
          Object.assign(ws.getCell(r,3), {value:it.name, border:{top},
            font:font({bold: !it.empty && !it.cont, color: it.empty ? C.muted : C.ink}),
            alignment:{vertical:'top', wrapText:true, indent:1}});
          Object.assign(ws.getCell(r,4), {value:it.desc, border:{top},
            font:font({size:10.5, italic: !!it.cont, color: (it.cont || it.noDesc) ? C.muted : C.ink}),
            alignment:{vertical:'top', wrapText:true, indent:1}});
          const lines = Math.max(textLines(it.desc, 82), textLines(it.name, 30));
          ws.getRow(r).height = Math.max(32, 14.5 * lines + 10);
          r++;
        }
        if (r - 1 > turnStart) ws.mergeCells(turnStart, 2, r - 1, 2);
        Object.assign(ws.getCell(turnStart, 2), {value:`${half ? 'Tarde' : 'Mañana'}\n${half ? MID + '–' + endOf(d) : START + '–' + MID}`,
          font:font({bold:true, size:10, color: ext ? C.extInk : C.ink}), alignment:{vertical:'top', wrapText:true, indent:1}});
      }
      if (r - 1 > dayStart) ws.mergeCells(dayStart, 1, r - 1, 1);
      Object.assign(ws.getCell(dayStart, 1), {value:`${DAYS[d]}\n${pad(date.getDate())}/${pad(date.getMonth()+1)}`,
        font:font({bold:true, size:11.5}), alignment:{vertical:'top', wrapText:true, indent:1}});
    }
    for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = {top:side(C.ink, 'medium')};
    ws.mergeCells(r + 1, 1, r + 1, 4);
    Object.assign(ws.getCell(r + 1, 1), {
      value:'Horario 08:00 a 17:00 · Mañana 08:00–12:30 · Tarde 12:30–17:00' + (extDays.length ? ' · Extendido: ' + extDays.map(d => DAYS[d] + ' hasta ' + endOf(d)).join(', ') : ''),
      font:font({size:9, italic:true, color:C.muted})});

    addConfig(wb);
    return wb.xlsx.writeBuffer();
  }

  /* ---------- cargar Excel ---------- */
  const DAY_N = ['lunes','martes','miercoles','jueves','viernes'];
  function cellText(v){
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0,10);
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map(x => x.text).join('');
      if ('result' in v) return cellText(v.result);
      if ('text' in v) return cellText(v.text);
      return '';
    }
    return String(v);
  }
  const norm = v => cellText(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function parseSlot(v){ const n = norm(v); const d = DAY_N.findIndex(x => n.startsWith(x)); return d < 0 ? null : d*2 + (n.includes('tarde') ? 1 : 0); }
  function parseDur(v){ const m = cellText(v).replace('½', '.5').replace(',', '.').match(/\d*\.?\d+/); return m ? Math.round(parseFloat(m[0])*2) || null : null; }
  function findHeader(ws, names){
    for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
      const map = {};
      ws.getRow(r).eachCell((c, col) => { const k = norm(c.value); if (k && !(k in map)) map[k] = col; });
      if (names.every(n => n in map)) return {row:r, map};
    }
    return null;
  }
  function parseDetalle(ws){
    const h = findHeader(ws, ['tarea','inicio']); if (!h) return [];
    const col = k => h.map[k], out = [];
    for (let r = h.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), get = k => col(k) ? row.getCell(col(k)).value : null;
      const name = cellText(get('tarea')).trim(), s0 = parseSlot(get('inicio'));
      if (!name || s0 === null) continue;
      const s1 = parseSlot(get('fin'));
      const dur = (s1 !== null && s1 >= s0) ? s1 - s0 + 1 : (parseDur(get('duracion')) || 1);
      const desc = cellText(get('descripcion')).trim();
      out.push({name, desc: desc === '—' ? '' : desc, priority: clampInt(parseFloat(cellText(get('prioridad')).replace(',', '.')), 1, 10, 5),
        assignee: '', day: Math.floor(s0/2), half: s0 % 2, dur: Math.min(dur, 10 - s0)});
    }
    return out;
  }
  function slotRuns(slots, descs){
    const out = [];
    for (const [name, set] of slots) {
      const arr = [...set].sort((a,b) => a-b);
      let st = arr[0], prev = arr[0], first = true;
      for (const s of arr.slice(1).concat([null])) {
        if (s === prev + 1) { prev = s; continue; }
        out.push({name, desc: first ? (descs.get(name) || '') : '', priority:5, assignee:'', day: Math.floor(st/2), half: st % 2, dur: prev - st + 1});
        first = false; st = prev = s;
      }
    }
    return out;
  }
  function parseSimple(ws){
    const slots = new Map(), descs = new Map();
    const add = (name, s) => { if (!slots.has(name)) slots.set(name, new Set()); slots.get(name).add(s); };
    const h = findHeader(ws, ['dia','turno','tarea']);
    if (h) {
      for (let r = h.row + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r), d = parseSlot(row.getCell(h.map['dia']).value);
        if (d === null) continue;
        const half = norm(row.getCell(h.map['turno']).value).startsWith('tarde') ? 1 : 0;
        const name = cellText(row.getCell(h.map['tarea']).value).trim();
        if (!name || name === '—') continue;
        add(name, d + half);
        const ds = h.map['descripcion'] ? cellText(row.getCell(h.map['descripcion']).value).trim() : '';
        if (ds && ds !== '—' && !ds.startsWith('↳') && !descs.has(name)) descs.set(name, ds);
      }
      return slotRuns(slots, descs);
    }
    const o = findHeader(ws, ['dia','manana','tarde']);
    if (!o) return [];
    for (let r = o.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), d = parseSlot(row.getCell(o.map['dia']).value);
      if (d === null) continue;
      [['manana',0],['tarde',1]].forEach(([k, half]) => {
        cellText(row.getCell(o.map[k]).value).split(/\r?\n/).map(x => x.replace(/^[•\-\*·]\s*/, '').trim())
          .filter(x => x && x !== '—').forEach(n => add(n, d + half));
      });
    }
    return slotRuns(slots, descs);
  }
  async function readWorkbook(buf){
    const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(buf);
    let week = null; const ends = {};
    const cfg = wb.getWorksheet('_config');
    if (cfg) cfg.eachRow(row => {
      const k = norm(row.getCell(1).value), v = cellText(row.getCell(2).value).trim();
      if (k === 'semana' && /^\d{4}-\d{2}-\d{2}$/.test(v)) week = iso(mondayOf(parseISO(v)));
      const m = k.match(/^fin_([0-4])$/); if (m && END_OPTS.includes(v) && v !== BASE_END) ends[m[1]] = v;
    });
    let tasks = [], source = 'completo';
    const det = wb.worksheets.find(w => norm(w.name) === 'detalle');
    if (det) tasks = parseDetalle(det);
    if (!tasks.length) {
      source = 'simple';
      for (const w of wb.worksheets) { if (w.state && w.state !== 'visible') continue; tasks = parseSimple(w); if (tasks.length) break; }
    }
    return {week, ends, tasks, source};
  }
  async function existingIds(wk){
    if (state.mode === 'db') { const s = await db.collection('tasks').where('week','==',wk).get(); return s.docs.filter(d => d.exists).map(d => d.id); }
    return local.tasks.filter(t => t.week === wk).map(t => t.id);
  }

  let pendingImport = null;
  $('import').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast('Elegí un archivo .xlsx'); return; }
    const btn = $('import'), lbl = btn.querySelector('span'); btn.disabled = true; lbl.textContent = 'Leyendo…';
    try {
      try { await loadExcelJS(); } catch { toast('No se pudo cargar el lector de Excel. Revisá la conexión y probá de nuevo.'); return; }
      let data;
      try { data = await readWorkbook(await file.arrayBuffer()); } catch { toast('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido.'); return; }
      if (!data.tasks.length) { toast('No encontré tareas. Usá un Excel exportado desde acá, completo o simple.'); return; }
      const week = data.week || state.week;
      const existing = await existingIds(week);
      pendingImport = {...data, week, existing};
      $('impSum').innerHTML = `<b>${data.tasks.length} ${data.tasks.length === 1 ? 'tarea' : 'tareas'}</b> para la semana del <b>${esc(weekLabel(week, true))}</b>.` +
        (existing.length ? ` Esa semana ya tiene ${existing.length} ${existing.length === 1 ? 'tarea cargada' : 'tareas cargadas'}.` : '');
      const sorted = data.tasks.slice().sort((a,b) => startSlot(a) - startSlot(b));
      $('impList').innerHTML = sorted.slice(0, 12).map(t => `<li><span class="w">${slotName(startSlot(t))}</span><span class="n">${esc(t.name)}</span></li>`).join('') +
        (sorted.length > 12 ? `<li class="more">y ${sorted.length - 12} más</li>` : '');
      $('impHint').textContent = (data.week ? '' : 'El archivo no indica la semana: se carga en la que estás viendo. ') +
        (data.source === 'simple' ? 'Es un Excel simple: se cargan nombres, descripciones, días y turnos. La prioridad queda en 5 para que la ajustes.' : 'Se toman los datos de la hoja «Detalle», con los cambios que le hayas hecho en Excel.');
      $('impAdd').hidden = !existing.length;
      $('impReplace').textContent = existing.length ? 'Reemplazar semana' : 'Cargar';
      $('impDlg').showModal();
    } finally { btn.disabled = false; lbl.textContent = 'Cargar Excel'; }
  });
  $('impCancel').addEventListener('click', () => { pendingImport = null; $('impDlg').close(); });
  $('impAdd').addEventListener('click', () => applyImport(false));
  $('impReplace').addEventListener('click', () => applyImport(true));

  async function applyImport(replace){
    const p = pendingImport; pendingImport = null; $('impDlg').close();
    if (!p) return;
    const tasks = p.tasks.map(t => normTask(newId(), {...t, week: p.week}));
    toast('Cargando tareas…');
    if (state.mode === 'db') {
      try {
        let ends = p.ends;
        if (!replace) { const w = await db.doc('weeks/' + p.week).get(); ends = {...((w.exists && w.data().ends) || {}), ...p.ends}; }
        if (replace) for (const id of p.existing) await db.doc('tasks/' + id).delete();
        for (const t of tasks) await db.collection('tasks').doc(t.id).set(taskBody(t));
        await db.doc('weeks/' + p.week).set({ends});
      } catch (e) { writeFailed(e); return; }
    } else {
      if (replace) local.tasks = local.tasks.filter(t => t.week !== p.week);
      for (const t of tasks) local.tasks.push({id: t.id, ...taskBody(t)});
      const prev = (local.weeks[p.week] || {}).ends || {};
      local.weeks[p.week] = {ends: replace ? p.ends : {...prev, ...p.ends}};
      saveLocal();
    }
    goWeek(p.week);
    toast(`${tasks.length} ${tasks.length === 1 ? 'tarea cargada' : 'tareas cargadas'}`);
  }

  function setExportReady(ok){
    for (const id of ['export','exportSimple']) {
      $(id).disabled = !ok;
      if (!ok) $(id).title = 'La exportación no está disponible en esta vista';
    }
  }

  /* ---------- arranque ---------- */
  render();
  (async () => {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') {
      standalone = true; loadLocal(); state.mode = 'local'; subscribe();
      setExportReady(true); return;
    }
    C.use('sample').then(sm => { aiSample = sm; }).catch(() => {});
    C.use('downloads').then(d => {
      downloads = d;
      setExportReady(!!d);
    }).catch(() => {});
    let d = null;
    try { d = await C.use('db'); } catch { d = null; }
    if (d) {
      db = d; state.mode = 'db';
      try { const u = await C.use('user'); const can = u ? await u.can('data.write') : null; state.canWrite = can !== false; } catch {}
    } else { loadLocal(); state.mode = 'local'; }
    subscribe();
  })();
})();
