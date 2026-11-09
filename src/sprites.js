// 픽셀아트 그래픽을 코드로 그린다 (외부 이미지 없음).
// 나중에 실제 픽셀아트 에셋으로 바꿀 때는 이 파일의 그리기 함수만 이미지로 교체하면 된다.
const Sprites = (() => {
  const T = 16;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

  // ---------- 타일 ----------
  const TILE = {
    GRASS: 0, PATH: 1, FIELD: 2, LINE: 3, WOOD: 4, HALL: 5, CAFE: 6, WALL: 7, FENCE: 8, TREE: 9,
    FLOWER: 10, UP: 11, DOWN: 12, DOOR: 13, EXIT: 14, BUILDING: 15, VOID: 16, CARPET: 17,
    // 실제 대교초 맵용
    PAVE: 18, BRICK: 19, TRACK: 20, TURF: 21, COURT: 22, SAND: 23, STEP: 24, PILOTI: 25, PARK: 26, BRIDGE: 27, MAT: 28,
    ROAD: 29, STAND: 30, CANOPY: 31,
    HEDGE: 32, SIDEWALK: 33, CLIFF: 34, LOWPAVE: 35, GARDEN: 36, OSTAIR: 37, FOREST: 38,
    BTREE: 39, PTREE: 40      // 벽돌·보도블록 위에 심은 나무 (화단 잔디 없이)
  };
  const SOLID = new Set([TILE.WALL, TILE.FENCE, TILE.TREE, TILE.BUILDING, TILE.VOID, TILE.ROAD, TILE.STAND,
    TILE.HEDGE, TILE.SIDEWALK, TILE.CLIFF, TILE.GARDEN, TILE.FOREST, TILE.BTREE, TILE.PTREE]);

  // 대교초 교표 (학교 홈페이지 그림에서 오려 냄)
  const EMBLEM = new Image();
  EMBLEM.src = 'data:image/png;base64,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';
  function onEmblem(fn) { if (EMBLEM.complete && EMBLEM.naturalWidth) fn(); else EMBLEM.addEventListener('load', fn); }

  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function drawTile(g, t, tx, ty, below) {
    const x = tx * T, y = ty * T;
    switch (t) {
      case TILE.GRASS:
      case TILE.FLOWER: {
        px(g, x, y, T, T, '#5fae4b');
        for (let i = 0; i < 6; i++) {
          const a = hash(tx, ty, i), b = hash(tx, ty, i + 9);
          px(g, x + Math.floor(a * 15), y + Math.floor(b * 15), 1, 2, '#4c9a3c');
        }
        if (t === TILE.FLOWER) {
          const cols = ['#ffd84a', '#ff7aa8', '#ffffff'];
          for (let i = 0; i < 3; i++) {
            const a = hash(tx, ty, i + 20), b = hash(tx, ty, i + 30);
            const fx = x + 2 + Math.floor(a * 11), fy = y + 2 + Math.floor(b * 11);
            px(g, fx, fy, 2, 2, cols[i]);
            px(g, fx + 1, fy + 2, 1, 1, '#3d8a30');
          }
        }
        break;
      }
      case TILE.PATH:
        px(g, x, y, T, T, '#d9c08c');
        for (let i = 0; i < 4; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 5) * 15), 2, 1, '#c4a974');
        break;
      case TILE.FIELD:
      case TILE.LINE:
        px(g, x, y, T, T, '#c98f5a');
        for (let i = 0; i < 5; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 7) * 15), 1, 1, '#b57c48');
        if (t === TILE.LINE) px(g, x, y + 7, T, 2, '#f4efe4');
        break;
      case TILE.WOOD:
        px(g, x, y, T, T, '#c8925a');
        for (let r = 0; r < 4; r++) {
          px(g, x, y + r * 4 + 3, T, 1, '#ad7a46');
          px(g, x + ((r * 7 + tx * 3) % 16), y + r * 4, 1, 3, '#ad7a46');
        }
        break;
      case TILE.HALL:
        px(g, x, y, T, T, '#e6e1d3');
        px(g, x, y, T, 1, '#d2ccbb'); px(g, x, y, 1, T, '#d2ccbb');
        if ((tx + ty) % 2 === 0) px(g, x + 1, y + 1, 15, 15, '#ebe7da');
        break;
      case TILE.CAFE:
        px(g, x, y, T, T, (tx + ty) % 2 ? '#9fc6d8' : '#b7d6e4');
        break;
      case TILE.CARPET:
        px(g, x, y, T, T, '#7c6bb3');
        px(g, x, y + 7, T, 1, '#6b5aa0');
        break;
      case TILE.WALL:
        if (below === undefined || SOLID.has(below) || below === TILE.VOID) {
          px(g, x, y, T, T, '#5a5068');
          px(g, x, y, T, 1, '#6c6180');
        } else {
          // 아래가 바닥이면 벽의 앞면(세운 면)을 그린다
          px(g, x, y, T, 4, '#5a5068');
          px(g, x, y + 4, T, 12, '#f1e3c4');
          px(g, x, y + 13, T, 3, '#b9a37f');
          px(g, x, y + 4, T, 1, '#d9c9a6');
        }
        break;
      case TILE.FENCE:          // 보도 위 철문(출입 금지)
        drawTile(g, TILE.PAVE, tx, ty, below);
        px(g, x, y + 5, T, 2, '#7a7f87'); px(g, x, y + 10, T, 2, '#7a7f87');
        px(g, x + 2, y + 3, 2, 11, '#9aa0a8'); px(g, x + 12, y + 3, 2, 11, '#9aa0a8');
        break;
      case TILE.TREE:
      case TILE.BTREE:
      case TILE.PTREE:
        if (t === TILE.TREE) px(g, x, y, T, T, '#5fae4b');
        else drawTile(g, t === TILE.BTREE ? TILE.BRICK : TILE.PAVE, tx, ty, below);
        px(g, x + 7, y + 11, 3, 5, '#7a4e2c');
        px(g, x + 2, y + 1, 12, 11, '#2f7d3b');
        px(g, x + 1, y + 3, 14, 7, '#2f7d3b');
        px(g, x + 4, y + 2, 5, 4, '#45a052');
        px(g, x + 3, y + 10, 10, 2, '#24652f');
        break;
      case TILE.UP:       // 올라가는 계단: 밝은 노란빛 + ▲
      case TILE.DOWN: {   // 내려가는 계단: 어두운 푸른빛 + ▼
        const up = t === TILE.UP;
        px(g, x, y, T, T, up ? '#b8a46e' : '#5f6f86');
        for (let i = 0; i < 4; i++) {
          px(g, x, y + i * 4, T, 3, up ? '#f1df9e' : '#8ea0b8');
          px(g, x, y + i * 4 + 3, T, 1, up ? '#9c8650' : '#46546a');
        }
        px(g, x, y, 1, T, up ? '#9c8650' : '#3a4659'); px(g, x + T - 1, y, 1, T, up ? '#9c8650' : '#3a4659');
        // 화살표
        const ac = up ? '#c0392b' : '#ffffff';
        if (up) { px(g, x + 7, y + 3, 2, 1, ac); px(g, x + 6, y + 4, 4, 1, ac); px(g, x + 5, y + 5, 6, 1, ac); px(g, x + 7, y + 6, 2, 6, ac); }
        else { px(g, x + 7, y + 3, 2, 6, ac); px(g, x + 5, y + 9, 6, 1, ac); px(g, x + 6, y + 10, 4, 1, ac); px(g, x + 7, y + 11, 2, 1, ac); }
        break;
      }
      case TILE.DOOR:
        px(g, x, y, T, T, '#d9c08c');
        break;
      case TILE.EXIT:
        px(g, x, y, T, T, '#e6e1d3');
        px(g, x + 1, y + 2, 14, 12, '#3f7fbf');
        px(g, x + 3, y + 4, 10, 8, '#5a9ad6');
        break;
      case TILE.VOID:
        px(g, x, y, T, T, '#2a2533');
        break;
      case TILE.BUILDING:
        px(g, x, y, T, T, '#5fae4b');
        break;
      case TILE.PAVE:         // 학교 바닥 보도블록: 회색 바탕에 검정·흰 블록이 흩어져 있다
      case TILE.PILOTI: {
        const base = t === TILE.PILOTI ? '#8f9097' : '#b9bbc0';
        px(g, x, y, T, T, base);
        for (let r = 0; r < 4; r++) px(g, x, y + r * 4 + 3, T, 1, t === TILE.PILOTI ? '#83848b' : '#aaacb2');
        for (let r = 0; r < 4; r++) px(g, x + ((r * 5 + tx * 3) % 4) * 4, y + r * 4, 1, 3, t === TILE.PILOTI ? '#83848b' : '#aaacb2');
        const h1 = hash(tx, ty, 3);
        if (h1 < 0.35) px(g, x + Math.floor(hash(tx, ty, 4) * 3) * 4 + 1, y + Math.floor(hash(tx, ty, 5) * 3) * 4 + 4, 4, 3, h1 < 0.18 ? '#4a4b52' : '#e9eaee');
        if (t === TILE.PILOTI) { px(g, x, y, T, 2, 'rgba(0,0,0,0.12)'); }
        break;
      }
      case TILE.BRICK:        // 빨간 벽돌 길 (정문 경사로·현관 앞 광장)
        px(g, x, y, T, T, '#b9583f');
        for (let r = 0; r < 4; r++) {
          px(g, x, y + r * 4 + 3, T, 1, '#9c4733');
          for (let c = 0; c < 2; c++) px(g, x + ((r % 2) * 4 + c * 8) % 16, y + r * 4, 1, 3, '#9c4733');
          if (hash(tx, ty, r) < 0.3) px(g, x + Math.floor(hash(tx, ty, r + 7) * 12), y + r * 4, 4, 3, '#a64d36');
        }
        break;
      case TILE.TRACK:
        px(g, x, y, T, T, '#c4463a');
        for (let i = 0; i < 6; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 9) * 15), 1, 1, '#a83a30');
        break;
      case TILE.TURF:
        px(g, x, y, T, T, (tx + Math.floor(ty / 2)) % 2 ? '#3f9a46' : '#46a54d');
        for (let i = 0; i < 4; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 9) * 15), 1, 2, '#378a3e');
        break;
      case TILE.COURT:
        px(g, x, y, T, T, '#5fb3a1');
        px(g, x, y, T, 1, '#6cc0ae');
        break;
      case TILE.SAND:
        px(g, x, y, T, T, '#e6d2a3');
        for (let i = 0; i < 7; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 9) * 15), 1, 1, '#cdb683');
        break;
      case TILE.STEP:         // 스탠드·계단식 쉼터
        px(g, x, y, T, T, '#a9a59b');
        px(g, x, y, T, 5, '#c9c4b8'); px(g, x, y + 5, T, 1, '#7d7a72');
        px(g, x, y + 8, T, 4, '#bdb8ad'); px(g, x, y + 12, T, 1, '#7d7a72');
        break;
      case TILE.PARK:
        px(g, x, y, T, T, '#9a9ca3');
        if (tx % 2 === 0) px(g, x, y, 1, T, '#f4f4f4');
        break;
      case TILE.BRIDGE:       // 연결통로 바닥
        px(g, x, y, T, T, '#cfd8e0');
        px(g, x, y, 1, T, '#a9b6c2'); px(g, x + 15, y, 1, T, '#a9b6c2');
        px(g, x + 4, y + 2, 8, 1, '#e8eef3');
        break;
      case TILE.ROAD:         // 학교 밖 도로
        px(g, x, y, T, T, '#5d6168');
        for (let i = 0; i < 5; i++) px(g, x + Math.floor(hash(tx, ty, i) * 15), y + Math.floor(hash(tx, ty, i + 9) * 15), 1, 1, '#6b6f77');
        break;
      case TILE.STAND:        // 스탠드 (파랑·흰 줄무늬 지붕)
        px(g, x, y, T, T, '#f2f4f7');
        for (let i = 0; i < 4; i++) px(g, x + i * 4, y, 2, T, '#3d6fe9');
        px(g, x, y + 14, T, 2, '#9aa0a8');
        break;
      case TILE.CANOPY:       // 중앙현관 유리 차양 (아래로 걸어 다닌다)
        px(g, x, y, T, T, '#b9583f');
        for (let r = 0; r < 4; r++) px(g, x, y + r * 4 + 3, T, 1, '#9c4733');
        px(g, x + 1, y + 1, T - 2, T - 2, 'rgba(111, 211, 199, 0.55)');
        px(g, x, y, T, 1, '#7d828b'); px(g, x, y, 1, T, '#7d828b');
        break;
      case TILE.HEDGE:        // 울타리를 따라 심은 산울타리
        px(g, x, y, T, T, '#3f7f3a');
        for (let i = 0; i < 5; i++) px(g, x + Math.floor(hash(tx, ty, i) * 12), y + Math.floor(hash(tx, ty, i + 9) * 12), 4, 4, i % 2 ? '#4f9a46' : '#356e31');
        px(g, x, y + 14, T, 2, '#2c5a29');
        break;
      case TILE.SIDEWALK:     // 학교 밖 인도
        px(g, x, y, T, T, '#c9c3b6');
        px(g, x, y + 7, T, 1, '#b3ad9f'); px(g, x + 7, y, 1, 7, '#b3ad9f'); px(g, x + 3, y + 8, 1, 8, '#b3ad9f');
        break;
      case TILE.FOREST:       // 학교 동쪽 숲
        px(g, x, y, T, T, '#2f6a33');
        for (let i = 0; i < 4; i++) px(g, x + Math.floor(hash(tx, ty, i) * 11), y + Math.floor(hash(tx, ty, i + 9) * 11), 6, 5, i % 2 ? '#3d8040' : '#26582a');
        break;
      case TILE.CLIFF:        // 높이가 다른 곳 사이의 옹벽
        px(g, x, y, T, T, '#a8a49a');
        for (let r = 0; r < 4; r++) px(g, x, y + r * 4 + 3, T, 1, '#8c887e');
        px(g, x, y, T, 3, '#c9c5bb'); px(g, x + T - 3, y, 3, T, '#77736a');
        break;
      case TILE.LOWPAVE:      // 한 층 낮은 마당
        px(g, x, y, T, T, '#a9abb1');
        for (let r = 0; r < 4; r++) px(g, x, y + r * 4 + 3, T, 1, '#9b9da3');
        if (hash(tx, ty, 3) < 0.25) px(g, x + 5, y + 8, 4, 3, '#e3e4e8');
        break;
      case TILE.GARDEN:       // 텃밭 (흙 이랑 + 채소)
        px(g, x, y, T, T, '#7a5a3a');
        for (let r = 0; r < 2; r++) {
          px(g, x, y + r * 8, T, 3, '#8d6a45');
          for (let c = 0; c < 4; c++) px(g, x + 1 + c * 4, y + r * 8 + 3, 3, 3, (tx + c + r) % 3 ? '#4f9a3d' : '#7fc25e');
        }
        px(g, x, y + T - 1, T, 1, '#5e4329');
        break;
      case TILE.OSTAIR:       // 바깥 계단
        px(g, x, y, T, T, '#bdb9ae');
        for (let i = 0; i < 4; i++) { px(g, x, y + i * 4, T, 3, '#d4d0c6'); px(g, x, y + i * 4 + 3, T, 1, '#8c887e'); }
        px(g, x, y, 1, T, '#9aa0a8'); px(g, x + T - 1, y, 1, T, '#9aa0a8');
        break;
      case TILE.MAT:          // 늘봄교실 놀이 매트
        px(g, x, y, T, T, ['#f7c6c6', '#c6e2f7', '#d8f2c4', '#fbe7a8'][(tx + ty * 3) % 4]);
        px(g, x, y, T, 1, 'rgba(0,0,0,0.06)'); px(g, x, y, 1, T, 'rgba(0,0,0,0.06)');
        break;
    }
  }

  // 바깥 맵의 건물: 위는 지붕, 아래쪽은 세워 그린 정면(창문·현관)
  // b.doors = [{ x, w, kind }]  (kind: 'main' 중앙현관 | 'glass' | 'plain')
  // b.style = 'brick' 이면 빨간 벽돌 + 크림색 띠 (대교초 건물)
  function drawBuilding(g, b) {
    if (b.cells) return drawBlock(g, b);
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    const faceH = b.floors * T;
    const roofH = h - faceH;
    const doors = b.doors || [{ x: b.door, w: b.doorW }];
    const brick = b.style === 'brick';
    // 지붕 (평평한 옥상)
    px(g, x, y, w, roofH, b.roof);
    for (let ry = 0; ry < roofH; ry += 8) px(g, x, y + ry + 7, w, 1, shade(b.roof, -12));
    for (let rx = 0; rx < w; rx += 32) px(g, x + rx + 31, y, 1, roofH, shade(b.roof, -12));
    px(g, x, y, w, 2, shade(b.roof, 28)); px(g, x, y, 2, roofH, shade(b.roof, 18)); px(g, x + w - 2, y, 2, roofH, shade(b.roof, -20));
    px(g, x, y + roofH - 3, w, 3, shade(b.roof, -35));
    (b.roofItems || []).forEach(r => { px(g, x + r[0] * T, y + r[1] * T, r[2] * T, r[3] * T, shade(b.roof, -22)); px(g, x + r[0] * T + 2, y + r[1] * T + 2, r[2] * T - 4, r[3] * T - 4, shade(b.roof, 10)); });
    // 정면 벽
    b.windows = [];
    px(g, x, y + roofH, w, faceH, b.wall);
    if (brick) {
      for (let yy = 0; yy < faceH; yy += 3) {
        px(g, x, y + roofH + yy + 2, w, 1, shade(b.wall, -22));
        for (let xx = (yy / 3) % 2 ? 0 : 3; xx < w; xx += 6) px(g, x + xx, y + roofH + yy, 1, 2, shade(b.wall, -16));
      }
    }
    px(g, x, y + roofH, w, 2, shade(b.wall, -30));
    const inDoor = (wx, ww) => doors.some(d => wx + ww > d.x * T - 6 && wx < (d.x + d.w) * T + 6);
    for (let f = 0; f < b.floors; f++) {
      const fy = y + roofH + f * T;
      if (brick) { px(g, x, fy, w, 2, '#ecd59a'); px(g, x, fy + 2, w, 1, '#c9ae6e'); }
      else px(g, x, fy + T - 1, w, 1, shade(b.wall, -20));
      const step = b.winStep || 16;
      for (let wx = x + 5; wx + 11 < x + w - 3; wx += step) {
        if (f === b.floors - 1 && inDoor(wx, 11)) continue;
        px(g, wx, fy + 4, 11, 9, brick ? '#f4f1e8' : '#33495e');
        px(g, wx + 1, fy + 5, 9, 7, '#8fc3e6');
        b.windows.push({ x: wx + 1, y: fy + 5, w: 9, h: 7 });
        px(g, wx + 1, fy + 5, 3, 2, '#d4ecfa');
        px(g, wx + 5, fy + 4, 1, 9, brick ? '#f4f1e8' : '#33495e');
        px(g, wx + 1, fy + 8, 9, 1, brick ? '#f4f1e8' : '#33495e');
      }
    }
    // 꼭대기 색 띠 (빨강·주황·노랑·초록)
    if (b.stripes) {
      const cols = ['#e23b3b', '#ff8a2a', '#ffd23a', '#46b866'];
      b.stripes.forEach((sx, i) => px(g, x + sx * T, y + roofH + 3, 6, T - 3, cols[i % 4]));
    }
    // 현관
    for (const d of doors) {
      const dx = d.x * T, dw = d.w * T, dy = y + h - T;
      if (d.kind === 'main') {
        // 중앙현관: 돌기둥과 넓은 차양
        px(g, dx - 10, dy - 9, dw + 20, 5, '#6f7279'); px(g, dx - 10, dy - 9, dw + 20, 1, '#9fa3ab');
        px(g, dx - 8, dy - 4, 4, T + 4, '#d6d2c8'); px(g, dx + dw + 4, dy - 4, 4, T + 4, '#d6d2c8');
        px(g, dx + 4, dy - 8, dw - 8, 2, '#6fd3c7');
      } else {
        px(g, dx - 3, dy - 6, dw + 6, 6, '#c9c4b8'); px(g, dx - 3, dy - 6, dw + 6, 1, '#e8e4da');
      }
      px(g, dx, dy, dw, T, '#4a5160');
      px(g, dx + 2, dy + 2, dw / 2 - 3, T - 2, '#8fc3e6');
      px(g, dx + dw / 2 + 1, dy + 2, dw / 2 - 3, T - 2, '#8fc3e6');
      px(g, dx + dw / 2 - 1, dy + 1, 2, T - 1, '#c0c6cc');
    }
    // 간판 판 (글자는 화면 위에 따로 그림)
    if (b.name) {
      const sw = Math.min(w - 16, b.name.length * 9 + 16);
      const sx = b.signX != null ? b.signX * T - sw / 2 : x + (w - sw) / 2;
      px(g, sx, y + roofH - 13, sw, 11, '#f7f2e3');
      px(g, sx, y + roofH - 13, sw, 1, '#c8b98f');
      px(g, sx, y + roofH - 3, sw, 1, '#a39370');
      b.signRect = { x: sx, y: y + roofH - 13, w: sw, h: 11 };
    }
  }

  // 항공사진 모양 그대로의 건물 (칸 모양이 자유로운 덩어리)
  // b = { cells: Set('x,y'), roof, wall, face(정면 높이 칸), floors, style, doors: Set('x,y'), stripes: [x], ribs }
  // 각 세로줄의 아래쪽 face칸은 정면(벽·창문), 그 위는 옥상으로 그린다.
  function drawBlock(g, b) {
    b.windows = [];
    const has = (x, y) => b.cells.has(x + ',' + y);
    const cols = {};
    for (const k of b.cells) { const [x, y] = k.split(',').map(Number); (cols[x] = cols[x] || []).push(y); }
    const faceRows = new Set();
    for (const xs in cols) {
      const x = +xs, ys = cols[x].sort((a, c) => a - c);
      const runs = [];
      let s0 = ys[0], p0 = ys[0];
      for (const y of ys.slice(1)) { if (y === p0 + 1) { p0 = y; continue; } runs.push([s0, p0]); s0 = p0 = y; }
      runs.push([s0, p0]);
      for (const [y0, y1] of runs) {
        const f = b.face ? Math.min(b.face, Math.max(1, y1 - y0)) : 0;
        for (let y = y1 - f + 1; y <= y1; y++) faceRows.add(x + ',' + y);
      }
    }
    const isFace = (x, y) => faceRows.has(x + ',' + y);
    // 옥상
    for (const k of b.cells) {
      const [tx, ty] = k.split(',').map(Number);
      if (isFace(tx, ty)) continue;
      const x = tx * T, y = ty * T;
      px(g, x, y, T, T, b.roof);
      if (b.ribs) for (let i = 1; i < T; i += 4) px(g, x + i, y, 1, T, shade(b.roof, -14));
      else { if ((tx + ty) % 2 === 0) px(g, x + 2, y + 2, T - 4, T - 4, shade(b.roof, 5)); px(g, x, y + T - 1, T, 1, shade(b.roof, -8)); }
      if (!has(tx, ty - 1)) { px(g, x, y, T, 3, shade(b.roof, 30)); px(g, x, y + 3, T, 1, shade(b.roof, -25)); }
      if (!has(tx - 1, ty) || (isFace(tx - 1, ty) && !isFace(tx, ty))) px(g, x, y, 2, T, shade(b.roof, 22));
      if (!has(tx + 1, ty) || (isFace(tx + 1, ty) && !isFace(tx, ty))) px(g, x + T - 2, y, 2, T, shade(b.roof, -28));
    }
    (b.roofItems || []).forEach(r => { px(g, r[0] * T, r[1] * T, r[2] * T, r[3] * T, shade(b.roof, -30)); px(g, r[0] * T + 2, r[1] * T + 2, r[2] * T - 4, r[3] * T - 4, shade(b.roof, 15)); });
    // 정면
    const brick = b.style === 'brick';
    for (const xs in cols) {
      const tx = +xs;
      const rows = cols[tx].filter(y => isFace(tx, y)).sort((a, c) => a - c);
      if (!rows.length) continue;
      // 이어진 정면 덩어리마다
      let i = 0;
      while (i < rows.length) {
        let j = i; while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
        const ya = rows[i] * T, yb = (rows[j] + 1) * T, h = yb - ya, x = tx * T;
        px(g, x, ya, T, h, b.wall);
        if (brick) for (let yy = 0; yy < h; yy += 3) {
          px(g, x, ya + yy + 2, T, 1, shade(b.wall, -22));
          for (let xx = (yy / 3) % 2 ? 0 : 3; xx < T; xx += 6) px(g, x + xx, ya + yy, 1, 2, shade(b.wall, -16));
        } else for (let yy = 0; yy < h; yy += 8) px(g, x, ya + yy + 7, T, 1, shade(b.wall, -14));
        px(g, x, ya, T, 2, shade(b.wall, -35));
        const fl = b.floors || 1, fh = h / fl;
        const door = b.doors && b.doors.has(tx + ',' + rows[j]);
        for (let f = 0; f < fl; f++) {
          const fy = Math.round(ya + f * fh);
          if (brick) { px(g, x, fy, T, 2, '#ecd59a'); px(g, x, fy + 2, T, 1, '#c9ae6e'); }
          if (door && f === fl - 1) continue;
          const wh = Math.max(4, Math.round(fh) - 6);
          px(g, x + 2, fy + 3, 12, wh, brick ? '#f4f1e8' : '#3d4654');
          px(g, x + 3, fy + 4, 10, wh - 2, '#8fc3e6');
          b.windows.push({ x: x + 3, y: fy + 4, w: 10, h: wh - 2 });
          px(g, x + 3, fy + 4, 3, 2, '#d4ecfa');
          px(g, x + 8, fy + 3, 1, wh, brick ? '#f4f1e8' : '#3d4654');
        }
        if (b.stripes && b.stripes.includes(tx)) {
          const cols4 = ['#e23b3b', '#ff8a2a', '#ffd23a', '#46b866'];
          px(g, x + 1, ya + 3, 4, Math.round(fh) - 4, cols4[b.stripes.indexOf(tx) % 4]);
        }
        if (!isFace(tx - 1, rows[i])) px(g, x, ya, 1, h, shade(b.wall, 25));
        if (!isFace(tx + 1, rows[i])) px(g, x + T - 1, ya, 1, h, shade(b.wall, -40));
        if (door) {
          const dy = yb - Math.round(fh);
          px(g, x, dy - 3, T, 3, '#c9c4b8'); px(g, x, dy - 3, T, 1, '#e8e4da');
          px(g, x + 1, dy, T - 2, yb - dy, '#4a5160');
          px(g, x + 2, dy + 2, T - 4, yb - dy - 2, '#8fc3e6'); px(g, x + 7, dy + 1, 2, yb - dy - 1, '#c0c6cc');
        }
        px(g, x, yb - 2, T, 2, shade(b.wall, -45));
        i = j + 1;
      }
    }
    if (b.name && b.signAt) {
      const sw = b.name.length * 9 + 16;
      const sx = b.signAt[0] * T - sw / 2, sy = b.signAt[1] * T;
      px(g, sx, sy, sw, 11, '#f7f2e3'); px(g, sx, sy, sw, 1, '#c8b98f'); px(g, sx, sy + 10, sw, 1, '#a39370');
      b.signRect = { x: sx, y: sy, w: sw, h: 11 };
    }
  }

  // 모래 놀이터 둘레의 알록달록한 타이어
  function makeTireBorder(w, h) {
    const [c, g] = canvas(w * T, h * T);
    const cols = ['#e23b3b', '#ff8a2a', '#ffd23a', '#46b866', '#3d6fe9', '#8a4fd8'];
    let i = 0;
    const tire = (x, y) => { px(g, x, y, 6, 6, '#2b2b2b'); px(g, x + 1, y + 1, 4, 4, cols[i++ % cols.length]); px(g, x + 2, y + 2, 2, 2, '#2b2b2b'); };
    for (let x = 0; x <= w * T - 6; x += 6) { tire(x, 0); tire(x, h * T - 6); }
    for (let y = 6; y <= h * T - 12; y += 6) { tire(0, y); tire(w * T - 6, y); }
    return c;
  }
  // 위에서 본 자동차 (위쪽이 앞)
  function makeCarTop(col) {
    const [c, g] = canvas(14, 24);
    px(g, 1, 2, 12, 20, col); px(g, 2, 1, 10, 2, col); px(g, 2, 21, 10, 2, col);
    px(g, 2, 5, 10, 4, '#2c3a4a'); px(g, 3, 6, 8, 1, '#6fa8d8'); px(g, 2, 16, 10, 3, '#2c3a4a');
    px(g, 3, 10, 8, 5, shade(col, 18));
    px(g, 0, 4, 1, 4, '#222'); px(g, 13, 4, 1, 4, '#222'); px(g, 0, 16, 1, 4, '#222'); px(g, 13, 16, 1, 4, '#222');
    px(g, 2, 0, 3, 1, '#fff6c4'); px(g, 9, 0, 3, 1, '#fff6c4'); px(g, 2, 23, 3, 1, '#e23b3b'); px(g, 9, 23, 3, 1, '#e23b3b');
    return c;
  }

  // 체육시설 바닥: 위쪽 농구 코트 + 아래쪽 네트 코트 (항공사진처럼 세로 방향)
  function makeCourtMarks(w, h) {
    const [c, g] = canvas(w * T, h * T);
    const W2 = 'rgba(255,255,255,0.9)';
    const CW = w * T, CH = h * T;
    const bTop = 6, bBot = Math.round(CH * 0.63), bx = 6, bw = CW - 12;   // 농구 코트
    const mid = (bTop + bBot) / 2, cx = CW / 2;
    // 자유투 구역은 조금 진한 색
    g.fillStyle = 'rgba(30, 110, 100, 0.45)';
    g.fillRect(cx - 14, bTop, 28, 38); g.fillRect(cx - 14, bBot - 38, 28, 38);
    g.strokeStyle = W2; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, bTop + 0.5, bw - 1, bBot - bTop - 1);
    g.beginPath(); g.moveTo(bx, Math.round(mid) + 0.5); g.lineTo(bx + bw, Math.round(mid) + 0.5); g.stroke();
    g.beginPath(); g.arc(cx, mid, 12, 0, Math.PI * 2); g.stroke();
    for (const top of [true, false]) {
      const y0 = top ? bTop : bBot, dir = top ? 1 : -1;
      g.strokeRect(cx - 14 + 0.5, top ? y0 + 0.5 : y0 - 38 + 0.5, 27, 37);                   // 자유투 구역
      g.beginPath(); g.arc(cx, y0 + dir * 38, 12, top ? 0 : Math.PI, top ? Math.PI : Math.PI * 2); g.stroke();   // 자유투 원
      g.beginPath(); g.moveTo(bx + 5, y0); g.lineTo(bx + 5, y0 + dir * 22);                    // 3점 라인
      g.arc(cx, y0 + dir * 22, cx - bx - 5, top ? Math.PI : 0, top ? 0 : Math.PI, !top);
      g.lineTo(bx + bw - 5, y0); g.stroke();
    }
    // 아래쪽 네트 코트 (배드민턴·족구)
    const nTop = bBot + 14, nBot = CH - 8, nx = 14, nw = CW - 28, nm = (nTop + nBot) / 2;
    g.strokeRect(nx + 0.5, nTop + 0.5, nw - 1, nBot - nTop - 1);
    g.beginPath(); g.moveTo(nx + 6.5, nTop); g.lineTo(nx + 6.5, nBot); g.moveTo(nx + nw - 6.5, nTop); g.lineTo(nx + nw - 6.5, nBot); g.stroke();
    g.beginPath(); g.moveTo(cx + 0.5, nTop); g.lineTo(cx + 0.5, nm - 14); g.moveTo(cx + 0.5, nm + 14); g.lineTo(cx + 0.5, nBot); g.stroke();
    g.beginPath(); g.moveTo(nx, nm - 14 + 0.5); g.lineTo(nx + nw, nm - 14 + 0.5); g.moveTo(nx, nm + 14 + 0.5); g.lineTo(nx + nw, nm + 14 + 0.5); g.stroke();
    // 네트와 기둥
    px(g, nx - 4, Math.round(nm) - 1, nw + 8, 2, '#f4f4f4');
    for (let x = nx; x < nx + nw; x += 3) px(g, x, Math.round(nm) - 1, 1, 2, '#9aa0a8');
    px(g, nx - 6, Math.round(nm) - 4, 3, 6, '#3d4654'); px(g, nx + nw + 3, Math.round(nm) - 4, 3, 6, '#3d4654');
    return c;
  }

  // 운동장 선 (트랙 레인 + 축구장)
  function makeFieldMarks(w, h, fx, fy, fw, fh) {
    const [c, g] = canvas(w * T, h * T);
    const W2 = 'rgba(255,255,255,0.85)', W1 = 'rgba(255,255,255,0.45)';
    const ring = (x, y, ww, hh, r, col) => { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.roundRect(x + 0.5, y + 0.5, ww - 1, hh - 1, r); g.stroke(); };
    for (let i = 0; i < 4; i++) ring(6 + i * 6, 6 + i * 6, w * T - 12 - i * 12, h * T - 12 - i * 12, h * T / 2 - 6 - i * 6, W1);
    const X = fx * T, Y = fy * T, FW = fw * T, FH = fh * T;
    g.strokeStyle = W2; g.lineWidth = 1;
    g.strokeRect(X + 0.5, Y + 0.5, FW - 1, FH - 1);
    g.beginPath(); g.moveTo(X + FW / 2 + 0.5, Y); g.lineTo(X + FW / 2 + 0.5, Y + FH); g.stroke();
    g.beginPath(); g.arc(X + FW / 2, Y + FH / 2, 22, 0, Math.PI * 2); g.stroke();
    for (const side of [0, 1]) {
      const bx = side ? X + FW - 50 : X, gx = side ? X + FW - 18 : X;
      g.strokeRect(bx + 0.5, Y + FH / 2 - 52, 50, 104);
      g.strokeRect(gx + 0.5, Y + FH / 2 - 24, 18, 48);
    }
    return c;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const gr = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((r << 16) | (gr << 8) | b).toString(16).padStart(6, '0');
  }

  // ---------- 캐릭터 ----------
  // pal: { skin, hair, shirt, pants, shoes, hat?, glasses?, coat?, long? }
  function makeChar(pal) {
    const dirs = ['down', 'up', 'left', 'right'];
    const frames = {};
    for (const d of dirs) {
      frames[d] = [0, 1].map(f => {
        const [c, g] = canvas(16, 16);
        paintChar(g, pal, d, f);
        return c;
      });
    }
    return frames;
  }

  function paintChar(g, p, dir, f) {
    const hair = p.hair, skin = p.skin;
    // 다리
    const l1 = f ? 1 : 0, l2 = f ? 0 : 1;
    if (dir === 'left' || dir === 'right') {
      px(g, 6, 12, 4, 2, p.pants);
      px(g, f ? 5 : 6, 14, 2, 1, p.pants); px(g, f ? 9 : 8, 14, 2, 1, p.pants);
      px(g, f ? 4 : 6, 15, 3, 1, p.shoes); px(g, f ? 9 : 8, 15, 3, 1, p.shoes);
    } else {
      px(g, 5, 12, 6, 1, p.pants);
      px(g, 5, 13, 2, 2 - l1, p.pants); px(g, 9, 13, 2, 2 - l2, p.pants);
      px(g, 5, 15 - l1, 2, 1, p.shoes); px(g, 9, 15 - l2, 2, 1, p.shoes);
    }
    // 몸
    const body = p.coat || p.shirt;
    px(g, 4, 8, 8, 4, body);
    px(g, 4, 11, 8, 1, shade(body, -25));
    if (p.coat) { px(g, 7, 8, 2, 4, p.shirt); }
    if (dir === 'down' && p.badge) px(g, 9, 9, 1, 1, p.badge);
    // 팔
    if (dir === 'left') { px(g, 6, 8 + (f ? 1 : 0), 2, 3, shade(body, -15)); px(g, 6, 11 + (f ? 1 : 0), 2, 1, skin); }
    else if (dir === 'right') { px(g, 8, 8 + (f ? 1 : 0), 2, 3, shade(body, -15)); px(g, 8, 11 + (f ? 1 : 0), 2, 1, skin); }
    else {
      px(g, 3, 8, 1, 3, shade(body, -15)); px(g, 12, 8, 1, 3, shade(body, -15));
      px(g, 3, 11, 1, 1, skin); px(g, 12, 11, 1, 1, skin);
    }
    // 머리
    px(g, 4, 1, 8, 7, skin);
    px(g, 4, 0, 8, 3, hair);
    px(g, 3, 1, 1, 5, hair); px(g, 12, 1, 1, 5, hair);
    if (p.long) { px(g, 3, 6, 1, 4, hair); px(g, 12, 6, 1, 4, hair); }
    if (dir === 'up') { px(g, 4, 1, 8, 6, hair); if (p.long) px(g, 4, 7, 8, 2, hair); }
    else if (dir === 'left') { px(g, 8, 1, 4, 5, hair); px(g, 5, 4, 1, 2, '#2b2233'); }
    else if (dir === 'right') { px(g, 4, 1, 4, 5, hair); px(g, 10, 4, 1, 2, '#2b2233'); }
    else {
      px(g, 4, 3, 8, 1, hair);
      px(g, 6, 4, 1, 2, '#2b2233'); px(g, 9, 4, 1, 2, '#2b2233');
      px(g, 7, 6, 2, 1, shade(skin, -40));
      if (p.glasses) { px(g, 5, 4, 3, 1, p.glasses); px(g, 8, 4, 3, 1, p.glasses); }
    }
    if (p.hat) { px(g, 3, 0, 10, 2, p.hat); if (dir === 'down') px(g, 3, 2, 10, 1, shade(p.hat, -30)); }
  }

  const PLAYER_PALETTES = [
    { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#e8533f', pants: '#2f4f7f', shoes: '#222' },
    { skin: '#f3c79b', hair: '#5a341d', shirt: '#3d9be9', pants: '#3a3a4a', shoes: '#222', long: true },
    { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#46b866', pants: '#594a3a', shoes: '#333' },
    { skin: '#eebd8f', hair: '#7a4a24', shirt: '#f2b632', pants: '#2f4f7f', shoes: '#222', long: true },
    { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#9b6ad6', pants: '#2d2d3a', shoes: '#333', hat: '#e8533f' },
    { skin: '#f3c79b', hair: '#1e1a22', shirt: '#ff8fb1', pants: '#4a6a9a', shoes: '#222', long: true },
    { skin: '#eebd8f', hair: '#3b2a1a', shirt: '#2fb3b3', pants: '#3a3a4a', shoes: '#222', hat: '#2f4f7f' },
    { skin: '#f6cfa5', hair: '#6b3c1c', shirt: '#ffffff', pants: '#e8533f', shoes: '#333' }
  ];

  const NPC_PALETTES = {
    guard: { skin: '#eebd8f', hair: '#3b2a1a', shirt: '#2c3e66', pants: '#22304f', shoes: '#111', hat: '#22304f', badge: '#ffd84a' },
    science: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#4caf50', coat: '#f4f4f4', pants: '#3a3a4a', shoes: '#333', glasses: '#333' },
    librarian: { skin: '#f6cfa5', hair: '#4a2a1a', shirt: '#9b6ad6', pants: '#3a3a4a', shoes: '#333', long: true, glasses: '#333' },
    broadcast: { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#ff7aa8', pants: '#3a3a4a', shoes: '#333', long: true },
    it: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#3d6fe9', pants: '#2d2d3a', shoes: '#333' },
    pe: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#e23b3b', pants: '#e23b3b', shoes: '#fff', hat: '#ffffff' },
    doctor: { skin: '#f6cfa5', hair: '#bdbdbd', shirt: '#4a6a9a', coat: '#ffffff', pants: '#3a3a4a', shoes: '#333', glasses: '#333' },
    nurse: { skin: '#f6cfa5', hair: '#3b2a1a', shirt: '#ff9fb4', coat: '#ffffff', pants: '#ffffff', shoes: '#ccc', long: true },
    cook: { skin: '#eebd8f', hair: '#3b2a1a', shirt: '#ffffff', pants: '#ffffff', shoes: '#ccc', hat: '#ffffff' },
    transfer: { skin: '#f6cfa5', hair: '#e0b040', shirt: '#ffd84a', pants: '#2f4f7f', shoes: '#222' },
    teacher1: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#7d8a99', pants: '#2d2d3a', shoes: '#222' },
    soccer: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#e23b3b', pants: '#ffffff', shoes: '#222', badge: '#ffffff' },
    jumper: { skin: '#f6cfa5', hair: '#5a341d', shirt: '#ff7aa8', pants: '#3a3a4a', shoes: '#fff', long: true },
    captain: { skin: '#f3c79b', hair: '#2b1d14', shirt: '#f2b632', pants: '#2f4f7f', shoes: '#222', hat: '#f2b632' },
    painterK: { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#9b6ad6', pants: '#3a3a4a', shoes: '#333', long: true },
    garden: { skin: '#eebd8f', hair: '#3b2a1a', shirt: '#46b866', coat: '#2f7d3b', pants: '#594a3a', shoes: '#333' },
    english: { skin: '#f6cfa5', hair: '#c98a3a', shirt: '#3db0e0', pants: '#2d2d3a', shoes: '#222', long: true },
    staff: { skin: '#eebd8f', hair: '#7a7a7a', shirt: '#9aa0a8', pants: '#2d2d3a', shoes: '#222', glasses: '#333' },
    youngest: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#ffd84a', pants: '#ff8fb1', shoes: '#fff', long: true, hat: '#ff8fb1' },
    guide: { skin: '#f3c79b', hair: '#1e1a22', shirt: '#ffffff', coat: '#3d6fe9', pants: '#2d2d3a', shoes: '#222' },
    sciKid: { skin: '#f6cfa5', hair: '#5a341d', shirt: '#46b866', coat: '#f4f4f4', pants: '#3a3a4a', shoes: '#333', glasses: '#333' },
    coder: { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#2d2d3a', pants: '#3a3a4a', shoes: '#222', long: true, glasses: '#3de0ff' },
    artist: { skin: '#eebd8f', hair: '#7a4a24', shirt: '#ff9b42', pants: '#3a3a4a', shoes: '#333', hat: '#e23b3b', long: true },
    cleaner: { skin: '#f3c79b', hair: '#1e1a22', shirt: '#3d9be9', coat: '#ffd84a', pants: '#2f4f7f', shoes: '#222' },
    bookworm: { skin: '#f6cfa5', hair: '#3b2a1a', shirt: '#c97b63', pants: '#594a3a', shoes: '#333', long: true, glasses: '#333' },
    musicT: { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#2d2d3a', coat: '#7c6bb3', pants: '#2d2d3a', shoes: '#222', long: true },
    leader: { skin: '#eebd8f', hair: '#2b1d14', shirt: '#ffffff', pants: '#2f4f7f', shoes: '#222', badge: '#e23b3b' },
    president: { skin: '#f3c79b', hair: '#1e1a22', shirt: '#2c3e66', coat: '#2c3e66', pants: '#2d2d3a', shoes: '#111', badge: '#ffd84a' },
    explorer: { skin: '#eebd8f', hair: '#5a341d', shirt: '#b5894f', pants: '#594a3a', shoes: '#3a2a1a', hat: '#d9b86a' },
    buddy: { skin: '#f6cfa5', hair: '#7a4a24', shirt: '#ff8fb1', pants: '#4a6a9a', shoes: '#222', long: true },
    teacher2: { skin: '#f3c79b', hair: '#5a341d', shirt: '#c97b63', pants: '#3a3a4a', shoes: '#222', long: true },
    // 부장·교감·수석 선생님
    vpM: { skin: '#eebd8f', hair: '#5b5b5b', shirt: '#ffffff', coat: '#2c3e66', pants: '#2c3e66', shoes: '#111', glasses: '#333' },
    vpF: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#ffffff', coat: '#8a2f45', pants: '#3a3a4a', shoes: '#222', long: true },
    chiefT: { skin: '#f6cfa5', hair: '#3b2a1a', shirt: '#f4efe2', coat: '#2f7d5a', pants: '#3a3a4a', shoes: '#222', long: true, glasses: '#333' },
    affairs: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#dfe9ff', coat: '#3d5a99', pants: '#2d2d3a', shoes: '#222' },
    research: { skin: '#f3c79b', hair: '#2b1d14', shirt: '#ffffff', coat: '#8a6a4a', pants: '#3a3a4a', shoes: '#333', glasses: '#333' },
    basics: { skin: '#f6cfa5', hair: '#4a2a1a', shirt: '#ff9b42', pants: '#2f4f7f', shoes: '#222', long: true },
    welfare: { skin: '#f6cfa5', hair: '#7a4a24', shirt: '#ffffff', coat: '#ff8fb1', pants: '#3a3a4a', shoes: '#222', long: true },
    life: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#2c8a5a', pants: '#2d2d3a', shoes: '#222', badge: '#ffd84a' },
    peHead: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#2a5bd7', pants: '#2a5bd7', shoes: '#fff', hat: '#2a5bd7' },
    coderT: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#3de0a0', coat: '#2c3e66', pants: '#2d2d3a', shoes: '#222', glasses: '#333' },   // 디지털 새싹 선생님
    // 담임 선생님 (반마다 조금씩 다르게)
    hr0: { skin: '#f6cfa5', hair: '#2b1d14', shirt: '#7d8a99', pants: '#2d2d3a', shoes: '#222' },
    hr1: { skin: '#f3c79b', hair: '#5a341d', shirt: '#c97b63', pants: '#3a3a4a', shoes: '#222', long: true },
    hr2: { skin: '#eebd8f', hair: '#1e1a22', shirt: '#4a8f6a', pants: '#2d2d3a', shoes: '#222', glasses: '#333' },
    hr3: { skin: '#f6cfa5', hair: '#3b2a1a', shirt: '#e8d9a8', pants: '#594a3a', shoes: '#333', long: true, glasses: '#333' },
    hr4: { skin: '#f3c79b', hair: '#2b1d14', shirt: '#6a7fd6', pants: '#2d2d3a', shoes: '#222' },
    hr5: { skin: '#f6cfa5', hair: '#7a4a24', shirt: '#d66a8a', pants: '#3a3a4a', shoes: '#222', long: true },
    hr6: { skin: '#eebd8f', hair: '#4a4a4a', shirt: '#f4f4f4', coat: '#5a6b7a', pants: '#2d2d3a', shoes: '#111' },
    hr7: { skin: '#f6cfa5', hair: '#1e1a22', shirt: '#9b6ad6', pants: '#2d2d3a', shoes: '#222', long: true }
  };

  function randomStudentPalette(rand) {
    const skins = ['#f6cfa5', '#f3c79b', '#eebd8f'];
    const hairs = ['#1e1a22', '#2b1d14', '#5a341d', '#7a4a24'];
    const shirts = ['#e8533f', '#3d9be9', '#46b866', '#f2b632', '#9b6ad6', '#ff8fb1', '#2fb3b3', '#ffffff', '#f08a3c'];
    const pants = ['#2f4f7f', '#3a3a4a', '#594a3a', '#4a6a9a'];
    const pick = a => a[Math.floor(rand() * a.length)];
    return { skin: pick(skins), hair: pick(hairs), shirt: pick(shirts), pants: pick(pants), shoes: '#222', long: rand() < 0.45 };
  }

  // ---------- 로봇 교장 ----------
  function makeRobot(broken) {
    const [c, g] = canvas(16, 16);
    px(g, 7, 0, 2, 2, broken ? '#888' : '#ff4d4d');
    px(g, 7.5, 2, 1, 1, '#777');
    px(g, 3, 3, 10, 6, '#aab4c0'); px(g, 3, 3, 10, 1, '#d0d8e2'); px(g, 3, 8, 10, 1, '#7d8794');
    if (broken) {
      px(g, 5, 5, 1, 1, '#333'); px(g, 6, 6, 1, 1, '#333'); px(g, 6, 5, 1, 1, '#333'); px(g, 5, 6, 1, 1, '#333');
      px(g, 9, 5, 1, 1, '#333'); px(g, 10, 6, 1, 1, '#333'); px(g, 10, 5, 1, 1, '#333'); px(g, 9, 6, 1, 1, '#333');
    } else {
      px(g, 5, 5, 2, 2, '#3de0ff'); px(g, 9, 5, 2, 2, '#3de0ff');
    }
    px(g, 4, 9, 8, 5, '#8a96a4'); px(g, 6, 10, 4, 2, broken ? '#555' : '#ffd84a');
    px(g, 2, 9, 2, 4, '#7d8794'); px(g, 12, 9, 2, 4, '#7d8794');
    px(g, 5, 14, 2, 2, '#555'); px(g, 9, 14, 2, 2, '#555');
    return c;
  }

  // ---------- 사물 ----------
  let objSeed = 0;
  function makeObj(kind) {
    let c, g;
    switch (kind) {
      case 'shelf':
      case 'redshelf': {
        [c, g] = canvas(16, 16);
        px(g, 0, 0, 16, 16, '#6b4428'); px(g, 1, 1, 14, 14, '#8a5a36');
        const colors = kind === 'redshelf' ? ['#d92b2b', '#3d6fe9', '#d92b2b', '#46b866', '#d92b2b'] : ['#3d6fe9', '#46b866', '#f2b632', '#9b6ad6', '#e8533f'];
        for (let r = 0; r < 3; r++) {
          px(g, 1, 5 + r * 5, 14, 1, '#5a3820');
          for (let i = 0; i < 5; i++) px(g, 2 + i * 3, 1 + r * 5, 2, 4, colors[(i + r) % 5]);
        }
        break;
      }
      case 'desk':
        [c, g] = canvas(16, 16);
        px(g, 1, 4, 14, 7, '#c8925a'); px(g, 1, 4, 14, 1, '#e0ac72'); px(g, 1, 10, 14, 1, '#8a5a36');
        px(g, 2, 11, 2, 4, '#6b4428'); px(g, 12, 11, 2, 4, '#6b4428');
        break;
      case 'board':
        [c, g] = canvas(48, 16);
        px(g, 0, 2, 48, 11, '#6b4428'); px(g, 2, 3, 44, 9, '#2f5d3a');
        px(g, 6, 5, 12, 1, '#e8e8e8'); px(g, 6, 8, 20, 1, '#e8e8e8'); px(g, 30, 6, 8, 1, '#e8e8e8');
        break;
      case 'computer':
        [c, g] = canvas(16, 16);
        px(g, 1, 6, 14, 6, '#c8925a'); px(g, 1, 11, 14, 1, '#8a5a36');
        px(g, 4, 0, 8, 6, '#333'); px(g, 5, 1, 6, 4, '#5ad6ff'); px(g, 7, 5, 2, 1, '#555');
        px(g, 4, 7, 8, 2, '#dcdcdc');
        break;
      case 'lab':
        [c, g] = canvas(16, 16);
        px(g, 0, 5, 16, 7, '#e8e8e8'); px(g, 0, 11, 16, 1, '#a0a0a0');
        px(g, 3, 1, 2, 4, '#9fe2c0'); px(g, 3, 1, 2, 1, '#ddd'); px(g, 9, 2, 3, 3, '#ff9fb4'); px(g, 10, 1, 1, 1, '#ddd');
        break;
      case 'bed':
        [c, g] = canvas(16, 16);
        px(g, 1, 1, 14, 14, '#ffffff'); px(g, 1, 1, 14, 4, '#b7d6e4'); px(g, 1, 14, 14, 1, '#aaa');
        break;
      case 'mic':
        [c, g] = canvas(16, 16);
        px(g, 1, 6, 14, 6, '#555'); px(g, 3, 7, 3, 2, '#ff4d4d'); px(g, 8, 7, 5, 1, '#aaa'); px(g, 8, 9, 5, 1, '#aaa');
        px(g, 7, 0, 2, 6, '#888'); px(g, 6, 0, 4, 2, '#333');
        break;
      case 'table':
        [c, g] = canvas(32, 16);
        px(g, 0, 4, 32, 8, '#e8e8e8'); px(g, 0, 11, 32, 1, '#a0a0a0'); px(g, 2, 12, 2, 4, '#888'); px(g, 28, 12, 2, 4, '#888');
        break;
      case 'counter':
        [c, g] = canvas(48, 16);
        px(g, 0, 3, 48, 10, '#c0c6cc'); px(g, 0, 3, 48, 2, '#e3e7ea'); px(g, 0, 12, 48, 1, '#8a9096');
        px(g, 6, 0, 8, 4, '#ff9b42'); px(g, 20, 0, 8, 4, '#ffe08a'); px(g, 34, 0, 8, 4, '#9fe27a');
        break;
      case 'plant':
        [c, g] = canvas(16, 16);
        px(g, 5, 10, 6, 6, '#b35d3a'); px(g, 3, 2, 10, 9, '#3d8a30'); px(g, 5, 0, 6, 4, '#4ea83d');
        break;
      case 'bandage':
        [c, g] = canvas(16, 16);
        px(g, 3, 6, 10, 4, '#f3c79b'); px(g, 6, 6, 4, 4, '#fff1e0'); px(g, 3, 6, 10, 1, '#e0a97b');
        break;
      case 'goal':
        [c, g] = canvas(16, 32);
        px(g, 2, 0, 2, 32, '#f4f4f4'); px(g, 2, 0, 12, 2, '#f4f4f4'); px(g, 2, 30, 12, 2, '#f4f4f4');
        for (let i = 4; i < 30; i += 3) px(g, 5, i, 9, 1, 'rgba(255,255,255,0.5)');
        for (let i = 6; i < 14; i += 3) px(g, i, 2, 1, 28, 'rgba(255,255,255,0.5)');
        break;
      case 'bars':
        [c, g] = canvas(32, 16);
        px(g, 2, 2, 2, 14, '#7a7f87'); px(g, 15, 4, 2, 12, '#7a7f87'); px(g, 28, 6, 2, 10, '#7a7f87');
        px(g, 2, 2, 15, 2, '#c0c6cc'); px(g, 15, 6, 15, 2, '#c0c6cc');
        break;
      case 'slide':
        [c, g] = canvas(32, 32);
        px(g, 2, 2, 10, 26, '#3d6fe9'); for (let i = 4; i < 28; i += 4) px(g, 3, i, 8, 1, '#c0c6cc');
        for (let i = 0; i < 20; i++) px(g, 12 + i, 4 + i, 3, 4, '#ffd84a');
        px(g, 2, 0, 10, 3, '#e8533f');
        break;
      case 'flag':
        [c, g] = canvas(16, 32);
        px(g, 7, 2, 2, 28, '#c0c6cc'); px(g, 5, 29, 6, 3, '#7a7f87');
        px(g, 9, 3, 7, 5, '#ffffff'); px(g, 11, 4, 3, 3, '#e23b3b'); px(g, 12, 5, 2, 2, '#3d6fe9');
        break;
      case 'bench':
        [c, g] = canvas(32, 16);
        px(g, 0, 5, 32, 3, '#a0683a'); px(g, 0, 9, 32, 3, '#a0683a'); px(g, 2, 12, 2, 4, '#555'); px(g, 28, 12, 2, 4, '#555');
        break;
      case 'piano':
        [c, g] = canvas(32, 16);
        px(g, 0, 0, 32, 12, '#222'); px(g, 1, 8, 30, 4, '#fff');
        for (let i = 3; i < 31; i += 4) px(g, i, 8, 2, 2, '#222');
        break;
      case 'lockdoor':      // 잠긴 문 (2칸 너비)
        [c, g] = canvas(32, 16);
        px(g, 0, 0, 32, 16, '#5b3b24'); px(g, 1, 1, 14, 15, '#a0683a'); px(g, 17, 1, 14, 15, '#a0683a');
        px(g, 3, 3, 10, 5, '#b8794a'); px(g, 19, 3, 10, 5, '#b8794a'); px(g, 15, 0, 2, 16, '#3d2817');
        px(g, 12, 8, 8, 7, '#ffd84a'); px(g, 13, 5, 6, 4, '#ffd84a'); px(g, 14, 6, 4, 3, '#5b3b24'); px(g, 15, 10, 2, 3, '#5b3b24');
        break;
      case 'sign':          // i 정보 팻말
        [c, g] = canvas(16, 16);
        px(g, 7, 9, 2, 7, '#7a5a3a'); px(g, 1, 1, 14, 9, '#2b2233'); px(g, 2, 2, 12, 7, '#3c8de0');
        px(g, 7, 3, 2, 1, '#fff'); px(g, 7, 5, 2, 3, '#fff');
        break;
      case 'star':          // 수집품: 개나리 꽃 (교화)
        [c, g] = canvas(16, 16);
        px(g, 3, 12, 10, 1, '#7a5a2a'); px(g, 5, 11, 1, 1, '#7a5a2a'); px(g, 10, 11, 1, 1, '#7a5a2a'); px(g, 4, 13, 1, 1, '#5a8a2a'); px(g, 11, 13, 2, 1, '#5a8a2a');
        for (const [x, y] of [[5, 8], [10, 7], [7, 4]]) {
          px(g, x, y - 2, 2, 2, '#ffd23a'); px(g, x, y + 2, 2, 2, '#ffd23a'); px(g, x - 2, y, 2, 2, '#ffd23a'); px(g, x + 2, y, 2, 2, '#ffd23a');
          px(g, x, y, 2, 2, '#f5a300'); px(g, x, y - 2, 1, 1, '#fff2a8');
        }
        break;
      case 'zelkova': {     // 교목: 느티나무 (3칸 x 3칸)
        [c, g] = canvas(48, 48);
        const blob = (cx, cy, r, col) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(g, cx + x, cy + y, 1, 1, col); };
        px(g, 21, 30, 6, 16, '#6b4a2b'); px(g, 22, 30, 2, 16, '#86603a'); px(g, 19, 44, 10, 2, '#5a3d22');
        px(g, 17, 30, 4, 2, '#6b4a2b'); px(g, 27, 29, 4, 2, '#6b4a2b');
        [[24, 18, 15, '#2f6b2f'], [12, 22, 9, '#2f6b2f'], [36, 22, 9, '#2f6b2f'], [24, 10, 9, '#2f6b2f']].forEach(b => blob(...b));
        [[22, 16, 11, '#3f8a3a'], [13, 20, 6, '#3f8a3a'], [34, 19, 7, '#3f8a3a'], [23, 9, 7, '#3f8a3a']].forEach(b => blob(...b));
        [[19, 12, 5, '#5aa84a'], [30, 14, 4, '#5aa84a'], [11, 18, 3, '#5aa84a'], [24, 6, 3, '#5aa84a']].forEach(b => blob(...b));
        for (const [x, y] of [[17, 10], [28, 12], [10, 17], [22, 5], [33, 17], [15, 22], [26, 20]]) px(g, x, y, 2, 1, '#8cd06a');
        for (const [x, y] of [[20, 28], [30, 27], [9, 27], [38, 27]]) px(g, x, y, 3, 1, '#245624');
        break;
      }
      case 'note':          // 노란 쪽지
        [c, g] = canvas(16, 16);
        px(g, 4, 6, 9, 7, '#ffe066'); px(g, 4, 12, 9, 1, '#d9b400'); px(g, 5, 8, 6, 1, '#8a7a2a'); px(g, 5, 10, 4, 1, '#8a7a2a');
        break;
      case 'terminal':      // 창고 단말기
        [c, g] = canvas(16, 32);
        px(g, 2, 4, 12, 26, '#4a5160'); px(g, 3, 5, 10, 8, '#1b2a3a'); px(g, 4, 6, 8, 6, '#2b4d6a');
        px(g, 4, 16, 8, 2, '#7a8496'); px(g, 4, 20, 3, 2, '#e8533f'); px(g, 9, 20, 3, 2, '#46b866'); px(g, 2, 29, 12, 1, '#2b2f38');
        break;
      case 'box':           // 창고 상자
        [c, g] = canvas(16, 16);
        px(g, 1, 3, 14, 12, '#b88a52'); px(g, 1, 3, 14, 2, '#d1a46a'); px(g, 7, 3, 2, 12, '#8a6236'); px(g, 1, 14, 14, 1, '#7a5428');
        break;
      case 'hopscotch': {   // 바닥 놀이 (사방치기)
        [c, g] = canvas(32, 48);
        const L = (x, y, w2, h2) => { g.strokeStyle = 'rgba(255,240,120,0.95)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w2, h2); };
        L(10, 38, 11, 9); L(10, 29, 11, 9); L(4, 20, 11, 9); L(16, 20, 11, 9); L(10, 11, 11, 9); L(4, 2, 11, 9); L(16, 2, 11, 9);
        px(g, 14, 41, 3, 3, '#ff8a2a'); px(g, 8, 5, 3, 3, '#3d6fe9'); px(g, 20, 23, 3, 3, '#46b866');
        break;
      }
      case 'sandpit':       // 멀리뛰기 모래판 + 구름판
        [c, g] = canvas(32, 80);
        px(g, 0, 0, 32, 64, '#8a6236'); px(g, 2, 2, 28, 60, '#e6d2a3');
        for (let i = 0; i < 14; i++) px(g, 3 + (i * 7) % 26, 4 + (i * 11) % 56, 2, 1, '#cdb683');
        px(g, 6, 70, 20, 4, '#f4f4f4'); px(g, 6, 70, 20, 1, '#c0c6cc');
        break;
      case 'swing':         // 그네
        [c, g] = canvas(48, 32);
        px(g, 2, 2, 44, 3, '#c0c6cc'); px(g, 2, 2, 2, 30, '#9aa0a8'); px(g, 23, 2, 2, 30, '#9aa0a8'); px(g, 44, 2, 2, 30, '#9aa0a8');
        for (const [sx, col] of [[8, '#2f9e44'], [15, '#e23b3b'], [30, '#2f9e44'], [37, '#e23b3b']]) { px(g, sx, 5, 1, 17, '#7a7f87'); px(g, sx + 3, 5, 1, 17, '#7a7f87'); px(g, sx - 1, 22, 6, 3, col); }
        break;
      case 'seesaw':        // 시소
        [c, g] = canvas(32, 16);
        px(g, 14, 9, 4, 6, '#9aa0a8'); px(g, 1, 7, 30, 3, '#c0c6cc');
        px(g, 2, 4, 5, 4, '#ffd23a'); px(g, 25, 4, 5, 4, '#e23b3b'); px(g, 3, 3, 1, 2, '#7a7f87'); px(g, 28, 3, 1, 2, '#7a7f87');
        break;
      case 'gazebo': {      // 안뜰 정자 (주황 지붕)
        [c, g] = canvas(48, 48);
        px(g, 6, 30, 3, 16, '#5a3a22'); px(g, 39, 30, 3, 16, '#5a3a22');
        px(g, 10, 36, 28, 4, '#8a5a36'); px(g, 10, 40, 4, 4, '#c9c4b8'); px(g, 34, 40, 4, 4, '#c9c4b8');
        for (let i = 0; i < 16; i++) px(g, 2 + i, 18 - i, 44 - i * 2, 1, i % 3 === 0 ? '#a7442c' : '#c4573a');
        px(g, 0, 18, 48, 6, '#c4573a'); px(g, 0, 23, 48, 3, '#e9dcc4'); px(g, 22, 0, 4, 4, '#3a2a20');
        break;
      }
      case 'hoop':          // 농구 골대
        [c, g] = canvas(16, 32);
        px(g, 6, 10, 3, 22, '#3d6fe9'); px(g, 4, 28, 8, 4, '#2b4fb0');
        px(g, 1, 0, 14, 10, '#f4f4f4'); px(g, 1, 0, 14, 1, '#c0c6cc'); px(g, 5, 3, 6, 4, '#e8533f'); px(g, 6, 4, 4, 2, '#f4f4f4');
        px(g, 4, 9, 8, 2, '#ff8a2a');
        break;
      case 'tap':           // 수돗가 (파랑·흰 줄무늬 지붕)
        [c, g] = canvas(48, 32);
        for (let i = 0; i < 6; i++) px(g, i * 8, 0, 8, 9, i % 2 ? '#f4f4f4' : '#3d6fe9');
        px(g, 0, 9, 48, 1, '#7a7f87'); px(g, 3, 10, 2, 22, '#9aa0a8'); px(g, 43, 10, 2, 22, '#9aa0a8');
        px(g, 6, 20, 36, 8, '#b8bec6'); px(g, 6, 20, 36, 2, '#dfe3e8');
        for (let i = 0; i < 6; i++) px(g, 9 + i * 6, 17, 2, 3, '#7a7f87');
        break;
      case 'emblem': {      // 교표 안내판 (기둥 위 둥근 판)
        [c, g] = canvas(32, 40);
        px(g, 14, 28, 4, 12, '#7a7f87'); px(g, 8, 38, 16, 2, '#5a5f66');
        px(g, 1, 1, 30, 30, '#e8e4da'); px(g, 2, 2, 28, 28, '#ffffff'); px(g, 1, 30, 30, 1, '#a8a397');
        onEmblem(() => { g.imageSmoothingEnabled = true; g.drawImage(EMBLEM, 4, 3, 24, 26); });
        break;
      }
      case 'emblemwall': {  // 건물 벽에 붙은 교표
        [c, g] = canvas(24, 26);
        onEmblem(() => { g.imageSmoothingEnabled = true; g.drawImage(EMBLEM, 0, 0, 24, 26); });
        break;
      }
      case 'mottorock':     // 교훈석
        [c, g] = canvas(32, 32);
        px(g, 3, 6, 26, 24, '#d9cbb3'); px(g, 5, 3, 20, 4, '#d9cbb3'); px(g, 2, 28, 28, 3, '#b7a88f');
        px(g, 3, 6, 2, 22, '#c4b59b'); px(g, 25, 4, 4, 2, '#cbbda4');
        px(g, 12, 8, 8, 2, '#3a3028'); for (let r = 0; r < 3; r++) px(g, 8, 13 + r * 5, 16 - r * 2, 2, '#3a3028');
        break;
      case 'podium':        // 조례대
        [c, g] = canvas(48, 32);
        px(g, 2, 8, 44, 22, '#c9c4b8'); px(g, 2, 8, 44, 3, '#e8e4da'); px(g, 2, 28, 44, 2, '#8a867c');
        px(g, 8, 14, 32, 2, '#a8a397'); px(g, 18, 0, 12, 9, '#7a7f87'); px(g, 20, 2, 8, 2, '#e23b3b');
        break;
      case 'car': {         // 주차된 차 (색은 무작위)
        [c, g] = canvas(32, 16);
        const col = ['#f4f4f4', '#2b2b33', '#9aa0a8', '#c4463a', '#3d6fe9'][objSeed++ % 5];
        px(g, 2, 4, 28, 10, col); px(g, 7, 2, 16, 4, col); px(g, 8, 3, 14, 2, '#6fa8d8');
        px(g, 4, 13, 5, 3, '#222'); px(g, 23, 13, 5, 3, '#222'); px(g, 2, 7, 28, 1, 'rgba(0,0,0,0.15)');
        break;
      }
      case 'rock':          // 암석원 바위 표본 + 설명판
        [c, g] = canvas(16, 16);
        px(g, 3, 2, 10, 8, '#6f6a66'); px(g, 4, 1, 6, 2, '#837d78'); px(g, 3, 9, 10, 1, '#55514e');
        px(g, 4, 11, 8, 4, '#3d6fe9'); px(g, 5, 12, 6, 2, '#ffd23a');
        break;
      case 'spiral': {      // 바닥 달팽이 놀이 그림
        [c, g] = canvas(48, 48);
        for (let a = 0; a < Math.PI * 6; a += 0.03) { const r = 3 + a * 3.4; px(g, Math.round(24 + Math.cos(a) * r), Math.round(24 + Math.sin(a) * r * 0.8), 2, 2, 'rgba(255,255,255,0.85)'); }
        px(g, 23, 23, 3, 3, '#e23b3b');
        break;
      }
      case 'maze': {        // 바닥 미로 그림
        [c, g] = canvas(64, 32);
        const L = (x1, y1, w1, h1) => px(g, x1, y1, w1, h1, 'rgba(255,255,255,0.9)');
        L(0, 0, 64, 2); L(0, 30, 64, 2); L(0, 0, 2, 22); L(62, 8, 2, 24);
        L(8, 8, 20, 2); L(8, 8, 2, 16); L(18, 16, 2, 16); L(28, 8, 2, 14); L(36, 0, 2, 22); L(36, 22, 18, 2); L(46, 8, 2, 14); L(54, 8, 8, 2);
        break;
      }
      case 'gatepost':      // 정문 돌기둥
        [c, g] = canvas(16, 32);
        px(g, 1, 6, 14, 26, '#b9b5ad'); px(g, 0, 4, 16, 4, '#d6d2c8'); for (let i = 10; i < 32; i += 5) px(g, 1, i, 14, 1, '#9a968e');
        px(g, 5, 18, 6, 12, '#7a7f87'); px(g, 6, 19, 4, 10, '#c0c6cc');
        break;
      case 'wchut':         // 노란 화장실 건물
        [c, g] = canvas(48, 32);
        px(g, 0, 0, 48, 6, '#3a4f8a'); px(g, 2, 6, 44, 26, '#ffd23a'); px(g, 2, 30, 44, 2, '#c9a21e');
        for (let i = 0; i < 3; i++) px(g, 6 + i * 14, 12, 9, 18, '#f4f4f4');
        px(g, 16, 1, 16, 4, '#f4f4f4');
        break;
      case 'mirror':        // 1층 로비 큰 나무틀 거울
        [c, g] = canvas(16, 32);
        px(g, 0, 0, 16, 30, '#6b3f22'); px(g, 2, 2, 12, 24, '#cfe6f2'); px(g, 3, 3, 4, 8, '#eef7fb'); px(g, 1, 28, 14, 4, '#5a3420');
        break;
      case 'pillar':        // 그림이 그려진 둥근 기둥
        [c, g] = canvas(16, 32);
        px(g, 1, 0, 14, 22, '#8fd0f0'); px(g, 1, 14, 14, 8, '#9be07a'); px(g, 1, 22, 14, 10, '#9a9690');
        px(g, 4, 3, 4, 5, '#e8533f'); px(g, 5, 8, 2, 2, '#7a4e2c'); px(g, 9, 10, 4, 4, '#3d8a30'); px(g, 10, 14, 2, 3, '#7a4e2c');
        break;
      case 'stage':         // 강당 무대
        [c, g] = canvas(96, 32);
        px(g, 0, 8, 96, 22, '#a0683a'); px(g, 0, 8, 96, 2, '#c8925a'); px(g, 0, 28, 96, 2, '#6b4428');
        px(g, 0, 0, 10, 30, '#b8282c'); px(g, 86, 0, 10, 30, '#b8282c'); px(g, 0, 0, 96, 4, '#9a1e22');
        break;
      case 'pot':           // 길가 화분
        [c, g] = canvas(16, 16);
        px(g, 2, 8, 12, 6, '#3a3a3a'); px(g, 3, 13, 10, 2, '#2a2a2a'); px(g, 4, 3, 8, 6, '#4f9a3d'); px(g, 6, 1, 4, 3, '#63b04c');
        break;
      case 'pine':          // 소나무
        [c, g] = canvas(32, 48);
        px(g, 14, 30, 4, 18, '#7a4e2c');
        for (let i = 0; i < 4; i++) { const w2 = 12 + i * 5; px(g, 16 - w2 / 2, 4 + i * 7, w2, 9, i % 2 ? '#2d6b37' : '#357a40'); }
        px(g, 10, 12, 4, 2, '#4f9a5a'); px(g, 18, 22, 4, 2, '#4f9a5a');
        break;
      case 'mapletree':     // 단풍나무 (가을)
        [c, g] = canvas(32, 32);
        px(g, 14, 20, 4, 12, '#5a3a22');
        px(g, 4, 4, 24, 16, '#d8452f'); px(g, 2, 8, 28, 9, '#d8452f'); px(g, 8, 1, 16, 5, '#e8603d');
        px(g, 7, 6, 6, 3, '#f08a4a'); px(g, 18, 10, 6, 3, '#f08a4a'); px(g, 5, 15, 22, 3, '#b8362a');
        break;
      case 'backdoor':      // 건물 북쪽 출입문 (옥상 끝에 그림)
        [c, g] = canvas(32, 16);
        px(g, 0, 0, 32, 16, '#4a5160'); px(g, 2, 2, 13, 14, '#8fc3e6'); px(g, 17, 2, 13, 14, '#8fc3e6'); px(g, 15, 1, 2, 15, '#c0c6cc');
        break;
      case 'bridgepost':    // 연결통로 기둥
        [c, g] = canvas(16, 32);
        px(g, 4, 0, 8, 32, '#7d828b'); px(g, 4, 0, 2, 32, '#9aa0a8'); px(g, 3, 29, 10, 3, '#5f636a');
        break;
      default:
        [c, g] = canvas(16, 16);
        px(g, 2, 2, 12, 12, '#f0f');
    }
    return c;
  }

  return { T, TILE, SOLID, drawTile, drawBuilding, makeFieldMarks, makeCourtMarks, makeTireBorder, makeCarTop, makeChar, makeRobot, makeObj, PLAYER_PALETTES, NPC_PALETTES, randomStudentPalette, shade, EMBLEM, onEmblem };
})();
