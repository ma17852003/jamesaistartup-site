/* ============================================================
 * 後台監控 overlay — 3D 像素辦公室（監控 × AI 員工視覺化）
 * 資料源：GET /api/monitor（僅 7860 同源模式存在；:3700 fetch 失敗→整層隱藏）
 *  - 底部常駐狀態列：🟢N/⚫M 服務
 *  - 點開監控面板：分組列出服務、未登記容器、背景 python 腳本
 *  - 有對應專案的服務列 → 點一下聚光該專案團隊（複用 OFFICE_API）
 * ============================================================ */

const POLL_MS = 6000;
// :3700（Docker 純靜態）沒有自己的後端 → 跨端口打 7860（server.py 已開對應 CORS）；
// 7860 融合模式走同源。後端沒起時 fetch 失敗 → 整層隱藏、6 秒後自動重試。
const API_BASE = (location.port === '3700') ? 'http://127.0.0.1:7860' : '';

let office = null;
let strip = null, panel = null;
let last = null;
let timer = null;

function injectStyles() {
  const css = `
#mon-strip{position:fixed;left:50%;bottom:calc(var(--dock-h,0px) + 14px);transform:translateX(-50%);z-index:26;cursor:pointer;
  font-family:var(--font-pixel,'Press Start 2P',monospace);font-size:11px;letter-spacing:.02em;
  padding:9px 16px;border:2px solid var(--border,#2a2a5a);background:var(--ui-bar-bg,rgba(10,10,26,.88));
  color:var(--text,#e0e0ff);box-shadow:4px 4px 0 var(--shadow-ink,#000);display:none;white-space:nowrap}
#mon-strip.show{display:block}
#mon-strip:hover{border-color:var(--accent,#7c6fff)}
#mon-strip .up{color:var(--green,#39ff14)}
#mon-strip .down{color:var(--ui-hint,#667)}
#mon-panel{position:fixed;left:12px;bottom:calc(var(--dock-h,0px) + 14px);z-index:27;width:330px;max-height:70vh;overflow-y:auto;
  background:var(--ui-todo-bg,rgba(13,13,43,.95));border:3px solid var(--accent,#7c6fff);
  box-shadow:6px 6px 0 var(--shadow-ink,#000);padding:12px;display:none}
#mon-panel.show{display:block}
#mon-panel h3{font-family:var(--font-pixel,'Press Start 2P',monospace);font-size:11px;color:var(--gold,#ffd700);
  margin:10px 0 6px;line-height:1.6}
#mon-panel h3:first-child{margin-top:0}
#mon-panel .mrow{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.5;padding:5px 7px;
  border:1px solid var(--border,#2a2a5a);margin-bottom:4px;background:var(--todo-row-bg,rgba(124,111,255,.05))}
#mon-panel .mrow.link{cursor:pointer}
#mon-panel .mrow.link:hover{border-color:var(--accent,#7c6fff);background:var(--todo-row-hover,rgba(124,111,255,.15))}
#mon-panel .mdot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
#mon-panel .mdot.up{background:var(--green,#39ff14);box-shadow:0 0 8px var(--green,#39ff14)}
#mon-panel .mdot.down{background:#3a3a55}
#mon-panel .mdet{margin-left:auto;font-size:11px;color:var(--ui-hint,#667)}
#mon-panel .mproj{font-size:11px;color:var(--accent,#7c6fff)}
#mon-panel .mx{position:absolute;top:8px;right:10px;background:none;border:1px solid var(--red,#ff4444);
  color:var(--red,#ff4444);font-size:11px;padding:2px 8px;cursor:pointer}
#mon-panel .msub{font-size:12px;color:var(--ui-infotext,#bbc);padding:3px 7px}`;
  const el = document.createElement('style');
  el.id = 'monitor-style';
  el.textContent = css;
  document.head.appendChild(el);
}

function buildDom() {
  strip = document.createElement('div');
  strip.id = 'mon-strip';
  strip.title = '後台服務監控（點開面板）';
  strip.addEventListener('click', () => panel.classList.toggle('show'));
  document.body.appendChild(strip);

  panel = document.createElement('div');
  panel.id = 'mon-panel';
  document.body.appendChild(panel);
}

function renderStrip(d) {
  const up = d.summary.up, down = d.summary.total - d.summary.up;
  strip.innerHTML = `🖥️ <span class="up">🟢 ${up} 運行中</span> · <span class="down">⚫ ${down} 離線</span>` +
    (d.docker_others.length ? ` · 🐳 +${d.docker_others.length}` : '');
  strip.classList.add('show');
}

function renderPanel(d) {
  const groups = {};
  d.services.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });

  let html = `<button class="mx" id="mon-close">✕</button>`;
  for (const [g, rows] of Object.entries(groups)) {
    html += `<h3>${g}</h3>`;
    for (const s of rows) {
      const hasProj = s.project && office.projects.some((p) => p.name === s.project);
      html += `<div class="mrow${hasProj ? ' link' : ''}" data-proj="${hasProj ? encodeURIComponent(s.project) : ''}">` +
        `<span class="mdot ${s.up ? 'up' : 'down'}"></span>` +
        `<span>${s.label}${hasProj ? `<br><span class="mproj">▸ ${s.project}（點我看團隊）</span>` : ''}</span>` +
        `<span class="mdet">${s.detail || ''}</span></div>`;
    }
  }
  if (d.docker_others.length) {
    html += `<h3>🐳 其他 Docker 容器（${d.docker_others.length}）</h3>`;
    d.docker_others.forEach((r) => {
      const up = /^up/i.test(r.status);
      html += `<div class="mrow"><span class="mdot ${up ? 'up' : 'down'}"></span><span>${r.name}</span>` +
        `<span class="mdet">${r.status}</span></div>`;
    });
  }
  if (d.python_scripts.length) {
    html += `<h3>🐍 背景 Python（${d.python_scripts.length}）</h3>`;
    d.python_scripts.forEach((n) => { html += `<div class="msub">· ${n}</div>`; });
  }
  panel.innerHTML = html;

  panel.querySelector('#mon-close').addEventListener('click', () => panel.classList.remove('show'));
  panel.querySelectorAll('.mrow.link').forEach((r) => {
    r.addEventListener('click', () => {
      const name = decodeURIComponent(r.getAttribute('data-proj') || '');
      const proj = office.projects.find((p) => p.name === name);
      if (proj) office.spotlight(proj);
    });
  });
}

async function poll() {
  let d;
  try {
    const r = await fetch(API_BASE + '/api/monitor');
    if (!r.ok) throw new Error(r.status);
    d = await r.json();
    if (window.DEMO_MODE?.on) d = window.DEMO_MODE.scrubMonitor(d); // 展示模式黑名單（SPEC-demo-mode-v1）
  } catch {
    // :3700 純展示版或後端未起 → 隱藏整層，下輪再試
    strip.classList.remove('show');
    return;
  }
  last = d;
  renderStrip(d);
  if (panel.classList.contains('show')) renderPanel(d);
  else renderPanel(d); // 面板內容常保最新，開著就即時
}

export async function initMonitorOverlay(officeApi) {
  office = officeApi;
  injectStyles();
  buildDom();
  await poll();
  timer = setInterval(poll, POLL_MS);
}
