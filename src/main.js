// 게임 흐름: 접속 → (이어하기) → 오프닝 → 미션 순서도대로 부품 모으기 → 로봇 교장선생님 재부팅 → 클리어 → 랭킹
const App = (() => {
  const $ = id => document.getElementById(id);
  const E = Util.esc;
  let content = null;
  let session = null;   // { player, attemptId, course }
  let st = null;        // 진행 상태 (이어하기를 위해 모두 JSON으로 저장할 수 있는 값만)
  let saveTimer = 0;

  const HINT_PENALTY = 60 * 1000;   // 토큰 없이 힌트를 쓰면 +1분
  function freshState() {
    return {
      done: [],                  // 끝낸 메인 미션 번호
      started: {},               // 미션별로 시작 대사를 들었는지
      asked: {},                 // 문제·미니게임 창을 연 적이 있는지
      parts: [],
      clues: { 3: [], 6: [], 8: [] },
      clueLog: [],
      notes: [],                 // 창고 쪽지
      bandages: [],
      stars: [],
      side: {},                  // { A: 'started' | 'done' }
      hints: [],                 // 수첩에 적힌 힌트 { title, text }
      hintBought: {},
      items: [],
      tokens: 3,
      penaltyMs: 0,
      focus: null,               // 순서도에서 고른 미션
      rebooted: false,
      startedAt: 0,              // 시작 시각 (Date.now)
      running: false,
      finished: false
    };
  }
  const has = (arr, v) => arr.indexOf(v) >= 0;
  // 서버 연결이 잠깐 끊겨도 게임은 계속되도록 감싼다
  async function safe(promise, fallback) {
    try { return await promise; } catch (e) { console.warn('저장소 오류', e); return fallback; }
  }
  const G = () => session.player.group;

  // ---------------- 학생별 기록 (기기에 저장: 도감·배지) ----------------
  let dex = new Set();
  let badges = {};
  function pkey(p) { return [p.grade, p.cls, p.num, p.name].join('|'); }
  function dexKey(p) { return 'rp_dex_' + pkey(p); }
  function badgeKey(p) { return 'rp_badge_' + pkey(p); }
  function dexId(n) {
    if (n.role === 'robot') return 'robot';
    if (n.role === 'mission') return 'm' + n.def.order;
    if (n.role === 'side') return n.def.side;
    if (n.role === 'friend') return n.def.id;
    return null;
  }
  function dexEntries() {
    const all = Game.npcsAll || {};
    const find = id => { for (const k in all) { const n = all[k].find(x => x.id === id); if (n) return n; } return null; };
    const list = [];
    list.push({ id: 'robot', name: '로봇 교장선생님', place: '정문 앞', profile: content.profiles.robot, npc: find('robot') });
    content.missions.forEach(m => { const n = find('m' + m.order); list.push({ id: 'm' + m.order, name: m.npc, place: n ? n.def.place : '', profile: content.profiles['m' + m.order], npc: n }); });
    content.sides.forEach(sd => { const n = find('s' + sd.id); list.push({ id: sd.id, name: sd.npc, place: n ? n.def.place : '', profile: content.profiles[sd.id], npc: n }); });
    content.friends.filter(f => !f.secret).forEach(f => list.push({ id: f.id, name: f.name, place: f.place, profile: f.profile, npc: find(f.id) }));
    return list;
  }
  const SECRET_IDS = () => new Set(content.friends.filter(f => f.secret).map(f => f.id));
  function dexTotal() { return 1 + content.missions.length + content.sides.length + content.friends.filter(f => !f.secret).length; }
  function register(n) {
    const id = dexId(n);
    if (!id || dex.has(id) || SECRET_IDS().has(id)) return;
    dex.add(id);
    Util.storage.set(dexKey(session.player), Array.from(dex));
    updateDexButton();
    setTimeout(() => { Sound.sfx('pick'); UI.toast(`도감 등록! ${n.name} (${dex.size}/${dexTotal()})`); }, 150);
    if (dex.size >= dexTotal() && !badges.dex) {
      badges.dex = true;
      Util.storage.set(badgeKey(session.player), badges);
      st.tokens += 2;
      save(); updateHud();
      setTimeout(() => UI.dialog([line('안내', `도감 완성! 칭호 [${content.dexTitle}]를 얻고, 힌트 토큰 2개를 받았어요!`)]), 900);
    }
  }
  function updateDexButton() { $('btnDex').textContent = `도감 ${dex.size}/${content ? dexTotal() : 31}`; }
  function playerTitle() { return badges.dex ? content.dexTitle : badges.star ? content.collect.title : ''; }

  // ---------------- 전체 화면 ----------------
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  async function toggleFullscreen() {
    const root = document.documentElement;
    if (!canFullscreen()) return iosGuide();
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    } catch (err) { UI.toast('이 화면에서는 전체 화면을 쓸 수 없어요.'); }
  }
  const canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  // 아이폰·아이패드: 사파리 공유 버튼 → 홈 화면에 추가 하면 앱처럼 전체 화면으로 열린다
  function iosGuide() {
    UI.choose('전체 화면으로 하려면', `<div class="ios-guide"><div><b>1</b> 사파리 아래(또는 위)의 <b>공유 버튼</b> <span class="ios-share">⬆</span> 을 눌러요.</div><div><b>2</b> <b>홈 화면에 추가</b>를 눌러요.</div><div><b>3</b> 홈 화면에 생긴 <b>로봇 교장</b> 아이콘으로 들어오면 전체 화면이에요!</div></div>`, [{ label: '알겠어요', cls: 'primary', cb: () => {} }]);
  }

  // ---------------- 첫 화면·입장 ----------------
  const MODES = {
    m30: { label: '30분 미션', limit: 30 * 60 * 1000, desc: '미션 8개를 30분 안에! 순서도를 따라 학교 곳곳을 돌며 부품을 모아요.' },
    m10: { label: '10분 미션', limit: 10 * 60 * 1000, desc: '짧은 코스(미션 5개)를 10분 안에! 2층은 가지 않아도 돼요.' },
    free: { label: '탐험', limit: 0, desc: '시간 제한 없이 자유롭게! 잠긴 문도 모두 열려 있어요. 탐험 기록은 랭킹에 오르지 않아요.' }
  };
  const AVATAR_NAMES = ['하람', '다온', '누리', '별이', '가온', '소라', '이든', '로아'];
  const form = { grade: 0, charIdx: 0, mode: 'm30' };

  async function updateVisits() {
    try {
      const v = await Store.getVisitStats();
      $('visToday').textContent = v.today.toLocaleString('ko-KR');
      $('visTotal').textContent = v.total.toLocaleString('ko-KR');
    } catch (e) { $('visitBox').classList.add('hidden'); }
  }

  function titleMusic() {
    if ($('title').classList.contains('hidden')) return;
    Sound.init();
    Sound.playMusic('title');
  }

  function showStart() {
    updateVisits();
    Game.stop();
    $('title').classList.remove('hidden');
    titleMusic();
    $('entry').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('touchUI').classList.add('hidden');
    Store.getContent().then(c => { $('credit').textContent = c.credit || ''; });
    Title.start();
  }
  function entryOpen() { return !$('entry').classList.contains('hidden'); }
  function openEntry() {
    Sound.init();
    $('entry').classList.remove('hidden');
    $('startErr').textContent = '';
  }

  function bindStart() {
    $('gradeSeg').innerHTML = [1, 2, 3, 4, 5, 6].map(i => `<button type="button" data-g="${i}">${i}<span class="gr">학년</span></button>`).join('');
    const clsSel = $('inClass');
    for (let i = 1; i <= 10; i++) clsSel.insertAdjacentHTML('beforeend', `<option value="${i}">${i}반</option>`);
    $('avatarGrid').innerHTML = AVATAR_NAMES.map((n, i) => `<button type="button" data-c="${i}"><canvas width="32" height="32"></canvas><span>${n}</span></button>`).join('');
    $('avatarGrid').querySelectorAll('button').forEach((b, i) => {
      const c = b.querySelector('canvas').getContext('2d');
      c.drawImage(Sprites.makeChar(Sprites.PLAYER_PALETTES[i]).down[0], 0, 0);
    });

    const setGrade = gr => {
      form.grade = gr;
      $('gradeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.g) === gr));
      $('gradeNote').textContent = gr ? `${Util.groupLabel(Util.gradeGroup(gr))} 문제가 나와요` : '학년에 맞는 문제가 나와요';
    };
    const setChar = i => { form.charIdx = i; $('avatarGrid').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.c) === i)); };
    const setMode = m => { form.mode = m; $('modeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('modeDesc').textContent = MODES[m].desc; };
    $('gradeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setGrade(Number(b.dataset.g)); });
    $('avatarGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setChar(Number(b.dataset.c)); });
    $('modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });

    const saved = Util.storage.get('rp_last_player', null);
    setGrade(saved ? Number(saved.grade) : 0);
    setChar(saved && saved.charIdx != null ? saved.charIdx : 0);
    setMode(saved && MODES[saved.mode] ? saved.mode : 'm30');
    if (saved) { clsSel.value = saved.cls; $('inName').value = saved.name; }

    $('btnStart').addEventListener('click', openEntry);
    $('entryClose').addEventListener('click', () => $('entry').classList.add('hidden'));
    window.addEventListener('keydown', e => {
      if ($('title').classList.contains('hidden') || entryOpen() || UI.modalOpen() || !$('admin').classList.contains('hidden')) return;
      if (e.key === 'Tab' || e.key === 'F11' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      openEntry();
    });

    // 전체 화면: 아이폰처럼 전체 화면 기능이 없으면 홈 화면 추가 안내를 보여 준다
    if (!canFullscreen() && !isIOS()) { $('btnFull').classList.add('hidden'); $('btnFullGame').classList.add('hidden'); }
    if (standalone()) { $('btnFull').classList.add('hidden'); $('btnFullGame').classList.add('hidden'); }
    $('btnFull').addEventListener('click', toggleFullscreen);

    $('startForm').addEventListener('submit', e => {
      e.preventDefault();
      // 번호는 받지 않는다 (기록 서버 형식에 맞춰 1로 둔다)
      const grade = form.grade, cls = Number(clsSel.value), num = 1;
      const name = $('inName').value.replace(/\s+/g, '');
      const err = $('startErr');
      if (!grade) return (err.textContent = '학년을 골라 주세요.');
      if (!cls) return (err.textContent = '반을 골라 주세요.');
      const bad = Util.checkName(name);
      if (bad) { $('inName').focus(); return (err.textContent = bad); }
      err.textContent = '';
      const player = { grade, cls, num, name, group: Util.gradeGroup(grade), charIdx: form.charIdx, mode: form.mode };
      Util.storage.set('rp_last_player', { grade, cls, num, name, charIdx: form.charIdx, mode: form.mode });
      enter(player);
    });
    $('btnRankStart').addEventListener('click', () => UI.ranking(form.grade ? Util.gradeGroup(form.grade) : 'g12'));
  }

  // ---------------- 이어하기 저장 ----------------
  function saveKey(p) { return 'rp_save_v4_' + pkey(p) + '|' + p.mode; }
  function save() {
    if (!st || !session || !session.attemptId || st.finished) return;
    const p = Game.player, m = Game.map;
    Util.storage.set(saveKey(session.player), { attemptId: session.attemptId, charIdx: session.player.charIdx, st, map: m ? m.id : 'outdoor', x: p ? p.x : 0, y: p ? p.y : 0, lay: World.LAYOUT, savedAt: Date.now() });
  }
  function clearSave(p) { Util.storage.remove(saveKey(p)); }
  function elapsed() { return st.startedAt ? Date.now() - st.startedAt + st.penaltyMs : 0; }

  // 입장: 같은 학생·같은 모드로 하던 도전이 있으면 이어할지 묻는다
  async function enter(player) {
    const sv = Util.storage.get(saveKey(player), null);
    if (sv && sv.st && !sv.st.finished) {
      const a = await safe(Store.getAttempt(sv.attemptId), null);
      const lim = MODES[player.mode].limit;
      const used = Date.now() - sv.st.startedAt + (sv.st.penaltyMs || 0);
      if (a && a.status === 'playing' && (!lim || used < lim)) {
        const left = lim ? `남은 시간 <b>${Util.formatTime(lim - used)}</b>` : `탐험한 시간 <b>${Util.formatTime(used)}</b>`;
        UI.choose('이어서 할까요?', `${E(player.name)} 탐험가의 ${MODES[player.mode].label} 기록이 남아 있어요.<br>부품 <b>${sv.st.parts.length}</b>개 · ${left}<br><span class="muted small">이어서 하면 남은 시간이 계속 줄어들어요.</span>`, [
          { label: '처음부터', cb: async () => { await safe(Store.abandonAttempt(sv.attemptId)); clearSave(player); begin(player); } },
          { label: '이어하기', cls: 'primary', cb: () => begin(Object.assign({}, player, { charIdx: sv.charIdx != null ? sv.charIdx : player.charIdx }), sv) }
        ]);
        return;
      }
      clearSave(player);
    }
    begin(player);
  }

  async function begin(player, resume) {
    content = await Store.getContent();
    player.group = Util.gradeGroup(player.grade);   // 예전 저장(저학년·고학년)도 새 학년군으로
    session = { player, attemptId: resume ? resume.attemptId : null, course: Util.course(player.mode) };
    st = resume ? Object.assign(freshState(), resume.st) : freshState();
    for (const k of [3, 6, 8]) if (!st.clues[k]) st.clues[k] = [];
    dex = new Set(Util.storage.get(dexKey(player), []).filter(id => !SECRET_IDS().has(id)));
    badges = Util.storage.get(badgeKey(player), {});
    updateDexButton();
    Title.stop();
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('touchUI').classList.toggle('hidden', !Game.isTouch());
    Game.newGame({ player, content }); Game.resetRobot();
    // 개나리 꽃 자리는 판마다 새로 정한다 (이어하기는 같은 자리)
    if (!st.starSeed) st.starSeed = 1 + Math.floor(Math.random() * 2147483646);
    Game.scatterStars(st.starSeed);
    applyWorldState();
    applyStarPerks(false);
    if (resume) {
      // 예전 지도(동네를 붙이기 전)에서 저장한 바깥 자리는 늘어난 만큼 옮긴다
      const shift = resume.map === 'outdoor' && resume.lay !== World.LAYOUT;
      Game.restore(resume.map, resume.x + (shift ? World.EXT.l * World.T : 0), resume.y + (shift ? World.EXT.t * World.T : 0));
      st.running = true;
      updateHud();
      UI.toast('이어서 시작! 지난번 자리에서 계속해요.');
      return;
    }
    updateHud();
    const img = Sprites.makeChar(Sprites.PLAYER_PALETTES[player.charIdx]).down[0];
    UI.character(img, player.name, MODES[player.mode].label, () => {
      UI.dialog(content.opening, async () => {
        const r = await safe(Store.startAttempt(player), null);
        session.attemptId = r ? r.attemptId : null;
        if (!r) UI.toast('서버에 연결하지 못했어요. 이번 기록은 랭킹에 오르지 않아요.');
        updateVisits();
        st.startedAt = Date.now();
        st.running = true;
        save();
        const lim = MODES[player.mode].limit;
        UI.toast(lim ? `제한 시간 ${lim / 60000}분! 정문의 지킴이 선생님부터 만나 보세요.` : '탐험 시작! 정문의 지킴이 선생님부터 만나 보세요.');
      });
    }, session.course.list.length);
  }

  // 저장된 진행 상태를 맵에 반영 (주운 물건 숨기기, 잠긴 문 열기)
  function applyWorldState() {
    for (const id in Game.maps) for (const o of Game.maps[id].objects) {
      const it = o.interact;
      if (!it) continue;
      if (it.type === 'bandage') o.hidden = has(st.bandages, it.i);
      if (it.type === 'star') o.hidden = has(st.stars, it.i);
      if (it.type === 'note') o.hidden = has(st.notes, it.i);
    }
    if (st.secretOpen) openSecret(false);
    refreshLocks();
  }

  // ---------- 비밀 공간: 조례대 앞에서 세 번 뛰면 뚜껑이 열린다 ----------
  let secretJumps = [], secretArmedAt = 0;
  function onJumped(mapId, x, y) {
    if (!session || !st || st.secretOpen || mapId !== 'outdoor') return;
    const hs = Game.maps.outdoor.secretHatch;
    if (!hs || Math.hypot(x - hs.podium[0], y - hs.podium[1]) > 4) { secretJumps = []; return; }
    // 연속 점프만 센다: 착지(약 0.56초) 후 곧바로 다시 뛰고, 제자리에서(1칸 이내) 뛰어야 한다
    const now = performance.now(), last = secretJumps[secretJumps.length - 1];
    if (last && (now - last.t > 1200 || Math.hypot(x - last.x, y - last.y) > 1)) secretJumps = [];
    secretJumps.push({ t: now, x, y });
    if (secretJumps.length >= 3) { secretJumps = []; secretArmedAt = now; }   // 이제 조례대를 살펴보면 열린다
  }
  function openSecret(announce) {
    const m = Game.maps.outdoor, hs = m.secretHatch;
    if (!hs) return;
    st.secretOpen = true;
    for (const o of m.objects) if (o.secret) o.hidden = false;
    if (!m.warps.some(w => w.to === 'dev')) m.warps.push({ x: hs.x, y: hs.y, to: 'dev', ax: 9.5, ay: 10.2, dir: 'up', lock: null, wait: !!announce });
    if (announce) {
      Sound.sfx('clear');
      Game.celebrate && Game.celebrate();
      UI.toast('덜컹! 조례대 앞 땅에 비밀 뚜껑이 열렸어요…');
      save();
    }
  }
  function enteredSecret() {
    if (!st || st.secretFound) return;
    st.secretFound = true;
    save();
    Sound.sfx('clear');
    UI.dialog([
      line('안내', '🔑 비밀 공간 발견! 이곳은 이 게임을 만든 개발자 허남웅 선생님의 방이에요.'),
      line('안내', '방 안의 포스터·화이트보드·오락기를 살펴보고, 허남웅 선생님께 말을 걸어 보세요. 비밀 방에 있는 동안에도 시간은 흘러요!')
    ]);
  }
  function unlocked(key) { return session.player.mode === 'free' || has(st.items, key); }
  function refreshLocks() {
    for (const id in Game.maps) for (const o of Game.maps[id].objects) {
      if (o.interact && o.interact.type === 'lock') o.hidden = unlocked(o.interact.key);
    }
    Game.refreshMinimap();
  }
  function giveItems(keys) {
    const got = [];
    for (const k of keys || []) if (!has(st.items, k)) { st.items.push(k); got.push(content.items[k].name); }
    refreshLocks();
    if (got.length) setTimeout(() => UI.toast(`가방에 넣었어요: ${got.join(', ')}`), 400);
  }

  // ---------------- 코스·순서 ----------------
  const isDone = o => has(st.done, o);
  const inCourse = o => session.course.has(o);
  const available = o => inCourse(o) && !isDone(o) && session.course.prereq[o].every(isDone);
  const allDone = () => session.course.list.every(isDone);
  function focusMission() {
    if (st.focus && available(st.focus)) return st.focus;
    return session.course.list.find(available) || null;
  }

  // ---------------- 힌트 토큰 ----------------
  function useHint(key, title, text) {
    if (st.hintBought[key]) return true;
    if (st.tokens > 0) { st.tokens--; UI.toast(`힌트 토큰을 1개 썼어요. (남은 토큰 ${st.tokens}개)`); }
    else { st.penaltyMs += HINT_PENALTY; UI.toast('토큰이 없어서 기록에 1분이 더해졌어요.'); }
    st.hintBought[key] = true;
    if (text) st.hints.push({ title, text });
    save(); updateHud();
    return true;
  }
  function makeHint(key, title, text, effect) {
    return {
      bought: !!st.hintBought[key], text, effect,
      label: () => (st.tokens > 0 ? `토큰 1개 (남은 ${st.tokens}개)` : '토큰 없음 · 기록 +1분'),
      use: () => useHint(key, title, text)
    };
  }
  function missionHint(m) {
    return makeHint('m' + m.order, `${m.order}번 ${m.short}`, m.hint[G()]);
  }

  // ---------------- 상호작용 ----------------
  function interact(t) {
    if (!st || st.finished) return;
    if (t.type === 'npc') talk(t.npc);
    else inspect(t.obj);
  }

  function line(who, text) { return { who, text }; }
  function lines(who, arr) { return arr.map(t => line(who, t)); }
  function nameList(names) {
    if (!names.length) return '';
    const last = names[names.length - 1];
    return names.slice(0, -1).map(n => Util.josa(n, '과/와') + ' ').join('') + Util.josa(last, '을/를');
  }
  function fill(text) { return text.replace('{name}', session.player.name).replace('{name}', session.player.name); }
  function wrongLine() { const w = content.common.wrong; return w[Math.floor(Math.random() * w.length)]; }
  function pick(list, n) { return Util.shuffle(list).slice(0, n); }

  function talk(n) {
    Game.facePlayer(n);
    if (n.role !== 'ambient') register(n);
    if (n.role === 'friend') {
      const f = content.friends.find(x => x.id === n.def.id);
      UI.dialog([line(f.name, f.line)]);
      return;
    }
    if (n.role === 'robot') return talkRobot();
    if (n.role === 'teacher') {
      const pool = n.def.lines || content.homeroom || ['안녕! 로봇 교장선생님을 꼭 고쳐 주렴.'];
      const text = pool[Math.floor(Math.random() * pool.length)].replace(/\{cls\}/g, n.def.cls).replace(/\{name\}/g, session.player.name);
      UI.dialog([line(n.name, text)]);
      return;
    }
    if (n.role === 'ambient') {
      const pool = content.ambient[n.key] || content.ambient.hall;
      const text = pool[Math.floor(Math.random() * pool.length)];
      UI.dialog([line(n.name || '친구', text)]);
      return;
    }
    if (n.role === 'mission') return talkMission(n);
    if (n.role === 'side') return talkSide(n);
  }

  function talkMission(n) {
    const o = n.def.order;
    const m = content.missions[o - 1];
    if (!inCourse(o)) return UI.dialog([line(m.npc, '오늘 코스에서는 나를 만나지 않아도 된단다. 순서도에 있는 곳으로 가 보렴!')]);
    if (isDone(o)) return UI.dialog([line(m.npc, content.common.already)]);
    if (!available(o)) {
      const need = session.course.prereq[o].filter(x => !isDone(x)).map(x => content.missions[x - 1].npc);
      return UI.dialog([line(m.npc, content.common.notYet.replace('{next}', nameList(need)).replace(/\{next\}\s*/, ''))]);
    }
    const first = !st.started[o];
    st.started[o] = true;
    st.focus = o;
    save();
    const again = text => [line(m.npc, text)];

    if (m.kind === 'explore' || m.kind === 'sort') {
      const need = m.clues[G()].length, found = st.clues[o].length;
      if (found < need) {
        const msg = first ? lines(m.npc, m.start) : [line(m.npc, content.common.notReady + ` (단서 ${found}/${need})`)];
        UI.dialog(msg, () => { if (first) UI.toast('단서를 찾아보세요! 반짝이는 곳을 살펴보세요.'); updateHud(); });
        return;
      }
      const intro = first ? lines(m.npc, m.start) : again(m.kind === 'explore' ? '단서를 다 찾았구나! 그럼 문제 3개를 풀어 볼래? 한 번에 다 맞혀야 해!' : '숫자를 다 찾았구나! 자물쇠를 열어 보자.');
      return UI.dialog(intro, () => (m.kind === 'explore' ? askQuiz(m) : openMini(m)));
    }
    if (m.kind === 'dark') {
      if (first) {
        return UI.dialog(lines(m.npc, m.start), () => { giveItems(m.gives); save(); updateHud(); UI.toast('본관 4층 AI 스마트존으로 가요! 손전등은 자동으로 켜져요.'); });
      }
      const nn = st.notes.length;
      return UI.dialog(again(nn < 3 ? `AI 스마트존은 본관 4층에 있어요. 손전등으로 쪽지 3장을 찾아 주세요! (쪽지 ${nn}/3)` : '쪽지를 다 찾았군요! AI 스마트존 안쪽 단말기에서 AI 칩을 꺼내 주세요.'));
    }
    const intro = first ? lines(m.npc, m.start) : again(m.kind === 'quiz' ? '다시 도전해 볼래? 3문제를 한 번에 맞혀야 해!' : '다시 도전해 볼래? 천천히 해 보렴!');
    UI.dialog(intro, () => (m.kind === 'quiz' ? askQuiz(m) : openMini(m)));
  }

  // 퀴즈: quiz는 문제 풀에서 3개, explore는 단서 문제 + 풀에서 2개. 틀리면 새로 뽑아 1번부터.
  function quizList(m) {
    const g = G();
    if (m.kind === 'explore') return [m.first[g]].concat(pick(m.pool[g], 2));
    return pick(m.pool[g], 3);
  }
  function quizHint(prefix) {
    return q => makeHint(prefix + ':' + q.question, '', '', UI.quizHintEffect(q));
  }
  function askQuiz(m) {
    st.asked[m.order] = true;
    UI.quizSet(quizList(m), m.npc, {
      wrongLine,
      rule: content.common.rule,
      restartLine: content.common.restart,
      repick: () => quizList(m),
      hintFor: quizHint('q' + m.order),
      onCorrect: () => completeMission(m),
      onClose: () => { UI.toast('준비되면 다시 말을 걸어 주세요.'); updateHud(); }
    });
    updateHud();
  }

  function openMini(m) {
    st.asked[m.order] = true;
    updateHud();
    const g = G();
    const h = { hint: missionHint(m), onSuccess: () => completeMission(m), onClose: () => { UI.toast('준비되면 다시 말을 걸어 주세요.'); updateHud(); } };
    // 미니게임은 여러 문제(배열) 중 하나를 무작위로 낸다. 이름표는 사진 순서와 틀린 이름표를 매번 새로 섞는다.
    const one = v => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);
    if (m.kind === 'label') Mini.label(miniCfg = shuffleLabel(one(m.label[g])), m.npc, h);
    else if (m.kind === 'code') Mini.code(miniCfg = one(m.code[g]), m.npc, h);
    else if (m.kind === 'robot') Mini.robot(miniCfg = one(m.robot[g]), m.npc, h);
    else if (m.kind === 'sort') Mini.sort(miniCfg = one(m.sort[g]), m.npc, h);
    else if (m.kind === 'dark') Mini.bulbs(miniCfg = one(m.bulbs[g]), 'AI 스마트존 단말기', Object.assign(h, { onClose: () => {} }));
  }
  let miniCfg = null;
  function shuffleLabel(d) {
    const n = d.cats.length;
    const items = Util.shuffle(d.items.map(it => Object.assign({}, it)));
    for (const it of items) it.s = Math.random() < 0.45 ? it.a : (it.a + 1 + Math.floor(Math.random() * (n - 1))) % n;
    // 틀린 이름표가 적어도 3장은 있게
    for (let i = 0; items.filter(x => x.s !== x.a).length < Math.min(3, items.length); i++) { const it = items[i]; if (it.s === it.a) it.s = (it.a + 1) % n; }
    return Object.assign({}, d, { items });
  }

  // 개나리를 다 모으면 개나리 운동화: 이동 속도가 빨라진다
  function applyStarPerks(fx) {
    const C = content.collect;
    const on = st.stars.length >= C.total;
    Game.setSpeed(on ? C.speed || 1.2 : 1);
    if (on && fx) Game.celebrate(Game.player.x, Game.player.y - 8);
  }

  async function completeMission(m) {
    if (isDone(m.order)) return;
    if (session.attemptId) await safe(Store.completeStep(session.attemptId, m.order), false);
    st.done.push(m.order);
    st.parts.push(m.part);
    if (st.focus === m.order) st.focus = null;
    Sound.sfx('part');
    if (m.kind !== 'dark') giveItems(m.gives);
    save();
    updateHud();
    const who = m.kind === 'dark' ? m.npc + ' (무전)' : m.npc;
    UI.dialog(lines(who, m.end), () => {
      UI.toast(`부품 획득: ${m.part} (${st.parts.length}/${session.course.list.length})`);
      if (allDone()) setTimeout(() => UI.dialog([line('안내', '부품을 모두 모았어요! 정문의 로봇 교장선생님께 가서 재부팅해 주세요!')]), 900);
    });
  }

  // 마지막: 로봇 교장선생님 재부팅 (디지털 시민 OX 3문제)
  function talkRobot() {
    const R = content.reboot;
    if (st.rebooted) return UI.dialog([line(R.npc, '삐빅! 고마워요! 다시 움직일 수 있어요!')]);
    if (!allDone()) return UI.dialog([line(R.npc, `삐…삐빅… 부품이… 필요…해… (${st.parts.length}/${session.course.list.length})`)]);
    const list = () => pick(R.pool[G()], 3);
    UI.dialog(lines(R.npc, R.start), () => {
      UI.quizSet(list(), R.npc, {
        wrongLine, rule: content.common.rule, restartLine: content.common.restart,
        repick: list, hintFor: quizHint('reboot'),
        onCorrect: () => finish(),
        onClose: () => UI.toast('준비되면 다시 로봇 교장선생님께 말을 걸어 주세요.')
      });
    });
  }

  function talkSide(n) {
    const s = content.sides.find(x => x.id === n.def.side);
    const state = st.side[s.id];
    if (state === 'done') return UI.dialog([line(s.npc, '힌트는 수첩에 적어 뒀어! 화면 오른쪽의 수첩 버튼을 눌러 봐.')]);
    if (s.kind === 'collect') {
      if (st.bandages.length >= 3) return UI.dialog([line(s.npc, '반창고를 다 찾아왔구나!')], () => sideDone(s));
      if (!state) { st.side[s.id] = 'started'; save(); return UI.dialog(lines(s.npc, s.start)); }
      return UI.dialog([line(s.npc, `반창고 ${st.bandages.length}/3개 찾았구나. 조금만 더 찾아보렴!`)]);
    }
    const intro = state ? [line(s.npc, '다시 도전해 볼래?')] : lines(s.npc, s.start);
    st.side[s.id] = 'started';
    UI.dialog(intro, () => {
      const q = { format: s.kind === 'ox' ? 'ox' : 'text', question: s.question, answers: s.answers, choices: [], correct: 0 };
      UI.quiz(q, s.npc, { wrongLine, onCorrect: () => sideDone(s), onClose: () => {} });
    });
  }

  function sideDone(s) {
    st.side[s.id] = 'done';
    st.tokens += s.reward || 2;
    const m = content.missions[s.hintFor - 1];
    st.hints.push({ title: `${s.hintFor}번 ${m.short} 비밀 힌트 (${s.npc})`, text: s.hint[G()] });
    save(); updateHud();
    UI.dialog(lines(s.npc, s.end), () => { Sound.sfx('pick'); UI.toast(`힌트 토큰 +${s.reward || 2}! 수첩에 ${s.hintFor}번 미션 힌트도 추가됐어요.`); });
  }

  function inspect(o) {
    const it = o.interact;
    const g = G();
    // 비밀: 조례대 앞에서 연속 3번 점프한 뒤 10초 안에 조례대를 살펴보면 뚜껑이 열린다
    if (o.kind === 'podium' && st && !st.secretOpen && secretArmedAt && performance.now() - secretArmedAt < 10000) {
      secretArmedAt = 0; openSecret(true); return;
    }
    if (it.type === 'clue') {
      const m = content.missions[it.m - 1];
      const list = m.clues[g] || [];
      const text = list[it.i];
      if (!text) return UI.dialog([line(it.name, '특별한 건 없어 보인다.')]);
      if (!inCourse(it.m) || !st.started[it.m]) return UI.dialog([line(it.name, it.m === 6 ? '표지판에 무언가 적혀 있다. 체육 선생님이 찾고 계셨던 것 같은데…' : '빨간 책장이다. 사서 선생님이 무언가 숨겨 두셨다던데…')]);
      const isNew = !has(st.clues[it.m], it.i);
      if (isNew) { st.clues[it.m].push(it.i); st.clueLog.push(text); Sound.sfx('pick'); save(); }
      const count = `(단서 ${st.clues[it.m].length}/${list.length})`;
      UI.dialog([line(it.name, text + (isNew ? ' ' + count : ''))], () => {
        updateHud();
        if (isNew && st.clues[it.m].length === list.length) UI.toast(`단서를 다 찾았어요! ${m.npc}에게 돌아가요.`);
      });
      return;
    }
    if (it.type === 'bandage') {
      st.bandages.push(it.i);
      o.hidden = true;
      Sound.sfx('pick');
      save();
      UI.toast(`반창고를 주웠다! (${st.bandages.length}/3)`);
      return;
    }
    if (it.type === 'star') {
      if (has(st.stars, it.i)) return;
      st.stars.push(it.i);
      o.hidden = true;
      Sound.sfx('pick');
      const C = content.collect, n = st.stars.length;
      if (n >= C.total) {
        st.tokens += 1;
        const firstBadge = !badges.star;
        badges.star = true;
        Util.storage.set(badgeKey(session.player), badges);
        applyStarPerks(true);
        UI.dialog([line('안내', `${C.name} ${C.total}송이를 모두 모았어요! 힌트 토큰 +1, 그리고 [${C.shoes}]을 신었어요. 이제 이동 속도가 ${Math.round((C.speed - 1) * 100)}% 빨라져요!` + (firstBadge ? ` · [${C.badge}]와 칭호 [${C.title}]도 얻었어요!` : ''))]);
      } else if ((C.milestones || []).includes(n)) {
        st.tokens += 1;
        UI.dialog([line('안내', `${C.name} ${n}송이 달성! 힌트 토큰 +1 (토큰이 있으면 힌트를 써도 시간이 늘지 않아요). ${C.total}송이를 다 모으면 [${C.shoes}]을 받아 더 빨리 달릴 수 있어요!`)]);
      } else UI.toast(`우리 학교 교화인 ${Util.josa(C.name, '을/를')} 찾았다! (${n}/${C.total})`);
      save(); updateHud();
      return;
    }
    if (it.type === 'secret') {
      UI.dialog([line('안내', '뚜껑 아래로 사다리가 이어져 있어요. 뚜껑 위로 걸어가면 내려갈 수 있어요.')]);
      return;
    }
    if (it.type === 'sign') {
      const sg = content.signs[it.id];
      if (sg) UI.sign(sg.title, sg.text, it.id === 'symbol' ? Sprites.EMBLEM.src : null);
      return;
    }
    if (it.type === 'mirror') {
      return UI.choose('거울 속의 나', '거울에 비친 모습을 바꿔 볼까요?', [
        { label: '그대로', cb: () => {} },
        { label: '다른 모습으로', cls: 'primary', cb: () => {
          session.player.charIdx = (session.player.charIdx + 1) % Sprites.PLAYER_PALETTES.length;
          Game.setLook(session.player.charIdx);
          Sound.sfx('pick');
          UI.toast(`${AVATAR_NAMES[session.player.charIdx]} 모습으로 바뀌었어요!`);
          save();
        } }
      ]);
    }
    if (it.type === 'lock') {
      Sound.sfx('wrong');
      return UI.dialog([line('', content.locks[it.key])]);
    }
    if (it.type === 'note') {
      const m = content.missions[6];
      const text = m.notes[g][it.i];
      if (!has(st.notes, it.i)) { st.notes.push(it.i); st.clueLog.push(text); o.hidden = true; Sound.sfx('pick'); save(); }
      UI.dialog([line('쪽지', text + ` (쪽지 ${st.notes.length}/3)`)], () => {
        updateHud();
        if (st.notes.length === 3) UI.toast('쪽지를 다 찾았어요! 방 안쪽 단말기로 가요.');
      });
      return;
    }
    if (it.type === 'terminal') {
      const m = content.missions[6];
      if (!inCourse(7)) return UI.dialog([line('단말기', '전원이 꺼져 있다.')]);
      if (isDone(7)) return UI.dialog([line('단말기', 'AI 칩을 이미 꺼냈다. 정문의 로봇 교장선생님께 가자!')]);
      if (!st.started[7]) return UI.dialog([line('단말기', '전원이 꺼져 있다. 1층 교장실 앞의 교무부장 선생님을 먼저 만나 보자.')]);
      if (st.notes.length < 3) return UI.dialog([line('단말기', `화면에 "쪽지 3장의 내용을 확인한 사람만 열 수 있습니다" 라고 떠 있다. (쪽지 ${st.notes.length}/3)`)]);
      return openMini(m);
    }
  }

  // ---------------- 클리어 ----------------
  async function finish() {
    st.endMs = elapsed();
    st.running = false;
    st.finished = true;
    st.rebooted = true;
    clearSave(session.player);
    Sound.sfx('clear');
    const robot = (Game.npcsAll.outdoor || []).find(n => n.role === 'robot');
    if (robot) Game.celebrate(robot.x, robot.y - 8);
    const res = (session.attemptId && await safe(Store.finishAttempt(session.attemptId, { penaltyMs: st.penaltyMs }), null)) ||
      { durationMs: st.endMs, penaltyMs: st.penaltyMs, status: 'offline', group: G(), total: 0 };
    res.modeLabel = MODES[session.player.mode].label;
    res.rewards = [];
    if (playerTitle()) res.rewards.push(`칭호 [${playerTitle()}]`);
    if (badges.star) res.rewards.push(`🌼 ${content.collect.badge}`);
    if (st.secretFound) res.rewards.push('🔑 비밀 방 발견');
    res.rewards.push(`도감 ${dex.size}/${dexTotal()}`);
    res.rewards.push(`${content.collect.name} ${st.stars.length}/${content.collect.total}`);
    const endLines = content.ending.map(l => ({ who: l.who, text: fill(l.text),
      onShow: l.transform ? () => { st.transformed = true; Sound.sfx('clear'); Game.transformRobot(); } : null }));
    updateHud();
    UI.dialog(endLines, () => {
      Game.celebrate(Game.player.x, Game.player.y - 8);
      UI.clear(res, {
        onRanking: () => UI.ranking(session.player.group, () => again()),
        onAgain: again,
        onHome: () => App.toStart()
      });
    });
  }

  // 제한 시간이 끝났을 때
  async function timeUp() {
    st.running = false;
    st.finished = true;
    clearSave(session.player);
    Sound.sfx('wrong');
    if (session.attemptId) await safe(Store.finishAttempt(session.attemptId, { timeout: true, penaltyMs: st.penaltyMs }));
    UI.closeAll();
    UI.timeUp({ parts: st.parts.length, total: session.course.list.length, modeLabel: MODES[session.player.mode].label }, {
      onAgain: again,
      onHome: () => App.toStart()
    });
  }

  function again() {
    const p = Object.assign({}, session.player, { charIdx: Math.floor(Math.random() * Sprites.PLAYER_PALETTES.length) });
    begin(p);
  }

  // ---------------- 화면 정보 ----------------
  function placeOf(o) { const d = findDef('mission', o); return d ? d.place : ''; }
  // 화면 위쪽 가운데에 보여 줄 미션 지시사항
  function missionInfo() {
    if (!st) return { html: '', pill: '' };
    const total = session.course.list.length;
    if (st.rebooted) return { html: '<b>미션 완료!</b> 로봇 교장선생님을 구했어요!', pill: `${total}/${total} 완료` };
    if (allDone()) return { html: '<b>정문 앞 광장</b>의 로봇 교장선생님께 가서 <b>재부팅</b>해요', pill: `부품 ${total}/${total} · 정문 앞 광장` };
    const o = focusMission();
    if (!o) return { html: '', pill: '' };
    const m = content.missions[o - 1];
    const pill = `부품 ${st.parts.length}/${total} · ${E(placeOf(o))}`;
    const who = `<b>${E(m.npc)}</b>`;
    const go = `${who.replace(E(m.npc), E(Util.josa(m.npc, '을/를')))} 찾아가`;
    const started = st.started[o];
    const g = G();
    switch (m.kind) {
      case 'quiz':
        return { html: started ? `${who}에게 다시 말을 걸어 <b>퀴즈 3문제를 한 번에 맞혀요</b>` : `${go} <b>퀴즈 3문제를 한 번에 맞혀요</b>`, pill };
      case 'explore':
      case 'sort': {
        if (!started) return { html: `${go} <b>미션을 받아요</b>`, pill };
        const need = m.clues[g].length, got = st.clues[o].length;
        const where = o === 3 ? '도서관 빨간 책장' : o === 8 ? '후관 3층 교실 전자칠판 세 곳(4-6·4-8·3-6)' : '표지판 네 곳(축구 골대·농구 골대·조례대·국기 게양대)';
        if (got < need) return { html: `<b>${E(where)}</b>에서 단서를 찾아요 <span class="cnt">${got}/${need}</span>`, pill };
        return { html: m.kind === 'explore' ? `단서를 다 찾았어요! ${who}에게 돌아가 <b>문제 3개를 한 번에 맞혀요</b>` : `숫자를 다 찾았어요! ${who}에게 돌아가 <b>자물쇠를 열어요</b>`, pill };
      }
      case 'label': return { html: `${started ? who + '에게 말을 걸어' : go} <b>AI 학습 사진의 이름표를 고쳐요</b>`, pill };
      case 'code': return { html: `${started ? who + '에게 말을 걸어' : go} <b>암호 신호를 풀어요</b>`, pill };
      case 'robot': return { html: `${started ? who + '에게 말을 걸어' : go} <b>로봇 코딩으로 부품을 가져와요</b>`, pill };
      case 'dark': {
        if (!started) return { html: `${go} <b>마지막 부품 이야기를 들어요</b>`, pill };
        if (st.notes.length < 3) return { html: `<b>본관 4층 AI 스마트존</b>에서 손전등으로 쪽지를 찾아요 <span class="cnt">${st.notes.length}/3</span>`, pill: `부품 ${st.parts.length}/${total} · 본관 4층 AI 스마트존` };
        return { html: 'AI 스마트존 안쪽 <b>단말기</b>에서 <b>AI 칩</b>을 꺼내요', pill: `부품 ${st.parts.length}/${total} · 본관 4층 AI 스마트존` };
      }
    }
    return { html: '', pill };
  }

  // 지금 가야 할 곳 후보: [{ mapId, x, y, kind }]
  function goalPoints() {
    if (!st || st.rebooted || !Game.maps) return [];
    const out = [];
    const npcAt = pred => { for (const id in Game.npcsAll) for (const n of Game.npcsAll[id]) if (pred(n)) out.push({ mapId: id, x: n.x, y: n.y - 20, kind: 'npc' }); };
    const objs = pred => { for (const id in Game.maps) for (const o of Game.maps[id].objects) if (o.interact && !o.hidden && pred(o.interact)) out.push({ mapId: id, x: o.hit.x + o.hit.w / 2, y: o.hit.y, kind: 'clue' }); };
    if (allDone()) { npcAt(n => n.role === 'robot'); return out; }
    const o = focusMission();
    if (!o) return out;
    const m = content.missions[o - 1];
    if ((m.kind === 'explore' || m.kind === 'sort') && st.started[o] && st.clues[o].length < m.clues[G()].length) {
      objs(it => it.type === 'clue' && it.m === o && !has(st.clues[o], it.i));
    } else if (m.kind === 'dark' && st.started[o]) {
      if (st.notes.length < 3) objs(it => it.type === 'note' && !has(st.notes, it.i));
      else objs(it => it.type === 'terminal');
    }
    if (!out.length) npcAt(n => n.role === 'mission' && n.def.order === o);
    return out;
  }

  // 노란 별 길잡이: 지금 맵에서 향해야 할 지점 (다른 맵이면 그쪽으로 가는 문·계단)
  function guideTarget() {
    if (!st || !Game.map || !Game.player) return null;
    const pts = goalPoints();
    if (!pts.length) return null;
    const T = Sprites.T, p = Game.player;
    const here = pts.filter(q => q.mapId === Game.map.id);
    if (here.length) {
      here.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      return here[0];
    }
    // 맵 사이 길 찾기 (문·계단으로 이어진 맵들)
    const prev = { [Game.map.id]: null }, q = [Game.map.id];
    while (q.length) {
      const cur = q.shift();
      for (const w of Game.maps[cur].warps) if (!(w.to in prev)) { prev[w.to] = cur; q.push(w.to); }
    }
    const goal = pts.find(x => x.mapId in prev);
    if (!goal) return null;
    let step = goal.mapId;
    while (prev[step] !== Game.map.id) step = prev[step];
    let best = null, bd = Infinity;
    for (const w of Game.map.warps) {
      if (w.to !== step) continue;
      const wx = w.x * T + T / 2, wy = w.y * T + T / 2;
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d < bd) { bd = d; best = { x: wx, y: wy - 4, kind: 'warp' }; }
    }
    return best;
  }

  function findDef(role, order) {
    for (const id in Game.maps) {
      const d = Game.maps[id].npcDefs.find(x => x.role === role && x.order === order);
      if (d) return d;
    }
    return null;
  }

  // 왼쪽 미션 순서도
  function setFlow(f) { $('flowPanel').classList.toggle('folded', f); $('flowToggle').textContent = f ? '순서도 ▸' : '순서도 ▾'; }
  function flowData() {
    const f = focusMission();
    const stages = session.course.stages.map(s => s.map(o => {
      const m = content.missions[o - 1];
      return { id: String(o), label: `${o} ${m.short}`, state: isDone(o) ? 'done' : available(o) ? 'open' : 'lock', focus: !allDone() && f === o };
    }));
    stages.push([{ id: 'R', label: '재부팅 (정문)', icon: '🤖', state: st.rebooted ? 'done' : allDone() ? 'open' : 'lock', focus: allDone() && !st.rebooted }]);
    return stages;
  }
  function pickFlow(id) {
    if (!st) return;
    if (id === 'R') {
      if (st.rebooted) return UI.toast('이미 로봇 교장선생님을 구했어요!');
      if (!allDone()) return UI.toast('부품을 모두 모으면 재부팅할 수 있어요.');
      return UI.toast('노란 별이 정문의 로봇 교장선생님을 가리켜요!');
    }
    const o = Number(id), m = content.missions[o - 1];
    if (isDone(o)) return UI.toast(`${o}번 미션은 이미 끝냈어요!`);
    if (!available(o)) {
      const need = session.course.prereq[o].filter(x => !isDone(x)).map(x => `${x}번 ${content.missions[x - 1].short}`);
      return UI.toast(`먼저 ${need.join(', ')} 미션을 끝내야 열려요.`);
    }
    st.focus = o;
    save();
    updateHud();
    Sound.sfx('talk');
    UI.toast(`노란 별이 ${placeOf(o)}의 ${m.npc}에게 안내해요!`);
    // 작은 화면에서는 고른 뒤 순서도를 접어 조이스틱을 가리지 않게 한다
    if (window.innerHeight < 500) setTimeout(() => setFlow(true), 350);
  }

  function updateHud() {
    if (!st) return;
    const mode = MODES[session.player.mode];
    const ms = st.running ? elapsed() : (st.endMs || 0);
    if (st.running && mode.limit && ms >= mode.limit) { st.endMs = mode.limit; timeUp(); }
    const shown = mode.limit ? Math.max(0, mode.limit - ms) : ms;
    UI.hud({
      time: Util.formatTime(mode.limit ? Math.ceil(shown / 1000) * 1000 : shown),
      label: mode.limit ? '남은 시간' : '탐험',
      warn: !!mode.limit && st.running && shown < 60000,
      place: (Game.map ? Game.map.name : '') + ' · ' + DayNight.label(), mission: missionInfo(),
      parts: st.parts.length, total: session.course.list.length, tokens: st.tokens
    });
    UI.flow(flowData(), pickFlow);
    UI.inventory({
      parts: session.course.list.map(o => ({ name: content.missions[o - 1].part, on: st.done.includes(o) })),
      items: ['card', 'pcKey', 'storeKey', 'flashlight'].map(k => ({ name: content.items[k].name, on: has(st.items, k) })),
      tokens: st.tokens, stars: st.stars.length, starTotal: content.collect.total
    });
  }

  // 미니맵에 표시할 목표 위치 (지금 보고 있는 맵에 있는 것만)
  function minimapTargets(mapId) {
    if (!st) return [];
    const out = goalPoints().filter(q => q.mapId === mapId).map(q => ({ x: q.x, y: q.y + (q.kind === 'npc' ? 16 : 6), kind: q.kind }));
    if (st.side.A === 'started') {
      for (const o of Game.maps[mapId].objects) if (o.interact && o.interact.type === 'bandage' && !o.hidden) out.push({ x: o.x + 8, y: o.y + 8, kind: 'clue' });
    }
    return out;
  }

  // 게임 화면에 표시할 느낌표·반짝임
  function status() {
    if (!st) return {};
    return {
      robotFixed: st.rebooted,
      robotHuman: !!st.transformed,
      flashlight: has(st.items, 'flashlight'),
      markFor: n => {
        if (n.role === 'mission' && available(n.def.order) && !(content.missions[n.def.order - 1].kind === 'dark' && st.started[n.def.order])) return '!';
        if (n.role === 'robot' && allDone() && !st.rebooted) return '!';
        if (n.role === 'side' && st.side[n.def.side] !== 'done') return '?';
        if (n.role === 'friend' && !dex.has(n.def.id) && !SECRET_IDS().has(n.def.id)) return 'new';
        return null;
      },
      known: n => dex.has(dexId(n)),
      sparkle: o => {
        const it = o.interact;
        if (!it) return false;
        if (it.type === 'bandage') return st.side.A === 'started';
        if (it.type === 'star') return true;
        if (it.type === 'note') return true;   // 어두운 방 쪽지: 불빛이 닿으면 별처럼 반짝인다
        if (it.type === 'terminal') return st.notes.length === 3;
        if (it.type === 'clue') return available(it.m) && !!st.started[it.m] && !has(st.clues[it.m], it.i);
        if (it.type === 'sign') return false;
        return false;
      }
    };
  }

  // 새 버전이 배포됐는데 브라우저가 옛 파일을 보여 주면 새 버전으로 다시 연다
  async function checkNewVersion() {
    if (!/^https?:/.test(location.protocol)) return;
    try {
      const mine = ($('adminLink') && $('adminLink').textContent.trim()) || '';
      const html = await fetch(location.pathname + '?nc=' + Date.now(), { cache: 'no-store' }).then(r => r.text());
      const m = html.match(/id="adminLink">([^<]+)</);
      if (m && m[1].trim() !== mine && !sessionStorage.getItem('rp_reloaded_' + m[1])) {
        sessionStorage.setItem('rp_reloaded_' + m[1], '1');
        location.replace(location.pathname + '?v=' + encodeURIComponent(m[1].trim()) + location.hash);
      }
    } catch (e) { /* 오프라인이면 그대로 */ }
  }
  function boot() {
    checkNewVersion();
    UI.bind();
    Game.init($('game'), {
      modalOpen: () => UI.modalOpen() || !$('title').classList.contains('hidden'),
      interact,
      toast: UI.toast,
      status,
      tick: dt => {
        if (!st || !st.running) return;
        updateHud();
        saveTimer += dt;
        if (saveTimer > 4) { saveTimer = 0; save(); }
      },
      mapChanged: () => { updateHud(); save(); if (Game.map && Game.map.id === 'dev') enteredSecret(); },
      jumped: onJumped,
      targetChanged: t => UI.setTalkButton(t ? (t.type === 'npc' ? '대화' : '살펴보기') : null),
      minimapTargets,
      guide: guideTarget,
      lockedWarp: w => (st && !unlocked(w.lock) ? content.locks[w.lock] : null),
      playerTag: () => { if (!session || !st) return null; const t = playerTitle(); return t ? `[${t}] ${session.player.name}` : session.player.name; }
    });
    const showZoom = z => {
      $('zoomLabel').textContent = z.label;
      $('zoomIn').disabled = !z.canIn; $('zoomOut').disabled = !z.canOut;
    };
    showZoom(Game.zoomInfo());
    $('zoomIn').addEventListener('click', () => showZoom(Game.zoom(1)));
    $('zoomOut').addEventListener('click', () => showZoom(Game.zoom(-1)));
    window.addEventListener('resize', () => showZoom(Game.zoomInfo()));
    window.addEventListener('keydown', e => {
      if ($('hud').classList.contains('hidden') || UI.modalOpen() || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === '+' || e.key === '=') showZoom(Game.zoom(1));
      if (e.key === '-' || e.key === '_') showZoom(Game.zoom(-1));
    });
    const setFold = f => {
      $('mapPanel').classList.toggle('folded', f);
      $('mapToggle').textContent = f ? '지도' : '접기';
      Util.storage.set('rp_map_folded', f);
    };
    setFold(Util.storage.get('rp_map_folded', false));
    $('mapToggle').addEventListener('click', () => setFold(!$('mapPanel').classList.contains('folded')));
    // 순서도 접기 (작은 화면은 처음에 접어 둔다)
    setFlow(Util.storage.get('rp_flow_folded', window.innerHeight < 500));
    $('flowToggle').addEventListener('click', () => { const f = !$('flowPanel').classList.contains('folded'); setFlow(f); Util.storage.set('rp_flow_folded', f); });

    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    Game.setTouch(touch);
    window.addEventListener('touchstart', () => {
      if (!Game.isTouch()) { Game.setTouch(true); if (st) $('touchUI').classList.remove('hidden'); }
    }, { passive: true });

    $('btnNote').addEventListener('click', () => {
      if (!st || UI.modalOpen()) return;
      UI.notebook({
        parts: st.parts, total: session.course.list.length, clues: st.clueLog, hints: st.hints,
        items: st.items.map(k => content.items[k]), tokens: st.tokens, penalty: st.penaltyMs,
        stars: st.stars.length, starTotal: content.collect.total, collectName: content.collect.name
      });
    });
    UI.setSoundButton(Sound.isMuted());
    $('btnSound').addEventListener('click', () => { Sound.init(); Sound.setMuted(!Sound.isMuted()); UI.setSoundButton(Sound.isMuted()); });
    $('btnSoundTitle').addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); titleMusic(); UI.setSoundButton(Sound.isMuted()); });
    // 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 막는다. 첫 클릭·키·터치 때 첫 화면 음악을 켠다.
    const unlock = () => { titleMusic(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); window.removeEventListener('touchstart', unlock, true); };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
    $('btnFullGame').addEventListener('click', toggleFullscreen);
    $('btnHome').addEventListener('click', () => {
      if (UI.modalOpen()) return;
      const msg = st && !st.finished ? '처음 화면으로 갈까요? 진행 상황은 저장돼서, 같은 이름·모드로 들어오면 이어서 할 수 있어요. (시간은 계속 흘러요)' : '처음 화면으로 갈까요?';
      UI.confirmBox(msg, () => { save(); st = null; Sound.stopMusic(); showStart(); });
    });
    $('btnDex').addEventListener('click', () => {
      if (!st || UI.modalOpen()) return;
      UI.dex(dexEntries(), dex, dexTotal());
    });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

    Title.init($('titleCanvas'));
    bindStart();
    // 캐릭터가 순서도·부품 패널 뒤로 가면 패널을 잠깐 숨기고, 벗어나면 다시 보인다
    setInterval(() => {
      const pr = Game.playerRect();
      for (const id of ['flowPanel', 'invPanel']) {
        const el = $(id); if (!el) continue;
        if (!pr) { el.classList.remove('auto-hide'); continue; }
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const hidden = el.classList.contains('auto-hide'), m = hidden ? 28 : 8;   // 다시 보일 때는 조금 더 멀어져야 (깜빡임 방지)
        const over = pr.x1 > r.left - m && pr.x0 < r.right + m && pr.y1 > r.top - m && pr.y0 < r.bottom + m;
        el.classList.toggle('auto-hide', over);
      }
    }, 120);
    showStart();
    // 첫 화면에 있는 동안 지도·캐릭터 그림을 미리 준비한다
    if (location.hash !== '#admin') setTimeout(() => Game.prewarm(DEFAULT_CONTENT), 400);
    if (location.hash === '#admin') Admin.open();
    window.addEventListener('hashchange', () => { if (location.hash === '#admin') Admin.open(); });
    $('adminLink').addEventListener('dblclick', () => { location.hash = '#admin'; });
  }

  return { boot, toStart: () => { save(); st = null; Sound.stopMusic(); showStart(); }, get state() { return st; }, get session() { return session; }, get content() { return content; }, get miniCfg() { return miniCfg; }, _finish: () => finish() };
})();

window.addEventListener('DOMContentLoaded', App.boot);
