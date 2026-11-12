/* ============================================================
 * 自動發文產線 3D（南翼廠房；SPEC §4.2、提案 §2～§3、§5）
 * 幾何移植自 mock\line-concept.html 的 build(W)（James 認可的概念圖）。
 * 只新增物件到 scene，不動任何既有房間／小人／名牌（never-do #10）。
 * 切主題只 material.color.set ＋ 重烤貼圖，不重建幾何；每個 sprite 都存 userData.text（Task 11 用）。
 * ============================================================ */
import * as L from './line-core.js';

export const SX = [-18, -11, -4, 3, 10, 17, 24];   // 7 站 x
export const L1Z = 35.0, L2Z = 44.5, AISLE = 40.3;  // 兩條輸送帶與走道 z（概念圖實測）
export const FLOOR = { x0: -23, x1: 28, z0: 32, z1: 48 };
export const LINE_CAM = { pos: [1.5, 33, 58], target: [1.5, 0, 31.5] }; // 驗收：字高 ≥14px、地板下空帶 ≤10%、兩塊入口站牌整塊入鏡（原 (3,30,66)→(3,0,36.6)）
export const REC_CAM = { pos: [1.6, 23, 72], target: [1.6, 0, 40.6] }; // mock/line-concept.html:432
// 站牌板（提案 §3.3；L-T13 放大：板寬上限＝工單不擋自己站牌，見 TICKET_DX）
export const PLATE = { w: 4.2, h: 1.3, dx: .7, y: .18 + .58, rx: -.9, dz: .86, cw: 512, s1: 64, s2: 34, mx: 12 };
// sprite 版位：監看／REC（REC 照 mock:408）
export const LAYOUT = { nameY: 3.3, nameZ: AISLE, bubbleH: .8 };
export const REC_LAYOUT = { nameY: 3.9, nameZ: L2Z - 3.2, bubbleH: .95, bubbleYs: [3.2, 3.9, 4.6, 5.3, 6.0], entranceDy: .2 }; // REC：泡泡多一段高度（站名下有引擎字時會更高）；入口站牌抬高避開 ① 站牌
export const BUBBLE_YS = [3.2, 3.9, 4.6];          // 泡泡撞到就往上抬（提案 §3.5 防擠第 2 條）
export const REC_MIN_PX = 18;                      // L-T13：REC 1920 站牌第一行投影字高門檻（SPEC §4.2）
export const TICKET_DX = -1.9, QUEUE_GAP = 1.2, MAX_DRAWN = 3, EXIT_DX = 2.0; // 工單在站前 −1.9／−3.1／−4.3

// 崗位 code／站牌第二行引擎預設值（＝C:\s2s\jarvis\line.py STATIONS；資料進來後改用 station.engine）
const ST = [
  { code: 'trend-hunter', e1: 'topic_picker 程式', e2: 'RSS 新聞＋claude -p' },
  { code: 'copywriter', e1: 'Ollama 本機模型', e2: 'claude -p' },
  { code: 'visual-creator', e1: 'Ideogram 4', e2: '輪播卡（封面＋輪播）' },
  { code: 'video-director', e1: 'render_video', e2: 'render_video' },
  { code: 'content-shipper', who: '出貨官（AI 員工）', e1: '出貨官（claude -p＋qwen3-vl）', e2: '出貨官（claude -p＋qwen3-vl）' },
  { code: 'threads-expert', who: '平台專家 ×4', e1: 'Postiz', e2: 'Postiz' },
  { code: 'data-analyst', e1: 'perf.py', e2: 'perf.py' }];
const PLAT = ['TH', 'IG', 'FB', 'YT'];
const BUSY = ['選題中', '寫文中', '配圖中', '壓片中', '評分中', '發布中', '回收中'];
const FY = .18;                                     // 地板頂面
const PLATE_SINGLE = .62;                            // 單行站牌字級上限＝板高 62%
const MACH_DZ = -1.9;                                // 機台在輸送帶後方
const BELT_TOP = FY + .505, TICKET_Y = BELT_TOP + .45;
const CLOCK_Y = FY + 1.7, CLOCK_S = .6, CLOCK_DZ = .3;
const FLAG_Y = FY + 1.66, FLAG_RISE = .66;
const CAM_MS = 800, SLIDE_MS = 1200, SQUASH_MS = 180, BELT_SPEED = 1.2;
const LINE_CENTER = [3, 0, 40], LOD_FAR = 55, TARGET_DRIFT = 25; // 2026-11-12 左鍵改平移，8 太容易誤觸；拖遠了仍由 LOD_FAR 關閉近景
const HUD_SEL = '.bar,#dk-kpi.show,#dk-dock.show,#line-replay,#line-kpi,#mon-strip,#mon-panel';
// __lineMetrics 只給測試／驗收旗標用（?linetest=1、?linecam=1、?rec=）
const METRICS = (q => q.get('linetest') === '1' || q.get('linecam') === '1' || q.has('rec'))(new URLSearchParams(location.search));

