// 게임 엔진: 맵 그리기, 캐릭터 이동·점프, NPC, 충돌, 카메라, 입력
const Game = (() => {
  const T = Sprites.T;
  const TILE = Sprites.TILE;
  const SPEED = 74;          // 플레이어 이동 속도 (px/초)
  let speedK = 1;            // 개나리 운동화 등으로 빨라지는 배율
  const JUMP_V = 120;        // 점프 초기 속도
  const GRAVITY = 430;
  const SPIN_TIME = 0.42;    // 공중 회전 시간 (초)
  const TALK_RANGE = 24;

  let screen, sg, buffer, bg;   // 화면 캔버스, 장면 버퍼
  let scale = 3, dpr = 1, VW = 320, VH = 180;
  let baseScale = 2;
  const ZOOM_MAX = 3;                                  // 기본보다 최대 3단계 확대
  let zoomStep = Util.storage.get('rp_zoom', 0);       // 사용자가 고른 확대 단계
  let maps = null;
  const mapCache = {};
  let map = null;
  let player = null;
  let npcs = [];
  let allNpcs = {};            // mapId -> npc[]
  let running = false;
  let last = 0;
  let fade = 0, fadeDir = 0, pendingWarp = null;
  let target = null;           // 지금 말 걸 수 있는 대상
  let cam = { x: 0, y: 0 };
  let time = 0;
  let hooks = {};              // 외부(미션·UI) 연결 함수
  let lockMsgAt = -9;
  let safePos = null;          // 마지막으로 서 있던 안전한 자리 (잠긴 문·막힌 칸에서 되돌릴 곳)
  let confetti = [];           // 축하 꽃가루
  const charCache = {};
  let robotImgs = null;

  // ---------------- 입력 ----------------
  const keys = {};
  const pressed = {};
  const joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
  let touchMode = false;

  function bindInput() {
    window.addEventListener('keydown', e => {
      if (isTyping(e)) return;
      const k = normKey(e);
      if (!k) return;
      if (!keys[k]) pressed[k] = true;
      keys[k] = true;
      if (['up', 'down', 'left', 'right', 'space'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { const k = normKey(e); if (k) keys[k] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    screen.addEventListener('click', e => {
      if (!running || hooks.modalOpen()) return;
      const r = screen.getBoundingClientRect();
      const wx = (e.clientX - r.left) / (r.width / VW) + cam.x;
      const wy = (e.clientY - r.top) / (r.height / VH) + cam.y;
      clickWorld(wx, wy);
    });

    // 모바일 조이스틱
    const pad = document.getElementById('joystick');
    const knob = document.getElementById('joyKnob');
    const start = e => {
      touchMode = true;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const r = pad.getBoundingClientRect();
      joy.active = true; joy.id = t.identifier;
      joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
      move(e);
      e.preventDefault();
    };
    const move = e => {
      if (!joy.active) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find(x => x.identifier === joy.id) || list[0];
      const r = pad.getBoundingClientRect();
      const max = r.width * 0.38;
      let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      joy.dx = dx / max; joy.dy = dy / max;
      if (Math.hypot(joy.dx, joy.dy) < 0.2) { joy.dx = 0; joy.dy = 0; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      e.preventDefault();
    };
    const end = e => {
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      if (e.changedTouches && !list.find(x => x.identifier === joy.id)) return;
      joy.active = false; joy.dx = 0; joy.dy = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);

    const btn = (id, key) => {
      const el = document.getElementById(id);
      const down = e => { touchMode = true; pressed[key] = true; el.classList.add('down'); e.preventDefault(); };
      const up = () => el.classList.remove('down');
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
    };
    btn('btnJump', 'space');
    btn('btnTalk', 'e');
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }
  function normKey(e) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': return 'up';
      case 'ArrowDown': case 's': case 'S': return 'down';
      case 'ArrowLeft': case 'a': case 'A': return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      case ' ': case 'Spacebar': return 'space';
      case 'e': case 'E': case 'ㄷ': return 'e';
      case 'Enter': return 'enter';
    }
    return null;
  }
  function consume(k) { const v = pressed[k]; pressed[k] = false; return v; }
  function clearPressed() { for (const k in pressed) pressed[k] = false; }

  // ---------------- 화면 크기 ----------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    // 화면 기기 픽셀 기준으로 정수 배율만 써서 픽셀이 고르게 선명하도록 한다.
    // 한 화면에 세로 약 18~22칸이 보이도록 (작은 화면은 조금 더 크게)
    const devW = Math.round(w * dpr), devH = Math.round(h * dpr);
    const targetH = h < 500 ? 280 : 460;   // PC는 한 칸이 약 32px: 더 촘촘하고 선명하게
    baseScale = Math.max(1, Math.round(devH / targetH));
    zoomStep = Math.max(1 - baseScale, Math.min(ZOOM_MAX, zoomStep));
    scale = baseScale + zoomStep;
    VW = Math.ceil(devW / scale); VH = Math.ceil(devH / scale);
    screen.width = devW; screen.height = devH;
    screen.style.width = w + 'px'; screen.style.height = h + 'px';
    buffer.width = VW * Q; buffer.height = VH * Q;
    bg.imageSmoothingEnabled = false;
    sg.imageSmoothingEnabled = false;
  }

  // ---------------- 확대·축소 ----------------
  function zoom(delta) {
    zoomStep = Math.max(1 - baseScale, Math.min(ZOOM_MAX, zoomStep + delta));
    Util.storage.set('rp_zoom', zoomStep);
    resize();
    snapCamera();
    return zoomInfo();
  }
  function zoomInfo() {
    const r = Math.round(scale / baseScale * 10) / 10;
    return { label: r + 'x', canIn: zoomStep < ZOOM_MAX, canOut: scale > 1 };
  }

  // ---------------- 미니맵 ----------------
  const MM = 4;  // 미니맵 한 칸 크기 (px)
  const mmCache = {};
  const MM_COLORS = {
    [TILE.GRASS]: '#7cbf5a', [TILE.FLOWER]: '#86c463', [TILE.PATH]: '#e3cc94', [TILE.DOOR]: '#e3cc94',
    [TILE.FIELD]: '#c08b5c', [TILE.LINE]: '#e9e2d0', [TILE.WOOD]: '#d8ab76', [TILE.HALL]: '#efebe0',
    [TILE.EXIT]: '#4a90d9', [TILE.CAFE]: '#a9d0e0', [TILE.CARPET]: '#8b7cc4', [TILE.WALL]: '#4b4458',
    [TILE.FENCE]: '#9aa0a8', [TILE.TREE]: '#2f7d3b', [TILE.UP]: '#ffd84a', [TILE.DOWN]: '#ffd84a',
    [TILE.BUILDING]: '#c0c0c0', [TILE.VOID]: '#2a2533',
    [TILE.PAVE]: '#c3c5ca', [TILE.BRICK]: '#c0684f', [TILE.TRACK]: '#c4463a', [TILE.TURF]: '#46a54d', [TILE.COURT]: '#5fb3a1',
    [TILE.SAND]: '#e6d2a3', [TILE.STEP]: '#b3afa5', [TILE.PILOTI]: '#9a9ba2', [TILE.PARK]: '#9a9ca3', [TILE.BRIDGE]: '#cfd8e0', [TILE.MAT]: '#f2d4c0',
    [TILE.ROAD]: '#5d6168', [TILE.STAND]: '#8fb0f0', [TILE.CANOPY]: '#7fc9bd',
    [TILE.HEDGE]: '#3f7f3a', [TILE.SIDEWALK]: '#c9c3b6', [TILE.CLIFF]: '#8c887e', [TILE.LOWPAVE]: '#aeb0b6', [TILE.GARDEN]: '#7a5a3a', [TILE.OSTAIR]: '#d4d0c6', [TILE.FOREST]: '#2f6a33',
    [TILE.BTREE]: '#2f7d3b', [TILE.PTREE]: '#2f7d3b'
  };
  function minimapImage(m) {
    if (mmCache[m.id]) return mmCache[m.id];
    const c = document.createElement('canvas');
    c.width = m.w * MM; c.height = m.h * MM;
    const g = c.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      g.fillStyle = MM_COLORS[World.get(m, x, y)] || '#888';
      g.fillRect(x * MM, y * MM, MM, MM);
    }
    for (const b of m.buildings) {
      if (b.cells) {
        for (const k of b.cells) { const [x, y] = k.split(',').map(Number); g.fillStyle = b.cells.has(x + ',' + (y + 1)) ? b.roof : b.wall; g.fillRect(x * MM, y * MM, MM, MM); }
        if (b.doors) { g.fillStyle = '#5b3b24'; for (const k of b.doors) { const [x, y] = k.split(',').map(Number); g.fillRect(x * MM, y * MM, MM, MM); } }
        continue;
      }
      g.fillStyle = b.roof; g.fillRect(b.x * MM, b.y * MM, b.w * MM, (b.h - b.floors) * MM);
      g.fillStyle = b.wall; g.fillRect(b.x * MM, (b.y + b.h - b.floors) * MM, b.w * MM, b.floors * MM);
      g.fillStyle = '#5b3b24';
      for (const d of (b.doors || [{ x: b.door, w: b.doorW }])) g.fillRect(d.x * MM, (b.y + b.h - 1) * MM, d.w * MM, MM);
    }
    g.fillStyle = 'rgba(60,50,70,0.55)';
    for (const o of m.objects) if (o.solid) g.fillRect(o.hit.x / T * MM, o.hit.y / T * MM, Math.max(1, o.hit.w / T * MM), Math.max(1, o.hit.h / T * MM));
    let out = c;
    if (m.mmBox) {   // 학교 둘레만 잘라 보여 준다
      const [bx, by, bw, bh] = m.mmBox;
      out = document.createElement('canvas'); out.width = bw * MM; out.height = bh * MM;
      out.getContext('2d').drawImage(c, -bx * MM, -by * MM);
    }
    out.box = m.mmBox || [0, 0, m.w, m.h];
    mmCache[m.id] = out;
    return out;
  }
  let mmKey = '';
  function drawMinimap() {
    const cv = document.getElementById('minimap');
    if (!cv || !map || !player || cv.offsetParent === null) return;
    const img = minimapImage(map);
    const cssW = cv.clientWidth;
    const maxH = parseFloat(getComputedStyle(cv).maxHeight) || 150;
    const k = Math.min(cssW / img.width, maxH / img.height);
    const key = map.id + '|' + cssW + '|' + dpr;
    if (key !== mmKey) {
      mmKey = key;
      cv.style.height = Math.round(img.height * k) + 'px';
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(img.height * k * dpr);
    }
    const g = cv.getContext('2d');
    const z = k * dpr;                   // 미니맵 px → 화면 px
    const ox = (cv.width - img.width * z) / 2;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#2a2533'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, ox, 0, img.width * z, img.height * z);
    const W2 = v => ox + (v / T - img.box[0]) * MM * z, H2 = v => (v / T - img.box[1]) * MM * z;
    // 지금 보이는 화면 범위
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(1, dpr);
    g.save(); g.beginPath(); g.rect(ox, 0, img.width * z, img.height * z); g.clip();
    g.strokeRect(W2(Math.max(0, cam.x)), H2(Math.max(0, cam.y)), Math.min(VW, map.w * T) / T * MM * z, Math.min(VH, map.h * T) / T * MM * z);
    g.restore();
    // 목표 표시
    const blink = Math.sin(time * 6) > -0.3;
    const targets = hooks.minimapTargets ? hooks.minimapTargets(map.id) : [];
    for (const t of targets) {
      if (!blink) continue;
      const r = (t.kind === 'npc' ? 4 : 3) * dpr;
      g.fillStyle = t.kind === 'npc' ? '#ffd84a' : '#ff9b42';
      g.strokeStyle = '#2b2233'; g.lineWidth = dpr;
      g.beginPath();
      const x = W2(t.x), y = H2(t.y);
      g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
      g.fill(); g.stroke();
    }
    // 나
    const px = W2(player.x), py = H2(player.y - 4);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 4.2 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8364f'; g.beginPath(); g.arc(px, py, 2.8 * dpr, 0, Math.PI * 2); g.fill();
    // 북쪽 표시
    g.font = `900 ${11 * dpr}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.lineWidth = 3 * dpr; g.strokeStyle = '#2b2233'; g.strokeText('N', 4 * dpr, 3 * dpr);
    g.fillStyle = '#ffffff'; g.fillText('N', 4 * dpr, 3 * dpr);
  }

  // ---------------- 맵 ----------------
  // ---------------- 고화질: 내부 2배 해상도 + 픽셀 계단을 다듬는 Scale2x(EPX) ----------------
  const Q = 2;
  const hiCache = new WeakMap();
  function smooth2x(src) {
    const w = src.width, h = src.height;
    if (!w || !h) return null;
    let data;
    // 읽기 전용 복사본에서 화소를 읽는다 (원본 캔버스를 여러 번 읽는 경고를 피한다)
    try { data = (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0); return g; })().getImageData(0, 0, w, h); }
    catch (e) { return null; }
    const s = new Uint32Array(data.data.buffer);
    const out = document.createElement('canvas'); out.width = w * 2; out.height = h * 2;
    const og = out.getContext('2d'), od = og.createImageData(w * 2, h * 2), d = new Uint32Array(od.data.buffer), W2 = w * 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const P = s[y * w + x];
        const A = y > 0 ? s[(y - 1) * w + x] : P, D = y < h - 1 ? s[(y + 1) * w + x] : P;
        const C = x > 0 ? s[y * w + x - 1] : P, B = x < w - 1 ? s[y * w + x + 1] : P;
        const o = (y * 2) * W2 + x * 2;
        d[o] = (C === A && C !== D && A !== B) ? A : P;
        d[o + 1] = (A === B && A !== C && B !== D) ? B : P;
        d[o + W2] = (D === C && D !== B && C !== A) ? C : P;
        d[o + W2 + 1] = (B === D && B !== A && D !== C) ? D : P;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }
  function drawHi(img, x, y) {
    if (img.hiRes) { bg.drawImage(img, x, y, img.width / 2, img.height / 2); return; }
    let h = hiCache.get(img);
    if (h === undefined) { h = smooth2x(img); hiCache.set(img, h); }
    bg.drawImage(h || img, x, y, img.width, img.height);
  }
  // 지도 그림은 바뀌지 않으므로 한 번 그려 다시 쓴다.
  // renderMapGen 은 조금씩 나눠 그릴 수 있게 중간중간 쉬어 간다(yield) → 첫 화면에서 틈틈이 미리 그린다.
  function renderMap(m) {
    if (mapCache[m.id]) { m.treeList = mapCache[m.id].treeList; return mapCache[m.id]; }
    const it = renderMapGen(m);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  function* renderMapGen(m) {
    if (mapCache[m.id]) { m.treeList = mapCache[m.id].treeList; return mapCache[m.id]; }
    const c = document.createElement('canvas');
    c.width = m.w * T; c.height = m.h * T;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    // 지붕이 있는 칸(중앙현관 차양, 스탠드 차양막)은 덩어리로 묶어 지붕을 따로 그린다
    const TL = Sprites.TILE, ROOF = new Set([TL.CANOPY, TL.STAND]);
    const seen = new Set(), groups = [], floorAt = {};
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t0 = World.get(m, x, y);
      if (!ROOF.has(t0) || seen.has(x + ',' + y)) continue;
      const cells = [], q = [[x, y]]; seen.add(x + ',' + y);
      while (q.length) {
        const [cx, cy] = q.pop(); cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if (!seen.has(k) && World.get(m, nx, ny) === t0) { seen.add(k); q.push([nx, ny]); }
        }
      }
      // 스탠드 아래 바닥: 넓은 것은 아래쪽, 긴 것은 왼쪽 이웃 칸 중 가장 많은 바닥
      let floor = null;
      if (t0 === TL.STAND) {
        const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
        const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
        const cnt = {};
        for (const [cx, cy] of cells) {
          const nb = wide ? World.get(m, cx, cy + 1) : World.get(m, cx - 1, cy);
          if (!ROOF.has(nb) && !Sprites.SOLID.has(nb)) cnt[nb] = (cnt[nb] || 0) + 1;
        }
        floor = Number(Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || TL.PAVE);
        for (const [cx, cy] of cells) floorAt[cx + ',' + cy] = floor;
      }
      groups.push({ type: t0, cells });
    }
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const f = floorAt[x + ',' + y];
        Sprites.drawTile(g, f != null ? f : World.get(m, x, y), x, y, World.get(m, x, y + 1));
      }
      if (y % 6 === 5) yield;
    }
    // 고해상도: 바닥을 다듬어 2배로 → 자주 보이는 바닥은 2배 그림으로 다시 → 건물은 따로 다듬어 위에 얹는다
    // 바깥 지도는 학교와 둘레 길(hiBox)만 2배로 만든다. 학교 밖 동네는 1배 그림을 그대로 키워 쓴다 (가볍게)
    const [bx, by, bw, bh] = m.mmBox || [0, 0, m.w, m.h];
    let crop = c;
    if (m.mmBox) { crop = document.createElement('canvas'); crop.width = bw * T; crop.height = bh * T; crop.getContext('2d').drawImage(c, -bx * T, -by * T); }
    yield;
    c.hi = smooth2x(crop);
    c.hiBox = [bx, by, bw, bh];
    yield;
    if (c.hi) {
      const hg = c.hi.getContext('2d');
      hg.translate(-bx * 32, -by * 32);
      let fbox = null;
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
        const t0 = floorAt[x + ',' + y] != null ? floorAt[x + ',' + y] : World.get(m, x, y);
        if (t0 === TL.GARDEN) Sprites.drawGardenHi(hg, x, y);
        else Sprites.drawTileHi(hg, t0, x, y);
        if (t0 === TL.TURF) fbox = fbox ? [Math.min(fbox[0], x), Math.min(fbox[1], y), Math.max(fbox[2], x + 1), Math.max(fbox[3], y + 1)] : [x, y, x + 1, y + 1];
        if (x === bx + bw - 1 && (y - by) % 3 === 2) yield;
      }
      yield;
      if (fbox) Sprites.drawFieldHi(hg, fbox, 5.5, (x, y) => { const k = World.get(m, x, y); return k === TL.TURF || k === TL.TRACK; });
      yield;
      // 차선·횡단보도처럼 지도에 바로 그리는 선 (2배 해상도)
      for (const o of m.objects) if (o.bake) { hg.save(); hg.scale(2, 2); o.bake(hg); hg.restore(); }
      // 건물은 2배 크기 캔버스에 바로 그리고(g.hi), 가는 줄눈·창틀 같은 반 칸 디테일을 더한다 (학교 안 건물만)
      const bc = document.createElement('canvas'); bc.width = bw * 32; bc.height = bh * 32;
      const bg1 = bc.getContext('2d'); bg1.imageSmoothingEnabled = false; bg1.scale(2, 2); bg1.translate(-bx * T, -by * T); bg1.hi = true;
      const inBox = b => { for (const k of b.cells) { const [x, y] = k.split(',').map(Number); return x >= bx && y >= by && x < bx + bw && y < by + bh; } return true; };
      for (const b of m.buildings) if (!b.cells || inBox(b)) { Sprites.drawBuilding(bg1, b); yield; }
      hg.drawImage(bc, bx * 32, by * 32);
    }
    yield;
    for (const o of m.objects) if (o.bake) o.bake(g);
    for (const b of m.buildings) Sprites.drawBuilding(g, b);
    yield;
    // 나무 (앞뒤 순서대로 그리는 키 큰 나무)
    m.treeList = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t0 = World.get(m, x, y);
      if (t0 === TL.TREE || t0 === TL.BTREE || t0 === TL.PTREE) m.treeList.push({ x: x * T, y: y * T + T - 29, by: y * T + T - 2, img: Sprites.treeFor(x, y, t0 !== TL.TREE) });
    }
    c.treeList = m.treeList;
    if (mapCache[m.id]) { m.treeList = mapCache[m.id].treeList; return mapCache[m.id]; }   // 그사이 다른 쪽에서 다 그렸다
    mapCache[m.id] = c;
    roofCache[m.id] = groups.map(gr => {
      const xs = gr.cells.map(r => r[0]), ys = gr.cells.map(r => r[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs) + 1, y1 = Math.max(...ys) + 1;
      const rc = document.createElement('canvas'); rc.width = (x1 - x0) * T; rc.height = (y1 - y0) * T + 10;
      const rg = rc.getContext('2d'), local = gr.cells.map(([x, y]) => [x - x0, y - y0]);
      if (gr.type === TL.CANOPY) Sprites.drawCanopyRoof(rg, local, x1 - x0, y1 - y0); else Sprites.drawStandRoof(rg, local);
      return { img: rc, x: x0 * T, y: y0 * T - 6, cells: new Set(gr.cells.map(c => c[0] + ',' + c[1])), a: 1 };
    });
    return c;
  }
  const roofCache = {};
  function drawRoofs(cx, cy) {
    const list = roofCache[map.id];
    if (!list) return;
    const ptx = Math.floor(player.x / T), pty = Math.floor((player.y - 1) / T);
    for (const r of list) {
      const under = r.cells.has(ptx + ',' + pty) || r.cells.has(ptx + ',' + (pty - 1));
      r.a += ((under ? 0.32 : 1) - r.a) * 0.18;
      bg.globalAlpha = r.a;
      drawHi(r.img, Math.round(r.x) - cx, Math.round(r.y) - cy);
    }
    bg.globalAlpha = 1;
  }

  // 캐릭터 그림은 처음 화면에 나올 때 만든다 (입장할 때 수십 명을 한꺼번에 그리지 않게)
  function lazyFrames(o, key, pal) {
    Object.defineProperty(o, 'frames', { get: () => charFrames(key, pal), configurable: true, enumerable: true });
    return o;
  }
  function charFrames(key, pal) {
    if (!charCache[key]) charCache[key] = Sprites.makeChar(pal);
    return charCache[key];
  }

  const KID_NAMES = ['지호', '서연', '하준', '서윤', '도윤', '지우', '시우', '하윤', '주원', '수아', '예준', '지안', '건우', '채원', '우진', '다은', '현우', '소율', '민재', '예린', '태윤', '나은', '준서', '아린', '은우', '서아', '로운', '하린', '이안', '유나'];
  function spawnNpcs(m, content) {
    const list = [];
    for (const d of m.npcDefs) {
      const n = {
        id: d.id, role: d.role, def: d, x: d.tx * T + T / 2, y: d.ty * T + T - 1, dir: d.face || 'down',
        anim: 0, moving: false, wander: false
      };
      if (d.role === 'robot') {
        n.name = '로봇 교장선생님';
      } else {
        lazyFrames(n, d.pal, Sprites.NPC_PALETTES[d.pal]);
        if (d.role === 'mission') n.name = content.missions[d.order - 1].npc;
        if (d.role === 'side') n.name = content.sides.find(s => s.id === d.side).npc;
        if (d.role === 'friend') { const f = content.friends.find(x => x.id === d.id); n.name = f ? f.name : d.id; }
        if (d.role === 'teacher') n.name = d.name;
      }
      list.push(n);
    }
    // 분위기 NPC
    const rand = Util.rng(m.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    let k = 0;
    for (const z of m.zones) {
      for (let i = 0; i < z.n; i++) {
        let tries = 0, tx, ty;
        do {
          tx = z.x + Math.floor(rand() * z.w); ty = z.y + Math.floor(rand() * z.h); tries++;
        } while (tries < 40 && (!walkableTile(m, tx, ty) || objectAt(m, tx * T + 8, ty * T + 12) || nearSpecial(m, list, tx * T + 8, ty * T + 15)));
        if (tries >= 40) continue;
        const teacher = false;   // 교실마다 담임 선생님이 따로 있다
        const pal = teacher ? Sprites.NPC_PALETTES[rand() < 0.5 ? 'teacher1' : 'teacher2'] : Sprites.randomStudentPalette(rand);
        const key = m.id + '_amb' + (k++);
        list.push(lazyFrames({
          id: key, role: 'ambient', key: z.key, teacher, name: KID_NAMES[Math.floor(rand() * KID_NAMES.length)],
          x: tx * T + T / 2, y: ty * T + T - 1, dir: ['down', 'left', 'right', 'up'][Math.floor(rand() * 4)],
          anim: rand() * 2, moving: false, wander: true, zone: z, t: rand() * 3, vx: 0, vy: 0
        }, key, pal));
      }
    }
    return list;
  }

  // 단서·미션 NPC 바로 옆에는 분위기 NPC를 두지 않는다
  function nearSpecial(m, list, x, y) {
    if (list.some(n => n.role !== 'ambient' && Math.hypot(n.x - x, n.y - y) < 32)) return true;
    return m.objects.some(o => o.interact && Math.hypot(o.hit.x + o.hit.w / 2 - x, o.hit.y + o.hit.h - y) < 32);
  }

  function walkableTile(m, tx, ty) {
    return !Sprites.SOLID.has(World.get(m, tx, ty)) && !m.warps.some(w => w.x === tx && w.y === ty);
  }
  function objectAt(m, x, y) {
    return m.objects.some(o => o.solid && !o.hidden && x >= o.hit.x - 2 && x < o.hit.x + o.hit.w + 2 && y >= o.hit.y - 2 && y < o.hit.y + o.hit.h + 2);
  }

  function blocked(m, x, y, hw, hh) {
    const x0 = x - hw, x1 = x + hw, y0 = y - hh, y1 = y;
    for (let ty = Math.floor(y0 / T); ty <= Math.floor((y1 - 0.01) / T); ty++) {
      for (let tx = Math.floor(x0 / T); tx <= Math.floor((x1 - 0.01) / T); tx++) {
        if (Sprites.SOLID.has(World.get(m, tx, ty))) return true;
      }
    }
    for (const o of m.objects) {
      if (!o.solid || o.hidden) continue;
      const h = o.hit;
      if (x1 > h.x && x0 < h.x + h.w && y1 > h.y && y0 < h.y + h.h) return true;
    }
    return false;
  }

  function moveEntity(e, dx, dy, hw, hh) {
    if (dx && !blocked(map, e.x + dx, e.y, hw, hh)) e.x += dx;
    if (dy && !blocked(map, e.x, e.y + dy, hw, hh)) e.y += dy;
  }

  // ---------------- 시작·맵 이동 ----------------
  function init(canvasEl, h) {
    screen = canvasEl;
    sg = screen.getContext('2d');
    buffer = document.createElement('canvas');
    bg = buffer.getContext('2d');
    hooks = h;
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    robotImgs = { broken: Sprites.makeRobot(true), fixed: Sprites.makeRobot(false) };
    requestAnimationFrame(loop);
  }

  function newGame(session) {
    maps = World.build();
    allNpcs = {};
    for (const id in maps) allNpcs[id] = spawnNpcs(maps[id], session.content);
    const pal = Sprites.PLAYER_PALETTES[session.player.charIdx];
    player = {
      x: (maps.outdoor.start ? maps.outdoor.start[0] : 23) * T + 8, y: (maps.outdoor.start ? maps.outdoor.start[1] : 34) * T + 12, dir: maps.outdoor.startDir || 'up', anim: 0, moving: false, z: 0, vz: 0, spin: 0, spinUsed: false,
      frames: charFrames('player' + session.player.charIdx, pal)
    };
    loadMap('outdoor');
    fade = 1; fadeDir = -1;
    running = true;
    clearPressed();
  }

  function loadMap(id) {
    map = maps[id];
    safePos = null;
    walk = null;
    npcs = allNpcs[id];
    renderMap(map);
    Sound.playMusic(map.music);
    hooks.mapChanged && hooks.mapChanged(map);
    snapCamera();
  }

  function warpTo(w) {
    pendingWarp = w;
    fadeDir = 1;
    Sound.sfx('door');
  }

  function stop() { running = false; }

  // ---------------- 갱신 ----------------
  function loop(ts) {
    const dt = Math.max(0, Math.min(0.05, (ts - last) / 1000 || 0));
    last = ts;
    time += dt;
    if (running) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // 화면 전환(페이드)
    if (fadeDir) {
      fade += fadeDir * dt * 4;
      if (fadeDir > 0 && fade >= 1) {
        fade = 1;
        const w = pendingWarp; pendingWarp = null;
        loadMap(w.to);
        player.x = w.ax * T; player.y = w.ay * T; player.dir = w.dir; safePos = null;
        snapCamera();
        fadeDir = -1;
      } else if (fadeDir < 0 && fade <= 0) { fade = 0; fadeDir = 0; }
    }

    const modal = hooks.modalOpen();
    const frozen = modal || fadeDir > 0;

    // 플레이어 이동
    let mx = 0, my = 0;
    if (!frozen) {
      if (keys.left) mx -= 1;
      if (keys.right) mx += 1;
      if (keys.up) my -= 1;
      if (keys.down) my += 1;
      if (joy.active && (joy.dx || joy.dy)) { mx = joy.dx; my = joy.dy; }
      if (mx || my) walk = null;   // 방향키·조이스틱을 쓰면 클릭 이동은 멈춘다
      else if (walk) {
        const w = walkDir(dt);
        if (w) {
          const step = SPEED * speedK * dt;
          if (step >= w[2]) { mx = w[0] * w[2] / step; my = w[1] * w[2] / step; } else { mx = w[0]; my = w[1]; }
          const bx = player.x, by = player.y;
          walk && (walk.lastX = bx, walk.lastY = by);
        }
      }
    } else if (modal) walk = null;
    const len = Math.hypot(mx, my);
    player.moving = len > 0.01;
    if (player.moving) {
      if (len > 1) { mx /= len; my /= len; }
      if (Math.abs(mx) > Math.abs(my)) player.dir = mx < 0 ? 'left' : 'right';
      else player.dir = my < 0 ? 'up' : 'down';
      moveEntity(player, mx * SPEED * speedK * dt, my * SPEED * speedK * dt, 5, 4);
      player.anim += dt * 8;
      if (walk && walk.lastX != null) {
        if (Math.abs(player.x - walk.lastX) + Math.abs(player.y - walk.lastY) < 0.05) { walk.stuck += dt; if (walk.stuck > 0.6) walk = null; }
        else walk.stuck = 0;
      }
    }

    // 점프·공중 회전
    if (!frozen && consume('space')) {
      if (player.z <= 0) {
        player.vz = JUMP_V; player.z = 0.01; player.spinUsed = false; Sound.sfx('jump');
      } else if (!player.spinUsed) {
        player.spinUsed = true; player.spin = SPIN_TIME; player.vz = Math.max(player.vz, 80); Sound.sfx('spin');
      }
    }
    if (player.z > 0) {
      player.vz -= GRAVITY * dt;
      player.z += player.vz * dt;
      if (player.z <= 0) { player.z = 0; player.vz = 0; player.spin = 0; }
    }
    if (player.spin > 0) player.spin = Math.max(0, player.spin - dt);

    // 문·계단
    if (!fadeDir && player.z === 0) {
      const tx = Math.floor(player.x / T), ty = Math.floor((player.y - 2) / T);
      const w = map.warps.find(q => q.x === tx && q.y === ty);
      if (w) {
        const msg = w.lock && hooks.lockedWarp ? hooks.lockedWarp(w) : null;
        if (msg) {
          // 잠긴 문: 문에 들어서기 직전의 안전한 자리로 되돌리고 안내 (어느 방향에서 와도 건물 안에 갇히지 않게)
          if (safePos && safePos.map === map) { player.x = safePos.x; player.y = safePos.y; }
          else { const below = World.get(map, w.x, w.y + 1); if (Sprites.SOLID.has(below)) player.y = w.y * T - 3; else player.y = (w.y + 1) * T + 7; }
          if (time - lockMsgAt > 1.2) { lockMsgAt = time; Sound.sfx('wrong'); hooks.toast(msg); }
        } else warpTo(w);
      } else if (!Sprites.SOLID.has(World.get(map, tx, ty))) safePos = { map, x: player.x, y: player.y };
      // 혹시라도 막힌 칸 안에 들어가 있으면 마지막 안전한 자리로 꺼낸다
      if (Sprites.SOLID.has(World.get(map, tx, Math.floor((player.y - 1) / T))) && safePos && safePos.map === map) { player.x = safePos.x; player.y = safePos.y; }
    }

    // NPC
    for (const n of npcs) updateNpc(n, dt);
    updateConfetti(dt);
    updateTraffic(dt);

    // 말 걸 대상 찾기
    target = frozen ? null : findTarget();
    hooks.targetChanged && hooks.targetChanged(target);
    if (!frozen && (consume('e') || consume('enter')) && target) hooks.interact(target);
    if (frozen) { pressed.e = false; pressed.enter = false; pressed.space = modal ? false : pressed.space; }

    updateCamera(dt);
    hooks.tick && hooks.tick(dt);
  }

  function updateNpc(n, dt) {
    if (n.role !== 'ambient') return idleNpc(n, dt);
    if (n.talking > 0) { n.talking -= dt; n.moving = false; return; }
    n.t -= dt;
    if (n.t <= 0) {
      if (n.moving) { n.moving = false; n.t = 1 + Math.random() * 3; }
      else {
        const d = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
        n.dir = d; n.moving = true; n.t = 0.5 + Math.random() * 1.5;
        n.vx = d === 'left' ? -1 : d === 'right' ? 1 : 0;
        n.vy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
      }
    }
    if (n.moving) {
      const z = n.zone, sp = 26 * dt;
      const nx = n.x + n.vx * sp, ny = n.y + n.vy * sp;
      if (nx < z.x * T + 4 || nx > (z.x + z.w) * T - 4 || ny < z.y * T + 6 || ny > (z.y + z.h) * T) { n.moving = false; n.t = 0.5; return; }
      const ox = n.x, oy = n.y;
      moveEntity(n, n.vx * sp, n.vy * sp, 4, 3);
      if (n.x === ox && n.y === oy) { n.moving = false; n.t = 0.3; }
      n.anim += dt * 6;
    }
  }

  // 미션·서브 미션 사람은 제자리에서 두리번, 친구·담임 선생님은 집 근처(반 칸)를 서성인다
  function idleNpc(n, dt) {
    if (n.role === 'robot') return;
    if (n.talking > 0) { n.talking -= dt; n.moving = false; return; }
    if (n.home == null) { n.home = [n.x, n.y]; n.t = 1 + Math.random() * 3; }
    n.t -= dt;
    const pace = n.role === 'friend' || n.role === 'teacher';
    if (n.t <= 0) {
      if (n.moving) { n.moving = false; n.t = 1.5 + Math.random() * 3; }
      else if (pace && Math.random() < 0.55) {
        const d = ['left', 'right', 'up', 'down'][Math.floor(Math.random() * 4)];
        n.dir = d; n.moving = true; n.t = 0.35 + Math.random() * 0.5;
        n.vx = d === 'left' ? -1 : d === 'right' ? 1 : 0; n.vy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
      } else { n.dir = ['down', 'left', 'right', 'down', 'up'][Math.floor(Math.random() * 5)]; n.t = 1.5 + Math.random() * 3; }
    }
    if (n.moving) {
      const sp = 20 * dt, nx = n.x + n.vx * sp, ny = n.y + n.vy * sp;
      if (Math.abs(nx - n.home[0]) > 10 || Math.abs(ny - n.home[1]) > 8) { n.moving = false; n.t = 0.6; return; }
      const ox = n.x, oy = n.y;
      moveEntity(n, n.vx * sp, n.vy * sp, 4, 3);
      if (n.x === ox && n.y === oy) { n.moving = false; n.t = 0.5; }
      n.anim += dt * 6;
    }
  }
  function findTarget() {
    let best = null, bd = Infinity;
    for (const n of npcs) {
      const d = Math.hypot(n.x - player.x, (n.y - player.y) * 1.2);
      const score = n.role === 'ambient' ? d : d * 0.4;
      if (d < TALK_RANGE && score < bd) { best = { type: 'npc', npc: n }; bd = score; }
    }
    for (const o of map.objects) {
      if (!o.interact || o.hidden) continue;
      const h = o.hit;
      const cx = Math.max(h.x, Math.min(player.x, h.x + h.w));
      const cy = Math.max(h.y - 6, Math.min(player.y - 4, h.y + h.h));
      const d = Math.hypot(cx - player.x, cy - (player.y - 4)) + 4;
      // 단서·사물은 지나가는 친구보다 먼저 고른다 (미션 NPC보다는 나중)
      const score = o.interact.type === 'sign' || o.interact.type === 'mirror' ? d : d * 0.5;   // 팻말은 사람보다 나중
      if (d < 18 && score < bd) { best = { type: 'obj', obj: o }; bd = score; }
    }
    return best;
  }

  function clickWorld(wx, wy) {
    let hit = null;
    for (const n of npcs) {
      if (wx >= n.x - 8 && wx <= n.x + 8 && wy >= n.y - 18 && wy <= n.y + 2) hit = { type: 'npc', npc: n };
    }
    if (!hit) {
      for (const o of map.objects) {
        if (o.interact && !o.hidden && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) hit = { type: 'obj', obj: o };
      }
    }
    if (hit) {
      const hx = hit.npc ? hit.npc.x : hit.obj.hit.x + hit.obj.hit.w / 2;
      const hy = hit.npc ? hit.npc.y : hit.obj.hit.y + hit.obj.hit.h;
      if (Math.hypot(hx - player.x, hy - player.y) <= 44) { clearPath(); hooks.interact(hit); return; }
      // 멀리 있으면 그 앞까지 걸어간 뒤 말을 건다
      if (!planPath(hx, hy + (hit.npc ? 4 : 6), true)) planPath(hx, hy - 14, true);
      if (walk) walk.then = hit;
      return;
    }
    planPath(wx, wy, false);
  }

  // ---------------- 클릭한 곳으로 걸어가기 (길 찾기) ----------------
  let walk = null;   // { pts: [[x,y],...], i, goal:[x,y], then, stuck }
  function clearPath() { walk = null; }
  function tileFree(tx, ty, goal) {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
    if (!goal && map.warps.some(w => w.x === tx && w.y === ty)) return false;
    return !blocked(map, tx * T + 8, ty * T + 12, 5, 4);
  }
  // 가장 가까운 걸을 수 있는 칸을 목표로 너비 우선 탐색. near = 그 근처까지만 가도 된다
  function planPath(wx, wy, near) {
    const sx = Math.floor(player.x / T), sy = Math.floor((player.y - 1) / T);
    let gx = Math.floor(wx / T), gy = Math.floor(wy / T);
    if (!tileFree(gx, gy, true)) {
      let best = null;
      for (let r = 1; r <= 3 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !tileFree(gx + dx, gy + dy, true)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { x: gx + dx, y: gy + dy, d };
      }
      if (!best) { walk = null; return false; }
      gx = best.x; gy = best.y;
    }
    const W = map.w, prev = new Int32Array(W * map.h).fill(-1), start = sy * W + sx;
    prev[start] = start;
    const q = [start];
    let found = -1;
    for (let qi = 0; qi < q.length && qi < 20000; qi++) {
      const c = q[qi], cx = c % W, cy = (c - cx) / W;
      if (cx === gx && cy === gy) { found = c; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= map.h || prev[ni] >= 0) continue;
        if (!tileFree(nx, ny, nx === gx && ny === gy)) continue;
        prev[ni] = c; q.push(ni);
      }
    }
    if (found < 0) { walk = null; hooks.toast && hooks.toast('그곳으로는 갈 수 없어요.'); return false; }
    const cells = [];
    for (let c = found; c !== start; c = prev[c]) cells.push([c % W, Math.floor(c / W)]);
    cells.reverse();
    // 방향이 바뀌는 곳만 남긴다
    const pts = [];
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i - 1] || [sx, sy], b = cells[i], c2 = cells[i + 1];
      if (!c2 || (b[0] - a[0]) !== (c2[0] - b[0]) || (b[1] - a[1]) !== (c2[1] - b[1])) pts.push([b[0] * T + 8, b[1] * T + 12]);
    }
    walk = { pts, i: 0, goal: [gx * T + 8, gy * T + 12], then: null, stuck: 0, near };
    return true;
  }
  // 이번 프레임에 걸어갈 방향 (없으면 null)
  function walkDir(dt) {
    if (!walk) return null;
    const p = walk.pts[walk.i];
    if (!p) { const h = walk.then; walk = null; if (h) arrive(h); return null; }
    const dx = p[0] - player.x, dy = p[1] - player.y, d = Math.hypot(dx, dy);
    if (d < 1.5) { player.x = p[0]; player.y = p[1]; walk.i++; return walkDir(dt); }
    if (walk.then) {
      const h = walk.then, hx = h.npc ? h.npc.x : h.obj.hit.x + h.obj.hit.w / 2, hy = h.npc ? h.npc.y : h.obj.hit.y + h.obj.hit.h;
      if (Math.hypot(hx - player.x, hy - player.y) < 22) { walk = null; arrive(h); return null; }
    }
    return [dx / d, dy / d, d];
  }
  function arrive(h) {
    const hx = h.npc ? h.npc.x : h.obj.hit.x + h.obj.hit.w / 2, hy = h.npc ? h.npc.y : h.obj.hit.y + h.obj.hit.h;
    const dx = hx - player.x, dy = hy - player.y;
    player.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    if (Math.hypot(dx, dy) <= 44) hooks.interact(h);
  }

  function facePlayer(n) {
    const dx = player.x - n.x, dy = player.y - n.y;
    n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    n.talking = 2.5; n.moving = false;
  }

  function snapCamera() {
    if (!map || !player) return;
    cam.x = clampCam(player.x - VW / 2, map.w * T, VW, camPad().x);
    cam.y = clampCam(player.y - 8 - VH / 2, map.h * T, VH, camPad().y);
  }
  // 실내에서는 지도 끝(왼쪽·위)까지 조금 더 비춰서 왼쪽 위 순서도 창에 사람이 가려지지 않게 한다
  function camPad() { return map && map.id !== 'outdoor' ? { x: 4 * T, y: 3 * T } : { x: 0, y: 0 }; }
  function updateCamera(dt) {
    const tx = clampCam(player.x - VW / 2, map.w * T, VW, camPad().x);
    const ty = clampCam(player.y - 8 - VH / 2, map.h * T, VH, camPad().y);
    const k = Math.min(1, dt * 8);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }
  function clampCam(v, world, view, pad = 0) {
    if (world + pad <= view) return (world - view - pad) / 2;
    return Math.max(-pad, Math.min(world - view, v));
  }

  // ---------------- 그리기 ----------------
  let titleEl = null;
  function render() {
    // 첫 화면이 덮고 있을 때는 게임 화면을 그리지 않는다
    titleEl = titleEl || document.getElementById('title');
    if (!running && titleEl && !titleEl.classList.contains('hidden')) return;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.fillStyle = '#2a2533';
    sg.fillRect(0, 0, screen.width, screen.height);
    if (!map || !player) return;

    const cx = Math.round(cam.x * Q) / Q, cy = Math.round(cam.y * Q) / Q;
    bg.setTransform(Q, 0, 0, Q, 0, 0);
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = '#2a2533';
    bg.fillRect(0, 0, VW, VH);
    const mc = mapCache[map.id];
    {   // 화면에 보이는 부분만 잘라 그린다 (큰 지도 전체를 매번 넘기지 않게)
      const part = (src, k, ox, oy, w, h) => {   // 지도 (ox, oy, w, h) 범위의 그림 src(배율 k)에서 화면에 보이는 부분
        const x0 = Math.max(ox, cx), y0 = Math.max(oy, cy), x1 = Math.min(ox + w, cx + VW), y1 = Math.min(oy + h, cy + VH);
        if (x1 > x0 && y1 > y0) bg.drawImage(src, (x0 - ox) * k, (y0 - oy) * k, (x1 - x0) * k, (y1 - y0) * k, x0 - cx, y0 - cy, x1 - x0, y1 - y0);
      };
      const hb = mc.hiBox;
      if (!mc.hi) part(mc, 1, 0, 0, mc.width, mc.height);
      else {
        const full = hb[0] === 0 && hb[1] === 0 && hb[2] * T === mc.width && hb[3] * T === mc.height;
        const inside = cx >= hb[0] * T && cy >= hb[1] * T && cx + VW <= (hb[0] + hb[2]) * T && cy + VH <= (hb[1] + hb[3]) * T;
        if (!full && !inside) part(mc, 1, 0, 0, mc.width, mc.height);   // 학교 밖 동네 (1배)
        part(mc.hi, 2, hb[0] * T, hb[1] * T, hb[2] * T, hb[3] * T);
      }
    }

    // 바닥에 붙은 사물 먼저
    const flat = [], items = [];
    for (const o of map.objects) {
      if (o.hidden) continue;
      if (o.w < 4000 && (o.x - cx > VW + 8 || o.x + o.w - cx < -8 || o.y - cy > VH + 8 || o.y + o.h - cy < -8)) continue;   // 화면 밖
      if (!o.solid) flat.push(o); else items.push({ y: o.y + o.h, o });
    }
    for (const o of flat) drawHi(o.img, Math.round(o.x) - cx, Math.round(o.y) - cy);
    drawTraffic(cx, cy);
    if (walk) {   // 클릭한 목적지
      const k = (Math.sin(time * 6) + 1) / 2, gx = Math.round(walk.goal[0] - cx), gy = Math.round(walk.goal[1] - cy - 3);
      bg.strokeStyle = `rgba(255,216,74,${0.6 + 0.4 * k})`; bg.lineWidth = 1;
      bg.beginPath(); bg.ellipse(gx, gy, 5 + k, 3 + k * 0.5, 0, 0, Math.PI * 2); bg.stroke();
    }
    for (const tr of map.treeList || []) {
      if (tr.x - cx > VW + 16 || tr.x - cx < -32 || tr.y - cy > VH + 8 || tr.by - cy < -8) continue;
      items.push({ y: tr.by, tree: tr });
    }
    for (const n of npcs) items.push({ y: n.y, n });
    items.push({ y: player.y + 0.5, p: true });
    items.sort((a, b) => a.y - b.y);

    const st = hooks.status ? hooks.status() : {};
    for (const it of items) {
      if (it.tree) { bg.drawImage(it.tree.img, it.tree.x - cx, it.tree.y - cy, 16, 29); continue; }
      if (it.o) {
        drawHi(it.o.img, Math.round(it.o.x) - cx, Math.round(it.o.y) - cy);
        if (st.sparkle && st.sparkle(it.o)) sparkle(it.o.x + it.o.w / 2 - cx, it.o.y - cy + 2);
      } else if (it.n) drawNpc(it.n, cx, cy, st);
      else drawPlayer(cx, cy);
    }
    for (const o of flat) if (st.sparkle && st.sparkle(o)) sparkle(o.x + o.w / 2 - cx, o.y - cy + 4);
    drawRoofs(cx, cy);
    bg.globalAlpha = 0.38; drawPlayer(cx, cy); bg.globalAlpha = 1;

    drawDark(cx, cy, st);
    applyLighting(cx, cy, st);
    drawConfetti(cx, cy);

    // 버퍼를 화면에 확대
    const s = scale;
    const ui = dpr;   // 글자 최소 크기용 (CSS 픽셀 → 기기 픽셀)
    sg.imageSmoothingEnabled = false;
    sg.imageSmoothingEnabled = s / Q > 1.01; sg.imageSmoothingQuality = 'high';
    sg.drawImage(buffer, 0, 0, VW * Q, VH * Q, 0, 0, VW * s, VH * s);
    sg.imageSmoothingEnabled = false;
    // 교훈석 글씨
    for (const o of map.objects) {
      if (o.kind !== 'mottorock' || o.hidden) continue;
      const lines = ['슬기롭고', '정의로우며', '튼튼하게 자란다.'];
      const fx = (o.x + 28 - cx) * s, fy = (o.y + 9 - cy) * s, fw = 44 * s, fh = 24 * s;
      sg.save();
      let size = fh / lines.length * 0.82;
      sg.font = `700 ${size}px "Nanum Myeongjo", "Batang", "Noto Serif KR", serif`;
      const widest = Math.max(...lines.map(l => sg.measureText(l).width));
      if (widest > fw) { size *= fw / widest; sg.font = `700 ${size}px "Nanum Myeongjo", "Batang", "Noto Serif KR", serif`; }
      sg.textAlign = 'center'; sg.textBaseline = 'middle';
      lines.forEach((l, i) => {
        const y = fy + (i + 0.5) * (fh / lines.length);
        sg.fillStyle = 'rgba(255,255,255,0.45)'; sg.fillText(l, fx + Math.max(1, s * 0.3), y + Math.max(1, s * 0.3));
        sg.fillStyle = '#3a2c1f'; sg.fillText(l, fx, y);
      });
      sg.restore();
    }
    // 교표는 화면 해상도로 선명하게 덧그린다
    if (Sprites.EMBLEM.complete && Sprites.EMBLEM.naturalWidth) {
      sg.imageSmoothingEnabled = true;
      for (const o of map.objects) {
        if (o.hidden || (o.kind !== 'emblem' && o.kind !== 'emblemwall')) continue;
        const r = o.kind === 'emblem' ? [4, 3, 24, 26] : [0, 0, 24, 26];
        sg.drawImage(Sprites.EMBLEM, Math.round((o.x + r[0] - cx) * s), Math.round((o.y + r[1] - cy) * s), Math.round(r[2] * s), Math.round(r[3] * s));
      }
      sg.imageSmoothingEnabled = false;
    }

    // 글자 (화면 해상도로 선명하게)
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    for (const b of map.buildings) {
      if (!b.signRect) continue;
      text(b.name, (b.signRect.x + b.signRect.w / 2 - cam.x) * s, (b.signRect.y + 6 - cam.y) * s, 7 * s, '#3a2c1a', null, true);
    }
    for (const l of map.labels) {
      textTag(l.text, (l.x - cam.x) * s, (l.y - cam.y) * s, Math.max(5.2 * s, 11 * ui));
    }
    for (const n of npcs) {
      if (!n.name) continue;
      textTag(n.name, (n.x - cam.x) * s, (n.y - 22 - cam.y) * s - Math.max(0, 10 * ui - 4.6 * s) * 0.6, Math.max(4.6 * s, 10 * ui), n.role === 'mission' ? '#fff3c4' : n.role === 'side' ? '#d9f2ff' : n.role === 'friend' ? '#e6ffd9' : n.role === 'teacher' ? '#f1e2ff' : '#eee');
    }
    const tag = hooks.playerTag ? hooks.playerTag() : null;
    if (tag && !(target && Math.abs(targetPoint(target).x - player.x) < 30)) {
      textTag(tag, (player.x - cam.x) * s, (player.y - 24 - player.z - cam.y) * s - Math.max(0, 10 * ui - 4.6 * s) * 0.6, Math.max(4.2 * s, 10 * ui), '#ffe9a8', 'rgba(30,24,40,0.6)');
    }
    if (target && !touchMode) {
      const p = targetPoint(target);
      const verb = target.type === 'npc' ? '대화하기' : '살펴보기';
      textTag('E  ' + verb, (p.x - cam.x) * s, (p.y - cam.y) * s - Math.max(0, 12 * ui - 5 * s), Math.max(5 * s, 12 * ui), '#ffffff', '#3c6bd8');
    }

    if (fade > 0) {
      sg.fillStyle = `rgba(20,16,28,${fade})`;
      sg.fillRect(0, 0, screen.width, screen.height);
    }
    const gt = hooks.guide ? hooks.guide() : null;
    if (gt && !fade) drawGuide(gt, s, ui);
    drawMinimap();
  }

  // 노란 별 길잡이: 목표가 화면 안이면 그 위에, 밖이면 화면 가장자리에서 방향을 가리킨다
  function drawGuide(gt, s, ui) {
    const W = screen.width, H = screen.height;
    let x = (gt.x - cam.x) * s, y = (gt.y - cam.y) * s;
    const side = document.querySelector('.hud-side');
    const rightPad = side ? (side.offsetWidth + 24) * ui : 260 * ui;
    const L = 40 * ui, R = W - 40 * ui, Tp = 120 * ui, B = H - 60 * ui;
    const inside = x > L && x < W - 30 * ui && y > Tp && y < B;
    const bob = Math.sin(time * 5) * 4 * ui;
    if (inside) {
      if (gt.kind === 'npc') return;          // NPC 머리 위에는 이미 ! 표시가 있다
      if (inDark(gt.x, gt.y)) return;        // 깜깜한 방 안의 목표는 손전등을 비춰야 별이 보인다
      star(x, y - 16 * ui + bob, 11 * ui);
      return;
    }
    // 화면 중심에서 목표 쪽으로 가장자리에 붙인다 (오른쪽 위 미니맵 자리는 피한다)
    const cx = W / 2, cy = H / 2;
    const dx = x - cx, dy = y - cy;
    let k = 1;
    if (dx > 0) k = Math.min(k, (R - cx) / dx);
    if (dx < 0) k = Math.min(k, (L - cx) / dx);
    if (dy > 0) k = Math.min(k, (B - cy) / dy);
    if (dy < 0) k = Math.min(k, (Tp - cy) / dy);
    let ex = cx + dx * k, ey = cy + dy * k;
    if (ex > W - rightPad && ey < (side ? side.offsetHeight * ui + 40 * ui : 300 * ui)) ey = Math.max(ey, side.offsetHeight * ui + 40 * ui);
    const ang = Math.atan2(dy, dx);
    // 화살표
    sg.save();
    sg.translate(ex, ey); sg.rotate(ang);
    sg.fillStyle = '#ffd84a'; sg.strokeStyle = '#2b2233'; sg.lineWidth = 3 * ui;
    sg.beginPath(); sg.moveTo(30 * ui, 0); sg.lineTo(16 * ui, -10 * ui); sg.lineTo(16 * ui, 10 * ui); sg.closePath();
    sg.stroke(); sg.fill();
    sg.restore();
    star(ex, ey, 14 * ui + Math.sin(time * 5) * 1.5 * ui);
  }
  function star(x, y, r) {
    sg.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      sg.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    sg.closePath();
    sg.fillStyle = '#ffd84a'; sg.strokeStyle = '#2b2233'; sg.lineWidth = Math.max(2, r * 0.22);
    sg.lineJoin = 'round'; sg.stroke(); sg.fill();
  }

  // ---------------- 어두운 방 (정전된 창고) ----------------
  // 방 안은 거의 보이지 않고, 손전등이 있으면 플레이어 주변과 바라보는 쪽만 밝다.
  let darkCanvas = null, dkg = null;
  function inDark(x, y) {
    return (map.darkZones || []).some(z => x > z.x * T - 6 && x < (z.x + z.w) * T + 6 && y > z.y * T - 4 && y < (z.y + z.h) * T + 18);
  }
  function drawDark(cx, cy, st) {
    if (!map.darkZones || !map.darkZones.length) return;
    if (!darkCanvas) { darkCanvas = document.createElement('canvas'); dkg = darkCanvas.getContext('2d'); }
    if (darkCanvas.width !== VW || darkCanvas.height !== VH) { darkCanvas.width = VW; darkCanvas.height = VH; }
    dkg.globalCompositeOperation = 'source-over';
    dkg.clearRect(0, 0, VW, VH);
    dkg.fillStyle = 'rgba(3, 4, 12, 0.97)';
    for (const z of map.darkZones) dkg.fillRect(z.x * T - cx, z.y * T - cy - 6, z.w * T, z.h * T + 6);
    if (inDark(player.x, player.y)) {
      const lit = !!st.flashlight;
      dkg.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r, a) => {
        const gr = dkg.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.85})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        dkg.fillStyle = gr; dkg.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const px = player.x - cx, py = player.y - 8 - cy;
      if (lit) {
        hole(px, py, 26, 1);
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
        hole(px + d[0] * 26, py + d[1] * 22, 30, 1);
      } else hole(px, py, 11, 0.8);
    }
    bg.imageSmoothingEnabled = true; bg.drawImage(darkCanvas, 0, 0, VW, VH); bg.imageSmoothingEnabled = false;
    // 불빛이 가까이 가면 찾을 물건 위에 별이 떠오른다 (멀리 있으면 안 보인다)
    if (inDark(player.x, player.y) && st.flashlight && st.sparkle) {
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
      const lx = player.x + d[0] * 20, ly = player.y - 8 + d[1] * 18;
      for (const o of map.objects) {
        if (o.hidden || !st.sparkle(o) || !inDark(o.x + o.w / 2, o.y + o.h)) continue;
        const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
        const dist = Math.hypot(ox - lx, oy - ly), R = 64;
        if (dist > R) continue;
        darkStar(ox - cx, o.y - cy - 2, Math.min(1, (R - dist) / 24));
      }
    }
  }
  function darkStar(x, y, a) {
    const k = (Math.sin(time * 5) + 1) / 2, r = 7 + k * 2;
    const gr = bg.createRadialGradient(x, y, 0, x, y, r * 2.2);
    gr.addColorStop(0, `rgba(255,236,120,${0.55 * a})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
    bg.fillStyle = gr; bg.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    bg.fillStyle = `rgba(255,224,74,${a})`;
    bg.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      bg.lineTo(Math.round(x + Math.cos(ang) * rr), Math.round(y + Math.sin(ang) * rr));
    }
    bg.closePath(); bg.fill();
    bg.strokeStyle = `rgba(150,100,0,${a})`; bg.lineWidth = 1; bg.stroke();
  }

  // ---------------- 학교 밖 도로의 자동차 ----------------
  // map.traffic = [{ pts: [[x, y], ...] (px), gap: [최소, 최대] 초 }]  차는 선을 따라 달리다 끝에서 사라진다.
  const CAR_COLORS = ['#f4f4f4', '#2b2b33', '#9aa0a8', '#c4463a', '#3d6fe9', '#e8e8e8', '#5a6b7a', '#ffd23a'];
  let cars = [], carImgs = null, trafficMap = null;
  function laneLen(l) {
    if (l.len) return l.len;
    l.seg = []; l.len = 0;
    for (let i = 1; i < l.pts.length; i++) { const d = Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]); l.seg.push(d); l.len += d; }
    return l.len;
  }
  function lanePos(l, s) {
    let i = 0;
    while (i < l.seg.length - 1 && s > l.seg[i]) { s -= l.seg[i]; i++; }
    const [x0, y0] = l.pts[i], [x1, y1] = l.pts[i + 1], k = Math.min(1, s / l.seg[i]);
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, a: Math.atan2(y1 - y0, x1 - x0) };
  }
  function updateTraffic(dt) {
    if (!map || !map.traffic) { cars = []; return; }
    if (trafficMap !== map) {
      // 맵에 들어올 때 도로마다 차를 몇 대 미리 깔아 둔다
      trafficMap = map; cars = [];
      if (!carImgs) carImgs = CAR_COLORS.map(c => Sprites.makeCarTop(c));
      for (const l of map.traffic) {
        laneLen(l); l.next = 1 + Math.random() * 3;
        for (let s = Math.random() * 120; s < l.len; s += 140 + Math.random() * 160) cars.push({ l, s, v: 34 + Math.random() * 14, img: carImgs[Math.floor(Math.random() * carImgs.length)] });
      }
    }
    for (const l of map.traffic) {
      l.next -= dt;
      if (l.next <= 0) {
        l.next = l.gap[0] + Math.random() * (l.gap[1] - l.gap[0]);
        if (!cars.some(c => c.l === l && c.s < 40)) cars.push({ l, s: 0, v: 34 + Math.random() * 14, img: carImgs[Math.floor(Math.random() * carImgs.length)] });
      }
    }
    // 앞차와 너무 가까우면 속도를 줄인다
    for (const c of cars) {
      const ahead = cars.filter(o => o.l === c.l && o.s > c.s).reduce((m2, o) => Math.min(m2, o.s - c.s), Infinity);
      const v = ahead < 34 ? 0 : ahead < 60 ? c.v * 0.5 : c.v;
      c.s += v * dt;
    }
    cars = cars.filter(c => c.s < c.l.len);
  }
  function drawTraffic(cx, cy) {
    if (!map || !map.traffic || trafficMap !== map) return;
    for (const c of cars) {
      const p = lanePos(c.l, c.s);
      const x = p.x - cx, y = p.y - cy;
      if (x < -30 || y < -30 || x > VW + 30 || y > VH + 30) continue;
      bg.save();
      bg.translate(Math.round(x), Math.round(y));
      bg.rotate(p.a + Math.PI / 2);
      drawHi(c.img, -7, -12);
      bg.restore();
    }
  }

  // ---------------- 축하 꽃가루 ----------------
  let morphStart = 0;
  function principalFrames() { return charFrames('principalF', Sprites.NPC_PALETTES.principalF); }
  function transformRobot() {
    const r = (allNpcs.outdoor || []).find(n => n.role === "robot");
    morphStart = time;
    if (r) { celebrate(r.x, r.y - 8); setTimeout(() => celebrate(r.x, r.y - 8), 800); }
  }
  function celebrate(x, y) {
    const cols = ['#ffd84a', '#ff6b8b', '#5ad6ff', '#7be07b', '#ffffff', '#b98cff'];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
      confetti.push({ x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 2.5 + Math.random() * 1.5, c: cols[i % cols.length], s: Math.random() < 0.5 ? 1 : 2 });
    }
  }
  function updateConfetti(dt) {
    if (!confetti.length) return;
    for (const p of confetti) { p.vy += 120 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    confetti = confetti.filter(p => p.life > 0);
  }
  function drawConfetti(cx, cy) {
    for (const p of confetti) { bg.fillStyle = p.c; bg.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.s, p.s + (p.life * 10 % 2 > 1 ? 1 : 0)); }
  }

  // ---------------- 시간대 조명 (낮·노을·밤·새벽) ----------------
  let lightCanvas = null, lg = null;
  function applyLighting(cx, cy, st) {
    const ph = DayNight.phase();
    if (ph === 'day') return;
    const out = map.id === 'outdoor';
    if (ph === 'dawn' || ph === 'sunset') {
      bg.save();
      bg.globalCompositeOperation = 'multiply';
      bg.fillStyle = ph === 'sunset' ? (out ? '#ffb48a' : '#ffe3cf') : (out ? '#ffd2c8' : '#fff0ea');
      bg.fillRect(0, 0, VW, VH);
      bg.restore();
      return;
    }
    // 밤: 실내는 불이 켜져 있어 조금만 어둡게
    if (!out) { bg.fillStyle = 'rgba(20, 24, 70, 0.14)'; bg.fillRect(0, 0, VW, VH); return; }
    if (!lightCanvas) { lightCanvas = document.createElement('canvas'); lg = lightCanvas.getContext('2d'); }
    if (lightCanvas.width !== VW || lightCanvas.height !== VH) { lightCanvas.width = VW; lightCanvas.height = VH; }
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, VW, VH);
    lg.fillStyle = 'rgba(6, 10, 38, 0.66)';
    lg.fillRect(0, 0, VW, VH);
    lg.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const gr = lg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(player.x - cx, player.y - 8 - cy, 78, 0.95);
    for (const n of npcs) {
      const mk = st.markFor ? st.markFor(n) : null;
      if (mk === '!' || mk === '?') hole(n.x - cx, n.y - 12 - cy, 30, 0.8);
    }
    for (const o of map.objects) if (st.sparkle && st.sparkle(o) && !inDark(o.x + o.w / 2, o.y + o.h)) hole(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy, 22, 0.7);
    bg.imageSmoothingEnabled = true; bg.drawImage(lightCanvas, 0, 0, VW, VH); bg.imageSmoothingEnabled = false;
    // 건물 창문에 불 켜기
    for (const b of map.buildings) {
      (b.windows || []).forEach((w, i) => {
        if (((i * 7919 + b.x * 31) % 10) < 3) return;   // 일부 창문은 꺼 둔다
        const x = w.x - cx, y = w.y - cy;
        if (x < -12 || y < -12 || x > VW + 12 || y > VH + 12) return;
        bg.fillStyle = 'rgba(255, 214, 110, 0.18)'; bg.fillRect(x - 3, y - 3, w.w + 6, w.h + 6);
        bg.fillStyle = '#ffd36b'; bg.fillRect(x, y, w.w, w.h);
        bg.fillStyle = '#fff1b8'; bg.fillRect(x, y, 3, 2);
      });
    }
  }

  function targetPoint(t) {
    if (t.type === 'npc') return { x: t.npc.x, y: t.npc.y - 31 };
    return { x: t.obj.x + t.obj.w / 2, y: t.obj.y - 6 };
  }

  function drawShadow(x, y, w) {
    bg.fillStyle = 'rgba(0,0,0,0.22)';
    bg.beginPath();
    bg.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2);
    bg.fill();
  }

  function drawNpc(n, cx, cy, st) {
    const x = Math.round(n.x - cx), y = Math.round(n.y - cy);
    drawShadow(x, y - 1, 5);
    if (n.role === 'robot') {
      // 클리어하면 로봇 교장선생님이 사람 교장선생님(여)으로 변신한다
      const mt = morphStart ? time - morphStart : (st.robotHuman ? 9 : -1);
      if (mt >= 0 && mt < 1.6) {
        const k = Math.sin(Math.min(1, mt / 1.6) * Math.PI);
        bg.fillStyle = `rgba(255,250,220,${0.35 + 0.5 * k})`;
        bg.beginPath(); bg.ellipse(x, y - 8, 10 + 14 * k, 14 + 18 * k, 0, 0, Math.PI * 2); bg.fill();
        for (let i = 0; i < 6; i++) {
          const a = time * 4 + i * Math.PI / 3, rr = 12 + 10 * k;
          bg.fillStyle = '#ffd84a'; bg.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y - 8 + Math.sin(a) * rr), 2, 2);
        }
      }
      if (mt >= 0.8) drawHi(principalFrames().down[0], x - 8, y - 16);
      else drawHi(st.robotFixed ? robotImgs.fixed : robotImgs.broken, x - 8, y - 16);
      if (mt >= 0 && mt < 0.8 && Math.floor(mt * 12) % 2) { bg.globalAlpha = 0.6; bg.drawImage(principalFrames().down[0], x - 8, y - 16); bg.globalAlpha = 1; }
      n.name = mt >= 0.8 ? '교장선생님' : '로봇 교장선생님';
    } else {
      const f = n.moving ? Math.floor(n.anim) % 2 : 0;
      drawHi(n.frames[n.dir][f], x - 8, y - 16);
    }
    const mark = st.markFor ? st.markFor(n) : null;
    if (mark === 'new') {
      // 아직 도감에 없는 친구: 말풍선
      const by = y - 27 + Math.round(Math.sin(time * 3 + n.x) * 1);
      bg.fillStyle = '#ffffff'; bg.fillRect(x - 4, by, 9, 6); bg.fillRect(x - 3, by - 1, 7, 8); bg.fillRect(x - 1, by + 7, 2, 1);
      bg.fillStyle = '#2b2233'; bg.fillRect(x - 2, by + 3, 1, 1); bg.fillRect(x, by + 3, 1, 1); bg.fillRect(x + 2, by + 3, 1, 1);
    } else if (mark) {
      const by = y - 30 + Math.round(Math.sin(time * 5) * 1.5);
      bg.fillStyle = mark === '!' ? '#ffd84a' : '#7fd3ff';
      bg.fillRect(x - 3, by - 1, 7, 9);
      bg.fillStyle = '#2b2233';
      if (mark === '!') { bg.fillRect(x, by + 1, 1, 4); bg.fillRect(x, by + 6, 1, 1); }
      else { bg.fillRect(x - 1, by + 1, 3, 1); bg.fillRect(x + 1, by + 2, 1, 2); bg.fillRect(x, by + 4, 1, 1); bg.fillRect(x, by + 6, 1, 1); }
    }
  }

  function drawPlayer(cx, cy) {
    const x = Math.round(player.x - cx), y = Math.round(player.y - cy);
    drawShadow(x, y - 1, Math.max(3, 5 - player.z / 10));
    const f = player.moving ? Math.floor(player.anim) % 2 : 0;
    const img = player.frames[player.dir][f];
    const top = y - 16 - Math.round(player.z);
    if (player.spin > 0) {
      const a = (1 - player.spin / SPIN_TIME) * Math.PI * 2;
      bg.save();
      bg.translate(x, top + 8);
      bg.rotate(a);
      drawHi(img, -8, -8);
      bg.restore();
    } else {
      drawHi(img, x - 8, top);
    }
  }

  function sparkle(x, y) {
    const k = (Math.sin(time * 6) + 1) / 2;
    bg.fillStyle = `rgba(255,240,140,${0.5 + k * 0.5})`;
    const s = 1 + Math.round(k * 2);
    bg.fillRect(Math.round(x) - s, Math.round(y) - 4, s * 2 + 1, 1);
    bg.fillRect(Math.round(x), Math.round(y) - 4 - s, 1, s * 2 + 1);
  }

  function text(str, x, y, size, color, stroke, bold) {
    sg.font = `${bold ? 700 : 600} ${Math.round(size)}px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    if (stroke) { sg.lineWidth = size / 4; sg.strokeStyle = stroke; sg.strokeText(str, x, y); }
    sg.fillStyle = color;
    sg.fillText(str, x, y);
  }
  function textTag(str, x, y, size, color = '#ffffff', bgc = 'rgba(30,24,40,0.72)') {
    sg.font = `700 ${Math.round(size)}px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    const w = sg.measureText(str).width + size * 0.9;
    const h = size * 1.5;
    sg.fillStyle = bgc;
    roundRect(x - w / 2, y - h / 2, w, h, h / 3);
    sg.fillStyle = color;
    sg.fillText(str, x, y + size * 0.05);
  }
  function roundRect(x, y, w, h, r) {
    sg.beginPath();
    sg.moveTo(x + r, y); sg.arcTo(x + w, y, x + w, y + h, r); sg.arcTo(x + w, y + h, x, y + h, r);
    sg.arcTo(x, y + h, x, y, r); sg.arcTo(x, y, x + w, y, r); sg.closePath(); sg.fill();
  }

  // 첫 화면에 있는 동안 바깥 지도와 캐릭터 그림을 미리 만들어 둔다 (입장할 때 기다리지 않게)
  let warmed = false;
  function prewarm() {
    if (warmed) return; warmed = true;
    let ms = null, gen = null;
    // 브라우저가 쉬는 틈에 조금씩: 지도 만들기 → 바깥 지도 그리기(나눠서) → 플레이어 캐릭터
    const jobs = [
      () => { ms = World.build(); },
      () => { gen = renderMapGen(ms.outdoor); return 'gen'; },
      ...Object.keys(Sprites.PLAYER_PALETTES).map(i => () => { charFrames('player' + i, Sprites.PLAYER_PALETTES[i]); })
    ];
    const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 500 }) : f => setTimeout(() => f({ timeRemaining: () => 8 }), 16);
    const work = dl => {
      try {
        while (dl.timeRemaining() > 3) {
          if (gen) { if (gen.next().done) gen = null; continue; }
          const j = jobs.shift(); if (!j) return;
          j();
        }
      } catch (e) { return; }
      idle(work);
    };
    setTimeout(() => idle(work), 600);
  }

  return {
    prewarm,
    init, newGame, stop, facePlayer, zoom, zoomInfo, celebrate, inDark, smooth2x,
    setSpeed(k) { speedK = k || 1; },
    transformRobot, resetRobot() { morphStart = 0; },
    setLook(charIdx) { if (player) player.frames = Sprites.makeChar(Sprites.PLAYER_PALETTES[charIdx]); },
    // 이어하기: 저장된 맵·위치로 옮긴다
    restore(mapId, x, y) { if (!maps[mapId]) return; loadMap(mapId); player.x = x; player.y = y; snapCamera(); fade = 1; fadeDir = -1; },
    refreshMinimap() { for (const k in mmCache) delete mmCache[k]; },
    get map() { return map; },
    get maps() { return maps; },
    get player() { return player; },
    get npcsAll() { return allNpcs; },
    isTouch: () => touchMode,
    setTouch: v => { touchMode = v; },
    clearInput: clearPressed,
    // 테스트용
    _teleport(mapId, tx, ty) { loadMap(mapId); player.x = tx * T + 8; player.y = ty * T + 12; safePos = null; walk = null; snapCamera(); },
    _press(k) { pressed[k] = true; }
  };
})();
