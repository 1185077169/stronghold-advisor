/* 卫戍协议 · 推荐引擎 v2
 * 盟约优先：先选核心/附加盟约，再按完成度、可达性、强度、装备、盟约激活评分。
 * 不依赖回合数；所有计算在浏览器本地完成。
 */
window.Engine = (function () {
  "use strict";

  var S = null;
  var opMap = {};
  var coreColor = {};
  var strategyMap = {};
  var coreNames = [];

  var STRATEGY_CORE = {
    band_yan: "炎",
    band_yan2: "炎",
    band_sargon: "萨尔贡",
    band_pepe: "萨尔贡",
    band_victoria: "维多利亚",
    band_harold: "维多利亚",
    band_kjerag: "谢拉格",
    band_kjerag2: "谢拉格",
    band_egir: "阿戈尔",
    band_clementia: "阿戈尔",
    band_siracusa: "叙拉古",
    band_bond: "叙拉古",
    band_kazimier: "卡西米尔",
    band_mlynar: "卡西米尔",
    band_ursus: "乌萨斯",
    band_iberia: "伊比利亚",
    band_lethania: "莱塔尼亚"
  };

  function init(season) {
    S = season;
    opMap = {};
    S.operators.forEach(function (op) { opMap[op.name] = op; });
    coreColor = {};
    S.covenants.core.forEach(function (c) { coreColor[c.name] = c.color; });
    strategyMap = {};
    (S.strategies || []).forEach(function (s) { strategyMap[s.id] = s; });
    coreNames = S.covenants.core.map(function (c) { return c.name; });
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function roman(n) {
    return ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"][n] || String(n);
  }

  function colorOf(core) {
    return coreColor[core] || "#8b949e";
  }

  function isOwned(op, state) {
    return state.mode === "all" || state.owned.has(op.name);
  }

  /** 目标干员在当前本数下的可达性（0-1，用于评分，不是精确概率）。 */
  function availability(op, state) {
    if (!op) return 0;
    if (state.board.has(op.name)) return 1;
    if (!isOwned(op, state)) return 0.05;
    if (op.tier > state.level) return 0.08;
    return clamp(0.42 + (state.level - op.tier) * 0.11, 0.15, 0.95);
  }

  /** 策略偏向的核心盟约；通用策略返回空串。 */
  function strategyCoreOf(strategy) {
    if (!strategy) return "";
    if (STRATEGY_CORE[strategy.id]) return STRATEGY_CORE[strategy.id];
    var d = strategy.desc || "";
    for (var i = 0; i < coreNames.length; i++) {
      if (d.indexOf("【" + coreNames[i] + "】") >= 0) return coreNames[i];
    }
    return "";
  }

  function strategyTags(strategy) {
    var d = (strategy && strategy.desc) || "";
    var tags = [];
    if (/资金|刷新|购买|调度中心|升级|获得\d*资金/.test(d)) tags.push("economy");
    if (/精锐|晋升/.test(d)) tags.push("elite");
    if (/部署|再部署/.test(d)) tags.push("deploy");
    if (/生命|防御|护盾|治疗|回复/.test(d)) tags.push("defense");
    if (/攻击|伤害|攻速|技力/.test(d)) tags.push("offense");
    if (/召唤/.test(d)) tags.push("summon");
    if (/特殊干员|装备/.test(d)) tags.push("equipment");
    return tags;
  }

  /** 策略与阵容的契合度（0-1）。没有选策略时返回 0.5 中性值。 */
  function strategyFit(comp, strategy) {
    if (!strategy) return 0.5;
    var fit = 0.35;
    var core = strategyCoreOf(strategy);
    if (core === comp.core) fit += 0.45;
    else if (core) fit -= 0.15;

    var d = strategy.desc || "";
    if (comp.strategy && strategy.id === comp.strategy) fit += 0.2;
    if (comp.extra && d.indexOf(comp.extra) >= 0) fit += 0.1;

    var tags = strategyTags(strategy);
    if (tags.indexOf("economy") >= 0 &&
      ["远见", "奇迹", "投资人", "助力"].indexOf(comp.extra) >= 0) fit += 0.12;
    if (tags.indexOf("elite") >= 0) {
      var keyTier = (comp.tiers && comp.tiers[comp.key]) || 0;
      if (comp.difficulty === "高" || keyTier >= 6) fit += 0.08;
    }
    if (tags.indexOf("deploy") >= 0 &&
      (["卡西米尔", "叙拉古"].indexOf(comp.core) >= 0 ||
        ["突袭", "不屈"].indexOf(comp.extra) >= 0)) fit += 0.08;
    if (tags.indexOf("defense") >= 0 &&
      ["坚守", "不屈", "协防干员"].indexOf(comp.extra) >= 0) fit += 0.08;
    if (tags.indexOf("offense") >= 0 &&
      ["精准", "奥术", "灵巧", "迅捷"].indexOf(comp.extra) >= 0) fit += 0.08;
    if (tags.indexOf("summon") >= 0 &&
      ["莱塔尼亚", "谢拉格"].indexOf(comp.core) >= 0) fit += 0.06;
    if (tags.indexOf("equipment") >= 0 &&
      (comp.loadout || keyTier >= 5)) fit += 0.08;

    return clamp(fit, 0, 1);
  }

  function strategyInfo(id) {
    var s = strategyMap[id];
    if (!s) return null;
    return { strategy: s, core: strategyCoreOf(s), tags: strategyTags(s) };
  }

  var PHASE_TEXT = {
    economy: {
      early: "经济策略：前期不要深刷，靠【{name}】的刷新/资金效果白嫖核心，优先升 2-3 本。",
      mid: "中期用经济滚雪球，刷新优先找核心 6 人，外援可以晚一点。",
      late: "后期把资金转成精锐和装备，别留钱。"
    },
    elite: {
      early: "精锐策略：低阶核心优先三合一，利用【{name}】的晋升/精锐效果滚雪球。",
      mid: "中期把主 C 升精锐，精锐卡是这套的战力核心。",
      late: "后期补第二/第三个精锐，装备集中给精锐主 C。"
    },
    deploy: {
      early: "部署策略：多用低费/再部署触发【{name}】，前期以卡西米尔/突袭干员过渡。",
      mid: "中期保持频繁部署，吃满部署带来的攻击/生命加成。",
      late: "后期用再部署/复活拖时间，主 C 吃满部署加成。"
    },
    defense: {
      early: "防御策略：前期优先拿坚守/不屈盾位，靠【{name}】稳住血量。",
      mid: "中期补奶位/减伤，靠防守反击叠层。",
      late: "后期前排成型后再补输出，别急着上脆皮。"
    },
    offense: {
      early: "输出策略：前期优先精准/奥术/灵巧低阶输出，快速清怪。",
      mid: "中期把攻速/法伤轴补齐，主 C 吃满【{name}】的加成。",
      late: "后期补爆发/穿透，优先升主 C 精锐。"
    },
    summon: {
      early: "召唤策略：前期拿莱塔尼亚/谢拉格低阶召唤件过渡。",
      mid: "中期补召唤物数量/上限，靠召唤物挡线。",
      late: "后期召唤物吃满盟约层数，主 C 补爆发。"
    },
    equipment: {
      early: "装备策略：前期优先拿【{name}】送的装备/特殊干员，围绕装备位过渡。",
      mid: "中期把装备集中给主 C，利用装备差滚雪球。",
      late: "后期补高阶装备/转职，主 C 吃满。"
    }
  };
  var GENERIC_PHASE = {
    early: "按【{name}】的节奏走：前期优先凑 3 名核心，不要深刷。",
    mid: "中期补 6 名核心和外援，按策略效果决定升本/刷新。",
    late: "后期补齐 8 人，主 C 升精锐。"
  };

  var ROLE_EQUIP = {
    "盾位": ["坚守盾牌", "歌利亚头盔"],
    "奶位": ["聚合急救箱", "护盾无人机"],
    "远程输出": ["精准狙击镜", "加速维式重锤"],
    "近战输出": ["维式重锤", "炎国短刀"],
    "辅助": ["佣兵名牌", "多功能补剂"],
    "特种": ["突袭手雷", "迅捷作战粮"],
    "其他": ["维式重锤", "佣兵名牌"]
  };

  var CORE_JOB_ITEM = {
    "维多利亚": "维式重锤",
    "萨尔贡": "萨尔贡浓茶",
    "叙拉古": "叙拉古正装",
    "炎": "炎国短刀",
    "阿戈尔": "阿戈尔重刃",
    "乌萨斯": "乌萨斯呼吸器",
    "伊比利亚": "伊比利亚骨刺刀",
    "卡西米尔": "卡西米尔竞技旗",
    "莱塔尼亚": "莱塔尼亚小鼓",
    "谢拉格": "谢拉格不融冰",
    "精准": "精准狙击镜",
    "迅捷": "迅捷作战粮",
    "奥术": "奥术法阵",
    "坚守": "坚守盾牌",
    "突袭": "突袭手雷",
    "不屈": "不屈弹射器"
  };

  /** 当前策略下的前中后期过渡：策略标签句 + 该阵容的具体干员节奏。 */
  function phasePlan(comp, strategy) {
    var base = comp.phases || {};
    if (!strategy) return base;

    var tags = strategyTags(strategy);
    var tag = tags[0] || "";
    var text = PHASE_TEXT[tag] || GENERIC_PHASE;
    var core = strategyCoreOf(strategy);
    var relation = "";
    if (core && comp.core) {
      relation = core === comp.core
        ? "本套与【" + core + "】同核心，优先按策略找核心卡。"
        : "策略偏向【" + core + "】，本套需靠外援/装备补节奏。";
    }
    function fill(s) {
      return (s || "").replace(/\{name\}/g, strategy.name);
    }
    return {
      early: fill(text.early) + (relation ? " " + relation : "") + " " + (base.early || ""),
      mid: fill(text.mid) + " " + (base.mid || ""),
      late: fill(text.late) + " " + (base.late || "")
    };
  }

  /** 自配阵容的前中后期思路：按已选干员等阶 + 当前策略生成。 */
  function customPhasePlan(custom, state) {
    var ops = (custom.ops || []).map(function (n) { return opMap[n]; }).filter(Boolean);
    if (!ops.length) {
      return {
        early: "先加干员：优先凑 3 名同核心激活基础盟约。",
        mid: "补到 6 名核心，再补 2 名外援。",
        late: "补齐 8-9 人，主 C 升精锐。"
      };
    }
    var core = custom.core;
    var extra = custom.extra;
    var sorted = ops.slice().sort(function (a, b) { return a.tier - b.tier; });
    var earlyCore = sorted.filter(function (o) { return o.core.indexOf(core) >= 0 && o.tier <= 3; });
    var earlyFallback = !earlyCore.length;
    var early = earlyFallback ? sorted.slice(0, 2) : earlyCore;
    var mid = sorted.filter(function (o) { return o.core.indexOf(core) >= 0 && o.tier >= 4 && o.tier <= 5; });
    var late = sorted.filter(function (o) { return o.core.indexOf(core) >= 0 && o.tier >= 6; });
    var flex = extra ? ops.filter(function (o) { return o.extra.indexOf(extra) >= 0; }) : [];
    var key = ops.slice().sort(function (a, b) { return (b.power || 0) - (a.power || 0); })[0];
    var keyName = key ? (key.alias || key.name) : "主 C";
    function names(list) {
      return list.map(function (o) { return o.alias || o.name; }).join("、");
    }
    var base = {
      early: earlyFallback
        ? "前 3 回合：这套缺 3 阶以下核心卡，先用低阶外援/本家卡过渡，见到 " +
          names(early) + " 再换上；不要深刷，资金优先升 2-3 本。"
        : "前 3 回合：优先抓 " + names(early) +
          " 凑 3 名【" + core + "】激活基础盟约；不要深刷，资金优先升 2-3 本。",
      mid: "4-8 回合：补 " + (names(mid) || "中阶核心") +
        " 凑 6 名【" + core + "】" +
        (extra ? "；外援 " + (names(flex) || "按需") + " 到位" : "") +
        "；5-6 本找 " + keyName + "。",
      late: "9 回合后：补齐 " + (state.deployLimit || 8) + " 人，把 " +
        (names(late) || "6 本上限卡") + " 作为后期核心培养；优先升精锐，装备给主 C/盾位。"
    };
    return phasePlan({ core: core, extra: extra, phases: base }, strategyMap[state.strategy] || null);
  }

  /** 自配阵容的逐干员装备：角色通用件 + 缺核心/外援时的转职建议。 */
  function customLoadout(custom, state) {
    var core = custom.core;
    var extra = custom.extra;
    var coreItem = CORE_JOB_ITEM[core] || "";
    var rows = [];
    (custom.ops || []).forEach(function (name) {
      var op = opMap[name];
      if (!op) return;
      var isCore = op.core.indexOf(core) >= 0;
      var roleItems = ROLE_EQUIP[op.role] || ROLE_EQUIP["其他"];
      var items = [];
      items.push({ name: roleItems[0], generic: true });
      if (roleItems[1]) items.push({ name: roleItems[1], generic: true });

      var note = "按角色给通用装备。";
      if (!isCore && coreItem) {
        items.push({ name: "变形同构体", jobChangeTo: core, note: "需与" + coreItem + "同装" });
        items.push({ name: coreItem, jobChangeTo: core });
        note = "非核心：可用「变形同构体 + " + coreItem + "」转成【" + core + "】。";
      }
      rows.push({
        op: op.alias || op.name,
        opId: op.name,
        items: items,
        note: note
      });
    });
    return rows;
  }

  function matchFilter(comp, state) {
    if (state.onlyCurated && !comp.curated) return false;
    if (state.selectedCore && comp.core !== state.selectedCore) return false;
    if (state.selectedExtra && comp.extra !== state.selectedExtra) return false;
    return true;
  }

  function scoreComp(comp, state) {
    if (state.banCore.has(comp.core)) return null;
    if (comp.extra && state.banExtra.has(comp.extra)) return null;

    var bannedOps = comp.ops.filter(function (n) { return state.banOps.has(n); });
    if (bannedOps.length >= 2) return null;

    var coreOnBoard = comp.essential.filter(function (n) { return state.board.has(n); });
    var extraOnBoard = comp.flex.filter(function (n) { return state.board.has(n); });
    var coreRatio = coreOnBoard.length / comp.essential.length;
    var extraRatio = comp.flex.length ? extraOnBoard.length / comp.flex.length : 1;
    var completion = 0.75 * coreRatio + 0.25 * extraRatio;

    var missing = comp.ops.filter(function (n) { return !state.board.has(n); });
    var missingCore = comp.essential.filter(function (n) { return !state.board.has(n); });
    var missingExtra = comp.flex.filter(function (n) { return !state.board.has(n); });

    var avail = 1;
    if (missing.length) {
      avail = missing.reduce(function (sum, n) {
        return sum + availability(opMap[n], state);
      }, 0) / missing.length;
    }

    var equipNames = comp.equipmentNames || [];
    var equipScore = 0.6;
    if (state.equipment.size && equipNames.length) {
      var hit = equipNames.filter(function (n) { return state.equipment.has(n); }).length;
      equipScore = hit / equipNames.length;
    }

    var coreAct = coreOnBoard.length >= 6 ? 1 : coreOnBoard.length >= 3 ? 0.6 : 0;
    var extraAct = comp.flex.length
      ? (extraOnBoard.length >= 2 ? 1 : extraOnBoard.length >= 1 ? 0.4 : 0)
      : 1;
    var covenant = coreAct * 0.7 + extraAct * 0.3;

    var contest = 0;
    if (state.teammates.has(comp.core)) contest += 0.12;
    if (comp.extra && state.teammates.has(comp.extra)) contest += 0.04;
    var banPenalty = bannedOps.length * 0.08;

    var strategy = strategyMap[state.strategy] || null;
    var sFit = strategyFit(comp, strategy);

    var raw = 0.34 * completion + 0.22 * comp.strength + 0.18 * avail +
      0.08 * equipScore + 0.1 * covenant + 0.08 * sFit - contest - banPenalty;
    var score = clamp(raw, 0, 1) * 100;

    var reasons = [];
    reasons.push("核心上场 " + coreOnBoard.length + "/" + comp.essential.length);
    if (comp.flex.length) reasons.push("外援上场 " + extraOnBoard.length + "/" + comp.flex.length);
    reasons.push("可达性 " + Math.round(avail * 100) + "%");
    reasons.push("数据强度 " + Math.round(comp.strength * 100));
    reasons.push("成型难度 " + (comp.difficulty || "中"));
    if (strategy) reasons.push("策略契合 " + Math.round(sFit * 100) + "%");
    if (contest > 0) reasons.push("与队友抢 " + comp.core);
    if (bannedOps.length) reasons.push("被 ban：" + bannedOps.join("、"));

    return {
      comp: comp,
      score: score,
      completion: completion,
      coreOnBoard: coreOnBoard,
      extraOnBoard: extraOnBoard,
      missing: missing,
      missingCore: missingCore,
      missingExtra: missingExtra,
      availability: avail,
      equipScore: equipScore,
      covenant: covenant,
      strategyFit: sFit,
      contest: contest,
      bannedOps: bannedOps,
      reasons: reasons
    };
  }

  function nextActions(result, state) {
    var comp = result.comp;
    var acts = [];
    var coreCount = result.coreOnBoard.length;
    var extraCount = result.extraOnBoard.length;

    if (state.mode === "box") {
      var notOwned = result.missing.filter(function (n) { return !state.owned.has(n); });
      if (notOwned.length) {
        acts.push("Box 中没有 " + notOwned.slice(0, 3).join("、") + "，考虑换一套或补充干员。");
      }
    }

    if (coreCount < 3) {
      acts.push("先抓 3 名不同【" + comp.core + "】干员，激活基础盟约。");
    } else if (coreCount < 6) {
      acts.push("核心还差 " + (6 - coreCount) + " 人，补到 6 名解锁进阶效果。");
    }
    if (comp.flex.length && extraCount < 2) {
      acts.push("外援【" + comp.extra + "】还差 " + (2 - extraCount) + " 人激活。");
    }

    var reachable = result.missing.filter(function (n) {
      return opMap[n].tier <= state.level && (state.mode === "all" || state.owned.has(n));
    });
    var blocked = result.missing.filter(function (n) { return opMap[n].tier > state.level; });

    if (reachable.length) {
      acts.push("当前本数可找：" + reachable.slice(0, 3).map(function (n) {
        return n + "(" + roman(opMap[n].tier) + ")";
      }).join("、") + "。");
    }
    if (blocked.length) {
      acts.push("需升本解锁：" + blocked.slice(0, 3).map(function (n) {
        return n + "(" + roman(opMap[n].tier) + ")";
      }).join("、") + "。");
    }

    if (state.level < 5) {
      acts.push("优先升本：当前 " + state.level + " 本，核心 key 卡多在 5-6 阶。");
    }
    if (result.completion >= 0.75) {
      acts.push("阵容基本成型：优先补精锐/装备，不要为一张非 key 卡拆阵容。");
    }
    if (!acts.length) {
      acts.push("按这套抓齐 3 名核心先激活，再补 6 人和外援。");
    }
    return acts;
  }

  function recommend(state, limit) {
    limit = limit || 3;
    var results = [];
    S.comps.forEach(function (comp) {
      if (!matchFilter(comp, state)) return;
      var r = scoreComp(comp, state);
      if (r) {
        r.actions = nextActions(r, state);
        results.push(r);
      }
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, limit);
  }

  function allScores(state) {
    var results = [];
    S.comps.forEach(function (comp) {
      if (!matchFilter(comp, state)) return;
      var r = scoreComp(comp, state);
      if (r) {
        r.actions = nextActions(r, state);
        results.push(r);
      }
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  }

  /** 评估一套自己配的阵容。custom = {core, extra, ops:[name...]} */
  function analyzeCustom(custom, state) {
    var ops = (custom.ops || []).map(function (n) { return opMap[n]; }).filter(Boolean);
    var core = custom.core;
    var extra = custom.extra;
    var coreCount = ops.filter(function (o) { return o.core.indexOf(core) >= 0; }).length;
    var extraCount = extra ? ops.filter(function (o) { return o.extra.indexOf(extra) >= 0; }).length : 0;

    var roles = { "盾位": 0, "奶位": 0, "输出": 0, "其他": 0 };
    ops.forEach(function (o) {
      // 干员可能同时是盾位/奶位（如黍），按 roles 数组全部计入
      var opRoles = (o.roles && o.roles.length) ? o.roles : [o.role];
      var counted = false;
      opRoles.forEach(function (r) {
        if (r === "盾位") { roles["盾位"]++; counted = true; }
        else if (r === "奶位") { roles["奶位"]++; counted = true; }
        else if (r.indexOf("输出") >= 0) { roles["输出"]++; counted = true; }
      });
      if (!counted) roles["其他"]++;
    });

    var totalPower = ops.reduce(function (s, o) { return s + o.power; }, 0);
    var maxPower = S.operators.reduce(function (m, o) { return Math.max(m, o.power || 0); }, 1);
    // 队伍强度：总战力 /（单卡最高战力 × 部署位），避免“只选 1 人强度 100”
    var strength = clamp(totalPower / (maxPower * Math.max(1, state.deployLimit)), 0, 1);
    var completion = clamp(ops.length / Math.max(1, state.deployLimit), 0, 1);
    var avail = ops.length
      ? ops.reduce(function (s, o) { return s + availability(o, state); }, 0) / ops.length
      : 0;

    var coreAct = coreCount >= 6 ? 1 : coreCount >= 3 ? 0.6 : 0;
    var extraAct = extra ? (extraCount >= 2 ? 1 : extraCount >= 1 ? 0.4 : 0) : 0;
    var activation = coreAct * 0.7 + extraAct * 0.3;

    var strategy = strategyMap[state.strategy] || null;
    var keyOp = ops.reduce(function (best, o) {
      return (!best || o.power > best.power) ? o : best;
    }, null);
    var avgTier = ops.length
      ? ops.reduce(function (s, o) { return s + o.tier; }, 0) / ops.length
      : 0;
    var pseudo = {
      core: core,
      extra: extra,
      difficulty: avgTier <= 3.6 ? "低" : (avgTier <= 4.6 ? "中" : "高"),
      key: keyOp ? keyOp.name : "",
      tiers: {}
    };
    ops.forEach(function (o) { pseudo.tiers[o.name] = o.tier; });
    var sFit = strategyFit(pseudo, strategy);
    var sCore = strategy ? strategyCoreOf(strategy) : "";

    var banned = ops.filter(function (o) { return state.banOps.has(o.name); });
    var bannedCore = state.banCore.has(core);
    var bannedExtra = !!(extra && state.banExtra.has(extra));

    var score = 100 * clamp(
      0.32 * completion + 0.22 * strength + 0.18 * avail + 0.1 * activation +
      0.1 * 0.6 + 0.08 * sFit -
      banned.length * 0.06 - (bannedCore ? 0.3 : 0) - (bannedExtra ? 0.2 : 0),
      0, 1
    );

    var warnings = [];
    if (coreCount < 3) {
      warnings.push({ type: "warn", text: "核心【" + core + "】只有 " + coreCount + " 人，至少 3 人激活基础盟约。" });
    } else if (coreCount < 6) {
      warnings.push({ type: "warn", text: "核心【" + core + "】" + coreCount + " 人，补齐 6 人解锁进阶效果。" });
    }
    if (extra && extraCount < 2) {
      warnings.push({ type: "warn", text: "附加【" + extra + "】只有 " + extraCount + " 人，需要 2 人激活。" });
    }
    if (!roles["盾位"]) warnings.push({ type: "warn", text: "没有盾位，前排可能扛不住。" });
    if (!roles["奶位"]) warnings.push({ type: "warn", text: "没有奶位，续航可能不够。" });
    if (ops.length > state.deployLimit) {
      warnings.push({ type: "warn", text: "已选 " + ops.length + " 人，超过部署上限 " + state.deployLimit + " 人。" });
    }
    if (banned.length) {
      warnings.push({ type: "warn", text: "包含被 ban 干员：" + banned.map(function (o) { return o.name; }).join("、") + "。" });
    }
    if (bannedCore) warnings.push({ type: "warn", text: "核心【" + core + "】已被本局 ban。" });
    if (bannedExtra) warnings.push({ type: "warn", text: "附加【" + extra + "】已被本局 ban。" });
    if (sCore && sCore !== core) {
      warnings.push({ type: "warn", text: "当前开局策略偏向【" + sCore + "】，与你选的核心【" + core + "】不同，契合度会偏低。" });
    }
    if (ops.length < 6) warnings.push({ type: "warn", text: "至少 6 人才能形成完整核心。" });
    if (!warnings.length) warnings.push({ type: "good", text: "结构完整，可以按这套抓牌。" });

    return {
      ops: ops,
      coreCount: coreCount,
      extraCount: extraCount,
      roles: roles,
      strength: strength,
      availability: avail,
      completion: completion,
      activation: activation,
      strategyFit: sFit,
      score: score,
      warnings: warnings,
      banned: banned
    };
  }

  /** 单名干员在当前本数下、每次刷新（默认 5 格）至少出现一次的概率。 */
  function shopChance(name, level) {
    var op = opMap[name];
    if (!op) return null;
    var weights = (S.shopWeights.weights[String(level)] || {});
    var tierWeight = weights[String(op.tier)] || 0;
    var sameTier = S.operators.filter(function (o) { return o.tier === op.tier; }).length;
    var slots = S.shopWeights.slots || 5;
    var pSlot = sameTier ? tierWeight / sameTier : 0;
    var p = 1 - Math.pow(1 - pSlot, slots);
    return {
      op: op,
      level: level,
      tierWeight: tierWeight,
      sameTier: sameTier,
      slots: slots,
      pSlot: pSlot,
      p: p
    };
  }

  function probTable(name) {
    var rows = [];
    for (var lv = 1; lv <= 6; lv++) {
      var r = shopChance(name, lv);
      if (r) rows.push(r);
    }
    return rows;
  }

  function groupChance(names, level) {
    var slots = S.shopWeights.slots || 5;
    var pSlot = 0;
    names.forEach(function (n) {
      var r = shopChance(n, level);
      if (r) pSlot += r.pSlot;
    });
    pSlot = Math.min(pSlot, 0.95);
    return 1 - Math.pow(1 - pSlot, slots);
  }

  function econTips(state) {
    var tips = [];
    tips.push({ type: "", text: "资金不跨回合，尽量花完；刷新 1 金一次。" });
    tips.push({ type: "", text: "当前 " + state.level + " 本，只能刷出 1-" + state.level + " 阶干员。" });
    tips.push({ type: "", text: "升级费每回合 -1，早升早享受；核心 key 卡多在 5-6 阶。" });
    if (state.level < 5) {
      tips.push({ type: "warn", text: "建议至少 5 本再深刷，低本优先过渡。" });
    }
    if (state.level >= 6) {
      tips.push({ type: "", text: "6 本已满，资金优先补精锐/装备。" });
    }
    return tips;
  }

  return {
    init: init,
    recommend: recommend,
    allScores: allScores,
    scoreComp: scoreComp,
    nextActions: nextActions,
    analyzeCustom: analyzeCustom,
    strategyInfo: strategyInfo,
    strategyFit: strategyFit,
    strategyCoreOf: strategyCoreOf,
    strategyTags: strategyTags,
    phasePlan: phasePlan,
    customPhasePlan: customPhasePlan,
    customLoadout: customLoadout,
    shopChance: shopChance,
    probTable: probTable,
    groupChance: groupChance,
    econTips: econTips,
    roman: roman,
    colorOf: colorOf,
    op: function (name) { return opMap[name]; }
  };
})();
