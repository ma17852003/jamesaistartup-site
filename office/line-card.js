/* ============================================================
 * 自動發文產線 overlay（command-center\SPEC-production-line-v1.md §4）
 * 資料源：GET /api/line（7860 同源；:3700 跨端口）。從沒連上過 → 廠房照蓋、但不畫工單，鈕顯示「產線離線」。
 * ?linetest=1 → 不輪詢、不自動重播，把 3D 物件掛到 window.__line3d、卡片／重播控制掛到 window.__lineCard 給 line-selftest.html。
 * ?linecam=1  → 載入後自動 focus()（Task 12 驗收用，Task 7/8 先加）。
 * ?replay=YYYY-MM-DD → 重播那天（Task 10）：事件密度分配時間，250ms setTimeout 鏈；月台跟產線同一個時鐘（line:replay-claim／line:replay-time）。
 * &date=YYYY-MM-DD → 監看改拉 /api/line?date=（驗收／截圖用，不是重播；REC 或 ?replay= 時忽略）。
 * &card=2-3   → 第一次拿到資料後自動開 L2 ③ 的卡片（驗收／截圖用；REC 時忽略）。
 * ?rec=1920|1280 → REC（Task 11，SPEC §4.5）：鏡頭 REC_CAM（蓋過月台自己的 REC 機位）、只拍 L2（&lines=both 才兩線）、
 *   快照先過 L.recSnap（未發布工單的字一律「未發布草稿」）、不開一般卡片；重播時片頭 3 秒標題、⑤ 評分完成自動開 4 秒精簡卡；
 *   被 HUD／產線字蓋到的辦公室字先藏（cullOffice）。月台沒載入也照樣運作。
 * ============================================================ */
import * as L from './line-core.js';

export const API_BASE = (location.port === '3700') ? 'http://127.0.0.1:7860' : '';
const POLL_MS = 60000, FETCH_TIMEOUT_MS = 5000, TICK_MS = 100, REPLAY_STEP_MS = 250;
const Q = new URLSearchParams(location.search);
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const REC_W = [1280, 1920].includes(+Q.get('rec')) ? +Q.get('rec') : 0; // 跟月台同一份白名單
const REC = !!REC_W, BOTH = Q.get('lines') === 'both';
const REPLAY_DAY = isDay(Q.get('replay')) ? Q.get('replay') : null;
const DATE = !REC && !REPLAY_DAY && isDay(Q.get('date')) ? Q.get('date') : null; // REC／重播時忽略 &date=
const TEST = Q.get('linetest') === '1';
let office = null, scene3d = null, polling = false, everOk = false, lastWarnings = [], recCam = null;

export async function initLine(officeApi) {
  office = officeApi;
  injectCardCss();
  if (REC) { const R = document.documentElement; R.classList.add('line-rec'); R.style.setProperty('--line-s', String(REC_W / 1920)); }
  const m = await import('./line-3d.js');
  scene3d = m.initLine3D(office, { onPick, now: () => (RP ? RP.realMs : Date.now()), hideL1Text: REC && !BOTH });
  recCam = m.REC_CAM;
  addCamButton();
  // capture：比月台的 Esc（關清單）先跑，才看得到清單是不是開著
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !openCard) return;
    if (document.getElementById('dk-list')?.classList.contains('show')) return; // 讓月台先關清單，卡片留著
    closeCard();
  }, true);
  addEventListener('resize', () => { placeKpi(); placeCard(); placeReplayBar(); placeCompact(true); recCull(); });
  setInterval(() => { scene3d.tick(); syncCardTheme(); placeKpi(); placeCard(); placeReplayBar(); recCull(); }, TICK_MS); // office 沒有每幀 hook：只比對主題與鏡頭距離＋背景分頁動畫後備，不畫圖
  syncCardTheme();
  addEventListener('pagehide', stopReplay);
  if (REC) { ensureRecCam(0); office.scene.onBeforeRender = () => recCull(true); } // office 沒用這個 hook（REC 專用）
  if (TEST) {
    window.__line3d = scene3d;
    window.__lineCard = { feed: snap => { const v = view(snap); scene3d.update(v); renderWarn(snap.warnings); renderKpi(snap); onSnap(v); }, open: () => openCard,
      replayStart: (snap, day, nowMs) => startReplay(snap, day, nowMs, false), replayAt: t => replayAt(t),
      replayTotal: () => (RP ? RP.total : 0), replayPlanNow: () => (RP ? RP.plan : null),
      replayPlay: () => { RP.last = performance.now(); loop(); }, replayRunning: () => !!(RP && RP.timer) };
    return;
  }
  if (REPLAY_DAY) { await loadReplay(REPLAY_DAY); return; }
  if (Q.get('linecam') === '1' && !REC) { console.info('line: ?linecam=1 → 自動進產線鏡頭'); scene3d.focus(); }
  await poll();
  setInterval(poll, POLL_MS);
}

function addCamButton() {
  const bar = document.querySelector('.bar #bRot')?.parentElement;
  if (!bar || document.getElementById('bLine')) return;
  const b = document.createElement('button');
  b.className = 'btn view'; b.id = 'bLine'; b.textContent = '▤ 產線';
  b.onclick = () => scene3d.focus(REC);
  bar.insertBefore(b, document.getElementById('bRot'));
  const rb = document.createElement('button'); // 只在產線鏡頭顯示（html.line-cam，line-3d 切換）
  rb.className = 'btn'; rb.id = 'bLineReplay'; rb.textContent = '⟲ 重播這天';
  rb.onclick = () => {
    const u = new URL(location.href);
    u.searchParams.set('replay', REPLAY_DAY || DATE || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)); // 台灣日期
    u.searchParams.delete('date');
    location.href = u.toString();
  };
  bar.insertBefore(rb, document.getElementById('bRot'));
  const w = document.createElement('span');
  w.className = 'dk-warn'; w.id = 'lineWarn';
  w.style.cssText = 'color:var(--orange);font-size:12px;align-self:center;white-space:nowrap';
  bar.insertBefore(w, document.getElementById('bRot'));
}

const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const setTitle = (el, t) => { if (el && el.title !== t) el.title = t; };

