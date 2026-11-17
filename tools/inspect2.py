# -*- coding: utf-8 -*-
"""生成可读的数据审计文件（UTF-8），供人工设计阵容库。"""
import json
import os
import collections

D = r"D:\卫戍协议助手\vendor\stronghold-assistant"
OUT = r"D:\卫戍协议助手\tools\audit.txt"
lines = []


def p(*args):
    lines.append(" ".join(str(a) for a in args))


def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as f:
        return json.load(f)


ops = load("operators.json")["operators"]
profiles = load("operator_profiles.json")["operators"]
cov_root = load("covenants.json")
core = [c["name"] for c in cov_root["covenants"] if c["bondType"] == "SEASON"]
extra = [c["name"] for c in cov_root["covenants"] if c["bondType"] != "SEASON"]

p("SEASON:", load("operator_profiles.json").get("season"))
p("OPS:", len(ops), "PROFILES:", len(profiles))
p("CORE:", ", ".join(core))
p("EXTRA:", ", ".join(extra))
p("")

by_core = collections.defaultdict(list)
for o in ops:
    for c in o.get("coreCovenants", []):
        by_core[c].append(o)

for c in core:
    lst = sorted(by_core[c], key=lambda o: (-o["tier"], o["name"]))
    p(f"## {c} ({len(lst)})")
    for o in lst:
        pr = profiles.get(o["name"], {})
        role = ",".join(pr.get("roles", [])) if isinstance(pr.get("roles"), list) else pr.get("roles", "")
        stack = pr.get("stack", "")
        if isinstance(stack, list):
            stack = ",".join(str(s) for s in stack)
        p(f"  T{o['tier']} {o['name']} | extra={','.join(o.get('additionalCovenants', []))} | role={role} | stack={stack}")
    p("")

p("## EQUIPMENT")
for e in sorted(load("equipment.json")["equipment"], key=lambda x: (x["tier"], x["name"])):
    p(f"  T{e['tier']} {e['name']} | {e['normal'].get('effectDescription','')} | elite: {e['elite'].get('effectDescription','')}")

p("")
p("## STRATEGIES")
for s in load("strategies.json")["strategies"]:
    p(f"  {s['id']} | {s['name']} | initiator={s.get('initiator','')} | HP={s.get('initialHp','')} | {s.get('description','')[:120]}")

p("")
p("## PROFILE SAMPLE")
sample_name = next(iter(profiles))
p("NAME:", sample_name)
p(json.dumps(profiles[sample_name], ensure_ascii=False, indent=2)[:4000])

p("")
p("## ROLE VOCAB")
roles = collections.Counter()
for pr in profiles.values():
    r = pr.get("roles", [])
    if isinstance(r, list):
        for x in r:
            roles[x] += 1
p(", ".join(f"{k}:{v}" for k, v in roles.most_common()))

p("")
p("## STACK VOCAB")
stacks = collections.Counter()
for pr in profiles.values():
    s = pr.get("stack", "")
    if isinstance(s, list):
        for x in s:
            stacks[str(x)] += 1
    elif s:
        stacks[str(s)] += 1
p(", ".join(f"{k}:{v}" for k, v in stacks.most_common(40)))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("written", OUT, len(lines), "lines")
