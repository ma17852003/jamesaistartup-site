/* ============================================================
 * 出貨月台：純函式（command-center\SPEC-output-flow-v1.md）
 * 不碰 3D、不讀全域狀態；dock-selftest.html 直接測。
 * ============================================================ */
export const LIVE_MS = 10 * 60 * 1000;
export const CODE2ZONE = { CEO: 'ceo', DEV: 'dev', MKT: 'mkt', PLT: 'platform', INV: 'inv',
  SAL: 'sales', BRD: 'brand', OPS: 'ops', PER: 'personal' };
export const DEPT_CODES = Object.keys(CODE2ZONE);

/** 中段截斷、保留副檔名：「2026-10-…-cto.md」；以 code point 切，不拆代理對 */
export function midCut(s, n) {
  const a = [...s];
  if (!(n > 0)) return '';
  if (n === 1) return a.length <= 1 ? s : '…';
  if (a.length <= n) return s;
  const dot = s.lastIndexOf('.');
  const extA = dot > 0 && s.length - dot <= 6 ? [...s.slice(dot)] : [];
  const bodyA = a.slice(0, a.length - extA.length);
  const keep = n - extA.length - 1;
  if (keep < 2) return a.slice(0, n - 1).join('') + '…';
  const head = Math.ceil(keep / 2), tail = keep - head;
  return bodyA.slice(0, head).join('') + '…' + bodyA.slice(bodyA.length - tail).join('') + extA.join('');
}

/** 可用寬度放得下幾張卡（用卡片最大寬算，保證不溢出右邊界） */
export function visibleCount(avail, cardW, gap) {
  if (![avail, cardW, gap].every(Number.isFinite) || cardW + gap <= 0) return 0;
  return Math.max(0, Math.floor((avail + gap) / (cardW + gap)));
}

/** 月台要顯示哪些卡、右端「+M」是多少。不變式：可見成功卡 + more == 成功總數（T1） */
export function planDock(events, slots, rec) {
  slots = Math.max(0, slots | 0);
  const pool = rec ? events.filter(e => e.ok) : events;
  const shown = pool.slice(0, slots);
  const okTotal = events.filter(e => e.ok).length;
  return { shown, more: okTotal - shown.filter(e => e.ok).length };
}

/** 狀態三態：看的是「後端輪詢活著沒」，不是「最近有沒有交件」 */
export function statusOf(polledAt, nowMs, replayDay, connLost) {
  if (replayDay) return { kind: 'replay' };
  if (!polledAt || connLost) return { kind: 'stale', since: polledAt || null };
  const age = nowMs - Date.parse(polledAt);
  if (!(age >= -120000 && age <= LIVE_MS)) return { kind: 'stale', since: polledAt };
  return { kind: 'live', mins: Math.max(0, Math.floor(age / 60000)) };
}

export function bubbleText(gen) { return [...('交件：' + gen)].slice(0, 8).join(''); }

export function agoText(ts, nowMs) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return '';
  const m = Math.max(0, Math.floor((nowMs - t) / 60000));
  return m < 60 ? `${m} 分前` : `${Math.floor(m / 60)} 小時前`;
}

export function pad3(n) { return !Number.isFinite(n) || n < 0 ? '000' : n > 999 ? '999+' : String(Math.floor(n)).padStart(3, '0'); }

export function rosterCounts(roster) {
  let run = 0, std = 0, frz = 0;
  roster.forEach(a => { if (a.st === 'running') run++; else if (a.st === 'frozen') frz++; else std++; });
  return { run, std, frz };
}

const isWide = cp => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3)
  || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60)
  || (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x20000 && cp <= 0x3FFFD);
/** 顯示寬度：全形／CJK／emoji＝2，其餘＝1（以 code point 計） */
export function dispWidth(s) { let w = 0; for (const ch of String(s)) w += isWide(ch.codePointAt(0)) ? 2 : 1; return w; }
/** 依顯示寬度中段截斷、保留副檔名（語意同 midCut，預算單位是顯示寬度；不拆代理對） */
export function midCutWidth(s, maxW) {
  if (!(maxW > 0)) return '';
  if (dispWidth(s) <= maxW) return s;
  const dot = s.lastIndexOf('.');
  const ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : '';
  const body = [...s.slice(0, s.length - ext.length)];
  const budget = maxW - dispWidth(ext) - 1; // 1 = 省略號
  const take = (arr, cap) => { const out = []; let w = 0; for (const ch of arr) { const cw = dispWidth(ch); if (w + cw > cap) break; out.push(ch); w += cw; } return out; };
  if (budget < 2) return take([...s], maxW - 1).join('') + '…';
  const headCap = Math.ceil(budget / 2);
  const head = take(body, headCap);
  const tail = take(body.slice().reverse(), budget - headCap).reverse();
  return head.join('') + '…' + tail.join('') + ext;
}
export const CARD_NAME_MAX = 22; // 監控模式卡片檔名上限（含圖示後 360px 卡放得下，且不再被 CSS 二次截斷）
/** 失敗卡的後綴，獨立一塊（不被任務名的 CSS 省略號吃掉） */
export function failSuffix(e) { return '✕ 失敗' + (e.count > 1 ? ` ×${e.count}` : ''); }

