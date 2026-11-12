/* ============================================================
 * 自動發文產線：純函式（command-center\SPEC-production-line-v1.md）
 * 不碰 3D、不讀全域狀態；line-selftest.html 直接測。
 * 時間一律直接切後台給的台灣時間 ISO 字串，不做時區運算（SPEC §2.1）。
 * ============================================================ */
export const MISSING = '—（DB 無此欄）';
/** brand-machine 發文線（L1／L2）的 7 站：後端不回 stations_meta 時的 fallback，也是 line-3d 站牌幾何的站名 */
export const STATION_NAMES = ['①選題', '②寫文', '③配圖', '④影片', '⑤評分', '⑥發布', '⑦成效'];
export const GOALS = [
  '從今天的新聞或企劃清單挑一件值得寫的事',
  '把那件事寫成一篇能直接發的貼文',
  '做出跟文案對得上的圖：輪播卡＋封面',
  '把同一篇內容壓成一支短影片',
  '文案和圖都要過出貨官門檻，沒過就退件，不送排程',
  '在排定的時間發到各平台，拿回貼文連結',
  '回收每個平台的瀏覽和讚'];
// 提案 §3.1 的 line.* token（三主題）
export const LINE_TOKENS = {
  midnight: { floor: 0x0f4a4a, belt: 0x1c1c3a, beltEdge: 0x2a2a5a, machine: 0x3a3050, machineDark: 0x222240,
    plate: '#12122a', plateText: '#e0e0ff', plateMeta: '#8a8ab0', ticket: 0xE0E0FF, outline: null },
  press: { floor: 0xC4E5DF, belt: 0xD5CDB6, beltEdge: 0x141311, machine: 0xD9B98C, machineDark: 0x8A6B4A,
    plate: '#FBF7EC', plateText: '#141311', plateMeta: '#6E6758', ticket: 0xFBF7EC, outline: 0x141311 },
  foundry: { floor: 0x0E3D3B, belt: 0x2A1910, beltEdge: 0x4A2C1A, machine: 0x4A3020, machineDark: 0x241611,
    plate: '#1F1209', plateText: '#FFE3C8', plateMeta: '#B08A6E', ticket: 0xFFE3C8, outline: null } };

export const val = v => (v === null || v === undefined || v === '' ? MISSING : String(v));
/* ── 工站定義：每條線自帶（v2 T1）── */
const DEFAULT_STATIONS = Object.freeze(STATION_NAMES.map((name, i) => Object.freeze({ no: i + 1, name, goal: GOALS[i] })));
/**
 * 這條線的工站定義 [{no, name, goal}]：讀後端的 `line.stations_meta[]`。
 * 後端沒給（brand-machine 的 L1／L2 就是不給）→ fallback 回現行 7 站，行為完全不變。
 * 🔴 新資料源（ledger／nocodb／n8n）一定要自己帶 stations_meta —— 不帶會被畫成發文線的 7 站＝畫面說謊。
 *    擋這件事的不是這裡：後端 jarvis/line.py 的 snapshot() 會對非 brandmachine 的線補一條 warning
 *    （測試 test_line.py::AdapterContractTest::test_other_source_without_stations_meta_warns）。
 */
export function stationsMeta(line) {
  const m = line && line.stations_meta;
  if (!Array.isArray(m) || !m.length) return DEFAULT_STATIONS;
  return m.map((s, i) => ({ no: Number.isFinite(s && s.no) ? s.no : i + 1, name: val(s && s.name), goal: val(s && s.goal) }));
}
export const hms = iso => (iso ? iso.slice(11, 19) : MISSING);
export const hm = iso => (iso ? iso.slice(11, 16) : MISSING);
export const md = day => { const [, m, d] = day.split('-'); return `${+m}/${+d}`; };
export function dur(sec) {
  if (!Number.isFinite(sec) || sec < 0) return MISSING;
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = String(sec % 60).padStart(2, '0');
  return m ? `${m} 分 ${s} 秒` : `${sec} 秒`;
}

