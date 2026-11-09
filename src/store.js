// 기록·랭킹·콘텐츠 저장소.
// 지금은 브라우저 안(localStorage)에 저장하는 임시 버전(LocalStore)이다.
// 서버(Supabase)를 연결하면 같은 함수 이름을 가진 ServerStore로 바꾸기만 하면 된다.
// 함수는 모두 Promise를 돌려주도록 맞춰 두어, 서버 버전으로 바꿔도 호출부를 고칠 필요가 없다.

const LocalStore = (() => {
  const KEY = 'rp_db_v1';
  const CONTENT_KEY = 'rp_content_v1';
  const ADMIN_KEY = 'rp_admin_hash_v1';

  function load() {
    return Util.storage.get(KEY, { players: [], attempts: [], seq: 1 });
  }
  function save(db) { Util.storage.set(KEY, db); }

  function playerKey(p) { return [p.grade, p.cls, p.num, p.name].join('|'); }

  async function startAttempt(player) {
    const db = load();
    let row = db.players.find(r => r.key === playerKey(player));
    if (!row) {
      row = { id: db.seq++, key: playerKey(player), grade: player.grade, cls: player.cls, num: player.num, name: player.name, createdAt: Date.now() };
      db.players.push(row);
    }
    const attempt = { id: db.seq++, playerId: row.id, mode: player.mode || 'm30', startedAt: Date.now(), finishedAt: null, durationMs: null, steps: [], status: 'playing' };
    db.attempts.push(attempt);
    save(db);
    return { attemptId: attempt.id, playerId: row.id };
  }

  // 미션 순서(코스 단계)대로 완료됐는지 확인하기 위한 기록
  async function completeStep(attemptId, order) {
    const db = load();
    const a = db.attempts.find(x => x.id === attemptId);
    if (!a || a.status !== 'playing') return false;
    const c = Util.course(a.mode);
    const done = a.steps.map(s => s.order);
    if (!c.has(order) || done.includes(order)) return false;
    if (!c.prereq[order].every(o => done.includes(o))) return false;
    a.steps.push({ order, at: Date.now() });
    save(db);
    return true;
  }

  // 이어하기용: 도전이 아직 진행 중인지
  async function getAttempt(attemptId) {
    const a = load().attempts.find(x => x.id === attemptId);
    return a ? { id: a.id, status: a.status, mode: a.mode, startedAt: a.startedAt, steps: a.steps.map(s => s.order) } : null;
  }
  async function abandonAttempt(attemptId) {
    const db = load();
    const a = db.attempts.find(x => x.id === attemptId);
    if (a && a.status === 'playing') { a.status = 'quit'; a.finishedAt = Date.now(); save(db); }
    return true;
  }

  // 제한 시간: 30분/10분 모드. 탐험(free) 모드는 랭킹에 넣지 않는다.
  const LIMITS = { m30: 30 * 60 * 1000, m10: 10 * 60 * 1000, free: 0 };

  // penaltyMs: 힌트 토큰이 없을 때 힌트를 써서 더해진 시간
  async function finishAttempt(attemptId, opts = {}) {
    const db = load();
    const a = db.attempts.find(x => x.id === attemptId);
    if (!a) return null;
    if (a.status === 'playing') {
      a.finishedAt = Date.now();
      a.penaltyMs = Math.max(0, Math.round(opts.penaltyMs || 0));
      a.durationMs = a.finishedAt - a.startedAt + a.penaltyMs;
      const limit = LIMITS[a.mode] || 0;
      if (opts.timeout) a.status = 'timeout';
      else if (a.steps.length !== Util.course(a.mode).list.length) a.status = 'invalid';
      else if (a.mode === 'free') a.status = 'explore';
      else if (limit && a.durationMs > limit + 5000) a.status = 'timeout';
      else a.status = 'cleared';
      save(db);
    }
    const p = db.players.find(x => x.id === a.playerId);
    const group = Util.gradeGroup(p.grade);
    const board = buildRanking(db, group, Infinity, { mode: a.mode === 'free' ? 'all' : a.mode });
    const mine = board.find(r => r.playerId === p.id);
    return { durationMs: a.durationMs, penaltyMs: a.penaltyMs || 0, status: a.status, mode: a.mode, bestMs: mine ? mine.bestMs : null, rank: mine ? mine.rank : null, total: board.length, group };
  }

  // 랭킹 만들기: 코스의 미션을 모두 깬 기록만, 학생별 최고 기록
  //  mode: 'all' | 'm30' | 'm10'  (탐험 모드는 랭킹에 넣지 않는다)
  function buildRanking(db, group, limit, opts = {}) {
    const mode = opts.mode || 'all';
    const best = new Map();
    for (const a of db.attempts) {
      if (a.status !== 'cleared' || a.mode === 'free') continue;
      if (mode !== 'all' && a.mode !== mode) continue;
      const cur = best.get(a.playerId);
      if (!cur || a.durationMs < cur.ms) best.set(a.playerId, { ms: a.durationMs, at: a.finishedAt, mode: a.mode });
    }
    const rows = [];
    for (const [playerId, r] of best) {
      const p = db.players.find(x => x.id === playerId);
      if (!p || Util.gradeGroup(p.grade) !== group) continue;
      rows.push({ playerId, grade: p.grade, cls: p.cls, name: p.name, bestMs: r.ms, at: r.at, mode: r.mode });
    }
    rows.sort((x, y) => x.bestMs - y.bestMs || x.at - y.at);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows.slice(0, limit);
  }

  // 접속자 수: 게임에 입장한 학생 수 (같은 학생은 한 번만 센다)
  async function getVisitStats() {
    const db = load();
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const today = new Set(db.attempts.filter(a => a.startedAt >= d.getTime()).map(a => a.playerId));
    const total = new Set(db.attempts.map(a => a.playerId));
    return { today: today.size, total: total.size };
  }

  // 학생 화면용: 이름을 가린 랭킹
  async function getRanking(group, limit = 30, opts = {}) {
    return buildRanking(load(), group, limit, opts).map(r => ({
      rank: r.rank, label: r.grade + '-' + r.cls + ' ' + r.name, bestMs: r.bestMs, mode: r.mode
    }));
  }

  // ---- 관리자 ----
  async function adminHasPassword() { return !!Util.storage.get(ADMIN_KEY, null); }
  async function adminSetPassword(pw) { Util.storage.set(ADMIN_KEY, await Util.sha256('rp:' + pw)); return true; }
  async function adminCheck(pw) { return Util.storage.get(ADMIN_KEY, null) === await Util.sha256('rp:' + pw); }

  async function adminListRecords() {
    const db = load();
    return db.players.map(p => {
      const mine = db.attempts.filter(a => a.playerId === p.id);
      const cleared = mine.filter(a => a.status === 'cleared');
      const best = cleared.reduce((m, a) => (m == null || a.durationMs < m ? a.durationMs : m), null);
      const last = mine.reduce((m, a) => Math.max(m, a.startedAt), 0);
      return { id: p.id, grade: p.grade, cls: p.cls, num: p.num, name: p.name, bestMs: best, tries: mine.length, clears: cleared.length, lastAt: last };
    });
  }

  async function adminDeletePlayer(playerId) {
    const db = load();
    db.players = db.players.filter(p => p.id !== playerId);
    db.attempts = db.attempts.filter(a => a.playerId !== playerId);
    save(db);
    return true;
  }

  async function adminResetAll() {
    save({ players: [], attempts: [], seq: 1 });
    return true;
  }

  // 저장된 콘텐츠가 지금 게임 구조(version 2)와 다르면 기본값을 쓴다.
  // 빠진 항목은 기본값으로 채운다.
  function normalizeContent(c) {
    const d = DEFAULT_CONTENT;
    if (!c || c.version !== d.version || !Array.isArray(c.missions) || c.missions.length !== d.missions.length) return Util.clone(d);
    for (const k in d) if (c[k] == null) c[k] = Util.clone(d[k]);
    c.common = Object.assign({}, d.common, c.common);
    c.signs = Object.assign({}, Util.clone(d.signs), c.signs);
    c.missions.forEach((m, i) => { const dm = d.missions[i]; for (const k in dm) if (m[k] == null) m[k] = Util.clone(dm[k]); m.kind = dm.kind; m.order = dm.order; });
    return c;
  }
  async function getContent() {
    return normalizeContent(Util.storage.get(CONTENT_KEY, null));
  }
  async function adminSaveContent(content) { Util.storage.set(CONTENT_KEY, content); return true; }
  async function adminResetContent() { Util.storage.remove(CONTENT_KEY); return true; }

  return {
    mode: 'local',
    startAttempt, completeStep, getAttempt, abandonAttempt, finishAttempt, getRanking, getVisitStats,
    adminHasPassword, adminSetPassword, adminCheck, adminListRecords, adminDeletePlayer, adminResetAll,
    getContent, adminSaveContent, adminResetContent, normalizeContent
  };
})();

