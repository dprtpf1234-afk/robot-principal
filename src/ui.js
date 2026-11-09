// 화면 위에 겹쳐 보이는 HTML 화면들: 시작, 대화창, 퀴즈, 수첩, 랭킹, 클리어, 안내
const UI = (() => {
  const $ = id => document.getElementById(id);
  let dialogState = null;
  let modalStack = 0;
  let closedAt = 0;

  function modalOpen() {
    return !!dialogState || modalStack > 0 || performance.now() - closedAt < 220;
  }
  function markClosed() {
    closedAt = performance.now();
    setTimeout(() => Game.clearInput(), 0);
  }

  // ---------- 대화창 ----------
  function dialog(lines, onDone) {
    if (!lines || !lines.length) { onDone && onDone(); return; }
    const el = $('dialog');
    dialogState = { lines, i: 0, shown: 0, full: '', onDone, timer: null };
    el.classList.remove('hidden');
    showLine();
  }
  function showLine() {
    const st = dialogState;
    const line = st.lines[st.i];
    if (line.onShow) line.onShow();
    $('dlgWho').textContent = line.who || '';
    $('dlgWho').style.display = line.who ? '' : 'none';
    $('dlgPage').textContent = st.lines.length > 1 ? (st.i + 1) + ' / ' + st.lines.length : '';
    $('dlgNext').textContent = st.i + 1 < st.lines.length ? '다음 ▶' : '확인';
    $('dlgSkip').style.display = st.lines.length > 1 && st.i + 1 < st.lines.length ? '' : 'none';
    st.full = line.text;
    st.shown = 0;
    $('dlgText').textContent = '';
    clearInterval(st.timer);
    st.timer = setInterval(() => {
      st.shown += 2;
      $('dlgText').textContent = st.full.slice(0, st.shown);
      if (st.shown % 6 === 0) Sound.sfx('talk');
      if (st.shown >= st.full.length) { clearInterval(st.timer); }
    }, 30);
  }
  function skipDialog() {
    const st = dialogState;
    if (!st) return;
    for (let i = st.i + 1; i < st.lines.length; i++) if (st.lines[i].onShow) st.lines[i].onShow();
    st.i = st.lines.length - 1; st.shown = st.full.length;
    clearInterval(st.timer);
    advance();
  }
  function advance() {
    const st = dialogState;
    if (!st) return;
    if (st.shown < st.full.length) {
      st.shown = st.full.length;
      clearInterval(st.timer);
      $('dlgText').textContent = st.full;
      return;
    }
    st.i++;
    if (st.i < st.lines.length) { showLine(); return; }
    clearInterval(st.timer);
    $('dialog').classList.add('hidden');
    dialogState = null;
    markClosed();
    st.onDone && st.onDone();
  }

  // ---------- 공용 패널 ----------
  function openPanel(html, cls) {
    const el = $('modal');
    $('modalBody').innerHTML = html;
    $('modalBody').className = 'panel ' + (cls || '');
    el.classList.remove('hidden');
    modalStack = 1;
    return $('modalBody');
  }
  function closePanel() {
    $('modal').classList.add('hidden');
    $('modalBody').innerHTML = '';
    modalStack = 0;
    markClosed();
  }

  // ---------- 힌트 ----------
  // hint = { label(): string, use(): boolean, bought: boolean, text: string, effect?: fn }
  function hintArea(hint) {
    if (!hint) return '';
    return `<div class="hint-area"><button type="button" class="hint-btn" id="hintBtn">💡 힌트 <small id="hintLab"></small></button><div class="hint-text hidden" id="hintText"></div></div>`;
  }
  function bindHint(body, hint) {
    if (!hint) return;
    const btn = body.querySelector('#hintBtn');
    const show = () => {
      btn.disabled = true;
      body.querySelector('#hintLab').textContent = '사용함';
      if (hint.text) { const t = body.querySelector('#hintText'); t.textContent = hint.text; t.classList.remove('hidden'); }
      hint.effect && hint.effect(body);
    };
    body.querySelector('#hintLab').textContent = hint.label();
    if (hint.bought) return show();
    btn.addEventListener('click', () => { if (hint.use()) { Sound.sfx('pick'); show(); } });
  }

  // ---------- 퀴즈 ----------
  // q: { format: 'choice'|'text'|'ox', question, choices, correct, answers, explain }
  function quiz(q, who, h) {
    let html = `<div class="quiz-who">${Util.esc(who)}</div>`;
    if (h.progress) {
      const { i, n } = h.progress;
      html += `<div class="quiz-prog"><span>문제 <b>${i + 1}</b> / ${n}</span><span class="dots">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('')}</span></div>`;
      if (h.rule) html += `<div class="quiz-rule">${Util.esc(h.rule)}</div>`;
    }
    html += `<div class="quiz-q">${Util.esc(q.question)}</div>`;
    html += hintArea(h.hint);
    let order = [];
    if (q.format === 'choice') {
      order = Util.shuffle(q.choices.map((c, i) => i).filter(i => q.choices[i] && String(q.choices[i]).trim()));
      html += '<div class="choices">' + order.map((ci, k) =>
        `<button class="choice" data-i="${ci}"><span class="num">${k + 1}</span>${Util.esc(q.choices[ci])}</button>`).join('') + '</div>';
    } else if (q.format === 'ox') {
      html += '<div class="ox"><button class="choice oxbtn" data-v="O">O</button><button class="choice oxbtn" data-v="X">X</button></div>';
    } else {
      html += `<form class="answer" autocomplete="off"><input id="quizInput" type="text" maxlength="20" placeholder="정답을 입력하세요" enterkeyhint="done"><button type="submit" class="primary">확인</button></form>`;
    }
    html += '<div class="quiz-feedback" id="quizFb"></div><div class="explain hidden" id="quizEx"></div><div class="row end" id="quizRow"><button class="ghost" id="quizClose">나중에 풀기</button></div>';
    const body = openPanel(html, 'quiz');
    body.dataset.qi = h.progress ? h.progress.i : 0;
    bindHint(body, h.hint);
    const fb = $('quizFb');
    let done = false;
    const result = ok => {
      if (done) return;
      if (ok) {
        done = true;
        Sound.sfx('correct');
        body.querySelectorAll('.choice, .answer button, .answer input, #hintBtn').forEach(el => { el.disabled = true; });
        const next = () => { if (!h.keepOpen) closePanel(); h.onCorrect(); };
        if (q.explain) {
          fb.textContent = '정답!';
          fb.className = 'quiz-feedback ok';
          const ex = $('quizEx');
          ex.innerHTML = `<b>해설</b> ${Util.esc(q.explain)}`;
          ex.classList.remove('hidden');
          $('quizRow').innerHTML = `<button class="primary" id="quizNext">${h.keepOpen ? '다음 문제 ▶' : '확인'}</button>`;
          $('quizNext').addEventListener('click', next);
          setTimeout(() => { const b = $('quizNext'); if (b && !Game.isTouch()) b.focus(); }, 30);
        } else {
          fb.textContent = h.keepOpen ? '정답! 다음 문제로~' : '정답!';
          fb.className = 'quiz-feedback ok';
          setTimeout(next, h.keepOpen ? 700 : 650);
        }
      } else {
        Sound.sfx('wrong');
        fb.className = 'quiz-feedback bad';
        body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake');
        if (h.reset) {
          // 틀리면 1번 문제부터 다시
          done = true;
          fb.textContent = h.restartLine || '틀렸어요! 처음부터 다시!';
          body.querySelectorAll('.choice, .answer button, .answer input').forEach(el => { el.disabled = true; });
          setTimeout(() => { if ($('modalBody') === body && modalStack) h.reset(); }, 1400);
        } else {
          fb.textContent = h.wrongLine();
        }
      }
    };
    body.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
      if (q.format === 'ox') result(Util.normalize(b.dataset.v) === Util.normalize(q.answers[0]));
      else {
        const ok = Number(b.dataset.i) === Number(q.correct);
        if (!ok) b.classList.add('wrong');
        result(ok);
      }
    }));
    const form = body.querySelector('form');
    if (form) {
      const input = $('quizInput');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const v = Util.normalize(input.value);
        if (!v) return;
        result(q.answers.some(a => Util.normalize(a) === v));
        if (!done) input.select();
      });
      setTimeout(() => { if (!Game.isTouch()) input.focus(); }, 50);
    }
    $('quizClose').addEventListener('click', () => { closePanel(); h.onClose && h.onClose(); });
    body._keys = e => {
      if (done) { if ((e.key === 'Enter' || e.key === ' ') && $('quizNext')) { e.preventDefault(); $('quizNext').click(); } return; }
      if (q.format === 'choice' && /^[1-4]$/.test(e.key)) {
        const btn = body.querySelectorAll('.choice')[Number(e.key) - 1];
        if (btn && !btn.disabled) btn.click();
      }
      if (q.format === 'ox' && /^[oOxXㅐㅌ]$/.test(e.key)) {
        const v = /[oOㅐ]/.test(e.key) ? 'O' : 'X';
        body.querySelector(`.oxbtn[data-v="${v}"]`).click();
      }
    };
  }

  // 문제 힌트 효과: 객관식은 오답 2개 지우기, 주관식은 첫 글자, OX는 설명
  function quizHintEffect(q) {
    return body => {
      const t = body.querySelector('#hintText');
      if (q.format === 'choice') {
        const wrong = Util.shuffle(Array.from(body.querySelectorAll('.choice')).filter(b => Number(b.dataset.i) !== Number(q.correct))).slice(0, 2);
        wrong.forEach(b => { b.disabled = true; b.classList.add('gone'); });
        t.textContent = '오답 2개를 지웠어요!';
      } else if (q.format === 'text') {
        const a = String(q.answers[0] || '');
        t.textContent = `정답은 ${a.length}글자, 첫 글자는 "${a[0] || ''}"예요.`;
      } else {
        t.textContent = q.hintText || '천천히 다시 읽어 보고, 우리 생활에서 어떻게 해야 안전하고 바른지 생각해 보세요.';
      }
      t.classList.remove('hidden');
    };
  }

  // 여러 문제를 한 번에 맞혀야 하는 퀴즈 (틀리면 처음부터, 문제는 다시 뽑는다)
  function quizSet(list, who, h) {
    let cur = list;
    const run = i => quiz(cur[i], who, {
      progress: { i, n: cur.length }, rule: h.rule, restartLine: h.restartLine, wrongLine: h.wrongLine,
      keepOpen: i < cur.length - 1,
      hint: h.hintFor ? h.hintFor(cur[i]) : null,
      onCorrect: () => (i + 1 < cur.length ? run(i + 1) : h.onCorrect()),
      reset: () => { if (h.repick) cur = h.repick(); run(0); },
      onClose: h.onClose
    });
    run(0);
  }

  // ---------- 알림 ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- 상단 정보 ----------
  function hud(s) {
    $('hudTime').innerHTML = `<small>${s.label}</small>${s.time}`;
    $('hudTime').parentElement.classList.toggle('warn', !!s.warn);
    // "본관 1층 · 밤" → 장소는 크게, 낮/밤은 작게
    const pl = String(s.place || '').split(' · ');
    $('hudPlace').textContent = pl[0] || '';
    $('hudPhase').textContent = pl.slice(1).join(' · ');
    const mi = s.mission || { html: '', pill: '' };
    const key = mi.html + '|' + mi.pill;
    const box = $('hudNext');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.innerHTML = `<span class="star"></span><span class="mtext">${mi.html}</span>${mi.pill ? `<span class="mpill">${mi.pill}</span>` : ''}`;
    }
    const parts = $('hudParts');
    const pk = s.parts + '/' + s.total + '/' + s.tokens;
    if (parts.dataset.n !== pk) {
      parts.dataset.n = pk;
      parts.innerHTML = `<span class="tok" title="힌트 토큰">💡${s.tokens}</span>` + Array.from({ length: s.total }, (_, i) => `<span class="slot ${i < s.parts ? 'on' : ''}"></span>`).join('');
    }
  }
  // 미니맵 아래: 모은 부품 + 가진 것
  function inventory(s) {
    const el = $('invPanel');
    if (!el) return;
    const key = JSON.stringify(s);
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = `<h4>모은 부품 ${s.parts.filter(x => x.on).length}/${s.parts.length}</h4><div class="inv-grid">` +
      s.parts.map(x => `<span class="inv-slot ${x.on ? 'on' : ''}" title="${Util.esc(x.name)}">${x.on ? Util.esc(x.name) : '?'}</span>`).join('') + '</div>' +
      `<h4>가진 것</h4><div class="inv-chips">` + s.items.map(x => `<span class="inv-chip ${x.on ? 'on' : ''}">${Util.esc(x.name)}</span>`).join('') +
      `<span class="inv-chip tok">힌트 토큰 ${s.tokens}</span><span class="inv-chip star">개나리 ${s.stars}/${s.starTotal}</span></div>`;
  }
  function setTalkButton(label) {
    const b = $('btnTalk');
    if (label) { b.textContent = label; b.classList.remove('off'); }
    else { b.textContent = '대화'; b.classList.add('off'); }
  }
  function setSoundButton(muted) {
    const icon = '<svg viewBox="0 0 20 20"><path d="M3 7h4l5-4v14l-5-4H3z" fill="currentColor"/>' +
      (muted ? '<path d="M14 7l5 6M19 7l-5 6" stroke="currentColor" stroke-width="2.2"/>' : '<path d="M14.5 6.5a5 5 0 010 7M16.5 4a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2"/>') + '</svg>';
    for (const id of ['btnSound', 'btnSoundTitle']) {
      const b = $(id);
      if (!b) continue;
      b.innerHTML = icon + (id === 'btnSoundTitle' ? (muted ? '소리 꺼짐' : '소리 켜짐') : '');
      b.title = muted ? '소리 켜기' : '소리 끄기';
      b.classList.toggle('muted', muted);
    }
  }

  // ---------- 도감 ----------
  function dex(entries, known, total) {
    const n = entries.filter(e => known.has(e.id)).length;
    const html = `<div class="dex-head"><h2>학교 도감 ${n}/${total}</h2><div class="dex-bar"><span style="width:${Math.round(n / total * 100)}%"></span></div></div>
      <p class="muted small" style="margin:0 0 8px">학교에서 만난 사람과 이야기하면 도감에 등록돼요. 말풍선이 떠 있는 친구는 아직 못 만난 친구예요.</p>
      <div class="dex-grid">${entries.map((e, i) => known.has(e.id)
        ? `<div class="dex-card"><canvas data-i="${i}" width="16" height="16"></canvas><div><div class="nm">${Util.esc(e.name)}</div><div class="pl">${Util.esc(e.place)}</div></div><div class="pf">${Util.esc(e.profile || '')}</div></div>`
        : `<div class="dex-card unknown"><canvas data-i="${i}" data-dark="1" width="16" height="16"></canvas><div><div class="nm">???</div><div class="pl">${Util.esc(e.place)} 어딘가</div></div><div class="pf">아직 만나지 못했어요.</div></div>`).join('')}</div>
      <div class="row end"><button class="primary" id="dexClose">닫기</button></div>`;
    const body = openPanel(html, 'dexp');
    body.querySelectorAll('canvas').forEach(c => {
      const e = entries[Number(c.dataset.i)];
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const img = e.id === 'robot' ? Sprites.makeRobot(false) : (e.npc && e.npc.frames ? e.npc.frames.down[0] : null);
      if (!img) return;
      g.drawImage(img, 0, 0);
      if (c.dataset.dark) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#6b5f4a'; g.fillRect(0, 0, 16, 16); }
    });
    $('dexClose').addEventListener('click', closePanel);
  }

  // ---------- 수첩 ----------
  function notebook(nb) {
    const E = Util.esc;
    const sec = (title, items, empty) =>
      `<h3>${title}</h3>` + (items.length ? '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>' : `<p class="muted">${empty}</p>`);
    const html = `<h2>탐험 수첩</h2>
      <div class="nb-top"><span class="nb-chip">💡 힌트 토큰 <b>${nb.tokens}</b>개</span><span class="nb-chip">🌼 ${E(nb.collectName)} <b>${nb.stars}</b>/${nb.starTotal}</span>${nb.penalty ? `<span class="nb-chip bad">벌점 +${Math.round(nb.penalty / 60000)}분</span>` : ''}</div>
      ${sec('모은 부품 (' + nb.parts.length + '/' + nb.total + ')', nb.parts.map(p => E(p)), '아직 모은 부품이 없어요.')}
      ${sec('가방', nb.items.map(it => `<b>${E(it.name)}</b> · ${E(it.desc)}`), '아직 가방이 비어 있어요.')}
      ${sec('찾은 단서·쪽지', nb.clues.map(c => E(c)), '아직 찾은 단서가 없어요.')}
      ${sec('받은 힌트', nb.hints.map(h => `<b>${E(h.title)}</b> · ${E(h.text)}`), '서브 미션을 깨거나 💡 힌트를 쓰면 여기에 적혀요.')}
      <div class="row end"><button class="primary" id="nbClose">닫기</button></div>`;
    openPanel(html, 'notebook');
    $('nbClose').addEventListener('click', closePanel);
  }

  // ---------- i 팻말 ----------
  function sign(title, text, img) {
    openPanel(`<div class="sign-head"><span class="sign-i">i</span><h2>${Util.esc(title)}</h2></div>${img ? `<img class="sign-img" src="${img}" alt="">` : ''}<div class="sign-text">${Util.esc(text)}</div><div class="row end"><button class="primary" id="sgClose">닫기</button></div>`, 'signp');
    $('sgClose').addEventListener('click', closePanel);
  }

  // ---------- 미션 순서도 ----------
  // nodes: [[{ id, label, state: 'done'|'open'|'lock', focus }]]
  let flowKey = '';
  function flow(stages, onPick) {
    const key = JSON.stringify(stages);
    if (key === flowKey) return;
    flowKey = key;
    const el = $('flowList');
    el.innerHTML = stages.map((st, si) => `${si ? '<div class="fl-arrow">▼</div>' : ''}<div class="fl-stage ${st.length > 1 ? 'multi' : ''}">${st.map(n =>
      `<button type="button" class="fl-node ${n.state} ${n.focus ? 'focus' : ''}" data-id="${n.id}"><span class="fl-ic">${n.state === 'done' ? '✓' : n.state === 'lock' ? '🔒' : n.icon || '!'}</span><span class="fl-lab">${Util.esc(n.label)}</span></button>`).join('')}</div>`).join('');
    el.querySelectorAll('.fl-node').forEach(b => b.addEventListener('click', () => onPick(b.dataset.id)));
  }

  // ---------- 고르기 창 (이어하기 등) ----------
  function choose(title, msg, buttons) {
    openPanel(`<h2>${Util.esc(title)}</h2><p>${msg}</p><div class="row center">${buttons.map((b, i) => `<button class="${b.cls || 'ghost'}" data-b="${i}">${Util.esc(b.label)}</button>`).join('')}</div>`, 'confirm');
    $('modalBody').querySelectorAll('[data-b]').forEach(el => el.addEventListener('click', () => { closePanel(); buttons[Number(el.dataset.b)].cb(); }));
  }

  // ---------- 랭킹 ----------
  async function ranking(group, onClose) {
    const f = { g: group || 'low', mode: 'all' };
    const render = async () => {
      const rows = await Store.getRanking(f.g, 30, { mode: f.mode });
      const what = '모든 미션을 깨는 데 걸린 시간 (학생별 최고 기록)';
      const body = rows.length
        ? '<table class="rank"><thead><tr><th>순위</th><th>이름</th><th>모드</th><th>기록</th></tr></thead><tbody>' +
          rows.map(r => `<tr class="${r.rank <= 3 ? 'top' + r.rank : ''}"><td>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td><td>${Util.esc(r.label)}</td><td class="mode">${r.mode === 'm10' ? '10분' : '30분'}</td><td>${Util.formatTime(r.bestMs)}</td></tr>`).join('') +
          '</tbody></table>'
        : '<p class="muted center empty">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>';
      const seg = (key, items) => `<div class="rk-seg" data-k="${key}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(f[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const html = `<h2>명예의 전당</h2>
        <div class="tabs rk-group">${[['low', '저학년 <small>1~3학년</small>'], ['high', '고학년 <small>4~6학년</small>']].map(([v, l]) => `<button data-g="${v}" class="${f.g === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="rk-row"><span class="rk-lab">모드</span>${seg('mode', [['all', '전체'], ['m30', '30분 미션'], ['m10', '10분 미션']])}</div>
        <p class="rk-what">${what}</p>
        <div class="rank-wrap">${body}</div>
        ${Store.mode === 'local' ? '<p class="muted small">시험 버전: 지금은 이 기기에서 한 기록만 보여요.</p>' : ''}
        <div class="row end"><button class="primary" id="rkClose">닫기</button></div>`;
      openPanel(html, 'ranking');
      const body2 = $('modalBody');
      body2.querySelectorAll('.rk-group button').forEach(b => b.addEventListener('click', () => { f.g = b.dataset.g; render(); }));
      body2.querySelectorAll('.rk-seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        f[sg.dataset.k] = b.dataset.v;
        render();
      })));
      $('rkClose').addEventListener('click', () => { closePanel(); onClose && onClose(); });
    };
    render();
  }

  // ---------- 캐릭터 소개 ----------
  function character(img, name, modeLabel, onOk, total) {
    const html = `<h2>${Util.esc(name)} 탐험가, 준비됐나요?</h2>
      <div class="char-box"><canvas id="charPreview" width="32" height="32"></canvas></div>
      <p class="center">${Util.esc(modeLabel)} · 로봇 교장선생님의 부품 ${total || 7}개를 모아 재부팅해 주세요!</p>
      <div class="howto">
        <div><b>이동</b> ${Game.isTouch() ? '왼쪽 아래 조이스틱' : '방향키'}</div>
        <div><b>점프</b> ${Game.isTouch() ? '점프 버튼' : '스페이스바'} · 공중에서 한 번 더 누르면 한 바퀴!</div>
        <div><b>대화</b> ${Game.isTouch() ? '가까이 가서 대화 버튼' : '가까이 가서 E키 또는 클릭'}</div>
        <div><b>길 찾기</b> 왼쪽 순서도에서 미션을 누르면 노란 별이 안내해요</div>
      </div>
      <div class="row center"><button class="primary big" id="charOk">탐험 시작!</button></div>`;
    openPanel(html, 'character');
    const c = $('charPreview');
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    $('charOk').addEventListener('click', () => { closePanel(); onOk(); });
  }

  // ---------- 클리어 ----------
  function clear(res, h) {
    const explore = res.status === 'explore';
    const rewards = (res.rewards || []).map(r => `<span class="nb-chip">${Util.esc(r)}</span>`).join('');
    const html = `<div class="confetti-top">🎉</div><h2 class="center">미션 클리어! 로봇 교장선생님을 구했어요!</h2>
      <div class="result">
        <div class="muted">${Util.esc(res.modeLabel || '')}</div>
        <div class="big-time">${res.durationMs != null ? Util.formatTime(res.durationMs) : '--:--'}</div>
        ${res.penaltyMs ? `<div class="muted small">힌트 벌점 +${Math.round(res.penaltyMs / 60000)}분 포함</div>` : ''}
        ${explore ? '<p class="muted">탐험 모드 기록은 랭킹에 오르지 않아요. 30분·10분 미션에 도전해 보세요!</p>' : `
        <div>내 최고 기록 <b>${res.bestMs != null ? Util.formatTime(res.bestMs) : '--:--'}</b></div>
        <div>${Util.esc(Util.groupLabel(res.group))} · ${Util.esc(res.modeLabel || '')} 순위 <b>${res.rank != null ? res.rank + '위' : '-'}</b> <span class="muted">(${res.total}명 중)</span></div>`}
        ${res.status === 'offline' ? '<p class="bad">서버에 연결하지 못해 이번 기록은 랭킹에 오르지 못했어요.</p>' : res.status !== 'cleared' && !explore ? '<p class="bad">기록 확인에 실패해 랭킹에 오르지 못했어요.</p>' : ''}
        ${rewards ? `<div class="rewards">${rewards}</div>` : ''}
      </div>
      <div class="row center"><button class="ghost" id="clHome">처음으로</button><button class="ghost" id="clRank">랭킹 보기</button><button class="primary" id="clAgain">다시 도전</button></div>`;
    openPanel(html, 'clear');
    $('clHome').addEventListener('click', () => { closePanel(); h.onHome(); });
    $('clRank').addEventListener('click', () => { closePanel(); h.onRanking(); });
    $('clAgain').addEventListener('click', () => { closePanel(); h.onAgain(); });
  }

  function timeUp(info, h) {
    const html = `<h2>시간 종료!</h2>
      <div class="result">
        <div class="muted">${Util.esc(info.modeLabel)}</div>
        <div class="big-time">${info.parts} / ${info.total}</div>
        <div>부품을 ${info.parts}개 모았어요. 조금만 더 하면 로봇 교장선생님을 구할 수 있어요!</div>
      </div>
      <div class="row center"><button class="ghost" id="tuHome">처음으로</button><button class="primary" id="tuAgain">다시 도전</button></div>`;
    openPanel(html, 'clear');
    $('tuHome').addEventListener('click', () => { closePanel(); h.onHome(); });
    $('tuAgain').addEventListener('click', () => { closePanel(); h.onAgain(); });
  }

  function closeAll() {
    if (dialogState) { clearInterval(dialogState.timer); dialogState = null; $('dialog').classList.add('hidden'); }
    if (modalStack) closePanel();
  }

  function confirmBox(msg, onYes) {
    openPanel(`<p class="center">${Util.esc(msg)}</p><div class="row center"><button class="ghost" id="cfNo">취소</button><button class="primary" id="cfYes">확인</button></div>`, 'confirm');
    $('cfNo').addEventListener('click', closePanel);
    $('cfYes').addEventListener('click', () => { closePanel(); onYes(); });
  }

  // 키보드: 대화 넘기기, 퀴즈 숫자키
  window.addEventListener('keydown', e => {
    if (dialogState && (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      advance();
      return;
    }
    const body = $('modalBody');
    if (modalStack && body && body._keys && !(e.target && e.target.tagName === 'INPUT')) body._keys(e);
    if (modalStack && e.key === 'Escape') {
      const close = body.querySelector('#quizClose, #nbClose, #rkClose, #dexClose, #mgClose, #sgClose');
      if (close) close.click();
    }
  });

  function bind() {
    $('dialog').addEventListener('click', advance);
    $('dlgSkip').addEventListener('click', e => { e.stopPropagation(); skipDialog(); });
  }

  return { modalOpen, dialog, quiz, quizSet, quizHintEffect, hintArea, bindHint, openPanel, notebook, sign, flow, choose, toast, hud, inventory, setTalkButton, setSoundButton, dex, ranking, character, clear, timeUp, closeAll, confirmBox, closePanel, bind, isDialog: () => !!dialogState };
})();