/** fetch＋讀 body 共用一個逾時 */
async function fetchLine(day) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/api/line${day ? '?date=' + day : ''}`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { throw ctl.signal.aborted ? new Error(`逾時 ${FETCH_TIMEOUT_MS / 1000} 秒`) : e; }
  finally { clearTimeout(timer); }
}

async function poll() {
  if (polling) return; polling = true;
  try {
    const snap = await fetchLine(DATE);
    everOk = true;
    setText(document.getElementById('bLine'), '▤ 產線');
    const v = view(snap);
    scene3d.update(v);
    renderWarn(snap.warnings);
    renderKpi(snap);
    onSnap(v);
  } catch (e) { console.warn('line poll', e); renderOffline(); }
  finally { polling = false; }
}

/** REC：畫面只吃遮罩過的快照（L-T4；判定點＝拿到資料當下這張工單有沒有已發布平台） */
const view = snap => (REC ? L.recSnap(snap) : snap);

/**
 * REC 機位：月台 setupRec 也會 camGo 到它自己的等角機位（兩邊載入順序不固定）。產線每秒看一次，
 * 不在 REC_CAM、月台／使用者沒在動鏡頭、自己也沒在補間 → 再 focus(true) 一次；最多看 8 次（8 秒）就停，停時還沒到位要說。
 * 產線沒載入 → 這段不存在，月台自己的 REC 機位照舊。
 */
const REC_CAM_CHECKS = 8, REC_CAM_EVERY_MS = 1000, REC_CAM_EPS = .05;
function atRecCam() {
  const p = office.camera.position, g = office.controls.target, c = recCam;
  return office.lineCamActive && Math.hypot(p.x - c.pos[0], p.y - c.pos[1], p.z - c.pos[2]) < REC_CAM_EPS
    && Math.hypot(g.x - c.target[0], g.y - c.target[1], g.z - c.target[2]) < REC_CAM_EPS;
}
function ensureRecCam(n) {
  const ok = atRecCam();
  if (!ok && !office.isUserBusy() && !scene3d.focusing()) scene3d.focus(true);
  if (n + 1 < REC_CAM_CHECKS) setTimeout(() => ensureRecCam(n + 1), REC_CAM_EVERY_MS);
  else if (!ok) { console.warn('line: REC 鏡頭 8 秒內沒停在 REC_CAM（月台或使用者一直在動鏡頭）'); showRecCamNote(); }
}
/** REC 鏡頭沒停好：安全框內放一個看得到的角落提示（錄出來的畫面構圖不對，不能只寫 console） */
function showRecCamNote() {
  if (document.getElementById('line-recwarn')) return;
  const el = mk(document, 'div', '', '⚠︎ 錄影機位未就緒'); el.id = 'line-recwarn';
  document.body.appendChild(el);
  const r = el.getBoundingClientRect(), w = Math.ceil(r.width), h = Math.ceil(r.height), B = safe();
  setPos(el, recSpot(w, h, scanCands(w, h, [[B.r - w, B.b - h]], [B.r - w, B.l]), el) || [B.r - w, B.b - h]);
}

/** #lineWarn 文字：&date= 時先標資料日（不是即時畫面），再接後台 warnings 數 */
export function warnText(warnings, date) {
  const n = (warnings || []).length;
  return [date ? `資料日 ${L.md(date)}（非即時）` : '', n ? `⚠︎ 產線資料 ${n} 項` : ''].filter(Boolean).join(' · ');
}
function renderWarn(warnings) {
  lastWarnings = warnings || [];
  const el = document.getElementById('lineWarn');
  setText(el, warnText(lastWarnings, DATE));
  setTitle(el, lastWarnings.join('\n'));
  if (kpiEl) { setText(kpiEl.querySelector('.lk-w'), warnText(lastWarnings, DATE)); setTitle(kpiEl, lastWarnings.join('\n')); }
}

function renderOffline() {
  if (!everOk) { setText(document.getElementById('bLine'), '▤ 產線（離線）'); return; }
  const el = document.getElementById('lineWarn'); // 成功過：保留上一份畫面
  const t = [DATE ? `資料日 ${L.md(DATE)}（非即時）` : '', '⚠︎ 連線中斷'].filter(Boolean).join(' · ');
  setText(el, t); setTitle(el, '');
  if (kpiEl) setText(kpiEl.querySelector('.lk-w'), t);
}

/* ── KPI 產線段（SPEC §4.1；提案 §6「產線：今日 1 單 · 已排程 1 · 已發布 0」）＋產線警告 ──
 * 1280 時 .bar（▤ 產線鈕那排）被月台 KPI 條蓋住、KPI 條本身也沒空位 → 產線自己的一小塊，浮在 HUD 下方第一個不壓字的空位。
 * 只在產線鏡頭顯示（html.line-cam）、監看模式才有（重播有重播條、REC 有計數器）；拿到資料才建；值沒變零 DOM。 */
let kpiEl = null;
const KPI_POS = { pkey: '', pAt: 0 };
function renderKpi(snap) {
  if (REC || RP) return;
  if (!kpiEl) {
    kpiEl = mk(document, 'div'); kpiEl.id = 'line-kpi';
    kpiEl.append(mk(document, 'span', 'lk-k', ''), mk(document, 'span', 'lk-w', warnText(lastWarnings, DATE)));
    document.body.appendChild(kpiEl);
  }
  setText(kpiEl.querySelector('.lk-k'), L.kpiText(snap, DATE ? L.md(DATE) : '今日'));
  placeKpi();
}
function placeKpi() { if (kpiEl) placeFloat(kpiEl, KPI_POS, 'KPI 產線段'); }

/* ── 卡片控制：點選、自動刷新（資料沒變零 DOM）、定位（不壓 HUD）── */
let lastSnap = null, openCard = null, cardFlagDone = false, placed = '';

function onSnap(snap) {
  lastSnap = snap;
  if (!cardFlagDone) {
    cardFlagDone = true;
    const m = /^([12])-([1-7])$/.exec(Q.get('card') || '');
    if (m && !REC) { console.info('line: &card= → 自動開卡片', m[0]); showCard(+m[1], +m[2], null, true); return; }
  }
  if (openCard) showCard(openCard.lineNo, openCard.stationNo, openCard.draftId, false);
}

function onPick(lineNo, stationNo) {
  if (REC) return; // REC 只有一種卡：⑤ 完成自動開的精簡卡（提案 §6.2）
  if (!lineNo) { if (openCard) closeCard(); return; } // 點到廠房以外／空地：關卡片
  if (openCard && openCard.lineNo === lineNo && openCard.stationNo === stationNo) { closeCard(); return; }
  if (openCard) closeCard();
  showCard(lineNo, stationNo, null, true);
}

/** 找工單：指定 draftId（刷新時沿用）→ 目前位於這站的 → 該線最新一張（draft_id 最大） */
function resolve(snap, lineNo, stationNo, draftId) {
  const line = (snap.lines || []).find(l => l.brand_id === lineNo);
  if (!line) return null;
  if (line.state !== 'active') return { line, order: null, station: { no: stationNo } };
  const newest = list => list.reduce((m, o) => (!m || o.draft_id > m.draft_id ? o : m), null);
  let order = draftId != null ? line.orders.find(o => o.draft_id === draftId) : null;
  if (!order) order = newest(line.orders.filter(o => L.currentStation(o) === stationNo)) || newest(line.orders);
  return { line, order, station: order ? order.stations[stationNo - 1] : { no: stationNo } };
}

/** ② 展開鈕：掛上畫面後才量得到溢出；沒溢出就拿掉遮罩與鈕 */
function fitMore(el) {
  const txt = el.querySelector('.lc-text.clamp'), more = el.querySelector('.lc-more');
  if (!txt || !more) return;
  if (txt.classList.contains('open') || txt.scrollHeight > txt.clientHeight + 1) more.hidden = false;
  else { txt.classList.remove('clamp'); more.remove(); }
}
const dropImgs = el => el.querySelectorAll('img').forEach(i => i.removeAttribute('src')); // 停掉還在載的圖

function showCard(lineNo, stationNo, draftId, fresh) {
  if (!lastSnap) return;
  const r = resolve(lastSnap, lineNo, stationNo, draftId);
  if (!r) { if (openCard) closeCard(); return; }
  const { line, order, station } = r;
  const key = JSON.stringify([line.brand_id, line.name, line.state, line.reason, order && [order.draft_id, order.type, order.title, order.published], station, REC]);
  if (!fresh && openCard && openCard.key === key) return; // 資料沒變：一個 DOM 都不碰
  const el = buildCard(document, line, order, station, { rec: REC, apiBase: API_BASE, roster: office.roster, generatedAt: lastSnap.generated_at });
  el.querySelector('.lc-x').addEventListener('click', closeCard);
  let keepTop = 0;
  if (openCard && !fresh) {
    const prev = openCard.el;
    keepTop = prev.querySelector('.lc-body').scrollTop;
    if (prev.querySelector('.lc-text.open')) el.querySelector('.lc-more')?.click();
    dropImgs(prev);
    prev.replaceWith(el);
  } else {
    el.classList.add('lc-in');
    document.getElementById('info')?.classList.remove('show'); // 跟 .info 互斥
    document.body.appendChild(el);
  }
  openCard = { lineNo, stationNo, draftId: order ? order.draft_id : null, key, el };
  placed = ''; placeCard(); // 先定高度，捲動位置才還原得回去
  fitMore(el);
  if (keepTop) el.querySelector('.lc-body').scrollTop = keepTop;
}

function closeCard() {
  if (!openCard) return;
  dropImgs(openCard.el);
  openCard.el.remove(); openCard = null; placed = '';
}

const hudRect = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
const hudTop = () => { const bar = hudRect('.bar'), kpi = hudRect('#dk-kpi'); return Math.ceil(Math.max(bar ? bar.bottom : 0, kpi ? kpi.bottom : 0)) + HUD_GAP; };

/** 依 .bar／#dk-kpi／#dk-dock 的實際位置算上下界；值沒變就不寫 style */
function placeCard() {
  if (!openCard) return;
  const dock = hudRect('#dk-dock');
  const colL = innerWidth - 12 - Math.min(CARD_W, innerWidth - 24);
  let top = hudTop();
  for (const e of [RP && RP.el, kpiEl]) { // A6：不壓重播條；也不壓 KPI 產線段
    const b = e && e.isConnected ? e.getBoundingClientRect() : null;
    if (b && b.height && b.right > colL && b.top < top + 200) top = Math.max(top, Math.ceil(b.bottom) + HUD_GAP);
  }
  const bottom = (dock ? Math.floor(dock.top) : innerHeight) - HUD_GAP;
  const k = `${top}|${bottom}`;
  if (k === placed) return;
  placed = k;
  openCard.el.style.top = top + 'px';
  openCard.el.style.maxHeight = Math.max(120, bottom - top) + 'px';
}

/* ============================================================
 * Task 10：重播（L-T7；提案 §7）
 * ============================================================ */
const SHOW_OUT = new Set(['done', 'skipped', 'rejected', 'failed', 'scheduled']); // 這些狀態才顯示產出（倒回後處理中／閒置的站不露）
const after = (iso, ms) => !!iso && Date.parse(iso) > ms;

/**
 * 播放到第 t 秒的快照：深拷貝後把「晚於真實時刻」的進度倒回去。只倒回，不發明數值（耗時、分數原值保留，卡片依狀態不顯示）。
 * 站：finished_at > real → started_at ≤ real 就 running，否則 idle；未來的時間欄清成 null。
 * 工單最早時間晚於 real → 整張拿掉（還沒建立）。
 * ⑥：平台 slot > real 的 published／error／awaiting_settle → scheduled（等待含 awaiting_settle）；站狀態照後台規則重算（有失敗→failed、有排程→scheduled 下一個時間）；⑤ 沒完成 → ⑥ idle。
 * ⑦：週報日期（as_of，當天 00:00）晚於真實時刻 → idle。
 */
export function replayFrame(plan, snap, t) {
  const realMs = L.realAt(plan, t);
  const snapAt = JSON.parse(JSON.stringify(snap));
  for (const ln of snapAt.lines || []) {
    ln.orders = (ln.orders || []).filter(o => !(firstTs(o) > realMs)); // A3：還沒建立的工單整張拿掉（沒有任何時間的保留）
    for (const o of ln.orders) rewindOrder(o, realMs);
  }
  let acc = 0, segment = plan.segments.at(-1);
  for (const s of plan.segments) { if (t <= acc + s.dur) { segment = s; break; } acc += s.dur; }
  if (!Number.isFinite(t) || t < 0) segment = plan.segments[0];
  return { realMs, snapAt, segment };
}
/** 工單最早的時間（各站 started_at／finished_at、各平台 slot）；一個都沒有 → null（保留這張） */
function firstTs(o) {
  const ts = [];
  for (const s of o.stations) {
    for (const k of ['started_at', 'finished_at']) if (s[k]) ts.push(Date.parse(s[k]));
    for (const p of (s.output && Array.isArray(s.output.platforms) ? s.output.platforms : [])) if (p.slot) ts.push(Date.parse(p.slot));
  }
  const ok = ts.filter(Number.isFinite);
  return ok.length ? Math.min(...ok) : null;
}
const UNSETTLED = new Set(['published', 'error', 'awaiting_settle']); // 排定時間還沒到就不可能有結果 → 倒回排程
const WAITING = new Set(['scheduled', 'awaiting_settle']);
function rewindOrder(o, real) {
  for (const s of o.stations) {
    if (s.no === 7) continue;
    if (after(s.finished_at, real)) {
      s.state = s.started_at && !after(s.started_at, real) ? 'running' : 'idle';
      s.finished_at = null;
      if (after(s.started_at, real)) s.started_at = null;
    } else if (after(s.started_at, real)) { s.state = 'idle'; s.started_at = null; }
  }
  const s5 = o.stations[4], s6 = o.stations[5], s7 = o.stations[6];
  const ps = s6.output && Array.isArray(s6.output.platforms) ? s6.output.platforms : null;
  if (ps) {
    for (const p of ps) if (UNSETTLED.has(p.state) && after(p.slot, real)) p.state = 'scheduled'; // slot≤real 未對帳的照舊（A2）
    const done5 = s5.state === 'done';
    if (!done5) s6.state = 'idle';
    else if (ps.some(p => p.state === 'error')) s6.state = 'failed'; // 原因沿用後台原文
    else {
      const waiting = ps.filter(p => WAITING.has(p.state)).sort((a, b) => Date.parse(a.slot) - Date.parse(b.slot));
      if (waiting.length) { s6.state = 'scheduled'; s6.reason = L.hm(waiting[0].slot); }
    }
    const pub = ps.filter(p => p.state === 'published');
    o.published = pub.length > 0;
    if (o.platforms) o.platforms.done = pub.length;
    if (!o.published) o.first_published_at = null;
  }
  if (s7 && s7.output && s7.output.as_of && Date.parse(`${s7.output.as_of}T00:00:00+08:00`) > real) s7.state = 'idle';
}

const DAY_FROM = '08:00:00', DAY_TO = '23:55:00';
/** 時間尺：08:00～23:55 映射到 0～1（超出夾住） */
export function rulerFrac(day, ms) {
  const a = Date.parse(`${day}T${DAY_FROM}+08:00`), b = Date.parse(`${day}T${DAY_TO}+08:00`);
  return Math.min(1, Math.max(0, (ms - a) / (b - a)));
}
const clockOf = ms => new Date(ms + 8 * 3600000).toISOString().slice(11, 19); // realMs 本來就由 +08:00 字串解析，換回台灣時刻
/** 重播條三段文字：badge／真實時刻／附註（跳過卡、預先完成、片尾、事件過多） */
export function replayBarText(day, plan, frame, t) {
  const total = plan.segments.reduce((a, s) => a + s.dur, 0);
  const notes = [];
  if (plan.overBudget) notes.push('事件過多 · 已壓到最短');
  const seg = frame.segment;
  if (seg && seg.label) notes.push(seg.label);
  else if (t >= total && plan.unfinished) notes.push('今天還沒結束');
  const flagged = (frame.snapAt.lines || []).some(ln => (ln.orders || []).some(o => (o.stations?.[5]?.output?.platforms || []).some(L.flagUp)));
  if (flagged) notes.push('升旗時間為排定時間'); // 重播在排定時間升旗（Postiz 沒回實際發文時間，SPEC §2.4）
  return { badge: L.replayBadge(day), clock: clockOf(frame.realMs), note: notes.join(' · ') };
}

let RP = null; // { day, snap, plan, total, t, realMs, timer, el }

async function loadReplay(day) {
  buildReplayBar(day);
  try {
    const snap = await fetchLine(day);
    renderWarn(snap.warnings);
    everOk = true;
    startReplay(snap, day, Date.now(), true);
  } catch (e) {
    console.warn('line replay', e);
    setText(RP.el.querySelector('.lr-note'), `⟲ 重播載入失敗：${e.message}，重新整理再試`); // 不宣告接管 → 月台照舊自己排程
  }
}

function startReplay(snap, day, nowMs, autoplay) {
  stopReplay();
  if (kpiEl) { kpiEl.remove(); kpiEl = null; }
  snap = view(snap); // REC：整段重播都用「錄影當下」的遮罩判定（10/28 #220 晚上才發布，早上那幾格照樣露標題）
  const plan = L.replayPlan(snap.replay || [], day, nowMs);
  if (!RP || RP.day !== day) buildReplayBar(day);
  Object.assign(RP, { snap, plan, total: plan.segments.reduce((a, s) => a + s.dur, 0), t: 0, realMs: L.realAt(plan, 0), timer: null, segIdx: -1 });
  drawRuler();
  window.dispatchEvent(new CustomEvent('line:replay-claim'));
  scene3d.focus(REC);
  RP.last = performance.now();
  if (autoplay) loop(); else setText(RP.el.querySelector('.lr-clock'), clockOf(RP.realMs)); // linetest：不自動播，等 replayAt／replayPlay
}
function loop() {
  RP.timer = null;
  try {
    const now = performance.now();
    RP.t = Math.min(RP.total, RP.t + Math.min(1, Math.max(0, (now - RP.last) / 1000))); // 用真實經過時間推進（上限 1 秒），計時器延遲不會拉長重播
    RP.last = now;
    replayAt(RP.t);
  } catch (e) { // B1：不准靜默失敗
    console.error('line replay', e);
    stopReplay();
    setText(RP.el.querySelector('.lr-note'), `⟲ 重播中斷：${e.message}`);
    return;
  }
  if (RP.t >= RP.total) return; // 播完停在最後一格
  RP.timer = setTimeout(loop, REPLAY_STEP_MS); // setTimeout 鏈：背景分頁也會走
}
function stopReplay() { if (RP && RP.timer) { clearTimeout(RP.timer); RP.timer = null; } }

function replayAt(t) {
  const f = replayFrame(RP.plan, RP.snap, t);
  RP.realMs = f.realMs;
  scene3d.update(f.snapAt, f.realMs);
  onSnap(f.snapAt);
  renderBar(f, t);
  if (REC) { recFrame(f, t); recCull(); }
  window.dispatchEvent(new CustomEvent('line:replay-time', { detail: { realMs: f.realMs } }));
  return f;
}

/* ── REC：片頭（intro 段 3 秒）＋⑤ 評分完成的 4 秒精簡卡 ── */
const COMPACT_S = 4; // 重播秒（重播用真實經過時間推進，播放時＝真實 4 秒；逐格測試也決定論）
let compact = null; // { el, t0, placed }
function recFrame(f, t) {
  if (compact && (t < compact.t0 || t - compact.t0 >= COMPACT_S)) closeCompact();
  const seg = f.segment;
  showIntro(!!seg && seg.kind === 'intro');
  const idx = RP.plan.segments.indexOf(seg);
  if (idx === RP.segIdx) return;
  RP.segIdx = idx; // 一進入「含 ⑤ finish 的事件段」開一次（倒回去再進來會再開）
  const e5 = seg && seg.kind === 'event' ? seg.events.find(e => e.station === 5 && e.kind === 'finish') : null;
  if (e5) openCompact(e5.draft_id, t);
}
function showIntro(on) {
  let el = document.getElementById('line-intro');
  if (on && !el) {
    el = mk(document, 'div'); el.id = 'line-intro';
    const box = mk(document, 'div', 'li-box');
    box.append(mk(document, 'div', 'li-h', 'AI造王者公司'), mk(document, 'div', 'li-s', 'FOMO 產線 · 真實紀錄'));
    el.appendChild(box); document.body.appendChild(el);
  }
  const R = document.documentElement;
  if (R.classList.contains('line-intro') !== on) { R.classList.toggle('line-intro', on); placeReplayBar(); recCull(); }
}
/** 卡片資料取「錄影當下」的完整快照（已遮罩）：published 依現在判定，⑤ 在這一格已完成，站資料跟倒回的那格相同 */
function openCompact(did, t) {
  closeCompact();
  const line = (RP.snap.lines || []).find(l => (l.orders || []).some(o => o.draft_id === did));
  const order = line && line.orders.find(o => o.draft_id === did);
  if (!order) return;
  const el = buildCard(document, line, order, order.stations[4], { rec: true, compact: true, roster: office.roster });
  el.classList.add('lc-in');
  document.body.appendChild(el);
  compact = { el, placed: '', t0: t };
  placeCompact(true);
  recCull();
}
function closeCompact() {
  if (!compact) return;
  compact.el.remove(); compact = null;
  recCull();
}

/* ── REC 擺位：只在安全框（外圍 5% 不放字）內、照候選順序找第一個不壓 HUD、不壓產線字的位置（位置固定、不亂跳）；
 *    蓋到的辦公室字由 recCull 藏起來 ── */
const REC_HUD = ['#dk-rec-title', '#dk-rec-counter', '#dk-dock', '#dk-status', '#line-replay', '.lc-compact', '#line-intro .li-box', '#line-recwarn'];
const elRect = e => {
  if (!e || !e.isConnected || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return null;
  const r = e.getBoundingClientRect(); return r.width && r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null;
};
const recHud = except => REC_HUD.map(q => document.querySelector(q)).filter(e => e && e !== except).map(elRect).filter(Boolean);
const safe = () => ({ l: Math.ceil(innerWidth * .05), t: Math.ceil(innerHeight * .05), r: Math.floor(innerWidth * .95), b: Math.floor(innerHeight * .95) });
function recSpot(w, h, cands, except) {
  const B = safe(), avoid = recHud(except).concat(scene3d.textRects().filter(r => r.line));
  const inside = ([x, y]) => x >= B.l && y >= B.t && x + w <= B.r && y + h <= B.b;
  const free = ([x, y]) => !avoid.some(r => L.rectHit(r, { l: x, r: x + w, t: y, b: y + h }));
  return cands.find(c => inside(c) && free(c)) || null;
}
function scanCands(w, h, first, xs) {
  const B = safe(), out = first.slice();
  for (let y = B.b - h; y >= B.t; y -= BAR_STEP) for (const x of xs) out.push([x, y]);
  return out;
}
function placeRecBar() {
  const el = RP.el, r = el.getBoundingClientRect(), w = Math.ceil(r.width), h = Math.ceil(r.height), B = safe();
  const dock = elRect(document.getElementById('dk-dock')), cur = [parseFloat(el.style.left), parseFloat(el.style.top)];
  const first = [];
  if (cur.every(Number.isFinite)) first.push(cur);
  if (dock) first.push([B.l, dock.t - HUD_GAP - h], [B.l, dock.b + HUD_GAP]); // 提案 §6.1：月台正上方
  let pos = recSpot(w, h, scanCands(w, h, first, [B.l, B.r - w]), el);
  if (!pos) { pos = [B.l, B.b - h]; console.warn('line: REC 重播條找不到不壓字的位置'); }
  setPos(el, pos);
}
function placeCompact(force) {
  if (!compact) return;
  const el = compact.el, r = el.getBoundingClientRect(), w = Math.ceil(r.width), h = Math.ceil(r.height), B = safe();
  const k = `${innerWidth}x${innerHeight}|${w}x${h}`;
  if (!force && k === compact.placed) return;
  compact.placed = k;
  const ctr = elRect(document.getElementById('dk-rec-counter')), ttl = elRect(document.getElementById('dk-rec-title'));
  const first = [];
  if (ctr) first.push([B.r - w, ctr.b + HUD_GAP]);
  if (ttl) first.push([B.l, ttl.b + HUD_GAP]);
  const xs = [B.r - w, B.l, Math.round((innerWidth - w) / 2)], cands = first.slice();
  for (let y = B.t; y + h <= B.b; y += BAR_STEP) for (const x of xs) cands.push([x, y]);
  let pos = recSpot(w, h, cands, el);
  if (!pos) { pos = [B.r - w, B.t]; console.warn('line: REC 精簡卡找不到不壓字的位置'); }
  setPos(el, pos);
}
function setPos(el, [x, y]) {
  const left = Math.round(x) + 'px', top = Math.round(y) + 'px';
  if (el.style.left !== left) el.style.left = left;
  if (el.style.top !== top) el.style.top = top;
}
/**
 * 被 HUD 或產線字蓋到的辦公室字先藏（片頭幕開著時整個場景本來就被蓋住，不用算）。
 * 每次 render 前也跑一次（scene.onBeforeRender）：月台的交件泡泡隨時會冒出來，等 100ms tick 會有一兩格先露臉；
 * 每幀那次用 100ms 內的矩形快取，只重算辦公室 sprite。
 */
let cullRects = null, cullAt = 0;
function recCull(useCache) {
  if (!REC || !scene3d || document.documentElement.classList.contains('line-intro')) return;
  const now = performance.now();
  if (!useCache || !cullRects || now - cullAt > TICK_MS) { cullRects = recHud(null).concat(scene3d.textRects().filter(r => r.line)); cullAt = now; }
  scene3d.cullOffice(cullRects);
}

function buildReplayBar(day) {
  document.getElementById('line-replay')?.remove();
  const mk2 = (tag, cls, text) => mk(document, tag, cls, text);
  const el = mk2('div'); el.id = 'line-replay';
  const row = mk2('div', 'lr-row'); row.append(mk2('span', 'lr-badge', L.replayBadge(day)), mk2('span', 'lr-clock', '載入真實紀錄…'));
  const ruler = mk2('div', 'lr-ruler'); ruler.append(mk2('div', 'lr-gap'), mk2('div', 'lr-head'));
  const ticks = mk2('div', 'lr-ticks'); ticks.append(mk2('span', 'lr-tick', DAY_FROM.slice(0, 5)), mk2('span', 'lr-tick', DAY_TO.slice(0, 5)));
  el.append(row, ruler, ticks, mk2('div', 'lr-note', ''));
  document.body.appendChild(el);
  RP = { day, el, plan: null, snap: null, total: 0, t: 0, realMs: Date.now(), timer: null, placed: '', head: '', last: 0, pkey: '', pAt: 0 };
  placeReplayBar();
}
/** 活動段實心（事件段 realStart～realEnd），其餘是底下的虛線 */
function drawRuler() {
  const ruler = RP.el.querySelector('.lr-ruler');
  ruler.querySelectorAll('.lr-seg').forEach(n => n.remove());
  for (const s of RP.plan.segments) {
    if (s.kind !== 'event') continue;
    const a = rulerFrac(RP.day, Date.parse(s.realStart)), b = rulerFrac(RP.day, Date.parse(s.realEnd));
    const seg = mk(document, 'div', 'lr-seg');
    seg.style.left = (a * 100).toFixed(3) + '%'; seg.style.width = `max(3px, ${((b - a) * 100).toFixed(3)}%)`;
    ruler.insertBefore(seg, ruler.querySelector('.lr-head'));
  }
}
function renderBar(f, t) {
  const tx = replayBarText(RP.day, RP.plan, f, t);
  setText(RP.el.querySelector('.lr-clock'), tx.clock);
  setText(RP.el.querySelector('.lr-note'), tx.note);
  placeReplayBar(); // 附註變了條會變大：當下就重找位置，不等 tick
  const left = (rulerFrac(RP.day, f.realMs) * 100).toFixed(2) + '%';
  if (RP.head !== left) { RP.head = left; RP.el.querySelector('.lr-head').style.left = left; }
}
/**
 * 找一個不壓任何可見文字（整個場景的 sprite＋產線站牌）也不壓 HUD 的位置（A6）：先試右上（KPI 正下方，產線鏡頭實測 1920／1280 都是空的），
 * 再試左上，再沿右緣、左緣往下掃；都不行就退回右上並警告。目前位置還空著就不動（免得亂跳）；
 * 鏡頭／視窗／HUD 一變就重算（鏡頭補間中也算，不然轉場時會壓字），都沒變就 2 秒才重算一次（人會走動）。值沒變不寫 style。
 */
const BAR_SCAN_MS = 2000, BAR_STEP = 8;
function placeReplayBar() {
  if (!RP) return;
  if (REC) {
    const r = RP.el.getBoundingClientRect(), dock = elRect(document.getElementById('dk-dock'));
    const k = `${innerWidth}x${innerHeight}|${Math.ceil(r.width)}x${Math.ceil(r.height)}|${dock ? dock.t : ''}|${office.lineCamActive}|${document.documentElement.classList.contains('line-intro')}`;
    if (k === RP.pkey && performance.now() - RP.pAt < BAR_SCAN_MS) return;
    RP.pkey = k; RP.pAt = performance.now();
    placeRecBar();
    return;
  }
  placeFloat(RP.el, RP, '重播條');
}
/** 監看／重播（非 REC）的浮動條：HUD 下方第一個不壓任何可見文字的位置；st 存 pkey／pAt（2 秒才重掃）。看不見（display:none）就不算 */
function placeFloat(el, st, name) {
  const w = el.offsetWidth, h = el.offsetHeight; // 附註換行會讓條變高：尺寸也進 key
  if (!w || !h) return;
  const c = office.camera.position, g = office.controls.target, dock = hudRect('#dk-dock'), top = hudTop();
  const bottom = (dock ? Math.floor(dock.top) : innerHeight) - HUD_GAP;
  const key = [c.x, c.y, c.z, g.x, g.y, g.z].map(v => v.toFixed(2)).join() + `|${innerWidth}x${innerHeight}|${top}|${bottom}|${w}x${h}`;
  const now = performance.now();
  if (key === st.pkey && now - st.pAt < BAR_SCAN_MS) return;
  st.pkey = key; st.pAt = now;
  const texts = scene3d.textRects ? scene3d.textRects() : [];
  const free = (x, y) => !texts.some(r => L.rectHit(r, { l: x, r: x + w, t: y, b: y + h }));
  const xr = innerWidth - 12 - w, cur = [parseFloat(el.style.left), parseFloat(el.style.top)];
  const cands = [[xr, top], [12, top]];
  if (cur.every(Number.isFinite) && cur[1] >= top && cur[1] + h <= bottom && cur[0] >= 0 && cur[0] + w <= innerWidth) cands.unshift(cur);
  for (let y = top + BAR_STEP; y + h <= bottom; y += BAR_STEP) cands.push([xr, y], [12, y]);
  let pos = cands.find(([x, y]) => free(x, y));
  if (!pos) { pos = cands[0]; console.warn(`line: ${name}找不到不壓字的位置，放右上`); }
  setPos(el, pos);
}

let cardTheme = '';
function syncCardTheme() {
  const name = office.themeName();
  if (name === cardTheme) return;
  cardTheme = name;
  const R = document.documentElement.style, th = office.theme();
  R.setProperty('--lc-frozen', '#' + new office.THREE.Color(th.lamp.frozen).getHexString());
  const tone = office.ZONES?.brand?.tone;
  if (tone !== undefined) R.setProperty('--lc-brand', '#' + new office.THREE.Color(tone).getHexString());
}

function injectCardCss() {
  if (document.getElementById('line-card-style')) return;
  const s = document.createElement('style'); s.id = 'line-card-style'; s.textContent = CARD_CSS + REPLAY_CSS + (REC ? REC_CSS : ''); document.head.appendChild(s);
}

/* ============================================================
 * Task 9：站點卡片（提案 §3.7、§4.1～§4.4；SPEC §2.3／§2.4）
 * 鐵律：API 資料一律 textContent，不准 innerHTML；output 只讀白名單欄位（FOMO 來源紅線 L-T5）
 * ============================================================ */
const CARD_W = 420, HUD_GAP = 8, BODY_LINES = 6;
const ACTION = { approved: '核准，送排程', rejected: '退件' };

function mk(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function section(doc, parent, label) {
  const s = mk(doc, 'section', 'lc-s'); s.appendChild(mk(doc, 'div', 'lc-sec', label)); parent.appendChild(s); return s;
}
const staffName = (code, roster) => {
  const a = (roster || []).find(r => r.code === code);
  return a ? String(a.role).split('（')[0] : L.val(code);
};
const httpUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const chars = s => Array.from(s).length;

/**
 * 純 DOM 建構（不掛到畫面上）。order=null → 只有標頭＋線狀態（停機線／今天沒工單）。
 * station：該站物件；停機線傳 { no }。
 */
export function buildCard(doc, line, order, station, { rec = false, apiBase = '', roster = [], generatedAt = null, compact = false } = {}) {
  const no = station.no, st = order ? station : { no, state: 'idle' };
  const meta = L.stationsMeta(line).find(s => s.no === no) || { name: L.MISSING, goal: L.MISSING }; // 站名／目標每條線自帶（v2 T1）
  const halted = line.state !== 'active';
  const card = mk(doc, 'div', 'lc');
  card.dataset.line = String(line.brand_id); card.dataset.station = String(no);
  card.dataset.tone = halted ? 'frozen' : L.lampTone(st.state);
  if (order) card.dataset.draft = String(order.draft_id);
  const x = mk(doc, 'button', 'lc-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '關閉卡片'); card.appendChild(x);
  const body = mk(doc, 'div', 'lc-body'); card.appendChild(body);

  // 標頭：站｜線｜工單號｜狀態（停機線狀態用 lineLabel）
  const head = mk(doc, 'div', 'lc-head'), h1 = mk(doc, 'div', 'lc-h1');
  h1.appendChild(mk(doc, 'span', 'lc-st', meta.name));
  h1.appendChild(mk(doc, 'span', null, `L${line.brand_id} ${line.name}`));
  if (order && !halted) h1.appendChild(mk(doc, 'span', 'lc-mono', `#${order.draft_id}`));
  h1.appendChild(mk(doc, 'span', 'lc-state', halted ? L.lineLabel(line) : L.stateLabel(st)));
  head.appendChild(h1);
  body.appendChild(head);
  if (halted || !order) {
    if (!halted) head.appendChild(mk(doc, 'div', 'lc-title', '今天這條線沒有工單'));
    return card;
  }
  const title = L.recTitle(order, rec), t = mk(doc, 'div', 'lc-title', title); t.title = title; head.appendChild(t);
  if (compact) { // REC 精簡卡（提案 §6.2、Q6）：標頭＋總分大字＋文案／視覺兩條，不露扣分、沒有目標／實際／頁尾
    card.classList.add('lc-compact');
    const out = station.output || null;
    if (out) scoreParts(doc, body, out); else body.appendChild(mk(doc, 'p', 'lc-note', '還沒評分'));
    return card;
  }

  const masked = rec && !order.published;
  section(doc, body, '目標').appendChild(mk(doc, 'p', 'lc-goal', meta.goal));

  // 實際做了什麼
  const did = section(doc, body, '實際做了什麼'), kv = mk(doc, 'div', 'lc-kv');
  const out = SHOW_OUT.has(st.state) ? st.output || null : null; // 處理中／排隊／閒置（含重播倒回）的站不露產出
  const fin = no === 7 && out && !st.finished_at ? L.val(out.as_of) : L.hms(st.finished_at); // ⑦ 完成＝週報日期（SPEC §2.3）
  const rows = [['開始', L.hms(st.started_at)], ['完成', fin],
    ['耗時', no === 4 && out ? L.dur(out.seconds) : L.MISSING],
    ['嘗試', st.attempts === null || st.attempts === undefined ? L.MISSING : `${st.attempts} 次`],
    ['引擎', L.val(st.engine)], ['負責', staffName(st.staff, roster)]];
  for (const [k, v] of rows) { kv.appendChild(mk(doc, 'span', 'lc-k', k)); kv.appendChild(mk(doc, 'span', 'lc-v', v)); }
  did.appendChild(kv);
  if (st.note && no !== 7) did.appendChild(mk(doc, 'p', 'lc-note', st.note));

  // 產出（依站；只讀白名單欄位，不迭代 output 的鍵）
  const prod = section(doc, body, '產出');
  const none = s => prod.appendChild(mk(doc, 'p', 'lc-note', s));
  if (no === 1) {
    if (!out) none('這站還沒有產出');
    else if (masked) none('未發布草稿');
    else prod.appendChild(mk(doc, 'blockquote', 'lc-quote', order.type === 'planner' ? `企劃清單第 ${L.val(out.planner_no)} 篇` : L.val(out.event)));
    prod.appendChild(mk(doc, 'p', 'lc-meta', `類型 ${L.val(order.type)}`));
  } else if (no === 2) {
    if (!out) none('這站還沒有產出');
    else if (masked) none('未發布草稿');
    else {
      prod.appendChild(mk(doc, 'div', 'lc-h2', L.val(out.title)));
      const content = String(out.content ?? ''), txt = mk(doc, 'div', 'lc-text', content || L.MISSING);
      prod.appendChild(txt);
      if (content) { // 要不要展開鈕：掛上畫面後由 fitMore() 量 scrollHeight 決定，這裡先藏
        txt.classList.add('clamp');
        const label = `展開全文（${chars(content)} 字）`, more = mk(doc, 'button', 'lc-more', label); more.type = 'button'; more.hidden = true;
        more.addEventListener('click', () => { const open = txt.classList.toggle('open'); more.textContent = open ? '收合全文' : label; });
        prod.appendChild(more);
      }
    }
  } else if (no === 3) {
    if (!out) none('這站還沒有產出');
    else {
      const slides = Array.isArray(out.slides) ? out.slides : [];
      const fallback = `輪播 ${out.count ?? slides.length} 張` + (out.cover ? '＋封面 1' : '');
      const media = mk(doc, 'div', 'lc-media'), style = `風格 ${L.val(out.style)}`;
      const cap = mk(doc, 'p', 'lc-meta', `${fallback} · ${style}`);
      if (masked) media.appendChild(mk(doc, 'div', 'lc-stripe', '未發布草稿'));
      else {
        const src = name => `${apiBase}/api/line/media/${encodeURIComponent(order.draft_id)}/${encodeURIComponent(name)}`;
        let broken = false;
        const onErr = () => { if (broken) return; broken = true; media.classList.add('broken'); media.replaceChildren(mk(doc, 'p', 'lc-note', fallback)); cap.textContent = style; }; // 圖區已寫張數，說明列不重複
        const addImg = (parent, name, cls, alt) => {
          const i = mk(doc, 'img', cls); i.alt = alt; i.decoding = 'async'; i.addEventListener('error', onErr); i.setAttribute('src', src(name)); parent.appendChild(i);
        };
        if (out.cover) addImg(media, out.cover, 'lc-cover', '封面');
        if (slides.length) {
          const grid = mk(doc, 'div', 'lc-thumbs');
          slides.slice(0, 4).forEach((n, i) => {
            const c = mk(doc, 'div', 'lc-th'); addImg(c, n, null, `輪播 ${i + 1}`);
            c.appendChild(mk(doc, 'span', 'lc-idx', `${i + 1}/${slides.length}`)); grid.appendChild(c);
          });
          media.appendChild(grid);
        }
        if (!out.cover && !slides.length) { media.appendChild(mk(doc, 'p', 'lc-note', fallback)); cap.textContent = style; }
      }
      prod.appendChild(media);
      prod.appendChild(cap);
    }
  } else if (no === 4) {
    if (st.state === 'skipped') none(L.val(st.reason));
    else if (!out || !out.video) none('這站還沒有產出');
    else {
      prod.appendChild(mk(doc, 'p', 'lc-v', `影片 ${out.video}`));
      prod.appendChild(mk(doc, 'p', 'lc-meta', `壓片 ${L.hms(st.started_at)} → ${L.hms(st.finished_at)} · 耗時 ${L.dur(out.seconds)}`));
    }
  } else if (no === 5) {
    if (!out) none(st.state === 'done' || st.state === 'rejected' ? '出貨官沒有評分紀錄' : '還沒評分');
    else {
      scoreParts(doc, prod, out);
      prod.appendChild(mk(doc, 'p', 'lc-meta', `結果 ${ACTION[out.action] || L.val(out.action)}`));
      if (!rec && Array.isArray(out.deductions) && out.deductions.length) { // REC 到此為止（Q6）；分數與扣分不在前端加總
        const ul = mk(doc, 'ul', 'lc-ded');
        for (const d of out.deductions) {
          const li = mk(doc, 'li'), r = mk(doc, 'div', 'lc-ded-r');
          r.appendChild(mk(doc, 'span', 'lc-ded-i', L.val(d.item))); r.appendChild(mk(doc, 'span', 'lc-ded-p', `−${L.val(d.points)}`));
          li.appendChild(r); if (d.fix) li.appendChild(mk(doc, 'div', 'lc-ded-fix', d.fix)); ul.appendChild(li);
        }
        prod.appendChild(ul);
      }
    }
  } else if (no === 6) {
    const ps = out && Array.isArray(out.platforms) ? out.platforms : [];
    if (!ps.length) none('這站還沒有產出');
    for (const p of ps) {
      const r = mk(doc, 'div', 'lc-plat'); r.appendChild(mk(doc, 'span', null, L.platformLabel(p)));
      const u = L.flagUp(p) ? httpUrl(p.url) : null;
      if (u) { const a = mk(doc, 'a', 'lc-link', '↗ 連結'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; r.appendChild(a); }
      prod.appendChild(r);
    }
  } else if (no === 7) {
    if (out) { // 週報目前只收 Threads
      const r = mk(doc, 'div', 'lc-plat');
      r.appendChild(mk(doc, 'span', 'lc-v', `[TH] 瀏覽 ${L.val(out.views)} · 讚 ${L.val(out.likes)} · 留言 ${L.val(out.replies)} · 資料時間 ${L.val(out.as_of)}`));
      const u = httpUrl(out.url);
      if (u) { const a = mk(doc, 'a', 'lc-link', '↗ 連結'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; r.appendChild(a); }
      prod.appendChild(r);
    }
    none(out ? (st.note || '目前只統計 Threads') : '還沒有成效數據（週報每週三 11:00）');
  }

  body.appendChild(mk(doc, 'div', 'lc-foot', `資料：brandmachine.db · ${st.source ?? '—'} · 讀取 ${generatedAt ? L.hm(generatedAt) : '—'}`));
  return card;
}

/** ⑤ 總分大字＋文案／視覺兩條（站點卡與 REC 精簡卡共用；分數直接讀出貨官檔，不在前端算） */
function scoreParts(doc, parent, out) {
  const top = mk(doc, 'div', 'lc-scorerow');
  top.appendChild(mk(doc, 'span', 'lc-score', L.val(out.score)));
  top.appendChild(mk(doc, 'span', 'lc-meta', `出貨官總分 · ${L.val(out.score_basis)}`));
  parent.appendChild(top);
  for (const [k, v] of [['文案', out.text_score], ['視覺', out.vision_score]]) {
    const r = mk(doc, 'div', 'lc-bar'); r.appendChild(mk(doc, 'span', 'lc-k', k));
    const tr = mk(doc, 'span', 'lc-track'), fill = mk(doc, 'span', 'lc-fill');
    fill.style.width = (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0) + '%';
    tr.appendChild(fill); r.appendChild(tr); r.appendChild(mk(doc, 'span', 'lc-v', L.val(v))); parent.appendChild(r);
  }
}

const CARD_CSS = `
.lc{position:fixed;right:12px;top:72px;width:${CARD_W}px;max-width:calc(100vw - 24px);z-index:26;display:flex;flex-direction:column;
  background:var(--ui-info-bg);border:2px solid var(--border);border-left:6px solid var(--lc-tone);box-shadow:6px 6px 0 var(--shadow-ink);
  color:var(--text);font:400 14px/1.75 'Noto Sans TC',sans-serif;border-radius:0}
.lc[data-tone=running]{--lc-tone:var(--green)}.lc[data-tone=standby]{--lc-tone:var(--orange)}
.lc[data-tone=red]{--lc-tone:var(--red)}.lc[data-tone=frozen]{--lc-tone:var(--lc-frozen,#8a8f98)}
.lc.lc-in{animation:lcIn .2s ease-out}
@keyframes lcIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
@keyframes lcFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.lc.lc-in{animation:lcFade .2s ease-out}}
.lc-body{overflow-y:auto;overscroll-behavior:contain;padding:12px 16px 10px;min-height:0}
.lc-x{position:absolute;top:4px;right:4px;width:32px;height:32px;background:var(--ui-info-bg);border:1px solid var(--red);color:var(--red);cursor:pointer;font-size:14px;z-index:1}
.lc-x:hover{background:var(--red);color:var(--panel)}
.lc-h1{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;padding-right:36px;font-size:13px;color:var(--text)}
.lc-st{font-weight:900;font-size:15px}
.lc-mono,.lc-k,.lc-v,.lc-foot,.lc-idx,.lc-ded-p,.lc-score{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.lc-state{font-weight:700}
.lc-title{margin-top:2px;font-weight:700;font-size:15px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lc-s{border-top:1px solid var(--border);margin-top:10px;padding-top:8px}
.lc-sec{font-family:var(--font-pixel);font-size:10px;letter-spacing:.08em;color:var(--ui-infotext);margin-bottom:4px}
body.theme-press .lc-sec{font-size:12px}
.lc-kv{display:grid;grid-template-columns:auto 1fr;gap:0 12px;font-size:13px}
.lc-k{color:var(--ui-infotext)}.lc-v{color:var(--text);font-weight:500;overflow-wrap:anywhere}
.lc-note,.lc-meta{font-size:12px;color:var(--ui-infotext);margin-top:4px}
.lc-quote{border-left:3px solid var(--lc-brand,var(--accent));padding:2px 0 2px 10px;font-size:15px}
.lc-h2{font-weight:900;font-size:16px;margin-bottom:4px}
.lc-text{white-space:pre-wrap;overflow-wrap:anywhere}
.lc-text.clamp:not(.open){max-height:calc(1.75em * ${BODY_LINES});overflow:hidden;-webkit-mask-image:linear-gradient(#000 60%,transparent);mask-image:linear-gradient(#000 60%,transparent)}
.lc-more{margin-top:6px;background:none;border:1px solid var(--border);color:var(--text);padding:4px 10px;cursor:pointer;font-size:12px}
.lc-media{display:flex;flex-direction:column;gap:6px}
.lc-cover{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border:1px solid var(--border);background:var(--panel)}
.lc-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.lc-th{position:relative;aspect-ratio:4/5;border:1px solid var(--border);background:var(--panel);overflow:hidden}
.lc-th img{width:100%;height:100%;object-fit:cover;display:block}
.lc-idx{position:absolute;left:0;top:0;font-size:11px;padding:0 4px;background:var(--panel);color:var(--text)}
.lc-stripe{aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;font-weight:700;border:1px solid var(--border);color:var(--text);
  background:repeating-linear-gradient(45deg,var(--panel) 0 14px,var(--border) 14px 28px);text-shadow:0 0 4px var(--panel),0 0 8px var(--panel)}
.lc-scorerow{display:flex;align-items:baseline;gap:10px}
.lc-score{font-size:56px;font-weight:700;line-height:1.1;color:var(--gold)}
.lc-bar{display:grid;grid-template-columns:2.5em 1fr 3em;gap:8px;align-items:center;font-size:13px}
.lc-track{height:8px;background:var(--panel);border:1px solid var(--border)}
.lc-fill{display:block;height:100%;background:var(--accent)}
.lc-ded{list-style:none;margin-top:8px}
.lc-ded li{border-top:1px dashed var(--border);padding:4px 0}
.lc-ded-r{display:flex;justify-content:space-between;gap:10px}
.lc-ded-p{color:var(--red);font-weight:700;white-space:nowrap}
.lc-ded-fix{padding-left:1.2em;font-size:12px;color:var(--ui-infotext)}
.lc-plat{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:2px 0}
.lc-link{color:var(--text);text-decoration:underline;white-space:nowrap}
.lc-foot{border-top:1px solid var(--border);margin-top:10px;padding-top:6px;font-size:11px;color:var(--ui-infotext)}
`;

const REPLAY_CSS = `
#line-replay{position:fixed;left:12px;top:106px;z-index:25;background:var(--ui-info-bg);border:2px solid var(--border);box-shadow:4px 4px 0 var(--shadow-ink);
  padding:8px 12px 6px;color:var(--text);font:400 13px/1.5 'Noto Sans TC',sans-serif;pointer-events:none}
#line-replay .lr-row{display:flex;gap:14px;align-items:baseline;white-space:nowrap}
#line-replay .lr-badge{font-weight:900;font-size:14px;color:var(--text)}
#line-replay .lr-clock{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:700;font-size:18px;color:var(--text)}
#line-replay .lr-ruler{position:relative;width:360px;height:12px;margin-top:6px}
#line-replay .lr-gap{position:absolute;left:0;right:0;top:5px;border-top:2px dashed var(--ui-infotext)}
#line-replay .lr-seg{position:absolute;top:1px;height:10px;background:var(--accent)}
#line-replay .lr-head{position:absolute;top:-3px;width:2px;height:18px;margin-left:-1px;background:var(--text)}
#line-replay .lr-ticks{display:flex;justify-content:space-between;width:360px}
#line-replay .lr-tick{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;color:var(--ui-infotext)}
#line-replay .lr-note{font-size:12px;color:var(--ui-infotext);max-width:360px}
#line-replay .lr-note:empty{display:none}
#bLineReplay{display:none}
html.line-cam #bLineReplay{display:inline-block}
#line-kpi{display:none;position:fixed;left:12px;top:106px;z-index:21;background:var(--ui-bar-bg);border:2px solid var(--border);box-shadow:3px 3px 0 var(--shadow-ink);
  padding:4px 12px;color:var(--text);font:700 13px/1.5 'Noto Sans TC',sans-serif;white-space:nowrap;pointer-events:none}
html.line-cam #line-kpi{display:block}
html.line-cam #lineWarn{display:none} /* 產線鏡頭時警告改由 KPI 產線段顯示（1280 時 .bar 被月台 KPI 條蓋住） */
#line-kpi .lk-w{color:var(--text);margin-left:12px;padding-left:8px;border-left:4px solid var(--orange)} /* 字用主文字色：press 主題橘字在條底只有 3.07:1 */
#line-kpi .lk-w:empty{display:none}
`;

/* REC（html.line-rec；--line-s＝REC 寬 ÷ 1920）：只在這裡加 REC 專用樣式，不動 office3d／monitor-overlay／月台的檔 */
const REC_CSS = `
html.line-rec .legend,html.line-rec .info,html.line-rec .todo,html.line-rec .toast,html.line-rec #mon-strip,html.line-rec #mon-panel,
html.line-rec .bar,html.line-rec #dk-kpi,html.line-rec #dk-list{display:none!important}
html.line-rec body.dk-rec #dk-rec-title{background:var(--ui-bar-bg);border:3px solid var(--border);box-shadow:6px 6px 0 var(--shadow-ink);
  padding:calc(12px*var(--line-s)) calc(26px*var(--line-s))}
html.line-intro body #dk-rec-title{visibility:hidden}
#line-intro{display:none}
html.line-intro #line-intro{display:flex;position:fixed;inset:0;z-index:20;background:var(--bg);align-items:center;justify-content:center;pointer-events:none}
#line-intro .li-box{text-align:center;color:var(--text)}
#line-intro .li-h{font:900 calc(96px*var(--line-s))/1.15 'Noto Sans TC',sans-serif;text-shadow:4px 4px 0 var(--shadow-ink)}
#line-intro .li-s{font:700 calc(40px*var(--line-s))/1.4 'Noto Sans TC',sans-serif;color:var(--ui-infotext);margin-top:calc(14px*var(--line-s))}
html.line-rec #line-replay{padding:calc(10px*var(--line-s)) calc(18px*var(--line-s));border-width:3px;box-shadow:6px 6px 0 var(--shadow-ink)}
html.line-rec #line-replay .lr-row{gap:calc(20px*var(--line-s))}
html.line-rec #line-replay .lr-badge{font-size:calc(28px*var(--line-s))}
html.line-rec #line-replay .lr-clock{font-size:calc(34px*var(--line-s))}
html.line-rec #line-replay .lr-ruler,html.line-rec #line-replay .lr-ticks{width:calc(540px*var(--line-s))}
html.line-rec #line-replay .lr-tick{font-size:calc(16px*var(--line-s))}
html.line-rec #line-replay .lr-note{font-size:calc(20px*var(--line-s));max-width:calc(540px*var(--line-s))}
#line-recwarn{position:fixed;left:0;top:0;z-index:30;background:var(--ui-bar-bg);border:3px solid var(--orange);color:var(--text);
  font:900 calc(24px*var(--line-s,1))/1.4 'Noto Sans TC',sans-serif;padding:calc(6px*var(--line-s,1)) calc(14px*var(--line-s,1));pointer-events:none}
.lc.lc-compact{right:auto;width:calc(460px*var(--line-s,1));font-size:calc(20px*var(--line-s,1))}
.lc-compact .lc-x{display:none}
.lc-compact .lc-body{padding:calc(12px*var(--line-s,1)) calc(18px*var(--line-s,1));overflow:visible;line-height:1.4}
.lc-compact .lc-h1{font-size:calc(20px*var(--line-s,1));padding-right:0}
.lc-compact .lc-st{font-size:calc(24px*var(--line-s,1))}
.lc-compact .lc-title{font-size:calc(24px*var(--line-s,1))}
.lc-compact .lc-score{font-size:calc(64px*var(--line-s,1));line-height:1.05}
.lc-compact .lc-meta,.lc-compact .lc-note{font-size:calc(18px*var(--line-s,1))}
.lc-compact .lc-bar{font-size:calc(20px*var(--line-s,1));gap:calc(10px*var(--line-s,1))}
.lc-compact .lc-track{height:calc(12px*var(--line-s,1))}
`;