const SYM = { running: ['●', '處理中'], queued: ['◐', '排隊'], scheduled: ['◷', '已排程'], done: ['✓', '完成'],
  skipped: ['–', '略過'], rejected: ['⊘', '退件'], idle: ['○', '閒置'], failed: ['✕', ''] };
export function stateLabel(s) {
  const [sym, word] = SYM[s.state] || ['○', s.state];
  if (s.state === 'failed') return `${sym} ${s.reason || '失敗'}`;
  if (s.state === 'scheduled') return `${sym} ${word} ${s.reason || ''}`.trim();
  if ((s.state === 'skipped' || s.state === 'rejected') && s.reason) return `${sym} ${word}：${s.reason}`;
  return `${sym} ${word}`;
}
export const lineLabel = ln => (ln.state !== 'active' ? `■ ${ln.reason ?? MISSING}` : '● 運轉中');
/** 燈色 token 名（對應 THEMES 的 lamp.* 與 css.red）。紅只給失敗。 */
export function lampTone(state) {
  if (state === 'failed') return 'red';
  if (state === 'running') return 'running';
  if (state === 'queued' || state === 'scheduled') return 'standby';
  return 'frozen';
}

export function platformLabel(p) {
  const t = hm(p.slot); // 沒有 slot → 缺值字樣，不留空字串
  switch (p.state) {
    case 'scheduled': return `[${p.code}] ◷ 已排程 ${t}`;
    case 'awaiting_settle': return `[${p.code}] ◷ ${t} 已過 · 等 23:55 對帳確認`;
    case 'published': return `[${p.code}] ✓ 已發布 ${t}（排定時間）`;
    case 'skipped': return `[${p.code}] – 略過：${p.error || ''}`;
    case 'cancelled': return `[${p.code}] – 已取消`;
    default: return `[${p.code}] ✕ 失敗：${p.error || ''}`;
  }
}
/** 紅燈原因短字（提案 §3.5：≤8 字，查對照表，不直接印 log）。'TH：Postiz state=ERROR' → 'TH 發布失敗'；表外一律「失敗」。完整原文在卡片顯示。 */
const REASON_SHORT = { 'Postiz state=ERROR': '發布失敗', '逾時': '逾時', '工作已取消': '已取消' };
export function shortReason(reason) {
  const txt = String(reason ?? '').trim(), m = /^([A-Z]{2})[：:]\s*(.*)$/.exec(txt);
  const s = REASON_SHORT[(m ? m[2] : txt).trim()] || '失敗';
  return (m ? `${m[1]} ${s}` : s).slice(0, 8);
}
export const flagUp =p => p.state === 'published' && !!p.url;
export const sentText = o => `已發 ${o.platforms.done}/${o.platforms.total}`;
export const publishedCount = snap => snap.lines.reduce((n, ln) => n + ln.orders.filter(o => o.published).length, 0);
/** KPI 產線段（SPEC §4.1、提案 §6）：N＝L2 工單數；已排程＝⑥ 站 scheduled；已發布＝published（同計數器口徑） */
export function kpiText(snap, day = '今日') {
  const orders = ((snap && snap.lines) || []).find(ln => ln.brand_id === 2)?.orders || [];
  const sched = orders.filter(o => o.stations && o.stations[5] && o.stations[5].state === 'scheduled').length;
  return `產線：${day} ${orders.length} 單 · 已排程 ${sched} · 已發布 ${orders.filter(o => o.published).length}`;
}
/** 螢幕矩形 {l,r,t,b} 重疊（邊貼邊不算）；line-3d 防擠與 line-card 擺位共用 */
export const rectHit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
/** 3D 物件自己＋所有上層都 visible */
export const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
export const recTitle = (o, rec) => (rec && !o.published ? '未發布草稿' : o.title);
/**
 * REC 隱私（L-T4；提案 §6.2）：深拷貝快照，「錄影當下」沒有已發布平台的工單，所有人寫的字一律換成「未發布草稿」，
 * 縮圖檔名拿掉（只留張數，卡片改斜紋、也不會發媒體請求），扣分清單清空。保留：工單號、站狀態、時間、分數數字、平台代碼／狀態／排定時間、引擎、負責。
 */
