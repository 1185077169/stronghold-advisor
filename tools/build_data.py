# -*- coding: utf-8 -*-
"""把上游 JSON 合并成前端可直接加载的 js/data.js。

数据来源：LBEILC/StrongholdAssistant（Apache-2.0）。
本脚本只读 vendor 目录的 JSON，不执行 vendor 里的任何 Python 文件。
"""
import datetime
import json
import os
import re

# 以脚本所在目录定位项目根目录，方便在 CI / 其他机器上构建
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "vendor", "stronghold-assistant")
OUT_JS = os.path.join(ROOT, "js", "data.js")
OUT_JSON = os.path.join(ROOT, "data", "season.json")

TIER_POWER = {1: 1.0, 2: 2.0, 3: 3.4, 4: 5.2, 5: 7.5, 6: 10.0}
ROLE_MAP = {
    "重装": "盾位",
    "医疗": "奶位",
    "狙击": "远程输出",
    "术师": "远程输出",
    "近卫": "近战输出",
    "先锋": "近战输出",
    "辅助": "辅助",
    "特种": "特种",
}
CORE_COLORS = {
    "炎": "#e05a3a",
    "萨尔贡": "#d6a84b",
    "维多利亚": "#c05a8a",
    "谢拉格": "#6fb7d8",
    "阿戈尔": "#3f8fbf",
    "叙拉古": "#8b5fb0",
    "卡西米尔": "#b8b8b8",
    "乌萨斯": "#6b7f9e",
    "伊比利亚": "#3fa88f",
    "莱塔尼亚": "#9a7fd1",
}
STRATEGY_MAP = {
    "炎": "band_yan",
    "萨尔贡": "band_sargon",
    "维多利亚": "band_victoria",
    "谢拉格": "band_kjerag",
    "阿戈尔": "band_egir",
    "叙拉古": "band_siracusa",
    "卡西米尔": "band_kazimier",
    "乌萨斯": "band_ursus",
    "伊比利亚": "band_iberia",
    "莱塔尼亚": "band_lethania",
}
ROLE_EQUIP = {
    "盾位": ["坚守盾牌", "歌利亚头盔", "不退者之盾"],
    "奶位": ["聚合急救箱", "护盾无人机", "萨尔贡浓茶"],
    "远程输出": ["精准狙击镜", "加速维式重锤", "奥术法阵"],
    "近战输出": ["维式重锤", "炎国短刀", "卡西米尔竞技旗"],
    "辅助": ["佣兵名牌", "多功能补剂", "卫戍推荐信"],
    "特种": ["突袭手雷", "迅捷作战粮", "伪装服"],
    "其他": ["维式重锤", "佣兵名牌"],
}
SPECIAL_EXTRAS = {"独行", "调和"}
# 玩家常用别名：数据里用本名，前端显示和搜索都认别名
ALIASES = {
    "暴躁铁皮": "大丑",
}

# 转职：变形同构体 + 下列道具 = 对应盟约（核心 + 附加）
JOB_CHANGE = {
    "维式重锤": "维多利亚",
    "战栗维式重锤": "维多利亚",
    "坚固维式重锤": "维多利亚",
    "加速维式重锤": "维多利亚",
    "灼燃维式重锤": "维多利亚",
    "电流维式重锤": "维多利亚",
    "终极维式重锤": "维多利亚",
    "萨尔贡浓茶": "萨尔贡",
    "叙拉古正装": "叙拉古",
    "炎国短刀": "炎",
    "阿戈尔重刃": "阿戈尔",
    "乌萨斯呼吸器": "乌萨斯",
    "伊比利亚骨刺刀": "伊比利亚",
    "卡西米尔竞技旗": "卡西米尔",
    "莱塔尼亚小鼓": "莱塔尼亚",
    "谢拉格不融冰": "谢拉格",
    "精准狙击镜": "精准",
    "迅捷作战粮": "迅捷",
    "奥术法阵": "奥术",
    "坚守盾牌": "坚守",
    "突袭手雷": "突袭",
    "不屈弹射器": "不屈",
    "变形同构体": "看配对道具",
}


def load(name):
    with open(os.path.join(VENDOR, name), encoding="utf-8") as f:
        return json.load(f)


def skill_obj(s):
    if not isinstance(s, dict) or not s.get("name"):
        return None
    return {
        "name": s.get("name"),
        "desc": s.get("description", ""),
        "sp": s.get("spCost"),
        "init": s.get("initSp"),
        "dur": s.get("duration"),
        "type": s.get("spType", ""),
    }


