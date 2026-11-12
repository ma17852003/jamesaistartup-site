/* ============================================================
 * 出貨月台 3D 層（command-center\SPEC-output-flow-v1.md §5）
 *  - 交件泡泡：出現前先算螢幕矩形，撞到名牌／房名／HUD 就往上抬 4.3→5.0→5.7，
 *    三段都撞就排隊 1.2 秒再試，試 3 次放棄；不准水平挪開（會認錯人）
 *  - 方塊飛行：桌上浮起 300ms → 換成 2D 卡片分身沿弧線飛 900ms → 落位
 *  - 背景分頁 rAF 會停：所有動畫都有 setTimeout 後備，卡片一定會落位
 * 由 dock-overlay.js 動態載入；回傳 { arrive(e, card, done) }
 * ============================================================ */
import { bubbleText, CODE2ZONE, labelCanvasWidth } from './dock-core.js';

const HEIGHTS = [4.3, 5.0, 5.7], GAP_MS = 1200, MAX_TRIES = 3, MAX_LIVE = 3, MAX_QUEUE = 10;
const BUBBLE_MS = 4000, FADE_MS = 300, RISE_MS = 300, FLY_MS = 900;
const CUBE_SIZE = .5, RISE_H = 1.2, ARC_DX = 120, ARC_DY = 60, DESK_OFFSET = [1.0, 1.7, 0.4], ZONE_CHIP_Y = 1.7;

