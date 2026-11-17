# -*- coding: utf-8 -*-
"""只读检查上游数据，不执行 vendor 目录里的任何脚本。"""
import json
import os
import collections

D = r"D:\卫戍协议助手\vendor\stronghold-assistant"


def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as f:
        return json.load(f)


ops = load("operators.json")["operators"]
cov_root = load("covenants.json")
core = [c["name"] for c in cov_root["covenants"] if c["bondType"] == "SEASON"]
extra = [c["name"] for c in cov_root["covenants"] if c["bondType"] != "SEASON"]

print("CORE:", ", ".join(core))
print("EXTRA:", ", ".join(extra))

by_core = collections.defaultdict(list)
for o in ops:
    for c in o.get("coreCovenants", []):
        by_core[c].append(o)

for c in core:
    lst = sorted(by_core[c], key=lambda o: (-o["tier"], o["name"]))
    print(f"\n## {c} ({len(lst)})")
    for o in lst[:14]:
        extras = ",".join(o.get("additionalCovenants", []))
        print(f"  T{o['tier']} {o['name']} | {extras}")

print("\n--- equipment tiers ---")
eq = load("equipment.json")["equipment"]
for t in sorted({e["tier"] for e in eq}):
    names = [e["name"] for e in eq if e["tier"] == t]
    print(f"T{t} ({len(names)}): {', '.join(names[:20])}")

print("\n--- strategies ---")
st = load("strategies.json")
print("season:", st.get("season"), "count:", len(st["strategies"]))
for s in st["strategies"][:12]:
    print(f"  {s['id']} | {s['name']} | {s.get('initiator','')} | HP {s.get('initialHp','')}")

print("\n--- profiles ---")
try:
    pr = load("operator_profiles.json")
    print("root:", list(pr)[:10] if isinstance(pr, dict) else type(pr))
    if isinstance(pr, dict):
        for k, v in pr.items():
            if isinstance(v, list):
                print(f"  {k}: list[{len(v)}]")
                if v:
                    print("  first keys:", list(v[0])[:30])
            elif isinstance(v, dict):
                print(f"  {k}: dict[{len(v)}]")
                first = next(iter(v.values()))
                if isinstance(first, dict):
                    print("  first value keys:", list(first)[:30])
except Exception as e:
    print("profiles failed:", e)