def normalize_modules(pr):
    mods = pr.get("modules")
    out = []
    if isinstance(mods, list):
        for m in mods:
            if isinstance(m, dict):
                out.append(m.get("name") or m.get("id") or "")
            else:
                out.append(str(m))
    elif isinstance(mods, dict):
        for k, v in mods.items():
            if isinstance(v, dict):
                out.append(v.get("name") or k)
            else:
                out.append(k)
    return [x for x in out if x]


def infer_role(pr):
    roles = pr.get("roles") or []
    if roles:
        return roles[0]
    return ROLE_MAP.get(pr.get("profession", ""), "其他")


def stack_power(pr):
    st = pr.get("stack")
    if not isinstance(st, dict):
        return 0.0
    per = st.get("perRound") or 0
    try:
        per = float(per)
    except (TypeError, ValueError):
        per = 0.0
    return min(per * 0.35, 5.0)


def op_power(op, pr):
    tier = int(op.get("tier") or 1)
    score = TIER_POWER.get(tier, 1.0)
    stats = pr.get("eliteStats") or {}
    dps = stats.get("dps") or 0
    try:
        dps = float(dps)
    except (TypeError, ValueError):
        dps = 0.0
    score += min(dps / 150.0, 5.0)
    score += stack_power(pr)
    role = infer_role(pr)
    if role in ("盾位", "奶位"):
        score += 2.2
    if pr.get("position") == "远程":
        score += 0.8
    return round(score, 2)