export function initLine3D(office, opts = {}) {
  const T = office.THREE, doc = document;
  const root = new T.Group();
  root.name = 'production-line';
  office.scene.add(root);
  try {
    return build();
  } catch (e) {
    office.scene.remove(root); // 蓋到一半壞掉：整層拿掉，不留半成品
    throw e;
  }

  function build() {
  let themeName = office.themeName();
  const tok = () => L.LINE_TOKENS[themeName] || L.LINE_TOKENS.midnight;
  const cur = () => office.theme();
  const brandTone = () => office.ZONES.brand.tone;
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvasEl = doc.getElementById('c');

  /* ── 主題材質（key → 材質＋取色函式；切主題只 color.set）── */
  const TM = {};
  function tm(key, col, basic) {
    if (!TM[key]) {
      const m = basic ? new T.MeshBasicMaterial() : new T.MeshLambertMaterial();
      m.color.set(col()); TM[key] = { m, col };
    }
    return TM[key].m;
  }
  const M = () => tm('machine', () => tok().machine), MD = () => tm('machineDark', () => tok().machineDark);
  const EDGE = () => tm('beltEdge', () => tok().beltEdge), FLOORM = () => tm('floor', () => tok().floor);
  const WALL = () => tm('wall', () => cur().scene.wall), BELTM = () => tm('belt', () => tok().belt);
  const PLATEC = () => tm('plateC', () => tok().plate), BRAND = () => tm('brand', () => brandTone(), true);
  const OUTLINE = new T.LineBasicMaterial({ color: tok().outline || 0x141311 }); // 只有日報主題顯示（提案 §3.1 line.outline）
  const SLOT = new T.MeshLambertMaterial({ color: 0x111122 }), DOT = new T.MeshBasicMaterial({ color: 0x333344 });

  /* ── 烤字貼圖（切主題重烤）── */
  const bakes = [];
  function baked(mat, fn) { mat.map = fn(); bakes.push({ mat, fn }); return mat; }
  function rebake(e) { if (e.mat.map) e.mat.map.dispose(); e.mat.map = e.fn(); e.mat.needsUpdate = true; }

  /* ── helper（照 mock 搬）── */
  function box(g, w, h, d, x, y, z, m, rx, ry, rz) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
    if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; if (rz) o.rotation.z = rz; g.add(o); return o;
  }
  function cyl(g, r, h, x, y, z, m, rx, rz, seg) {
    const o = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 16), m); o.position.set(x, y, z);
    if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; g.add(o); return o;
  }
  function cv(w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c) { const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; t.anisotropy = 8; return t; }
  function fit(s, text, font, size, maxW) {
    let z = size;
    do { s.font = font.replace('{s}', z); if (s.measureText(text).width <= maxW) break; z -= 1; } while (z > 14);
    s.font = font.replace('{s}', z); // 迴圈跑到底時字型要對上回傳的字級
    return z;
  }

  /* ── 站牌板（固定幾何，烤兩行字；txt.fit1 記第一行實際字級給 L-T13 量測）── */
  function plateTex(txt, opt = {}) {
    const k = tok(), cw = opt.cw || 512, ch = opt.ch || 192, mx = opt.mx ?? 44, c = cv(cw, ch), s = c.getContext('2d');
    s.fillStyle = k.plate; s.fillRect(0, 0, cw, ch);
    s.strokeStyle = (opt.border && opt.border()) || hex(k.beltEdge); s.lineWidth = 6; s.strokeRect(3, 3, cw - 6, ch - 6);
    s.textBaseline = 'middle'; s.textAlign = 'left';
    s.fillStyle = opt.c1 || k.plateText;
    if (txt.single) { // L-T13 退路：只剩第一行、放大置中；引擎字搬到站名 sprite 下一行（不消失）
      const l1 = txt.l1.replace(/（[^（）]*）$/, ''); // 「出貨官（AI 員工）」→「出貨官」：括號註記放不下 18px（崗位本來就全是 AI 員工）
      txt.fit1 = fit(s, l1, "900 {s}px 'Noto Sans TC'", Math.round(ch * PLATE_SINGLE), cw - 2 * mx); s.fillText(l1, mx, ch * .52);
      return tex(c);
    }
    txt.fit1 = fit(s, txt.l1, "900 {s}px 'Noto Sans TC'", opt.s1 || 52, cw - 2 * mx); s.fillText(txt.l1, mx, ch * .36);
    s.fillStyle = opt.c2 ? opt.c2() : k.plateMeta; fit(s, txt.l2, opt.f2 || "500 {s}px 'IBM Plex Mono','Noto Sans TC'", opt.s2 || 34, cw - 2 * mx); s.fillText(txt.l2, mx, ch * .73);
    return tex(c);
  }
  function plate(g, txt, x, y, z, w, h, opt = {}) {
    const mat = baked(new T.MeshBasicMaterial(), () => plateTex(txt, opt));
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.order = 'YXZ'; m.rotation.x = opt.rx; if (opt.ry) m.rotation.y = opt.ry; g.add(m);
    const back = new T.Mesh(new T.BoxGeometry(w + .08, h + .08, .06), MD()); back.position.copy(m.position); back.rotation.x = m.rotation.x;
    back.rotation.order = 'YXZ'; if (opt.ry) back.rotation.y = opt.ry; back.translateZ(-.04); g.add(back);
    Object.assign(m.userData, { bake: bakes[bakes.length - 1], txt, w, h, ch: opt.ch || 192, back });
    return m;
  }

  /* ── 輸送帶（貼圖 offset 只在工單滑動時動，never-do #7）── */
  function stripeTex() {
    const c = cv(64, 16), s = c.getContext('2d'); s.fillStyle = hex(tok().belt); s.fillRect(0, 0, 64, 16);
    s.fillStyle = 'rgba(0,0,0,.28)'; s.fillRect(0, 0, 6, 16); const t = tex(c); t.wrapS = T.RepeatWrapping; t.repeat.set(47, 1); return t;
  }
  let beltOffset = { 1: 0, 2: 0 }; // offset 另存：重烤貼圖後照樣接上
  function belt(g, z) {
    const bx0 = -20.2, bx1 = 26.8, len = bx1 - bx0, mx = (bx0 + bx1) / 2;
    box(g, len, .5, 1.5, mx, FY + .25, z, MD());
    const topM = baked(new T.MeshLambertMaterial(), stripeTex);
    const top = new T.Mesh(new T.PlaneGeometry(len, 1.3), topM);
    top.rotation.x = -Math.PI / 2; top.position.set(mx, BELT_TOP, z); g.add(top);
    [-.7, .7].forEach(o => box(g, len, .16, .12, mx, FY + .56, z + o, EDGE()));
    return topM;
  }

  /* ── 機台貼圖 ── */
  function paperTex() {
    const c = cv(128, 128), s = c.getContext('2d'); s.fillStyle = hex(tok().ticket); s.fillRect(0, 0, 128, 128);
    s.fillStyle = 'rgba(60,60,80,.45)'; for (let i = 0; i < 7; i++) s.fillRect(14, 18 + i * 15, i % 3 === 2 ? 60 : 100, 5); return tex(c);
  }
  function clockTex(t) {
    const k = tok(), c = cv(256, 256), s = c.getContext('2d'); s.fillStyle = k.plate; s.fillRect(0, 0, 256, 256);
    s.strokeStyle = hex(cur().lamp.standby); s.lineWidth = 14; s.strokeRect(7, 7, 242, 242);
    s.beginPath(); s.arc(128, 92, 46, 0, 7); s.lineWidth = 9; s.stroke(); s.beginPath(); s.moveTo(128, 92); s.lineTo(128, 62); s.moveTo(128, 92); s.lineTo(152, 104); s.stroke();
    s.fillStyle = k.plateText; s.font = "700 64px 'IBM Plex Mono'"; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText(t, 128, 190); return tex(c);
  }
  function flagTex(code, up) {
    const k = tok(), c = cv(160, 108), s = c.getContext('2d'); s.fillStyle = up ? brandTone() : k.plate; s.fillRect(0, 0, 160, 108);
    s.strokeStyle = up ? k.plate : hex(k.beltEdge); s.lineWidth = 8; s.strokeRect(4, 4, 152, 100);
    s.fillStyle = up ? k.plate : k.plateText; s.font = "700 62px 'IBM Plex Mono'"; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText(code, 80, 58); return tex(c);
  }
  const paperM = baked(new T.MeshLambertMaterial(), paperTex);

  /* ── 七種機台（原點＝站中心，正面＝+z，高度 ≤ 2.6；運轉動態 v1 不做，③畫框與⑤計分板一律空白中性色）── */
  const MACH = [
    function ticker(g) { // ① 收報機
      box(g, 2.0, .9, 1.3, 0, FY + .45, 0, M()); box(g, 1.6, .1, .8, 0, FY + .95, .1, MD(), -.3);
      box(g, .18, .14, .18, .5, FY + 1.0, .3, MD()); box(g, .18, .14, .18, .8, FY + 1.0, .3, MD());
      cyl(g, .05, 1.5, -.55, FY + 1.65, -.25, MD()); cyl(g, .44, .07, -.55, FY + 2.42, -.25, M(), -.9);
      box(g, .5, .02, .9, 1.25, FY + .75, .15, paperM); box(g, .5, .62, .02, 1.4, FY + .44, .6, paperM, 0, 0, .15);
    },
    function typewriter(g) { // ② 打字機
      box(g, 2.0, .55, 1.3, 0, FY + .28, 0, M()); box(g, 1.8, .14, .7, 0, FY + .62, .32, MD(), -.35);
      [.2, .36].forEach((z, i) => box(g, 1.5 - i * .2, .05, .1, 0, FY + .72 - i * .05, z + .05, tm('ticket', () => tok().ticket), -.35));
      cyl(g, .2, 2.1, 0, FY + .86, -.38, MD(), 0, Math.PI / 2);
      box(g, 1.3, 1.15, .03, 0, FY + 1.5, -.42, paperM, -.12);
      box(g, .12, .3, .12, 1.12, FY + .95, -.38, MD());
    },
    function easel(g) { // ③ 畫架＋印表機（四格畫框空白）
      box(g, 1.3, .7, 1.1, -.75, FY + .35, .1, M()); box(g, 1.0, .05, .5, -.75, FY + .66, .62, MD(), .25);
      box(g, .8, .02, .42, -.75, FY + .72, .55, paperM, .25);
      box(g, .08, 2.45, .08, .05, FY + 1.2, -.05, MD(), 0, 0, .12); box(g, .08, 2.45, .08, 1.25, FY + 1.2, -.05, MD(), 0, 0, -.12);
      box(g, .08, 2.2, .08, .65, FY + 1.1, -.55, MD(), .32);
      box(g, 1.62, 1.9, .06, .65, FY + 1.62, -.18, MD());
      [[-.4, .47], [.4, .47], [-.4, -.47], [.4, -.47]].forEach(([dx, dy]) => {
        const m = new T.Mesh(new T.PlaneGeometry(.7, .86), PLATEC()); m.position.set(.65 + dx, FY + 1.62 + dy, -.14); g.add(m);
      });
    },
    function camera(g) { // ④ 攝影機架（紅點閒置＝暗）
      [[-.5, .3], [.5, .3], [0, -.55]].forEach(([x, z]) => { const l = box(g, .07, 1.45, .07, x / 2, FY + .7, z / 2, MD()); l.rotation.z = -x * .55; l.rotation.x = z * .55; });
      box(g, .32, .16, .32, 0, FY + 1.42, 0, MD());
      box(g, .95, .6, .6, 0, FY + 1.8, 0, M());
      cyl(g, .2, .5, 0, FY + 1.8, .52, MD(), Math.PI / 2); cyl(g, .24, .06, 0, FY + 1.8, .78, SLOT, Math.PI / 2);
      const dot = new T.Mesh(new T.SphereGeometry(.08, 10, 10), DOT); dot.position.set(.34, FY + 2.14, .22); g.add(dot);
      [-.22, .3].forEach(x => { cyl(g, .3, .1, x, FY + 2.32, -.05, M(), Math.PI / 2); cyl(g, .07, .12, x, FY + 2.32, -.05, MD(), Math.PI / 2); });
    },
    function desk(g) { // ⑤ 審核台＋大印章＋計分板（計分板空白，不寫「—」免得像缺資料）
      box(g, 2.0, .12, 1.1, 0, FY + 1.05, .15, M());
      [[-.9, -.35], [.9, -.35], [-.9, .65], [.9, .65]].forEach(([x, z]) => box(g, .1, 1.0, .1, x, FY + .5, z, MD()));
      box(g, .7, .02, .85, -.45, FY + 1.12, .2, paperM);
      const sy = FY + 1.8;
      box(g, .62, .3, .62, -.45, sy, .2, MD()); cyl(g, .09, .42, -.45, sy + .36, .2, M());
      const kn = new T.Mesh(new T.SphereGeometry(.15, 10, 10), M()); kn.position.set(-.45, sy + .6, .2); g.add(kn);
      [-.75, .75].forEach(x => box(g, .08, 2.1, .08, x, FY + 1.05, -.55, MD()));
      const sb = new T.Mesh(new T.PlaneGeometry(1.7, .95), PLATEC());
      sb.position.set(0, FY + 2.08, -.5); g.add(sb); box(g, 1.78, 1.03, .06, 0, FY + 2.08, -.54, MD());
    },
    function mail(g, LN) { // ⑥ 四口郵筒架＋待發架（旗子、時鐘由資料驅動）
      box(g, 3.0, 1.25, .9, 0, FY + .625, 0, M()); box(g, 3.1, .1, 1.0, 0, FY + 1.3, 0, MD());
      PLAT.forEach((c, i) => {
        const x = -1.1 + i * .733;
        box(g, .55, .1, .05, x, FY + .95, .46, SLOT);
        cyl(g, .035, 1.3, x - .31, FY + 1.95, -.25, MD(), 0, 0, 8);
        const fl = { up: 0 };
        fl.mesh = new T.Mesh(new T.PlaneGeometry(.64, .44), baked(new T.MeshBasicMaterial(), () => flagTex(c, fl.up >= 1)));
        fl.bake = bakes[bakes.length - 1];
        fl.mesh.position.set(x + .02, FLAG_Y, -.25); g.add(fl.mesh); LN.flags.push(fl);
        const ck = { txt: '' };
        const face = baked(new T.MeshBasicMaterial(), () => clockTex(ck.txt));
        ck.bake = bakes[bakes.length - 1];
        ck.mesh = new T.Mesh(new T.BoxGeometry(CLOCK_S, CLOCK_S, CLOCK_S), [M(), M(), M(), M(), face, M()]);
        ck.mesh.position.set(x, CLOCK_Y, CLOCK_DZ); ck.mesh.visible = false; g.add(ck.mesh); LN.clocks.push(ck);
      });
      [1.95, 2.95].forEach(x => box(g, .08, 1.5, .9, x, FY + .75, 0, MD()));
      [.5, 1.05].forEach(y => box(g, 1.0, .06, .9, 2.45, FY + y, 0, M()));
    },
    function meter(g) { // ⑦ 儀表塔
      box(g, 1.5, .4, 1.0, 0, FY + .2, 0, M());
      [-.35, .35].forEach(x => { box(g, .42, 2.0, .42, x, FY + 1.4, 0, MD()); for (let k = 1; k < 5; k++) box(g, .46, .03, .03, x, FY + .4 + k * .4, .22, M()); });
      box(g, 1.1, .12, .5, 0, FY + 2.44, 0, M());
      const lm = new T.Mesh(new T.SphereGeometry(.13, 10, 10), tm('lampFrozen', () => cur().lamp.frozen, true)); lm.position.set(0, FY + 2.56, 0); g.add(lm);
    }];

  /* ── 狀態燈（站牌左上角；tone＝line-core lampTone：running/standby/frozen/red）── */
  const toneColor = t => (t === 'red' ? cur().css.red : cur().lamp[t] || cur().lamp.frozen);
  function stationLamp(g, x, y, z) {
    const m = new T.Mesh(new T.BoxGeometry(.3, .3, .14), new T.MeshBasicMaterial({ color: toneColor('frozen') })); m.position.set(x, y, z); g.add(m);
    const h = new T.Mesh(new T.PlaneGeometry(.75, .75), new T.MeshBasicMaterial({ color: toneColor('frozen'), transparent: true, opacity: .28, depthWrite: false }));
    h.position.set(x, y, z + .02); h.visible = false; g.add(h);
    return { m, h };
  }

  /* ── 廠房地板＋矮牆＋房名牌 ── */
  const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = FLOOR, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  box(root, X1 - X0, .18, Z1 - Z0, cx, .09, cz, FLOORM());
  [[X1 - X0 + .3, .3, cx, Z0], [X1 - X0 + .3, .3, cx, Z1]].forEach(([w, d, x, z]) => box(root, w, .9, d, x, .45, z, WALL()));
  [X0, X1].forEach(x => box(root, .3, .9, Z1 - Z0, x, .45, cz, WALL()));
  const ROOM_TXT = '品牌部 · 自動發文產線';
  const roomLabel = office.label(ROOM_TXT, 46, brandTone());
  roomLabel.scale.set(13.5, 3.4, 1); roomLabel.position.set(-4, 3.7, Z0 + .4); roomLabel.userData.text = ROOM_TXT; roomLabel.visible = false; root.add(roomLabel);

  /* ── 組兩條線 ── */
  const roster = office.roster || [];
  const who = s => { if (s.who) return s.who; const a = roster.find(r => r.code === s.code); return a ? a.role.split('（')[0] : '{名冊查不到}'; };
  const stations = ST.map(() => ({ plate: {}, lamp: {}, lampTone: { 1: 'frozen', 2: 'frozen' }, staff: null }));
  const lines = {}, outlines = [];
  const PCH = Math.round(PLATE.cw * PLATE.h / PLATE.w), PSIN = Math.sin(-PLATE.rx), PCOS = Math.cos(PLATE.rx);
  for (const [no, bz] of [[1, L1Z], [2, L2Z]]) {
    const G = new T.Group(); G.name = 'line-L' + no; root.add(G);
    const LN = lines[no] = { no, z: bz, G, flags: [], clocks: [], state: null, beltMat: null, seal: null, arrows: null, entrance: null,
      bubble: null, sliding: 0, byStation: new Map() };
    LN.beltMat = belt(G, bz);
    ST.forEach((s, i) => {
      const g = new T.Group(); g.position.set(SX[i], 0, bz + MACH_DZ); G.add(g);
      MACH[i](g, LN);
      const px = SX[i] + PLATE.dx, pz = bz + PLATE.dz;
      const def = '引擎：' + (no === 1 ? s.e1 : s.e2);
      stations[i].plate[no] = plate(G, { l1: who(s), l2: def, def }, px, PLATE.y, pz, PLATE.w, PLATE.h,
        { rx: PLATE.rx, cw: PLATE.cw, ch: PCH, s1: PLATE.s1, s2: PLATE.s2, mx: PLATE.mx });
      stations[i].lamp[no] = stationLamp(G, px - PLATE.w / 2 + .12, PLATE.y + PLATE.h / 2 * PCOS + .14, pz - PLATE.h / 2 * PSIN + .06);
      for (const o of [g, stations[i].plate[no], stations[i].lamp[no].m]) Object.assign(o.userData, { lineStation: i + 1, lineNo: no }); // 點選（Task 9）
      g.traverse(o => {
        if (o.isMesh && o.geometry.type === 'BoxGeometry') {
          const e = new T.LineSegments(new T.EdgesGeometry(o.geometry), OUTLINE); e.visible = !!tok().outline; o.add(e); outlines.push(e);
        }
      });
    });
    // 入口站牌（第二行等資料進來才寫）
    LN.entPosts = [-1.3, 1.3].map(o => box(G, .12, 1.6, .12, -21.0 + o * Math.cos(.55), FY + .8, bz - o * Math.sin(.55), MD()));
    const ent = { l1: no === 1 ? 'L1 造王者' : 'L2 FOMO 水族館', l2: '○ 等待資料', halted: false };
    LN.entrance = plate(G, ent, -21.0, FY + 2.45, bz, 4.4, 1.7,
      { rx: -.15, ry: .55, f2: "900 {s}px 'Noto Sans TC'", s2: 46, s1: 50,
        c2: () => (ent.halted ? tok().plateText : tok().plateMeta), border: () => (ent.halted ? hex(cur().lamp.frozen) : brandTone()) });
    LN.entrance.userData.ent = ent; LN.entrance.userData.y0 = LN.entrance.position.y;
    LN.entrance.userData.backDy = LN.entrance.userData.back.position.y - LN.entrance.position.y;
    // 停機封條（灰＋面板色斜紋，不用黃黑；停機才顯示）
    LN.seal = new T.Group(); LN.seal.visible = false; G.add(LN.seal);
    const tapeM = baked(new T.MeshBasicMaterial(), () => {
      const c = cv(256, 32), s = c.getContext('2d'); s.fillStyle = tok().plate; s.fillRect(0, 0, 256, 32); s.fillStyle = hex(cur().lamp.frozen);
      for (let x = -32; x < 256; x += 32) { s.beginPath(); s.moveTo(x, 32); s.lineTo(x + 16, 0); s.lineTo(x + 32, 0); s.lineTo(x + 16, 32); s.fill(); }
      const t = tex(c); t.wrapS = T.RepeatWrapping; t.repeat.set(4, 1); return t;
    });
    const tx = -19.6;
    box(LN.seal, .22, .34, 5.6, tx, FY + 1.0, bz - 1.0, tapeM); box(LN.seal, .22, .34, 5.6, tx, FY + .5, bz - 1.0, tapeM);
    [bz - 3.7, bz + 1.7].forEach(z => box(LN.seal, .14, 1.25, .14, tx, FY + .62, z, MD()));
    // 出口箭頭（往月台；運轉中才顯示）
    LN.arrows = new T.Group(); LN.arrows.visible = false; G.add(LN.arrows);
    [0, 1, 2].forEach(k => { box(LN.arrows, .5, .04, .14, 26.9 + k * .45, FY + .03, bz - .18, BRAND(), 0, .7); box(LN.arrows, .5, .04, .14, 26.9 + k * .45, FY + .03, bz + .18, BRAND(), 0, -.7); });
  }
  const allPlates = () => [...stations.flatMap(s => [s.plate[1], s.plate[2]]), lines[1].entrance, lines[2].entrance];
  // REC 只拍 L2（SPEC §4.5）：L1 站牌（含背板）與入口站牌不畫；工單、站燈、封條、入口柱照留。泡泡／+N 由 lineVis 擋
  const hideL1 = !!opts.hideL1Text;
  if (hideL1) [...stations.map(s => s.plate[1]), lines[1].entrance].forEach(m => { m.visible = false; m.userData.back.visible = false; });

  /* ── 3D sprite（廠房只有：站名、進度泡泡／紅燈原因、+N；全部只在產線鏡頭顯示）── */
  let lineCam = false, pendingFocus = false, layout = LAYOUT;
  const lineVis = no => lineCam && !(hideL1 && no === 1);
  const NAME_SUB_H = 192; // 單行站牌退路：站名 sprite 加高，下一行放引擎字
  function nameTex(sp) {
    const sub = sp.userData.sub, H = sub ? NAME_SUB_H : 128;
    const C = cur(), c = cv(512, H), x = c.getContext('2d'); x.font = "900 46px 'Noto Sans TC'"; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = C.label.shadow; x.shadowBlur = C.label.shadowBlur; x.fillStyle = C.label.person; x.fillText(sp.userData.text, 256, 64);
    const sb = C.label.shadowBlur || 0; // 墨水區比例：防擠只算字
    let wInk = x.measureText(sp.userData.text).width;
    if (sub) { fit(x, sub, "700 {s}px 'IBM Plex Mono','Noto Sans TC'", 34, 500); x.fillText(sub, 256, 150); wInk = Math.max(wInk, x.measureText(sub).width); }
    sp.userData.inkW = Math.min(1, (wInk + sb * 2) / 512); sp.userData.inkH = Math.min(1, (46 * 1.15 + sb * 2) / 128);
    // 有引擎字時墨水區不對稱：站名頂（64−字高/2）到引擎字底（150＋字高/2），以貼圖高的比例記
    sp.userData.inkY = sub ? [Math.max(0, 64 - 46 * .6 - sb) / H, Math.min(H, 150 + 34 * .6 + sb) / H] : undefined;
    sp.scale.set(4.2, 1.05 * H / 128, 1);
    return tex(c);
  }
  // 站名那一行的位置不變：加高的 sprite 往下挪（站名在貼圖 64px 處）
  const nameY = sp => layout.nameY - (sp.userData.sub ? 1.05 * (NAME_SUB_H / 2 - 64) / 128 : 0);
  // 泡泡：量字寬決定 sprite 寬（kind: run 綠框／sched 橘框／fail 紅字紅框）
  function bubbleTex(sp) {
    const k = tok(), C = cur(), text = sp.userData.text, kind = sp.userData.kind;
    const font = "700 42px 'Noto Sans TC','IBM Plex Mono'";
    const m = cv(10, 10).getContext('2d'); m.font = font;
    const tw = Math.ceil(m.measureText(text).width) + 56, c = cv(tw, 84), s = c.getContext('2d');
    s.fillStyle = k.plate; s.fillRect(0, 0, tw, 84);
    const edge = kind === 'fail' ? C.css.red : hex(kind === 'run' ? C.lamp.running : C.lamp.standby);
    s.strokeStyle = edge; s.lineWidth = 6; s.strokeRect(3, 3, tw - 6, 78);
    s.fillStyle = kind === 'fail' ? C.css.red : k.plateText; s.font = font; s.textBaseline = 'middle'; s.fillText(text, 28, 44);
    sp.scale.set(layout.bubbleH * tw / 84, layout.bubbleH, 1);
    return tex(c);
  }
  function plusTex(sp) {
    const C = cur(), c = cv(256, 128), x = c.getContext('2d'); x.font = "700 64px 'IBM Plex Mono','Noto Sans TC'"; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = C.label.shadow; x.shadowBlur = C.label.shadowBlur; x.fillStyle = C.label.person; x.fillText(sp.userData.text, 128, 64);
    sp.scale.set(1.6, .8, 1); return tex(c);
  }
  function makeSprite(text, kind, fn, opts = { depthWrite: false, depthTest: false }) {
    const sp = new T.Sprite(new T.SpriteMaterial(opts));
    sp.userData.text = text; sp.userData.kind = kind;
    baked(sp.material, () => fn(sp)); sp.userData.bake = bakes[bakes.length - 1];
    return sp;
  }
  function dropSprite(sp) {
    if (!sp) return;
    if (sp.parent) sp.parent.remove(sp);
    const i = bakes.indexOf(sp.userData.bake); if (i >= 0) bakes.splice(i, 1);
    if (sp.material.map) sp.material.map.dispose(); sp.material.dispose();
  }
  const nameSprites = L.STATION_NAMES.map((t, i) => {
    const sp = makeSprite(t, 'name', nameTex, { transparent: true, depthWrite: false });
    sp.position.set(SX[i], layout.nameY, layout.nameZ); sp.visible = false; root.add(sp); return sp;
  });
  const plusSprites = new Map();
  // 產線鏡頭時把圖例與監看膠囊／面板收起來（L-T8：1280 時 #mon-strip 會壓 L2 站牌）；用 <html> 的 class，因為 office applyTheme 會整個覆寫 body.className
  const legendCss = doc.createElement('style');
  legendCss.textContent = 'html.line-cam .legend,html.line-cam #mon-strip,html.line-cam #mon-panel{display:none!important}'; doc.head.appendChild(legendCss);
  function setLineCam(on) {
    lineCam = !!on; office.lineCamActive = lineCam;
    doc.documentElement.classList.toggle('line-cam', lineCam);
    nameSprites.forEach(s => { s.visible = lineCam; });
    roomLabel.visible = lineCam;
    plusSprites.forEach((s, key) => { s.visible = lineVis(+key.split(':')[0]); });
    for (const no of [1, 2]) if (lines[no].bubble) { lines[no].bubble.visible = lineVis(no); placeBubble(lines[no]); }
    if (!lineCam) doc.getElementById('bLine')?.classList.remove('on');
    else measure();
  }
  function applyLayout(rec) {
    layout = rec ? REC_LAYOUT : LAYOUT;
    nameSprites.forEach((sp, i) => sp.position.set(SX[i], nameY(sp), layout.nameZ));
    const dy = layout.entranceDy || 0; // 入口站牌抬高，柱子跟著拉長（不浮空）
    for (const no of [1, 2]) {
      const e = lines[no].entrance, u = e.userData;
      e.position.y = u.y0 + dy; u.back.position.y = e.position.y + u.backDy;
      lines[no].entPosts.forEach(pt => { pt.scale.y = (1.6 + dy) / 1.6; pt.position.y = FY + (1.6 + dy) / 2; });
    }
    for (const no of [1, 2]) if (lines[no].bubble) { rebake(lines[no].bubble.userData.bake); placeBubble(lines[no]); }
  }

  /* ── 螢幕矩形（防擠與 L-T13 量測共用）── */
  function toScreen(v) {
    const c = v.clone().project(office.camera);
    return { x: (c.x + 1) / 2 * canvasEl.clientWidth, y: (1 - c.y) / 2 * canvasEl.clientHeight, behind: c.z > 1 };
  }
  function rectOf(points) {
    const s = points.map(toScreen);
    return { l: Math.min(...s.map(p => p.x)), r: Math.max(...s.map(p => p.x)), t: Math.min(...s.map(p => p.y)), b: Math.max(...s.map(p => p.y)), behind: s.some(p => p.behind) };
  }
  function spriteRect(sp) {
    const p = new T.Vector3(); sp.getWorldPosition(p);
    const s = new T.Vector3(); sp.getWorldScale(s);
    const cam = office.camera, right = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize(), up = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const c = toScreen(p), r = toScreen(p.clone().addScaledVector(right, s.x / 2)), u = toScreen(p.clone().addScaledVector(up, s.y / 2));
    const hw = Math.abs(r.x - c.x) * (sp.userData.inkW ?? 1), half = Math.abs(u.y - c.y), hh = half * (sp.userData.inkH ?? 1), iy = sp.userData.inkY;
    if (iy) return { l: c.x - hw, r: c.x + hw, t: c.y - half + iy[0] * 2 * half, b: c.y - half + iy[1] * 2 * half, behind: c.behind };
    return { l: c.x - hw, r: c.x + hw, t: c.y - hh, b: c.y + hh, behind: c.behind };
  }
  const planeRect = m => { m.updateMatrixWorld(); const { w, h } = m.userData; return rectOf([[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(([x, y]) => m.localToWorld(new T.Vector3(x, y, 0)))); };
  // 時鐘的字烤在正面（+z）：只算正面、扣掉外框那圈（整顆方塊的外框在 REC 斜角下會讓相鄰時鐘互相重疊）
  const CLOCK_INK = .85;
  const faceRect = (m, s) => { m.updateMatrixWorld(); const p = [], k = s * CLOCK_INK; for (const x of [-k, k]) for (const y of [-k, k]) p.push(m.localToWorld(new T.Vector3(x, y, s))); return rectOf(p); };
  const hit = L.rectHit;
  function obstacles(except, noHud) {
    const out = [];
    nameSprites.forEach(sp => { if (sp.visible) out.push(spriteRect(sp)); });
    for (const no of [1, 2]) {
      lines[no].clocks.forEach(ck => { if (L.shown(ck.mesh)) out.push(faceRect(ck.mesh, CLOCK_S / 2)); });
      const b = lines[no].bubble; if (b && b !== except && b.visible) out.push(spriteRect(b));
    }
    allPlates().forEach(m => { if (m.visible) out.push(planeRect(m)); });
    if (!noHud) doc.querySelectorAll(HUD_SEL).forEach(n => { const r = n.getBoundingClientRect(); if (r.width) out.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); });
    return out;
  }
  // 泡泡位置只在產線鏡頭下算一次：固定高度 3.2，撞到就 3.9 → 4.6（不水平挪）
  function placeBubble(LN) {
    const b = LN.bubble; if (!b) return;
    b.position.y = BUBBLE_YS[0]; LN.bubbleHit = 0;
    if (!lineCam) return;
    office.camera.updateMatrixWorld();
    for (const y of layout.bubbleYs || BUBBLE_YS) {
      b.position.y = y; b.updateMatrixWorld(true);
      const r = spriteRect(b), n = obstacles(b).filter(o => hit(r, o)).length;
      LN.bubbleHit = n;
      if (!n) { LN.bubbleWarned = ''; return; }
    }
    const k = `${b.userData.kind}|${Math.round(b.position.x)}`; // 同一種泡泡、同一站只講一次（處理中泡泡每秒重放）
    if (LN.bubbleWarned !== k) { LN.bubbleWarned = k; console.warn(`line: L${LN.no} 泡泡每段高度都會壓到東西（撞 ${LN.bubbleHit}）`); }
  }
  function bubbleHits() {
    office.camera.updateMatrixWorld();
    let n = 0;
    for (const no of [1, 2]) { const b = lines[no].bubble; if (b && b.visible) { b.updateMatrixWorld(true); const r = spriteRect(b); n += obstacles(b).filter(o => hit(r, o)).length; } }
    return n;
  }
  /* L-T13／地板覆蓋：站牌第一行投影字高（最小那塊）＋地板投影高度 ÷ KPI 與月台之間的可用高度 */
  function measure() {
    office.camera.updateMatrixWorld();
    let minPx = Infinity, minL2 = Infinity;
    stations.forEach(st => [1, 2].forEach(no => {
      const m = st.plate[no]; if (!m.visible) return; m.updateMatrixWorld();
      const a = toScreen(m.localToWorld(new T.Vector3(0, m.userData.h / 2, 0))), b = toScreen(m.localToWorld(new T.Vector3(0, -m.userData.h / 2, 0)));
      const px = Math.hypot(a.x - b.x, a.y - b.y) * (m.userData.txt.fit1 || PLATE.s1) / m.userData.ch;
      minPx = Math.min(minPx, px); if (no === 2) minL2 = Math.min(minL2, px);
    }));
    const H = canvasEl.clientHeight;
    let top = 0, bot = H;
    doc.querySelectorAll('.bar,#dk-kpi.show').forEach(n => { const r = n.getBoundingClientRect(); if (r.height) top = Math.max(top, r.bottom); });
    doc.querySelectorAll('#dk-dock.show').forEach(n => { const r = n.getBoundingClientRect(); if (r.height) bot = Math.min(bot, r.top); });
    const fr = rectOf([[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]].map(([x, z]) => new T.Vector3(x, FY, z)));
    const cov = Math.max(0, Math.min(fr.b, bot) - Math.max(fr.t, top)) / Math.max(1, bot - top); // 只供參考，不驗收
    // 驗收：地板下緣到月台頂（可用區底）的空帶 ≤ 0.10；兩塊入口站牌整塊在畫面內
    const gap = Math.max(0, bot - Math.min(fr.b, bot)) / Math.max(1, bot - top);
    const Wc = canvasEl.clientWidth, er = [1, 2].map(no => planeRect(lines[no].entrance));
    const inFrame = er.every(r => !r.behind && r.l >= 0 && r.r <= Wc && r.t >= 0 && r.b <= H);
    const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
    const out = { plateLine1Px: r1(minPx), plateLine1PxL2: r1(minL2), bottomGap: r3(gap), entranceInFrame: inFrame,
      entranceX: er.map(r => [Math.round(r.l), Math.round(r.r)]), floorCoverage: r3(cov),
      viewport: [canvasEl.clientWidth, H], usable: [Math.round(top), Math.round(bot)], cam: layout === REC_LAYOUT ? 'rec' : 'line', plateMode: single ? 'single' : 'two' };
    if (METRICS) window.__lineMetrics = out;
    // L-T13 退路（SPEC §4.2）：REC 量到不足 18px → 站牌改單行、引擎字搬到站名 sprite 下一行；只切一次
    if (layout === REC_LAYOUT && !single && out.plateLine1Px < REC_MIN_PX) {
      console.info(`line: REC 站牌第一行 ${out.plateLine1Px}px < ${REC_MIN_PX} → 改單行站牌`);
      setSingle(true);
      return measure();
    }
    return out;
  }
  let single = false;
  function setSingle(on) {
    single = on;
    stations.forEach((st, i) => {
      for (const no of [1, 2]) { st.plate[no].userData.txt.single = on; rebake(st.plate[no].userData.bake); }
      const sp = nameSprites[i]; sp.userData.sub = on ? st.plate[2].userData.txt.l2 : undefined; rebake(sp.userData.bake); sp.position.y = nameY(sp);
    });
    for (const no of [1, 2]) placeBubble(lines[no]);
  }

  /* ── 崗位分身（提案 §3.6：本尊照常坐辦公室；分身不進 office.people、無名牌、無狀態燈、戴工作帽）──
     2026-11-12 James：「造王者產線上面怎麼沒有人」→ 每站兩個分身，各顧一條線、各自面向自己那條輸送帶，不再轉身。
     L2 分身留在原本的走道位置（REC 只拍 L2，鏡頭量測不變）；L1 分身站在 L1 輸送帶南側、站牌右邊的空隙（站在站牌前面會擋住站名）。 */
  const CREW_X = { 1: 3.4, 2: 0 }, CREW_Z = { 1: L1Z + 1.3, 2: AISLE }, CREW_FACE = { 1: 0, 2: Math.PI }; // L1 朝北（-z）、L2 朝南（+z）
  ST.forEach((s, i) => {
    const a = roster.find(r => r.code === s.code);
    if (!a) { console.warn('line: 名冊查不到崗位', s.code); return; }
    const zone = office.ZONES[a.deptId] || office.ZONES.brand;
    stations[i].staff = [1, 2].map(no => {
    const p = office.person(a, zone, SX[i] + CREW_X[no], CREW_Z[no]);
    const k = office.people.indexOf(p); if (k >= 0) office.people.splice(k, 1);
    office.scene.remove(p); root.add(p);
    const u = p.userData;
    for (const o of [u.nameSprite, u.lamp]) { if (!o) continue; p.remove(o); if (o.material.map) o.material.map.dispose(); }
    u.nameSprite = null; u.lamp = null;
    const capM = new T.MeshLambertMaterial(); capM.color.set(zone.tone).multiplyScalar(.75);
    office.addCap(p, capM); // 只有舊款小人（?look=0）會真的戴上；有造型的人不戴帽，原因見 office3d.html addCap
    const arms = u.parts.arms;
    p.position.set(SX[i] + CREW_X[no], FY, CREW_Z[no]); p.rotation.y = CREW_FACE[no];
    Object.assign(p.userData, { lineStation: i + 1, lineNo: no }); // 點分身＝開他顧的那條線
    return { p, no, deptId: a.deptId, capM, arms, head: u.parts.head, run: 0 };
    });
  });

  /* ── 工單方塊（draft_id 為 key；只建新的、移除消失的、既有的只改屬性）── */
  const tickets = new Map(), flagState = new Map();
  const seals = { 1: lines[1].seal, 2: lines[2].seal };
  let lastSig = '', lastSnap = null, lastChanged = false;
  const baseX = cs => (cs >= 8 ? SX[6] + EXIT_DX : SX[Math.max(1, cs) - 1] + TICKET_DX); // 8＝全部走完，放 ⑦ 出口側
  function ticketTex(t) {
    const k = tok(), c = cv(256, 256), s = c.getContext('2d'); s.fillStyle = hex(k.ticket); s.fillRect(0, 0, 256, 256);
    s.fillStyle = t.failed ? cur().css.red : brandTone(); s.fillRect(0, 150, 256, 58);
    s.fillStyle = '#141311'; s.font = "700 72px 'IBM Plex Mono'"; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText('#' + t.id, 128, 82);
    return tex(c);
  }
  function paintTicket(t) {
    const k = tok();
    if (t.side.map) t.side.map.dispose();
    t.side.map = ticketTex(t); t.side.needsUpdate = true;
    t.side.emissive.set(k.ticket); t.side.emissiveIntensity = t.running ? .45 : .15;
    t.top.color.set(k.ticket); t.top.emissive.set(k.ticket);
    t.cells.forEach((c, i) => { c.material = i < t.lit ? BRAND() : BELTM(); });
  }
  function createTicket(o, no) {
    const g = new T.Group();
    const side = new T.MeshLambertMaterial({ emissive: 0xffffff }), top = new T.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: .15 });
    const body = new T.Mesh(new T.BoxGeometry(.9, .9, .9), [side, side, top, top, side, side]); g.add(body);
    const cells = [];
    for (let i = 0; i < 7; i++) { const c = new T.Mesh(new T.BoxGeometry(.1, .06, .55), BELTM()); c.position.set(-.36 + i * .12, .48, 0); g.add(c); cells.push(c); }
    if (o.type === 'planner') box(g, .2, .2, .2, .3, .55, -.3, BRAND()); // 企劃型書籤
    const t = { id: o.draft_id, lineNo: no, g, side, top, cells, o, station: undefined, x: 0, lsig: '', anim: null };
    g.position.set(0, TICKET_Y, lines[no].z);
    lines[no].G.add(g); tickets.set(o.draft_id, t);
    return t;
  }
  function removeTicket(t) {
    t.g.parent && t.g.parent.remove(t.g);
    t.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    if (t.side.map) t.side.map.dispose(); t.side.dispose(); t.top.dispose();
    tickets.delete(t.id); flagState.delete(t.id);
  }
  const curState = t => (t.station >= 1 && t.station <= 7 ? t.o.stations[t.station - 1]?.state : null);

  function update(snap, nowMs = Date.now()) {
    const s = L.sig(snap);
    if (s === lastSig) { lastChanged = false; return; }
    lastChanged = true;
    const adv = new Map(L.stepsAdvanced(lastSnap, snap).map(a => [a.draft_id, a]));
    lastSig = s; lastSnap = snap;
    const seen = new Set(), now = performance.now();
    for (const no of [1, 2]) {
      const LN = lines[no], ln = (snap.lines || []).find(l => l.brand_id === no);
      const active = !!ln && ln.state === 'active', halted = !!ln && !active;
      LN.state = ln ? ln.state : null;
      seals[no].visible = halted;
      LN.arrows.visible = active;
      // 入口站牌：名字＋lineLabel
      const ent = LN.entrance.userData.ent, l1 = ln ? `L${no} ${ln.name}` : ent.l1, l2 = ln ? L.lineLabel(ln) : ent.l2;
      if (l1 !== ent.l1 || l2 !== ent.l2 || halted !== ent.halted) { ent.l1 = l1; ent.l2 = l2; ent.halted = halted; rebake(LN.entrance.userData.bake); }
      // 工單（停機線一律 0 個，never-do #1）
      const orders = active ? ln.orders || [] : [];
      const byStation = new Map();
      for (const o of orders) {
        seen.add(o.draft_id);
        let t = tickets.get(o.draft_id);
        if (t && t.lineNo !== no) { removeTicket(t); t = null; }
        if (!t) t = createTicket(o, no);
        t.o = o;
        const cs = L.currentStation(o);
        const q = byStation.get(cs) || []; q.push(t); byStation.set(cs, q);
        const k = q.length - 1, x = baseX(cs) - k * QUEUE_GAP;
        t.g.visible = k < MAX_DRAWN;
        const a = adv.get(o.draft_id);
        if (t.anim && t.anim.to === x) { /* 已在往同一個 x 滑，不重來 */ }
        else if (a && t.station !== undefined && !reduce) t.anim = { from: t.g.position.x, to: x, t0: now };
        else { t.anim = null; t.g.position.x = x; t.g.scale.y = 1; }
        t.station = cs; t.x = x;
        Object.assign(t.g.userData, { lineStation: Math.min(7, Math.max(1, cs)), lineNo: no }); // 點工單＝開它目前那站（8＝走完 → ⑦）
        const cur0 = o.stations[Math.min(cs, 7) - 1];
        t.failed = cs <= 7 && cur0?.state === 'failed';
        t.running = cs <= 7 && cur0?.state === 'running';
        t.lit = L.litCells(o);
        const ls = [t.lit, t.failed, t.running, themeName].join('|');
        if (ls !== t.lsig) { t.lsig = ls; paintTicket(t); }
        // ⑥ 旗子：只有位於 ⑥ 或已過 ⑥ 的工單（TH IG FB YT 順序；只有 published＋連結才升）
        if (cs >= 6) {
          const pl = o.stations[5]?.output?.platforms || [];
          flagState.set(o.draft_id, PLAT.map(c => { const p = pl.find(x => x.code === c); return p && L.flagUp(p) ? 1 : 0; }));
        } else flagState.delete(o.draft_id);
      }
      // +N（同站第 4 張起）
      for (const [key, sp] of plusSprites) if (key.startsWith(no + ':') && !((byStation.get(+key.split(':')[1]) || []).length > MAX_DRAWN)) { dropSprite(sp); plusSprites.delete(key); }
      for (const [cs, q] of byStation) {
        if (q.length <= MAX_DRAWN) continue;
        const key = `${no}:${cs}`, text = `+${q.length - MAX_DRAWN}`;
        let sp = plusSprites.get(key);
        if (!sp) { sp = makeSprite(text, 'plus', plusTex); LN.G.add(sp); plusSprites.set(key, sp); }
        else if (sp.userData.text !== text) { sp.userData.text = text; rebake(sp.userData.bake); }
        sp.position.set(baseX(cs) - MAX_DRAWN * QUEUE_GAP, TICKET_Y + .2, LN.z); sp.visible = lineVis(no);
      }
      stations.forEach((st, i) => {
        // 站燈：該站最前那張工單在那一站的 state；沒有工單＝灰（紅只給 failed）
        const front = (byStation.get(i + 1) || [])[0];
        const tone = front ? L.lampTone(front.o.stations[i]?.state) : 'frozen';
        st.lampTone[no] = tone;
        const lp = st.lamp[no]; lp.m.material.color.set(toneColor(tone)); lp.h.material.color.set(toneColor(tone));
        lp.h.visible = tone === 'running' || tone === 'standby'; lp.h.scale.setScalar(1); lp.h.material.opacity = .28;
        // 站牌第二行：資料進來後用 API 的 station.engine（變了才重烤）
        // 有工單在這一站 → 用它的 engine；沒有 → 該線的靜態預設（不向別站的工單借字）
        const txt = st.plate[no].userData.txt, eng = front?.o.stations[i]?.engine;
        const l2 = eng ? '引擎：' + eng : txt.def;
        if (l2 !== txt.l2) {
          txt.l2 = l2; rebake(st.plate[no].userData.bake);
          if (single && no === 2) { const sp = nameSprites[i]; sp.userData.sub = l2; rebake(sp.userData.bake); }
        }
      });
      // ⑥ 機台顯示哪張的旗：在 ⑥ 的最前一張，否則最近走過 ⑥ 的那張
      const at6 = (byStation.get(6) || [])[0] || [...byStation.keys()].filter(c => c > 6).sort((a, b) => a - b).map(c => byStation.get(c)[0])[0];
      const fs = at6 ? flagState.get(at6.id) : [0, 0, 0, 0];
      const pl = at6 ? at6.o.stations[5]?.output?.platforms || [] : [];
      LN.flags.forEach((fl, i) => {
        const up = fs[i] || 0;
        if (up !== fl.up) { fl.up = up; rebake(fl.bake); }
        fl.mesh.position.y = FLAG_Y + up * FLAG_RISE;
        const p = pl.find(x => x.code === PLAT[i]);
        const txt = p && (p.state === 'scheduled' || p.state === 'awaiting_settle') ? L.hm(p.slot) : ''; // 等對帳／已排程：時鐘，不升旗
        const ck = LN.clocks[i];
        if (txt !== ck.txt) { ck.txt = txt; if (txt) rebake(ck.bake); }
        ck.mesh.visible = !!txt;
      });
      LN.byStation = byStation;
      refreshBubble(LN, nowMs);
    }
    for (const t of [...tickets.values()]) if (!seen.has(t.id)) removeTicket(t);
    // 分身：自己那條線的這一站 running 才動工
    stations.forEach(st => { if (st.staff) st.staff.forEach(sf => { sf.run = st.lampTone[sf.no] === 'running' ? sf.no : 0; }); });
  }

  /* ── 泡泡：每線最多 1 個（失敗原因 > 處理中經過時間 > 已排程時鐘），只在產線鏡頭顯示 ── */
  function bubbleFor(LN, nowMs) {
    const all = [...LN.byStation.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, q]) => q.slice(0, MAX_DRAWN));
    const pick = st => all.find(t => curState(t) === st);
    let t = pick('failed');
    if (t) return { t, kind: 'fail', text: '✕ ' + L.shortReason(t.o.stations[t.station - 1].reason) };
    t = pick('running');
    if (t) {
      const s = t.o.stations[t.station - 1], ms = s.started_at ? nowMs - Date.parse(s.started_at) : NaN;
      const el = Number.isFinite(ms) && ms >= 0 ? ` · 已 ${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '';
      return { t, kind: 'run', text: BUSY[t.station - 1] + el };
    }
    t = pick('scheduled');
    if (t) return { t, kind: 'sched', text: L.stateLabel(t.o.stations[t.station - 1]) };
    return null;
  }
  function refreshBubble(LN, nowMs) {
    const b = bubbleFor(LN, nowMs);
    if (!b) { if (LN.bubble) { dropSprite(LN.bubble); LN.bubble = null; } return; }
    if (!LN.bubble) { LN.bubble = makeSprite(b.text, b.kind, bubbleTex); LN.G.add(LN.bubble); }
    else if (LN.bubble.userData.text !== b.text || LN.bubble.userData.kind !== b.kind) { LN.bubble.userData.text = b.text; LN.bubble.userData.kind = b.kind; rebake(LN.bubble.userData.bake); }
    // 已排程：放在 ⑥ 的時鐘正上方；其他：工單正上方
    if (b.kind === 'sched' && b.t.station === 6) LN.bubble.position.set(SX[5], BUBBLE_YS[0], LN.z + MACH_DZ + CLOCK_DZ);
    else LN.bubble.position.set(b.t.x, BUBBLE_YS[0], LN.z);
    LN.bubble.visible = lineVis(LN.no);
    placeBubble(LN);
  }

  /* ── 動畫（rAF；背景分頁靠 tick 的 100ms 後備，時間制所以兩邊一起跑也不會加速）── */
  const ease = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  let lastT = performance.now();
  function animate(t) {
    const dt = Math.min(.25, Math.max(0, (t - lastT) / 1000)); lastT = t;
    for (const no of [1, 2]) lines[no].sliding = 0;
    for (const tk of tickets.values()) {
      const a = tk.anim; if (!a) continue;
      const e = t - a.t0;
      if (e < SLIDE_MS) { tk.g.position.x = a.from + (a.to - a.from) * ease(Math.max(0, e) / SLIDE_MS); lines[tk.lineNo].sliding++; }
      else if (e < SLIDE_MS + SQUASH_MS) { tk.g.position.x = a.to; const k = (e - SLIDE_MS) / SQUASH_MS; tk.g.scale.y = 1 - .1 * Math.sin(Math.PI * k); }
      else { tk.g.position.x = a.to; tk.g.scale.y = 1; tk.anim = null; }
    }
    for (const no of [1, 2]) if (lines[no].sliding) { beltOffset[no] -= dt * BELT_SPEED; lines[no].beltMat.map.offset.x = beltOffset[no]; } // 只在有工單移動時捲
    const et = t / 1000;
    stations.forEach((st, i) => {
      for (const s of st.staff || []) {
        const [a1, a2] = s.arms;
        if (a1 && a2) {
          let r1 = 0, r2 = 0, hx = 0, hy = 0, bz = 0;
          if (s.run && !reduce) {
            const w = Math.sin(et * Math.PI * 2 * (i === 1 ? 6 : 1.4));
            if (i === 0) hx = -.25 + .08 * w;                          // ① 抬頭看碟
            else if (i === 1) { r1 = -.9 + .08 * w; r2 = -.9 - .08 * w; } // ② 雙手交替打字
            else if (i === 2) r2 = -1.2 + .5 * w;                      // ③ 單臂揮刷
            else if (i === 3) { bz = .06 * w; r2 = -1.1; }              // ④ 身體微擺扶攝影機
            else if (i === 4) { r1 = r2 = -2.4 + .2 * w; }              // ⑤ 舉印章
            else if (i === 5) { r1 = r2 = -1.25 + .15 * w; }            // ⑥ 雙手前推
            else hy = .35 * w;                                         // ⑦ 轉頭看量條
          }
          a1.rotation.x = r1; a2.rotation.x = r2; s.head.rotation.x = hx; s.head.rotation.y = hy; s.p.rotation.z = bz;
        }
      }
      if (!reduce) for (const no of [1, 2]) {
        const lp = st.lamp[no];
        if (st.lampTone[no] === 'running') { const b = .5 + .5 * Math.sin(et * Math.PI * 2 / 2.4); lp.h.material.opacity = .12 + .3 * b; lp.h.scale.setScalar(1 + .25 * b); }
      }
    });
  }

  /* ── 主題 ── */
  function retheme() {
    for (const k in TM) TM[k].m.color.set(TM[k].col());
    bakes.forEach(rebake);
    for (const no of [1, 2]) lines[no].beltMat.map.offset.x = beltOffset[no];
    OUTLINE.color.set(tok().outline || 0x141311); outlines.forEach(e => { e.visible = !!tok().outline; });
    for (const t of tickets.values()) { paintTicket(t); t.lsig = [t.lit, t.failed, t.running, themeName].join('|'); }
    stations.forEach(st => {
      for (const no of [1, 2]) { const c = toneColor(st.lampTone[no]); st.lamp[no].m.material.color.set(c); st.lamp[no].h.material.color.set(c); }
      for (const s of st.staff || []) {
      const tone = (office.ZONES[s.deptId] || office.ZONES.brand).tone, P = cur().person, m = s.p.userData.mats;
      m.body.color.set(tone); m.arm.color.set(tone).multiplyScalar(.75); s.capM.color.set(tone).multiplyScalar(.75);
      m.skin.color.setHex(P.skin); m.hair.color.setHex(P.hair); m.eye.color.setHex(P.eye); m.leg.color.setHex(P.leg);
      if (s.p.userData.look) office.lookRetheme(s.p); // 有造型的人：膚色髮色還原成個人的，衣服零件跟部門色
      }
    });
    const n = office.label(ROOM_TXT, 46, brandTone());
    if (roomLabel.material.map) roomLabel.material.map.dispose();
    roomLabel.material.map = n.material.map; roomLabel.material.needsUpdate = true; n.material.dispose();
  }
  // 站牌與工單號用 IBM Plex Mono：沒載過就補一個 link，字型到位後重烤一次（不然 canvas 用 fallback）
  if (!doc.querySelector('link[href*="IBM+Plex+Mono"]')) {
    const fl = doc.createElement('link'); fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&display=swap'; doc.head.appendChild(fl);
  }
  if (doc.fonts && doc.fonts.load) {
    Promise.all(["900 52px 'Noto Sans TC'", "500 34px 'IBM Plex Mono'", "700 34px 'IBM Plex Mono'"].map(f => doc.fonts.load(f)))
      .then(() => { retheme(); if (lineCam) { for (const no of [1, 2]) placeBubble(lines[no]); measure(); } })
      .catch(e => console.warn('line: 站牌字型載入失敗，先用備用字型', e)); // 只會跑一次
  }

  /* ── 鏡頭 ── */
  function focus(rec = false) {
    const c = rec ? REC_CAM : LINE_CAM;
    if ((layout === REC_LAYOUT) !== !!rec) applyLayout(!!rec);
    if (office.controls.autoRotate) doc.getElementById('bRot')?.click(); // 走 office 的 toggleRot，按鈕狀態才一致
    office.controls.autoRotate = false;
    doc.querySelectorAll('.btn.view').forEach(b => b.classList.remove('on'));
    doc.getElementById('bLine')?.classList.add('on');
    // 自己補間（rAF＋tick 100ms 後備）：office 的 camGo 只靠 rAF，背景分頁／headless 會卡在半路
    camAnim = { fp: office.camera.position.clone(), ft: office.controls.target.clone(), tp: new T.Vector3(...c.pos), tt: new T.Vector3(...c.target), t0: performance.now() };
    pendingFocus = true;
  }
  let camAnim = null;
  function stepCam(t) {
    if (!camAnim) return;
    if (office.isUserBusy()) { camAnim = null; pendingFocus = false; return; } // 使用者拖曳或按了別的鏡頭鈕：讓路
    const q = Math.min(1, Math.max(0, (t - camAnim.t0) / CAM_MS)), e = 1 - Math.pow(1 - q, 3);
    office.camera.position.lerpVectors(camAnim.fp, camAnim.tp, e); office.controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
    office.camera.lookAt(office.controls.target); office.camera.updateMatrixWorld();
    if (q >= 1) camAnim = null;
  }
  let lastBubbleSec = 0;
  function tick() {
    if (office.themeName() !== themeName) { themeName = office.themeName(); retheme(); }
    const cam = office.camera.position, tg = office.controls.target, ct = (layout === REC_LAYOUT ? REC_CAM : LINE_CAM).target;
    stepCam(performance.now());
    if (pendingFocus) { if (!camAnim && !office.isUserBusy()) { pendingFocus = false; setLineCam(true); } }
    else if (lineCam) {
      const far = Math.hypot(cam.x - LINE_CENTER[0], cam.y - LINE_CENTER[1], cam.z - LINE_CENTER[2]) > LOD_FAR;
      const drift = Math.hypot(tg.x - ct[0], tg.y - ct[1], tg.z - ct[2]) > TARGET_DRIFT;
      if (far || drift) setLineCam(false);
    }
    // 處理中泡泡的「已 mm:ss」每秒更新（只改貼圖，不加減物件）
    const sec = Math.floor(Date.now() / 1000);
    if (lineCam && sec !== lastBubbleSec) { lastBubbleSec = sec; for (const no of [1, 2]) if (lines[no].bubble?.userData.kind === 'run') refreshBubble(lines[no], (opts.now || Date.now)()); } // 重播時 opts.now＝重播的真實時刻
    animate(performance.now());
  }
  /* ── 點選（Task 9）：pointerup 且移動 <5px 才算點；打 root，第一個看得見的非 sprite／非描邊命中決定（被擋住就不算） ── */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), CLICK_PX = 5;
  let down = null;
  function pickAt(cx, cy) {
    const r = canvasEl.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, office.camera);
    for (const h of ray.intersectObject(root, true)) {
      if (h.object.isSprite || h.object.isLine || !L.shown(h.object)) continue;
      let o = h.object;
      while (o && o !== root && o.userData.lineStation === undefined) o = o.parent;
      return o && o !== root ? { lineNo: o.userData.lineNo, station: o.userData.lineStation } : null;
    }
    return null;
  }
  canvasEl.addEventListener('pointerdown', e => { down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
  canvasEl.addEventListener('pointercancel', e => { if (down && e.pointerId === down.id) down = null; });
  canvasEl.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved >= CLICK_PX || !opts.onPick) return;
    const hit = pickAt(e.clientX, e.clientY);
    opts.onPick(hit ? hit.lineNo : null, hit ? hit.station : null);
  });
  function ticketScreen(did) {
    const t = tickets.get(did); if (!t) return null; t.g.updateMatrixWorld();
    const s = toScreen(t.g.localToWorld(new T.Vector3(0, .45, 0))), r = canvasEl.getBoundingClientRect();
    return { x: s.x + r.left, y: s.y + r.top };
  }
  function plateScreen(no, i) {
    const m = stations[i].plate[no]; m.updateMatrixWorld();
    const s = toScreen(m.localToWorld(new T.Vector3(0, 0, 0))), r = canvasEl.getBoundingClientRect();
    return { x: s.x + r.left, y: s.y + r.top };
  }

  (function frame() { requestAnimationFrame(frame); stepCam(performance.now()); animate(performance.now()); })();

  /* REC：辦公室的字（不在產線 root 底下的 sprite）被 HUD 或產線重點字蓋到就先藏、離開就放回；只動自己藏的那些 */
  const culled = new Set();
  const under = o => { for (; o; o = o.parent) if (o === root) return true; return false; };
  // 辦公室 sprite 清單快取：REC 每幀都要掃，整個 scene traverse 太貴。泡泡／名牌都掛在場景頂層或小人身上，
  // 所以只在「場景頂層子物件數＋每個小人的子物件數」變了才重建（月台／office 泡泡加上去或拿掉都會變）
  let officeSprites = [], spriteKey = '';
  function officeSpriteList() {
    const key = office.scene.children.length + '|' + office.people.reduce((n, p) => n + p.children.length, 0);
    if (key !== spriteKey) { spriteKey = key; officeSprites = []; office.scene.traverse(o => { if (o.isSprite && !under(o)) officeSprites.push(o); }); }
    return officeSprites;
  }
  function cullOffice(rects) {
    office.camera.updateMatrixWorld();
    for (const sp of culled) if (!sp.parent) culled.delete(sp); // 已被移除（泡泡）
    const cands = officeSpriteList().filter(o => o.parent && (o.visible || culled.has(o)));
    for (const sp of cands) {
      if (!L.shown(sp.parent)) continue; // 只看上層（自己可能是被我們藏的）
      const r = spriteRect(sp), on = !r.behind && rects.some(x => hit(r, x));
      if (on && sp.visible) { sp.visible = false; culled.add(sp); }
      else if (!on && culled.has(sp)) { sp.visible = true; culled.delete(sp); }
    }
    return culled.size;
  }

  return { root, focus, tick, update, setLineCam, measure, stations, lines, cullOffice,
    focusing: () => !!camAnim || pendingFocus, nameSprites: () => nameSprites,
    // 以下只給自測用
    ticketsOn: no => [...tickets.values()].filter(t => t.lineNo === no),
    lampStates: no => stations.map(s => s.lampTone[no]),
    lampColor: (no, i) => '#' + stations[i].lamp[no].m.material.color.getHexString(),
    sealVisible: no => !!seals[no]?.visible,
    flags: did => (flagState.get(did) || [0, 0, 0, 0]),
    flagMeshUp: no => lines[no].flags.map(f => (f.mesh.position.y > FLAG_Y + FLAG_RISE / 2 ? 1 : 0)),
    ticketStation: did => tickets.get(did)?.station,
    ticketX: did => tickets.get(did)?.x,
    staffCount: () => stations.reduce((n, s) => n + (s.staff ? s.staff.length : 0), 0),
    staffOn: no => stations.filter(s => s.staff && s.staff.some(sf => sf.no === no)).length,
    armRot: no => stations.flatMap(s => (s.staff || []).filter(sf => !no || sf.no === no).flatMap(sf => sf.arms.map(a => a.rotation.x))),
    staffScreen: (no, i) => { const sf = stations[i].staff.find(x => x.no === no); sf.p.updateMatrixWorld(true); // 分身胸口的螢幕座標（點選測試用）
      const s = toScreen(sf.p.localToWorld(new T.Vector3(0, .9, 0))), r = canvasEl.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; },
    beltOffset: no => lines[no].beltMat.map.offset.x,
    bubbleText: no => lines[no].bubble?.userData.text ?? null,
    bubbleY: no => lines[no].bubble?.position.y,
    clockTopY: () => CLOCK_Y + CLOCK_S / 2,
    bubbleHits, pickAt, plateScreen, ticketScreen,
    keyRects: () => { office.camera.updateMatrixWorld(); return obstacles(null, true).filter(r => !r.behind); }, // 產線鏡頭的重點字（站名／泡泡／時鐘／站牌），不含 HUD
    // 畫面上所有看得見的字（整個場景的 sprite：辦公室房名／人名＋產線重點字），給重播條找空位（A6）
    textRects: () => {
      office.camera.updateMatrixWorld();
      const out = obstacles(null, true).map(r => ({ ...r, line: true }));
      for (const o of officeSpriteList()) if (o.parent && L.shown(o)) out.push({ ...spriteRect(o), line: false }); // 辦公室字可被藏
      root.traverse(o => { if (o.isSprite && L.shown(o)) out.push({ ...spriteRect(o), line: true }); }); // line：產線自己的字（REC 擺位不准壓）
      return out.filter(r => !r.behind);
    },
    objectCount: () => { let n = 0; root.traverse(() => n++); return n; },
    lastUpdateChanged: () => lastChanged,
    visibleSprites: () => { let n = 0; root.traverse(o => { if (o.isSprite && o.visible) n++; }); return n; } };
  }
}