export function cardLabel(e, rec) {
  if (!e.ok) return `${e.name} ${failSuffix(e)}`;
  if (e.src === 'post') return midCutWidth(e.name, CARD_NAME_MAX); // 已發布貼文是公開內容，REC 照原標題（產線 Q3）
  if (rec) return e.ext ? `${e.gen}.${e.ext}` : e.gen;
  return midCutWidth(e.name, CARD_NAME_MAX);
}

/** REC 計數器：只算已發布貼文（產線 L-T1：＝月台 post 卡數＝產線 ⑥ 已發布工單數） */
export function recCount(events) { return events.filter(e => e.ok && e.src === 'post').length; }
/** 扣掉還在飛行中、尚未落位的 post 卡（計數器要等卡落位才加一） */
export function recCountLanded(events, flyingIds) { return Math.max(0, recCount(events) - flyingIds.size); }

/** 量好字寬再決定畫布寬。font 為完整字型字串，例："900 54px 'Noto Sans TC',sans-serif"（SPEC §5 問題 2） */
export function labelCanvasWidth(ctx, text, font, pad) {
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width) + pad * 2;
}

function luminance(hex) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return NaN;
  const h = hex.slice(1);
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** 代碼標籤樣式：實色塊（底色字壓在部門色上）→ 撐不到 4.5:1 改描邊 → 再撐不到用正文色（SYS 專用） */
export function tagStyle(tone, bg, panel) {
  if (contrast(tone, bg) >= 4.5) return 'solid';
  if (contrast(tone, panel) >= 4.5) return 'outline';
  return 'text';
}

/** 重播排程：照真實間隔除以倍速；壓縮後仍超過 10 秒的空檔壓成 1.5 秒並回報 compressed */
export function sanitizeSpeed(speed) { return speed > 0 && Number.isFinite(speed) ? speed : 60; }
export function replaySchedule(eventsAsc, speed, maxGapMs = 10000, squashMs = 1500) {
  speed = sanitizeSpeed(speed);
  let prev = null, compressed = false;
  const steps = eventsAsc.map(e => {
    let delay = prev ? (Date.parse(e.ts) - Date.parse(prev.ts)) / speed : 800;
    if (!Number.isFinite(delay) || delay < 0) delay = 800;
    if (delay > maxGapMs) { delay = squashMs; compressed = true; }
    prev = e;
    return { e, delay };
  });
  return { steps, compressed };
}
// 2026-10-29：不寫「N 倍速」——空檔會壓縮、產線接管時又是變速，寫固定倍速就是錯的（重播誠實標示，never-do #6）
export function replayLabel(day, compressed, backfill, empty) {
  const [, m, d] = day.split('-');
  if (empty) return `⟲ 重播 · ${+m}/${+d} 沒有產出紀錄`;
  return `⟲ 重播 · ${+m}/${+d} 真實產出 · 變速` + (compressed ? ' · 空檔已壓縮' : '') + (backfill ? ' · 只有交接檔' : '');
}
/** 重播跟產線時鐘時，卡片寫絕對時刻 HH:MM（直接切後台給的 ISO 字串，不換時區） */
export const clockText = ts => (typeof ts === 'string' && ts.length >= 16 ? ts.slice(11, 16) : '');

/** 只為新 key 建節點、移除不要的、順序不對才搬；內容一樣就零 DOM 變動（SPEC §8 第 1、2 條，T9）。
 *  track 只屬於 syncList，不要放其他子元素 */
export function syncList(track, items, keyOf, make, update) {
  const keyed = items.map(it => [String(keyOf(it)), it]);
  const want = new Set(keyed.map(k => k[0]));
  [...track.children].forEach(n => { if (!want.has(n.dataset.id)) n.remove(); });
  const have = new Map([...track.children].map(n => [n.dataset.id, n]));
  const added = [], seen = new Set();
  let prev = null;
  for (const [id, it] of keyed) {
    if (seen.has(id)) continue;
    seen.add(id);
    let n = have.get(id);
    if (!n) { n = make(it); n.dataset.id = id; have.set(id, n); added.push(n); } else update(n, it);
    const anchor = prev ? prev.nextElementSibling : track.firstElementChild;
    if (n !== anchor) track.insertBefore(n, anchor);
    prev = n;
  }
  return added;
}
export function setText(n, t) { if (n && n.textContent !== t) n.textContent = t; }
