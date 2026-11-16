"""모든 창을 여러 화면 크기에서 열어 스크롤/넘침을 잰다.  usage: python3 audit.py [shots]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/home/claude/robot-principal')
URL = (ROOT / 'dist/index.html').resolve().as_uri()
SHOTS = 'shots' in sys.argv
VIEWS = [
    ('PC 1920x1080', 1920, 1080, False),
    ('PC 1366x768', 1366, 768, False),
    ('노트북 1366x657', 1366, 657, False),   # 브라우저 주소창·탭 제외한 실제 높이
    ('PC 1280x720', 1280, 720, False),
    ('태블릿 1024x768', 1024, 768, True),
    ('태블릿 1180x820', 1180, 820, True),
    ('폰 844x390', 844, 390, True),
    ('폰 740x360', 740, 360, True),
    ('폰 667x375', 667, 375, True),
]

MEASURE = """() => {
  const vw = innerWidth, vh = innerHeight, out = { scroll: [], outside: [], box: null };
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const name = el => el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName);
  const roots = ['#modal', '#entry', '#dialog'].map(s => document.querySelector(s)).filter(e => e && !e.classList.contains('hidden') && vis(e));
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) out.scroll.push(name(el) + ` 세로 ${el.scrollHeight}/${el.clientHeight}`);
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) out.scroll.push(name(el) + ` 가로 ${el.scrollWidth}/${el.clientWidth}`);
      const r = el.getBoundingClientRect();
      if (r.bottom > vh + 1 || r.right > vw + 1 || r.top < -1 || r.left < -1) out.outside.push(name(el));
    }
  }
  const box = document.querySelector('#modal:not(.hidden) #modalBody') || document.querySelector('#entry:not(.hidden) .entry-card:not(.hidden)') || document.querySelector('#entry:not(.hidden) > div:not(.hidden)');
  if (box) { const r = box.getBoundingClientRect(); out.box = { h: Math.round(r.height), w: Math.round(r.width), fillH: +(r.height / vh).toFixed(2), fillW: +(r.width / vw).toFixed(2) }; }
  out.outside = [...new Set(out.outside)].slice(0, 6);
  return out;
}"""


def start_game(pg, grade=4):
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.click('#btnStart', force=True); pg.wait_for_timeout(300)
    pg.click(f'#gradeSeg button[data-g="{grade}"]'); pg.click('#avatarGrid button[data-c="5"]'); pg.click('#modeSeg button[data-m="m30"]')
    pg.select_option('#inClass', '2'); pg.fill('#inName', '김민수')


def close_all(pg):
    pg.evaluate("() => { try { UI.closeAll(); } catch (e) {} }"); pg.wait_for_timeout(320)


def main():
    report = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for (vname, w, h, touch) in VIEWS:
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch and w < 900)
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            res = {}
            def snap(key):
                res[key] = pg.evaluate(MEASURE)
                if SHOTS: pg.screenshot(path=f'/tmp/aud/{w}x{h}_{key}.png')
            start_game(pg)
            snap('입장 폼')
            pg.click('#startForm button[type=submit]'); pg.wait_for_timeout(500)
            snap('캐릭터 확인')
            pg.click('#charOk'); pg.wait_for_timeout(1500)
            if pg.is_visible('#dialog'): snap('대화창')
            for _ in range(8):
                if pg.is_visible('#dialog'): pg.keyboard.press('Space'); pg.wait_for_timeout(250)
            close_all(pg)
            for g in ('g12', 'g34', 'g56'):
                pg.evaluate(f"() => {{ App.state && (App.session.player.group = '{g}'); }}")
                for idx, kind in ((1, 'label'), (3, 'code'), (4, 'robot'), (5, 'sort'), (6, 'bulbs')):
                    js = {
                        'label': "Mini.label((()=>{const v=M.label[G]; return Array.isArray(v)?v[0]:v;})(), M.npc, H)",
                        'code': "Mini.code((Array.isArray(M.code[G])?M.code[G][0]:M.code[G]), M.npc, H)",
                        'robot': "Mini.robot((Array.isArray(M.robot[G])?M.robot[G][M.robot[G].length-1]:M.robot[G]), M.npc, H)",
                        'sort': "Mini.sort((Array.isArray(M.sort[G])?M.sort[G][0]:M.sort[G]), M.npc, H)",
                        'bulbs': "Mini.bulbs((Array.isArray(M.bulbs[G])?M.bulbs[G][M.bulbs[G].length-1]:M.bulbs[G]), 'AI 스마트존 단말기', H)",
                    }[kind]
                    pg.evaluate(f"() => {{ const M = App.content.missions[{idx}], G = '{g}'; const H = {{ hint: {{ label: () => '토큰 1개', use: () => true, bought: true, text: '첫 번째 칸부터 차례대로 따라가 보세요. 반복 블록 안의 명령은 적힌 횟수만큼 되풀이돼요.' }}, onSuccess(){{}}, onClose(){{}} }}; {js}; }}")
                    pg.wait_for_timeout(250); snap(f'미니-{kind}-{g}'); close_all(pg)
                # 퀴즈 (가장 긴 문제)
                pg.evaluate(f"""() => {{ const pool = App.content.missions[0].pool['{g}']; const q = pool.slice().sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0];
                    UI.quizSet([q,q,q], '지킴이 선생님', {{ wrongLine: '', rule: App.content.common.rule, restartLine: '', repick: () => [q,q,q], hintFor: () => null, onCorrect(){{}}, onClose(){{}} }}); }}""")
                pg.wait_for_timeout(300); snap(f'퀴즈-{g}'); close_all(pg)
            pg.evaluate("() => document.getElementById('btnDex').click()"); pg.wait_for_timeout(400); snap('도감')
            if not pg.is_visible('#dexClose'): res['도감']['scroll'].append('!! 도감이 안 열림')
            close_all(pg)
            pg.evaluate("""() => UI.notebook({ tokens: 5, collectName: '개나리', stars: 10, starTotal: 10, penalty: 120000, total: 8,
                parts: ['배터리','센서 눈','마이크 귀','스피커 입','로봇 팔','바퀴 다리','AI 칩','와이파이 안테나'],
                items: [{name:'출입 카드',desc:'정문 지킴이 선생님께 받은 카드'},{name:'컴퓨터실 열쇠',desc:'방송부 선배가 준 열쇠'},{name:'AI 스마트존 열쇠',desc:'교무부장 선생님이 준 열쇠'},{name:'손전등',desc:'어두운 곳을 밝혀요'}],
                clues: ['도서관 쪽지: 로봇의 귀는 소리를 듣는 마이크예요','운동장 조례대: 바퀴는 순서대로','과학실 칠판: 센서는 로봇의 눈','후관 게시판: 와이파이 안테나는 연결의 열쇠','방송실 메모: 암호표를 잘 보세요'],
                hints: [{title:'3번 미션 힌트',text:'도서관 책장 사이를 잘 살펴보세요. 쪽지가 숨어 있어요.'},{title:'5번 미션 힌트',text:'로봇이 벽에 부딪히지 않게 한 칸씩 명령을 넣어 보세요.'},{title:'6번 미션 힌트',text:'숫자가 작은 것부터 차례대로 눌러요.'},{title:'7번 미션 힌트',text:'반복 블록 안의 명령은 적힌 횟수만큼 되풀이돼요.'}] })""")
            pg.wait_for_timeout(300); snap('수첩(가득)'); close_all(pg)
            # 가장 긴 안내판
            pg.evaluate("() => { const s = Object.values(App.content.signs).sort((a,b)=>(b.text||'').length-(a.text||'').length)[0]; UI.sign(s.title, s.text); }")
            pg.wait_for_timeout(300); snap('안내판(가장 긴 글)'); close_all(pg)
            pg.evaluate("() => { const N = ['김하늘','이서준','박지우','최민서','정예린','강도윤','윤서아','장하준','임수아','한지호']; Store.getRanking = async () => Array.from({length: 30}, (_, i) => ({ rank: i + 1, label: '3-' + (i % 6 + 1) + ' ' + N[i % 10], mode: i % 3 ? 'm30' : 'm10', bestMs: 600000 + i * 37000 })); UI.ranking('g34'); }"); pg.wait_for_timeout(900); snap('랭킹(30명)'); close_all(pg)
            pg.evaluate("() => UI.confirmBox('처음 화면으로 갈까요? 진행 상황은 저장돼서, 같은 이름·모드로 들어오면 이어서 할 수 있어요. (시간은 계속 흘러요)', () => {})")
            pg.wait_for_timeout(300); snap('확인창'); close_all(pg)
            # 진행 흐름도
            if pg.is_visible('#flowPanel'): pass
            pg.evaluate("() => App._finish()"); pg.wait_for_timeout(6500); snap('클리어 화면')
            res['errors'] = errs
            report[vname] = res
            ctx.close()
        b.close()
    json.dump(report, open('/tmp/audit.json', 'w'), ensure_ascii=False, indent=1)
    for v, res in report.items():
        bad = []
        for k, m in res.items():
            if k == 'errors':
                if m: bad.append(f'  !! errors {m[:2]}')
                continue
            flags = []
            if m['scroll']: flags.append('스크롤 ' + '; '.join(m['scroll'][:3]))
            if m['outside']: flags.append('화면 밖 ' + ','.join(m['outside'][:3]))
            if m['box'] and m['box']['fillH'] >= 0.92: flags.append(f"꽉참 {m['box']['fillH']}")
            if flags: bad.append(f'  {k}: ' + ' | '.join(flags))
        print(f'== {v}: {len(bad)}건'); print('\n'.join(bad))


main()
