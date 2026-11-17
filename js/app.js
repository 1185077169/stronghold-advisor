/* 卫戍协议 · 战术终端 — 页面逻辑 v2 */
(function () {
  "use strict";

  var S = window.SEASON;
  var E = window.Engine;
  var KEY = "stronghold-advisor-v1";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clampInt(v, lo, hi, fallback) {
    v = parseInt(v, 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  }
  function pct(p) {
    if (!p) return "0%";
    var v = p * 100;
    return (v < 1 ? v.toFixed(2) : v.toFixed(1)) + "%";
  }

  function defaultCore() {
    var yan = S.covenants.core.find(function (c) { return c.name === "炎"; });
    return (yan || S.covenants.core[0]).name;
  }

  function validCore(name) {
    return S.covenants.core.some(function (c) { return c.name === name; });
  }
  function validExtra(name) {
    return !name || S.covenants.extra.some(function (c) { return c.name === name; });
  }
  function validStrategy(id) {
    return !id || S.strategies.some(function (s) { return s.id === id; });
  }
  function validOp(name) {
    return S.operators.some(function (o) { return o.name === name; });
  }
  function resolveOpName(name) {
    var hit = S.operators.find(function (o) { return o.name === name; });
    if (hit) return hit.name;
    var alias = S.operators.find(function (o) { return o.alias === name; });
    return alias ? alias.name : "";
  }

  function sanitizePhases(p) {
    p = p && typeof p === "object" ? p : {};
    function text(v) { return typeof v === "string" ? v.slice(0, 1200) : ""; }
    return { early: text(p.early), mid: text(p.mid), late: text(p.late) };
  }

  function sanitizeLoadout(l) {
    var out = {};
    if (!l || typeof l !== "object") return out;
    Object.keys(l).forEach(function (key) {
      var name = resolveOpName(key) || key;
      if (validOp(name) && typeof l[key] === "string") {
        out[name] = l[key].slice(0, 500);
      }
    });
    return out;
  }

  function freshState() {
    return {
      mode: "all",
      owned: new Set(),
      board: new Set(),
      banCore: new Set(),
      banExtra: new Set(),
      banOps: new Set(),
      equipment: new Set(),
      teammates: new Set(),
      level: 1,
      deployLimit: 8,
      strategy: "",
      onlyCurated: false,
      selectedCore: "",
      selectedExtra: "",
      customCore: defaultCore(),
      customExtra: "",
      customOps: [],
      customPhases: { early: "", mid: "", late: "" },
      customLoadout: {},
      customFilter: "all",
      customTier: "",
      savedCustoms: []
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return freshState();
      var o = JSON.parse(raw);
      var customCore = validCore(o.customCore) ? o.customCore : defaultCore();
      var customExtra = validExtra(o.customExtra) ? (o.customExtra || "") : "";
      var customOps = Array.isArray(o.customOps) ? o.customOps.filter(validOp) : [];
      var customFilter = ["all", "core", "extra", "tank", "heal", "dps"].indexOf(o.customFilter) >= 0
        ? o.customFilter : "all";
      var customTier = ["", "1", "2", "3", "4", "5", "6"].indexOf(String(o.customTier || "")) >= 0
        ? String(o.customTier || "") : "";
      var saved = Array.isArray(o.savedCustoms) ? o.savedCustoms.filter(function (x) {
        return x && validCore(x.core) && Array.isArray(x.ops);
      }) : [];
      return {
        mode: o.mode === "box" ? "box" : "all",
        owned: new Set(o.owned || []),
        board: new Set(o.board || []),
        banCore: new Set(o.banCore || []),
        banExtra: new Set(o.banExtra || []),
        banOps: new Set(o.banOps || []),
        equipment: new Set(o.equipment || []),
        teammates: new Set(o.teammates || []),
        level: clampInt(o.level, 1, 6, 1),
        deployLimit: 8,
        strategy: validStrategy(o.strategy) ? (o.strategy || "") : "",
        onlyCurated: !!o.onlyCurated,
        selectedCore: validCore(o.selectedCore) ? o.selectedCore : "",
        selectedExtra: validExtra(o.selectedExtra) ? (o.selectedExtra || "") : "",
        customCore: customCore,
        customExtra: customExtra,
        customOps: customOps,
        customPhases: sanitizePhases(o.customPhases),
        customLoadout: sanitizeLoadout(o.customLoadout),
        customFilter: customFilter,
        customTier: customTier,
        savedCustoms: saved
      };
    } catch (e) {
      return freshState();
    }
  }

  var state = loadState();
  var targetName = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        mode: state.mode,
        owned: Array.from(state.owned),
        board: Array.from(state.board),
        banCore: Array.from(state.banCore),
        banExtra: Array.from(state.banExtra),
        banOps: Array.from(state.banOps),
        equipment: Array.from(state.equipment),
        teammates: Array.from(state.teammates),
        level: state.level,
        strategy: state.strategy,
        onlyCurated: state.onlyCurated,
        selectedCore: state.selectedCore,
        selectedExtra: state.selectedExtra,
        customCore: state.customCore,
        customExtra: state.customExtra,
        customOps: state.customOps,
        customPhases: state.customPhases,
        customLoadout: state.customLoadout,
        customFilter: state.customFilter,
        customTier: state.customTier,
        savedCustoms: state.savedCustoms
      }));
    } catch (e) { /* 本地存储不可用时静默降级 */ }
  }

  function tierBadge(tier) {
    return '<span class="tier tier-' + tier + '">' + E.roman(tier) + "</span>";
  }

  function opLabel(op) {
    return op.alias ? op.alias : op.name;
  }

  function opMeta(op) {
    if (op.alias) return op.name;
    return op.core[0] || op.extra[0] || op.profession || "";
  }

  function opHay(op) {
    return [op.name, op.alias || "", op.profession, op.subProfession, op.role]
      .concat(op.core, op.extra).join(" ").toLowerCase();
  }

  function opChip(name, cls, removeAttr) {
    var op = E.op(name);
    if (!op) return "";
    var label = opLabel(op);
    var title = (op.alias ? op.name + " · " : "") + op.profession + " · " +
      (op.core.join("/") || "无核心") +
      (op.extra.length ? " · " + op.extra.join("/") : "") +
      (op.obtain ? " · " + op.obtain : "");
    var remove = removeAttr
      ? '<span class="x" ' + removeAttr + '="' + esc(name) + '">×</span>'
      : "";
    return '<span class="op-chip ' + (cls || "") + '" title="' + esc(title) + '">' +
      tierBadge(op.tier) + esc(label) + remove + "</span>";
  }

  function loadoutTable(comp) {
    if (!comp.loadout || !comp.loadout.length) return "";
    var rows = comp.loadout.map(function (row) {
      var items = (row.items || []).map(function (it) {
        var label = esc(it.name) + (it.qty ? " ×" + it.qty : "");
        var job = it.jobChangeTo
          ? '<span class="job-chip">转职→' + esc(it.jobChangeTo) + "</span>"
          : "";
        var gen = it.generic ? '<span class="gen-chip">通用</span>' : "";
        return '<span class="equip-chip">' + label + job + gen + "</span>";
      }).join("");
      return "<tr><td>" + opChip(row.opId || row.op, "") + "</td><td>" + items +
        '</td><td class="loadout-note">' + esc(row.note || "") + "</td></tr>";
    }).join("");
    return '<div class="loadout-wrap"><table class="loadout-table">' +
      "<thead><tr><th>干员</th><th>装备 / 转职</th><th>备注</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>";
  }

  /* ---------------- 左侧：干员 / Box ---------------- */

  function renderOpList() {
    var q = ($("#opSearch").value || "").trim().toLowerCase();
    var list = S.operators.filter(function (op) {
      if (!q) return true;
      return opHay(op).indexOf(q) >= 0;
    });
    var groups = {};
    list.forEach(function (op) {
      if (!groups[op.tier]) groups[op.tier] = [];
      groups[op.tier].push(op);
    });
    var html = "";
    Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (t) {
      var arr = groups[t].sort(function (a, b) { return a.name.localeCompare(b.name, "zh"); });
      html += '<div class="op-group-title">' + E.roman(Number(t)) + " 阶 · " + arr.length + "</div>";
      arr.forEach(function (op) {
        var checked = state.mode === "all" || state.owned.has(op.name);
        var banned = state.banOps.has(op.name);
        html += '<label class="op-item ' + (banned ? "banned" : "") + '">' +
          '<input type="checkbox" data-op="' + esc(op.name) + '"' + (checked ? " checked" : "") + ">" +
          tierBadge(op.tier) +
          '<span class="op-name">' + esc(opLabel(op)) + "</span>" +
          '<span class="op-meta">' + esc(opMeta(op)) + "</span>" +
          "</label>";
      });
    });
    $("#opList").innerHTML = html || '<p class="muted small">没有匹配的干员</p>';
  }

  /* ---------------- 左侧：Ban 位 ---------------- */

  function renderBan() {
    $("#banCore").innerHTML = S.covenants.core.map(function (c) {
      return '<button type="button" class="chip core ' + (state.banCore.has(c.name) ? "active" : "") +
        '" style="--core-color:' + c.color + '" data-core="' + esc(c.name) + '">' +
        esc(c.name) + "</button>";
    }).join("");
    $("#banExtra").innerHTML = S.covenants.extra.map(function (c) {
      return '<button type="button" class="chip ' + (state.banExtra.has(c.name) ? "active" : "") +
        '" data-extra="' + esc(c.name) + '">' + esc(c.name) + "</button>";
    }).join("");
    renderBanList();
  }

  function renderBanList() {
    var q = ($("#banSearch").value || "").trim().toLowerCase();
    var list = S.operators.filter(function (op) {
      if (!q) return true;
      return opHay(op).indexOf(q) >= 0;
    }).slice(0, 80);
    $("#banList").innerHTML = list.map(function (op) {
      return '<label class="op-item">' +
        '<input type="checkbox" data-ban="' + esc(op.name) + '"' +
        (state.banOps.has(op.name) ? " checked" : "") + ">" +
        tierBadge(op.tier) +
        '<span class="op-name">' + esc(opLabel(op)) + "</span>" +
        '<span class="op-meta">' + esc(opMeta(op)) + "</span>" +
        "</label>";
    }).join("") || '<p class="muted small">没有匹配的干员</p>';
  }

  /* ---------------- 盟约筛选 ---------------- */

  function renderFilter() {
    if (state.selectedCore && !validCore(state.selectedCore)) state.selectedCore = "";
    if (state.selectedExtra && !validExtra(state.selectedExtra)) state.selectedExtra = "";

    renderStrategy();
    $("#curatedFilter").classList.toggle("active", state.onlyCurated);

    var html = '<button type="button" class="chip ' + (!state.selectedCore ? "active" : "") +
      '" data-core="">全部</button>';
    html += S.covenants.core.map(function (c) {
      return '<button type="button" class="chip core ' + (state.selectedCore === c.name ? "active" : "") +
        '" style="--core-color:' + c.color + '" data-core="' + esc(c.name) + '">' +
        esc(c.name) + "</button>";
    }).join("");
    $("#coreFilter").innerHTML = html;

    $("#extraFilter").innerHTML = '<option value="">全部附加盟约</option>' +
      S.covenants.extra.map(function (c) {
        return '<option value="' + esc(c.name) + '"' +
          (state.selectedExtra === c.name ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("");
  }

  function renderStrategy() {
    if (state.strategy && !validStrategy(state.strategy)) state.strategy = "";
    var coreStrategies = [];
    var general = [];
    S.strategies.forEach(function (s) {
      var info = E.strategyInfo(s.id);
      (info && info.core ? coreStrategies : general).push(s);
    });
    function opt(s) {
      return '<option value="' + esc(s.id) + '"' + (state.strategy === s.id ? " selected" : "") + ">" +
        esc(s.name) + "（" + esc(s.initiator || "—") + "）</option>";
    }
    $("#strategyFilter").innerHTML = '<option value="">不选策略</option>' +
      '<optgroup label="核心盟约专属">' + coreStrategies.map(opt).join("") + "</optgroup>" +
      '<optgroup label="通用策略">' + general.map(opt).join("") + "</optgroup>";

    var info = state.strategy ? E.strategyInfo(state.strategy) : null;
    if (!info) {
      $("#strategyHint").textContent = "可选；会影响推荐排序";
      $("#strategyDesc").hidden = true;
      $("#strategyDesc").innerHTML = "";
      return;
    }
    var core = info.core;
    var hint = core ? "偏向【" + core + "】" : "通用策略";
    if (core && state.selectedCore && state.selectedCore !== core) {
      hint = "偏向【" + core + "】，当前筛选【" + state.selectedCore + "】";
    }
    $("#strategyHint").textContent = hint;
    $("#strategyDesc").hidden = false;
    $("#strategyDesc").innerHTML =
      "<b>" + esc(info.strategy.name) + "</b> · 发起 " + esc(info.strategy.initiator || "—") +
      " · 初始生命 " + esc(info.strategy.hp == null ? "—" : info.strategy.hp) +
      (core ? ' · <span class="strategy-core">偏向【' + esc(core) + "】</span>" : "") +
      '<div class="strategy-text">' + esc(info.strategy.desc) + "</div>";
  }

  /* ---------------- 中间：当前场上 ---------------- */

  function renderBoard() {
    $("#boardCount").textContent = state.board.size + " / " + state.deployLimit;
    $("#boardChips").innerHTML = Array.from(state.board).map(function (n) {
      return opChip(n, "essential", "data-remove");
    }).join("");
  }

  function renderBoardResults() {
    var q = ($("#boardSearch").value || "").trim().toLowerCase();
    if (!q) { $("#boardResults").innerHTML = ""; return; }
    if (state.board.size >= state.deployLimit) {
      $("#boardResults").innerHTML = '<p class="muted small">部署位已满（' +
        state.deployLimit + " 人），先移除一名干员。</p>";
      return;
    }
    var list = S.operators.filter(function (op) {
      if (state.board.has(op.name)) return false;
      return opHay(op).indexOf(q) >= 0;
    }).slice(0, 8);
    $("#boardResults").innerHTML = list.map(function (op) {
      return '<button type="button" class="result-item" data-add="' + esc(op.name) + '">' +
        tierBadge(op.tier) + "<span>" + esc(opLabel(op)) + "</span>" +
        '<span class="meta">' + esc(opMeta(op)) + "</span>" +
        "</button>";
    }).join("") || '<p class="muted small">没有匹配的干员</p>';
  }

  function addBoard(name) {
    if (state.board.size >= state.deployLimit) return;
    state.board.add(name);
    save();
    renderBoard();
    renderRecommendations();
    renderCompList();
    renderSummary();
  }

  /* ---------------- 中间：推荐卡 ---------------- */

  function renderRecommendations() {
    var results = E.recommend(state, 3);
    var sel = state.strategy ? E.strategyInfo(state.strategy) : null;
    var selName = sel ? sel.strategy.name : "";
    if (!results.length) {
      var msg = state.onlyCurated
        ? "当前筛选下没有主播推荐阵容：试试清空核心/附加筛选，或关闭“只看主播推荐”。"
        : (state.selectedCore || state.selectedExtra)
          ? "当前筛选下没有可选阵容：可能该核心没有这个附加轴，或被 ban 位排除。"
          : "当前 ban 位把所有阵容都排除了。";
      $("#recommendations").innerHTML = '<div class="empty">' + msg +
        " 试着清空筛选或减少 ban 位。</div>";
      $("#recHint").textContent = "0 套可选";
      return;
    }
    $("#recHint").textContent = (sel ? selName + " · " : "") +
      (state.selectedCore || "全部核心") +
      (state.selectedExtra ? " · " + state.selectedExtra : "") +
      " · " + results.length + " 套";

    $("#recommendations").innerHTML = results.map(function (r, idx) {
      var c = r.comp;
      var plan = E.phasePlan(c, sel ? sel.strategy : null);
      var curatedBadge = c.curated ? '<span class="badge-curated">主播</span>' : "";
      var loadout = c.loadout
        ? '<details class="rec-loadout"><summary>装备 / 转职</summary>' + loadoutTable(c) + "</details>"
        : "";
      var essential = c.essential.map(function (n) {
        var cls = state.board.has(n) ? "essential" : (E.op(n).tier > state.level ? "blocked" : "missing");
        return opChip(n, cls);
      }).join("");
      var flex = c.flex.map(function (n) {
        var cls = state.board.has(n) ? "essential" : "";
        return opChip(n, cls);
      }).join("");
      return '<article class="rec-card ' + (idx === 0 ? "top" : "") + '" style="--core-color:' + c.color + '">' +
        '<div class="rec-head"><div>' +
        '<div class="rec-title"><span class="rank">#' + (idx + 1) + "</span><h3>" + esc(c.name) + "</h3>" +
        curatedBadge + "</div>" +
        '<div class="rec-sub">核心 ' + esc(c.core) + " · 外援 " + esc(c.extra || "无") +
        " · 难度 " + esc(c.difficulty || "中") + " · " +
        (sel ? "当前策略 " + esc(selName) : "推荐策略 " + esc(c.strategyName || "—")) + "</div>" +
        (c.curated && c.source ? '<div class="rec-source">来源：' + esc(c.source) + "</div>" : "") +
        "</div>" +
        '<div class="score-box"><strong>' + Math.round(r.score) + "</strong><span>推荐分</span></div></div>" +
        '<div class="bar"><i style="width:' + Math.round(r.completion * 100) + '%"></i></div>' +
        '<div class="kv">' +
        "<span>核心 <b>" + r.coreOnBoard.length + "/" + c.essential.length + "</b></span>" +
        "<span>外援 <b>" + r.extraOnBoard.length + "/" + c.flex.length + "</b></span>" +
        "<span>还缺 <b>" + r.missing.length + "</b></span>" +
        "<span>可达性 <b>" + Math.round(r.availability * 100) + "%</b></span>" +
        "<span>强度 <b>" + Math.round(c.strength * 100) + "</b></span>" +
        "<span>装备 <b>" + Math.round(r.equipScore * 100) + "%</b></span>" +
        (sel ? "<span>策略 <b>" + Math.round(r.strategyFit * 100) + "%</b></span>" : "") +
        "</div>" +
        '<div class="rec-ops">' + essential + "</div>" +
        (flex ? '<div class="rec-ops"><span class="rec-section-label">外援</span>' + flex + "</div>" : "") +
        '<ul class="rec-actions">' + r.actions.slice(0, 4).map(function (a) {
          return "<li>" + esc(a) + "</li>";
        }).join("") + "</ul>" +
        '<details class="rec-phase"><summary>过渡思路' +
        (sel ? "（" + esc(selName) + "）" : "") + "</summary><div class=\"phase-list\">" +
        "<div><b>前期</b><span>" + esc(plan.early || "—") + "</span></div>" +
        "<div><b>中期</b><span>" + esc(plan.mid || "—") + "</span></div>" +
        "<div><b>后期</b><span>" + esc(plan.late || "—") + "</span></div>" +
        "</div></details>" +
        loadout +
        '<div class="rec-footer"><button type="button" class="mini-btn" data-copy="' +
        esc(c.id) + '">复制到自定义</button></div>' +
        "</article>";
    }).join("");
  }

  /* ---------------- 中间：全部阵容 ---------------- */

  function renderCompList() {
    var results = E.allScores(state);
    var sel = state.strategy ? E.strategyInfo(state.strategy) : null;
    $("#libHint").textContent = (sel ? sel.strategy.name + " · " : "") +
      (state.selectedCore || "全部核心") +
      (state.selectedExtra ? " · " + state.selectedExtra : "") +
      " · " + results.length + " 套";
    if (!results.length) {
      $("#compList").innerHTML = '<div class="empty">当前筛选/ ban 位下没有阵容。</div>';
      return;
    }
    $("#compList").innerHTML = results.map(function (r) {
      var c = r.comp;
      var essential = c.essential.map(function (n) { return opChip(n, ""); }).join("");
      var flex = c.flex.map(function (n) { return opChip(n, ""); }).join("");
      var equip = c.equipmentPlan.map(function (e) {
        return esc(e.op) + " → " + esc(e.item);
      }).join("；");
      var phases = E.phasePlan(c, sel ? sel.strategy : null);
      var curatedBadge = c.curated ? '<span class="badge-curated">主播</span>' : "";
      var sourceBlock = c.source
        ? '<div class="comp-block"><h4>来源</h4><div class="comp-note">' + esc(c.source) +
          (c.sourceUrl ? ' · <a class="source-link" href="' + esc(c.sourceUrl) +
            '" target="_blank" rel="noopener">原文</a>' : "") + "</div></div>"
        : "";
      var strategyBlock = sel
        ? "当前：" + esc(sel.strategy.name) + "（契合 " + Math.round(r.strategyFit * 100) + "%）" +
          "<br>" + esc(sel.strategy.desc)
        : "推荐：" + esc(c.strategyName || "—");
      return '<details class="comp-item" style="--core-color:' + c.color + '">' +
        "<summary>" +
        '<span class="comp-name">' + esc(c.name) + curatedBadge + "</span>" +
        '<span class="comp-meta">' + esc(c.core) + " · " + esc(c.extra || "无") +
        " · 策略 " + esc(c.strategyName || "—") + "</span>" +
        '<span class="comp-str">强度 <b>' + Math.round(c.strength * 100) + "</b></span>" +
        '<span class="comp-tempo">难度 ' + esc(c.difficulty || "中") + "</span>" +
        "</summary>" +
        '<div class="comp-body">' +
        '<div class="comp-block"><h4>核心 6 人</h4><div class="rec-ops">' + essential + "</div></div>" +
        (flex ? '<div class="comp-block"><h4>外援</h4><div class="rec-ops">' + flex + "</div></div>" : "") +
        (c.loadout
          ? '<div class="comp-block"><h4>干员装备 / 转职</h4>' + loadoutTable(c) + "</div>"
          : '<div class="comp-block"><h4>装备建议</h4><div class="comp-note">' + equip + "</div></div>") +
        sourceBlock +
        '<div class="comp-block"><h4>开局策略</h4><div class="comp-note">' + strategyBlock + "</div></div>" +
        '<div class="comp-block"><h4>前中后期过渡' +
        (sel ? "（按 " + esc(sel.strategy.name) + "）" : "") + '</h4><div class="phase-list">' +
        "<div><b>前期</b><span>" + esc(phases.early || "—") + "</span></div>" +
        "<div><b>中期</b><span>" + esc(phases.mid || "—") + "</span></div>" +
        "<div><b>后期</b><span>" + esc(phases.late || "—") + "</span></div>" +
        "</div></div>" +
        '<div class="comp-block"><h4>盟约效果</h4><div class="comp-note">' +
        esc(c.coreEffect) + (c.extraEffect ? "<br>" + esc(c.extraEffect) : "") + "</div></div>" +
        '<div class="comp-block"><h4>运营备注</h4><div class="comp-note">' + esc(c.notes) + "</div></div>" +
        '<div class="rec-footer"><button type="button" class="mini-btn" data-copy="' +
        esc(c.id) + '">复制到自定义</button></div>' +
        "</div></details>";
    }).join("");
  }

  /* ---------------- 中间：自己配阵容 ---------------- */

  function renderCustom() {
    renderCustomSelects();
    renderCustomFilters();
    renderCustomChips();
    renderCustomResults();
    renderCustomStats();
    renderCustomPlan();
    renderSavedCustoms();
  }

  function renderCustomSelects() {
    $("#customCore").innerHTML = S.covenants.core.map(function (c) {
      return '<option value="' + esc(c.name) + '"' +
        (state.customCore === c.name ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
    $("#customExtra").innerHTML = '<option value="">不选附加盟约</option>' +
      S.covenants.extra.map(function (c) {
        return '<option value="' + esc(c.name) + '"' +
          (state.customExtra === c.name ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("");
    $("#customStrategy").innerHTML = '<option value="">不选策略</option>' +
      S.strategies.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (state.strategy === s.id ? " selected" : "") + ">" +
          esc(s.name) + "（" + esc(s.initiator || "—") + "）</option>";
      }).join("");
  }

  function renderCustomFilters() {
    $$("#center-custom [data-cfilter]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.cfilter === state.customFilter);
    });
    $("#customTier").value = state.customTier || "";
  }

  function renderCustomChips() {
    var slots = [];
    for (var i = 0; i < 9; i++) {
      var name = state.customOps[i];
      var slotLabel = i < 6 ? "核心位" : (i < 8 ? "外援位" : "9 人");
      if (name) {
        var op = E.op(name);
        var isCore = op && op.core.indexOf(state.customCore) >= 0;
        var isExtra = op && state.customExtra && op.extra.indexOf(state.customExtra) >= 0;
        slots.push('<div class="slot filled" data-slot="' + i + '">' +
          '<div class="slot-head"><span class="slot-no">' + (i + 1) + "</span>" +
          '<span class="slot-role">' + slotLabel + "</span>" +
          '<span class="slot-x" data-remove-custom="' + esc(name) + '">×</span></div>' +
          '<div class="slot-op">' + tierBadge(op.tier) + esc(opLabel(op)) + "</div>" +
          '<div class="slot-tags">' +
          (isCore ? '<span class="tag-core">核心</span>' : "") +
          (isExtra ? '<span class="tag-extra">外援</span>' : "") +
          "</div></div>");
      } else {
        slots.push('<div class="slot empty" data-slot="' + i + '">' +
          '<div class="slot-head"><span class="slot-no">' + (i + 1) + "</span>" +
          '<span class="slot-role">' + slotLabel + "</span></div>" +
          '<div class="slot-empty">空位</div></div>');
      }
    }
    $("#customChips").innerHTML = slots.join("");
    var coreCount = state.customOps.filter(function (n) {
      var op = E.op(n);
      return op && op.core.indexOf(state.customCore) >= 0;
    }).length;
    var extraCount = state.customExtra ? state.customOps.filter(function (n) {
      var op = E.op(n);
      return op && op.extra.indexOf(state.customExtra) >= 0;
    }).length : 0;
    $("#customCount").textContent = state.customOps.length + "/9";
    $("#customSlotsHint").textContent = "核心 " + coreCount + "/6 · 外援 " +
      (state.customExtra ? extraCount + "/2" : "未选");
  }

  function renderCustomResults() {
    var q = ($("#customSearch").value || "").trim().toLowerCase();
    var filter = state.customFilter || "all";
    var tier = state.customTier ? Number(state.customTier) : 0;

    if (state.customOps.length >= 9) {
      $("#customResults").innerHTML = '<p class="muted small">已选满 9 人，先移除一个再添加。</p>';
      return;
    }
    if (filter === "extra" && !state.customExtra) {
      $("#customResults").innerHTML = '<p class="muted small">先在“附加盟约”里选一个外援轴。</p>';
      return;
    }

    function rolesOf(op) {
      return (op.roles && op.roles.length) ? op.roles : [op.role];
    }
    function matchesFilter(op) {
      if (filter === "core") return op.core.indexOf(state.customCore) >= 0;
      if (filter === "extra") return op.extra.indexOf(state.customExtra) >= 0;
      if (filter === "tank") return rolesOf(op).indexOf("盾位") >= 0;
      if (filter === "heal") return rolesOf(op).indexOf("奶位") >= 0;
      if (filter === "dps") return op.role.indexOf("输出") >= 0;
      return true;
    }

    var list = S.operators.filter(function (op) {
      if (state.customOps.indexOf(op.name) >= 0) return false;
      if (state.banOps.has(op.name)) return false;
      if (state.mode === "box" && !state.owned.has(op.name)) return false;
      if (tier && op.tier !== tier) return false;
      if (q && opHay(op).indexOf(q) < 0) return false;
      return matchesFilter(op);
    });

    function rank(op) {
      var s = op.tier * 2 + (op.power || 0);
      if (op.core.indexOf(state.customCore) >= 0) s += 100;
      if (state.customExtra && op.extra.indexOf(state.customExtra) >= 0) s += 50;
      return s;
    }
    list.sort(function (a, b) { return rank(b) - rank(a); });
    list = list.slice(0, 60);

    $("#customResults").innerHTML = list.map(function (op) {
      var isCore = op.core.indexOf(state.customCore) >= 0;
      var isExtra = state.customExtra && op.extra.indexOf(state.customExtra) >= 0;
      return '<button type="button" class="candidate-item" data-add-custom="' + esc(op.name) + '">' +
        '<span class="cand-main">' + tierBadge(op.tier) + esc(opLabel(op)) + "</span>" +
        '<span class="cand-meta">' + esc(opMeta(op)) + " · " + esc(op.role) + "</span>" +
        '<span class="cand-tags">' +
        (isCore ? '<span class="tag-core">核心</span>' : "") +
        (isExtra ? '<span class="tag-extra">外援</span>' : "") +
        '<span class="cand-add">+</span></span>' +
        "</button>";
    }).join("") || '<p class="muted small">没有匹配的干员；换个筛选或清空搜索。</p>';
  }

  function availablePool() {
    return S.operators.filter(function (op) {
      if (state.banOps.has(op.name)) return false;
      if (state.mode === "box" && !state.owned.has(op.name)) return false;
      return true;
    });
  }

  function byPower(a, b) {
    return (b.power || 0) - (a.power || 0);
  }

  function addCustomOps(names) {
    names.forEach(function (n) {
      if (state.customOps.length >= 9) return;
      if (state.customOps.indexOf(n) < 0) state.customOps.push(n);
    });
    save();
    renderCustom();
  }

  function autoFillCore() {
    var pool = availablePool().filter(function (op) {
      return op.core.indexOf(state.customCore) >= 0;
    });
    var picks = [];
    ["盾位", "奶位"].forEach(function (role) {
      var cand = pool.filter(function (op) {
        var rs = (op.roles && op.roles.length) ? op.roles : [op.role];
        return rs.indexOf(role) >= 0 && picks.indexOf(op.name) < 0;
      })[0];
      if (cand) picks.push(cand.name);
    });
    pool.slice().sort(byPower).forEach(function (op) {
      if (picks.length < 6 && picks.indexOf(op.name) < 0) picks.push(op.name);
    });
    addCustomOps(picks);
  }

  function autoFillFlex() {
    if (!state.customExtra) {
      $("#customWarnings").innerHTML = '<div class="tip warn">先在“附加盟约”里选一个外援轴，再点“自动补外援”。</div>';
      return;
    }
    var pool = availablePool().filter(function (op) {
      return op.extra.indexOf(state.customExtra) >= 0 && state.customOps.indexOf(op.name) < 0;
    }).sort(byPower);
    addCustomOps(pool.slice(0, 2).map(function (op) { return op.name; }));
  }

  function applyCompToCustom(comp, withText) {
    state.customCore = comp.core;
    state.customExtra = comp.extra || "";
    state.customOps = comp.ops.slice(0, 9);
    state.customPhases = withText
      ? sanitizePhases(comp.phases)
      : { early: "", mid: "", late: "" };
    state.customLoadout = {};
    if (withText) {
      (comp.loadout || []).forEach(function (row) {
        var id = row.opId || resolveOpName(row.op);
        if (id) state.customLoadout[id] = loadoutRowText(row);
      });
    }
  }

  function autoFillAll() {
    var best = E.recommend(state, 1)[0];
    if (best) {
      // 一键套用只填干员；思路和装备留给用户自己写/点“填入参考”
      applyCompToCustom(best.comp, false);
      save();
      renderCustom();
      return;
    }
    state.customOps = [];
    autoFillCore();
    autoFillFlex();
  }

  function clearCustom() {
    state.customOps = [];
    state.customPhases = { early: "", mid: "", late: "" };
    state.customLoadout = {};
    save();
    renderCustom();
  }

  function renderCustomStats() {
    var a = E.analyzeCustom({
      core: state.customCore,
      extra: state.customExtra,
      ops: state.customOps
    }, state);

    $("#customStats").innerHTML =
      '<div class="stat-big"><span>自配评分</span><b>' + Math.round(a.score) + "</b></div>" +
      "<div><span>核心人数</span><b>" + a.coreCount + "/6</b></div>" +
      "<div><span>附加人数</span><b>" + (state.customExtra ? a.extraCount + " / 2" : "未选") + "</b></div>" +
      "<div><span>盾位 / 奶位</span><b>" + a.roles["盾位"] + " / " + a.roles["奶位"] + "</b></div>" +
      "<div><span>输出</span><b>" + a.roles["输出"] + "</b></div>" +
      "<div><span>队伍强度</span><b>" + Math.round(a.strength * 100) + "</b></div>" +
      "<div><span>可达性</span><b>" + Math.round(a.availability * 100) + "%</b></div>" +
      "<div><span>策略契合</span><b>" + (state.strategy ? Math.round(a.strategyFit * 100) + "%" : "未选") + "</b></div>" +
      "<div><span>已选</span><b>" + a.ops.length + "/" + state.deployLimit + "</b></div>";

    $("#customWarnings").innerHTML = a.warnings.map(function (w) {
      return '<div class="tip ' + (w.type || "") + '">' + esc(w.text) + "</div>";
    }).join("");
  }

  function loadoutRowText(row) {
    var text = (row.items || []).map(function (it) { return it.name; }).join(" + ");
    if (row.note) text += "；" + row.note;
    return text;
  }

  function renderCustomLoadoutEditor() {
    var wrap = $("#customLoadout");
    if (!state.customOps.length) {
      wrap.innerHTML = '<p class="muted small">先加干员；每名干员的装备/转职自己写，也可以点“填入参考”。</p>';
      return;
    }
    wrap.innerHTML = state.customOps.map(function (name) {
      var op = E.op(name);
      if (!op) return "";
      return '<div class="loadout-row">' + opChip(name, "", "") +
        '<input type="text" maxlength="500" data-loadout-op="' + esc(name) + '" value="' +
        esc(state.customLoadout[name] || "") +
        '" placeholder="装备/转职，例如：坚守盾牌；变形同构体 + 炎国短刀">' +
        "</div>";
    }).join("");
  }

  function renderCustomPlan() {
    function setValue(sel, val) {
      var el = $(sel);
      if (el && document.activeElement !== el) el.value = val || "";
    }
    setValue("#customPhaseEarly", state.customPhases.early);
    setValue("#customPhaseMid", state.customPhases.mid);
    setValue("#customPhaseLate", state.customPhases.late);
    renderCustomLoadoutEditor();
  }

  function fillPhaseReference() {
    if (!state.customOps.length) {
      flashCustom("先加干员，再填参考思路。");
      return;
    }
    var plan = E.customPhasePlan({
      core: state.customCore,
      extra: state.customExtra,
      ops: state.customOps
    }, state);
    var pairs = [
      ["#customPhaseEarly", "early"],
      ["#customPhaseMid", "mid"],
      ["#customPhaseLate", "late"]
    ];
    var filled = 0;
    pairs.forEach(function (pair) {
      var el = $(pair[0]);
      if (el && !el.value.trim() && plan[pair[1]]) {
        el.value = plan[pair[1]];
        state.customPhases[pair[1]] = plan[pair[1]];
        filled += 1;
      }
    });
    save();
    flashCustom(filled ? "已填入 " + filled + " 栏参考，可以继续改。" : "三栏都已经写过，未覆盖。", true);
  }

  function fillLoadoutReference() {
    if (!state.customOps.length) {
      flashCustom("先加干员，再填参考装备。");
      return;
    }
    var rows = E.customLoadout({
      core: state.customCore,
      extra: state.customExtra,
      ops: state.customOps
    }, state);
    var byOp = {};
    rows.forEach(function (row) { byOp[row.opId] = loadoutRowText(row); });
    var filled = 0;
    state.customOps.forEach(function (name) {
      if (!(state.customLoadout[name] || "").trim() && byOp[name]) {
        state.customLoadout[name] = byOp[name];
        filled += 1;
      }
    });
    save();
    renderCustomPlan();
    flashCustom(filled ? "已填入 " + filled + " 名干员的参考装备，可以继续改。" : "装备栏都已经写过，未覆盖。", true);
  }

  function renderSavedCustoms() {
    if (!state.savedCustoms.length) {
      $("#savedCustoms").innerHTML = '<p class="muted small">还没有保存的自定义阵容。配好后点“保存这套”，会存在本地浏览器。</p>';
      return;
    }
    $("#savedCustoms").innerHTML = state.savedCustoms.map(function (c) {
      return '<div class="saved-item">' +
        "<div><b>" + esc(c.name) + "</b>" +
        '<span class="muted small">' + esc(c.core) +
        (c.extra ? " · " + esc(c.extra) : "") +
        " · " + c.ops.length + " 人 · " + esc(c.savedAt || "") + "</span></div>" +
        '<div class="saved-actions">' +
        '<button type="button" class="mini-btn" data-load="' + esc(c.id) + '">载入</button>' +
        '<button type="button" class="mini-btn" data-share="' + esc(c.id) + '">分享</button>' +
        '<button type="button" class="mini-btn danger" data-del="' + esc(c.id) + '">删除</button>' +
        "</div></div>";
    }).join("");
  }

  function addCustomOp(name) {
    name = resolveOpName(name) || name;
    if (state.customOps.indexOf(name) >= 0) return;
    if (state.customOps.length >= 9) {
      $("#customWarnings").innerHTML = '<div class="tip warn">已满 9 人；先移除一个再添加。</div>';
      return;
    }
    state.customOps.push(name);
    save();
    renderCustom();
  }

  function removeCustomOp(name) {
    state.customOps = state.customOps.filter(function (n) { return n !== name; });
    delete state.customLoadout[name];
    save();
    renderCustom();
  }

  function saveCustom() {
    if (!state.customOps.length) {
      $("#customWarnings").innerHTML = '<div class="tip warn">先加至少一名干员再保存。</div>';
      return;
    }
    var name = state.customCore + (state.customExtra ? "·" + state.customExtra : "") +
      " " + state.customOps.length + "人";
    state.savedCustoms.unshift({
      id: "c" + Date.now(),
      name: name,
      core: state.customCore,
      extra: state.customExtra,
      strategy: state.strategy || "",
      ops: state.customOps.slice(),
      phases: sanitizePhases(state.customPhases),
      loadout: sanitizeLoadout(state.customLoadout),
      savedAt: new Date().toLocaleString("zh-CN")
    });
    state.savedCustoms = state.savedCustoms.slice(0, 20);
    save();
    renderCustom();
  }

  /* ---------------- 自配阵容分享 ---------------- */

  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlDecode(str) {
    str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var bin = atob(str);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function flashCustom(msg, good) {
    var el = $("#customWarnings");
    if (!el) return;
    el.innerHTML = '<div class="tip ' + (good ? "good" : "warn") + '">' + esc(msg) + "</div>";
  }

  function shareCustomData(comp) {
    if (!comp.ops || !comp.ops.length) {
      flashCustom("先加至少一名干员再分享。");
      return;
    }
    var payload = {
      v: 1,
      c: comp.core,
      e: comp.extra || "",
      s: comp.strategy !== undefined ? (comp.strategy || "") : "",
      o: comp.ops.slice(),
      p: sanitizePhases(comp.phases),
      l: sanitizeLoadout(comp.loadout)
    };
    var url = location.href.split("#")[0] + "#c=" + b64urlEncode(JSON.stringify(payload));
    copyText(url);
  }

  function copyText(text) {
    function done() { flashCustom("分享链接已复制，发给别人打开即可。", true); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) done();
      else flashCustom("复制失败，请手动复制：" + text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function loadSharedCustom() {
    var m = (location.hash || "").match(/^#c=([A-Za-z0-9\-_]+)$/);
    if (!m) return false;
    try {
      var o = JSON.parse(b64urlDecode(m[1]));
      if (!o || o.v !== 1 || !validCore(o.c)) return false;
      state.customCore = o.c;
      state.customExtra = validExtra(o.e) ? (o.e || "") : "";
      state.strategy = validStrategy(o.s) ? (o.s || "") : state.strategy;
      state.customOps = Array.isArray(o.o)
        ? o.o.map(resolveOpName).filter(Boolean)
          .filter(function (n, i, arr) { return arr.indexOf(n) === i; }).slice(0, 9)
        : [];
      state.customPhases = sanitizePhases(o.p);
      state.customLoadout = sanitizeLoadout(o.l);
      Object.keys(state.customLoadout).forEach(function (name) {
        if (state.customOps.indexOf(name) < 0) delete state.customLoadout[name];
      });
      save();
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
      return true;
    } catch (e) {
      return false;
    }
  }

  function copyToCustom(compId) {
    var comp = S.comps.find(function (c) { return c.id === compId; });
    if (!comp) return;
    applyCompToCustom(comp, true);
    save();
    switchCenterTab("custom");
    renderCustom();
  }

  /* ---------------- 右侧：商店期望 ---------------- */

  function renderTargetResults() {
    var q = ($("#targetSearch").value || "").trim().toLowerCase();
    if (!q) { $("#targetResults").innerHTML = ""; return; }
    var list = S.operators.filter(function (op) {
      return opHay(op).indexOf(q) >= 0;
    }).slice(0, 8);
    $("#targetResults").innerHTML = list.map(function (op) {
      return '<button type="button" class="result-item" data-target="' + esc(op.name) + '">' +
        tierBadge(op.tier) + "<span>" + esc(opLabel(op)) + "</span>" +
        '<span class="meta">' + esc(opMeta(op)) + "</span>" +
        "</button>";
    }).join("") || '<p class="muted small">没有匹配的干员</p>';
  }

  function renderTargetDetail() {
    if (!targetName) {
      $("#targetDetail").innerHTML = '<p class="muted small">选一名干员，查看当前本数下每次刷新的出现期望。</p>';
      return;
    }
    var op = E.op(targetName);
    if (!op) return;
    var rows = E.probTable(targetName);
    var table = rows.map(function (r) {
      var isCurrent = r.level === state.level;
      var zero = r.p <= 0;
      return '<tr class="' + (isCurrent ? "current" : "") + '">' +
        "<td>" + r.level + " 本" + (isCurrent ? " · 当前" : "") + "</td>" +
        "<td>" + (r.tierWeight ? (r.tierWeight * 100).toFixed(0) + "%" : "—") + "</td>" +
        "<td>" + r.sameTier + "</td>" +
        "<td>" + (zero ? "—" : pct(r.pSlot)) + "</td>" +
        '<td class="' + (zero ? "zero" : "p") + '">' + (zero ? "—" : pct(r.p)) + "</td>" +
        "</tr>";
    }).join("");
    $("#targetDetail").innerHTML =
      '<div class="comp-note"><b>' + esc(opLabel(op)) + "</b>" +
      (op.alias ? "（" + esc(op.name) + "）" : "") + " · " + E.roman(op.tier) + " 阶 · " +
      esc(op.profession) + (op.subProfession ? " / " + esc(op.subProfession) : "") +
      " · " + esc(op.role) +
      (op.core.length ? " · " + esc(op.core.join("/")) : "") +
      (op.extra.length ? " · " + esc(op.extra.join("/")) : "") + "</div>" +
      (op.obtain ? '<div class="muted small" style="margin-top:4px">获取：' + esc(op.obtain) + "</div>" : "") +
      '<table class="prob-table"><thead><tr><th>本数</th><th>该阶权重</th><th>同阶人数</th><th>单格</th><th>5 格至少一次</th></tr></thead><tbody>' +
      table + "</tbody></table>" +
      '<p class="muted small" style="margin-top:6px">' + esc(S.shopWeights.note) + "</p>";
  }

  /* ---------------- 右侧：经济 / 摘要 ---------------- */

  function renderEcon() {
    $("#econTips").innerHTML = E.econTips(state).map(function (t) {
      return '<div class="tip ' + (t.type || "") + '">' + esc(t.text) + "</div>";
    }).join("");
  }

  function renderSummary() {
    var top = E.recommend(state, 1)[0];
    var sel = state.strategy ? E.strategyInfo(state.strategy) : null;
    $("#summary").innerHTML =
      "<div><span>已上场</span><b>" + state.board.size + "/" + state.deployLimit + "</b></div>" +
      "<div><span>Box</span><b>" + (state.mode === "all" ? "全干员" : state.owned.size) + "</b></div>" +
      "<div><span>Ban</span><b>" + (state.banCore.size + state.banExtra.size + state.banOps.size) + "</b></div>" +
      "<div><span>本数</span><b>" + state.level + "</b></div>" +
      "<div><span>策略</span><b>" + esc(sel ? sel.strategy.name : "未选") + "</b></div>" +
      "<div><span>首选核心</span><b>" + esc(top ? top.comp.core : "—") + "</b></div>";
  }

  /* ---------------- 页签 / 渲染总入口 ---------------- */

  function switchCenterTab(name) {
    $$(".center-tab").forEach(function (b) {
      b.classList.toggle("active", b.dataset.center === name);
    });
    $("#center-rec").hidden = name !== "rec";
    $("#center-custom").hidden = name !== "custom";
    $("#center-library").hidden = name !== "library";
    $("#filterBar").hidden = name === "custom";
  }

  function renderAll() {
    renderOpList();
    renderBan();
    renderFilter();
    renderBoard();
    renderRecommendations();
    renderCompList();
    renderCustom();
    renderEcon();
    renderSummary();
    renderTargetDetail();
    save();
  }

  function syncInputs() {
    $("#soloMode").checked = state.mode === "all";
    $("#level").value = state.level;
    $("#boxHint").textContent = state.mode === "all"
      ? "当前为全干员模式；取消勾选任一干员会自动切到 box 模式。"
      : "只按勾选的 box 计算可达性；可在左侧搜索并勾选。";
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    $$(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$(".tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
        $("#tab-box").hidden = btn.dataset.tab !== "box";
        $("#tab-ban").hidden = btn.dataset.tab !== "ban";
      });
    });

    $$(".center-tab").forEach(function (btn) {
      btn.addEventListener("click", function () { switchCenterTab(btn.dataset.center); });
    });

    $("#soloMode").addEventListener("change", function (e) {
      state.mode = e.target.checked ? "all" : "box";
      if (!e.target.checked && state.owned.size === 0) {
        state.owned = new Set(S.operators.map(function (o) { return o.name; }));
      }
      syncInputs();
      save();
      renderAll();
    });

    $("#opSearch").addEventListener("input", renderOpList);

    $("#opList").addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-op]");
      if (!cb) return;
      var name = cb.dataset.op;
      if (state.mode === "all") {
        state.mode = "box";
        state.owned = new Set(S.operators.map(function (o) { return o.name; }));
        $("#soloMode").checked = false;
      }
      if (cb.checked) state.owned.add(name); else state.owned.delete(name);
      syncInputs();
      save();
      renderAll();
    });

    $("#banCore").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-core]");
      if (!btn) return;
      var n = btn.dataset.core;
      if (state.banCore.has(n)) state.banCore.delete(n); else state.banCore.add(n);
      save();
      renderAll();
    });

    $("#banExtra").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-extra]");
      if (!btn) return;
      var n = btn.dataset.extra;
      if (state.banExtra.has(n)) state.banExtra.delete(n); else state.banExtra.add(n);
      save();
      renderAll();
    });

    $("#banSearch").addEventListener("input", renderBanList);

    $("#banList").addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-ban]");
      if (!cb) return;
      var n = cb.dataset.ban;
      if (cb.checked) state.banOps.add(n); else state.banOps.delete(n);
      save();
      renderAll();
    });

    $("#coreFilter").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-core]");
      if (!btn) return;
      var n = btn.dataset.core;
      state.selectedCore = (n && state.selectedCore !== n) ? n : "";
      save();
      renderFilter();
      renderRecommendations();
      renderCompList();
      renderSummary();
    });

    $("#extraFilter").addEventListener("change", function (e) {
      state.selectedExtra = e.target.value || "";
      save();
      renderRecommendations();
      renderCompList();
      renderSummary();
    });

    $("#clearFilter").addEventListener("click", function () {
      state.selectedCore = "";
      state.selectedExtra = "";
      state.onlyCurated = false;
      save();
      renderFilter();
      renderRecommendations();
      renderCompList();
      renderSummary();
    });

    $("#curatedFilter").addEventListener("click", function () {
      state.onlyCurated = !state.onlyCurated;
      save();
      renderFilter();
      renderRecommendations();
      renderCompList();
      renderSummary();
    });

    $("#boardSearch").addEventListener("input", renderBoardResults);
    $("#boardSearch").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = $("#boardResults [data-add]");
        if (first) { addBoard(first.dataset.add); $("#boardSearch").value = ""; renderBoardResults(); }
      }
    });

    $("#boardResults").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-add]");
      if (!btn) return;
      addBoard(btn.dataset.add);
      $("#boardSearch").value = "";
      renderBoardResults();
    });

    $("#boardChips").addEventListener("click", function (e) {
      var x = e.target.closest("[data-remove]");
      if (!x) return;
      state.board.delete(x.dataset.remove);
      save();
      renderAll();
    });

    $("#level").addEventListener("change", function (e) {
      state.level = clampInt(e.target.value, 1, 6, 1);
      save();
      renderRecommendations();
      renderCompList();
      renderCustom();
      renderEcon();
      renderSummary();
      renderTargetDetail();
    });

    $("#strategyFilter").addEventListener("change", function (e) {
      state.strategy = e.target.value || "";
      save();
      renderStrategy();
      renderRecommendations();
      renderCompList();
      renderCustom();
      renderSummary();
    });

    /* ---- 自己配阵容 ---- */
    $("#customCore").addEventListener("change", function (e) {
      state.customCore = e.target.value;
      save();
      renderCustom();
    });

    $("#customExtra").addEventListener("change", function (e) {
      state.customExtra = e.target.value || "";
      save();
      renderCustom();
    });

    $("#customStrategy").addEventListener("change", function (e) {
      state.strategy = e.target.value || "";
      save();
      renderStrategy();
      renderRecommendations();
      renderCompList();
      renderCustom();
      renderSummary();
    });

    $("#customSearch").addEventListener("input", renderCustomResults);
    $("#customSearch").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = $("#customResults [data-add-custom]");
        if (first) addCustomOp(first.dataset.addCustom);
      }
    });

    $("#customResults").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-add-custom]");
      if (!btn) return;
      addCustomOp(btn.dataset.addCustom);
    });

    $("#customChips").addEventListener("click", function (e) {
      var x = e.target.closest("[data-remove-custom]");
      if (x) { removeCustomOp(x.dataset.removeCustom); return; }
      if (e.target.closest(".slot.empty")) $("#customSearch").focus();
    });

    $$("#center-custom [data-cfilter]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.customFilter = b.dataset.cfilter;
        save();
        renderCustomFilters();
        renderCustomResults();
      });
    });

    $("#customTier").addEventListener("change", function (e) {
      state.customTier = e.target.value || "";
      save();
      renderCustomFilters();
      renderCustomResults();
    });

    $("#customAutoCore").addEventListener("click", autoFillCore);
    $("#customAutoFlex").addEventListener("click", autoFillFlex);
    $("#customAutoAll").addEventListener("click", autoFillAll);
    $("#customClearTop").addEventListener("click", clearCustom);
    $("#customClear").addEventListener("click", clearCustom);

    $("#customSave").addEventListener("click", saveCustom);
    $("#customPlanJump").addEventListener("click", function () {
      $("#customPhases").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#customShare").addEventListener("click", function () {
      shareCustomData({
        core: state.customCore,
        extra: state.customExtra,
        strategy: state.strategy,
        ops: state.customOps,
        phases: state.customPhases,
        loadout: state.customLoadout
      });
    });

    $("#customPhaseSuggest").addEventListener("click", fillPhaseReference);
    $("#customLoadoutSuggest").addEventListener("click", fillLoadoutReference);
    [
      ["#customPhaseEarly", "early"],
      ["#customPhaseMid", "mid"],
      ["#customPhaseLate", "late"]
    ].forEach(function (pair) {
      var el = $(pair[0]);
      el.addEventListener("input", function () {
        state.customPhases[pair[1]] = el.value;
      });
      el.addEventListener("change", save);
    });
    $("#customLoadout").addEventListener("input", function (e) {
      var input = e.target.closest("[data-loadout-op]");
      if (!input) return;
      state.customLoadout[input.dataset.loadoutOp] = input.value;
    });
    $("#customLoadout").addEventListener("change", function (e) {
      if (e.target.closest("[data-loadout-op]")) save();
    });

    $("#savedCustoms").addEventListener("click", function (e) {
      var load = e.target.closest("[data-load]");
      if (load) {
        var item = state.savedCustoms.find(function (c) { return c.id === load.dataset.load; });
        if (item) {
          state.customCore = item.core;
          state.customExtra = item.extra || "";
          state.strategy = validStrategy(item.strategy) ? (item.strategy || "") : state.strategy;
          state.customOps = item.ops.slice();
          state.customPhases = sanitizePhases(item.phases);
          state.customLoadout = sanitizeLoadout(item.loadout);
          save();
          switchCenterTab("custom");
          renderCustom();
        }
        return;
      }
      var sh = e.target.closest("[data-share]");
      if (sh) {
        var shared = state.savedCustoms.find(function (c) { return c.id === sh.dataset.share; });
        if (shared) shareCustomData(shared);
        return;
      }
      var del = e.target.closest("[data-del]");
      if (del) {
        state.savedCustoms = state.savedCustoms.filter(function (c) { return c.id !== del.dataset.del; });
        save();
        renderCustom();
      }
    });

    $("#recommendations").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-copy]");
      if (btn) copyToCustom(btn.dataset.copy);
    });

    $("#compList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-copy]");
      if (btn) copyToCustom(btn.dataset.copy);
    });

    $("#targetSearch").addEventListener("input", renderTargetResults);
    $("#targetResults").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-target]");
      if (!btn) return;
      targetName = btn.dataset.target;
      $("#targetSearch").value = "";
      $("#targetResults").innerHTML = "";
      renderTargetDetail();
    });

    $("#resetBtn").addEventListener("click", function () {
      if (!window.confirm("清空本局的 box / ban / 场上记录、筛选和自定义阵容？")) return;
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = freshState();
      targetName = null;
      syncInputs();
      switchCenterTab("rec");
      renderAll();
    });
  }

  function renderSeason() {
    var season = (S.meta.season || "").replace("act3autochess/", "");
    $("#seasonLabel").textContent = "赛季 " + season;
    $("#dataMeta").textContent = "数据生成 " + S.meta.generated +
      " · " + S.operators.length + " 干员 / " + S.comps.length + " 阵容";
  }

  document.addEventListener("DOMContentLoaded", function () {
    E.init(S);
    syncInputs();
    bind();
    renderSeason();
    switchCenterTab("rec");
    renderAll();
    if (loadSharedCustom()) {
      renderAll();
      switchCenterTab("custom");
      flashCustom("已载入分享的自定义阵容，可以直接微调。", true);
    }
  });
})();