def main():
    ops_raw = load("operators.json")["operators"]
    profiles = load("operator_profiles.json")["operators"]
    cov_root = load("covenants.json")
    effects = load("covenant_effects.json")["covenants"]
    equipment = load("equipment.json")["equipment"]
    strategies = load("strategies.json")["strategies"]
    income = load("round_income.json")
    season = load("operator_profiles.json").get("season", "unknown")

    core_names = [c["name"] for c in cov_root["covenants"] if c["bondType"] == "SEASON"]
    extra_names = [c["name"] for c in cov_root["covenants"] if c["bondType"] != "SEASON"]
    cov_by_name = {c["name"]: c for c in cov_root["covenants"]}

    operators = []
    op_by_name = {}
    for op in ops_raw:
        name = op["name"]
        pr = profiles.get(name, {})
        roles = pr.get("roles") or []
        role = infer_role(pr)
        traits = []
        for t in (op.get("normal", {}).get("traits") or []):
            if isinstance(t, dict) and t.get("traitDescription"):
                traits.append(t["traitDescription"])
        skills = []
        for sid, sv in (pr.get("skills") or {}).items():
            if not isinstance(sv, dict):
                continue
            n = (sv.get("normal") or {}).get("skill") or {}
            e = (sv.get("elite") or {}).get("skill") or {}
            skills.append({
                "id": sid,
                "name": n.get("name") or e.get("name") or sid,
                "normal": skill_obj(n),
                "elite": skill_obj(e),
            })
        obj = {
            "name": name,
            "alias": ALIASES.get(name, ""),
            "obtain": op.get("obtain", ""),
            "tier": int(op.get("tier") or 1),
            "core": op.get("coreCovenants") or [],
            "extra": op.get("additionalCovenants") or [],
            "icon": op.get("iconPath", ""),
            "profession": pr.get("profession", ""),
            "subProfession": pr.get("subProfession", ""),
            "position": pr.get("position", ""),
            "block": pr.get("blockCount"),
            "roles": roles,
            "role": role,
            "stack": pr.get("stack"),
            "traits": traits,
            "normalSkill": skill_obj(pr.get("normalSkill")),
            "eliteSkill": skill_obj(pr.get("eliteSkill")),
            "skills": skills,
            "modules": normalize_modules(pr),
            "stats": pr.get("eliteStats") or pr.get("normalStats") or {},
            "power": op_power(op, pr),
        }
        operators.append(obj)
        op_by_name[name] = obj

    def display_name(o):
        return ALIASES.get(o["name"], o["name"])

    def power_of(name):
        return op_by_name.get(name, {}).get("power", 0)

    def sort_by_power(lst):
        return sorted(lst, key=lambda o: (-power_of(o["name"]), o["name"]))

    core_roster = {c: [] for c in core_names}
    for op in operators:
        for c in op["core"]:
            if c in core_roster:
                core_roster[c].append(op)

    comps = []
    extra_usage = {}
    comp_index = 0

    def make_comp(core, core6, core6_names, best_extra, pool, index):
        outside = [o for o in operators if best_extra in o["extra"] and o["name"] not in core6_names]
        outside = [o for o in outside if o["tier"] <= 5] or outside
        outside = sort_by_power(outside)
        flex = []
        # 核心 6 人缺奶位时，优先用外援补一个奶位
        if not any("奶位" in (o["roles"] or [o["role"]]) for o in core6):
            healers = [o for o in outside if "奶位" in (o["roles"] or [o["role"]])]
            if healers:
                flex.append(healers[0])
        for o in outside:
            if len(flex) >= 2:
                break
            if o not in flex:
                flex.append(o)
        # 不足 8 人时用同核心高强度干员补齐
        for o in pool:
            if len(core6) + len(flex) >= 8:
                break
            if o["name"] not in core6_names and all(o["name"] != f["name"] for f in flex):
                flex.append(o)
        flex = flex[:max(0, 8 - len(core6))]
        comp_ops = core6 + flex
        comp_names = [o["name"] for o in comp_ops]

        # 装备建议：按角色给 1 件通用装备
        equip_plan = []
        for o in comp_ops:
            items = ROLE_EQUIP.get(o["role"], ROLE_EQUIP["其他"])
            equip_plan.append({"op": display_name(o), "item": items[0]})
        equip_names = []
        for e in equip_plan:
            if e["item"] not in equip_names:
                equip_names.append(e["item"])

        key_op = max(core6, key=lambda o: o["power"]) if core6 else comp_ops[0]
        avg_tier = sum(o["tier"] for o in comp_ops) / max(1, len(comp_ops))
        difficulty = "低" if avg_tier <= 3.6 else ("中" if avg_tier <= 4.6 else "高")

        early_ops = [display_name(o) for o in core6 if o["tier"] <= 3]
        if not early_ops:
            early_ops = [display_name(o) for o in sorted(core6, key=lambda x: x["tier"])[:2]]
        mid_ops = [display_name(o) for o in core6 if 4 <= o["tier"] <= 5]
        late_ops = [display_name(o) for o in core6 if o["tier"] >= 6]
        flex_names = [display_name(o) for o in flex]
        key_name = display_name(key_op)
        phases = {
            "early": (
                f"前 3 回合：优先抓 {'、'.join(early_ops) if early_ops else '低阶核心'} "
                f"凑 3 名【{core}】激活基础盟约；用 1-2 名外援过渡，不要深刷，资金优先升 2-3 本。"
            ),
            "mid": (
                f"4-8 回合：补 {'、'.join(mid_ops) if mid_ops else '中阶核心'}，"
                f"凑 6 名【{core}】解锁进阶；外援 {'、'.join(flex_names) if flex_names else '按需'} 到位；"
                f"5-6 本找 {key_name}。"
            ),
            "late": (
                f"9 回合后：补齐 8 人，找 {'、'.join(late_ops) if late_ops else '6 本上限卡'}；"
                f"优先把 {key_name} 升精锐，装备给主 C/盾位。"
            ),
        }

        core_eff = effects.get(core, [])
        extra_eff = effects.get(best_extra, []) if best_extra else []
        strategy_id = STRATEGY_MAP.get(core)
        strategy = next((s for s in strategies if s.get("id") == strategy_id), None)
        if not strategy:
            strategy = next((s for s in strategies if core in (s.get("description") or "")), None)

        raw_strength = sum(o["power"] for o in core6) + 0.6 * sum(o["power"] for o in flex)
        return {
            "id": f"comp-{index}",
            "name": f"{core}·{best_extra}" if best_extra else f"{core}·标准",
            "core": core,
            "extra": best_extra,
            "color": CORE_COLORS.get(core, "#8b949e"),
            "size": len(comp_ops),
            "essential": [o["name"] for o in core6],
            "flex": [o["name"] for o in flex],
            "ops": comp_names,
            "tiers": {o["name"]: o["tier"] for o in comp_ops},
            "key": key_op["name"],
            "difficulty": difficulty,
            "phases": phases,
            "strategy": strategy["id"] if strategy else None,
            "strategyName": strategy["name"] if strategy else "",
            "equipmentPlan": equip_plan,
            "equipmentNames": equip_names,
            "coreEffect": core_eff[0]["text"] if core_eff else "",
            "extraEffect": extra_eff[0]["text"] if extra_eff else "",
            "notes": (
                f"核心 6 人：{'、'.join(display_name(o) for o in core6)}；"
                f"外援 {len(flex)} 人：{'、'.join(display_name(o) for o in flex) if flex else '无'}。"
                f"优先把 {key_name} 升精锐；6 名不同【{core}】解锁进阶，"
                f"【{best_extra}】需要 2 人激活。"
            ),
            "rawStrength": round(raw_strength, 2),
        }

    for core in core_names:
        pool = sort_by_power(core_roster.get(core, []))
        if not pool:
            continue
        chosen = []
        # 先保证 1 盾位、1 奶位，再按强度补满 6 人
        for role in ("盾位", "奶位"):
            cand = [o for o in pool if role in (o["roles"] or [o["role"]]) and o not in chosen]
            if cand:
                chosen.append(cand[0])
        for o in pool:
            if len(chosen) >= 6:
                break
            if o not in chosen:
                chosen.append(o)
        core6 = chosen[:6]
        core6_names = {o["name"] for o in core6}

        # 为每个核心盟约挑 3 个不同的附加盟约轴，生成 3 套变体
        candidates = []
        for e in extra_names:
            if e in SPECIAL_EXTRAS:
                continue
            bridge = [o for o in core6 if e in o["extra"]]
            outside_all = [o for o in operators if e in o["extra"] and o["name"] not in core6_names]
            if len(bridge) + len(outside_all) < 2:
                continue
            # 优先 5 阶及以下，避免每套阵容都塞两个 T6
            outside = [o for o in outside_all if o["tier"] <= 5] or outside_all
            outside = sort_by_power(outside)
            score = len(bridge) * 6.0 + sum(o["power"] for o in outside[:2])
            score -= extra_usage.get(e, 0) * 1.5
            score -= sum(1.5 for o in outside[:2] if o["tier"] >= 6)
            candidates.append((score, e))
        candidates.sort(key=lambda x: (-x[0], x[1]))

        chosen_extras = [e for _, e in candidates[:3]]
        if not chosen_extras:
            continue
        for best_extra in chosen_extras:
            comp_index += 1
            comps.append(make_comp(core, core6, core6_names, best_extra, pool, comp_index))
            extra_usage[best_extra] = extra_usage.get(best_extra, 0) + 1

    # 归一化强度到 0.55 - 1.0
    raw_values = [c["rawStrength"] for c in comps]
    lo, hi = min(raw_values), max(raw_values)
    for c in comps:
        if hi > lo:
            c["strength"] = round(0.55 + 0.45 * (c["rawStrength"] - lo) / (hi - lo), 3)
        else:
            c["strength"] = 0.75
        c.pop("rawStrength", None)

    # 合并主播/社区实战阵容（data/curated_comps.json）
    curated_path = os.path.join(ROOT, "data", "curated_comps.json")
    curated_count = 0
    if os.path.exists(curated_path):
        alias_to_name = {v: k for k, v in ALIASES.items()}
        equipment_names_set = {e["name"] for e in equipment}

        def resolve_op(name):
            if name in op_by_name:
                return name
            return alias_to_name.get(name)

        with open(curated_path, encoding="utf-8") as f:
            curated_raw = json.load(f)

        for raw in curated_raw:
            essential = [resolve_op(n) for n in raw.get("essential", [])]
            flex = [resolve_op(n) for n in raw.get("flex", [])]
            missing = [n for n in (raw.get("essential", []) + raw.get("flex", [])) if resolve_op(n) is None]
            if missing:
                print("WARN curated", raw.get("id"), "missing ops:", missing)
                continue

            essential = list(dict.fromkeys([n for n in essential if n]))
            flex = [n for n in dict.fromkeys([n for n in flex if n]) if n not in essential]
            ops = essential + flex
            if not ops:
                continue

            key = resolve_op(raw.get("key")) or max(essential, key=lambda n: op_by_name[n]["power"])
            loadout = []
            equip_plan = []
            equip_names = []
            for row in raw.get("loadout", []):
                op_id = resolve_op(row.get("opId") or row.get("op") or "")
                if not op_id:
                    print("WARN curated", raw.get("id"), "unknown loadout op", row.get("opId") or row.get("op"))
                    continue
                items = []
                for it in row.get("items", []):
                    name = it.get("name")
                    if name not in equipment_names_set:
                        print("WARN curated", raw.get("id"), "unknown equipment", name)
                        continue
                    item = {"name": name}
                    for k in ("qty", "jobChangeTo", "note", "generic"):
                        if k in it:
                            item[k] = it[k]
                    items.append(item)
                    if name not in equip_names:
                        equip_names.append(name)
                loadout.append({
                    "op": display_name(op_by_name[op_id]),
                    "opId": op_id,
                    "items": items,
                    "note": row.get("note", ""),
                })
                if items:
                    equip_plan.append({"op": display_name(op_by_name[op_id]), "item": items[0]["name"]})

            if not equip_plan:
                for n in ops:
                    o = op_by_name[n]
                    equip_plan.append({
                        "op": display_name(o),
                        "item": ROLE_EQUIP.get(o["role"], ROLE_EQUIP["其他"])[0],
                    })

            core_eff = effects.get(raw["core"], [])
            extra_eff = effects.get(raw.get("extra"), []) if raw.get("extra") else []
            strategy = next((s for s in strategies if s.get("id") == raw.get("strategy")), None)

            comps.append({
                "id": raw["id"],
                "name": raw["name"],
                "core": raw["core"],
                "extra": raw.get("extra"),
                "color": CORE_COLORS.get(raw["core"], "#8b949e"),
                "size": len(ops),
                "essential": essential,
                "flex": flex,
                "ops": ops,
                "tiers": {n: op_by_name[n]["tier"] for n in ops},
                "key": key,
                "difficulty": raw.get("difficulty", "高"),
                "phases": raw.get("phases", {}),
                "strategy": raw.get("strategy"),
                "strategyName": strategy["name"] if strategy else "",
                "equipmentPlan": equip_plan,
                "equipmentNames": equip_names,
                "coreEffect": core_eff[0]["text"] if core_eff else "",
                "extraEffect": extra_eff[0]["text"] if extra_eff else "",
                "notes": raw.get("notes", ""),
                "strength": float(raw.get("strength", 0.9)),
                "curated": True,
                "source": raw.get("source", ""),
                "sourceUrl": raw.get("sourceUrl", ""),
                "loadout": loadout,
            })
            curated_count += 1

    cov_out = {"core": [], "extra": []}
    for name in core_names:
        c = cov_by_name[name]
        cov_out["core"].append({
            "name": name,
            "activateCount": c.get("activateCount", 3),
            "color": CORE_COLORS.get(name, "#8b949e"),
            "effects": effects.get(name, []),
        })
    for name in extra_names:
        c = cov_by_name[name]
        cov_out["extra"].append({
            "name": name,
            "activateCount": c.get("activateCount", 2),
            "effects": effects.get(name, []),
        })

    equipment_out = []
    for e in equipment:
        equipment_out.append({
            "name": e["name"],
            "tier": e["tier"],
            "icon": e.get("iconPath", ""),
            "normal": (e.get("normal") or {}).get("effectDescription", ""),
            "elite": (e.get("elite") or {}).get("effectDescription", ""),
            "jobChangeTo": JOB_CHANGE.get(e["name"], ""),
        })

    strategies_out = []
    for s in strategies:
        strategies_out.append({
            "id": s["id"],
            "name": s["name"],
            "initiator": s.get("initiator", ""),
            "desc": s.get("description", ""),
            "hp": s.get("initialHp"),
            "unlock": s.get("unlockRequirement", ""),
        })

    payload = {
        "meta": {
            "season": season,
            "generated": datetime.date.today().isoformat(),
            "source": "LBEILC/StrongholdAssistant (Apache-2.0)",
            "notice": "非官方个人工具；《明日方舟》相关名称、角色、数据版权归鹰角网络所有。",
        },
        "covenants": cov_out,
        "operators": operators,
        "equipment": equipment_out,
        "strategies": strategies_out,
        "income": income,
        "comps": comps,
        "shopWeights": {
            "note": "官方未公开精确权重；以下为近似模型，仅用于比较不同本数/目标的相对难度。",
            "slots": 5,
            "weights": {
                "1": {"1": 1.0},
                "2": {"1": 0.7, "2": 0.3},
                "3": {"1": 0.4, "2": 0.4, "3": 0.2},
                "4": {"1": 0.2, "2": 0.35, "3": 0.35, "4": 0.1},
                "5": {"1": 0.1, "2": 0.25, "3": 0.35, "4": 0.22, "5": 0.08},
                "6": {"1": 0.05, "2": 0.15, "3": 0.3, "4": 0.3, "5": 0.15, "6": 0.05},
            },
        },
    }

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 由 tools/build_data.py 生成，勿手改。\n")
        f.write("// 数据来源：LBEILC/StrongholdAssistant（Apache-2.0）。\n")
        f.write("window.SEASON = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print("written", OUT_JS)
    print("operators", len(operators), "comps", len(comps), "equipment", len(equipment_out))
    print("size", os.path.getsize(OUT_JS), "bytes")
    for c in comps:
        print(f"  {c['name']} | strength={c['strength']} | difficulty={c['difficulty']} | ops={','.join(c['ops'])}")


if __name__ == "__main__":
    main()
