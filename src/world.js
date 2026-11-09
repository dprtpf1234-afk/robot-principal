// 대교초등학교 맵
//  · 바깥: 항공사진(선생님이 좌우를 뒤집어 보낸 방향)을 그대로 따라 그렸다. 위가 후관 쪽, 아래가 운동장.
//    항공사진 좌표(px) → 칸: ((x - 80) / 20, (y - 30) / 20)
//  · 실내: 2026 교실 배치도 좌표로 만든 뒤, 바깥 방향에 맞게 좌우를 뒤집는다(mirror).
//    배치도의 위쪽 줄 = 운동장 쪽(남), 아래쪽 줄(교실) = 안뜰 쪽(북).
const World = (() => {
  const { T, TILE } = Sprites;

  function newMap(id, name, w, h, fill, music) {
    const tiles = new Uint8Array(w * h).fill(fill);
    return { id, name, w, h, tiles, music, buildings: [], objects: [], warps: [], labels: [], zones: [], npcDefs: [], darkZones: [] };
  }
  function set(m, x, y, t) { if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.tiles[y * m.w + x] = t; }
  function get(m, x, y) { if (x < 0 || y < 0 || x >= m.w || y >= m.h) return TILE.VOID; return m.tiles[y * m.w + x]; }
  function rect(m, x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(m, i, j, t); }
  function room(m, x, y, w, h, floor) { rect(m, x, y, w, h, TILE.WALL); rect(m, x + 1, y + 1, w - 2, h - 2, floor); }

  let objSeq = 1;
  function obj(m, kind, tx, ty, opts = {}) {
    const img = Sprites.makeObj(kind);
    const o = {
      id: 'o' + (objSeq++), kind, img,
      x: tx * T + (opts.dx || 0), y: ty * T + (opts.dy || 0), w: img.width, h: img.height,
      solid: opts.solid !== false, interact: opts.interact || null, hidden: false
    };
    const hh = opts.hitH != null ? opts.hitH : Math.min(o.h, T);
    o.hit = { x: o.x + (opts.hitX || 0), y: o.y + o.h - hh, w: opts.hitW || o.w, h: hh };
    m.objects.push(o);
    return o;
  }
  // 주차칸 + 차 (몇 칸은 비워 둔다). sp = 칸 간격(칸 수)
  let parkSeq = 0;
  function park(m, tx, ty, sp) {
    obj(m, 'stall' + sp, tx, ty, { solid: false, dx: -2, dy: 8 - sp * T / 2 });
    if (parkSeq++ % 5 !== 3) obj(m, 'car', tx, ty);
  }
  function label(m, tx, ty, text) { m.labels.push({ x: tx * T, y: ty * T, text }); }
  function warp(m, tx, ty, to, ax, ay, dir, lock) { m.warps.push({ x: tx, y: ty, to, ax, ay, dir, lock: lock || null }); }
  function sign(m, tx, ty, id) { obj(m, 'sign', tx, ty, { hitH: 5, hitX: 5, hitW: 6, interact: { type: 'sign', id } }); }
  // 수집품 개나리 꽃 (교화, 번호는 학교 전체에서 0~9)
  function star(m, tx, ty, i) { obj(m, 'star', tx, ty, { solid: false, interact: { type: 'star', i } }); }
  function lockDoor(m, tx, ty, key) { obj(m, 'lockdoor', tx, ty, { hitH: 16, interact: { type: 'lock', key } }); }
  function npc(m, def) { m.npcDefs.push(def); }
  function friend(m, id, pal, tx, ty, face) { m.npcDefs.push({ id, role: 'friend', pal, tx, ty, face: face || 'down' }); }
  function zone(m, x, y, w, h, n, key) { m.zones.push({ x, y, w, h, n, key }); }

  // ================= 실내 층 =================
  // 평면도 가로 위치(px) → 칸
  const PX = px => Math.round((px - 85) / 13.5);
  const H_IN = 17;          // 북쪽 방 y0~6 · 복도 y7~9 · 남쪽 방 y10~16

  function floorBase(id, name, w, hallTo) {
    const m = newMap(id, name, w, H_IN, TILE.VOID, 'indoor');
    rect(m, 0, 6, hallTo + 2, 5, TILE.WALL);
    rect(m, 1, 7, hallTo, 3, TILE.HALL);
    return m;
  }

  // 방 하나. side 'N'(복도 북쪽) | 'S'(복도 남쪽). 반환: { x0, x1, ix, iy, iw, ih, door, cx }
  function cell(m, side, px0, px1, name, opts = {}) {
    const x0 = PX(px0), x1 = PX(px1), w = x1 - x0 + 1;
    const y0 = side === 'N' ? 0 : 10;
    const r = { x0, x1, ix: x0 + 1, iy: y0 + 1, iw: w - 2, ih: 5, cx: (x0 + x1 + 1) / 2, side, name };
    const doorRow = side === 'N' ? 6 : 10;
    const kind = opts.kind || 'room';
    if (kind === 'open' || kind === 'bridge' || kind === 'exit') {
      // 복도에서 바깥쪽 끝까지 뚫린 칸 (통로·현관·연결통로)
      rect(m, x0, y0, w, 7, TILE.WALL);
      rect(m, x0 + 1, side === 'N' ? 1 : 10, w - 2, 6, kind === 'bridge' ? TILE.BRIDGE : TILE.HALL);
      const edge = side === 'N' ? 0 : 16;
      const a = Math.floor(r.cx) - 1, b = a + 1;
      if (kind === 'exit' || kind === 'bridge') {
        set(m, a, edge, kind === 'exit' ? TILE.EXIT : TILE.BRIDGE); set(m, b, edge, kind === 'exit' ? TILE.EXIT : TILE.BRIDGE);
        r.edge = edge; r.wa = a; r.wb = b;
      }
      label(m, r.cx, side === 'N' ? 6.35 : 10.35, name);
      return r;
    }
    room(m, x0, y0, w, 7, opts.floor || TILE.WOOD);
    if (kind === 'closed') {
      label(m, r.cx, y0 + 3.5, name);
      return r;
    }
    const dx = x0 + Math.floor(w / 2) - 1;
    set(m, dx, doorRow, TILE.HALL); set(m, dx + 1, doorRow, TILE.HALL);
    r.door = dx;
    label(m, dx + 1, doorRow + 0.35, name);
    return r;
  }

  // 교실 꾸미기: 칠판(문 반대쪽 벽) + 책상 두 줄
  let hrSeq = 0;
  function classroom(m, r, opts = {}) {
    const N = r.side === 'N';
    const board = r.iw >= 3 ? obj(m, 'board', r.ix + Math.max(0, Math.floor(r.iw / 2) - 1.5), N ? 0.6 : 15.4, { solid: false }) : null;
    // 반 교실에는 담임 선생님 (칠판 옆)
    if (/^\d-\d+$/.test(r.name)) {
      const k = r.name.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
      m.npcDefs.push({ id: 'hr_' + r.name, role: 'teacher', cls: r.name, name: r.name + ' 담임 선생님', pal: 'hr' + (Math.abs(k) % 8),
        tx: r.ix + r.iw - 1, ty: N ? 0.9 : 14.9, face: N ? 'down' : 'up' });
      hrSeq++;
    }
    const rows = N ? [2, 4] : [12, 14];
    for (const yy of rows) {
      for (let xx = r.ix; xx < r.ix + r.iw; xx += 2) {
        const nearDoor = r.door != null && xx >= r.door - 1 && xx <= r.door + 1 && (N ? yy === 4 : yy === 12);
        if (nearDoor) continue;
        obj(m, opts.desk || 'desk', xx, yy);
      }
    }
    return { board };
  }
  function office(m, r) {
    const yy = r.side === 'N' ? 2 : 13;
    for (let xx = r.ix; xx < r.ix + r.iw - 1; xx += 3) obj(m, 'desk', xx, yy);
    obj(m, 'plant', r.ix + r.iw - 1, r.side === 'N' ? 1 : 15);
  }

  // 계단 칸: ↑(왼쪽 반)과 ↓(오른쪽 반). up/down = 이어지는 층 지도 id
  function stairs(m, side, px0, px1, up, down) {
    const r = cell(m, side, px0, px1, up && down ? '계단 ↑↓' : up ? '계단 ↑' : '계단 ↓', { floor: TILE.HALL });
    const rows = side === 'N' ? [1, 2] : [14, 15];
    const ay = side === 'N' ? 4.4 : 12.4, face = side === 'N' ? 'down' : 'up';
    const half = up && down ? Math.floor(r.iw / 2) : r.iw;
    for (let i = 0; i < r.iw; i++) {
      const goUp = up && (i < half || !down);
      const to = goUp ? up : down;
      for (const yy of rows) {
        set(m, r.ix + i, yy, goUp ? TILE.UP : TILE.DOWN);
        warp(m, r.ix + i, yy, to, r.cx, ay, face);
      }
    }
    return r;
  }
  // 바깥으로 나가는 문 (EXIT 칸 두 개) → 바깥 문 앞 도착 지점 out = [{ax, ay, dir}, ...]
  function exitTo(m, r, out) {
    warp(m, r.wa, r.edge, 'outdoor', out[0].ax, out[0].ay, out[0].dir);
    const o2 = out[1] || out[0];
    warp(m, r.wb, r.edge, 'outdoor', o2.ax, o2.ay, o2.dir);
  }
  // 바깥에서 들어올 때의 실내 도착 지점 (배치도 좌표, 좌우 뒤집기 때 함께 바뀐다)
  function arrive(m, r) { return { map: m.id, ax: r.cx, ay: r.edge === 0 ? 1.6 : 15.2, dir: r.edge === 0 ? 'down' : 'up' }; }
  let OUT = {}, IN = {};
  // 연결통로: 다른 건물 같은 층의 연결통로 칸으로
  function bridgeTo(m, r, to, ax, ay, dir) {
    warp(m, r.wa, r.edge, to, ax, ay, dir);
    warp(m, r.wb, r.edge, to, ax, ay, dir);
  }

  // 본관 공통: 계단 위치와 연결통로 도착 지점
  const MAIN_L = [278, 338], MAIN_R = [828, 905];
  const BACK_M = [400, 505], BACK_R = [828, 908];
  const backCx = px => (PX(px[0]) + PX(px[1]) + 1) / 2;
  const mainCx = px => (PX(px[0]) + PX(px[1]) + 1) / 2;

  function hallZone(m, x, w, n) { zone(m, x, 7, w, 3, n, 'hall'); }
  function roomZone(m, r, n) { zone(m, r.ix, r.iy, r.iw, r.ih, n, 'classroom'); }

  // ---------- 본관 B층 (늘봄교실) ----------
  function buildB() {
    const m = floorBase('b0', '본관 B층 · 늘봄교실', 24, 22);
    const n1 = cell(m, 'N', 85, 150, '늘봄1', { floor: TILE.MAT });
    const n2 = cell(m, 'N', 150, 215, '늘봄2', { floor: TILE.MAT });
    const n3 = cell(m, 'N', 215, 278, '늘봄3', { floor: TILE.MAT });
    const sup = cell(m, 'N', 278, 338, '늘봄 지원실');
    cell(m, 'N', 338, 400, '문서고', { kind: 'closed', floor: TILE.HALL });
    const door = cell(m, 'S', 150, 213, '현관', { kind: 'exit' });
    cell(m, 'S', 213, 278, '화장실', { kind: 'closed', floor: TILE.HALL });
    stairs(m, 'S', ...MAIN_L, 'f1', null);
    exitTo(m, door, OUT.B); IN.B = arrive(m, door);
    for (const r of [n1, n2, n3]) { obj(m, 'table', r.ix, 2); obj(m, 'plant', r.ix + r.iw - 1, 1); }
    office(m, sup);
    star(m, n2.ix + 1, 4, 9);
    friend(m, 'f9', 'youngest', n1.ix + 1, 3);
    roomZone(m, n1, 2); roomZone(m, n3, 2); hallZone(m, 2, 18, 2);
    return m;
  }

  // ---------- 본관 1층 ----------
  function buildF1() {
    const m = floorBase('f1', '본관 1층', 71, 69);
    const nb4 = cell(m, 'N', 85, 150, '늘봄4', { floor: TILE.MAT });
    const nb5 = cell(m, 'N', 150, 215, '늘봄5', { floor: TILE.MAT });
    const adm = cell(m, 'N', 215, 278, '행정실');
    const adm2 = cell(m, 'N', 278, 338, '행정 지원실');
    const pass = cell(m, 'N', 338, 400, '통로 → 안뜰', { kind: 'exit' });
    cell(m, 'N', 400, 438, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 438, 476, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 476, 538, '숙직실', { kind: 'closed' });
    // 중앙현관: 북쪽 줄부터 남쪽 줄까지 뚫린 로비 (운동장 쪽·안뜰 쪽 모두 문)
    const lx0 = PX(538), lx1 = PX(628);
    rect(m, lx0, 0, lx1 - lx0 + 1, H_IN, TILE.WALL);
    rect(m, lx0 + 1, 1, lx1 - lx0 - 1, H_IN - 2, TILE.HALL);
    rect(m, lx0, 7, 1, 3, TILE.HALL); rect(m, lx1, 7, 1, 3, TILE.HALL);
    const lcx = (lx0 + lx1 + 1) / 2, la = Math.floor(lcx) - 1;
    set(m, la, 0, TILE.EXIT); set(m, la + 1, 0, TILE.EXIT); set(m, la, 16, TILE.EXIT); set(m, la + 1, 16, TILE.EXIT);
    exitTo(m, { wa: la, wb: la + 1, edge: 16 }, OUT.lobbyS); exitTo(m, { wa: la, wb: la + 1, edge: 0 }, OUT.lobbyN);
    IN.lobbyS = { map: 'f1', ax: lcx, ay: 15.2, dir: 'up' }; IN.lobbyN = { map: 'f1', ax: lcx, ay: 1.6, dir: 'down' };
    label(m, lcx, 15.2, '중앙현관'); label(m, lcx, 0.9, '안뜰 쪽 문');
    obj(m, 'pillar', lx0 + 1, 3, { hitH: 8 });
    obj(m, 'mirror', lx1 - 1, 1, { hitH: 8, interact: { type: 'mirror' } });
    obj(m, 'plant', lx1 - 1, 13);
    sign(m, lx0 + 1, 12, 'hall');
    star(m, lx1 - 1, 15, 6);

    const staff = cell(m, 'N', 628, 668, '교무실');
    const meet = cell(m, 'N', 668, 712, '회의실');
    const princ = cell(m, 'N', 712, 755, '교장실', { floor: TILE.CARPET });
    cell(m, 'N', 755, 790, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 790, 828, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 828, 866, 'E/V', { kind: 'closed', floor: TILE.HALL });
    const pass2 = cell(m, 'N', 866, 905, '통로 → 안뜰', { kind: 'exit' });
    stairs(m, 'S', ...MAIN_L, 'f2', 'b0');
    const front = cell(m, 'S', 755, 828, '현관', { kind: 'exit' });
    stairs(m, 'S', ...MAIN_R, 'f2', null);
    // 식생활교육관 (식당): 복도 동쪽 끝 남쪽
    const caf = cell(m, 'S', 905, 1030, '식생활교육관 (식당)', { floor: TILE.CAFE });
    // 식당 쪽 바깥 현관은 쓰지 않는다 (복도로만 드나든다)
    exitTo(m, pass, OUT.pass1N); IN.pass1N = arrive(m, pass);
    exitTo(m, pass2, OUT.pass2N); IN.pass2N = arrive(m, pass2);
    exitTo(m, front, OUT.front); IN.front = arrive(m, front);

    for (const r of [nb4, nb5]) { obj(m, 'table', r.ix, 2); obj(m, 'plant', r.ix + r.iw - 1, 1); }
    office(m, adm); office(m, adm2);
    obj(m, 'desk', staff.ix, 2); obj(m, 'desk', staff.ix + 1, 4);
    obj(m, 'table', meet.ix, 2, { hitW: 16 });
    obj(m, 'desk', princ.ix + 1, 2); obj(m, 'plant', princ.ix, 1);
    obj(m, 'counter', caf.ix + 5, 11);
    obj(m, 'table', caf.ix, 13); obj(m, 'table', caf.ix, 15); obj(m, 'table', caf.ix + 5, 15);

    npc(m, { id: 'm7', role: 'mission', order: 7, pal: 'affairs', tx: princ.cx, ty: 8.4, face: 'down', place: '본관 1층 교장실 앞' });
    npc(m, { id: 'sB', role: 'side', side: 'B', pal: 'cook', tx: caf.ix + 6.5, ty: 13, face: 'down', place: '본관 1층 식생활교육관(식당)' });
    friend(m, 'f8', 'staff', adm.ix + 1, 4); friend(m, 'f29', 'adminHead', adm.ix + adm.iw - 1, 4.5);
    friend(m, 'f21', 'vpM', staff.cx - 0.5, 8.2, 'down'); friend(m, 'f22', 'vpF', meet.ix + 1, 4);
    obj(m, 'emblem', lx0 + 1, 13.6, { hitH: 6, hitX: 8, hitW: 16, dy: -8, interact: { type: 'sign', id: 'symbol' } });
    friend(m, 'f10', 'guide', lx0 + 3, 9, 'down'); friend(m, 'f20', 'buddy', caf.ix + 2, 12, 'down');
    roomZone(m, nb4, 2); roomZone(m, nb5, 2); hallZone(m, 2, 30, 3); hallZone(m, 42, 18, 2);
    zone(m, caf.ix, 13, caf.iw, 3, 3, 'cafeteria');
    return m;
  }

  // ---------- 본관 2층 ----------
  function buildF2() {
    const m = floorBase('f2', '본관 2층', 71, 69);
    const c = [cell(m, 'N', 85, 150, '2-1'), cell(m, 'N', 150, 215, '2-2'), cell(m, 'N', 215, 278, '2-3')];
    const lab2 = cell(m, 'N', 278, 338, '2학년 연구실');
    const brM = cell(m, 'N', 338, 400, '연결통로 → 후관', { kind: 'bridge' });
    cell(m, 'N', 400, 438, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 438, 476, '화장실', { kind: 'closed', floor: TILE.HALL });
    const a1 = cell(m, 'N', 476, 552, '어울림1');
    const bc = cell(m, 'N', 552, 628, '방송실', { floor: TILE.CARPET });
    const info = cell(m, 'N', 628, 680, '정보실');
    const a2 = cell(m, 'N', 680, 752, '어울림2');
    const a3 = cell(m, 'N', 752, 828, '어울림3');
    cell(m, 'N', 828, 866, 'E/V', { kind: 'closed', floor: TILE.HALL });
    const brR = cell(m, 'N', 866, 905, '연결통로 → 후관', { kind: 'bridge' });
    const sci = cell(m, 'N', 905, 975, '창의융합 1과학실');
    stairs(m, 'S', ...MAIN_L, 'f3', 'f1');
    const com = cell(m, 'S', 680, 755, '컴퓨터실1');
    const multi = cell(m, 'S', 755, 828, '다목적실');
    stairs(m, 'S', ...MAIN_R, 'f3', 'f1');
    const hall = cell(m, 'S', 905, 1030, '강당', { floor: TILE.WOOD });
    bridgeTo(m, brM, 'h2', backCx(BACK_M), 15.4, 'up');
    bridgeTo(m, brR, 'h2', backCx(BACK_R), 15.4, 'up');

    c.forEach(r => classroom(m, r));
    office(m, lab2); office(m, info);
    for (const r of [a1, a2, a3]) obj(m, 'table', r.ix, 2);
    obj(m, 'mic', bc.ix + 1, 1); obj(m, 'computer', bc.ix + 3, 1);
    for (let i = 0; i < 2; i++) { obj(m, 'lab', sci.ix + i * 2, 2); obj(m, 'lab', sci.ix + i * 2, 4); }
    for (let i = 0; i < 3; i++) { obj(m, 'computer', com.ix + i * 2, 12); obj(m, 'computer', com.ix + i * 2, 14); }
    obj(m, 'table', multi.ix, 13);
    obj(m, 'stage', hall.ix, 14.2, { hitH: 10 });
    lockDoor(m, com.door, 10, 'pcKey');
    sign(m, PX(530), 7, 'broadcast'); sign(m, PX(670), 9, 'computer'); sign(m, 57, 7, 'science');
    star(m, hall.ix + hall.iw - 1, 12, 8);

    npc(m, { id: 'm2', role: 'mission', order: 2, pal: 'science', tx: sci.cx, ty: 4.4, face: 'down', place: '본관 2층 창의융합 1과학실' });
    npc(m, { id: 'm4', role: 'mission', order: 4, pal: 'broadcast', tx: bc.cx, ty: 4.4, face: 'down', place: '본관 2층 방송실' });
    npc(m, { id: 'm5', role: 'mission', order: 5, pal: 'it', tx: com.cx, ty: 13.4, face: 'up', place: '본관 2층 컴퓨터실1' });
    friend(m, 'f11', 'sciKid', sci.ix + sci.iw - 1, 3); friend(m, 'f12', 'coder', com.ix + com.iw - 1, 13, 'left');
    friend(m, 'f14', 'cleaner', 30, 8, 'left');
    friend(m, 'f28', 'peHead', hall.ix + hall.iw - 3, 13, 'down');
    c.forEach(r => roomZone(m, r, 2)); roomZone(m, a2, 1); hallZone(m, 2, 30, 3); hallZone(m, 40, 20, 2);
    zone(m, hall.ix, 11, hall.iw, 3, 3, 'hall');
    return m;
  }

  // ---------- 본관 3층 ----------
  function buildF3() {
    const m = floorBase('f3', '본관 3층', 67, 65);
    const c = [cell(m, 'N', 85, 150, '5-1'), cell(m, 'N', 150, 215, '5-2'), cell(m, 'N', 215, 278, '5-3')];
    const lab5 = cell(m, 'N', 278, 338, '5학년 연구실');
    const t2 = cell(m, 'N', 338, 400, '전담 교사실2');
    cell(m, 'N', 400, 438, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 438, 476, '화장실', { kind: 'closed', floor: TILE.HALL });
    const head = cell(m, 'N', 476, 538, '수석 교사실');
    const c2 = [cell(m, 'N', 538, 605, '5-4'), cell(m, 'N', 605, 680, '5-5'), cell(m, 'N', 680, 752, '5-6'), cell(m, 'N', 752, 828, '5-7')];
    cell(m, 'N', 828, 866, 'E/V', { kind: 'closed', floor: TILE.HALL });
    const brR = cell(m, 'N', 866, 905, '연결통로 → 후관', { kind: 'bridge' });
    const sci2 = cell(m, 'N', 905, 975, '지능형 2과학실');
    stairs(m, 'S', ...MAIN_L, 'f4', 'f2');
    const lib = cell(m, 'S', 680, 828, '도서관', { floor: TILE.CARPET });
    stairs(m, 'S', ...MAIN_R, 'f4', 'f2');
    bridgeTo(m, brR, 'h3', backCx(BACK_R), 15.4, 'up');

    c.concat(c2).forEach(r => classroom(m, r));
    office(m, lab5); office(m, t2); office(m, head);
    friend(m, 'f23', 'research', lab5.ix + 1, 4); friend(m, 'f24', 'chiefT', head.ix + 1, 4); friend(m, 'f26', 'welfare', t2.ix + 1, 4);
    for (let i = 0; i < 2; i++) { obj(m, 'lab', sci2.ix + i * 2, 2); obj(m, 'computer', sci2.ix + i * 2, 4); }
    // 도서관 책장 (빨간 책장 3개가 미션 3 단서)
    const L = lib.ix;
    // 문(가운데 두 칸) 앞은 비워 둔다
    for (const [dx, dy] of [[0, 11], [1, 11], [7, 11], [8, 11], [0, 13], [2, 13], [3, 13], [6, 13], [8, 13], [2, 15], [3, 15], [8, 15]]) obj(m, 'shelf', L + dx, dy);
    obj(m, 'redshelf', L + 9, 11, { interact: { type: 'clue', m: 3, i: 0, name: '빨간 책장' } });
    obj(m, 'redshelf', L + 1, 13, { interact: { type: 'clue', m: 3, i: 1, name: '빨간 책장' } });
    obj(m, 'redshelf', L + 7, 15, { interact: { type: 'clue', m: 3, i: 2, name: '빨간 책장' } });
    sign(m, PX(670), 9, 'library');
    star(m, L, 15, 7);

    npc(m, { id: 'm3', role: 'mission', order: 3, pal: 'librarian', tx: L + 5, ty: 13.2, face: 'up', place: '본관 3층 도서관' });
    friend(m, 'f15', 'bookworm', L + 9, 14, 'left');
    c.forEach(r => roomZone(m, r, 2)); roomZone(m, c2[1], 2); roomZone(m, c2[3], 2); hallZone(m, 2, 50, 4);
    return m;
  }

  // ---------- 본관 4층 ----------
  function buildF4() {
    const m = floorBase('f4', '본관 4층', 67, 65);
    const c = [cell(m, 'N', 85, 150, '6-1'), cell(m, 'N', 150, 215, '6-2'), cell(m, 'N', 215, 278, '6-3')];
    const lab6 = cell(m, 'N', 278, 338, '6학년 연구실');
    const music = cell(m, 'N', 338, 400, '음악 준비실');
    cell(m, 'N', 400, 438, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 438, 476, '화장실', { kind: 'closed', floor: TILE.HALL });
    const t3 = cell(m, 'N', 476, 538, '전담 교사실3');
    const c2 = [cell(m, 'N', 538, 605, '6-4'), cell(m, 'N', 605, 680, '6-5'), cell(m, 'N', 680, 752, '6-6'), cell(m, 'N', 752, 828, '6-7')];
    cell(m, 'N', 828, 866, 'E/V', { kind: 'closed', floor: TILE.HALL });
    const brR = cell(m, 'N', 866, 905, '연결통로 → 후관', { kind: 'bridge' });
    const c68 = cell(m, 'N', 905, 975, '6-8');
    stairs(m, 'S', ...MAIN_L, null, 'f3');
    // AI 스마트존(멀티미디어실): 정전으로 깜깜한 방. 손전등으로 쪽지 3장을 찾고 단말기를 켠다.
    const ai = cell(m, 'S', 680, 828, 'AI 스마트존 (정전)', { floor: TILE.HALL });
    stairs(m, 'S', ...MAIN_R, null, 'f3');
    const gap = cell(m, 'S', 905, 975, '틈새 늘봄', { floor: TILE.MAT });
    bridgeTo(m, brR, 'h4', backCx(BACK_R), 15.4, 'up');

    c.concat(c2, [c68]).forEach(r => classroom(m, r));
    office(m, lab6); office(m, t3);
    friend(m, 'f32', 'sciHead', t3.ix + 1, 4); friend(m, 'f25', 'basics', t3.ix + t3.iw - 1, 4.5);
    obj(m, 'piano', music.ix, 2);
    obj(m, 'table', gap.ix, 12);
    lockDoor(m, ai.door, 10, 'storeKey');
    m.darkZones.push({ x: ai.ix, y: ai.iy, w: ai.iw, h: ai.ih });
    const A = ai.ix;
    for (const [bx, by, k] of [[0, 12, 'computer'], [1, 12, 'computer'], [7, 13, 'computer'], [8, 13, 'computer'], [3, 14, 'box'], [9, 11, 'box']]) obj(m, k, A + bx, by);
    obj(m, 'note', A + 0, 15, { solid: false, interact: { type: 'note', i: 0 } });
    obj(m, 'note', A + 8, 11, { solid: false, interact: { type: 'note', i: 1 } });
    obj(m, 'note', A + 4, 12, { solid: false, interact: { type: 'note', i: 2 } });
    obj(m, 'terminal', A + ai.iw - 1, 13, { hitH: 12, interact: { type: 'terminal' } });
    sign(m, PX(670), 9, 'aizone');

    friend(m, 'f18', 'president', c[2].ix + 1, 3); friend(m, 'f19', 'explorer', PX(640), 8, 'right');
    friend(m, 'f16', 'musicT', music.cx, 8.4, 'up');
    c.forEach(r => roomZone(m, r, 2)); roomZone(m, c2[0], 2); roomZone(m, c2[2], 2); hallZone(m, 2, 40, 3);
    return m;
  }

  // ---------- 후관 (1~4층) ----------
  // 북쪽 줄: 계단 2곳 · 가운데 복도 · 남쪽 줄: 교실(안뜰 쪽 창문), 쉼터, 현관/연결통로
  function buildBack(f) {
    const wide = f === 1;
    const m = floorBase('h' + f, '후관 ' + f + '층', wide ? 70 : 62, wide ? 68 : 60);
    const names = {
      1: ['1-1', '1-2', '1-3', '1학년 연구실', null, '1-4', '전담 교사실1', '영어 체험실'],
      2: ['2-4', '2-5', '3-1', 'wee클래스', null, '3-2', '3-3', '3-4'],
      3: ['4-6', '4-7', '4-8', '3학년 연구실', null, '3-5', '3-6', '5-8'],
      4: ['4-1', '4-2', '4-3', '4학년 연구실', null, '4-4', '4-5', '6-9']
    }[f];
    const cols = [[85, 160], [160, 238], [238, 315], [315, 400]];
    // 후관은 교실·화장실·계단이 모두 북쪽 줄에 있고, 안뜰 쪽(남쪽)은 현관·연결통로·쉼터뿐이다
    const rooms = cols.map((c, i) => cell(m, 'N', c[0], c[1], names[i]));
    let mid;
    if (f === 1) mid = cell(m, 'S', ...BACK_M, '현관', { kind: 'exit' });
    else if (f === 2) mid = cell(m, 'S', ...BACK_M, '연결통로 → 본관', { kind: 'bridge' });
    cell(m, 'N', 505, 545, '화장실', { kind: 'closed', floor: TILE.HALL });
    cell(m, 'N', 545, 585, '화장실', { kind: 'closed', floor: TILE.HALL });
    const rooms2 = [[585, 660], [660, 748], [748, 828]].map((c, i) => cell(m, 'N', c[0], c[1], names[5 + i]));
    const right = f === 1 ? cell(m, 'S', ...BACK_R, '현관', { kind: 'exit' }) : cell(m, 'S', ...BACK_R, '연결통로 → 본관', { kind: 'bridge' });
    stairs(m, 'N', ...BACK_M, f < 4 ? 'h' + (f + 1) : null, f > 1 ? 'h' + (f - 1) : null);
    stairs(m, 'N', ...BACK_R, f < 4 ? 'h' + (f + 1) : null, f > 1 ? 'h' + (f - 1) : null);

    // 교실 꾸미기 (연구실·전담 교사실은 사무실, 쉼터·wee클래스는 탁자)
    const boards = {};
    rooms.concat(rooms2).forEach(r => {
      if (/연구실|교사실/.test(r.name)) office(m, r);
      else if (/wee|체험실/.test(r.name)) { obj(m, 'table', r.ix, 2); obj(m, 'plant', r.ix + r.iw - 1, 1); }
      else boards[r.name] = classroom(m, r).board;
    });

    if (f === 1) {
      exitTo(m, mid, OUT.huMid); IN.huMid = arrive(m, mid);
      exitTo(m, right, OUT.huEnd); IN.huEnd = arrive(m, right);
      // 배치도 오른쪽 끝: 보건실(북쪽), 인쇄실·휴게실(남쪽)
      cell(m, 'S', 908, 960, '인쇄실', { kind: 'closed' });
      cell(m, 'S', 960, 1010, '휴게실', { kind: 'closed' });
      const nurse = cell(m, 'N', 908, 1010, '보건실', { floor: TILE.HALL });
      obj(m, 'bed', nurse.ix, 1); obj(m, 'bed', nurse.ix + 2, 1); obj(m, 'desk', nurse.ix + nurse.iw - 1, 3);
      obj(m, 'bandage', nurse.ix + 4, 1, { solid: false, interact: { type: 'bandage', i: 0 } });
      obj(m, 'bandage', nurse.ix, 4, { solid: false, interact: { type: 'bandage', i: 1 } });
      obj(m, 'bandage', nurse.ix + nurse.iw - 1, 5, { solid: false, interact: { type: 'bandage', i: 2 } });
      // 보건 선생님은 방 안쪽(화면 왼쪽 위 순서도 창에 가리지 않는 쪽)에
      npc(m, { id: 'sA', role: 'side', side: 'A', pal: 'nurse', tx: nurse.ix + 1, ty: 4.6, face: 'down', place: '후관 1층 보건실' });
    } else {
      // 연결통로 → 본관 같은 층
      bridgeTo(m, right, 'f' + f, mainCx([866, 905]), 1.6, 'down');
      if (f === 2) bridgeTo(m, mid, 'f2', mainCx([338, 400]), 1.6, 'down');
    }
    if (f === 2) friend(m, 'f13', 'artist', rooms2[0].ix + 1, 3);
    if (f === 3) friend(m, 'f17', 'leader', rooms[0].ix + 1, 3);
    // 미션 8: 후관 3층 3학년 연구실의 디지털 새싹 선생님. 교실 전자칠판 세 곳에 단서.
    if (f === 3) {
      npc(m, { id: 'm8', role: 'mission', order: 8, pal: 'coderT', tx: rooms[3].cx, ty: 4.4, face: 'down', place: '후관 3층 3학년 연구실' });
      ['4-6', '4-8', '3-6'].forEach((nm, i) => { const b = boards[nm]; b.interact = { type: 'clue', m: 8, i, name: nm + ' 전자칠판' }; b.hit = { x: b.x, y: b.y, w: b.w, h: b.h + 6 }; });
      sign(m, PX(455), 8, 'network');
    }
    // 전담 교사실1: 생활부장 선생님·원어민 선생님 / wee클래스: 상담 선생님
    if (f === 1) { friend(m, 'f27', 'life', rooms2[1].ix + 1, 4); friend(m, 'f31', 'native', rooms2[1].ix + rooms2[1].iw - 1, 4.5); }
    if (f === 2) friend(m, 'f30', 'counsel', rooms[3].ix + 1, 4);
    if (f === 4) npc(m, { id: 'sC', role: 'side', side: 'C', pal: 'transfer', tx: PX(452), ty: 8.4, face: 'down', place: '후관 4층 복도' });
    rooms.slice(0, 3).forEach(r => roomZone(m, r, 2)); roomZone(m, rooms2[1], 2); hallZone(m, 2, 54, 3);
    return m;
  }

  // ================= 바깥 (항공사진 따라 그리기) =================
  const OW = 74, OH = 56;
  const AX = x => (x - 80) / 20, AY = y => (y - 30) / 20;
  // 다각형(항공사진 px) 안에 중심이 들어가는 칸들
  function polyCells(pts) {
    const out = [];
    const inside = (px, py) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (inside(80 + (x + 0.5) * 20, 30 + (y + 0.5) * 20)) out.push([x, y]);
    return out;
  }
  function polyFill(m, pts, t) { for (const [x, y] of polyCells(pts)) set(m, x, y, t); }
  // 건물 덩어리 (항공사진 지붕 모양)
  const BLOCKS = {
    hu: { pts: [[400, 176], [755, 176], [985, 72], [1030, 135], [775, 270], [445, 270], [445, 375], [335, 375], [335, 245], [400, 245]],
      roof: '#3f6b5c', wall: '#b8573e', style: 'brick', face: 3, floors: 4, name: '후관', signAt: [27, 8.15] },
    // 남서쪽 곡선 건물(현관·도서관): 둥근 면이 남동쪽(운동장·중앙현관 쪽)을 향한다
    bon: { pts: [[445, 415], [880, 415], [1150, 310], [1188, 378], [1000, 505], [585, 505], [581, 537], [568, 568], [548, 593], [522, 613], [492, 626], [460, 630], [445, 630]],
      roof: '#3f6b5c', wall: '#b8573e', style: 'brick', face: 3, floors: 4, name: '대교초등학교 본관', signAt: [35, 20.15], stripes: [42, 43, 44, 45] },
    conn: { pts: [[400, 392], [445, 392], [445, 585], [420, 585], [420, 425], [400, 425]], roof: '#5f8f88', wall: '#9aa3ab', face: 0 },
    gym: { pts: [[260, 385], [405, 385], [405, 645], [260, 645]], roof: '#c3c7cc', wall: '#b8573e', style: 'brick', face: 2, floors: 2, ribs: true, name: '강당·식당', signAt: [12.5, 27.2] },
    annex: { pts: [[160, 385], [260, 385], [260, 645], [160, 645]], roof: '#6f9c94', wall: '#c9cdd3', face: 2, floors: 2 }
  };
  function blockCells(key) { return polyCells(BLOCKS[key].pts); }
  function bottomRow(cells, x) { let r = -1; for (const [cx, cy] of cells) if (cx === x && cy > r) r = cy; return r; }
  // 바깥 문 위치 → 실내에서 나올 때의 도착 지점
  function outdoorDoors() {
    const bon = blockCells('bon');
    const south = xs => xs.map(x => ({ x, y: bottomRow(bon, x), ax: x + 0.5, ay: bottomRow(bon, x) + 1.6, dir: 'down' }));
    const north = (xs, row) => xs.map(x => ({ x, y: row, ax: x + 0.5, ay: row - 0.4, dir: 'up' }));
    const below = (xs, row) => xs.map(x => ({ x, y: row, ax: x + 0.5, ay: row + 1.6, dir: 'down' }));
    return {
      lobbyS: south([30, 31]), front: south([23, 24]), B: south([48, 49]),
      lobbyN: north([29, 30], 18), pass1N: north([39, 40], 18), pass2N: north([19, 20], 18),
      cafe: below([12, 13], 30), huMid: below([32, 33], 11), huEnd: below([19, 20], 11)
    };
  }

  function buildOutdoor() {
    const m = newMap('outdoor', '대교초등학교', OW, OH, TILE.PAVE, 'outdoor');
    // 학교 울타리 밖은 도로
    const fencePts = [[100, 25], [1150, 25], [1505, 1110], [100, 1110]];
    const inside = new Set(polyCells(fencePts).map(([x, y]) => x + ',' + y));
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      if (!inside.has(x + ',' + y)) { set(m, x, y, TILE.ROAD); continue; }
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside.has((x + dx) + ',' + (y + dy)))) set(m, x, y, TILE.FENCE);
    }
    const inRow = y => { let a = OW, b = -1; for (let x = 0; x < OW; x++) if (inside.has(x + ',' + y)) { a = Math.min(a, x); b = Math.max(b, x); } return [a, b]; };

    // 북쪽 숲, 서쪽 나무, 남쪽 둑
    rect(m, 2, 2, 23, 2, TILE.TREE); rect(m, 36, 2, 5, 1, TILE.TREE); rect(m, 2, 4, 1, 13, TILE.TREE);
    for (let x = 2; x < inRow(52)[1] - 1; x++) if (x % 3 === 0) obj(m, 'pine', x - 0.5, 50.6, { hitH: 4, hitX: 12, hitW: 8, solid: false });
    // 북서 주차장, 후관 북쪽 주차장
    rect(m, 3, 4, 9, 13, TILE.PARK);
    for (let y = 5; y <= 15; y += 2) park(m, 3, y, 2);
    for (let y = 8; y <= 14; y += 2) park(m, 9, y, 2);
    // 후관 뒤편: 텃밭과 바닥 놀이 (주차하지 않는 곳)
    rect(m, 25, 2, 10, 2, TILE.GARDEN); rect(m, 13, 4, 3, 1, TILE.GARDEN); rect(m, 34, 4, 3, 1, TILE.GARDEN);
    label(m, 30, 1.7, '텃밭');
    obj(m, 'hopscotch', 18, 3.6, { solid: false }); obj(m, 'hopscotch', 22, 3.6, { solid: false });
    obj(m, 'maze', 27, 4.4, { solid: false });
    label(m, 23.5, 3.5, '바닥 놀이');
    // 야외학습장 (계단식 쉼터)
    rect(m, 11, 8, 5, 3, TILE.STEP); rect(m, 12, 11, 1, 6, TILE.GRASS);
    label(m, 13.5, 7.6, '야외학습장');
    // 북동: 미로 그림, 암석원
    obj(m, 'maze', 47, 2, { solid: false });
    for (let x = 40; x <= 45; x++) obj(m, 'rock', x, 0, { hitH: 6 });
    label(m, 42.5, 0.4, '암석원');
    for (const [x, y] of [[50, 6], [53, 6], [54, 9]]) set(m, x, y, TILE.TREE);
    // 안뜰: 정자 두 개, 2층 연결통로(아래로 지나간다), 달팽이 그림, 모래 놀이터
    polyFill(m, [[755, 270], [800, 265], [865, 415], [825, 415]], TILE.PILOTI);
    obj(m, 'bridgepost', 34, 11.4, { hitH: 4, hitX: 4, hitW: 8 }); obj(m, 'bridgepost', 37.6, 17, { hitH: 4, hitX: 4, hitW: 8 });
    label(m, 36, 15.4, '연결통로 (2층)');
    obj(m, 'gazebo', 19, 12, { hitH: 6, hitX: 6, hitW: 36 }); obj(m, 'gazebo', 22.4, 12, { hitH: 6, hitX: 6, hitW: 36 });
    label(m, 23, 15.9, '안뜰 정자');
    obj(m, 'spiral', 38, 11.5, { solid: false });
    // 나무 줄(남서→북동) 오른쪽은 한 층 낮은 마당. 사이에 옹벽, 가운데쯤 내려가는 계단.
    const lowSide = [];
    for (let y = 6; y <= 16; y++) {
      const x0 = Math.round(40 + (16 - y) * 0.6);
      for (let x = x0 + 3; x < 58; x++) if (get(m, x, y) === TILE.PAVE) { set(m, x, y, TILE.LOWPAVE); lowSide.push([x, y]); }
      const stair = y === 11 || y === 12, gap = y <= 7;   // 위쪽 끝: 후관 끝과 나무 사이로 지나가는 통로
      const side = stair ? TILE.OSTAIR : gap ? TILE.PAVE : TILE.TREE;
      set(m, x0, y, side); set(m, x0 + 1, y, side); set(m, x0 + 2, y, stair ? TILE.OSTAIR : TILE.CLIFF);
    }
    label(m, 44.5, 10.4, '계단 ↓');
    rect(m, 47, 8, 6, 5, TILE.SAND);
    const tires = { id: 'o' + (objSeq++), kind: 'tires', img: Sprites.makeTireBorder(6, 5), x: 47 * T, y: 8 * T, solid: false, interact: null, hidden: false };
    tires.w = tires.img.width; tires.h = tires.img.height; tires.hit = { x: tires.x, y: tires.y, w: 1, h: 1 };
    m.objects.push(tires);
    obj(m, 'swing', 47.6, 8.3, { hitH: 4 }); obj(m, 'seesaw', 49.5, 11, { hitH: 6 });
    label(m, 50, 13.4, '모래 놀이터');
    for (const [x, y] of [[42, 18], [47, 15], [53, 13]]) obj(m, 'pot', x, y, { solid: false });

    // 서쪽 길(정문 → 북서 주차장)
    // 정문 길 · 강당 앞
    rect(m, 2, 31, 9, 2, TILE.PAVE);
    // 운동장 쪽: 서쪽 주차장, 나무, 다목적구장, 수돗가
    rect(m, 2, 33, 6, 18, TILE.PARK);
    for (let y = 34; y <= 48; y += 3) { park(m, 2.2, y, 3); park(m, 5, y + 1, 3); }
    for (let y = 37; y <= 49; y += 2) set(m, 8, y, TILE.TREE);
    rect(m, 9, 33, 2, 18, TILE.GRASS); rect(m, 9, 39, 2, 12, TILE.COURT);
    label(m, 10, 38.6, '다목적구장');
    obj(m, 'tap', 8, 34.2, { hitH: 8 });
    // 본관 남쪽: 중앙현관 유리 차양, 현관 앞 벽돌 마당, 스탠드
    rect(m, 29, 24, 3, 7, TILE.CANOPY);
    rect(m, 32, 24, 18, 5, TILE.BRICK);
    polyFill(m, [[1000, 505], [1188, 378], [1275, 372], [1295, 450], [1165, 515], [1165, 600], [1000, 600]], TILE.BRICK);
    rect(m, 33, 29, 13, 2, TILE.STAND);
    for (const x of [38, 39, 40, 42, 43, 44, 46, 47]) { set(m, x, 26, TILE.TREE); set(m, x, 27, TILE.TREE); }
    for (const [x, y] of [[53, 22], [55, 24], [54, 21]]) set(m, x, y, TILE.TREE);
    label(m, 30.5, 23.4, '중앙현관');
    // 운동장: 트랙, 인조잔디(모서리 둥글게), 체육시설, 동쪽 스탠드
    rect(m, 11, 31, 34, 21, TILE.TRACK); rect(m, 45, 31, 7, 2, TILE.TRACK);
    const R = 5;
    for (let y = 34; y <= 49; y++) for (let x = 15; x <= 42; x++) {
      const cx = Math.max(15 + R - 0.5, Math.min(42 - R + 0.5, x)), cy = Math.max(34 + R - 0.5, Math.min(49 - R + 0.5, y));
      if (Math.hypot(x - cx, y - cy) <= R) set(m, x, y, TILE.TURF);
    }
    const marks = { id: 'o' + (objSeq++), kind: 'fieldmarks', img: Sprites.makeFieldMarks(34, 21, 6.5, 4, 22.75, 13), x: 11 * T, y: 31 * T, solid: false, interact: null, hidden: false };
    marks.w = marks.img.width; marks.h = marks.img.height; marks.hit = { x: marks.x, y: marks.y, w: 1, h: 1 };
    m.objects.push(marks);
    label(m, 28, 33.6, '운동장');
    obj(m, 'sandpit', 11, 41, { solid: false });
    label(m, 12, 40.4, '멀리뛰기');
    rect(m, 45, 33, 6, 17, TILE.COURT);
    const court = { id: 'o' + (objSeq++), kind: 'courtmarks', img: Sprites.makeCourtMarks(6, 17), x: 45 * T, y: 33 * T, solid: false, interact: null, hidden: false };
    court.w = court.img.width; court.h = court.img.height; court.hit = { x: court.x, y: court.y, w: 1, h: 1 };
    m.objects.push(court);
    rect(m, 51, 33, 2, 16, TILE.STAND);
    label(m, 48, 32.6, '체육시설');
    // 동쪽 주차장 (사선 울타리까지)
    for (let y = 24; y <= 50; y++) { const [, b] = inRow(y); for (let x = 53; x < b; x++) set(m, x, y, TILE.PARK); }
    for (let y = 26; y <= 50; y += 2) { park(m, 54, y, 2); if (y > 30) park(m, 58, y, 2); if (y > 36) park(m, 63, y, 2); }
    label(m, 57, 25.6, '주차장'); label(m, 5, 33.6, '주차장'); label(m, 7, 3.6, '주차장');

    // 건물
    const blocks = {};
    for (const k in BLOCKS) {
      const B = BLOCKS[k];
      const cells = polyCells(B.pts);
      for (const [x, y] of cells) set(m, x, y, TILE.BUILDING);
      blocks[k] = Object.assign({}, B, { cells: new Set(cells.map(([x, y]) => x + ',' + y)), doors: new Set() });
      m.buildings.push(blocks[k]);
    }
    // 곡선 건물 아래 스탠드 (곡선을 따라 비어 있는 칸만)
    for (let x = 18; x <= 27; x++) for (const y of [29, 30]) if (get(m, x, y) === TILE.PAVE) set(m, x, y, TILE.STAND);
    // 정문(서쪽)·후문(동쪽)
    set(m, 1, 31, TILE.PAVE); set(m, 1, 32, TILE.PAVE);
    obj(m, 'gatepost', 1, 29, { hitH: 8 }); obj(m, 'gatepost', 1, 32, { hitH: 8, dy: 16 });
    label(m, 2.2, 30.3, '정문');
    for (let y = 17; y <= 20; y++) { const [, b] = inRow(y); set(m, b, y, TILE.BRICK); set(m, b - 1, y, TILE.BRICK); }
    label(m, inRow(18)[1] - 1, 16.4, '후문');

    // 문 (출입 카드가 있어야 열린다)
    const L = 'card';
    const door = (blk, list, target) => list.forEach((d, i) => {
      if (blk) { blocks[blk].doors.add(d.x + ',' + d.y); }
      set(m, d.x, d.y, blk ? TILE.DOOR : TILE.EXIT);
      if (!blk && i === 0) obj(m, 'backdoor', d.x, d.y + 1, { solid: false });
      warp(m, d.x, d.y, target.map, target.ax, target.ay, target.dir, L);
    });
    door('bon', OUT.lobbyS, IN.lobbyS); door('bon', OUT.front, IN.front); door('bon', OUT.B, IN.B);
    door(null, OUT.lobbyN, IN.lobbyN); door(null, OUT.pass1N, IN.pass1N); door(null, OUT.pass2N, IN.pass2N);
    door('hu', OUT.huMid, IN.huMid); door('hu', OUT.huEnd, IN.huEnd);
    label(m, 24, OUT.front[1].y + 1.3, '현관'); label(m, 48.5, OUT.B[0].y + 1.25, '늘봄교실');

    // 현관 앞 마당: 국기 게양대, 교훈석, 조례대, 느티나무
    obj(m, 'flag', 27, 27, { hitH: 6, hitX: 4, hitW: 8, dy: -16, interact: { type: 'clue', m: 6, i: 3, name: '국기 게양대' } });
    obj(m, 'mottorock', 53.5, 21.5, { hitH: 10, hitX: 4, hitW: 48, interact: { type: 'sign', id: 'motto' } });
    obj(m, 'podium', 29, 31, { hitH: 10, interact: { type: 'clue', m: 6, i: 2, name: '조례대' } });
    obj(m, 'zelkova', 50, 20, { hitX: 18, hitW: 12, hitH: 6 });
    sign(m, 52, 24, 'symbol'); sign(m, 3, 30, 'gate'); sign(m, 27, 31, 'field');
    // 교표: 교목·교화 안내판 옆 안내판, 본관 중앙현관 위 벽
    obj(m, 'emblem', 50, 23.6, { hitH: 6, hitX: 8, hitW: 16, dy: -8, interact: { type: 'sign', id: 'symbol' } });
    obj(m, 'emblemwall', 30.25, 21.1, { solid: false });
    // 벽돌 광장 화단의 나무는 잔디 없이 벽돌 바닥 위에 그린다
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (get(m, x, y) !== TILE.TREE) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => get(m, x + dx, y + dy)).filter(v => v !== TILE.TREE && v !== TILE.BTREE);
      if (nb.length && nb.filter(v => v === TILE.BRICK).length * 2 >= nb.length) set(m, x, y, TILE.BTREE);
    }
    // 운동장 단서: 축구 골대, 농구 골대
    obj(m, 'goal', 16.4, 40, { hitH: 32, interact: { type: 'clue', m: 6, i: 0, name: '축구 골대' } });
    obj(m, 'goal', 40.6, 40, { hitH: 32 });
    obj(m, 'hoop', 47.5, 32.2, { hitH: 6, interact: { type: 'clue', m: 6, i: 1, name: '농구 골대' } });
    obj(m, 'hoop', 47.5, 42.4, { hitH: 6 });

    // 개나리 꽃 6송이 (바깥)
    star(m, 39, 12.5, 0); star(m, 46, 12, 1); star(m, 25, 17, 2); star(m, 49, 4, 3); star(m, 14, 9, 4); star(m, 48, 29, 5);

    // NPC
    m.start = [11, 32]; m.startDir = 'left';
    npc(m, { id: 'm1', role: 'mission', order: 1, pal: 'guard', tx: 7, ty: 31.4, face: 'right', place: '정문 앞' });
    npc(m, { id: 'robot', role: 'robot', tx: 15, ty: 31.5, face: 'left', place: '정문 앞 (운동장 입구)' });
    npc(m, { id: 'm6', role: 'mission', order: 6, pal: 'pe', tx: 28.5, ty: 41, face: 'down', place: '운동장' });
    friend(m, 'f1', 'soccer', 23, 43, 'right'); friend(m, 'f2', 'jumper', 9.5, 46, 'down');
    friend(m, 'f3', 'captain', 48, 12, 'left'); friend(m, 'f4', 'painterK', 21, 16.4, 'up');
    friend(m, 'f5', 'garden', 41, 13, 'left'); friend(m, 'f6', 'english', 37, 25.4, 'left');

    zone(m, 17, 35, 22, 12, 12, 'outdoor');
    zone(m, 12, 31, 30, 2, 3, 'outdoor');
    zone(m, 24, 12, 9, 6, 3, 'outdoor');
    zone(m, 32, 24, 5, 2, 2, 'outdoor');
    zone(m, 45, 35, 5, 12, 3, 'outdoor');
    return m;
  }

  // 바깥 지도 둘레에 차도·인도·숲을 붙이고, 차가 다닐 길(차선)을 만든다
  function padOutdoor(maps, L, TP, R, BT) {
    const o = maps.outdoor, W = o.w + L + R, H = o.h + TP + BT;
    const tiles = new Uint8Array(W * H).fill(TILE.FOREST);
    const outside = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ox = x - L, oy = y - TP;
      const t = ox >= 0 && oy >= 0 && ox < o.w && oy < o.h ? o.tiles[oy * o.w + ox] : TILE.ROAD;
      if (t === TILE.ROAD) outside.add(x + ',' + y); else tiles[y * W + x] = t === TILE.FENCE ? TILE.HEDGE : t;
    }
    // 동쪽 사선 울타리 위치 (칸, 소수): 항공사진 x = 1135 + 0.335 * y
    const fx = y => (1135 + 0.335 * (40 + 20 * (y - TP)) - 80) / 20 + L;
    const westRoad = [1, 2], northRoad = [0, 1], southRoad = [o.h + TP + 1, o.h + TP + 2];
    for (const k of outside) {
      const [x, y] = k.split(',').map(Number);
      const e = Math.round(fx(y)), eastSide = x > e - 1 && y > 1 && y < southRoad[0];
      let t = TILE.FOREST;
      if (northRoad.includes(y) && x <= fx(0) + 4) t = TILE.ROAD;
      else if (southRoad.includes(y)) t = TILE.ROAD;
      else if (westRoad.includes(x) && y < southRoad[0]) t = TILE.ROAD;
      else if (eastSide && (x === e + 2 || x === e + 3)) t = TILE.ROAD;
      else if (eastSide && (x === e + 1 || x === e + 4)) t = TILE.SIDEWALK;
      else if (eastSide && x > e + 4) t = TILE.FOREST;
      else if (y === 2 || x === 3 || x === 0 || y === southRoad[0] - 1 || y === southRoad[1] + 1) t = TILE.SIDEWALK;
      tiles[y * W + x] = t;
    }
    o.tiles = tiles; o.w = W; o.h = H;
    const dx = L * T, dy = TP * T;
    for (const ob of o.objects) { ob.x += dx; ob.y += dy; ob.hit.x += dx; ob.hit.y += dy; }
    for (const l of o.labels) { l.x += dx; l.y += dy; }
    for (const d of o.npcDefs) { d.tx += L; d.ty += TP; }
    for (const w of o.warps) { w.x += L; w.y += TP; }
    for (const z of o.zones) { z.x += L; z.y += TP; }
    for (const b of o.buildings) {
      const sh = set0 => new Set(Array.from(set0).map(k => { const [x, y] = k.split(',').map(Number); return (x + L) + ',' + (y + TP); }));
      b.cells = sh(b.cells); b.doors = sh(b.doors);
      if (b.signAt) b.signAt = [b.signAt[0] + L, b.signAt[1] + TP];
    }
    if (o.start) o.start = [o.start[0] + L, o.start[1] + TP];
    for (const id in maps) for (const w of maps[id].warps) if (w.to === 'outdoor') { w.ax += L; w.ay += TP; }
    // 차선 표시·울타리 난간 그림
    const c = document.createElement('canvas'); c.width = W * T; c.height = H * T;
    const g = c.getContext('2d');
    const dash = (x1, y1, x2, y2, col, d) => { g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(d || [6, 6]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
    // 사선 도로는 칸 대신 매끈한 띠로 덧그린다 (인도 · 차도 · 인도 · 숲)
    const band = (a1, a2, col) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo((fx(0) + a1) * T, 2 * T); g.lineTo((fx(0) + a2) * T, 2 * T);
      g.lineTo((fx(southRoad[0]) + a2) * T, southRoad[0] * T); g.lineTo((fx(southRoad[0]) + a1) * T, southRoad[0] * T);
      g.closePath(); g.fill();
    };
    band(5, 8, '#2f6a33'); band(0.9, 2, '#c9c3b6'); band(4, 5, '#c9c3b6'); band(2, 4, '#5d6168');
    g.fillStyle = '#5d6168'; g.fillRect((fx(2) + 2) * T, 0, 2 * T, 2 * T);
    const northEnd = (fx(0) + 4) * T, sy = southRoad[1] * T;
    dash(0, T, northEnd, T, '#ffd23a', [8, 6]);
    dash(2 * T, 2 * T, 2 * T, southRoad[0] * T, '#ffd23a', [8, 6]);
    dash(0, sy, W * T, sy, '#ffd23a', []); dash(0, sy + 1, W * T, sy + 1, '#ffd23a', []);
    dash((fx(0) + 3) * T, 0, (fx(H) + 3) * T, H * T, '#ffd23a', [8, 6]);
    // 정문·후문 앞 횡단보도
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) g.fillRect(1 * T + 2, (33 + TP - 2 + i * 0.5) * T + 2, 2 * T - 4, 4);
    const hy = 18 + TP, hx = fx(hy) + 2;
    for (let i = 0; i < 4; i++) g.fillRect(hx * T + 2, (hy - 1 + i * 0.5) * T + 2, 2 * T - 4, 4);
    // 울타리 난간 (정문·후문은 비운다)
    const P = (ax, ay) => [((ax - 80) / 20 + L) * T, ((ay - 30) / 20 + TP) * T];
    const rail = (a, b, skip) => {
      const [x1, y1] = P(...a), [x2, y2] = P(...b), n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2);
      for (let i = 0; i <= n; i++) {
        const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
        if (skip && skip(x / T, y / T)) continue;
        g.fillStyle = '#9aa0a8'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        if (i % 4 === 0) { g.fillStyle = '#6f757d'; g.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 4); }
      }
    };
    rail([100, 25], [1150, 25]);
    rail([1150, 25], [1505, 1110], (x, y) => y > hy - 1.5 && y < hy + 2.5);
    rail([1505, 1110], [100, 1110]);
    rail([100, 1110], [100, 25], (x, y) => y > 31 + TP - 0.2 && y < 33 + TP + 0.2);
    const marks = { id: 'o' + (objSeq++), kind: 'roadmarks', img: c, x: 0, y: 0, w: c.width, h: c.height, solid: false, interact: null, hidden: false, hit: { x: 0, y: 0, w: 1, h: 1 } };
    o.objects.unshift(marks);
    // 차선 (한국은 오른쪽 통행)
    const lane = (pts, gap) => ({ pts: pts.map(([x, y]) => [x * T, y * T]), gap: gap || [3, 8] });
    o.traffic = [
      lane([[-1, 1.5], [fx(0) + 4, 1.5]]), lane([[fx(0) + 4, 0.5], [-1, 0.5]]),
      lane([[1.5, -1], [1.5, southRoad[0]]]), lane([[2.5, southRoad[0]], [2.5, -1]]),
      lane([[-1, southRoad[1] + 0.5], [W + 1, southRoad[1] + 0.5]], [2.5, 6]), lane([[W + 1, southRoad[0] + 0.5], [-1, southRoad[0] + 0.5]], [2.5, 6]),
      lane([[fx(-1) + 2.5, -1], [fx(H + 1) + 2.5, H + 1]]), lane([[fx(H + 1) + 3.5, H + 1], [fx(-1) + 3.5, -1]])
    ];
  }

  // 실내 지도 좌우 뒤집기 (바깥 항공사진 방향에 맞춘다)
  function mirror(m) {
    const W = m.w, t2 = new Uint8Array(m.tiles.length);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < W; x++) t2[y * W + (W - 1 - x)] = m.tiles[y * W + x];
    m.tiles = t2;
    for (const o of m.objects) { o.x = W * T - o.x - o.w; o.hit.x = W * T - o.hit.x - o.hit.w; }
    for (const l of m.labels) l.x = W * T - l.x;
    const flip = f => (f === 'left' ? 'right' : f === 'right' ? 'left' : f);
    for (const d of m.npcDefs) { d.tx = W - 1 - d.tx; d.face = flip(d.face); }
    for (const w of m.warps) w.x = W - 1 - w.x;
    for (const z of m.zones) z.x = W - z.x - z.w;
    for (const z of m.darkZones) z.x = W - z.x - z.w;
    m.mirrored = true;
  }

  function build() {
    objSeq = 1; OUT = outdoorDoors(); IN = {};
    const inner = [buildB(), buildF1(), buildF2(), buildF3(), buildF4(), buildBack(1), buildBack(2), buildBack(3), buildBack(4)];
    const maps = {};
    for (const m of inner) maps[m.id] = m;
    maps.outdoor = buildOutdoor();
    padOutdoor(maps, 3, 2, 6, 4);
    // 강당과 연결동 사이 좁은 골목은 출입 금지: 입구를 철문으로 막는다 (패딩 뒤라 울타리→생울타리 변환을 피한다)
    for (const x of [16, 17]) set(maps.outdoor, x + 3, 28 + 2, TILE.FENCE);
    for (const m of inner) mirror(m);
    // 뒤집힌 지도로 들어가는 문은 도착 지점도 뒤집는다
    for (const id in maps) for (const w of maps[id].warps) {
      const t = maps[w.to];
      if (t && t.mirrored) { w.ax = t.w - w.ax; w.dir = w.dir === 'left' ? 'right' : w.dir === 'right' ? 'left' : w.dir; }
    }
    return maps;
  }

  return { build, get, T, PX };
})();
