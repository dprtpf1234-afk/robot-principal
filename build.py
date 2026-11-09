#!/usr/bin/env python3
"""src/ 의 자바스크립트를 하나로 묶어 dist/index.html 한 파일을 만든다.
사용법: python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
ORDER = ["util.js", "daynight.js", "content.js", "store.js", "audio.js", "sprites.js", "world.js", "game.js", "ui.js", "minigames.js", "admin.js", "title.js", "main.js"]

parts = []
for name in ORDER:
    code = (ROOT / "src" / name).read_text(encoding="utf-8")
    if "</script" in code.lower():
        raise SystemExit(f"{name}: '</script' 문자열은 쓸 수 없어요")
    parts.append(f"// ===== {name} =====\n{code}")

# 서버 설정: config.json (없으면 기기 저장 시험 버전)
import json as _json
cfg_file = ROOT / "config.json"
cfg = _json.loads(cfg_file.read_text(encoding="utf-8")) if cfg_file.exists() else {}
cfg = {"supabaseUrl": cfg.get("supabaseUrl", ""), "supabaseAnonKey": cfg.get("supabaseAnonKey", "")}
print("server:", cfg["supabaseUrl"] or "(없음 · 기기 저장 시험 버전)")
html = (ROOT / "index.template.html").read_text(encoding="utf-8").replace("/*__CONFIG__*/", _json.dumps(cfg)).replace("/*__SCRIPTS__*/", "\n".join(parts))
out = ROOT / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"built {out} ({len(html) // 1024} KB)")

# 홈 화면에 추가(PWA)용 manifest와 아이콘
import json
manifest = {
    "name": "로봇 교장선생님 구하기!", "short_name": "로봇 교장",
    "description": "대교초등학교 SW·AI 행사 메타버스 게임",
    "start_url": "./", "scope": "./", "display": "fullscreen", "orientation": "landscape",
    "background_color": "#2a2533", "theme_color": "#2a2533", "lang": "ko",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]
}
(out.parent / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
try:
    from PIL import Image, ImageDraw
    # 16x16 픽셀 로봇 얼굴을 크게 확대한 아이콘
    art = [
        "................",
        ".......yy.......",
        "........y.......",
        "...gggggggggg...",
        "..gwwwwwwwwwwg..",
        "..gwccwwwwccwg..",
        "..gwccwwwwccwg..",
        "..gwwwwwwwwwwg..",
        "..gwwrrrrrrwwg..",
        "..gwwwwwwwwwwg..",
        "...gggggggggg...",
        ".....dddddd.....",
        "...dddddddddd...",
        "...ddyyyyyyddd..",
        "...dddddddddd...",
        "................",
    ]
    col = {"y": (255, 216, 74), "g": (43, 34, 51), "w": (200, 208, 218), "c": (61, 224, 255), "r": (232, 54, 79), "d": (138, 150, 164)}
    for size in (180, 192, 512):
        img = Image.new("RGB", (size, size), (47, 110, 240))
        dr = ImageDraw.Draw(img)
        pad = size // 8
        cell = (size - pad * 2) / 16
        for y, row in enumerate(art):
            for x, ch in enumerate(row):
                if ch in col:
                    dr.rectangle([pad + x * cell, pad + y * cell, pad + (x + 1) * cell - 1, pad + (y + 1) * cell - 1], fill=col[ch])
        img.save(out.parent / f"icon-{size}.png")
except ImportError:
    print("PIL이 없어 아이콘은 만들지 않았어요")
