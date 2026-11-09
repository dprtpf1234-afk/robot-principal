"""헤드리스 크롬으로 처음부터 클리어까지 자동 플레이하며 화면을 찍는다.
사용법: python3 tests/smoke.py [desktop|mobile] [학년] [m30|m10]
미니게임은 실제 화면 버튼을 눌러 푼다. 퀴즈는 화면에 나온 문제를 콘텐츠에서 찾아 정답을 누른다.
"""
import sys
from collections import deque
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "shots"
OUT.mkdir(exist_ok=True)
device = sys.argv[1] if len(sys.argv) > 1 else "desktop"
grade = int(sys.argv[2]) if len(sys.argv) > 2 else 4
mode = sys.argv[3] if len(sys.argv) > 3 else "m30"
tag = f"{device}_{mode}_g{grade}"
errors = []


def shot(page, name):
    page.screenshot(path=str(OUT / f"{tag}_{name}.png"))


def advance(page, limit=30):
    for _ in range(limit * 2):
        if page.is_hidden("#dialog"):
            return
        page.evaluate("document.getElementById('dialog').click()")
        page.wait_for_timeout(50)


def go_npc(page, npc_id):
    page.evaluate("""(id) => {
        for (const mid in Game.npcsAll) {
            const n = Game.npcsAll[mid].find(x => x.id === id);
            if (n) { Game._teleport(mid, n.x / 16 - 0.5, (n.y + 14) / 16 - 0.75); return; }
        }
        throw new Error('no npc ' + id);
    }""", npc_id)
    page.wait_for_timeout(200)


def go_obj(page, mid, pred_js):
    page.evaluate("""([mid, pred]) => { const f = new Function('it', 'return ' + pred);
        const o = Game.maps[mid].objects.find(o => o.interact && f(o.interact));
        if (!o) throw new Error('no obj ' + pred);
        Game._teleport(mid, (o.hit.x + o.hit.w / 2) / 16 - 0.5, (o.hit.y + o.hit.h) / 16 + 0.2); }""", [mid, pred_js])
    page.wait_for_timeout(200)


def press_e(page):
    page.keyboard.press("e")
    page.wait_for_timeout(150)


def current_q(page):
    """화면에 떠 있는 문제를 콘텐츠에서 찾는다"""
    return page.evaluate("""() => {
        const text = document.querySelector('.quiz-q').textContent, c = App.content, g = App.session.player.group;
        const all = [];
        c.missions.forEach(m => { if (m.pool) all.push(...m.pool[g]); if (m.first) all.push(m.first[g]); });
        all.push(...c.reboot.pool[g]);
        return all.find(q => q.question === text) || null;
    }""")


def answer_q(page, q):
    if q["format"] == "choice":
        page.click(f'.choice[data-i="{q["correct"]}"]')
    elif q["format"] == "ox":
        page.click(f'.oxbtn[data-v="{q["answers"][0]}"]')
    else:
        page.fill("#quizInput", q["answers"][0]); page.click(".answer button")
    page.wait_for_timeout(250)
    if page.locator("#quizNext").count():
        page.click("#quizNext")
    page.wait_for_timeout(800)


def solve_quiz_set(page, wrong_first=False, use_hint=False, shot_name=None):
    page.wait_for_selector("#modalBody.quiz", timeout=3000)
    if use_hint:
        before = page.evaluate("App.state.tokens")
        page.click("#hintBtn"); page.wait_for_timeout(200)
        after = page.evaluate("App.state.tokens")
        assert after == before - 1 or before == 0, (before, after)
        print("hint used, tokens", before, "->", after)
    if shot_name:
        shot(page, shot_name)
    if wrong_first:
        q = current_q(page)
        if q["format"] == "choice":
            page.locator(f'.choice:not([data-i="{q["correct"]}"]):not(:disabled)').first.click()
        elif q["format"] == "ox":
            page.click(f'.oxbtn[data-v="{"X" if q["answers"][0] == "O" else "O"}"]')
        else:
            page.fill("#quizInput", "모름"); page.click(".answer button")
        page.wait_for_timeout(1700)
        assert page.evaluate("document.getElementById('modalBody').dataset.qi") == "0"
    for _ in range(3):
        page.wait_for_selector("#modalBody.quiz .quiz-q", timeout=3000)
        q = current_q(page)
        assert q, "문제를 못 찾음"
        answer_q(page, q)


