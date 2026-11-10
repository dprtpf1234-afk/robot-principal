// 미니게임 화면: AI 이름표 고치기, 암호 풀기, 로봇 코딩, 정렬 자물쇠, 전구 블록코딩
// 모두 같은 틀(누가 · 제목 · 설명 · 힌트 · 게임 · 결과 · 버튼)을 쓴다.
// h = { hint, onSuccess, onClose }  (hint는 UI.hintArea 참고)
const Mini = (() => {
  const E = Util.esc;
  const $ = id => document.getElementById(id);

  function frame(cls, who, title, intro, inner, h, extraBtns) {
    const html = `<div class="quiz-who">${E(who)}</div>
      <h2 class="mg-title">${E(title)}</h2>
      <p class="mg-intro">${E(intro)}</p>
      ${UI.hintArea(h.hint)}
      <div class="mg-body">${inner}</div>
      <div class="quiz-feedback" id="mgFb"></div>
      <div class="row mg-btns">${extraBtns || ''}<span class="sp"></span><button class="ghost" id="mgClose">나중에 하기</button></div>`;
    const body = UI.openPanel(html, 'mini mg-' + cls);
    UI.bindHint(body, h.hint);
    $('mgClose').addEventListener('click', () => { UI.closePanel(); h.onClose && h.onClose(); });
    return body;
  }
  function fb(text, ok) {
    const el = $('mgFb');
    if (!el) return;
    el.textContent = text;
    el.className = 'quiz-feedback ' + (ok ? 'ok' : 'bad');
    if (!ok) {
      const body = $('modalBody');
      body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake');
    }
  }
  function success(text, h, delay) {
    Sound.sfx('correct');
    fb(text, true);
    document.querySelectorAll('#modalBody button').forEach(b => { b.disabled = true; });
    setTimeout(() => { UI.closePanel(); h.onSuccess(); }, delay || 1300);
  }

  // ---------- 1) AI 이름표 고치기 (라벨링) ----------
  function label(d, who, h) {
    const labels = d.items.map(it => it.s);
    const card = (it, i) => `<button type="button" class="lb-card" data-i="${i}"><span class="emo">${it.e}</span><span class="lb-tag t${labels[i]}">${E(d.cats[labels[i]])}</span></button>`;
    const inner = `<div class="lb-legend">${d.cats.map((c, k) => `<span class="lb-tag t${k}">${E(c)}</span>`).join('')}<span class="muted small">이름표를 누르면 바뀌어요</span></div>
      <div class="lb-grid">${d.items.map(card).join('')}</div>
      <div class="lb-train hidden" id="lbTrain"><span>AI가 학습하는 중…</span><div class="bar"><i></i></div></div>`;
    const body = frame('label', who, 'AI 다시 학습시키기', d.intro, inner, h, '<button class="primary" id="lbGo">학습시키기</button>');
    body.querySelector('.lb-grid').addEventListener('click', e => {
      const b = e.target.closest('.lb-card');
      if (!b || b.disabled) return;
      const i = Number(b.dataset.i);
      labels[i] = (labels[i] + 1) % d.cats.length;
      b.outerHTML = card(d.items[i], i);
      Sound.sfx('talk');
      $('mgFb').textContent = '';
    });
    $('lbGo').addEventListener('click', () => {
      const wrong = d.items.filter((it, i) => labels[i] !== it.a).length;
      $('lbGo').disabled = true;
      $('lbTrain').classList.remove('hidden');
      setTimeout(() => {
        if (!$('lbTrain')) return;
        $('lbTrain').classList.add('hidden');
        $('lbGo').disabled = false;
        if (!wrong) return success(`AI 시험 결과: ${d.items.length}문제 모두 정답! AI가 제대로 배웠어요.`, h);
        Sound.sfx('wrong');
        fb(d.cats.length <= 2 ? `아직 틀린 이름표가 ${wrong}개 있어요. 틀린 데이터로 배운 AI는 틀리게 판단해요!` : `AI 시험 점수: ${d.items.length - wrong}/${d.items.length}점. 이름표를 다시 꼼꼼히 확인해 보세요.`, false);
      }, 1000);
    });
  }

  // ---------- 2) 암호 풀기 ----------
  function code(d, who, h) {
    // 신호 모양: 글자 신호(덧셈식·모스 부호 등) / 예전 이진수 전구 / 기호
    const textSig = d.sig === 'text';
    const binary = !textSig && typeof d.table[0].k === 'number' && d.code.every(c => /^[01]+$/.test(String(c)));
    const slots = d.code.map(() => null);
    const sigHtml = c => textSig ? `<div class="cd-sig txt">${E(c)}</div>`
      : binary
      ? `<div class="cd-sig bin">${c.split('').map(b => `<i class="${b === '1' ? 'on' : ''}"></i>`).join('')}<small>${c}</small></div>`
      : `<div class="cd-sig sym s${symIdx(c)}">${E(c)}</div>`;
    function symIdx(c) { return d.table.findIndex(t => t.k === c); }
    const render = () => {
      $('cdSlots').innerHTML = d.code.map((c, i) => `<div class="cd-col">${sigHtml(c)}<div class="cd-slot ${slots[i] ? 'fill' : ''} ${slots.indexOf(null) === i ? 'cur' : ''}">${slots[i] ? E(slots[i]) : '?'}</div></div>`).join('');
    };
    const inner = `${binary ? '<div class="cd-place">전구 자리값: <b>8</b> · <b>4</b> · <b>2</b> · <b>1</b></div>' : ''}
      <div class="cd-slots" id="cdSlots"></div>
      <div class="cd-table-title">암호표</div>
      <div class="cd-table">${d.table.map((t, i) => `<button type="button" class="cd-key" data-v="${E(t.v)}"><span class="k ${binary || textSig ? (textSig ? 'txt' : '') : 'sym s' + i}">${E(t.k)}</span><span class="eq">=</span><span class="v">${E(t.v)}</span></button>`).join('')}</div>`;
    frame('code', who, '암호 신호 풀기', d.intro, inner, h, '<button class="ghost" id="cdBack">⌫ 지우기</button><button class="primary" id="cdGo">확인</button>');
    render();
    document.querySelector('.cd-table').addEventListener('click', e => {
      const b = e.target.closest('.cd-key');
      if (!b) return;
      const i = slots.indexOf(null);
      if (i < 0) return;
      slots[i] = b.dataset.v;
      Sound.sfx('talk');
      $('mgFb').textContent = '';
      render();
    });
    $('cdBack').addEventListener('click', () => {
      let i = slots.indexOf(null); i = i < 0 ? slots.length - 1 : i - 1;
      if (i >= 0) { slots[i] = null; render(); }
    });
    $('cdGo').addEventListener('click', () => {
      if (slots.includes(null)) return fb('빈칸을 모두 채워 주세요.', false);
      if (slots.join('') === d.answer) return success(`신호 해독 성공! "${d.answer}"`, h);
      Sound.sfx('wrong');
      fb('암호가 맞지 않아요. 신호를 하나씩 다시 확인해 보세요.', false);
    });
  }

  // ---------- 3) 로봇 코딩 ----------
  const DIRS = { up: [0, -1, '↑'], down: [0, 1, '↓'], left: [-1, 0, '←'], right: [1, 0, '→'] };
  function robot(d, who, h) {
    const prog = [];
    let pos = d.start.slice(), running = false;
    const isWall = (x, y) => x < 0 || y < 0 || x >= d.w || y >= d.h || d.walls.some(w => w[0] === x && w[1] === y);
    const drawGrid = (bump) => {
      let html = '';
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const wall = d.walls.some(w => w[0] === x && w[1] === y);
        const here = pos[0] === x && pos[1] === y;
        const goal = d.goal[0] === x && d.goal[1] === y;
        html += `<div class="rb-cell ${wall ? 'wall' : ''} ${here && bump ? 'bump' : ''}">${here ? '🤖' : goal ? '⚙️' : ''}</div>`;
      }
      const g = $('rbGrid');
      if (g) g.innerHTML = html;
    };
    const drawProg = () => {
      $('rbProg').innerHTML = prog.length
        ? prog.map((b, i) => `<button type="button" class="rb-blk" data-i="${i}">${DIRS[b.d][2]}${d.repeat ? `<small>×${b.n}</small>` : ''}</button>`).join('')
        : '<span class="muted small">아래 화살표를 눌러 블록을 놓아요</span>';
      $('rbCount').textContent = `${prog.length}/${d.max}`;
    };
    const inner = `<div class="rb-wrap"><div class="rb-grid" id="rbGrid" style="grid-template-columns:repeat(${d.w}, 1fr)"></div>
      <div class="rb-side"><div class="rb-label">내 코드 <span id="rbCount"></span></div><div class="rb-prog" id="rbProg"></div>
      <div class="rb-pal">${['up', 'left', 'down', 'right'].map(k => `<button type="button" class="rb-add" data-d="${k}">${DIRS[k][2]}</button>`).join('')}</div>
      ${d.repeat ? '<p class="muted small">놓은 블록을 누르면 반복 횟수가 바뀌어요 (×1 → ×5)</p>' : '<p class="muted small">놓은 블록을 누르면 지워져요</p>'}</div></div>`;
    frame('robot', who, '로봇 코딩', d.intro, inner, h, '<button class="ghost" id="rbClear">모두 지우기</button><button class="primary" id="rbRun">▶ 실행</button>');
    drawGrid(); drawProg();
    document.querySelector('.rb-pal').addEventListener('click', e => {
      const b = e.target.closest('.rb-add');
      if (!b || running) return;
      if (prog.length >= d.max) return fb(`블록은 ${d.max}개까지만 놓을 수 있어요.${d.repeat ? ' 블록을 눌러 반복 횟수를 늘려 보세요!' : ''}`, false);
      prog.push({ d: b.dataset.d, n: 1 });
      Sound.sfx('talk'); $('mgFb').textContent = '';
      drawProg();
    });
    $('rbProg').addEventListener('click', e => {
      const b = e.target.closest('.rb-blk');
      if (!b || running) return;
      const i = Number(b.dataset.i);
      if (d.repeat) prog[i].n = prog[i].n % 5 + 1; else prog.splice(i, 1);
      Sound.sfx('talk');
      drawProg();
    });
    $('rbClear').addEventListener('click', () => { if (running) return; prog.length = 0; pos = d.start.slice(); drawGrid(); drawProg(); $('mgFb').textContent = ''; });
    $('rbRun').addEventListener('click', () => {
      if (running || !prog.length) return;
      const steps = [];
      prog.forEach(b => { for (let k = 0; k < b.n; k++) steps.push(b.d); });
      running = true;
      pos = d.start.slice(); drawGrid();
      document.querySelectorAll('.rb-add, #rbClear, #rbRun').forEach(b => { b.disabled = true; });
      let i = 0;
      const end = (ok, msg) => {
        running = false;
        if (ok) return success(msg, h);
        Sound.sfx('wrong');
        fb(msg, false);
        setTimeout(() => { if (!$('rbGrid')) return; pos = d.start.slice(); drawGrid(); document.querySelectorAll('.rb-add, #rbClear, #rbRun').forEach(b => { b.disabled = false; }); }, 900);
      };
      const tick = () => {
        if (!$('rbGrid')) return;
        if (i >= steps.length) {
          return pos[0] === d.goal[0] && pos[1] === d.goal[1] ? end(true, '도착! 로봇이 부품을 집었어요.') : end(false, '로봇이 부품까지 가지 못했어요. 코드를 고쳐 볼까요?');
        }
        const [dx, dy] = DIRS[steps[i++]];
        const nx = pos[0] + dx, ny = pos[1] + dy;
        if (isWall(nx, ny)) { drawGrid(true); return end(false, '쾅! 벽에 부딪혔어요. 코드를 고쳐 볼까요?'); }
        pos = [nx, ny];
        Sound.sfx('talk');
        drawGrid();
        if (pos[0] === d.goal[0] && pos[1] === d.goal[1] && i === steps.length) return setTimeout(tick, 200);
        setTimeout(tick, 260);
      };
      setTimeout(tick, 250);
    });
  }

  // ---------- 4) 정렬 자물쇠 ----------
  function sort(d, who, h) {
    let picked = [];
    const draw = () => {
      $('stSlots').innerHTML = d.cards.map((c, i) => `<div class="st-slot ${picked[i] != null ? 'fill' : ''}">${picked[i] != null ? E(d.cards[picked[i]].t) : i + 1}</div>`).join('<span class="st-arrow">→</span>');
      document.querySelectorAll('.st-card').forEach(b => { b.disabled = picked.includes(Number(b.dataset.i)); });
    };
    const inner = `<div class="st-lock">🔒 작은 값 → 큰 값</div><div class="st-slots" id="stSlots"></div>
      <div class="st-cards">${d.cards.map((c, i) => `<button type="button" class="st-card" data-i="${i}">${E(c.t)}</button>`).join('')}</div>`;
    frame('sort', who, '숫자 자물쇠 열기', d.intro, inner, h, '<button class="ghost" id="stClear">다시 하기</button>');
    draw();
    document.querySelector('.st-cards').addEventListener('click', e => {
      const b = e.target.closest('.st-card');
      if (!b || b.disabled) return;
      picked.push(Number(b.dataset.i));
      Sound.sfx('talk'); $('mgFb').textContent = '';
      draw();
      if (picked.length === d.cards.length) {
        const ok = picked.every((ci, k) => k === 0 || d.cards[picked[k - 1]].v <= d.cards[ci].v);
        if (ok) return success('딸깍! 자물쇠가 열렸어요.', h);
        Sound.sfx('wrong');
        fb('자물쇠가 안 열려요. 작은 값부터 다시 눌러 보세요.', false);
        setTimeout(() => { picked = []; if ($('stSlots')) draw(); }, 900);
      }
    });
    $('stClear').addEventListener('click', () => { picked = []; draw(); $('mgFb').textContent = ''; });
  }

  // ---------- 5) 전구 블록코딩 ----------
  function runBulbs(d) {
    const on = new Array(d.n).fill(false);
    let p = 0;
    const ex = list => { for (const c of list) { if (c.op === 'on') { if (p < d.n) on[p] = true; } else if (c.op === 'next') p++; else if (c.op === 'repeat') for (let i = 0; i < c.n; i++) ex(c.body); } };
    ex(d.program);
    return on;
  }
  function blocksHtml(list) {
    return list.map(c => c.op === 'repeat'
      ? `<div class="bk rep"><div class="bk-head">반복하기 <b>${c.n}</b>번</div><div class="bk-inner">${blocksHtml(c.body)}</div></div>`
      : `<div class="bk ${c.op}">${c.op === 'on' ? '💡 전구 켜기' : '➡ 다음 칸으로'}</div>`).join('');
  }
  function bulbs(d, who, h) {
    const mine = new Array(d.n).fill(false);
    const answer = runBulbs(d);
    const inner = `<div class="bk-wrap"><div class="bk-code"><div class="bk start">▶ 시작 (1번 칸)</div>${blocksHtml(d.program)}</div>
      <div class="bk-right"><div class="rb-label">켜질 전구를 눌러 표시하세요</div>
      <div class="bulbs">${mine.map((v, i) => `<button type="button" class="bulb" data-i="${i}"><i></i><small>${i + 1}</small></button>`).join('')}</div></div></div>`;
    frame('bulbs', who, '단말기: 전구 블록코딩', d.intro, inner, h, '<button class="primary" id="bkGo">확인</button>');
    document.querySelector('.bulbs').addEventListener('click', e => {
      const b = e.target.closest('.bulb');
      if (!b) return;
      const i = Number(b.dataset.i);
      mine[i] = !mine[i];
      b.classList.toggle('on', mine[i]);
      Sound.sfx('talk'); $('mgFb').textContent = '';
    });
    $('bkGo').addEventListener('click', () => {
      if (mine.every((v, i) => v === answer[i])) return success('삐빅! 정답! 단말기가 열리고 AI 칩이 나왔어요.', h, 1500);
      Sound.sfx('wrong');
      fb('단말기: 결과가 달라요. 코드를 위에서부터 한 줄씩 다시 따라가 보세요.', false);
    });
  }

  return { label, code, robot, sort, bulbs, runBulbs };
})();