export const REC_MASK = '未發布草稿';
const MASK_STR = ['event', 'title', 'content', 'style', 'video', 'url', 'error'];
export function recSnap(snap) {
  const out = JSON.parse(JSON.stringify(snap));
  for (const ln of out.lines || []) for (const o of ln.orders || []) {
    if (o.published) continue;
    o.title = REC_MASK;
    for (const s of o.stations || []) {
      if (s.reason != null) s.reason = REC_MASK;
      if (s.note != null) s.note = REC_MASK;
      const p = s.output;
      if (!p || typeof p !== 'object') continue;
      for (const k of MASK_STR) if (typeof p[k] === 'string') p[k] = REC_MASK;
      if ('cover' in p) p.cover = null;
      if (Array.isArray(p.slides)) { if (p.count == null) p.count = p.slides.length; p.slides = []; }
      if (Array.isArray(p.deductions)) p.deductions = [];
      if (Array.isArray(p.platforms)) p.platforms.forEach(x => { if (typeof x.url === 'string') x.url = null; if (typeof x.error === 'string') x.error = REC_MASK; });
    }
  }
  return out;
}
export const recVisibleOrders = (ln, rec) => (rec ? ln.orders.filter(o => o.published) : ln.orders);
export const litCells = o => o.stations.filter(s => s.state === 'done' || s.state === 'skipped').length;
export function currentStation(o) {
  const s = o.stations.find(x => x.state !== 'done' && x.state !== 'skipped');
  return s ? s.no : 8; // 全部完成或略過＝第 8（⑦ 也走完）
}

/** 鍵排序的 stringify：同內容不同鍵順序 → 同字串 */
function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
/** 資料簽章：只看會改變畫面的欄位（明列欄位，不含 generated_at），沒變就不動任何 3D 物件與 DOM（L-T12） */
export function sig(snap) {
  if (!snap) return '';
  return stable([snap.date, snap.warnings, snap.lines.map(ln => [ln.brand_id, ln.name, ln.state, ln.reason,
    ln.orders.map(o => [o.draft_id, o.type, o.title, o.published, o.first_published_at, stable(o.platforms),
      o.stations.map(s => [s.no, s.state, s.reason, s.started_at, s.finished_at, s.attempts, s.engine, s.staff, s.source, s.note, stable(s.output)])])])]);
}
/** 這次比上次多走了一站的工單（只有這些要播換站動畫；第一次載入回空陣列） */
export function stepsAdvanced(prev, next) {
  if (!prev) return [];
  const before = new Map();
  for (const ln of prev.lines) for (const o of ln.orders) before.set(o.draft_id, currentStation(o));
  const out = [];
  for (const ln of next.lines) for (const o of ln.orders) {
    const b = before.get(o.draft_id), a = currentStation(o);
    if (b !== undefined && a > b) out.push({ draft_id: o.draft_id, from: b, to: a });
  }
  return out;
}

/* ── 重播：事件密度分配時間（提案 §7.1） ── */
const SEG_GAP_MS = 3 * 60 * 1000;
function eventWeight(e, dayEvents) {
  if (e.kind === 'platform') return 2;
  if (e.kind === 'settle') return 4;
  if (e.kind === 'start') return dayEvents.some(x => x.kind === 'finish' && x.draft_id === e.draft_id && x.station === e.station) ? 0 : 1.5;
  return e.station === 4 ? 5 : e.station === 5 ? 6 : 3;
}
const hmSpan = ms => { const m = Math.round(ms / 60000), h = Math.floor(m / 60), r = m % 60; return `${h ? `${h} 小時 ` : ''}${r} 分`; };
export function gapLabel(ms) { return `» 跳過 ${hmSpan(ms)} · 這段沒有動作`; }
/** 有站在空檔兩端各有 start／finish（例：④ 壓片 24 分）＝不是「沒有動作」，改快轉
 * ⚠️ v2 未結：這裡只能用發文線的 7 站站名，因為 replay 事件沒有 brand_id，查不到是哪一條線。
 *    T3～T5 開新線時要先讓後端在 replay 事件上帶 brand_id，否則新線的快轉卡會寫錯站名。 */