def solve_label(page):
    d = page.evaluate("() => App.miniCfg")
    n = len(d["cats"])
    for i, it in enumerate(d["items"]):
        for _ in range((it["a"] - it["s"]) % n):
            page.click(f'.lb-card[data-i="{i}"]')
    page.click("#lbGo"); page.wait_for_timeout(1600)


def solve_code(page):
    d = page.evaluate("() => App.miniCfg")
    page.click(f'.cd-key[data-v="{d["table"][0]["v"]}"]')  # 일부러 틀린 글자 하나 넣고 지우기
    page.click("#cdBack")
    for ch in d["answer"]:
        page.click(f'.cd-key[data-v="{ch}"]')
    page.wait_for_timeout(100)


def solve_robot(page):
    d = page.evaluate("() => App.miniCfg")
    walls = {tuple(w) for w in d["walls"]}
    start, goal = tuple(d["start"]), tuple(d["goal"])
    prev = {start: None}
    q = deque([start])
    moves = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
    while q:
        c = q.popleft()
        if c == goal:
            break
        for k, (dx, dy) in moves.items():
            n = (c[0] + dx, c[1] + dy)
            if 0 <= n[0] < d["w"] and 0 <= n[1] < d["h"] and n not in walls and n not in prev:
                prev[n] = (c, k); q.append(n)
    path = []
    c = goal
    while prev[c]:
        c, k = prev[c]; path.append(k)
    path.reverse()
    runs = []
    for k in path:
        if runs and runs[-1][0] == k and d["repeat"]:
            runs[-1][1] += 1
        else:
            runs.append([k, 1])
    assert len(runs) <= d["max"], runs
    for i, (k, n) in enumerate(runs):
        page.click(f'.rb-add[data-d="{k}"]')
        for _ in range(n - 1):
            page.click(f'.rb-blk[data-i="{i}"]')
    return len(path)


def solve_sort(page):
    d = page.evaluate("() => App.miniCfg")
    for i in sorted(range(len(d["cards"])), key=lambda i: d["cards"][i]["v"]):
        page.click(f'.st-card[data-i="{i}"]')
    page.wait_for_timeout(1600)


def solve_bulbs(page):
    on = page.evaluate("() => Mini.runBulbs(App.miniCfg)")
    for i, v in enumerate(on):
        if v:
            page.click(f'.bulb[data-i="{i}"]')


def collect_clues(page, order):
    mid = page.evaluate("(m) => Object.keys(Game.maps).find(id => Game.maps[id].objects.some(o => o.interact && o.interact.type==='clue' && o.interact.m===m))", order)
    n = page.evaluate("([mid, m]) => Game.maps[mid].objects.filter(o => o.interact && o.interact.type==='clue' && o.interact.m===m).length", [mid, order])
    for i in range(n):
        for _ in range(3):   # 바로 옆에 개나리 꽃이 있으면 첫 E는 꽃을 줍는다
            go_obj(page, mid, f"it.type==='clue' && it.m==={order} && it.i==={i}")
            press_e(page)
            advance(page)
            if page.evaluate("([m, i]) => App.state.clues[m].includes(i)", [order, i]):
                break
    got = page.evaluate("(m) => App.state.clues[m].length", order)
    assert got == n, ("clues", order, got, n, mid)


def open_flow(page):
    if page.evaluate("document.getElementById('flowPanel').classList.contains('folded')"):
        page.click("#flowToggle"); page.wait_for_timeout(150)


