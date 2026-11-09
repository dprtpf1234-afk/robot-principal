// 공용 도구 함수
const Util = (() => {
  // 고정 시드 난수 (NPC 배치가 매번 같도록)
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 받침 유무에 따라 조사 선택: josa('사서 선생님', '을/를') -> '사서 선생님을'
  function josa(word, pair) {
    const [withBatchim, without] = pair.split('/');
    const last = word.charCodeAt(word.length - 1);
    if (last < 0xAC00 || last > 0xD7A3) return word + without;
    return word + ((last - 0xAC00) % 28 ? withBatchim : without);
  }

  // 랭킹용 이름 가리기: 김민수 -> 김○○
  function maskName(name) {
    if (!name) return '';
    return name[0] + '○'.repeat(Math.max(1, name.length - 1));
  }

  // 주관식 비교용: 띄어쓰기 제거, 소문자
  function normalize(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase();
  }

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function gradeGroup(grade) {
    return Number(grade) <= 3 ? 'low' : 'high';
  }

  function groupLabel(group) {
    return group === 'low' ? '저학년 (1~3학년)' : '고학년 (4~6학년)';
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 브라우저 저장소가 막혀 있어도 게임이 멈추지 않도록 감싼다
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* 무시 */ }
    }
  };

  // 미션 코스: 단계(stage)마다 미션 번호. 한 단계의 미션은 어느 쪽 먼저 해도 되고,
  // 다음 단계는 앞 단계 미션을 모두 끝내야 열린다. 마지막에는 정문에서 로봇 교장선생님 재부팅.
  const COURSES = {
    full: { stages: [[1], [2, 3], [4, 8], [5, 6], [7]] },   // 8: 후관 3층 (방송실 미션과 같은 단계)
    short: { stages: [[1], [3, 4], [6], [7]] }      // 10분 미션: 2층(과학실·컴퓨터실) 없이
  };
  function course(mode) {
    const c = COURSES[mode === 'm10' ? 'short' : 'full'];
    const list = [].concat(...c.stages);
    const prereq = {};
    c.stages.forEach((s, i) => s.forEach(o => { prereq[o] = i ? c.stages[i - 1].slice() : []; }));
    return { stages: c.stages, list, prereq, has: o => list.includes(o) };
  }

  return { rng, josa, maskName, normalize, shuffle, formatTime, gradeGroup, groupLabel, sha256, esc, clone, storage, course };
})();
