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
  // 랭킹용: 이름 가운데를 ○로 가린다 (김민지 → 김○지, 남궁민수 → 남○○수, 이준 → 이○)
  function maskName(name) {
    const a = Array.from(String(name || ''));
    if (a.length <= 1) return a.join('');
    if (a.length === 2) return a[0] + '○';
    return a[0] + '○'.repeat(a.length - 2) + a[a.length - 1];
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

  // 학년군: 1~2학년 g12 · 3~4학년 g34 · 5~6학년 g56 (문제와 랭킹을 나누는 단위)
  const GROUPS = ['g12', 'g34', 'g56'];
  const GROUP_NAMES = { g12: '1~2학년군', g34: '3~4학년군', g56: '5~6학년군' };
  function gradeGroup(grade) {
    const n = Number(grade);
    return n <= 2 ? 'g12' : n <= 4 ? 'g34' : 'g56';
  }

  function groupLabel(group) {
    return GROUP_NAMES[group] || '';
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

  // ---------- 이름 검사 ----------
  // 실제 이름 형식(한글 3~4글자, 성으로 시작)만 받고, 욕설·성적인 말·유행어가 들어 있으면 막는다
  const SURNAMES = ('김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 전 홍 유 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 류 나 진 지 엄 채 원 천 방 공 현 함 변 염 여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 라 왕 금 옥 육 인 맹 제 모 탁 국 어 은 편 용 예 경 봉 사 부 황 가 복 태 목 형 피 두 감 음 빈 동 온 호 범 좌 팽 승 간 상 시 갈 단 견 당 화 창 옹 순 빙 종 풍 엽 개 판 묵 운 계 탄 우 정 뢰 초 근 섭 내 위 야 매 아 영 리 림 라 로 륙 롱 려 렴 량 류').split(' ');
  const SURNAMES2 = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방', '망절', '어금', '장곡', '무본', '황목'];
  const BAD_WORDS = [
    // 욕설
    '시발', '씨발', '씨빨', '시바', '씨바', '쉬발', '슈발', '십알', '씹', '좆', '좃', '존나', '졸라', '병신', '븅신', '빙신', '등신', '멍청', '바보', '미친', '미쳤', '또라', '돌아이', '새끼', '색기', '개새', '개색', '개같', '개놈', '개년', '지랄', '꺼져', '닥쳐', '엠창', '엄창', '애미', '애비', '에미', '에비', '느금', '니미', '니엄', '니애', '느개', '느그', '쌍놈', '쌍년', '썅', '년놈', '호로', '후레', '찐따', '찌질', '틀딱', '한남충', '김치녀', '맘충', '급식충', '충이', '잼민', '일베', '메갈', '죽어', '죽일', '자살', '살인', '똥', '오줌', '방구', '방귀', '변태',
    // 성적인 말
    '섹스', '섹시', '야동', '야사', '보지', '자지', '잦이', '봊', '젖', '꼬추', '고추', '불알', '부랄', '딸딸', '자위', '강간', '성폭', '창녀', '걸레', '후장', '빠구리', '떡치', '응디', '엉덩', '팬티', '가슴', '유두', '꼭지', '성교', '정액', '콘돔', '임신',
    // 유행어 · 장난
    '줴', '쥐쥐', '엘을', '엘가', '가져가', '킹받', '어쩔', '저쩔', '티비', '뇌절', '오히려', '응애', '뭐요', '알빠', '실화', '레전드', '갓생', '꿀잼', '노잼', '핵잼', '개꿀', '어쩌라', '그래서', '뭐래', '무야호', '킹갓', '마라탕', '탕후루', '스키비', '토일렛', '기모', '모찌', '야메', '이쿠', '오니짱', '쨩', '스고이', '카와이', '아헤', '헨타', '오타쿠', '혼모노', '와꾸', '빠가', '칙쇼', '오카마', '구와악', '아잉', '뿌잉', '야르', '헐랭', '하이요', '좋댓', '구독', '알림', '선생', '교장', '관리', '운영', '테스트', '아무개', '홍길동', '누구', '익명', '모름', '없음', '학생'
  ];
  function checkName(name) {
    if (!/^[가-힣]{3,4}$/.test(name)) return '이름은 실제 이름처럼 한글 3~4글자로 입력해 주세요. (예: 김하늘)';
    const okSurname = SURNAMES2.includes(name.slice(0, 2)) || SURNAMES.includes(name[0]);
    if (!okSurname) return '성을 포함한 실제 이름을 입력해 주세요. (예: 김하늘)';
    if (/(.)\1\1/.test(name)) return '실제 이름을 입력해 주세요.';
    for (const w of BAD_WORDS) if (name.includes(w)) return '사용할 수 없는 이름이에요. 실제 이름을 입력해 주세요.';
    return '';
  }

  // ---------- 별명 검사 (선택 입력) ----------
  // 한글 완성 글자·영어·숫자만, 2~8글자. 욕설·성적인 말·유행어·사람을 놀리는 말은 막는다.
  const NICK_BAD = BAD_WORDS.concat([
    // 욕설·비하 더하기
    '시벌', '씨벌', '시펄', '씨펄', '십팔', '씹팔', '십쌔', '쓰레기', '개노', '개웃', '개쩔', '개빡', '개못', '빡치', '빡쳐', '열받', '꺼지', '닥처', '디져', '디진', '뒤져', '뒤진', '죽여', '패드립', '못생', '돼지', '뚱땡', '뚱보', '멸치', '난쟁', '장애', '애자', '정신병', '틀니', '꼰대', '거지', '노예', '찐찌', '빠가', '병쉰', '븅', '좆밥', '존못', '똥꼬', '엉덩이', '궁디', '방댕', '응가',
    // 유행어
    '존잘', '존예', '존맛', '존잼', '쩔어', '대박', '레게노', '중꺾마', '알잘딱', '느좋', '럭키비키', '원영적', '스불재', '머선', '사바사', '케바케', '인싸', '아싸', '별다줄', '갑분싸', '쿠쿠루', '삥뽕', '빠염', '하이루', '슬릭백', '억까', '억텐', '현타', '멘붕', '킹정', '킹받', '쌉가능', '쌉', '오졌', '지렸', '렬루', '실화냐', '에바', '레알', '띵작', '반박시', '너무좋아', '가보자고', '어쩔티비', '우짤래미', '저쩔티비', '꽁꽁', '두쫀쿠', '흑백', '나니', '사사게',
    // 영어
    'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'btch', 'sex', 'porn', 'dick', 'cock', 'pussy', 'damn', 'nigg', 'fag', 'stupid', 'idiot', 'loser', 'sibal', 'ssibal', 'tlqkf', 'qudtls', 'byungsin', 'jonna', 'sakki', 'gaesaeki', 'admin', 'test',
    // 숫자 은어
    '18', '1818', '69', '10새', '444'
  ]);
  function checkNick(nick) {
    const n = String(nick || '').replace(/\s+/g, '');
    if (!n) return '';                                   // 안 써도 된다
    const len = Array.from(n).length;
    if (len < 2 || len > 8) return '별명은 2~8글자로 써 주세요. (쓰지 않아도 돼요)';
    if (!/^[가-힣a-zA-Z0-9]+$/.test(n)) return '별명은 한글·영어·숫자로만 써 주세요. (ㅋㅋ, ㅅㅂ 같은 자음·모음이나 기호는 안 돼요)';
    if (/^[0-9]+$/.test(n)) return '숫자만으로는 별명을 만들 수 없어요.';
    if (/(.)\1\1/.test(n)) return '같은 글자를 세 번 이상 이어 쓸 수 없어요.';
    const low = n.toLowerCase();
    const forms = [low, low.replace(/[0-9]/g, ''), low.replace(/[a-z0-9]/g, '')];
    for (const w of NICK_BAD) if (forms.some(f => f.includes(w))) return '사용할 수 없는 별명이에요. 바르고 고운 별명으로 바꿔 주세요.';
    return '';
  }

  // 실제 이름처럼 보이는지 (한글 3글자 + 흔한 성, 또는 두 글자 성 + 2글자): 경고만 하고 막지는 않는다
  const COMMON_SURNAMES = '김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 전 홍 유 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 류 나 진 지 엄 채 원 천 방 공 현 함 변 염 여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 라 왕 금 옥 육 인 맹 제 모'.split(' ');
  function looksLikeName(nick) {
    const n = String(nick || '').replace(/\s+/g, '');
    if (/^[가-힣]{3}$/.test(n)) return COMMON_SURNAMES.includes(n[0]);
    if (/^[가-힣]{4}$/.test(n)) return SURNAMES2.includes(n.slice(0, 2));
    return false;
  }

  // 우리 학교 학년별 반 수와 최대 번호
  const CLASS_COUNT = { 1: 4, 2: 5, 3: 6, 4: 8, 5: 8, 6: 9 };
  const MAX_NUM = 25;

  return { GROUPS, GROUP_NAMES, CLASS_COUNT, MAX_NUM, checkName, checkNick, looksLikeName, rng, josa, maskName, normalize, shuffle, formatTime, gradeGroup, groupLabel, sha256, esc, clone, storage, course };
})();
