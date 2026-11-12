/* ============================================================
 * 出貨月台 overlay — 3D 像素辦公室（command-center\SPEC-output-flow-v1.md）
 * 資料源：GET /api/dock（7860 同源；:3700 跨端口）。從沒連上過 → 整層不出現。
 *  - KPI 條（今日交件／失敗／編制／狀態三態）＋ 出貨月台 ＋ 完整清單
 *  - 只為新 id 建 DOM；同內容刷新零 DOM 變動（SPEC §8）
 *  - ?rec=1920|1280 錄影模式；?replay=YYYY-MM-DD&speed=60 重播模式
 *  - 3D 泡泡與飛行在 dock-3d.js（載入失敗＝只是沒動畫，卡片照樣落位）
 * ============================================================ */
import * as K from './dock-core.js';

const POLL_MS = 6000;
const API_BASE = (location.port === '3700') ? 'http://127.0.0.1:7860' : '';
const Q = new URLSearchParams(location.search);
const REC_W = [1280, 1920].includes(+Q.get('rec')) ? +Q.get('rec') : 0;
const REPLAY = /^\d{4}-\d{2}-\d{2}$/.test(Q.get('replay') || '') ? Q.get('replay') : null;
const SPEED = Math.max(1, Math.min(600, K.sanitizeSpeed(+Q.get('speed'))));
const KPI_BAR_H = 40, KPI_H = KPI_BAR_H + 4, DOCK_H = 68, FETCH_TIMEOUT_MS = 5000, SEEN_MAX = 500;
const HUD_S = REC_W ? REC_W / 1920 : 1;
const CARD_W = REC_W ? 320 * HUD_S : 360, CARD_GAP = REC_W ? 20 * HUD_S : 12;

let office = null;
let fx = { arrive(e, card, done) { card.classList.add('dk-fade'); done(); } };
const el = {};
let data = null, everConnected = false, connLost = false, badData = false, firstRender = true, inFlight = 0, replayNow = 0;
const flyingPosts = new Set(); // 正在飛的 post 卡 id（REC 計數器等它落位才算）
// 產線重播接管時鐘（line-card.js Task 10）：接管後月台不跑自己的倍速排程，左下狀態膠囊讓給產線重播條（它寫「變速」，月台的寫固定倍速會打架）
let lineClaimed = false, lineFollowing = false;
const agoOf = e => (lineFollowing ? K.clockText(e.ts) : K.agoText(e.ts, nowMs())); // 跟產線時鐘時「n 分前」沒意義，改寫絕對時刻（A4）
addEventListener('line:replay-claim', () => { lineClaimed = true; if (data && el.status) renderStatus(); });
let seenIds = new Set(), polling = false, timedOut = false, lastWarn = '';
const warnOnce = msg => { if (msg !== lastWarn) { lastWarn = msg; console.warn('dock:', msg); } };
const validDock = d => !!d && Array.isArray(d.events) && Number.isFinite(d.ok_count) && Number.isFinite(d.fail_count);
const todayStr = () => { const t = new Date(), p = n => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; };
const replayMeta = { compressed: false, backfill: false, empty: false };
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nowMs = () => (REPLAY && replayNow ? replayNow : Date.now());
const dayMD = d => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
const fmtTime = iso => { const t = new Date(iso), p = n => String(n).padStart(2, '0'); return `${t.getMonth() + 1}/${t.getDate()} ${p(t.getHours())}:${p(t.getMinutes())}`; };