export function initDock3D(office) {
  const { THREE, scene, camera } = office;
  const canvasEl = document.getElementById('c');
  const queue = [];
  let live = 0, lastAt = -Infinity, pumping = false;

  function toScreen(v) {
    const c = v.clone().project(camera);
    return { x: (c.x + 1) / 2 * canvasEl.clientWidth, y: (1 - c.y) / 2 * canvasEl.clientHeight, behind: c.z > 1 };
  }
  function spriteRect(sp) {
    const p = new THREE.Vector3(); sp.getWorldPosition(p);
    const s = new THREE.Vector3(); sp.getWorldScale(s);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const c = toScreen(p), r = toScreen(p.clone().addScaledVector(right, s.x / 2)), u = toScreen(p.clone().addScaledVector(up, s.y / 2));
    const hw = Math.abs(r.x - c.x) * (sp.userData.inkW ?? 1), hh = Math.abs(u.y - c.y) * (sp.userData.inkH ?? 1);
    return { l: c.x - hw, r: c.x + hw, t: c.y - hh, b: c.y + hh, behind: c.behind };
  }
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  function obstacles() {
    const out = [];
    office.people.forEach(p => p.children.forEach(c => {
      if (c.isSprite && c.visible && (c.userData.nameTag || c.userData.dockBubble)) out.push(spriteRect(c));
    }));
    Object.values(office.zoneLabels).forEach(l => { if (l) out.push(spriteRect(l)); });
    document.querySelectorAll('#dk-kpi.show,#dk-dock.show,#dk-status.show,#dk-list.show,#mon-strip.show,#mon-panel.show,.info.show,.todo.show,body.dk-rec #dk-rec-title,body.dk-rec #dk-rec-counter')
      .forEach(n => { const b = n.getBoundingClientRect(); out.push({ l: b.left, r: b.right, t: b.top, b: b.bottom }); });
    return out;
  }
  function fitLabel(text) {
    const T = office.theme(), font = T.font.canvas, size = 54;
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    const fontStr = `900 ${size}px ${font}`;
    const w = labelCanvasWidth(g, text, fontStr, 28); // 寬度照字數量（office3d 的 label() 固定 512px 會切字）
    cv.width = w; cv.height = 128;
    g.font = fontStr; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = T.label.shadow; g.shadowBlur = T.label.shadowBlur; g.fillStyle = T.label.bubble;
    g.fillText(text, w / 2, 64);
    const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.userData.inkW = (w - 28) / w; sp.userData.inkH = (54 * 1.15 + 16) / 128; // 只算字，不算安全邊
    sp.scale.set(1.05 * w / 128, 1.05, 1); // 跟既有 bubble() 同高 1.05
    return sp;
  }
  // 泡泡存在期間讓該員工站定（只在 work 模式、沒有 go 目的地時），避免走動後名牌撞上泡泡
  function freeze(p) {
    const u = p.userData;
    if (u.go || !u.target) return false;
    if (!u.dockFrozen) { u.target.copy(p.position); u.wait = Math.max(u.wait || 0, 99999); }
    u.dockFrozen = (u.dockFrozen || 0) + 1;
    return true;
  }
  function unfreeze(p) {
    const u = p.userData;
    if (!u.dockFrozen) return;
    if (--u.dockFrozen > 0) return;
    u.wait = 60 + Math.random() * 200; // 很快恢復閒晃
  }
  function dispose(sp) {
    if (sp.userData.gone) return;
    sp.userData.gone = true;
    if (sp.userData.dockBubble) live--; // 任何釋放路徑都只還一次名額
    if (sp.userData.frozenPerson) unfreeze(sp.userData.frozenPerson);
    if (sp.parent) sp.parent.remove(sp);
    if (sp.material.map) sp.material.map.dispose();
    sp.material.dispose();
  }
  function retire(sp) {
    const t0 = performance.now();
    const done = () => dispose(sp);
    const fade = t => {
      if (sp.userData.gone) return;
      const k = Math.min((t - t0) / FADE_MS, 1);
      sp.material.opacity = 1 - k;
      if (k < 1) requestAnimationFrame(fade); else done();
    };
    requestAnimationFrame(fade);
    setTimeout(done, FADE_MS + 1500); // rAF 停擺後備
  }
  function tryShow(job) {
    // 自動旋轉時 isBusy() 恆為 true；泡泡掛在人身上會跟著動，碰撞只在出現當下算一次 → 旋轉中仍要出現
    const busy = office.controls.autoRotate ? office.isUserBusy() : office.isBusy();
    if (busy || live >= MAX_LIVE || performance.now() - lastAt < GAP_MS) return 'wait';
    const sp = fitLabel(job.text);
    job.person.add(sp);
    const obs = obstacles();
    for (const y of HEIGHTS) {
      sp.position.set(0, y, 0);
      sp.updateMatrixWorld(true);
      const r = spriteRect(sp);
      if (!r.behind && !obs.some(o => hit(r, o))) {
        sp.userData.dockBubble = true; if (freeze(job.person)) sp.userData.frozenPerson = job.person; live++; lastAt = performance.now();
        setTimeout(() => retire(sp), BUBBLE_MS);
        return 'shown';
      }
    }
    dispose(sp);
    return 'blocked';
  }
  function pump() {
    if (pumping || !queue.length) return;
    pumping = true;
    setTimeout(() => {
      pumping = false;
      const job = queue[0];
      const res = tryShow(job);
      if (res === 'shown' || (res === 'blocked' && ++job.tries >= MAX_TRIES)) queue.shift(); // 試 3 次放棄：事件照記、卡片照飛
      pump();
    }, GAP_MS); // 每次嘗試固定間隔 1.2 秒：使用者拖曳中（'wait'）也不會空轉
  }

  function sourceOf(e) {
    const p = e.agent && office.agentByCode[e.agent];
    if (p) return { person: p, pos: p.position.clone().add(new THREE.Vector3(...DESK_OFFSET)) };
    const z = office.ZONES[CODE2ZONE[e.dept]];
    if (z) return { person: null, pos: new THREE.Vector3((z.x0 + z.x1) / 2, ZONE_CHIP_Y, (z.z0 + z.z1) / 2) };
    return null; // SYS：不飛
  }

  function arrive(e, card, done) {
    const src = sourceOf(e);
    if (!src) { card.classList.add('dk-fade'); done(); return; }
    if (src.person) {
      queue.push({ person: src.person, text: bubbleText(e.gen), tries: 0 });
      if (queue.length > MAX_QUEUE) queue.shift();
      pump();
    }
    const tone = new THREE.Color(getComputedStyle(card).getPropertyValue('--tone').trim() || '#888888');
    const cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
      new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: .6 }));
    cube.position.copy(src.pos);
    scene.add(cube);
    card.style.visibility = 'hidden';
    let ghost = null, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      scene.remove(cube); cube.geometry.dispose(); cube.material.dispose();
      if (ghost) ghost.remove();
      card.style.visibility = '';
      card.classList.add('dk-land');
      done();
    };
    let safety = setTimeout(finish, RISE_MS + FLY_MS + 1300); // 背景分頁也一定落位
    const y0 = src.pos.y, t0 = performance.now();
    const rise = t => {
      if (finished) return;
      const k = Math.min((t - t0) / RISE_MS, 1);
      cube.position.y = y0 + RISE_H * (1 - Math.pow(1 - k, 3));
      if (k < 1) { requestAnimationFrame(rise); return; }
      const b = card.getBoundingClientRect();
      if (!card.isConnected || !b.width) { finish(); return; } // 卡片在飛行前被移出 DOM（視窗縮小／清單重排）：不飛，免得分身飛到 (0,0)
      const s = toScreen(cube.position);
      scene.remove(cube);
      clearTimeout(safety); safety = setTimeout(finish, FLY_MS + 800); // 飛行段自己的後備
      const end = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      const c1 = { x: (s.x + end.x) / 2 - ARC_DX, y: Math.min(s.y, end.y) - ARC_DY };
      ghost = card.cloneNode(true);
      ghost.removeAttribute('data-id');
      ghost.classList.add('dk-ghost');
      ghost.style.visibility = 'visible';
      document.body.appendChild(ghost);
      const frames = [];
      for (let i = 0; i <= 12; i++) {
        const q = i / 12;
        const x = (1 - q) ** 2 * s.x + 2 * q * (1 - q) * c1.x + q * q * end.x;
        const y = (1 - q) ** 2 * s.y + 2 * q * (1 - q) * c1.y + q * q * end.y;
        frames.push({ transform: `translate(${x - b.width / 2}px,${y - b.height / 2}px) scale(${0.6 + 0.4 * q})` });
      }
      ghost.animate(frames, { duration: FLY_MS, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => { clearTimeout(safety); finish(); };
    };
    requestAnimationFrame(rise);
  }

  return { arrive };
}
