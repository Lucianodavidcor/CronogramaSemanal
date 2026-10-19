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

  const state = { week: iso(mondayOf(new Date())), tasks: [], ends: {}, filter: null, sort: 'start', mode: 'pending', canWrite: true };
  let db = null, downloads = null, standalone = false, unsubTasks = null, unsubWeek = null, local = null;

  const startSlot = t => t.day*2 + t.half;
  const endSlot = t => Math.min(9, startSlot(t) + t.dur - 1);
  const endOf = d => state.ends[d] || BASE_END;
  const slotHours = s => (s % 2 === 0) ? (toMin(MID) - toMin(START))/60 : (toMin(endOf(Math.floor(s/2))) - toMin(MID))/60;
  const taskHours = t => { let h = 0; for (let s = startSlot(t); s <= endSlot(t); s++) h += slotHours(s); return h; };
  const slotName = s => `${DAYS[Math.floor(s/2)]} ${s%2 ? 'tarde' : 'mañana'}`;
  const whoKey = t => (t.assignee || '').trim().toLowerCase();

  function normTask(id, d){
    return {
      id, week: String(d.week || state.week),
      name: String(d.name || 'Sin nombre').slice(0,120),
      desc: String(d.desc || '').slice(0,1000),
      priority: clampInt(d.priority,1,10,5),
      assignee: String(d.assignee || '').slice(0,60),
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

  function conflicts(){
    const out = {}, t = state.tasks;
    for (let i = 0; i < t.length; i++) for (let j = i+1; j < t.length; j++) {
      const a = t[i], b = t[j];
      if (!whoKey(a) || whoKey(a) !== whoKey(b)) continue;
      if (startSlot(a) <= endSlot(b) && startSlot(b) <= endSlot(a)) {
        (out[a.id] = out[a.id] || []).push(b.name);
        (out[b.id] = out[b.id] || []).push(a.name);
      }
    }
    return out;
  }

  function people(){
    const m = new Map();
    for (const t of state.tasks) {
      const k = whoKey(t) || '__none';
      const e = m.get(k) || {key:k, name: t.assignee.trim() || 'Sin asignar', halves:0, hours:0, count:0};
      e.halves += endSlot(t) - startSlot(t) + 1; e.hours += taskHours(t); e.count++;
      m.set(k, e);
    }
    return [...m.values()].sort((a,b) => b.halves - a.halves || a.name.localeCompare(b.name));
  }

  /* ---------- render ---------- */
  function render(){
    const mon = parseISO(state.week);
    const todayIso = iso(new Date());
    $('weekLabel').textContent = weekLabel(state.week);
    const extDays = [0,1,2,3,4].filter(d => endOf(d) !== BASE_END);
    $('sub').textContent = '08:00 – 17:00 · Mañana 08:00–12:30 · Tarde 12:30–17:00' +
      (extDays.length ? ' · ' + extDays.map(d => `${DAYS[d]} hasta ${endOf(d)}`).join(', ') : '');

    const ppl = people();
    if (state.filter !== null && !ppl.some(p => p.key === state.filter)) state.filter = null;
    $('load').innerHTML = ppl.length > 0
      ? `<button class="chip" data-filter="" aria-pressed="${state.filter===null}">Todos</button>` +
        ppl.map(p => `<button class="chip${p.halves>10?' over':''}" data-filter="${esc(p.key)}" aria-pressed="${state.filter===p.key}" title="${esc(p.name)}: ${fmtDur(p.halves)} · ${fmtH(p.hours)}">${esc(p.name)} <span class="n">${fmtDur(p.halves)}</span></button>`).join('')
      : '';

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

    const conf = conflicts();
    const list = sortedTasks(state.tasks.filter(t => state.filter === null || (whoKey(t) || '__none') === state.filter));
    let bg = '';
    for (let s = 0; s < 10; s++) { const ext = s%2 && endOf(Math.floor(s/2)) !== BASE_END; bg += `<div class="cell ${s%2?'pm':'am'}${ext?' ext':''}" style="grid-column:${s+2}"></div>`; }

    if (state.mode === 'pending') {
      h += '<div class="grid row"><div class="empty"><span>Cargando…</span></div></div>';
    } else if (!state.tasks.length) {
      h += `<div class="grid row"><div class="empty"><strong>Sin tareas esta semana</strong><span>${state.canWrite ? 'Agregá una con «Nueva tarea» o tocando un turno abajo.' : 'Cuando se carguen tareas, van a aparecer acá.'}</span></div></div>`;
    }
    for (const t of list) {
      const s0 = startSlot(t), s1 = endSlot(t), c = conf[t.id];
      const meta = [`<span>${esc(t.assignee.trim() || 'Sin asignar')}</span>`];
      if (c) meta.push(`<span class="warn-txt" title="Se superpone con: ${esc(c.join(', '))}">· superpuesta</span>`);
      h += `<div class="grid row task${c?' conflict':''}${state.canWrite?'':' ro'}" data-edit="${esc(t.id)}" ${state.canWrite?'tabindex="0" role="button"':''} aria-label="${esc(t.name)}, prioridad ${t.priority}, ${slotName(s0)} a ${slotName(s1)}">
        <div class="info"><span class="prio" style="--p:${prioColor(t.priority)}" title="Prioridad ${t.priority} · ${level(t.priority)}">${t.priority}</span>
          <div class="txt"><span class="t">${esc(t.name)}</span>${t.desc?`<span class="d">${esc(t.desc)}</span>`:''}<span class="meta">${meta.join('')}</span></div></div>
        ${bg}
        <div class="bar" style="--p:${prioColor(t.priority)};grid-column:${s0+2} / span ${s1-s0+1}" title="${esc(t.name)} · ${slotName(s0)} → ${slotName(s1)} · ${fmtH(taskHours(t))}">${esc(t.assignee.trim() || t.name)}<small>${fmtDur(s1-s0+1)} · ${fmtH(taskHours(t))}</small></div>
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

    const total = state.tasks.reduce((a,t) => a + taskHours(t), 0);
    $('status').textContent = state.mode === 'pending' ? '' :
      `${state.tasks.length} ${state.tasks.length===1?'tarea':'tareas'} · ${fmtH(total)}` + (state.mode === 'local' && !standalone ? ' · guardado en este navegador' : '');

    $('people').innerHTML = [...new Set(state.tasks.map(t => t.assignee.trim()).filter(Boolean))].map(n => `<option value="${esc(n)}">`).join('');
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

  async function putTask(t){
    const body = {week:t.week, name:t.name, desc:t.desc, priority:t.priority, assignee:t.assignee, day:t.day, half:t.half, dur:t.dur, updatedAt: Date.now()};
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
    $('f-name').value = t.name || ''; $('f-desc').value = t.desc || ''; $('f-who').value = t.assignee || '';
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
    const t = normTask(editing.id || newId(), {week: state.week, name, desc: $('f-desc').value.trim(), assignee: $('f-who').value.trim(), ...v});
    const isNew = !editing.id;
    dlg.close();
    if (await putTask(t)) toast(isNew ? 'Tarea agregada' : 'Cambios guardados');
  });
  $('f-name').addEventListener('input', () => $('f-name').setCustomValidity(''));

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
  $('load').addEventListener('click', e => {
    const c = e.target.closest('[data-filter]'); if (!c) return;
    const k = c.dataset.filter; state.filter = (k === '' || state.filter === k) ? null : k; render();
  });
  $('sortStart').addEventListener('click', () => { state.sort = 'start'; render(); });
  $('sortPrio').addEventListener('click', () => { state.sort = 'prio'; render(); });
  $('newTask').addEventListener('click', () => openDialog({day:0, half:0, dur:2, priority:5}));
  const goWeek = wk => { state.week = wk; state.filter = null; subscribe(); };
  $('prev').addEventListener('click', () => goWeek(iso(addDays(parseISO(state.week), -7))));
  $('next').addEventListener('click', () => goWeek(iso(addDays(parseISO(state.week), 7))));
  $('thisWeek').addEventListener('click', () => goWeek(iso(mondayOf(new Date()))));
  $('export').addEventListener('click', exportExcel);

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

  async function exportExcel(){
    if (!downloads && !standalone) return;
    const btn = $('export'); btn.disabled = true;
    const label = btn.lastChild.textContent; btn.lastChild.textContent = ' Generando…';
    try {
      try { await loadExcelJS(); } catch { toast('No se pudo cargar el generador de Excel. Revisá la conexión y probá de nuevo.'); return; }
      const buf = await buildWorkbook();
      const file = `Cronograma ${state.week}.xlsx`;
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
    } finally { btn.disabled = false; btn.lastChild.textContent = label; }
  }

  async function buildWorkbook(){
    const X = window.ExcelJS;
    const wb = new X.Workbook(); wb.creator = 'Cronograma semanal'; wb.created = new Date();
    const C = {ink:'18181B', head:'27272A', soft:'F4F4F5', line:'E4E4E7', hair:'EFEFF1', zebra:'FAFAFA', ext:'FBF3E2', extLight:'FDF9F0', extInk:'8A6A1F', muted:'71717A', white:'FFFFFF', warn:'C2410C'};
    const A = h => 'FF' + h.replace('#','').toUpperCase();
    const fill = h => ({type:'pattern', pattern:'solid', fgColor:{argb:A(h)}});
    const side = (h, style='thin') => ({style, color:{argb:A(h)}});
    const box = (h, style) => ({top:side(h,style), left:side(h,style), bottom:side(h,style), right:side(h,style)});
    const font = (o={}) => { const {color, ...rest} = o; return {name:'Calibri', size:11, ...rest, color:{argb:A(color || C.ink)}}; };
    const mon = parseISO(state.week);
    const tasks = sortedTasks(state.tasks);
    const conf = conflicts();
    const extDays = [0,1,2,3,4].filter(d => endOf(d) !== BASE_END);
    const wkLong = weekLabel(state.week, true);
    const totalCap = Array.from({length:10}, (_,s) => slotHours(s)).reduce((a,b) => a+b, 0);

    /* Hoja 1: Cronograma */
    const ws = wb.addWorksheet('Cronograma', {
      views:[{state:'frozen', xSplit:4, ySplit:5, showGridLines:false}],
      pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0, horizontalCentered:true,
        margins:{left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.3, footer:0.3}, printTitlesRow:'4:5'},
      headerFooter:{oddFooter:'&L&8Cronograma semanal · ' + weekLabel(state.week) + '&R&8Página &P de &N'}
    });
    ws.columns = [{width:5},{width:38},{width:18},{width:9}, ...Array.from({length:10}, () => ({width:15}))];
    const LAST = 14;
    ws.mergeCells(1,1,1,LAST);
    Object.assign(ws.getCell(1,1), {value:'Cronograma semanal', font:font({size:18, bold:true}), alignment:{vertical:'middle'}});
    ws.getRow(1).height = 30;
    ws.mergeCells(2,1,2,LAST);
    Object.assign(ws.getCell(2,1), {
      value:`Semana del ${wkLong}  ·  Horario 08:00 a 17:00  ·  Mañana 08:00–12:30  ·  Tarde 12:30–17:00` + (extDays.length ? `  ·  Extendido: ${extDays.map(d => DAYS[d] + ' hasta ' + endOf(d)).join(', ')}` : ''),
      font:font({size:10, color:C.muted}), alignment:{vertical:'middle'}});
    ws.getRow(2).height = 20; ws.getRow(3).height = 8;

    [[1,'#'],[2,'Tarea'],[3,'Asignado'],[4,'Prior.']].forEach(([c,l]) => {
      ws.mergeCells(4,c,5,c);
      Object.assign(ws.getCell(4,c), {value:l, fill:fill(C.head), font:font({bold:true, color:C.white}),
        alignment:{vertical:'middle', horizontal: c===2||c===3 ? 'left' : 'center', indent: c===2||c===3 ? 1 : 0}, border:box(C.head)});
    });
    for (let d = 0; d < 5; d++) {
      const c = 5 + d*2, date = addDays(mon, d), ext = endOf(d) !== BASE_END;
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
      if (t.desc || conf[t.id]) nc.note = [t.desc, conf[t.id] ? 'Se superpone con: ' + conf[t.id].join(', ') : ''].filter(Boolean).join('\n\n');
      Object.assign(ws.getCell(r,3), {value:t.assignee || 'Sin asignar', fill:z, font:font({color: t.assignee ? C.ink : C.muted, italic: !t.assignee}), alignment:{vertical:'middle', indent:1}, border:{bottom}});
      Object.assign(ws.getCell(r,4), {value:t.priority, fill:fill(prioColor(t.priority)), font:font({bold:true}), alignment:{horizontal:'center', vertical:'middle'},
        border:{bottom:side(C.white,'medium'), top:side(C.white,'medium'), right:side(C.line)}});
      for (let s = 0; s < 10; s++) {
        const ext = s%2 && endOf(Math.floor(s/2)) !== BASE_END;
        Object.assign(ws.getCell(r,5+s), {fill: ext ? fill(C.extLight) : z,
          border: s%2 ? {bottom, left:side(C.hair,'hair'), right:side(C.line)} : {bottom, left:side(C.line)}});
      }
      const s0 = startSlot(t), s1 = endSlot(t);
      if (s1 > s0) ws.mergeCells(r, 5+s0, r, 5+s1);
      const warn = !!conf[t.id];
      Object.assign(ws.getCell(r,5+s0), {value:`${fmtDur(s1-s0+1)} · ${fmtH(taskHours(t))}`, fill:fill(prioColor(t.priority)),
        font:font({bold:true, size:10}), alignment:{horizontal:'center', vertical:'middle', shrinkToFit:true},
        border:{top:side(C.white,'thick'), bottom:side(C.white,'thick'), left:side(warn ? C.warn : C.white, warn ? 'medium' : 'thin'), right:side(warn ? C.warn : C.white, warn ? 'medium' : 'thin')}});
      r++;
    });

    ws.getRow(r).height = 22;
    ws.mergeCells(r,1,r,4);
    Object.assign(ws.getCell(r,1), {value:'Tareas por turno', font:font({bold:true, size:10}), fill:fill(C.soft), alignment:{horizontal:'right', vertical:'middle', indent:1}, border:{top:side(C.ink)}});
    for (let s = 0; s < 10; s++) {
      const n = tasks.filter(t => startSlot(t) <= s && endSlot(t) >= s).length;
      Object.assign(ws.getCell(r,5+s), {value:n, font:font({bold:true, size:10, color: n ? C.ink : C.muted}), fill:fill(C.soft), alignment:{horizontal:'center', vertical:'middle'}, border:{top:side(C.ink)}});
    }
    r += 2;
    Object.assign(ws.getCell(r,2), {value:'Prioridad (1 baja · 10 crítica)', font:font({size:9, color:C.muted}), alignment:{horizontal:'right', vertical:'middle'}});
    for (let p = 1; p <= 10; p++) Object.assign(ws.getCell(r,4+p), {value:p, fill:fill(prioColor(p)), font:font({bold:true, size:9}), alignment:{horizontal:'center', vertical:'middle'}, border:box(C.white,'medium')});
    r++;
    Object.assign(ws.getCell(r,2), {value:'Turno extendido', font:font({size:9, color:C.muted}), alignment:{horizontal:'right', vertical:'middle'}});
    Object.assign(ws.getCell(r,5), {fill:fill(C.ext), border:box('E9DDBF')});

    /* Hoja 2: Detalle */
    const wd = wb.addWorksheet('Detalle', {views:[{state:'frozen', ySplit:4, showGridLines:false}],
      pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}});
    const cols = [['Tarea',30],['Descripción',52],['Prioridad',10],['Nivel',10],['Asignado',18],['Inicio',20],['Fin',20],['Duración',11],['Horas',9]];
    wd.columns = cols.map(([,w]) => ({width:w}));
    wd.mergeCells(1,1,1,cols.length);
    Object.assign(wd.getCell(1,1), {value:'Detalle de tareas', font:font({size:16, bold:true})}); wd.getRow(1).height = 26;
    wd.mergeCells(2,1,2,cols.length);
    Object.assign(wd.getCell(2,1), {value:`Semana del ${wkLong}`, font:font({size:10, color:C.muted})});
    wd.getRow(4).height = 24;
    const center = i => i >= 2 && i !== 4;
    cols.forEach(([l], i) => Object.assign(wd.getCell(4,i+1), {value:l, fill:fill(C.head), font:font({bold:true, color:C.white}), alignment:{vertical:'middle', horizontal: center(i) ? 'center' : 'left', indent: center(i) ? 0 : 1}, border:box(C.head)}));
    let dr = 5;
    tasks.forEach((t, i) => {
      const z = i % 2 ? fill(C.zebra) : fill(C.white);
      const vals = [t.name, t.desc || '—', t.priority, level(t.priority), t.assignee || 'Sin asignar', slotName(startSlot(t)), slotName(endSlot(t)), fmtDur(endSlot(t)-startSlot(t)+1), Math.round(taskHours(t)*10)/10];
      vals.forEach((v, c) => Object.assign(wd.getCell(dr, c+1), {value:v, fill:z, border:{bottom:side(C.hair)},
        alignment:{vertical:'top', wrapText: c < 2, horizontal: center(c) ? 'center' : 'left', indent: center(c) ? 0 : 1},
        font:font({bold: c===0, color: c===1 && !t.desc ? C.muted : C.ink})}));
      wd.getCell(dr,3).fill = fill(prioColor(t.priority)); wd.getCell(dr,3).font = font({bold:true});
      wd.getCell(dr,9).numFmt = '0.0';
      const lines = Math.max(1, Math.ceil((t.desc || '').length / 58), Math.ceil(t.name.length / 32));
      wd.getRow(dr).height = Math.max(22, 15 * lines + 6);
      dr++;
    });
    if (tasks.length) {
      wd.autoFilter = {from:{row:4, column:1}, to:{row:dr-1, column:cols.length}};
      wd.mergeCells(dr,1,dr,8);
      Object.assign(wd.getCell(dr,1), {value:'Total de horas planificadas', font:font({bold:true}), fill:fill(C.soft), alignment:{horizontal:'right', indent:1, vertical:'middle'}, border:{top:side(C.ink)}});
      const tot = tasks.reduce((a,t) => a + taskHours(t), 0);
      Object.assign(wd.getCell(dr,9), {value:{formula:`SUM(I5:I${dr-1})`, result: Math.round(tot*10)/10}, numFmt:'0.0', font:font({bold:true}), fill:fill(C.soft), alignment:{horizontal:'center', vertical:'middle'}, border:{top:side(C.ink)}});
      wd.getRow(dr).height = 24;
    }

    /* Hoja 3: Carga por persona */
    const wc = wb.addWorksheet('Carga por persona', {views:[{showGridLines:false}]});
    const ccols = [['Asignado',24],['Tareas',10],['Medios días',13],['Días',10],['Horas',10],['Capacidad (h)',14],['Ocupación',13]];
    wc.columns = ccols.map(([,w]) => ({width:w}));
    wc.mergeCells(1,1,1,ccols.length);
    Object.assign(wc.getCell(1,1), {value:'Carga por persona', font:font({size:16, bold:true})}); wc.getRow(1).height = 26;
    wc.mergeCells(2,1,2,ccols.length);
    Object.assign(wc.getCell(2,1), {value:`Semana del ${wkLong} · capacidad semanal ${fmtH(totalCap)} por persona`, font:font({size:10, color:C.muted})});
    ccols.forEach(([l], i) => Object.assign(wc.getCell(4,i+1), {value:l, fill:fill(C.head), font:font({bold:true, color:C.white}), alignment:{vertical:'middle', horizontal: i ? 'center' : 'left', indent: i ? 0 : 1}, border:box(C.head)}));
    wc.getRow(4).height = 24;
    let cr = 5;
    people().forEach((p, i) => {
      const z = i % 2 ? fill(C.zebra) : fill(C.white);
      const occ = totalCap ? p.hours / totalCap : 0;
      const vals = [p.name, p.count, p.halves, p.halves/2, Math.round(p.hours*10)/10, Math.round(totalCap*10)/10, occ];
      vals.forEach((v, c) => Object.assign(wc.getCell(cr, c+1), {value:v, fill:z, font:font({bold: c===0}), border:{bottom:side(C.hair)},
        alignment:{vertical:'middle', horizontal: c ? 'center' : 'left', indent: c ? 0 : 1}}));
      wc.getCell(cr,4).numFmt = '0.0'; wc.getCell(cr,5).numFmt = '0.0'; wc.getCell(cr,6).numFmt = '0.0';
      const oc = wc.getCell(cr,7); oc.numFmt = '0%';
      oc.fill = fill(occ > 1 ? 'FBE1DA' : occ >= 0.8 ? 'FBF0D6' : 'E8F3EC');
      oc.font = font({bold:true, color: occ > 1 ? C.warn : C.ink});
      wc.getRow(cr).height = 22;
      cr++;
    });
    if (cr === 5) { wc.mergeCells(5,1,5,ccols.length); Object.assign(wc.getCell(5,1), {value:'Sin tareas asignadas.', font:font({italic:true, color:C.muted}), alignment:{horizontal:'center'}}); }

    return wb.xlsx.writeBuffer();
  }

  /* ---------- arranque ---------- */
  render();
  (async () => {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') {
      standalone = true; loadLocal(); state.mode = 'local'; subscribe();
      $('export').disabled = false; $('export').title = 'Descargar la semana en Excel'; return;
    }
    C.use('downloads').then(d => {
      downloads = d;
      $('export').disabled = !d;
      $('export').title = d ? 'Descargar la semana en Excel' : 'La exportación no está disponible en esta vista';
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