function injectStyles() {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&display=swap';
  document.head.appendChild(font);
  const css = `
#dk-kpi{position:fixed;left:12px;right:12px;top:58px;height:${KPI_BAR_H}px;z-index:21;display:none;align-items:center;gap:22px;padding:0 16px;
  background:var(--ui-bar-bg);border:2px solid var(--border);box-shadow:3px 3px 0 var(--shadow-ink);color:var(--text);font-size:14px;contain:layout;white-space:nowrap}
#dk-kpi.show{display:flex}
#dk-kpi b{font-weight:900}
.dk-mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
#dk-kpi .dk-cnt{font-size:26px;color:var(--gold);font-weight:700;letter-spacing:.06em;display:inline-block;min-width:3.4ch}
#dk-kpi .dk-fail{color:var(--red)}
#dk-kpi .dk-warn{color:var(--orange)}
#dk-kpi .dk-sep{width:2px;height:20px;background:var(--border)}
#dk-kpi .dk-st{margin-left:auto}
.dk-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--green);margin-right:7px;vertical-align:1px}
.dk-dot.off{background:transparent;border:2px solid var(--ui-hint)}
#dk-dock{position:fixed;left:0;right:0;bottom:0;height:${DOCK_H}px;z-index:24;display:none;align-items:center;gap:12px;padding:0 14px;
  background:var(--ui-bar-bg);border-top:2px solid var(--border);contain:layout}
#dk-dock.show{display:flex}
#dk-dock .dk-lbl{font-weight:900;color:var(--text);font-size:15px;white-space:nowrap}
#dk-track{flex:1;display:flex;gap:12px;overflow:hidden;min-width:0;align-items:center;height:100%}
.dk-card{display:flex;align-items:stretch;height:38px;max-width:360px;background:var(--panel);border:2px solid var(--tone);
  box-shadow:3px 3px 0 var(--shadow-ink);white-space:nowrap;flex-shrink:0}
.dk-card .dk-tag{flex-shrink:0;display:flex;align-items:center;padding:0 8px;font-family:var(--font-pixel);font-size:11px;font-weight:700}
.dk-card .dk-icon{width:16px;height:16px;margin-right:5px;filter:drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 0 1px rgba(0,0,0,.9))}
body.dk-rec .dk-card .dk-icon{width:calc(28px*var(--hud-s));height:calc(28px*var(--hud-s))}
.dk-card .dk-tag.solid{background:var(--tone);color:var(--bg)}
.dk-card .dk-tag.outline{color:var(--tone);border-right:2px solid var(--tone)}
.dk-card .dk-tag.text{color:var(--text);border-right:2px dashed var(--tone)}
.dk-card .dk-fn{display:flex;align-items:center;padding:0 10px;color:var(--text);font-size:14px;min-width:0;overflow:hidden}
.dk-card .dk-fnt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dk-card .dk-sfx{flex-shrink:0;padding-left:6px;color:var(--red);white-space:nowrap}
.dk-card .dk-ago{display:flex;align-items:center;flex-shrink:0;padding-left:8px;padding-right:10px;color:var(--ui-hint);font-size:12px}
.dk-card.fail{--tone:var(--red)}
.dk-card.dk-fade{animation:dkFade .15s ease-out}
.dk-card.dk-land{animation:dkLand .22s ease-out}
@keyframes dkFade{from{opacity:0}to{opacity:1}}
@keyframes dkLand{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#dk-more{margin-left:auto;color:var(--text);font-weight:900;font-size:15px;white-space:nowrap;border:2px dashed var(--border);
  padding:7px 12px;cursor:pointer;background:none}
#dk-status{position:fixed;left:14px;bottom:calc(var(--dock-h,0px) + 12px);z-index:31;display:none;font-size:14px;color:var(--text);
  background:var(--ui-bar-bg);border:2px solid var(--border);padding:6px 12px;white-space:nowrap}
#dk-status.show{display:block}
#dk-status.replay{border-color:var(--accent);font-weight:900;
  background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--accent) 14%,transparent) 0 8px,transparent 8px 16px),var(--ui-bar-bg)}
#dk-list{position:fixed;right:12px;bottom:calc(var(--dock-h,0px) + 12px);z-index:28;width:440px;max-height:60vh;overflow-y:auto;display:none;
  background:var(--ui-todo-bg);border:3px solid var(--gold);box-shadow:6px 6px 0 var(--shadow-ink);padding:12px;color:var(--text)}
#dk-list.show{display:block}
#dk-list .dk-lh{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}
#dk-list .dk-lh a{color:var(--accent)}
#dk-list .dk-row{display:flex;gap:8px;align-items:center;font-size:12px;padding:5px 7px;border:1px solid var(--border);margin-bottom:4px}
#dk-list .dk-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ui-infotext)}
#dk-list button{font:inherit;font-size:11px;background:none;border:1px solid var(--border);color:var(--text);cursor:pointer;padding:1px 6px}
.dk-ghost{position:fixed;left:0;top:0;z-index:25;pointer-events:none;margin:0}
#dk-rec-title,#dk-rec-counter{display:none}
body.dk-rec .bar,body.dk-rec .legend,body.dk-rec .info,body.dk-rec .todo,body.dk-rec .toast,body.dk-rec #mon-strip,
body.dk-rec #mon-panel,body.dk-rec #dk-kpi,body.dk-rec #dk-list{display:none!important}
body.dk-rec #dk-rec-title{display:block;position:fixed;z-index:21;left:calc(var(--rec-w)*.05);top:calc(var(--rec-h)*.05);
  color:var(--text);text-shadow:3px 3px 0 var(--shadow-ink)}
body.dk-rec #dk-rec-title .h{font-size:calc(56px*var(--hud-s));font-weight:900;line-height:1.1}
body.dk-rec #dk-rec-title .s{font-size:calc(26px*var(--hud-s));color:var(--ui-hint);margin-top:calc(10px*var(--hud-s))}
body.dk-rec #dk-rec-counter{display:block;position:fixed;z-index:21;left:calc(var(--rec-w)*.95);top:calc(var(--rec-h)*.05);transform:translateX(-100%);
  background:var(--ui-bar-bg);border:3px solid var(--border);box-shadow:6px 6px 0 var(--shadow-ink);
  padding:calc(14px*var(--hud-s)) calc(30px*var(--hud-s));text-align:right}
body.dk-rec #dk-rec-counter .k{white-space:nowrap;font-size:calc(28px*var(--hud-s));font-weight:900;color:var(--text)}
body.dk-rec #dk-rec-counter .n{white-space:nowrap;font-size:calc(120px*var(--hud-s));line-height:1;font-weight:700;color:var(--gold)}
body.dk-rec #dk-rec-counter small{font-size:calc(34px*var(--hud-s));font-weight:900;margin-left:calc(10px*var(--hud-s));
  color:var(--text);font-family:'Noto Sans TC',sans-serif}
body.dk-rec #dk-dock{left:calc(var(--rec-w)*.05);right:auto;width:calc(var(--rec-w)*.9);bottom:auto;
  top:calc(var(--rec-h)*.95 - 180px*var(--hud-s));height:calc(96px*var(--hud-s));
  border:3px solid var(--border);box-shadow:6px 6px 0 var(--shadow-ink);gap:calc(20px*var(--hud-s));padding:0 calc(22px*var(--hud-s))}
body.dk-rec #dk-dock .dk-lbl{font-size:calc(28px*var(--hud-s))}
body.dk-rec #dk-track{gap:calc(20px*var(--hud-s))}
body.dk-rec .dk-card{height:calc(60px*var(--hud-s));max-width:calc(320px*var(--hud-s))}
body.dk-rec .dk-card .dk-tag{font-size:calc(16px*var(--hud-s));padding:0 calc(12px*var(--hud-s))}
body.dk-rec .dk-card .dk-fn{font-size:calc(30px*var(--hud-s));padding:0 calc(16px*var(--hud-s))}
body.dk-rec .dk-card .dk-ago{display:none}
body.dk-rec #dk-more{font-size:calc(26px*var(--hud-s));padding:calc(10px*var(--hud-s)) calc(16px*var(--hud-s))}
body.dk-rec #dk-status{left:calc(var(--rec-w)*.05);top:auto;bottom:calc(var(--rec-h)*.05);
  font-size:calc(28px*var(--hud-s));padding:calc(10px*var(--hud-s)) calc(18px*var(--hud-s))}
@media (prefers-reduced-motion:reduce){.dk-card.dk-land{animation:dkFade .15s ease-out}}`;
  const s = document.createElement('style');
  s.id = 'dock-style';
  s.textContent = css;
  document.head.appendChild(s);
}