def play_mission(page, order):
    kind = page.evaluate("(o) => App.content.missions[o-1].kind", order)
    # 순서도에서 고르기 (작은 화면은 접혀 있으면 편다)
    open_flow(page)
    page.click(f'.fl-node[data-id="{order}"]'); page.wait_for_timeout(150)
    assert page.evaluate("App.state.focus") == order
    go_npc(page, f"m{order}")
    press_e(page)
    if order == 1:
        shot(page, "10_m1_talk")
    advance(page)
    if kind in ("explore", "sort"):
        collect_clues(page, order)
        go_npc(page, f"m{order}"); press_e(page); advance(page)
    if kind in ("quiz", "explore"):
        solve_quiz_set(page, wrong_first=(order == 1), use_hint=(order == 1), shot_name=f"11_m{order}_quiz")
    elif kind == "label":
        page.wait_for_selector("#modalBody.mini", timeout=3000)
        shot(page, "12_label_before")
        page.click("#lbGo"); page.wait_for_timeout(1300)
        shot(page, "12_label_wrong")
        solve_label(page)
    elif kind == "code":
        page.wait_for_selector("#modalBody.mini", timeout=3000)
        page.click("#hintBtn"); page.wait_for_timeout(150)
        solve_code(page)
        shot(page, "13_code")
        page.click("#cdGo"); page.wait_for_timeout(1600)
    elif kind == "robot":
        page.wait_for_selector("#modalBody.mini", timeout=3000)
        steps = solve_robot(page)
        shot(page, "14_robot")
        page.click("#rbRun"); page.wait_for_timeout(steps * 270 + 2000)
    elif kind == "sort":
        page.wait_for_selector("#modalBody.mini", timeout=3000)
        shot(page, "15_sort")
        solve_sort(page)
    elif kind == "dark":
        # 손전등·열쇠를 받았다 → 4층 창고
        assert page.evaluate("App.state.items.includes('storeKey') && App.state.items.includes('flashlight')")
        go_npc(page, "f19"); page.wait_for_timeout(300)
        shot(page, "16_store_door")
        for i in range(3):
            go_obj(page, "f4", f"it.type==='note' && it.i==={i}")
            if i == 0:
                shot(page, "16_store_dark")
            press_e(page); advance(page)
        go_obj(page, "f4", "it.type==='terminal'")
        press_e(page)
        page.wait_for_selector("#modalBody.mini", timeout=3000)
        solve_bulbs(page)
        shot(page, "17_bulbs")
        page.click("#bkGo"); page.wait_for_timeout(1800)
    if kind not in ("quiz", "explore"):
        page.wait_for_selector("#modal", state="hidden", timeout=8000)
        page.wait_for_timeout(100)
    advance(page)
    page.wait_for_timeout(300)
    done = page.evaluate("App.state.done")
    assert order in done, (order, done)
    print("mission", order, kind, "ok · tokens", page.evaluate("App.state.tokens"), "· items", page.evaluate("App.state.items"))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
    if device == "mobile":
        ctx = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    else:
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto((ROOT / "dist" / "index.html").as_uri())
    page.wait_for_timeout(900)
    shot(page, "00_title")
    page.click("#btnStart", force=True)
    page.wait_for_timeout(300)
    page.click(f'#gradeSeg button[data-g="{grade}"]')
    page.click('#avatarGrid button[data-c="5"]')
    page.click(f'#modeSeg button[data-m="{mode}"]')
    page.select_option("#inClass", "2")
    page.fill("#inName", "김민수")
    page.click("#startForm button[type=submit]")
    page.wait_for_timeout(400)
    page.click("#charOk")
    page.wait_for_timeout(300)
    advance(page)
    page.wait_for_timeout(900)
    shot(page, "01_start")

    # 잠긴 현관: 출입 카드 없이 들어가려 하면 막힌다
    page.evaluate("() => Game._teleport('outdoor', 49, 34)")
    page.keyboard.down("ArrowUp"); page.wait_for_timeout(500); page.keyboard.up("ArrowUp")
    page.wait_for_timeout(300)
    assert page.evaluate("Game.map.id") == "outdoor", "잠긴 문으로 들어가 버림"
    shot(page, "02_locked")
    # 아직 열리지 않은 미션
    open_flow(page)
    shot(page, "02_flow_open")
    page.click('.fl-node[data-id="4"]'); page.wait_for_timeout(200)
    go_npc(page, "m4")
    press_e(page); shot(page, "03_notyet"); advance(page)

    stages = page.evaluate("App.session.course.stages")
    first = True
    for stage in stages:
        for order in stage:
            play_mission(page, order)
            if first:
                first = False
                # 현관이 열렸는지
                page.evaluate("() => Game._teleport('outdoor', 49, 34)")
                page.keyboard.down("ArrowUp"); page.wait_for_timeout(500); page.keyboard.up("ArrowUp")
                page.wait_for_timeout(700)
                assert page.evaluate("Game.map.id") == "f1", "출입 카드가 있는데 못 들어감"
                # 이어하기 확인: 처음 화면으로 갔다가 다시 입장
                page.evaluate("() => App.toStart()"); page.wait_for_timeout(300)
                page.click("#btnStart", force=True); page.wait_for_timeout(200)
                page.click("#startForm button[type=submit]"); page.wait_for_timeout(400)
                shot(page, "05_resume_ask")
                page.click('#modalBody [data-b="1"]'); page.wait_for_timeout(700)
                assert page.evaluate("App.state.done") == [1], page.evaluate("App.state.done")
                assert page.evaluate("Game.map.id") == "f1"
                print("resume ok")
        # 서브 미션들 (첫 단계 뒤에)
        if stage == stages[0]:
            go_npc(page, "sA"); press_e(page); advance(page)
            for i in range(3):
                go_obj(page, "h1", f"it.type==='bandage' && it.i==={i}"); press_e(page)
            go_npc(page, "sA"); press_e(page); advance(page)
            go_npc(page, "sB"); press_e(page); advance(page)
            page.click('.oxbtn[data-v="X"]'); page.wait_for_timeout(900); advance(page)
            go_npc(page, "sC"); press_e(page); advance(page)
            page.fill("#quizInput", "컴퓨터"); page.click(".answer button"); page.wait_for_timeout(900); advance(page)
            print("sides done · tokens", page.evaluate("App.state.tokens"))
            # 별 조각 10개
            for mid, i in page.evaluate("() => { const r = []; for (const id in Game.maps) for (const o of Game.maps[id].objects) if (o.interact && o.interact.type==='star') r.push([id, o.interact.i]); return r; }"):
                go_obj(page, mid, f"it.type==='star' && it.i==={i}"); press_e(page); advance(page)
            page.wait_for_timeout(300)
            shot(page, "06_stars")
            advance(page)
            print("stars", page.evaluate("App.state.stars.length"), "tokens", page.evaluate("App.state.tokens"))
            # i 팻말
            go_obj(page, "f2", "it.type==='sign' && it.id==='broadcast'"); press_e(page)
            shot(page, "07_sign"); page.click("#sgClose"); page.wait_for_timeout(250)
            page.click("#btnNote"); page.wait_for_timeout(200); shot(page, "08_notebook"); page.click("#nbClose"); page.wait_for_timeout(250)

    # 재부팅
    page.wait_for_timeout(1300)
    advance(page)
    shot(page, "20_all_parts")
    go_npc(page, "robot"); press_e(page); advance(page)
    solve_quiz_set(page, shot_name="21_reboot")
    page.wait_for_timeout(500)
    shot(page, "22_ending")
    advance(page)
    page.wait_for_timeout(800)
    shot(page, "23_clear")
    st = page.evaluate("() => ({ rebooted: App.state.rebooted, parts: App.state.parts.length, penalty: App.state.penaltyMs })")
    print("state", st)
    assert st["rebooted"]
    page.click("#clRank"); page.wait_for_timeout(400)
    shot(page, "24_ranking")
    page.click("#rkClose"); page.wait_for_timeout(300)
    page.evaluate("() => UI.closePanel()")

    # 시간 종료
    page.evaluate("() => App.toStart()"); page.wait_for_timeout(300)
    page.click("#btnStart", force=True); page.wait_for_timeout(200)
    page.click('#modeSeg button[data-m="m10"]')
    page.click("#startForm button[type=submit]"); page.wait_for_timeout(400)
    if page.locator('#modalBody [data-b="0"]').count():
        page.click('#modalBody [data-b="0"]'); page.wait_for_timeout(400)
    page.click("#charOk"); page.wait_for_timeout(200)
    advance(page)
    page.wait_for_timeout(300)
    page.evaluate("() => { App.state.startedAt -= 9.5 * 60 * 1000; }")
    page.wait_for_timeout(300)
    shot(page, "30_warn")
    page.evaluate("() => { App.state.startedAt -= 60 * 1000; }")
    page.wait_for_timeout(500)
    shot(page, "31_timeup")

    # 관리자
    page.goto((ROOT / "dist" / "index.html").as_uri() + "#admin")
    page.wait_for_timeout(400)
    page.fill("#admPw", "1234abcd")
    page.fill("#admPw2", "1234abcd")
    page.click("#admForm button")
    page.wait_for_timeout(300)
    shot(page, "40_admin_records")
    page.click("nav button[data-t=content]")
    page.wait_for_timeout(300)
    page.click("#cSave"); page.wait_for_timeout(200)
    print("admin save:", page.text_content("#saveMsg"))
    shot(page, "41_admin_content")

    print("\n".join(errors) if errors else "no console errors")
    browser.close()
