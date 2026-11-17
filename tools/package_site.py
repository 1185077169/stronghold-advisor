# -*- coding: utf-8 -*-
"""生成可公开部署的纯静态站点目录 dist/。

只复制运行网站必需的文件，不包含 vendor/、tools/、data/ 等开发资料。
用法：py -3 -I tools/package_site.py
"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

FILES = [
    "index.html",
    "favicon.svg",
    os.path.join("css", "style.css"),
    os.path.join("js", "data.js"),
    os.path.join("js", "engine.js"),
    os.path.join("js", "app.js"),
    "NOTICE.md",
]

HEADERS = """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/js/data.js
  Cache-Control: public, max-age=300, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate
"""

ROBOTS = """User-agent: *
Allow: /
"""


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    missing = []
    for rel in FILES:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        dst = os.path.join(DIST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)

    with open(os.path.join(DIST, "_headers"), "w", encoding="utf-8", newline="\n") as f:
        f.write(HEADERS)
    with open(os.path.join(DIST, "robots.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write(ROBOTS)

    total = 0
    for base, _, names in os.walk(DIST):
        for name in names:
            total += os.path.getsize(os.path.join(base, name))

    print("dist:", DIST)
    print("files:", len(FILES) + 2, "size:", total, "bytes")
    if missing:
        raise SystemExit("missing: " + ", ".join(missing))


if __name__ == "__main__":
    main()