function setList(open) {
  el.list.classList.toggle('show', open);
  el.more.setAttribute('aria-expanded', String(open));
  if (open) renderList();
}

function buildDom() {
  const mk = (id, html) => { const n = document.createElement('div'); n.id = id; n.innerHTML = html; document.body.appendChild(n); return n; };
  el.kpi = mk('dk-kpi', '<span><span class="dk-k">今日交件</span> <b class="dk-cnt dk-mono">000</b> 件</span><span class="dk-fail dk-mono"></span><span class="dk-warn"></span>'
    + '<span class="dk-sep"></span><span class="dk-roster"></span><span class="dk-st"></span>');
  el.kLabel = el.kpi.querySelector('.dk-k'); el.cnt = el.kpi.querySelector('.dk-cnt');
  el.fail = el.kpi.querySelector('.dk-fail'); el.warn = el.kpi.querySelector('.dk-warn');
  el.roster = el.kpi.querySelector('.dk-roster'); el.kst = el.kpi.querySelector('.dk-st');
  el.dock = mk('dk-dock', '<span class="dk-lbl">出貨月台 ▸</span><div id="dk-track"></div><button id="dk-more" class="dk-mono" aria-controls="dk-list" aria-expanded="false"></button>');
  el.track = el.dock.querySelector('#dk-track'); el.more = el.dock.querySelector('#dk-more');
  el.more.addEventListener('click', () => setList(!el.list.classList.contains('show')));
  el.status = mk('dk-status', '');
  el.list = mk('dk-list', '<div class="dk-lh"><b>全部交件</b><a id="dk-replay-link">⟲ 重播這一天</a></div><div id="dk-rows"></div>');
  el.rows = el.list.querySelector('#dk-rows'); el.replayLink = el.list.querySelector('#dk-replay-link');
  el.replayLink.href = `?replay=${todayStr()}&speed=60`;
  el.recTitle = mk('dk-rec-title', '<div class="h">AI造王者公司</div><div class="s"></div>');
  el.recCounter = mk('dk-rec-counter', '<div class="k">今日已發布</div><div class="n dk-mono"><span class="v">000</span><small>篇</small></div>');
  const btns = document.querySelector('.bar .btns');
  if (btns && !REC_W) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = '🎬 錄影';
    b.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('rec', '1920'); location.href = u.toString(); });
    btns.appendChild(b);
  }
}

