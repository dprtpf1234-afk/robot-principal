// 관리자 화면 (주소 끝에 #admin)
// 기록 조회·CSV 다운로드·삭제, 랭킹 초기화, 퀴즈·대사 수정
const Admin = (() => {
  const $ = id => document.getElementById(id);
  let authed = false;
  let work = null;      // 수정 중인 콘텐츠
  let group = 'g12';
  let tab = 'records';

  function root() { return $('admin'); }
  function show(html) { root().innerHTML = html; root().classList.remove('hidden'); }

  async function open() {
    Game.stop();
    if (authed) return main();
    const has = await Store.adminHasPassword();
    show(`<div class="admin-login">
      <h2>관리자</h2>
      ${has ? '<p>관리자 비밀번호를 입력하세요.</p>' : '<p>처음 들어오셨어요. 사용할 관리자 비밀번호를 정해 주세요. (4자 이상)</p>'}
      <form id="admForm" autocomplete="off">
        <input type="password" id="admPw" placeholder="비밀번호" autocomplete="new-password">
        ${has ? '' : '<input type="password" id="admPw2" placeholder="비밀번호 다시 입력" autocomplete="new-password">'}
        <button class="primary" type="submit">${has ? '들어가기' : '비밀번호 정하기'}</button>
      </form>
      <p class="bad" id="admErr"></p>
      <button class="ghost" id="admBack">게임으로 돌아가기</button>
    </div>`);
    $('admBack').addEventListener('click', close);
    $('admForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = $('admPw').value;
      if (!has) {
        if (pw.length < 4) return ($('admErr').textContent = '4자 이상으로 정해 주세요.');
        if (pw !== $('admPw2').value) return ($('admErr').textContent = '두 비밀번호가 달라요.');
        await Store.adminSetPassword(pw);
        authed = true;
        return main();
      }
      if (await Store.adminCheck(pw)) { authed = true; main(); }
      else $('admErr').textContent = '비밀번호가 맞지 않아요.';
    });
    setTimeout(() => $('admPw').focus(), 30);
  }

  function close() {
    root().classList.add('hidden');
    root().innerHTML = '';
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
    App.toStart();
  }

  async function main() {
    show(`<div class="admin">
      <header><h2>관리자 · 로봇 교장선생님 구하기!</h2><button class="ghost" id="admOut">나가기</button></header>
      <nav class="tabs"><button data-t="records">기록 조회</button><button data-t="content">퀴즈·대사 수정</button><button data-t="reset">랭킹 초기화</button></nav>
      <section id="admBody"></section>
    </div>`);
    $('admOut').addEventListener('click', () => { authed = false; close(); });
    root().querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; renderTab(); }));
    renderTab();
  }

  function renderTab() {
    root().querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'records') records();
    else if (tab === 'content') contentEditor();
    else resetTab();
  }

  // ---------- 기록 ----------
  async function records() {
    const all = await Store.adminListRecords();
    const body = $('admBody');
    const f = { g: '', grade: '', cls: '' };
    const draw = () => {
      const rows = all.filter(r => (!f.g || Util.gradeGroup(r.grade) === f.g) && (!f.grade || r.grade == f.grade) && (!f.cls || r.cls == f.cls))
        .sort((a, b) => a.grade - b.grade || a.cls - b.cls || a.num - b.num);
      $('recTable').innerHTML = rows.length ? `<table class="rec"><thead><tr><th>학년</th><th>반</th><th>이름</th><th>최고 기록</th><th>도전</th><th>클리어</th><th>마지막 도전</th><th></th></tr></thead><tbody>` +
        rows.map(r => `<tr><td>${r.grade}</td><td>${r.cls}</td><td>${Util.esc(r.name)}</td><td>${r.bestMs != null ? Util.formatTime(r.bestMs) : '-'}</td><td>${r.tries}</td><td>${r.clears}</td><td>${r.lastAt ? new Date(r.lastAt).toLocaleString('ko-KR') : '-'}</td><td><button class="danger small" data-del="${r.id}">삭제</button></td></tr>`).join('') +
        '</tbody></table>' : '<p class="muted">기록이 없어요.</p>';
      $('recCount').textContent = `${rows.length}명`;
      $('recTable').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        const r = all.find(x => x.id === Number(b.dataset.del));
        ask(`${r.grade}학년 ${r.cls}반 ${r.name} 학생의 기록을 모두 지울까요?`, async () => {
          await Store.adminDeletePlayer(r.id);
          records();
        });
      }));
      body._rows = rows;
    };
    body.innerHTML = `<div class="filters">
        <select id="fG"><option value="">전체</option><option value="g12">1~2학년군</option><option value="g34">3~4학년군</option><option value="g56">5~6학년군</option></select>
        <select id="fGrade"><option value="">모든 학년</option>${[1, 2, 3, 4, 5, 6].map(i => `<option value="${i}">${i}학년</option>`).join('')}</select>
        <select id="fCls"><option value="">모든 반</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}반</option>`).join('')}</select>
        <span id="recCount" class="muted"></span>
        <button class="primary" id="csvBtn">CSV 다운로드</button>
        <button class="ghost" id="csvCopy">표 복사 (엑셀에 붙여넣기)</button>
        <span id="csvMsg" class="ok"></span>
      </div><div id="recTable" class="table-wrap"></div>
      ${Store.mode === 'local' ? '<p class="muted small">시험 버전: 이 기기(브라우저)에 저장된 기록만 보여요. 서버를 연결하면 모든 기기의 기록이 모입니다.</p>' : ''}`;
    $('fG').addEventListener('change', e => { f.g = e.target.value; draw(); });
    $('fGrade').addEventListener('change', e => { f.grade = e.target.value; draw(); });
    $('fCls').addEventListener('change', e => { f.cls = e.target.value; draw(); });
    const table = () => {
      const head = ['학년', '반', '이름', '최고 기록', '최고 기록(초)', '도전 횟수', '클리어 횟수', '마지막 도전'];
      return [head].concat(body._rows.map(r => [r.grade, r.cls, r.name, r.bestMs != null ? Util.formatTime(r.bestMs) : '', r.bestMs != null ? (r.bestMs / 1000).toFixed(1) : '', r.tries, r.clears, r.lastAt ? new Date(r.lastAt).toLocaleString('ko-KR') : '']));
    };
    $('csvCopy').addEventListener('click', async () => {
      const tsv = table().map(l => l.join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); $('csvMsg').textContent = '복사했어요! 엑셀에 붙여넣으세요.'; }
      catch (e) { $('csvMsg').textContent = '복사가 막혀 있어요. CSV 다운로드를 이용해 주세요.'; }
    });
    $('csvBtn').addEventListener('click', async () => {
      const csv = '﻿' + table().map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const filename = `로봇교장구하기_기록_${new Date().toISOString().slice(0, 10)}.csv`;
      // claude.ai에 올린 페이지에서는 플랫폼 저장 기능을 쓰고, 그 밖에서는 일반 다운로드
      if (window.claude && window.claude.use) {
        try {
          const dl = await window.claude.use('downloads');
          if (dl) { await dl.save({ filename, data: csv }); $('csvMsg').textContent = ''; return; }
        } catch (e) { $('csvMsg').textContent = '다운로드가 취소됐어요.'; return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    draw();
  }

  // ---------- 초기화 ----------
  function resetTab() {
    $('admBody').innerHTML = `<div class="reset-box">
      <p>모든 학생의 기록과 랭킹을 지웁니다. 되돌릴 수 없어요.</p>
      <p>계속하려면 아래 칸에 <b>초기화</b>라고 입력하세요.</p>
      <input id="resetIn" placeholder="초기화">
      <button class="danger" id="resetBtn">랭킹 초기화</button>
      <p id="resetMsg"></p></div>`;
    $('resetBtn').addEventListener('click', async () => {
      if ($('resetIn').value.trim() !== '초기화') { $('resetMsg').textContent = '"초기화"를 정확히 입력해 주세요.'; return; }
      await Store.adminResetAll();
      $('resetMsg').textContent = '모든 기록을 지웠어요.';
      $('resetIn').value = '';
    });
  }

  // ---------- 퀴즈·대사 수정 ----------
  const KIND_LABEL = { quiz: '퀴즈형', explore: '탐색+퀴즈', label: '미니게임 · AI 이름표', code: '미니게임 · 암호', robot: '미니게임 · 로봇 코딩', sort: '탐색+정렬', dark: '어두운 창고 + 전구 코딩' };
  const GAME_KEY = { label: 'label', code: 'code', robot: 'robot', sort: 'sort', dark: 'bulbs' };
  const POOL_MIN = { quiz: 3, explore: 2, reboot: 3 };

  async function contentEditor() {
    if (!work) work = Util.clone(await Store.getContent());
    const g = group, GL = Util.groupLabel(g);
    const E = Util.esc;
    const ta = (path, arr, rows) => `<textarea data-path="${path}" data-kind="lines" rows="${rows || Math.max(2, arr.length)}">${E(arr.join('\n'))}</textarea>`;
    const inp = (path, v, kind) => `<input data-path="${path}" data-kind="${kind || 'str'}" value="${E(v == null ? '' : v)}">`;
    const txt = (path, v, rows) => `<textarea data-path="${path}" data-kind="str" rows="${rows || 2}">${E(v || '')}</textarea>`;

    // 문제 하나 편집
    const qEdit = (p, q, title, delPath) => {
      let h = `<div class="q-edit"><div class="q-no">${title}${delPath ? ` <button class="ghost small" data-del-q="${delPath}">이 문제 지우기</button>` : ''}</div>
        <label>형식 <select data-path="${p}.format" data-kind="str" data-rerender="1">
          <option value="choice" ${q.format === 'choice' ? 'selected' : ''}>객관식</option>
          <option value="text" ${q.format === 'text' ? 'selected' : ''}>주관식</option>
          <option value="ox" ${q.format === 'ox' ? 'selected' : ''}>OX</option></select></label>
        <label>문제 ${txt(p + '.question', q.question)}</label>`;
      if (q.format === 'choice') {
        const ch = q.choices.length ? q.choices : ['', '', '', ''];
        h += '<div class="choices-edit">' + [0, 1, 2, 3].map(k => `<label class="ch"><input type="radio" name="r_${p}" data-path="${p}.correct" data-kind="num" value="${k}" ${Number(q.correct) === k ? 'checked' : ''}> 정답 ` +
          `<input data-path="${p}.choices.${k}" data-kind="str" value="${E(ch[k] || '')}" placeholder="보기 ${k + 1}"></label>`).join('') + '</div>';
      } else if (q.format === 'ox') {
        h += `<label>정답 <select data-path="${p}.answers" data-kind="ox"><option value="O" ${q.answers[0] === 'O' ? 'selected' : ''}>O</option><option value="X" ${q.answers[0] === 'X' ? 'selected' : ''}>X</option></select></label>`;
      } else {
        h += `<label>정답 (여러 개면 쉼표로 구분) ${inp(p + '.answers', q.answers.join(', '), 'csv')}</label>`;
      }
      h += `<label>해설 (맞힌 뒤 보여 줘요) ${txt(p + '.explain', q.explain, 2)}</label>`;
      return h + '</div>';
    };
    const poolEdit = (p, list, min, label) => `<h4>${label} <span class="muted small">(${list.length}개 · 이 중에서 무작위로 나와요, 최소 ${min}개)</span></h4>` +
      list.map((q, qi) => qEdit(`${p}.${qi}`, q, `문제 ${qi + 1}`, list.length > min ? `${p}.${qi}` : null)).join('') +
      `<div class="row"><button class="ghost small" data-add-q="${p}">+ 문제 추가</button></div>`;

    const missionCards = work.missions.map((m, i) => {
      const P = `missions.${i}`;
      let body = '';
      if (m.kind === 'quiz') body = poolEdit(`${P}.pool.${g}`, m.pool[g], POOL_MIN.quiz, `${GL} 문제 풀`);
      if (m.kind === 'explore') {
        body = `<label>단서 (한 줄에 하나, ${m.clues[g].length}개 유지) ${ta(`${P}.clues.${g}`, m.clues[g])}</label>` +
          `<h4>${GL} 단서로 푸는 문제 (항상 1번으로 나와요)</h4>` + qEdit(`${P}.first.${g}`, m.first[g], '단서 문제') +
          poolEdit(`${P}.pool.${g}`, m.pool[g], POOL_MIN.explore, `${GL} 문제 풀 (2개가 무작위로 나와요)`);
      }
      if (m.kind === 'sort') body = `<label>단서 (한 줄에 하나, ${m.clues[g].length}개 유지) ${ta(`${P}.clues.${g}`, m.clues[g])}</label>`;
      if (m.kind === 'dark') body = `<label>창고 쪽지 (한 줄에 하나, 3개 유지) ${ta(`${P}.notes.${g}`, m.notes[g], 3)}</label>`;
      const gk = GAME_KEY[m.kind];
      if (gk) body += `<label>${GL} 미니게임 설정 (고급: JSON 형식, 잘 모르면 그대로 두세요) <textarea class="json" data-path="${P}.${gk}.${g}" data-kind="json" rows="6">${E(JSON.stringify(m[gk][g], null, 1))}</textarea></label>`;
      return `<details class="card" ${i === 0 ? 'open' : ''}><summary>${m.order}. ${E(m.npc)} <span class="muted">· ${KIND_LABEL[m.kind]} · ${E(m.short)} · ${E(m.part)}</span></summary>
        <div class="grid2"><label>NPC 이름 ${inp(`${P}.npc`, m.npc)}</label><label>주는 부품 ${inp(`${P}.part`, m.part)}</label></div>
        <div class="grid2"><label>순서도에 보일 장소 이름 ${inp(`${P}.short`, m.short)}</label><label>${GL} 힌트 (💡 버튼) ${inp(`${P}.hint.${g}`, m.hint[g])}</label></div>
        <label>시작 대사 (한 줄에 한 마디) ${ta(`${P}.start`, m.start)}</label>
        <label>완료 대사 ${ta(`${P}.end`, m.end)}</label>${body}</details>`;
    }).join('');

    const R = work.reboot;
    const rebootCard = `<details class="card"><summary>마지막 · 로봇 교장선생님 재부팅 <span class="muted">· OX 3문제</span></summary>
      <label>재부팅 전 대사 ${ta('reboot.start', R.start)}</label>${poolEdit(`reboot.pool.${g}`, R.pool[g], POOL_MIN.reboot, `${GL} 재부팅 문제 풀`)}</details>`;

    const sideCards = work.sides.map((s, i) => `<details class="card"><summary>서브 ${s.id}. ${E(s.npc)} <span class="muted">· 힌트 토큰 +${s.reward || 2} · ${s.hintFor}번 미션 비밀 힌트</span></summary>
        <label>NPC 이름 ${inp(`sides.${i}.npc`, s.npc)}</label>
        <label>시작 대사 ${ta(`sides.${i}.start`, s.start)}</label>
        <label>완료 대사 ${ta(`sides.${i}.end`, s.end)}</label>
        ${s.kind === 'collect' ? '<p class="muted small">반창고 3개 모으기 미션 (문제 없음)</p>' : `<label>문제 ${txt(`sides.${i}.question`, s.question)}</label>
        <label>정답 ${s.kind === 'ox' ? '(O 또는 X)' : '(여러 개면 쉼표로 구분)'} ${inp(`sides.${i}.answers`, s.answers.join(', '), 'csv')}</label>`}
        <label>${GL} 비밀 힌트 ${inp(`sides.${i}.hint.${g}`, s.hint[g])}</label></details>`).join('');

    const signCards = `<details class="card"><summary>i 팻말 내용</summary>${Object.keys(work.signs).map(k => `<div class="q-edit"><label>제목 ${inp(`signs.${k}.title`, work.signs[k].title)}</label><label>내용 ${txt(`signs.${k}.text`, work.signs[k].text, 4)}</label></div>`).join('')}</details>`;

    const amb = { outdoor: '바깥', hall: '복도', classroom: '교실', cafeteria: '급식실' };
    const etcCards = `<details class="card"><summary>기본 정보 · 수집품 · 잠긴 문</summary>
        <label>첫 화면 오른쪽 아래 만든이 ${inp('credit', work.credit)}</label>
        <div class="grid2"><label>수집품 이름 ${inp('collect.name', work.collect.name)}</label><label>다 모으면 받는 배지 ${inp('collect.badge', work.collect.badge)}</label></div>
        <div class="grid2"><label>수집품 칭호 ${inp('collect.title', work.collect.title)}</label><label>도감 완성 칭호 ${inp('dexTitle', work.dexTitle)}</label></div>
        ${Object.keys(work.locks).map(k => `<label>잠긴 문 안내 · ${E(work.items[k].name)} ${inp('locks.' + k, work.locks[k])}</label>`).join('')}
      </details>
      <details class="card"><summary>분위기 NPC 대사</summary>${Object.keys(amb).map(k => `<label>${amb[k]} (한 줄에 하나) ${ta('ambient.' + k, work.ambient[k], 4)}</label>`).join('')}</details>
      <details class="card"><summary>오프닝·엔딩·공통 대사</summary>
        <label>문제 규칙 안내 (퀴즈 창 위쪽) ${inp('common.rule', work.common.rule || '')}</label>
        <label>틀렸을 때 (처음부터 다시) ${inp('common.restart', work.common.restart || '')}</label>
        <label>아직 차례가 아닐 때 ({next} = 먼저 만나야 할 NPC) ${inp('common.notYet', work.common.notYet)}</label>
        <label>이미 끝낸 NPC ${inp('common.already', work.common.already)}</label>
        <label>단서를 덜 찾았을 때 ${inp('common.notReady', work.common.notReady)}</label>
        <label>오답일 때 (한 줄에 하나) ${ta('common.wrong', work.common.wrong)}</label>
        <p class="muted small">오프닝·엔딩 대사는 "이름: 대사" 형식으로 한 줄에 하나. {name} = 학생 이름</p>
        <label>오프닝 <textarea data-path="opening" data-kind="who-lines" rows="5">${E(work.opening.map(l => (l.who ? l.who + ': ' : '') + l.text).join('\n'))}</textarea></label>
        <label>엔딩 <textarea data-path="ending" data-kind="who-lines" rows="3">${E(work.ending.map(l => (l.who ? l.who + ': ' : '') + l.text).join('\n'))}</textarea></label>
      </details>`;

    $('admBody').innerHTML = `<div class="content-bar">
        <div class="tabs small">${Util.GROUPS.map(k => `<button data-g="${k}" class="${g === k ? 'on' : ''}">${Util.groupLabel(k)} 문제</button>`).join('')}</div>
        <span id="saveMsg" class="muted"></span>
        <button class="ghost" id="cDefault">처음 값으로 되돌리기</button>
        <button class="primary" id="cSave">저장</button>
      </div>
      <p class="muted small">대사·NPC 이름은 모든 학년군이 함께 써요. 문제·정답·단서·힌트·미니게임만 학년군별로 따로예요. 퀴즈는 문제 풀에서 무작위로 3개가 나오고, 틀리면 새로 뽑아 처음부터 풀어요. 저장하면 새로 시작하는 학생부터 바뀐 내용이 나와요.</p>
      <h3>메인 미션</h3>${missionCards}${rebootCard}<h3>서브 미션 (힌트 토큰 +2)</h3>${sideCards}<h3>기타</h3>${signCards}${etcCards}`;

    const body = $('admBody');
    const dirty = () => { $('saveMsg').textContent = '저장하지 않은 변경이 있어요'; $('saveMsg').className = 'muted'; };
    body.querySelectorAll('.content-bar .tabs button').forEach(b => b.addEventListener('click', () => { group = b.dataset.g; contentEditor(); }));
    body.querySelectorAll('[data-path]').forEach(el => {
      const ev = el.tagName === 'SELECT' || el.type === 'radio' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        if (el.dataset.kind === 'json') {
          try { setPath(work, el.dataset.path, JSON.parse(el.value)); el.classList.remove('bad-json'); }
          catch (e) { el.classList.add('bad-json'); $('saveMsg').textContent = 'JSON 형식이 맞지 않아요 (빨간 칸)'; $('saveMsg').className = 'bad'; return; }
        } else setPath(work, el.dataset.path, parse(el));
        dirty();
        if (el.dataset.rerender) {
          const q = getPath(work, el.dataset.path.replace(/\.format$/, ''));
          if (q.format === 'choice' && q.choices.length < 4) q.choices = ['', '', '', ''];
          if (q.format === 'ox' && !/^[OX]$/.test(q.answers[0] || '')) q.answers = ['O'];
          if (q.format === 'text' && /^[OX]$/.test(q.answers[0] || '')) q.answers = [];
          contentEditor();
        }
      });
    });
    body.querySelectorAll('[data-add-q]').forEach(b => b.addEventListener('click', () => {
      getPath(work, b.dataset.addQ).push({ format: 'choice', question: '', choices: ['', '', '', ''], correct: 0, answers: [], explain: '' });
      dirty(); contentEditor();
    }));
    body.querySelectorAll('[data-del-q]').forEach(b => b.addEventListener('click', () => {
      const path = b.dataset.delQ, idx = Number(path.split('.').pop());
      getPath(work, path.split('.').slice(0, -1).join('.')).splice(idx, 1);
      dirty(); contentEditor();
    }));
    $('cSave').addEventListener('click', async () => {
      if (body.querySelector('.bad-json')) { $('saveMsg').textContent = 'JSON 형식이 맞지 않는 칸이 있어요.'; $('saveMsg').className = 'bad'; return; }
      const err = validate(work);
      if (err) { $('saveMsg').textContent = err; $('saveMsg').className = 'bad'; return; }
      await Store.adminSaveContent(work);
      $('saveMsg').textContent = '저장했어요!';
      $('saveMsg').className = 'ok';
    });
    $('cDefault').addEventListener('click', async () => {
      ask('퀴즈·대사를 모두 처음 값으로 되돌릴까요?', async () => {
        await Store.adminResetContent();
        work = Util.clone(DEFAULT_CONTENT);
        contentEditor();
      });
    });
  }

  // 브라우저 확인창(confirm)을 쓸 수 없는 곳이 있어 화면 안에 직접 띄운다
  function ask(msg, onYes) {
    const box = document.createElement('div');
    box.className = 'admin-ask';
    box.innerHTML = `<div class="panel"><p>${Util.esc(msg)}</p><div class="row end"><button class="ghost" data-a="no">취소</button><button class="danger" data-a="yes">확인</button></div></div>`;
    root().appendChild(box);
    box.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (!a) return;
      box.remove();
      if (a === 'yes') onYes();
    });
  }

  function parse(el) {
    const v = el.value;
    switch (el.dataset.kind) {
      case 'lines': return v.split('\n').map(s => s.trim()).filter(Boolean);
      case 'csv': return v.split(',').map(s => s.trim()).filter(Boolean);
      case 'num': return Number(v);
      case 'ox': return [v];
      case 'who-lines': return v.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^([^:：]{1,12})[:：]\s*(.+)$/);
        return m ? { who: m[1].trim(), text: m[2] } : { who: '', text: s };
      });
      default: return v;
    }
  }
  function getPath(o, path) { return path.split('.').reduce((a, k) => a[k], o); }
  function setPath(o, path, v) {
    const ks = path.split('.');
    const lastK = ks.pop();
    const parent = ks.reduce((a, k) => a[k], o);
    parent[lastK] = v;
  }

  function checkQ(q, label) {
    if (!String(q.question || '').trim()) return `${label}가 비어 있어요.`;
    if (q.format === 'choice') {
      if (q.choices.filter(x => x && x.trim()).length < 2) return `${label}의 보기를 2개 이상 써 주세요.`;
      if (!q.choices[q.correct] || !q.choices[q.correct].trim()) return `${label}의 정답 보기를 골라 주세요.`;
    } else if (!q.answers.length) return `${label}의 정답을 써 주세요.`;
    return null;
  }
  function validate(c) {
    const GL = Util.GROUP_NAMES;
    for (const m of c.missions) {
      if (!m.npc.trim()) return `${m.order}번 미션의 NPC 이름이 비어 있어요.`;
      if (!m.start.length || !m.end.length) return `${m.order}번 미션의 대사가 비어 있어요.`;
      for (const g of Util.GROUPS) {
        const L = `${m.order}번 미션 ${GL[g]}`;
        if (m.pool) {
          const min = POOL_MIN[m.kind];
          if (m.pool[g].length < min) return `${L} 문제 풀은 ${min}개 이상이어야 해요.`;
          for (let i = 0; i < m.pool[g].length; i++) { const e = checkQ(m.pool[g][i], `${L} 문제 ${i + 1}`); if (e) return e; }
        }
        if (m.first) { const e = checkQ(m.first[g], `${L} 단서 문제`); if (e) return e; }
        if (m.clues) {
          const need = DEFAULT_CONTENT.missions[m.order - 1].clues[g].length;
          if (m.clues[g].length !== need) return `${L} 단서는 ${need}개여야 해요. (맵에 단서 위치가 ${need}곳 있어요)`;
        }
        if (m.notes && m.notes[g].length !== 3) return `${L} 창고 쪽지는 3개여야 해요.`;
        const gk = GAME_KEY[m.kind], d0 = gk && m[gk][g];
        // 미니게임은 문제 하나 또는 여러 개(무작위로 하나가 나온다)
        if (gk && Array.isArray(d0) && !d0.length) return `${L} 미니게임 설정이 올바르지 않아요.`;
        for (const d of gk ? (Array.isArray(d0) ? d0 : [d0]) : []) {
          const bad = `${L} 미니게임 설정이 올바르지 않아요.`;
          if (!d || typeof d !== 'object') return bad;
          if (m.kind === 'label' && !(Array.isArray(d.cats) && Array.isArray(d.items) && d.items.every(it => it.a < d.cats.length && it.s < d.cats.length))) return bad;
          if (m.kind === 'code' && !(Array.isArray(d.table) && Array.isArray(d.code) && d.code.length === Array.from(String(d.answer)).length)) return bad + ' (code 개수와 answer 글자 수가 같아야 해요)';
          if (m.kind === 'robot' && !(d.w > 0 && d.h > 0 && Array.isArray(d.start) && Array.isArray(d.goal) && Array.isArray(d.walls) && d.max > 0)) return bad;
          if (m.kind === 'sort' && !(Array.isArray(d.cards) && d.cards.length >= 2 && d.cards.every(x => x.t != null && typeof x.v === 'number'))) return bad;
          if (m.kind === 'dark' && !(d.n > 0 && Array.isArray(d.program) && Mini.runBulbs(d).some(Boolean))) return bad;
        }
      }
    }
    for (const g of Util.GROUPS) {
      if (c.reboot.pool[g].length < 3) return `재부팅 ${GL[g]} 문제 풀은 3개 이상이어야 해요.`;
      for (let i = 0; i < c.reboot.pool[g].length; i++) { const e = checkQ(c.reboot.pool[g][i], `재부팅 ${GL[g]} 문제 ${i + 1}`); if (e) return e; }
    }
    for (const s of c.sides) {
      if (s.kind !== 'collect' && !s.answers.length) return `서브 ${s.id} 미션의 정답을 써 주세요.`;
    }
    return null;
  }

  return { open, close };
})();
