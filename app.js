'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = t => new Date(t).toLocaleString();

/* ---------- IndexedDB wrapper ---------- */
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('sitecommission', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('media', { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (s, m, f) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(s, m), q = f(t.objectStore(s)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return {
    get: (k, d) => tx('kv', 'readonly', s => s.get(k)).then(v => v === undefined ? d : v),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    all: () => tx('media', 'readonly', s => s.getAll()),
    add: m => tx('media', 'readwrite', s => s.add(m)),
    del: id => tx('media', 'readwrite', s => s.delete(id))
  };
})();

/* ---------- Data ---------- */
const CL = [
  { id: 'rack', t: '1. Rack Configuration', i: [
    'Hardware config matches physical rack (order numbers & firmware)',
    'Slot numbers and I/O address ranges verified',
    '24 VDC supply voltage measured at PSU and at last module',
    'CPU firmware and memory card details recorded',
    'HW config compiled and downloaded with no errors'] },
  { id: 'pn', t: '2. Profinet Node Mapping', i: [
    'Device names assigned to every IO device (no duplicates)',
    'IP addresses / subnet verified, no conflicts',
    'Topology (LLDP) matches plan; all ports linked',
    'Update times / watchdog set; no station failure in diag buffer',
    'Drives and remote I/O respond in online view'] },
  { id: 'io', t: '3. Sensor / Actuator I/O Checkout', i: [
    'All digital inputs forced/triggered and confirmed in PLC',
    'All digital outputs verified at field device',
    'Analog scaling checked (level, temp, pressure, flow)',
    'Valve and pump feedback signals verified',
    'VFD direction and speed reference verified',
    'Wire-break / short-circuit diagnostics tested'] },
  { id: 'safe', t: '4. Safety Interlock Verification', i: [
    'E-stop circuits tested; F-signature matches',
    'Door / guard interlocks tested on every access point',
    'Light curtains and safety mats tested',
    'Safety relay / F-module reset behaviour verified',
    'Safe torque off (STO) tested on all drives'] },
  { id: 'dry', t: '5. Dry Run Testing', i: [
    'All washing programs run empty with no alarms',
    'Sequence steps and timers verified vs. spec',
    'Fault & alarm reactions tested (simulated faults)',
    'HMI screens, navigation and alarm list verified',
    'Backup of PLC + HMI projects stored and labelled'] }
];

const FAULTS = [
  { c: 'SF', t: 'CPU System Fault LED lit', d: 'Internal fault or diagnostic event in CPU/modules.', s: ['Read Diagnostic Buffer (Online & Diagnostics) and note the latest events.', 'Check for module/rack faults or programming errors.', 'Clear cause, then acknowledge / cycle STOP→RUN.'] },
  { c: 'BF', t: 'Bus Fault LED (Profinet)', d: 'Lost connection to one or more IO devices.', s: ['Identify failed device in Online view (red diagnostic symbol).', 'Check cable, connector and switch port LEDs.', 'Verify device name & IP match project (Accessible devices).', 'Re-assign name via "Assign PROFINET device name" if needed.'] },
  { c: 'OB86', t: 'Rack / station failure', d: 'IO device or DP slave dropped out; OB86 missing = CPU STOP.', s: ['Check power and cabling to the failed station.', 'Confirm Profinet name and topology.', 'Add OB86 to program to handle failures gracefully.', 'Check update time / watchdog factor for noisy networks.'] },
  { c: 'OB82', t: 'Diagnostic interrupt', d: 'Module reports diagnostics (wire break, short circuit, overtemp, missing supply).', s: ['Open module diagnostics for channel details.', 'Check wiring and load-side supply (L+).', 'Verify channel diagnostics enabled only where sensors are wired.'] },
  { c: 'OB121', t: 'Programming error', d: 'Runtime error in a block (e.g. div by zero, invalid pointer, DB not loaded).', s: ['Read block and line from diagnostic buffer.', 'Check DB existence/length and indirect addressing.', 'Use OB121 to log or handle the error.'] },
  { c: 'OB122', t: 'I/O access error', d: 'Program accessed a non-existent or failed I/O address.', s: ['Verify address exists in HW config.', 'Check module presence and station status.', 'Correct the address or add OB122 handling.'] },
  { c: 'OB80', t: 'Cycle time exceeded', d: 'Scan time exceeded the configured maximum cycle time.', s: ['Check cycle time in CPU diagnostics.', 'Find long loops / heavy communication blocks.', 'Move work to cyclic interrupts or raise limit only with justification.'] },
  { c: 'MAINT', t: 'Maintenance LED', d: 'Maintenance demanded or required on a device.', s: ['Open device diagnostics for the maintenance text.', 'Check supply, firmware mismatch or wear indicators.', 'Schedule service; log the event.'] },
  { c: 'NAME', t: 'Device name mismatch / not assigned', d: 'Configured Profinet name differs from device name.', s: ['Go online > Accessible devices and read the actual name.', 'Assign the configured name.', 'Reset device to factory settings if name cannot be written.'] },
  { c: 'IPDUP', t: 'Duplicate IP address', d: 'Two nodes with the same IP cause intermittent comms.', s: ['Scan the network with Accessible devices.', 'Unplug suspect nodes one at a time.', 'Assign unique IPs and document them.'] },
  { c: 'WIRE', t: 'Wire break on analog/digital input', d: 'Channel diagnostic: open loop or missing sensor.', s: ['Measure 4–20 mA loop current at terminals.', 'Check terminal tightness and shield grounding.', 'Verify sensor supply and correct channel type in HW config.'] },
  { c: 'FSTOP', t: 'F-CPU safety fault / F-signature mismatch', d: 'Safety program collective signature or F-module comm error.', s: ['Check the F-diagnostic buffer for the failing F-module.', 'Verify F-destination address matches DIP switches.', 'Compile and download safety program; re-integrate module.', 'Perform and document safety function retest.'] },
  { c: 'MMC', t: 'Memory card error', d: 'Card missing, corrupt or wrong size.', s: ['Reseat or replace the card.', 'Reformat and reload project.', 'Check firmware compatibility.'] }
];

/* ---------- State ---------- */
const S = { checks: {}, notes: '', meta: {}, log: [] };
const log = m => { S.log.push({ t: new Date().toISOString(), m }); if (S.log.length > 500) S.log.shift(); DB.set('log', S.log); };
const V = $('#view');
let view = 'home';

/* ---------- Navigation ---------- */
function nav(v) {
  view = v; render(); scrollTo(0, 0);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
document.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) nav(b.dataset.v); });
const totals = () => { const tot = CL.reduce((a, s) => a + s.i.length, 0), done = Object.values(S.checks).filter(Boolean).length; return { tot, done, pct: Math.round(done / tot * 100) }; };
function render() { ({ home: vHome, check: vCheck, fault: vFault, media: vMedia, report: vReport })[view](); }