/* ── 部門色＝3D 小人制服色（ZONES[].tone），切主題只改 CSS 變數與標籤 class，不重建卡片 ── */
function tagStyleFor(card) {
  const T = office.theme();
  if (card.classList.contains('fail')) return K.tagStyle(T.css.red, T.css.bg, T.css.panel);
  const zone = K.CODE2ZONE[card.dataset.dept];
  return zone ? K.tagStyle(office.ZONES[zone].tone, T.css.bg, T.css.panel) : 'text';
}
function applyTagStyle(card) {
  const tag = card.querySelector('.dk-tag'), want = tagStyleFor(card);
  if (tag && !tag.classList.contains(want)) { tag.classList.remove('solid', 'outline', 'text'); tag.classList.add(want); }
}
function syncDeptVars() {
  const R = document.documentElement.style;
  for (const code of K.DEPT_CODES) R.setProperty('--dk-' + code, office.ZONES[K.CODE2ZONE[code]].tone);
  R.setProperty('--dk-SYS', getComputedStyle(document.documentElement).getPropertyValue('--ui-hint').trim() || '#888');
  el.track.querySelectorAll('.dk-card').forEach(applyTagStyle);
}

function makeCard(e) {
  const c = document.createElement('div');
  const dept = K.CODE2ZONE[e.dept] ? e.dept : 'SYS';
  c.className = 'dk-card' + (e.ok ? '' : ' fail');
  c.dataset.dept = dept;
  if (e.ok) c.style.setProperty('--tone', `var(--dk-${dept})`);
  const tag = document.createElement('span'); tag.className = 'dk-tag'; tag.textContent = dept;
  if (dept !== 'SYS') { // SYS 沒有吉祥物圖：不建 img，免得 404 噴 console 錯誤
    const icon = document.createElement('img');
    icon.className = 'dk-icon'; icon.alt = ''; icon.width = 16; icon.height = 16;
    icon.src = `assets/mascots/${dept}.png`;
    icon.addEventListener('error', () => { warnOnce(`吉祥物圖示載入失敗：${dept}（:3700 改了 compose 要 docker compose up -d 重建容器）`); icon.remove(); }, { once: true });
    tag.prepend(icon);
  }
  const fn = document.createElement('span'); fn.className = 'dk-fn dk-mono';
  const fnt = document.createElement('span'); fnt.className = 'dk-fnt'; fn.appendChild(fnt);
  if (e.ok) fnt.textContent = K.cardLabel(e, !!REC_W);
  else { fnt.textContent = e.name; const sfx = document.createElement('span'); sfx.className = 'dk-sfx'; sfx.textContent = K.failSuffix(e); fn.appendChild(sfx); } // 失敗卡：任務名可省略，「✕ 失敗」永遠完整
  const ago = document.createElement('span'); ago.className = 'dk-ago dk-mono'; ago.textContent = agoOf(e);
  c.append(tag, fn, ago);
  applyTagStyle(c);
  return c;
}
function updateCard(c, e) {
  if (c.classList.contains('fail') === !!e.ok) { // 同一 id 成功／失敗狀態變了：換成新結構（極少發生，一般刷新不走這條）
    warnOnce('卡片成功/失敗狀態改變，已重建');
    const n = makeCard(e);
    c.className = n.className; c.dataset.dept = n.dataset.dept;
    const tone = n.style.getPropertyValue('--tone');
    if (tone) c.style.setProperty('--tone', tone); else c.style.removeProperty('--tone');
    c.replaceChildren(...n.childNodes);
    return;
  }
  if (e.ok) K.setText(c.querySelector('.dk-fnt'), K.cardLabel(e, !!REC_W));
  else { K.setText(c.querySelector('.dk-fnt'), e.name); K.setText(c.querySelector('.dk-sfx'), K.failSuffix(e)); }
  K.setText(c.querySelector('.dk-ago'), agoOf(e));
}