export const ffLabel = (no, ms) => `» 快轉 ${STATION_NAMES[no - 1]} ${hmSpan(ms)}`;
/**
 * 回傳 {segments:[{kind:'intro'|'pre'|'event'|'ff'|'skip'|'outro', dur 秒, realStart, realEnd(ISO), label, events}], unfinished, overBudget}
 * - 某站 start 在一組、finish 在後面的組：中間的空檔改 'ff' 快轉段（「» 快轉 ④影片 24 分」），段長＝那個 finish 的權重
 *   （跨多個空檔就平分），finish 那組扣掉這份權重；快轉段跟事件段一起縮放，realAt 照樣在空檔裡內插
 * - 當天以前的事件（企劃型預先寫好）併成一段 'pre'，3 秒
 * - 相鄰事件間隔 ≤3 分鐘併成同一活動段；段與段之間一律 1 秒跳過卡
 * - 總長不在 45～75 秒時，只縮放事件段（最短 1.5 秒），跳過卡固定 1 秒
 */
export function replayPlan(events, day, nowMs) {
  const dayStart = Date.parse(`${day}T00:00:00+08:00`), dayEnd = dayStart + 86400000;
  const asc = events.slice().sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const pre = asc.filter(e => Date.parse(e.ts) < dayStart), today = asc.filter(e => Date.parse(e.ts) >= dayStart);
  const groups = [];
  for (const e of today) {
    const g = groups.at(-1);
    if (g && Date.parse(e.ts) - Date.parse(g.at(-1).ts) <= SEG_GAP_MS) g.push(e); else groups.push([e]);
  }
  // 片頭與「預先完成」停在第一個今天事件的時刻（沒有就 00:00），播放頭才不會從半夜起跳又倒退
  const t0 = groups.length ? groups[0][0].ts : `${day}T00:00:00+08:00`;
  const segs = [{ kind: 'intro', dur: 3, realStart: t0, realEnd: t0, label: null, events: [] }];
  if (pre.length) {
    const d0 = pre[0].ts.slice(0, 10);
    segs.push({ kind: 'pre', dur: 3, realStart: t0, realEnd: t0, label: `預先完成（${md(d0)}）`, events: pre });
  }
  // 跨空檔的 start→finish：空檔 k（第 k 組之後）記上站號與權重；finish 那組扣權重
  const gi = new Map(); groups.forEach((g, i) => g.forEach(e => gi.set(e, i)));
  const ffW = groups.map(() => 0), ffNo = groups.map(() => null), minus = groups.map(() => 0);
  for (const sE of today) {
    if (sE.kind !== 'start') continue;
    const fE = today.find(x => x.kind === 'finish' && x.draft_id === sE.draft_id && x.station === sE.station && Date.parse(x.ts) >= Date.parse(sE.ts));
    if (!fE) continue;
    const a = gi.get(sE), b = gi.get(fE);
    if (b <= a) continue;
    const w = eventWeight(fE, today);
    minus[b] += w;
    for (let k = a; k < b; k++) { ffW[k] += w / (b - a); if (ffNo[k] === null || sE.station < ffNo[k]) ffNo[k] = sE.station; }
  }
  let last = null, gIdx = -1;
  for (const g of groups) {
    if (last) {
      const gapMs = Date.parse(g[0].ts) - Date.parse(last);
      if (ffNo[gIdx] !== null) segs.push({ kind: 'ff', dur: Math.max(1.5, ffW[gIdx]), realStart: last, realEnd: g[0].ts, label: ffLabel(ffNo[gIdx], gapMs), events: [] });
      else segs.push({ kind: 'skip', dur: 1, realStart: last, realEnd: g[0].ts, label: gapLabel(gapMs), events: [] });
    }
    gIdx++;
    const w = Math.max(0, g.reduce((a, e) => a + eventWeight(e, today), 0) - minus[gIdx]);
    segs.push({ kind: 'event', dur: Math.max(1.5, w), realStart: g[0].ts, realEnd: g.at(-1).ts, label: null, events: g });
    last = g.at(-1).ts;
  }
  const unfinished = nowMs < dayEnd - 1000;
  const endIso = last || `${day}T00:00:00+08:00`;
  // 未結束：片尾的真實時刻走到「現在」（不超過當天結束，也不早於最後一個事件）
  let outroEnd = endIso;
  if (unfinished && Number.isFinite(nowMs)) {
    const ms = Math.max(Date.parse(endIso), Math.min(nowMs, dayEnd));
    outroEnd = new Date(ms + 8 * 3600000).toISOString().slice(0, 19) + '+08:00';
  }
  const outroLabel = unfinished ? '今天還沒結束' : (groups.length ? null : '這天沒有新動作');
  segs.push({ kind: 'outro', dur: 3, realStart: endIso, realEnd: outroEnd, label: outroLabel, events: [] });
  // 總長目標 45～75 秒：只縮放事件段；碰到 1.5 秒地板的凍結，其餘重算比例，直到穩定。
  // 沒有今天事件時不補長（總長可短於 45）。
  const evs = segs.filter(s => s.kind === 'event' || s.kind === 'ff');
  const fixed = segs.filter(s => s.kind !== 'event' && s.kind !== 'ff').reduce((a, s) => a + s.dur, 0);
  let overBudget = false;
  if (evs.length) {
    const base = evs.map(s => s.dur), baseSum = base.reduce((a, b) => a + b, 0);
    const target = Math.min(75, Math.max(45, fixed + baseSum));
    if (fixed + evs.length * 1.5 > 75) {
      overBudget = true; for (const s of evs) s.dur = 1.5;
    } else {
      const frozen = new Array(evs.length).fill(false);
      let k = 1;
      for (let guard = 0; guard <= evs.length; guard++) {
        const fz = frozen.reduce((a, f) => a + (f ? 1.5 : 0), 0);
        const rest = base.reduce((a, b, i) => a + (frozen[i] ? 0 : b), 0);
        k = rest ? (target - fixed - fz) / rest : 1;
        let changed = false;
        base.forEach((b, i) => { if (!frozen[i] && b * k < 1.5) { frozen[i] = true; changed = true; } });
        if (!changed) break;
      }
      evs.forEach((s, i) => { s.dur = frozen[i] ? 1.5 : base[i] * k; });
      // 四捨五入到 0.01，殘差補到最長的事件段，總長才準
      for (const s of evs) s.dur = Math.round(s.dur * 100) / 100;
      const diff = Math.round((target - fixed - evs.reduce((a, s) => a + s.dur, 0)) * 100) / 100;
      if (diff) { const big = evs.reduce((m, s) => (s.dur > m.dur ? s : m), evs[0]); big.dur = Math.round((big.dur + diff) * 100) / 100; }
    }
  }
  return { segments: segs, unfinished, overBudget };
}
/** 播放到第 t 秒時的真實時刻（ms）。段內線性內插；intro／pre 停在第一個事件之前，skip 在兩端之間快轉。 */
export function realAt(plan, t) {
  if (!Number.isFinite(t)) t = 0;
  let acc = 0;
  for (const s of plan.segments) {
    if (t <= acc + s.dur || s === plan.segments.at(-1)) {
      const f = s.dur ? Math.min(1, Math.max(0, (t - acc) / s.dur)) : 1;
      const a = Date.parse(s.realStart), b = Date.parse(s.realEnd);
      return Math.round(a + (b - a) * f);
    }
    acc += s.dur;
  }
  return Date.parse(plan.segments.at(-1).realEnd);
}
export const replayBadge = day => `⟲ 重播 · ${md(day)} 真實紀錄 · 變速`;

/* ── 對比（WCAG 4.5:1）── */
function lum(hex) {
  const n = parseInt(hex.replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