// 서버 버전: Supabase의 rp_ 함수(supabase/schema.sql)를 부른다.
// config.json 에 supabaseUrl, supabaseAnonKey 를 넣고 build.py 를 실행하면 자동으로 이쪽을 쓴다.
const ServerStore = (() => {
  const cfg = window.RP_CONFIG || {};
  let adminPw = null;
  let contentCache = null;
  async function rpc(fn, args) {
    const r = await fetch(String(cfg.supabaseUrl).replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey },
      body: JSON.stringify(args || {})
    });
    if (!r.ok) throw new Error(fn + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  return {
    mode: 'server',
    startAttempt: p => rpc('rp_start_attempt', { p_grade: p.grade, p_cls: p.cls, p_num: p.num, p_name: p.name, p_mode: p.mode || 'm30' }),
    completeStep: (id, order) => rpc('rp_complete_step', { p_attempt: id, p_order: order }),
    getAttempt: id => rpc('rp_get_attempt', { p_attempt: id }),
    abandonAttempt: id => rpc('rp_abandon_attempt', { p_attempt: id }),
    finishAttempt: (id, opts = {}) => rpc('rp_finish_attempt', { p_attempt: id, p_timeout: !!opts.timeout, p_penalty: Math.round(opts.penaltyMs || 0) }),
    getRanking: (group, limit = 30, opts = {}) => rpc('rp_ranking', { p_group: group, p_mode: opts.mode || 'all', p_limit: limit }),
    getVisitStats: () => rpc('rp_visit_stats'),
    adminHasPassword: () => rpc('rp_admin_has_password'),
    async adminSetPassword(pw) { const ok = await rpc('rp_admin_set_password', { p_pw: pw }); if (ok) adminPw = pw; return ok; },
    async adminCheck(pw) { const ok = await rpc('rp_admin_check', { p_pw: pw }); if (ok) adminPw = pw; return ok; },
    adminListRecords: () => rpc('rp_admin_records', { p_pw: adminPw }),
    adminDeletePlayer: id => rpc('rp_admin_delete_player', { p_pw: adminPw, p_id: id }),
    adminResetAll: () => rpc('rp_admin_reset', { p_pw: adminPw }),
    async getContent() {
      // 서버에 저장된 콘텐츠 (없거나 연결이 안 되면 기본값). 한 번 받으면 잠시 기억해 둔다.
      if (contentCache && Date.now() - contentCache.at < 60000) return Util.clone(contentCache.c);
      let c = null;
      try { c = await rpc('rp_get_content'); } catch (e) { c = null; }
      c = LocalStore.normalizeContent(c);
      contentCache = { c, at: Date.now() };
      return Util.clone(c);
    },
    async adminSaveContent(c) { const ok = await rpc('rp_admin_save_content', { p_pw: adminPw, p_content: c }); contentCache = null; return ok; },
    async adminResetContent() { const ok = await rpc('rp_admin_reset_content', { p_pw: adminPw }); contentCache = null; return ok; }
  };
})();

const Store = (window.RP_CONFIG && window.RP_CONFIG.supabaseUrl && window.RP_CONFIG.supabaseAnonKey) ? ServerStore : LocalStore;