function render(d) {
  data = d;
  const { shown, more } = K.planDock(d.events, K.visibleCount(el.track.clientWidth, CARD_W, CARD_GAP), !!REC_W);
  const added = K.syncList(el.track, shown, e => e.id, makeCard, updateCard);
  // 「新可見」不等於「新交件」：只有 seenIds 沒見過的 id 才飛（視窗放大讓舊卡變可見不能重飛，SPEC §8）
  if (firstRender) seenIds = new Set(d.events.map(e => e.id));
  const fresh = added.filter(c => !seenIds.has(c.dataset.id));
  const newCount = firstRender ? 0 : d.events.filter(e => !seenIds.has(e.id)).length; // 全部新交件數，不是「新可見」張數（SPEC §8 第 9 條）
  const bulk = firstRender || newCount > 5 || reduceMotion(); // 後端剛重啟一次補記很多筆、或使用者要求減少動態 → 不飛
  firstRender = false;
  for (const card of fresh) {
    const e = shown.find(x => x.id === card.dataset.id);
    if (bulk || !e.ok) { card.classList.add('dk-fade'); continue; }
    inFlight++; let settled = false;
    if (e.src === 'post') flyingPosts.add(e.id);
    const fin = () => { if (settled) return; settled = true; inFlight--; flyingPosts.delete(e.id); renderCounts(); };
    try { fx.arrive(e, card, fin); } catch (err) { console.warn('dock fx', err); card.style.visibility = ''; card.classList.add('dk-fade'); fin(); }
  }
  if (!(d.events.length === 0 && seenIds.size > 0 && !REPLAY)) seenIds = new Set(d.events.slice(0, SEEN_MAX).map(e => e.id)); // 暫時回空陣列不洗掉已見名單
  K.setText(el.more, `+${more} 件 ▸`);
  renderCounts();
  renderStatus();
  renderList();
}