/* ---------- Home ---------- */
async function vHome() {
  const t = totals(), m = (await DB.all()).length;
  V.innerHTML = `<div class="card"><b>Commissioning progress: ${t.pct}%</b><div class="bar"><i style="width:${t.pct}%"></i></div><small class="m">${t.done}/${t.tot} steps · ${m} media items · data stored on this device</small></div>
  <div class="grid2">
   <button class="tile" data-v="check"><span>✔</span>Site Checklists<small>${t.done}/${t.tot} done</small></button>
   <button class="tile" data-v="fault"><span>⚠</span>Siemens S7/TIA Fault Lookup<small>${FAULTS.length} entries</small></button>
   <button class="tile" data-v="media"><span>📷</span>Media Capture &amp; Redline<small>${m} saved</small></button>
   <button class="tile" data-v="report"><span>📄</span>Export SAT Report<small>Print · Share · Save</small></button>
  </div>`;
}

/* ---------- Checklists ---------- */
function vCheck() {
  const t = totals();
  V.innerHTML = `<h2>Site Checklists <small id="tot">${t.done}/${t.tot}</small></h2>` +
    CL.map(s => `<details class="card" open><summary>${s.t}<b>${s.i.filter((_, k) => S.checks[s.id + k]).length}/${s.i.length}</b></summary>` +
      s.i.map((x, k) => `<label class="row"><input type="checkbox" data-c="${s.id + k}" ${S.checks[s.id + k] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('') + '</details>').join('') +
    `<h3>Site notes</h3><textarea id="notes" class="inp" rows="5" placeholder="Observations, punch-list items, parameter changes…">${esc(S.notes)}</textarea>
     <button class="btn sec" id="reset">Reset all checklist progress</button>`;
}
document.addEventListener('change', e => {
  const c = e.target.dataset && e.target.dataset.c; if (!c) return;
  S.checks[c] = e.target.checked; DB.set('checks', S.checks);
  const [sec, k] = [CL.find(s => c.startsWith(s.id) && !isNaN(c.slice(s.id.length))), +c.replace(/\D/g, '')];
  log(`${e.target.checked ? 'CHECKED' : 'UNCHECKED'}: ${sec.t} – ${sec.i[k]}`);
  const d = e.target.closest('details');
  d.querySelector('summary b').textContent = `${d.querySelectorAll('input:checked').length}/${sec.i.length}`;
  const t = totals(); $('#tot').textContent = `${t.done}/${t.tot}`;
});
document.addEventListener('input', e => {
  if (e.target.id === 'notes') { S.notes = e.target.value; DB.set('notes', S.notes); }
  if (e.target.id === 'q') fList();
  if (e.target.dataset && e.target.dataset.meta) { S.meta[e.target.dataset.meta] = e.target.value; DB.set('meta', S.meta); }
});
document.addEventListener('click', e => {
  if (e.target.id === 'reset' && confirm('Clear ALL checklist ticks?')) { S.checks = {}; DB.set('checks', {}); log('Checklist reset'); vCheck(); }
});

/* ---------- Fault lookup ---------- */
function vFault() {
  V.innerHTML = `<h2>Siemens S7 / TIA Fault Lookup</h2>
  <input id="q" class="inp" type="search" placeholder="Search code, LED, symptom (e.g. OB86, bus fault)…">
  <div class="card"><b>HMI photo → fault filter</b> <small class="m">(simulated OCR – no engine bundled)</small>
   <input id="ocrf" type="file" accept="image/*" capture="environment" class="inp">
   <img id="ocrimg" hidden style="max-width:100%;border-radius:10px">
   <button class="btn sec" id="ocr">Run mock OCR on photo</button></div>
  <div id="fl"></div><small class="m">Field aid only – verify against Siemens documentation for your firmware.</small>`;
  fList();
}
function fList() {
  const q = ($('#q').value || '').toLowerCase().trim();
  const r = FAULTS.filter(f => !q || [f.c, f.t, f.d, ...f.s].join(' ').toLowerCase().includes(q));
  $('#fl').innerHTML = r.length ? r.map(f => `<div class="card"><span class="tag">${esc(f.c)}</span> <b>${esc(f.t)}</b><p>${esc(f.d)}</p><ol>${f.s.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`).join('') : '<p>No matching faults.</p>';
}
document.addEventListener('change', e => {
  if (e.target.id === 'ocrf' && e.target.files[0]) { const i = $('#ocrimg'); i.src = URL.createObjectURL(e.target.files[0]); i.hidden = false; }
});
document.addEventListener('click', e => {
  if (e.target.id !== 'ocr') return;
  if ($('#ocrimg').hidden) return alert('Snap or upload an HMI photo first.');
  e.target.textContent = 'Scanning…';
  setTimeout(() => {
    const f = FAULTS[Math.floor(Math.random() * 4) + 1];
    $('#q').value = f.c; fList(); e.target.textContent = `Simulated read: "${f.c}" — edit search if wrong`;
    log(`Mock OCR suggested ${f.c}`);
  }, 900);
});

/* ---------- Media & redline ---------- */
let cv, cx, drawing = false;
async function vMedia() {
  V.innerHTML = `<h2>Media Capture &amp; Redline</h2>
  <input id="mf" type="file" accept="image/*" capture="environment" class="inp">
  <canvas id="cv" hidden></canvas>
  <div id="mform" hidden>
   <small class="m">Draw red markup on the photo with finger or stylus.</small>
   <textarea id="mnote" class="inp" rows="3" placeholder="Note (terminal X12:4 loose, guide rail misaligned…)"></textarea>
   <button class="btn" id="msave">Save with timestamp</button>
   <button class="btn sec" id="mundo">Undo markup</button>
  </div><h3>Saved media</h3><div id="gal" class="gal"></div>`;
  cv = $('#cv'); cx = cv.getContext('2d');
  gallery();
}
let base;
document.addEventListener('change', e => {
  if (e.target.id !== 'mf' || !e.target.files[0]) return;
  const i = new Image();
  i.onload = () => {
    const k = Math.min(1, 1280 / Math.max(i.width, i.height));
    cv.width = i.width * k; cv.height = i.height * k; cx.drawImage(i, 0, 0, cv.width, cv.height);
    base = cx.getImageData(0, 0, cv.width, cv.height); cv.hidden = false; $('#mform').hidden = false;
  };
  i.src = URL.createObjectURL(e.target.files[0]);
});
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
document.addEventListener('pointerdown', e => { if (e.target.id !== 'cv') return; drawing = true; cv.setPointerCapture(e.pointerId); cx.strokeStyle = '#ff1e1e'; cx.lineWidth = Math.max(4, cv.width / 150); cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(...pt(e)); });
document.addEventListener('pointermove', e => { if (drawing && e.target.id === 'cv') { cx.lineTo(...pt(e)); cx.stroke(); } });
document.addEventListener('pointerup', () => { drawing = false; });
document.addEventListener('click', async e => {
  if (e.target.id === 'mundo' && base) cx.putImageData(base, 0, 0);
  if (e.target.id === 'msave') {
    const ts = new Date().toISOString(), note = $('#mnote').value;
    await DB.add({ img: cv.toDataURL('image/jpeg', 0.7), note, ts });
    log('Photo saved' + (note ? ': ' + note.slice(0, 60) : '')); vMedia();
  }
  if (e.target.dataset && e.target.dataset.del && confirm('Delete this item?')) { await DB.del(+e.target.dataset.del); gallery(); }
});
async function gallery() {
  const m = (await DB.all()).reverse();
  $('#gal').innerHTML = m.length ? m.map(x => `<div class="card"><img src="${x.img}" alt=""><small class="m">${fmt(x.ts)}</small><p>${esc(x.note) || '<i>No note</i>'}</p><button class="btn bad" data-del="${x.id}">Delete</button></div>`).join('') : '<p>No media yet.</p>';
}

/* ---------- SAT report ---------- */
async function buildReport() {
  const m = S.meta, t = totals(), media = await DB.all();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SAT Report – ${esc(m.project || 'Site')}</title>
<style>body{font:14px Arial,sans-serif;max-width:800px;margin:20px auto;padding:0 12px;color:#111}h1{border-bottom:3px solid #d97706}h2{background:#eee;padding:4px 8px}
td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}table{border-collapse:collapse;width:100%;margin-bottom:12px}img{max-width:100%}.m{break-inside:avoid;margin-bottom:12px}</style></head><body>
<h1>Site Acceptance Test Report</h1>
<table><tr><th>Project</th><td>${esc(m.project)}</td><th>Site</th><td>${esc(m.site)}</td></tr>
<tr><th>Customer</th><td>${esc(m.customer)}</td><th>Engineer</th><td>${esc(m.eng)}</td></tr>
<tr><th>Generated</th><td>${fmt(Date.now())}</td><th>Completion</th><td>${t.done}/${t.tot} (${t.pct}%)</td></tr></table>
${CL.map(s => `<h2>${esc(s.t)}</h2><table>${s.i.map((x, k) => `<tr><td width="30">${S.checks[s.id + k] ? '☑' : '☐'}</td><td>${esc(x)}</td></tr>`).join('')}</table>`).join('')}
<h2>Site Notes</h2><p style="white-space:pre-wrap">${esc(S.notes) || '—'}</p>
<h2>Field Media (${media.length})</h2>${media.map(x => `<div class="m"><img src="${x.img}"><br><b>${fmt(x.ts)}</b> – ${esc(x.note)}</div>`).join('') || '—'}
<h2>Activity Log</h2><table>${S.log.slice(-100).map(l => `<tr><td width="150">${fmt(l.t)}</td><td>${esc(l.m)}</td></tr>`).join('')}</table>
<p><br>Signature: ______________________ Date: ____________</p></body></html>`;
}
async function vReport() {
  const m = S.meta, f = (k, p) => `<input class="inp" data-meta="${k}" placeholder="${p}" value="${esc(m[k] || '')}">`;
  V.innerHTML = `<h2>Export SAT Report</h2>${f('project', 'Project / Order no.')}${f('site', 'Site / Plant')}${f('customer', 'Customer')}${f('eng', 'Commissioning engineer')}
  <button class="btn sec" id="rprev">Refresh preview</button>
  <iframe id="pv" title="Report preview"></iframe>
  <button class="btn" id="rprint">Print / Save as PDF</button>
  <button class="btn" id="rshare">Share (email, apps…)</button>
  <button class="btn sec" id="rdl">Download HTML</button>`;
  $('#pv').srcdoc = await buildReport();
}
const fname = () => `SAT_${(S.meta.project || 'report').replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.html`;
document.addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'rprev') $('#pv').srcdoc = await buildReport();
  if (id === 'rprint') { $('#pv').srcdoc = await buildReport(); setTimeout(() => $('#pv').contentWindow.print(), 400); }
  if (id === 'rdl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await buildReport()], { type: 'text/html' })); a.download = fname(); a.click(); log('Report downloaded'); }
  if (id === 'rshare') {
    const html = await buildReport(), file = new File([html], fname(), { type: 'text/html' }), t = totals();
    const text = `SAT report – ${S.meta.project || ''} ${S.meta.site || ''}: ${t.done}/${t.tot} steps complete.`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title: 'SAT Report', text, files: [file] });
      else if (navigator.share) await navigator.share({ title: 'SAT Report', text });
      else location.href = `mailto:?subject=${encodeURIComponent('SAT Report')}&body=${encodeURIComponent(text + '\n(Attach the downloaded HTML report.)')}`;
      log('Report shared');
    } catch (_) {}
  }
});

/* ---------- Status, theme, boot ---------- */
function net() { const n = $('#net'), on = navigator.onLine; n.classList.toggle('on', on); n.querySelector('b').textContent = on ? 'Online' : 'Offline'; }
addEventListener('online', net); addEventListener('offline', net);
$('#theme').onclick = () => {
  const r = document.documentElement, dark = getComputedStyle(r).getPropertyValue('--bg').trim() === '#0b1220';
  r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('theme', r.dataset.theme); } catch (_) {}
};
try { const th = localStorage.getItem('theme'); if (th) document.documentElement.dataset.theme = th; } catch (_) {}

(async () => {
  net();
  [S.checks, S.notes, S.meta, S.log] = await Promise.all([DB.get('checks', {}), DB.get('notes', ''), DB.get('meta', {}), DB.get('log', [])]);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
})();
