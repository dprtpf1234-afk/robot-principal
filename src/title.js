// 첫 화면: 운동장에서 바라본 대교초 본관 (학교 사진을 보고 그린 픽셀아트, 구름·색종이·깃발이 움직인다)
// 빨간 벽돌·크림색 띠 본관, 왼쪽 강당과 둥근 현관 건물, 하늘색 유리 차양의 중앙현관, 스탠드와 트랙
const Title = (() => {
  const H = 180;               // 내부 해상도 높이
  let canvas, g, buf, bg;
  let W = 320, s = 1, dpr = 1;
  let R = 2;                   // 내부 해상도 배율: 장면 좌표 1칸을 R개의 작은 픽셀로 그린다
  let q = 0.5;                 // 가장 작은 픽셀 크기 (= 1 / R)
  let running = false, t = 0, last = 0;
  let clouds = [], confetti = [], chars = null, robot = null;
  let layout = null;
  let offY = 0;

  const COLORS = ['#ff5a6e', '#ffd84a', '#4ec27a', '#4a8cff', '#b06cff', '#ff9b42', '#ffffff'];

  const snap = v => Math.round(v * R) / R;
  function px(x, y, w, h, c) { bg.fillStyle = c; bg.fillRect(snap(x), snap(y), Math.max(q, snap(w)), Math.max(q, snap(h))); }

  function init(el) {
    canvas = el;
    g = canvas.getContext('2d');
    buf = document.createElement('canvas');
    bg = buf.getContext('2d');
    const r = Util.rng(42);
    clouds = Array.from({ length: 6 }, (_, i) => ({ x: r() * 400, y: 8 + r() * 46, w: 26 + r() * 30, sp: 2 + r() * 3 }));
    confetti = Array.from({ length: 70 }, () => newConfetti(r, true));
    const pals = Sprites.PLAYER_PALETTES;
    // 캐릭터·로봇은 한 번 더 다듬어(Scale2x) 크게 그려도 계단이 보이지 않게 한다
    const seen = new Map();
    const up = c => { if (!seen.has(c)) seen.set(c, (typeof Game !== 'undefined' && Game.smooth2x && Game.smooth2x(c)) || c); return seen.get(c); };
    const upChar = f => { const o = {}; for (const k in f) o[k] = Array.isArray(f[k]) ? f[k].map(up) : f[k]; return o; };
    chars = [upChar(Sprites.makeChar(pals[5])), upChar(Sprites.makeChar(pals[0])), upChar(Sprites.makeChar(pals[2]))];
    robot = up(up(Sprites.makeRobot(false)));
    resize();
    window.addEventListener('resize', resize);
  }

  function newConfetti(r, anywhere) {
    return { x: r() * 600, y: anywhere ? r() * H : -5 - r() * 40, vy: 6 + r() * 10, ph: r() * 6, c: COLORS[Math.floor(r() * COLORS.length)] };
  }

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    // 기기 화소 그대로 그린다 (인게임처럼 매끈하게): 장면 1칸 = 기기 픽셀 R개, 확대 없음
    R = Math.max(1, canvas.height / H);
    q = 1 / R;
    s = 1;
    W = Math.max(200, Math.ceil(canvas.width / R));
    buf.width = Math.ceil(W * R); buf.height = Math.ceil(H * R);
    const BW = Math.min(W - 24, 330);
    const x0 = Math.round(W / 2 - BW / 2);
    layout = { BW, x0, x1: x0 + BW, top: 76, base: 138, ex: Math.round(x0 + BW * 0.55) };
  }

  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(loop); }
  function stop() { running = false; }

  function loop(ts) {
    if (!running) return;
    const dt = Math.max(0, Math.min(0.05, (ts - last) / 1000));
    last = ts; t += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    for (const c of clouds) { c.x += c.sp * dt; if (c.x > W + 40) c.x = -60; }
    for (const p of confetti) {
      p.y += p.vy * dt;
      p.x += Math.sin(t * 2 + p.ph) * 6 * dt;
      if (p.y > H + 4) Object.assign(p, newConfetti(Math.random, false));
    }
  }

  // ---------------- 그리기 ----------------
  function draw() {
    const L = layout;
    bg.setTransform(R, 0, 0, R, 0, 0);
    bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    // 하늘 (시간대에 따라 색이 바뀐다)
    const ph = DayNight.phase();
    const SKY = {
      day: ['#5aa6ec', '#66afef', '#73b8f1', '#82c1f3', '#92caf5', '#a3d3f7', '#b4dbf8'],
      dawn: ['#6f84cf', '#8c90d2', '#b39ccf', '#d9a8c4', '#f2b9ac', '#ffcf9e', '#ffe0b2'],
      sunset: ['#34478f', '#5d55a2', '#9a5b98', '#d86c78', '#f2925a', '#ffb457', '#ffcd75'],
      night: ['#0a1133', '#0e1840', '#13204d', '#18295a', '#1f3368', '#273e75', '#30497f']
    }[ph];
    // 매끈하게 이어지는 하늘
    const sg = bg.createLinearGradient(0, 0, 0, 150);
    SKY.forEach((c, i) => sg.addColorStop(Math.min(1, i * 20 / 150), c));
    bg.fillStyle = sg; bg.fillRect(0, 0, W, 150);
    if (ph === 'night') nightSky();
    for (const c of clouds) cloud(c.x % (W + 100), c.y, c.w, ph);

    hills();
    ground();
    building();
    trees();
    figures();
    tint(ph);
    for (const p of confetti) {
      bg.save(); bg.translate(p.x % W, p.y); bg.rotate(t * 3 + p.ph); bg.scale(1, Math.cos(t * 5 + p.ph));
      bg.fillStyle = p.c; bg.fillRect(-0.8, -0.45, 1.6, 0.9); bg.restore();
    }

    // 화면에 확대
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    const S = R;   // 장면 좌표 1칸 = 기기 픽셀 S개
    const offX = Math.floor((canvas.width - W * S) / 2);
    offY = canvas.height - H * S;
    g.fillStyle = SKY[0]; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(buf, offX, offY);
    labels(offX, S);
  }

  function cloud(x, y, w, ph) {
    const c = { day: '#ffffff', dawn: '#ffe6e0', sunset: '#ffd2b8', night: '#34416e' }[ph || 'day'];
    const sh = { day: '#d6e8f8', dawn: '#f2c9cf', sunset: '#e9a991', night: '#283563' }[ph || 'day'];
    const puffs = [[0.16, 9, 0.16], [0.36, 6, 0.24], [0.6, 5, 0.21], [0.8, 8.5, 0.15], [0.5, 10, 0.2]];
    const blob = (dy, col) => {
      bg.fillStyle = col; bg.beginPath();
      for (const [kx, ky, kr] of puffs) { bg.moveTo(x + kx * w + kr * w, y + ky + dy); bg.arc(x + kx * w, y + ky + dy, kr * w, 0, Math.PI * 2); }
      bg.moveTo(x + 4, y + 13 + dy); bg.ellipse(x + w / 2, y + 11 + dy, w / 2 - 1, 3, 0, 0, Math.PI * 2);
      bg.fill();
    };
    blob(1.6, sh); blob(0, c);
    const hl = bg.createRadialGradient(x + w * 0.4, y + 3, 0, x + w * 0.4, y + 3, w * 0.35);
    hl.addColorStop(0, 'rgba(255,255,255,0.7)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    bg.fillStyle = hl; bg.fillRect(x, y - 4, w, 14);
  }

  // 밤하늘: 별과 달
  function nightSky() {
    const r = Util.rng(99);
    for (let i = 0; i < 60; i++) {
      const x = r() * W, y = r() * 110, tw = Math.sin(t * 2 + i) > 0.6;
      px(x, y, tw ? 1 : 0.5, tw ? 1 : 0.5, tw ? '#ffffff' : '#c9d4ff');
    }
    // 초승달: 큰 원에서 오른쪽 위로 비낀 원을 빼고 남은 부분을 한 줄씩 칠한다 (배경 하늘이 그대로 보이게)
    const mx = Math.round(W * 0.12), my = 22, mr = 9, cx2 = mx + 4.5, cy2 = my - 3, cr2 = 8;
    const crescent = (r, ox, oy, col) => {
      for (let y = my - r; y <= my + r; y += q) {
        const dy = y + q / 2 - my;
        if (Math.abs(dy) > r) continue;
        const hw = Math.sqrt(r * r - dy * dy);
        let a = mx - hw, b = mx + hw;
        const dy2 = y + q / 2 - (cy2 + oy);
        if (Math.abs(dy2) < cr2) {
          const hw2 = Math.sqrt(cr2 * cr2 - dy2 * dy2);
          const c = cx2 + ox - hw2, d = cx2 + ox + hw2;
          if (c <= a && d >= b) continue;            // 이 줄은 모두 가려짐
          if (c > a && c < b) { px(a, y, c - a, q, col); if (d < b) px(d, y, b - d, q, col); continue; }
          if (d > a && d < b) { px(d, y, b - d, q, col); continue; }
        }
        px(a, y, b - a, q, col);
      }
    };
    crescent(mr + 3, 1, 1, 'rgba(255, 240, 180, 0.10)');   // 은은한 빛
    crescent(mr + 1.5, 0.5, 0.5, 'rgba(255, 240, 180, 0.16)');
    crescent(mr, 0, 0, '#fff3c4');
    px(mx - 6, my + 2, 1, 1, '#f0dc9a'); px(mx - 4, my - 5, 1, 0.5, '#f0dc9a');   // 달 표면 무늬
  }

  // 하늘 아래 풍경에 시간대 색을 입히고, 밤에는 창문에 불을 켠다
  function tint(ph) {
    if (ph === 'day') return;
    const top = 40;   // 하늘 띠 경계에 맞춰 건물·언덕 전체를 덮는다
    bg.save();
    if (ph === 'night') {
      bg.fillStyle = 'rgba(8, 12, 44, 0.55)';
      bg.fillRect(0, top, W, H - top);
    } else {
      bg.globalCompositeOperation = 'multiply';
      bg.fillStyle = ph === 'sunset' ? '#ffb48a' : '#ffd2c8';
      bg.fillRect(0, top, W, H - top);
    }
    bg.restore();
    if (ph === 'night' || ph === 'sunset') {
      (layout.windows || []).forEach((w, i) => {
        if (((i * 7919) % 10) < (ph === 'night' ? 3 : 6)) return;
        px(w.x - 1, w.y - 1, w.w + 2, w.h + 2, 'rgba(255,214,110,0.25)');
        px(w.x, w.y, w.w, w.h, '#ffd36b');
        px(w.x, w.y, 2, 2, '#fff1b8');
      });
      const L = layout;
      px(L.ex - 15, L.base - (L.base - L.top) / 4 + 4, 30, (L.base - L.top) / 4 - 4, 'rgba(255,214,110,0.55)');
    }
  }

  // 언덕은 움직이지 않으므로 한 번만 그려 둔다
  let hillCanvas = null, hillKey = '';
  function hills() {
    const key = W + '|' + R;
    if (hillKey !== key) {
      hillKey = key;
      hillCanvas = document.createElement('canvas'); hillCanvas.width = buf.width; hillCanvas.height = buf.height;
      const keep = bg; bg = hillCanvas.getContext('2d'); bg.setTransform(R, 0, 0, R, 0, 0);
      drawHills();
      bg = keep;
    }
    bg.save(); bg.setTransform(1, 0, 0, 1, 0, 0); bg.drawImage(hillCanvas, 0, 0); bg.restore();
  }
  function drawHills() {
    // 멀리 있는 산 (흐릿하게)
    bg.fillStyle = 'rgba(120,160,190,0.35)'; bg.beginPath(); bg.moveTo(0, 140);
    for (let x = 0; x <= W; x += 2) bg.lineTo(x, 132 - 30 - (18 + Math.sin(x / 23) * 5 + Math.sin(x / 7) * 1.5) + 4);
    bg.lineTo(W, 140); bg.closePath(); bg.fill();
    const r = Util.rng(7);
    for (const side of [0, 1]) {
      const X = x => side ? W - x : x, top = x => 140 - (34 + Math.sin(x / 16) * 6 + Math.max(0, 40 - x / 3));
      const gr = bg.createLinearGradient(0, 70, 0, 140); gr.addColorStop(0, '#62a655'); gr.addColorStop(1, '#3c7535');
      bg.fillStyle = gr; bg.beginPath(); bg.moveTo(X(0), 140);
      for (let x = 0; x <= W / 2 + 2; x += 1) bg.lineTo(X(x), top(x));
      bg.lineTo(X(W / 2 + 2), 140); bg.closePath(); bg.fill();
      // 언덕을 덮은 가을 숲 (둥근 나무 머리)
      const pts = [];
      for (let i = 0; i < W * 5; i++) { const x = r() * W / 2; pts.push([x, top(x) + 1.4 + Math.pow(r(), 0.8) * (140 - top(x) - 2), 1.3 + r() * 1.3]); }
      pts.sort((a, c) => a[1] - c[1]);
      for (const [x, y, rad] of pts) {
        const col = ['#c9552f', '#d99a3a', '#b5432b', '#5f9a4a', '#3f7a38', '#4f8f45', '#3a6e34', '#d8b440'][Math.floor(r() * 8)];
        const tg = bg.createRadialGradient(X(x) - rad * 0.4, y - rad * 0.4, 0, X(x), y, rad);
        tg.addColorStop(0, mix(col, '#ffffff', 0.2)); tg.addColorStop(1, mix(col, '#1a2a14', 0.3));
        bg.fillStyle = tg; bg.beginPath(); bg.arc(X(x), y, rad, 0, Math.PI * 2); bg.fill();
      }
      bg.fillStyle = 'rgba(255,255,255,0.18)'; bg.beginPath(); bg.moveTo(X(0), top(0));
      for (let x = 0; x <= W / 2; x += 1) bg.lineTo(X(x), top(x));
      for (let x = W / 2; x >= 0; x -= 1) bg.lineTo(X(x), top(x) + 0.8);
      bg.closePath(); bg.fill();
    }
  }

  // 운동장 쪽에서 본 앞마당: 벽돌 마당·난간 → 스탠드 → 트랙 → 인조잔디
  function ground() {
    const L = layout, b = L.base;
    px(0, b, W, 6, '#b9583f');
    for (let x = 0; x < W; x += 4) px(x + ((x / 4) % 2) * 2, b + 1, 2, 0.5, '#a64d36');
    for (let x = 1; x < W; x += 4) px(x, b + 3.5, 2, 0.5, '#a64d36');
    px(0, b, W, 0.5, '#d9826a');
    // 스테인리스 난간
    px(0, b + 3, W, 0.5, '#e8ecef'); px(0, b + 3.5, W, 0.5, '#9aa3ab');
    for (let x = 2; x < W; x += 5) px(x, b + 3, 0.5, 3, '#c9d0d6');
    // 스탠드 (파랑·흰 줄무늬 지붕) – 가운데 중앙현관 앞은 비어 있다
    const gap0 = L.ex - 20, gap1 = L.ex + 20;
    for (let x = 0; x < W; x += 2) {
      if (x + 2 > gap0 && x < gap1) continue;
      px(x, b + 6, 1, 6, '#3d6fe9'); px(x + 1, b + 6, 1, 6, '#f2f5f8');
    }
    px(0, b + 12, gap0, 1, '#7d8794'); px(gap1, b + 12, W - gap1, 1, '#7d8794');
    px(gap0, b + 6, gap1 - gap0, 7, '#c9c4b8'); for (let y = b + 7; y < b + 13; y += 1.5) px(gap0, y, gap1 - gap0, 0.5, '#a8a397');
    // 트랙과 인조잔디
    px(0, b + 13, W, 9, '#c4463a');
    for (let i = 1; i < 4; i++) px(0, b + 13 + i * 2.2, W, 0.5, 'rgba(255,255,255,0.55)');
    for (let y = b + 22; y < H; y += 3) px(0, y, W, 3, (Math.floor((y - b) / 3) % 2) ? '#3f9a46' : '#46a54d');
    px(0, b + 22, W, 0.5, '#f4f4f4');
    px(W / 2 - 0.25, b + 22, 0.5, H - b - 22, 'rgba(255,255,255,0.7)');
    const r = Util.rng(3);
    for (let i = 0; i < 160; i++) px(r() * W, b + 23 + r() * (H - b - 23), 0.5, 1, '#378a3e');
  }

  // 벽돌 벽 한 칸 (가로 줄눈 + 엇갈린 세로 줄눈)
  function brickWall(x, y, w, h, base) {
    px(x, y, w, h, base);
    for (let yy = 0; yy < h; yy += 1.5) {
      px(x, y + yy + 1, w, 0.5, '#9c4733');
      for (let xx = ((yy / 1.5) % 2) ? 0 : 1.5; xx < w; xx += 3) px(x + xx, y + yy, 0.5, 1, '#a34d38');
    }
  }
  // 흰 창틀 창문
  function windowAt(x, y, w, h) {
    px(x, y, w, h, '#f4f1e8');
    px(x + 0.5, y + 0.5, w - 1, h - 1, '#5d8fb0');
    px(x + 0.5, y + 0.5, w - 1, (h - 1) * 0.45, '#8fc3e6');
    px(x + 1, y + 1, 2, 1, '#d4ecfa');
    for (let k = 1; k < 3; k++) px(x + w * k / 3 - 0.25, y, 0.5, h, '#f4f1e8');
    px(x, y + h * 0.5, w, 0.5, '#f4f1e8');
    px(x - 0.5, y + h - 0.5, w + 1, 0.5, '#d9d2bf');
    // 창문 난간
    px(x, y + h * 0.72, w, 0.5, '#c9d0d6');
    layout.windows.push({ x: x + 0.5, y: y + 0.5, w: w - 1, h: h - 1 });
  }

  function building() {
    const L = layout, { x0, x1, top, base, BW, ex } = L;
    L.windows = [];
    const floors = 4, fh = (base - top) / floors;
    const BRICK = '#b5553c', CREAM = '#ecd59a';
    const gx1 = x0 + Math.round(BW * 0.2);          // 강당 오른쪽 끝
    const cx0 = gx1, cx1 = x0 + Math.round(BW * 0.38); // 둥근 현관 건물
    // 그림자
    px(x0 + 3, top + 3, BW, base - top, 'rgba(0,0,0,0.12)');
    // ── 본관 (빨간 벽돌 4층, 크림색 띠, 옥상 회색 띠)
    const mx0 = cx0 - 4;
    brickWall(mx0, top, x1 - mx0, base - top, BRICK);
    px(mx0 - 1, top - 6, x1 - mx0 + 2, 6, '#b9bec6');
    for (let x = mx0; x < x1; x += 8) px(x, top - 6, 0.5, 6, '#a3a9b2');
    px(mx0 - 1, top - 6.5, x1 - mx0 + 2, 0.5, '#d8dce1'); px(mx0 - 1, top - 0.5, x1 - mx0 + 2, 0.5, '#8a9099');
    for (let f = 0; f < floors; f++) {
      const fy = top + f * fh;
      px(mx0, fy, x1 - mx0, 1.2, CREAM); px(mx0, fy + 1.2, x1 - mx0, 0.4, '#c9ae6e');
      for (let x = cx1 + 4; x + 13 < x1 - 2; x += 17) {
        if (f >= floors - 2 && Math.abs(x + 6 - ex) < 24) continue;
        windowAt(x, fy + 2.6, 13, fh - 4.4);
      }
    }
    // 빨강·주황·노랑·초록 색 패널 (꼭대기 층)
    ['#e23b3b', '#ff8a2a', '#ffd23a', '#46b866'].forEach((c, i) => {
      const x = x1 - 70 + i * 17 - 3;
      px(x, top - 6, 2.5, fh + 4, c); px(x + 2, top - 6, 0.5, fh + 4, 'rgba(0,0,0,0.15)');
    });
    // 학교 이름 판 (옥상)
    const sw = 64, sx = Math.round((cx1 + x1 - 75) / 2 - sw / 2), sy = top - 15;
    px(sx - 1, sy - 1, sw + 2, 11, '#20335c'); px(sx, sy, sw, 9, '#ffffff'); px(sx, sy + 9, sw, 1, '#2f5fc4');
    px(sx + 6, sy + 10, 1, 4, '#7a7f87'); px(sx + sw - 7, sy + 10, 1, 4, '#7a7f87');
    L.sign = { x: sx, y: sy, w: sw, h: 9 };
    // ── 강당 (왼쪽): 아래 벽돌, 위 회색 금속판, 완만한 둥근 지붕
    const gTop = top - 2;
    for (let x = x0; x < gx1; x += q) {
      const k = (x - x0) / (gx1 - x0), arc = Math.sin(k * Math.PI) * 4;
      px(x, gTop - arc, q, arc + 1, '#d9dde2');
    }
    px(x0, gTop, gx1 - x0, (base - gTop) * 0.55, '#c3c8ce');
    for (let y = gTop + 2; y < gTop + (base - gTop) * 0.55; y += 2) px(x0, y, gx1 - x0, 0.5, '#aeb4bb');
    px(x0, gTop + 6, gx1 - x0, 3, '#7fa0b8');
    for (let x = x0 + 2; x < gx1 - 2; x += 4) px(x, gTop + 6, 0.5, 3, '#d9dde2');
    const gb = gTop + (base - gTop) * 0.55;
    brickWall(x0, gb, gx1 - x0, base - gb, BRICK);
    px(x0, gb, gx1 - x0, 1, CREAM);
    for (let x = x0 + 3; x + 9 < gx1 - 1; x += 12) windowAt(x, gb + 3, 9, base - gb - 8);
    px(x0, gTop, 0.5, base - gTop, '#8a9099');
    // ── 둥근 현관 건물 (가운데가 앞으로 나온 곡선 벽)
    const cw = cx1 - cx0, ctop = top + 2;
    for (let x = cx0; x < cx1; x += q) {
      const k = (x - cx0) / cw, bulge = Math.sin(k * Math.PI);
      const shadeK = 0.55 + 0.45 * bulge;
      px(x, ctop - bulge * 2, q, base - ctop + bulge * 2, mix('#7a3526', BRICK, shadeK));
    }
    for (let f = 0; f < floors; f++) {
      const fy = ctop + f * (base - ctop) / floors;
      for (let x = cx0; x < cx1; x += q) { const bulge = Math.sin((x - cx0) / cw * Math.PI); px(x, fy - bulge * 1.2, q, 1, mix('#b89a5c', CREAM, bulge)); }
      if (f === floors - 1) continue;
      for (let i = 0; i < 4; i++) {
        const k = (i + 0.5) / 4, wx = cx0 + k * cw, ww = 5 + Math.sin(k * Math.PI) * 4;
        windowAt(wx - ww / 2, fy + 2.5, ww, (base - ctop) / floors - 4.5);
      }
    }
    // 나무 판 곡선 차양 + 둥근 돌기둥 + 유리문
    const sy2 = base - fh + 1;
    for (let x = cx0 - 2; x < cx1 + 2; x += q) {
      const bulge = Math.sin(Math.max(0, Math.min(1, (x - cx0) / cw)) * Math.PI);
      px(x, sy2 + 1.5 * (1 - bulge), q, 3, '#c9a27a');
      if (Math.round(x * 2) % 2 === 0) px(x, sy2 + 1.5 * (1 - bulge), q, 3, '#b48a62');
    }
    px(cx0 + 3, sy2 + 4, cw - 6, base - sy2 - 4, '#2c4656');
    for (let x = cx0 + 4; x < cx1 - 4; x += 4) px(x, sy2 + 4, 0.5, base - sy2 - 4, '#c0c6cc');
    const pc = cx0 + cw * 0.72;
    px(pc - 2.5, sy2 + 4, 5, base - sy2 - 4, '#d6d2c8'); px(pc - 2.5, sy2 + 4, 1, base - sy2 - 4, '#ece9e2'); px(pc + 1.5, sy2 + 4, 1, base - sy2 - 4, '#b5b0a5');
    px(pc - 2.5, sy2 + 7, 5, 4, '#8fd0f0'); px(pc - 1.5, sy2 + 9, 3, 2, '#9be07a');
    // ── 중앙현관: 돌 벽 + 현판 + 전광판 + 유리문 + 하늘색 유리 차양
    const ew = 40, ex0 = ex - ew / 2, eTop = base - fh * 2 + 2;
    px(ex0, eTop, ew, base - eTop, '#d6d2c8');
    for (let y = eTop + 3; y < base; y += 3) px(ex0, y, ew, 0.5, '#c2bdb1');
    px(ex0 + 3, eTop + 2, ew - 6, 5, '#fbf8f2'); px(ex0 + 3, eTop + 2, 3, 5, '#5a86e0'); px(ex0 + ew - 6, eTop + 2, 3, 5, '#5a86e0');
    L.slogan = { x: ex0 + 6, y: eTop + 2, w: ew - 12, h: 5 };
    px(ex0 + 6, eTop + 8, ew - 12, 3, '#1b1b1f');
    L.led = { x: ex0 + 6, y: eTop + 8, w: ew - 12, h: 3 };
    px(ex0 + 4, eTop + 12, ew - 8, base - eTop - 12, '#2c4656');
    for (let x = ex0 + 4; x < ex0 + ew - 4; x += 5) px(x, eTop + 12, 0.5, base - eTop - 12, '#c0c6cc');
    px(ex0 + 5, eTop + 13, 3, 4, '#5d8fb0'); px(ex0 + ew - 9, eTop + 13, 3, 4, '#5d8fb0');
    px(ex0 + 4, eTop + 15, ew - 8, 0.8, '#3d6fe9');
    // 차양: 어두운 판 + 하늘색 유리, 오른쪽으로 길게 뻗고 둥근 기둥이 받친다
    const cy = eTop - 4;
    px(ex0 - 6, cy, ew + 40, 3, '#6b6157'); px(ex0 - 6, cy + 3, ew + 40, 1, '#4f473f');
    px(ex0 - 2, cy - 1.5, ew + 30, 1.5, '#6fd3c7'); for (let x = ex0; x < ex0 + ew + 28; x += 5) px(x, cy - 1.5, 0.5, 1.5, '#4f9a90');
    px(ex0 + ew + 30, cy + 4, 2.5, base - cy - 4, '#7d736a'); px(ex0 + ew + 30, cy + 4, 0.8, base - cy - 4, '#9a9088');
    // 국기 게양대 (난간 옆)
    for (let i = 0; i < 3; i++) {
      const fx = Math.round(ex + 34 + i * 7);
      const ft = top + fh * 0.9;
      px(fx, ft, 0.8, base - ft + 3, '#c9ced4');
      px(fx - 0.5, ft - 1, 1.8, 1, '#e8c25a');
      const wave = Math.round(Math.sin(t * 4 + i) * 1);
      const fc = ['#ffffff', '#2f5fc4', '#2f9e5a'][i];
      px(fx + 1, ft + 2 + wave, 7, 5, fc);
      if (i === 0) { px(fx + 3, ft + 3 + wave, 3, 2, '#d9342b'); px(fx + 3, ft + 5 + wave, 3, 1, '#2f5fc4'); }
      else px(fx + 3, ft + 3 + wave, 3, 2, '#ffffff');
    }
    // 만국기 (행사 날)
    for (let i = 0, x = cx1 + 2; x < x1 - 6; x += 6, i++) {
      const sag = Math.sin((x - cx1) / (x1 - cx1) * Math.PI) * 4;
      const y = top + 1 + sag + Math.sin(t * 3 + i) * 0.6;
      px(x, y - 0.5, 6, 0.5, '#7a7f87');
      const c = COLORS[i % 6];
      px(x + 1, y, 4, 1, c); px(x + 1.5, y + 1, 3, 0.5, c); px(x + 2, y + 1.5, 2, 0.5, c); px(x + 2.5, y + 2, 1, 0.5, c);
    }
    // 세로 현수막 (곡선 건물)
    const bx = cx0 + cw / 2 - 6.5, bt = ctop + 3, bh = (base - ctop) * 0.62;
    for (let y = 0; y < bh; y += q) px(bx, bt + y, 13, q, mix('#c4203f', '#ff8a2a', y / bh));
    px(bx - 1, bt - 1, 15, 2, '#7a1028'); px(bx, bt + bh, 13, 2, '#ffd84a');
    for (let i = 0; i < 9; i++) px(bx + 0.5 + i * 1.5, bt + bh + 2, 0.5, 2.5 + (i % 2) * 0.5, '#ffd84a');
    L.banner = { x: bx, y: bt, w: 13, h: bh };
  }

  function trees() {
    const L = layout, b = L.base;
    // 중앙현관 옆 소나무: 겹친 삼각 잎 덩어리
    const pine = (x, hgt) => {
      bg.fillStyle = '#6b4428'; bg.fillRect(x - 0.9, b - 8, 1.8, 8);
      for (let i = 0; i < 5; i++) {
        const w2 = 6 + i * 3.2, y = b - hgt + i * (hgt - 7) / 5, hh = (hgt - 7) / 5 + 3;
        const gr = bg.createLinearGradient(x - w2 / 2, 0, x + w2 / 2, 0);
        gr.addColorStop(0, '#4f9a5a'); gr.addColorStop(0.45, '#357a40'); gr.addColorStop(1, '#1f5228');
        bg.fillStyle = gr; bg.beginPath(); bg.moveTo(x, y); bg.lineTo(x + w2 / 2, y + hh); bg.lineTo(x - w2 / 2, y + hh); bg.closePath(); bg.fill();
      }
    };
    pine(L.ex - 28, 26);
    // 단풍나무 (가을) – 양쪽 끝: 둥근 잎 덩어리를 겹쳐 입체감
    for (const tx of [L.x0 - 4, L.x1 + 2]) {
      const r = Util.rng(Math.round(tx * 10)), cx = tx + 1, cy = b - 28;
      const tr = bg.createLinearGradient(tx, 0, tx + 2.4, 0); tr.addColorStop(0, '#8a5530'); tr.addColorStop(1, '#5a3418');
      bg.fillStyle = tr; bg.fillRect(tx - 0.2, b - 24, 2.4, 26);
      bg.strokeStyle = '#6b3f20'; bg.lineWidth = 0.8; bg.beginPath(); bg.moveTo(cx, b - 16); bg.lineTo(cx - 5, b - 24); bg.moveTo(cx, b - 18); bg.lineTo(cx + 5, b - 26); bg.stroke();
      const blobs = [];
      for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 9; blobs.push([cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.95, 3 + r() * 2.6, i]); }
      blobs.sort((p, q2) => p[1] - q2[1]);
      const cols = ['#e8562f', '#d0442a', '#f2a23a', '#c43f2b', '#e86a30', '#ffd04a'];
      for (const [x, y, rad, i] of blobs) {
        const col = cols[i % cols.length], sway = Math.sin(t * 1.6 + i) * 0.25;
        const gr = bg.createRadialGradient(x + sway - rad * 0.35, y - rad * 0.4, 0.2, x + sway, y, rad);
        gr.addColorStop(0, mix(col, '#fff2c0', 0.35)); gr.addColorStop(0.6, col); gr.addColorStop(1, mix(col, '#4a1208', 0.35));
        bg.fillStyle = gr; bg.beginPath(); bg.arc(x + sway, y, rad, 0, Math.PI * 2); bg.fill();
        bg.fillStyle = mix(col, '#fff4c8', 0.45);
        for (let k = 0; k < 5; k++) { const a = i * 2.4 + k * 1.3, d = rad * 0.55; bg.beginPath(); bg.ellipse(x + sway + Math.cos(a) * d - rad * 0.15, y + Math.sin(a) * d - rad * 0.2, 0.55, 0.32, a, 0, Math.PI * 2); bg.fill(); }
      }
      for (let k = 0; k < 3; k++) {
        const fall = (t * 10 + tx + k * 13) % 40, lx = tx - 6 + k * 6 + Math.sin(t * 3 + tx + k) * 4;
        bg.save(); bg.translate(lx, b - 18 + fall); bg.rotate(t * 4 + k); bg.fillStyle = cols[k + 1];
        bg.beginPath(); bg.ellipse(0, 0, 1, 0.5, 0, 0, Math.PI * 2); bg.fill(); bg.restore();
      }
    }
  }

  function figures() {
    // 시작하기 버튼에 가리지 않도록 왼쪽에 둔다
    const btn = document.getElementById('btnStart');
    const half = btn && btn.offsetWidth ? btn.offsetWidth / 2 * dpr / (s * R) : 50;
    const lx = Math.max(24, W / 2 - half - 22), by = layout.base + 20;
    const bob = k => snap(Math.sin(t * 4 + k) * 1);
    shadow(lx - 10, by); bg.drawImage(chars[0].right[0], lx - 18, by - 16 + bob(0), 16, 16);
    shadow(lx + 8, by); bg.drawImage(robot, lx, by - 16 + bob(1.5), 16, 16);
    shadow(layout.ex + 2, layout.base + 4); bg.drawImage(chars[1].down[0], layout.ex - 6, layout.base - 12 + bob(3), 16, 16);
    shadow(layout.ex + 52, layout.base + 20); bg.drawImage(chars[2].left[Math.floor(t * 3) % 2], layout.ex + 44, layout.base + 4 + bob(2), 16, 16);
  }
  function shadow(x, y) {
    bg.fillStyle = 'rgba(0,0,0,0.2)';
    bg.beginPath(); bg.ellipse(x, y, 6, 2, 0, 0, Math.PI * 2); bg.fill();
  }

  function labels(offX, s) {
    const L = layout;
    const font = sz => `900 ${Math.round(sz)}px "Do Hyeon", "Black Han Sans", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    const X = v => offX + v * s, Y = v => offY + v * s;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // 옥상 학교 이름
    g.font = font(L.sign.h * s * 0.8);
    g.fillStyle = '#1f2f57';
    g.fillText('대교초등학교', X(L.sign.x + L.sign.w / 2), Y(L.sign.y + L.sign.h / 2 + 0.4), L.sign.w * s * 0.92);
    // 중앙현관 현판 · 전광판
    g.font = font(L.slogan.h * s * 0.62);
    g.fillStyle = '#1f3f8a';
    g.fillText('나의 꿈을 가꾸는 따뜻한 대교교육', X(L.slogan.x + L.slogan.w / 2), Y(L.slogan.y + L.slogan.h / 2 + 0.3), L.slogan.w * s * 0.96);
    g.font = font(L.led.h * s * 0.8);
    g.fillStyle = '#ffb347';
    g.fillText('행복한 대교교육', X(L.led.x + L.led.w / 2), Y(L.led.y + L.led.h / 2 + 0.2), L.led.w * s * 0.9);
    // 세로 현수막
    const chars = ['S', 'W', '·', 'A', 'I', '', '축', '제'];
    const step = L.banner.h / (chars.length + 0.5);
    g.font = font(step * s * 0.8);
    chars.forEach((c, i) => {
      const x = X(L.banner.x + L.banner.w / 2), y = Y(L.banner.y + step * (i + 0.8));
      g.lineWidth = s * 1.2; g.strokeStyle = '#6b0f24'; g.strokeText(c, x, y);
      g.fillStyle = '#fff3c4'; g.fillText(c, x, y);
    });
  }

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = sh => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  return { init, start, stop };
})();