function renderCounts() {
  if (!data) return;
  if (Number.isFinite(data.ok_count)) {
    const n = K.pad3(Math.max(0, data.ok_count - inFlight)); // 飛行中的卡還沒落位，計數器先不算它（T1 不變式）
    K.setText(el.cnt, n);
    K.setText(el.recCounter.querySelector('.v'), K.pad3(K.recCountLanded(data.events || [], flyingPosts)));
  }
  K.setText(el.fail, data.fail_count ? `✕ ${data.fail_count} 失敗` : '');
  // 後端錯誤不准靜默：把名冊／交接／排程／輪詢的問題直接顯示在 KPI 條
  const parts = [], detail = [];
  const miss = Array.isArray(data.missing_tasks) ? data.missing_tasks : [];
  if (data.roster_error) { parts.push('⚠ 名冊讀取失敗'); detail.push('roster_error: ' + data.roster_error); }
  if (data.handoff_error) { parts.push('⚠ 交接資料夾讀不到'); detail.push('handoff_error: ' + data.handoff_error); }
  if (data.line_error) { parts.push('⚠ 產線讀取失敗'); detail.push('line_error: ' + data.line_error); }
  if (miss.length) { parts.push(`⚠ ${miss.length} 個排程查不到`); detail.push('查不到的排程: ' + miss.join(', ')); }
  if (timedOut) { parts.push('⚠ 連線逾時'); detail.push(`/api/dock ${FETCH_TIMEOUT_MS / 1000} 秒內沒回應`); }
  if (badData) { parts.push('⚠ 後端資料格式錯誤'); detail.push('/api/dock 回傳格式不對（缺 events／ok_count／fail_count）'); }
  if (data.last_error) { parts.push('⚠ 後端輪詢錯誤'); detail.push('last_error: ' + data.last_error); }
  const H = data.health && typeof data.health === 'object' ? data.health : null; // 缺／壞 health ＝ 沒有警示，不影響其他顯示
  const alerts = H && Array.isArray(H.alerts) ? H.alerts : [];
  if (alerts.includes('sys_ratio') && Number.isFinite(H.sys_ratio)) {
    parts.push(`⚠ 交接部門判不出 ${Math.round(H.sys_ratio * 100)}%`);
    detail.push(`近 ${H.window_days ?? 7} 天交接 ${H.handoff_total} 份，${H.handoff_sys} 份沒有 agent: 行（CLAUDE.md 交接規範第 3 條）`);
  }
  if (alerts.includes('low_handoffs')) {
    parts.push('⚠ 連 5 天交接少於 3 份');
    const days = Array.isArray(H.daily_handoffs) ? H.daily_handoffs : [];
    detail.push(days.map(x => `${String(x.date).slice(5).replace('-', '/')}:${x.count}`).join(' '));
  }
  K.setText(el.warn, parts.join(' · '));
  const tip = detail.join('\n');
  if (el.warn.title !== tip) el.warn.title = tip;
  const r = K.rosterCounts(office.roster);
  K.setText(el.roster, `編制：在崗 ${r.run} · 待命 ${r.std} · 凍結 ${r.frz}`);
  const label = REPLAY ? `${dayMD(REPLAY)} 交件` : '今日交件';
  K.setText(el.kLabel, label);
  K.setText(el.recCounter.querySelector('.k'), REPLAY ? `${dayMD(REPLAY)} 已發布` : '今日已發布');
  K.setText(el.recTitle.querySelector('.s'), `${office.roster.length} 位 AI 員工 · ${REPLAY ? `${dayMD(REPLAY)} 產出重播` : '正在交件'}`);
}

function setStatusEl(node, kind, txt) {
  if (node.dataset.kind === kind && node.dataset.txt === txt) return;
  node.dataset.kind = kind; node.dataset.txt = txt;
  node.textContent = '';
  if (kind === 'live' || kind === 'stale') {
    const dot = document.createElement('span'); dot.className = 'dk-dot' + (kind === 'live' ? '' : ' off'); node.appendChild(dot);
  }
  node.appendChild(document.createTextNode(txt));
}
function renderStatus() {
  const s = K.statusOf(data && data.polled_at, Date.now(), REPLAY, connLost);
  let txt;
  if (s.kind === 'replay') txt = K.replayLabel(REPLAY, replayMeta.compressed, replayMeta.backfill, replayMeta.empty);
  else if (s.kind === 'live') txt = `即時 · 資料 ${s.mins} 分鐘前`;
  else txt = s.since ? `資料停在 ${fmtTime(s.since)}` : '資料尚未更新';
  setStatusEl(el.kst, s.kind === 'replay' ? 'none' : s.kind, s.kind === 'replay' ? '' : txt);
  setStatusEl(el.status, s.kind, txt);
  el.status.classList.toggle('show', !(REPLAY && lineClaimed) && (!!REC_W || s.kind === 'replay'));
  el.status.classList.toggle('replay', s.kind === 'replay');
}

