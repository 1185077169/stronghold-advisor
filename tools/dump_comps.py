# -*- coding: utf-8 -*-
import json

with open(r"D:\卫戍协议助手\data\season.json", encoding="utf-8") as f:
    d = json.load(f)

by_name = {o["name"]: o for o in d["operators"]}
lines = []
for c in d["comps"]:
    lines.append(f"{c['name']} | strength={c['strength']} | 难度={c['difficulty']} | 策略：{c['strategyName']} | 上限：{c['key']}")
    parts = []
    for n in c["ops"]:
        o = by_name[n]
        tag = "*" if n in c["essential"] else "+"
        parts.append(f"{tag}{n}(T{o['tier']},{o['role']})")
    lines.append("  " + " ".join(parts))
    lines.append("  装备：" + "，".join(f"{e['op']}={e['item']}" for e in c["equipmentPlan"]))
    lines.append("")

with open(r"D:\卫戍协议助手\tools\comps.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("ok", len(d["comps"]))