function renderList() {
  if (!data || !el.list.classList.contains('show')) return;
  el.replayLink.href = `?replay=${data.date}&speed=60`;
  const top = el.list.scrollTop, before = el.list.scrollHeight;
  K.syncList(el.rows, data.events, e => e.id, e => {
    const r = document.createElement('div'); r.className = 'dk-row';
    const t = document.createElement('span'); t.className = 'dk-mono'; t.textContent = `${e.dept || 'SYS'} ${fmtTime(e.ts)}`;
    const p = document.createElement('span'); p.className = 'dk-path dk-mono'; p.textContent = e.ok ? (e.path || e.name) : K.cardLabel(e, false);
    r.append(t, p);
    if (e.path) {
      const b = document.createElement('button'); b.textContent = '複製路徑';
      b.addEventListener('click', () => {
        const done = ok => { K.setText(b, ok ? '已複製' : '複製失敗'); setTimeout(() => K.setText(b, '複製路徑'), 1500); };
        if (!navigator.clipboard) { done(false); return; }
        navigator.clipboard.writeText(e.path).then(() => done(true), () => done(false));
      });
      r.appendChild(b);
    }
    return r;
  }, (r, e) => { if (!e.ok) K.setText(r.querySelector('.dk-path'), K.cardLabel(e, false)); });
  if (top > 0) el.list.scrollTop = top + (el.list.scrollHeight - before); // 新項目插在頂端時補償捲動，不跳（SPEC §8 第 4 條）
}

function showAll() {
  const R = document.documentElement.style;
  if (!REC_W) {
    if (!el.kpi.classList.contains('show')) el.kpi.classList.add('show');
    R.setProperty('--kpi-h', KPI_H + 'px'); R.setProperty('--dock-h', DOCK_H + 'px');
  }
  if (!el.dock.classList.contains('show')) el.dock.classList.add('show');
}
function hideAll() {
  const R = document.documentElement.style;
  el.kpi.classList.remove('show'); el.dock.classList.remove('show'); el.status.classList.remove('show'); el.list.classList.remove('show');
  R.setProperty('--kpi-h', '0px'); R.setProperty('--dock-h', '0px');
}

async function fetchDock(date) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(API_BASE + '/api/dock' + (date ? `?date=${date}` : ''), { signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let j;
    try { j = await r.json(); } catch { throw new Error('回應不是合法 JSON'); }
    return window.DEMO_MODE?.on ? window.DEMO_MODE.filterDock(j) : j; // 展示模式：濾掉黑名單卡（SPEC-demo-mode-v1）
  } catch (err) {
    throw ac.signal.aborted ? new Error(`逾時 ${FETCH_TIMEOUT_MS / 1000} 秒`) : err;
  } finally { clearTimeout(to); }
}
async function poll() {
  if (polling) return; // 上一輪還沒回來：不疊加
  polling = true;
  try {
    let d;
    try { d = await fetchDock(); } catch (err) {
      warnOnce('讀取 /api/dock 失敗：' + err.message);
      timedOut = err.message.startsWith('逾時');
      if (!everConnected) { hideAll(); return; } // 從沒連上：整層不出現（:3700 後端沒起）
      connLost = true; badData = false; renderStatus(); renderCounts(); // 連過但斷了／逾時：保留畫面，狀態立刻轉過期
      return;
    }
    if (!validDock(d)) {
      warnOnce('/api/dock 回傳格式不對');
      if (!everConnected) { hideAll(); return; }
      connLost = true; badData = true; renderStatus(); renderCounts();
      return;
    }
    badData = false; timedOut = false; everConnected = true; connLost = false; lastWarn = '';
    showAll();
    render(d);
  } finally { polling = false; }
}

async function runReplay() {
  let snap;
  try {
    snap = await fetchDock(REPLAY);
    if (!snap || !Array.isArray(snap.events)) throw new Error('資料格式錯誤');
  } catch (err) {
    warnOnce('重播載入失敗：' + err.message);
    everConnected = true; showAll();
    K.setText(el.kLabel, `${dayMD(REPLAY)} 交件`); K.setText(el.recCounter.querySelector('.k'), `${dayMD(REPLAY)} 已發布`);
    K.setText(el.cnt, '---'); K.setText(el.recCounter.querySelector('.v'), '---');
    setStatusEl(el.status, 'replay', `⟲ 重播載入失敗：${err.message}`);
    el.status.classList.add('show', 'replay');
    return;
  }
  everConnected = true;
  replayMeta.backfill = !!snap.backfill;
  replayMeta.empty = snap.events.length === 0;
  const asc = snap.events.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const { steps, compressed } = K.replaySchedule(asc, SPEED);
  replayMeta.compressed = compressed;
  showAll();
  const soFar = [];
  let next = 0; // asc 裡下一個還沒上月台的事件
  const renderSoFar = () => render({ date: REPLAY, ok_count: soFar.filter(e => e.ok).length, fail_count: soFar.filter(e => !e.ok).length,
                                     events: soFar.slice(), polled_at: null });
  // 跟產線時鐘：一開始就註冊（A5），產線什麼時候宣告接管都接得住
  addEventListener('line:replay-time', ev => {
    if (!lineClaimed) return;
    const real = ev.detail.realMs;
    let changed = false;
    if (!lineFollowing) { // 交棒：自己排程已放上去、但比產線時鐘晚的事件先收回
      lineFollowing = true; changed = true;
      while (next > 0 && Date.parse(asc[next - 1].ts) > real) { soFar.shift(); next--; }
    }
    while (next < asc.length && Date.parse(asc[next].ts) <= real) { soFar.unshift(asc[next]); next++; changed = true; }
    replayNow = real;
    if (changed) renderSoFar();
  });
  render({ date: REPLAY, ok_count: 0, fail_count: 0, events: [], polled_at: null });
  // 給產線 3 秒宣告接管時鐘；產線可能比月台晚載入，所以先等 300ms：那時既沒宣告、也沒有 ▤ 產線鈕＝產線沒載入，不必空等
  await new Promise(r => setTimeout(r, 300));
  if (lineClaimed || document.getElementById('bLine')) await new Promise(r => setTimeout(r, 2700));
  for (const st of steps) { // 產線沒來：月台自己排程；每一步都看產線是不是接管了
    if (lineClaimed) return;
    await new Promise(r => setTimeout(r, st.delay));
    if (lineClaimed) return; // 產線接管：soFar 交給上面的跟隨模式，自己的排程停
    if (st.e !== asc[next]) continue;
    replayNow = Date.parse(st.e.ts);
    soFar.unshift(st.e); next++;
    renderSoFar();
  }
}

function setupRec() {
  if (!REC_W) return;
  const R = document.documentElement.style;
  R.setProperty('--rec-w', REC_W + 'px'); R.setProperty('--rec-h', Math.round(REC_W * 9 / 16) + 'px'); R.setProperty('--hud-s', String(HUD_S));
  document.body.classList.add('dk-rec');
  office.controls.autoRotate = false;
  office.camGo(new office.THREE.Vector3(0, 0, -2), new office.THREE.Vector3(32.3, 35.7, 34)); // 固定機位：等角、往中段拉近約 15%
}

export async function initDockOverlay(officeApi) {
  office = officeApi;
  injectStyles();
  buildDom();
  setupRec();
  syncDeptVars();
  // applyTheme() 會整個覆寫 body.className → 補回 dk-rec，並重算部門色
  new MutationObserver(() => {
    if (REC_W && !document.body.classList.contains('dk-rec')) document.body.classList.add('dk-rec');
    syncDeptVars();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  try { const m = await import('./dock-3d.js'); fx = m.initDock3D(office); } catch { /* 沒有動畫層：卡片直接淡入 */ }
  addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (el.list.classList.contains('show')) { setList(false); return; } // 先關清單
    if (REC_W) { const u = new URL(location.href); u.searchParams.delete('rec'); location.href = u.toString(); }
  });
  let resizeQueued = false; // 合併連續 resize；rAF 停擺時用 setTimeout 後備
  const doResize = () => { if (!resizeQueued) return; resizeQueued = false; if (data) render(data); };
  addEventListener('resize', () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(doResize); setTimeout(doResize, 100); });
  if (Q.get('linetest') === '1') { // line-selftest：月台不輪詢，固定一份空快照，量測才決定論
    everConnected = true; showAll(); render({ date: todayStr(), ok_count: 0, fail_count: 0, events: [], polled_at: null });
    return;
  }
  if (REPLAY) { runReplay(); return; }
  await poll();
  setInterval(poll, POLL_MS);
  setInterval(() => { if (data) renderStatus(); }, 30000); // 「n 分鐘前」與過期判定不必等下一筆資料
}
