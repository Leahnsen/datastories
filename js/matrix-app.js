let records = [];
    const ARTICLE_GLYPH_TEMPLATE = "\u003csvg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"1080\" zoomAndPan=\"magnify\" viewBox=\"0 0 810 809.999993\" height=\"1080\" preserveAspectRatio=\"xMidYMid meet\" version=\"1.0\">\u003cdefs>\u003cclipPath id=\"6d4aa08ee5\">\u003cpath d=\"M 105.941406 27.640625 L 703.691406 27.640625 L 703.691406 782.140625 L 105.941406 782.140625 Z M 105.941406 27.640625 \" clip-rule=\"nonzero\"/>\u003c/clipPath>\u003cclipPath id=\"43da0cba48\">\u003cpath d=\"M 549 27.640625 L 703.691406 27.640625 L 703.691406 183 L 549 183 Z M 549 27.640625 \" clip-rule=\"nonzero\"/>\u003c/clipPath>\u003c/defs>\u003cg clip-path=\"url(#6d4aa08ee5)\">\u003cpath fill=\"#f8f8fb\" d=\"M 668.410156 782.335938 L 141.394531 782.335938 C 121.847656 782.335938 105.941406 766.429688 105.941406 746.882812 L 105.941406 63.105469 C 105.941406 43.558594 121.847656 27.652344 141.394531 27.652344 L 560.707031 27.652344 C 563.773438 27.652344 566.648438 28.804688 568.757812 31.101562 L 700.605469 162.953125 C 702.714844 165.058594 704.054688 168.125 704.054688 171 L 704.054688 746.882812 C 704.054688 766.429688 687.957031 782.335938 668.410156 782.335938 Z M 141.394531 50.648438 C 134.496094 50.648438 128.9375 56.207031 128.9375 63.105469 L 128.9375 746.882812 C 128.9375 753.78125 134.496094 759.339844 141.394531 759.339844 L 668.601562 759.339844 C 675.5 759.339844 681.058594 753.78125 681.058594 746.882812 L 681.058594 175.601562 L 556.109375 50.648438 Z M 141.394531 50.648438 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003c/g>\u003cg clip-path=\"url(#43da0cba48)\">\u003cpath fill=\"#f8f8fb\" d=\"M 692.558594 182.308594 L 560.707031 182.308594 C 554.382812 182.308594 549.210938 177.132812 549.210938 170.808594 L 549.210938 39.152344 C 549.210938 34.550781 552.082031 30.335938 556.300781 28.613281 C 560.515625 26.886719 565.5 27.84375 568.757812 31.101562 L 700.605469 162.953125 C 703.863281 166.210938 704.820312 171.191406 703.097656 175.410156 C 701.371094 179.625 697.15625 182.308594 692.558594 182.308594 Z M 572.207031 159.3125 L 664.769531 159.3125 L 572.207031 66.75 Z M 572.207031 159.3125 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003c/g>\u003cpath fill=\"#f8f8fb\" d=\"M 400.496094 343.671875 L 205.597656 343.671875 C 199.273438 343.671875 194.097656 338.496094 194.097656 332.171875 L 194.097656 137.273438 C 194.097656 130.949219 199.273438 125.773438 205.597656 125.773438 L 400.496094 125.773438 C 406.820312 125.773438 411.992188 130.949219 411.992188 137.273438 L 411.992188 332.171875 C 411.992188 338.496094 406.820312 343.671875 400.496094 343.671875 Z M 217.09375 320.671875 L 388.996094 320.671875 L 388.996094 148.769531 L 217.09375 148.769531 Z M 217.09375 320.671875 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 600.570312 244.976562 L 450.707031 244.976562 C 444.382812 244.976562 439.207031 239.800781 439.207031 233.476562 C 439.207031 227.152344 444.382812 221.976562 450.707031 221.976562 L 600.570312 221.976562 C 606.894531 221.976562 612.066406 227.152344 612.066406 233.476562 C 612.066406 239.800781 606.894531 244.976562 600.570312 244.976562 Z M 600.570312 244.976562 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 591.371094 311.089844 L 462.011719 311.089844 C 455.6875 311.089844 450.515625 305.917969 450.515625 299.59375 C 450.515625 293.269531 455.6875 288.09375 462.011719 288.09375 L 591.371094 288.09375 C 597.695312 288.09375 602.867188 293.269531 602.867188 299.59375 C 602.867188 305.917969 597.695312 311.089844 591.371094 311.089844 Z M 591.371094 311.089844 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 613.027344 410.363281 L 209.8125 410.363281 C 203.488281 410.363281 198.3125 405.1875 198.3125 398.863281 C 198.3125 392.539062 203.488281 387.363281 209.8125 387.363281 L 613.027344 387.363281 C 619.351562 387.363281 624.523438 392.539062 624.523438 398.863281 C 624.523438 405.1875 619.351562 410.363281 613.027344 410.363281 Z M 613.027344 410.363281 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 613.027344 476.859375 L 209.8125 476.859375 C 203.488281 476.859375 198.3125 471.6875 198.3125 465.363281 C 198.3125 459.039062 203.488281 453.863281 209.8125 453.863281 L 613.027344 453.863281 C 619.351562 453.863281 624.523438 459.039062 624.523438 465.363281 C 624.523438 471.6875 619.351562 476.859375 613.027344 476.859375 Z M 613.027344 476.859375 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 577.378906 538.378906 L 202.53125 538.378906 C 196.207031 538.378906 191.03125 533.203125 191.03125 526.878906 C 191.03125 520.554688 196.207031 515.382812 202.53125 515.382812 L 577.378906 515.382812 C 583.703125 515.382812 588.878906 520.554688 588.878906 526.878906 C 588.878906 533.203125 583.703125 538.378906 577.378906 538.378906 Z M 577.378906 538.378906 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 469.292969 602.578125 L 203.679688 602.578125 C 197.355469 602.578125 192.179688 597.402344 192.179688 591.078125 C 192.179688 584.753906 197.355469 579.582031 203.679688 579.582031 L 469.292969 579.582031 C 475.617188 579.582031 480.792969 584.753906 480.792969 591.078125 C 480.792969 597.402344 475.617188 602.578125 469.292969 602.578125 Z M 469.292969 602.578125 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003cpath fill=\"#f8f8fb\" d=\"M 404.136719 667.734375 L 204.636719 667.734375 C 198.3125 667.734375 193.140625 662.5625 193.140625 656.238281 C 193.140625 649.914062 198.3125 644.738281 204.636719 644.738281 L 404.136719 644.738281 C 410.460938 644.738281 415.636719 649.914062 415.636719 656.238281 C 415.636719 662.5625 410.460938 667.734375 404.136719 667.734375 Z M 404.136719 667.734375 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/>\u003c/svg>";
    const INPUT_GLYPH_TEMPLATE = "\u003csvg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"1080\" zoomAndPan=\"magnify\" viewBox=\"0 0 810 809.999993\" height=\"1080\" preserveAspectRatio=\"xMidYMid meet\" version=\"1.0\">\u003cdefs>\u003cclipPath id=\"27b780c3e7\">\u003cpath d=\"M 253.125 0 L 556.875 0 L 556.875 253.125 L 253.125 253.125 Z M 0 253.125 L 810 253.125 L 810 556.875 L 0 556.875 Z M 253.125 556.875 L 556.875 556.875 L 556.875 810 L 253.125 810 Z M 253.125 556.875 \" clip-rule=\"nonzero\"/>\u003c/clipPath>\u003cclipPath id=\"5a2f55470b\">\u003cpath d=\"M 253.125 0 L 556.875 0 L 556.875 253.125 L 253.125 253.125 Z M 0 253.125 L 810 253.125 L 810 556.875 L 0 556.875 Z M 253.125 556.875 L 556.875 556.875 L 556.875 810 L 253.125 810 Z M 253.125 556.875 \" clip-rule=\"nonzero\"/>\u003c/clipPath>\u003cclipPath id=\"149601081a\">\u003crect x=\"0\" width=\"810\" y=\"0\" height=\"810\"/>\u003c/clipPath>\u003c/defs>\u003cg clip-path=\"url(#27b780c3e7)\">\u003cg transform=\"matrix(1, 0, 0, 1, 0, 0.000000000000039746)\">\u003cg clip-path=\"url(#149601081a)\">\u003cg clip-path=\"url(#5a2f55470b)\">\u003crect x=\"-178.2\" width=\"1166.4\" fill=\"#737373\" height=\"1166.39999\" y=\"-178.199998\" fill-opacity=\"1\"/>\u003c/g>\u003c/g>\u003c/g>\u003c/g>\u003c/svg>";
    const xOrder = ["local", "distributed"];
    const yOrder = ["parametric", "generative"];
    const xLabel = { local:"Local", distributed:"Distributed" };
    const yLabel = { parametric:"Parametric", generative:"Generative" };
    const QUADRANT_ACCENTS = {
      "parametric::local": "#4aff00",
      "parametric::distributed": "#ff00e6",
      "generative::local": "#ff7035",
      "generative::distributed": "#00ffd9",
    };
    const grid = document.getElementById("grid");
    const pointsLayer = document.getElementById("points");
    const matrixCaption = document.getElementById("matrix-caption");
    const matrixViewOverviewBtn = document.getElementById("matrix-view-overview");
    const matrixViewInputBtn = document.getElementById("matrix-view-input");
    const matrixViewDepthBtn = document.getElementById("matrix-view-depth");
    const matrixEl = document.getElementById("matrix");
    const matrixLegendOverview = document.getElementById("matrix-legend-overview");
    const matrixLegendInput = document.getElementById("matrix-legend-input");
    const matrixLegendLayer = document.getElementById("matrix-legend-layer");
    const cellList = document.getElementById("cell-list");
    const detail = document.getElementById("detail");
    const tooltip = document.getElementById("tooltip");
    const logicAndBtn = document.getElementById("logic-and");
    const logicOrBtn = document.getElementById("logic-or");
    const vizFilterGrid = document.getElementById("viz-filter-grid");
    const vizCountGrid = document.getElementById("viz-count-grid");
    const clearVizFiltersBtn = document.getElementById("clear-viz-filters");
    const titleSearchInput = document.getElementById("title-search");
    const articlesCount = document.getElementById("articles-count");
    const articlesListSummary = document.getElementById("articles-list-summary");
    const wrapEl = document.querySelector("main.wrap");
    const matrixPanelContainer = document.querySelector(".matrix-panel");
    const legendPanel = document.querySelector(".legend-panel");
    const legendToggle = document.getElementById("legend-toggle");
    let activeCell = null;
    let selectedArticleId = null;
    let legendCollapsed = false;
    let vizFilterLogic = "and";
    const selectedVizTypes = new Set();
    let titleQuery = "";
    const vizTypeOrder = ["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo", "N", "A(I)", "S(I)"];
    const BASE_INPUT_PALETTE = ["#8dd3c7","#bebada","#fb8072","#80b1d3","#fdb462","#b3de69","#fccde5","#d9d9d9","#bc80bd","#ffffb3"];
    const SINGLE_COLOR = BASE_INPUT_PALETTE[0];
    const LEGEND_INPUT_TINT = SINGLE_COLOR;
    const ARTICLE_FG_DARK = "#000000";
    const MULTI_GRADIENT = "linear-gradient(90deg, " + BASE_INPUT_PALETTE.join(", ") + ")";
    const DEPTH_COLORS = {
      single: "#d8dde5",
      dual: "#aeb6c1",
      triple: "#6e7886",
    };
    const articleSourceMap = new Map();
    let recordById = new Map();
    const initialSelectedArticleId = (() => {
      try {
        const value = new URLSearchParams(window.location.search).get("article");
        return String(value || "").trim();
      } catch (_) {
        return "";
      }
    })();
    const DETAIL_ZOOM_BASE = 0.7;
    const DETAIL_ZOOM_MIN = DETAIL_ZOOM_BASE * 0.5;
    const DETAIL_ZOOM_MAX = DETAIL_ZOOM_BASE * 2.5;
    let detailZoom = DETAIL_ZOOM_BASE;
    let activeMatrixView = "overview";

    const embeddingFromY = (yCat) => String(yCat || "").startsWith("distributed_") ? "distributed" : "local";
    const multiplicityFromY = (yCat) => String(yCat || "").endsWith("_multiple") ? "multiple" : "single";
    const epistemicFromX = (xCat) => (xCat === "generative" ? "generative" : "parametric");
    const quadrantAccentColorByAxes = (epistemic, embedding) =>
      QUADRANT_ACCENTS[(epistemic || "parametric") + "::" + (embedding || "local")] || "#f97316";
    const quadrantDisplayNameByAxes = (epistemic, embedding) => {
      const mode = (epistemic || "parametric") === "generative" ? "Creating" : "Self-positioning";
      const placement = (embedding || "local") === "distributed" ? "Distributed" : "Local";
      return mode + " - " + placement;
    };
    const quadrantAccentColorForRecord = (record) =>
      quadrantAccentColorByAxes(epistemicFromX(record?.x_category), embeddingFromY(record?.y_category));
    function classificationTagForRecord(record) {
      return quadrantDisplayNameByAxes(epistemicFromX(record?.x_category), embeddingFromY(record?.y_category));
    }
    const cellKey = (x,y) => x + "::" + y;
    let grouped = new Map();
    function rebuildDataIndexes() {
      recordById = new Map(records.map((r) => [String(r.article_id || ""), r]));
      grouped = new Map();
      for (const r of records) {
        const key = cellKey(embeddingFromY(r.y_category), epistemicFromX(r.x_category));
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(r);
      }
    }
    function renderGridFor(targetGrid) {
      targetGrid.innerHTML = "";
      for (const y of yOrder) {
        for (const x of xOrder) {
          const key = cellKey(x,y);
          const cellRows = grouped.get(key) || [];
          const count = cellRows.length;
          const cell = document.createElement("div");
          cell.className = "cell";
          cell.dataset.x = x;
          cell.dataset.y = y;
          if (activeCell && activeCell.x === x && activeCell.y === y) cell.classList.add("active");
          cell.style.background = activeCell && activeCell.x === x && activeCell.y === y ? "#d6e0eb" : "#fff";
          const c = document.createElement("div");
          c.className = "count";
          c.textContent = String(count);
          cell.appendChild(c);
          cell.onclick = () => selectCell(x, y);
          targetGrid.appendChild(cell);
        }
      }
    }

    function hasAnyActiveListFilter() {
      return selectedVizTypes.size > 0 || titleQuery.length > 0;
    }

    function normalizeTitle(value) {
      return String(value || "").toLowerCase();
    }

    function recordMatchesFilterType(record, typeKey) {
      if (typeKey === "A(I)") return Boolean(record && record.has_input_dependent_annotation);
      if (typeKey === "S(I)") return Boolean(record && record.has_input_dependent_story);
      const types = Array.isArray(record?.visualization_types) ? record.visualization_types : [];
      if (typeKey === "N") return types.includes("N") || types.includes("Nds");
      return types.includes(typeKey);
    }

    function matchesVizTypes(record) {
      if (selectedVizTypes.size === 0) return true;
      if (vizFilterLogic === "or") {
        for (const t of selectedVizTypes) {
          if (recordMatchesFilterType(record, t)) return true;
        }
        return false;
      }
      for (const t of selectedVizTypes) {
        if (!recordMatchesFilterType(record, t)) return false;
      }
      return true;
    }

    function matchesTitleQuery(record) {
      if (!titleQuery) return true;
      const englishTitle = getEnglishSubtitle(record);
      const hay =
        normalizeTitle(record.title) + " " +
        normalizeTitle(englishTitle) + " " +
        normalizeTitle(record.article_id);
      return hay.includes(titleQuery);
    }

    function getCellFilteredRows() {
      let rows = records;
      if (activeCell) {
        rows = rows.filter((r) =>
          embeddingFromY(r.y_category) === activeCell.x &&
          epistemicFromX(r.x_category) === activeCell.y
        );
      }
      return rows;
    }

    function getVisibleRows() {
      return getCellFilteredRows().filter((r) => matchesVizTypes(r) && matchesTitleQuery(r));
    }

    function layerComboKey(record) {
      const layers = new Set(Array.isArray(record.narrative_layers) ? record.narrative_layers : []);
      const parts = [];
      if (layers.has("visualization")) parts.push("V");
      if (layers.has("annotation")) parts.push("A");
      if (layers.has("story")) parts.push("S");
      return parts.join("") || "V";
    }

    function layerDepthColor(combo) {
      if (combo.length >= 3) return DEPTH_COLORS.triple;
      if (combo.length === 2) return DEPTH_COLORS.dual;
      return DEPTH_COLORS.single;
    }

    function toDataUri(svg) {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    function tintOverviewGlyph(svgText, colorHex) {
      return String(svgText || "").replace(/#[0-9a-fA-F]{6}/g, (hex) => {
        const lc = String(hex).toLowerCase();
        if (lc === "#000000") return hex;
        return colorHex;
      });
    }

    const OVERVIEW_PLUS_DEFAULT = INPUT_GLYPH_TEMPLATE
      ? toDataUri(tintOverviewGlyph(INPUT_GLYPH_TEMPLATE, "#737373"))
      : "./design/glyphs/I.svg";
    const overviewIconByAccent = new Map();
    function overviewSelectedGlyphDataUri(colorHex) {
      if (!INPUT_GLYPH_TEMPLATE) return "./design/glyphs/I.svg";
      const key = String(colorHex || "").toLowerCase();
      if (overviewIconByAccent.has(key)) return overviewIconByAccent.get(key);
      const tinted = toDataUri(tintOverviewGlyph(INPUT_GLYPH_TEMPLATE, colorHex || "#f97316"));
      overviewIconByAccent.set(key, tinted);
      return tinted;
    }

    function isGrayHex(hex) {
      const value = String(hex || "").replace("#", "");
      if (value.length !== 6) return false;
      const r = value.slice(0, 2).toLowerCase();
      const g = value.slice(2, 4).toLowerCase();
      const b = value.slice(4, 6).toLowerCase();
      return r === g && g === b;
    }

    function tintLegendSvg(svgText, mode, customColor) {
      const tintColor = String(customColor || "").trim() || LEGEND_INPUT_TINT;
      if (mode === "input-visible-gradient") {
        const gradientId = "legend-input-visible-grad";
        const gradientDef = '<defs><linearGradient id="' + gradientId + '" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#8dd3c7"/><stop offset="50%" stop-color="#8dd3c7"/><stop offset="50%" stop-color="#bebada"/><stop offset="100%" stop-color="#bebada"/></linearGradient></defs>';
        const source = String(svgText || "");
        const withGradient = source.includes('id="' + gradientId + '"')
          ? source
          : source.replace(/<svg\b([^>]*)>/i, '<svg$1>' + gradientDef);
        return withGradient.replace(/#9ee493/gi, "url(#" + gradientId + ")");
      }
      if (mode === "input-visible") {
        return String(svgText || "").replace(/#9ee493/gi, tintColor);
      }
      if (mode !== "input") return String(svgText || "");
      return String(svgText || "").replace(/#[0-9a-fA-F]{6}/g, (hex) => {
        const lc = hex.toLowerCase();
        if (mode === "input") {
          if (lc === "#000000") return hex;
          if (isGrayHex(lc)) return tintColor;
          return hex;
        }
        if (lc === "#000000" || isGrayHex(lc)) {
          return hex;
        }
        return tintColor;
      });
    }

    async function fetchGlyphText(candidates) {
      for (const candidate of candidates) {
        const url = String(candidate || "").trim();
        if (!url) continue;
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          return await res.text();
        } catch (_) {}
      }
      return "";
    }

    async function applyLegendGlyphColors() {
      const targets = Array.from(document.querySelectorAll("img[data-legend-tone]"));
      await Promise.all(targets.map(async (img) => {
        const mode = img.getAttribute("data-legend-tone");
        const customColor = img.getAttribute("data-legend-color");
        const candidates = [
          img.getAttribute("data-glyph-primary"),
          img.getAttribute("data-glyph-fallback"),
          img.getAttribute("src"),
        ];
        const svgText = await fetchGlyphText(candidates);
        if (!svgText) return;
        const tinted = tintLegendSvg(svgText, mode, customColor);
        img.src = toDataUri(tinted);
      }));
    }

    function articleGlyphDataUriOverview(record, selected = false) {
      if (!selected) return OVERVIEW_PLUS_DEFAULT;
      return overviewSelectedGlyphDataUri(quadrantAccentColorForRecord(record));
    }

    function pointVisualStyle(record, modeName) {
      if (modeName === "overview") {
        return {
          useIcon: true,
          backgroundColor: "rgba(15,23,42,0.06)",
          backgroundImage: "none",
          border: "none",
          borderRadius: "6px"
        };
      }
      if (modeName === "input") {
        const isMultiple = multiplicityFromY(record.y_category) === "multiple";
        return {
          useIcon: false,
          backgroundColor: isMultiple ? "#ffffff" : SINGLE_COLOR,
          backgroundImage: isMultiple ? MULTI_GRADIENT : "none",
          border: "1px solid #7ea9a4",
          borderRadius: "6px",
        };
      }
      if (modeName === "depth") {
        return {
          useIcon: false,
          backgroundColor: layerDepthColor(layerComboKey(record)),
          backgroundImage: "none",
          border: "1px solid #8e98a5",
          borderRadius: "6px",
        };
      }
      return {
        useIcon: false,
        backgroundColor: "transparent",
        backgroundImage: "none",
        border: "1px solid transparent",
        borderRadius: "6px"
      };
    }

    function renderPointsFor(targetLayer, modeName) {
      targetLayer.innerHTML = "";
      document.getElementById("legend-single").style.background = SINGLE_COLOR;
      document.getElementById("legend-multiple").style.background = "transparent";
      document.getElementById("legend-multiple").style.backgroundImage = MULTI_GRADIENT;
      document.getElementById("legend-depth-1").style.background = DEPTH_COLORS.single;
      document.getElementById("legend-depth-2").style.background = DEPTH_COLORS.dual;
      document.getElementById("legend-depth-3").style.background = DEPTH_COLORS.triple;
      const highlightByFilter = hasAnyActiveListFilter();
      const cellPaddingX = 10;
      const cellPaddingY = 10;
      const markerSize = 22;
      const markerGap = 3;
      const maxPerColumn = 5;

      const groupedPoints = new Map();
      for (const r of records) {
        const embed = embeddingFromY(r.y_category);
        const epi = epistemicFromX(r.x_category);
        const xi = xOrder.indexOf(embed);
        const yi = yOrder.indexOf(epi);
        if (xi < 0 || yi < 0) continue;
        const key = [xi, yi].join(":");
        if (!groupedPoints.has(key)) groupedPoints.set(key, []);
        groupedPoints.get(key).push({ r, xi, yi });
      }

      if (matrixEl) {
        matrixEl.style.height = "";
        matrixEl.style.aspectRatio = "";
      }

      const box = targetLayer.getBoundingClientRect();
      const cw = box.width / xOrder.length;
      const ch = box.height / yOrder.length;

      for (const entries of groupedPoints.values()) {
        if (modeName === "depth") {
          const comboOrder = ["V", "A", "S", "VA", "VS", "AS", "VAS"];
          entries.sort((a, b) => {
            const ca = layerComboKey(a.r);
            const cb = layerComboKey(b.r);
            const oa = comboOrder.indexOf(ca);
            const ob = comboOrder.indexOf(cb);
            if (oa !== ob) return oa - ob;
            const t = String(a.r.title || "").localeCompare(String(b.r.title || ""), undefined, { sensitivity: "base" });
            if (t !== 0) return t;
            return String(a.r.article_id || "").localeCompare(String(b.r.article_id || ""), undefined, { numeric: true, sensitivity: "base" });
          });
        } else if (modeName === "input") {
          entries.sort((a, b) => {
            const ma = multiplicityFromY(a.r.y_category) === "multiple" ? 1 : 0;
            const mb = multiplicityFromY(b.r.y_category) === "multiple" ? 1 : 0;
            if (ma !== mb) return ma - mb; // single first
            const t = String(a.r.title || "").localeCompare(String(b.r.title || ""), undefined, { sensitivity: "base" });
            if (t !== 0) return t;
            return String(a.r.article_id || "").localeCompare(String(b.r.article_id || ""), undefined, { numeric: true, sensitivity: "base" });
          });
        } else {
          entries.sort((a, b) => {
            const t = String(a.r.title || "").localeCompare(String(b.r.title || ""), undefined, { sensitivity: "base" });
            if (t !== 0) return t;
            return String(a.r.article_id || "").localeCompare(String(b.r.article_id || ""), undefined, { numeric: true, sensitivity: "base" });
          });
        }
        const first = entries[0];
        const cellLeft = first.xi * cw;
        const cellTop = first.yi * ch;
        const contentLeft = cellLeft + cellPaddingX;
        const contentTop = cellTop + cellPaddingY;
        const contentWidth = Math.max(1, cw - cellPaddingX * 2);
        const contentHeight = Math.max(1, ch - cellPaddingY * 2);
        const contentBottom = contentTop + contentHeight;

        const cellOverlay = document.createElement("div");
        cellOverlay.style.position = "absolute";
        cellOverlay.style.left = contentLeft + "px";
        cellOverlay.style.top = contentTop + "px";
        cellOverlay.style.width = contentWidth + "px";
        cellOverlay.style.height = contentHeight + "px";
        cellOverlay.style.overflow = "hidden";
        cellOverlay.style.pointerEvents = "none";
        targetLayer.appendChild(cellOverlay);

        for (let i = 0; i < entries.length; i += 1) {
          const r = entries[i].r;
          const columnIndex = Math.floor(i / maxPerColumn);
          const rowIndex = i % maxPerColumn;
          const x = columnIndex * (markerSize + markerGap);
          const y = contentBottom - contentTop - markerSize - rowIndex * (markerSize + markerGap);
          const p = document.createElement("button");
          p.className = "point";
          p.dataset.pointMode = modeName;
          p.style.width = markerSize + "px";
          p.style.height = markerSize + "px";
          const style = pointVisualStyle(r, modeName);
          p.style.backgroundColor = style.backgroundColor;
          p.style.backgroundImage = style.backgroundImage;
          p.style.border = style.border;
          p.style.borderRadius = style.borderRadius;
          if (style.useIcon) {
            const icon = document.createElement("img");
            icon.className = "point-icon";
            icon.alt = "";
            const isSelectedOverviewPoint =
              modeName === "overview" &&
              !!selectedArticleId &&
              String(selectedArticleId) === String(r.article_id || "");
            icon.src = articleGlyphDataUriOverview(r, isSelectedOverviewPoint);
            if (modeName === "overview") {
              icon.classList.add("overview-plus");
            }
            p.appendChild(icon);
          }
          if (highlightByFilter) {
            if (matchesVizTypes(r) && matchesTitleQuery(r)) {
              p.classList.add("filtered-match");
            } else {
              p.classList.add("filtered-dim");
            }
          }
          p.style.left = x + "px";
          p.style.top = y + "px";
          p.onmouseenter = (e) => {
            tooltip.style.display = "block";
            const hoverTitle = getEnglishSubtitle(r) || String(r.title || "");
            const hoverId = String(r.article_id || "").trim();
            tooltip.textContent = hoverId ? (hoverId + " - " + hoverTitle) : hoverTitle;
            tooltip.style.left = (e.clientX + 12) + "px";
            tooltip.style.top = (e.clientY + 12) + "px";
          };
          p.onmousemove = (e) => {
            tooltip.style.left = (e.clientX + 12) + "px";
            tooltip.style.top = (e.clientY + 12) + "px";
          };
          p.onmouseleave = () => { tooltip.style.display = "none"; };
          p.onclick = () => showDetail(r);
          p.dataset.articleId = String(r.article_id || "");
          if (selectedArticleId && p.dataset.articleId === selectedArticleId) {
            p.classList.add("selected");
          }
          cellOverlay.appendChild(p);
        }
      }
    }

    function escapeSvgText(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function buildOverviewEntriesByCell() {
      const byCell = new Map();
      for (const r of records) {
        const embed = embeddingFromY(r.y_category);
        const epi = epistemicFromX(r.x_category);
        const xi = xOrder.indexOf(embed);
        const yi = yOrder.indexOf(epi);
        if (xi < 0 || yi < 0) continue;
        const key = [xi, yi].join(":");
        if (!byCell.has(key)) byCell.set(key, []);
        byCell.get(key).push(r);
      }
      for (const entries of byCell.values()) {
        entries.sort((a, b) => {
          const t = String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
          if (t !== 0) return t;
          return String(a.article_id || "").localeCompare(String(b.article_id || ""), undefined, { numeric: true, sensitivity: "base" });
        });
      }
      return byCell;
    }

    function downloadOverviewSvg() {
      const width = 940;
      const height = 760;
      const plotX = 240;
      const plotY = 160;
      const plotW = 380;
      const plotH = 440;
      const cw = plotW / 2;
      const ch = plotH / 2;
      const markerGap = 3;
      const markerSize = 22;
      const cellPaddingX = 10;
      const cellPaddingY = 10;
      const maxPerColumn = 5;
      const byCell = buildOverviewEntriesByCell();
      const quadrantUnderlineColor = (xi, yi) => {
        if (yi === 0 && xi === 0) return "#4aff00"; // Positioning-local
        if (yi === 0 && xi === 1) return "#ff00e6"; // Positioning-distributed
        if (yi === 1 && xi === 0) return "#ff7035"; // Creating-local
        return "#00ffd9"; // Creating-distributed
      };

      const parts = [];
      parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '">');
      parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');

      parts.push('<text x="' + (plotX + plotW / 2) + '" y="76" text-anchor="middle" fill="#64748b" font-size="32" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">' + escapeSvgText("Overview of user input across " + records.length + " data stories") + "</text>");
      parts.push('<text x="' + (plotX + plotW / 2) + '" y="112" text-anchor="middle" fill="#64748b" font-size="30" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Narrativ integration of user input</text>');
      parts.push('<text x="' + (plotX + cw / 2) + '" y="142" text-anchor="middle" fill="#111827" font-size="34" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Local integration</text>');
      parts.push('<text x="' + (plotX + cw + cw / 2) + '" y="142" text-anchor="middle" fill="#111827" font-size="34" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Distributed integration</text>');
      parts.push('<text x="' + (plotX - 160) + '" y="' + (plotY + ch / 2) + '" transform="rotate(-90 ' + (plotX - 160) + " " + (plotY + ch / 2) + ')" text-anchor="middle" fill="#64748b" font-size="30" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Role of user input</text>');
      parts.push('<text x="' + (plotX - 22) + '" y="' + (plotY + ch * 0.35) + '" text-anchor="end" fill="#111827" font-size="40" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Positioning oneself</text>');
      parts.push('<text x="' + (plotX - 22) + '" y="' + (plotY + ch * 0.35 + 42) + '" text-anchor="end" fill="#111827" font-size="40" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">within existing data</text>');
      parts.push('<text x="' + (plotX - 22) + '" y="' + (plotY + ch + ch * 0.55) + '" text-anchor="end" fill="#111827" font-size="40" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">Creating new</text>');
      parts.push('<text x="' + (plotX - 22) + '" y="' + (plotY + ch + ch * 0.55 + 42) + '" text-anchor="end" fill="#111827" font-size="40" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600">data</text>');

      parts.push('<line x1="' + (plotX + cw) + '" y1="' + plotY + '" x2="' + (plotX + cw) + '" y2="' + (plotY + plotH) + '" stroke="#667085" stroke-width="2"/>');
      parts.push('<line x1="' + plotX + '" y1="' + (plotY + ch) + '" x2="' + (plotX + plotW) + '" y2="' + (plotY + ch) + '" stroke="#667085" stroke-width="2"/>');

      for (const y of yOrder) {
        for (const x of xOrder) {
          const xi = xOrder.indexOf(x);
          const yi = yOrder.indexOf(y);
          const key = [xi, yi].join(":");
          const entries = byCell.get(key) || [];
          const cellLeft = plotX + xi * cw;
          const cellTop = plotY + yi * ch;
          const innerLeft = cellLeft + cellPaddingX;
          const innerTop = cellTop + cellPaddingY;
          const innerHeight = Math.max(1, ch - cellPaddingY * 2);
          const innerBottom = innerTop + innerHeight;
          const countX = cellLeft + cw - 18;
          const countY = cellTop + 54;
          const countText = String(entries.length);
          const underlineColor = quadrantUnderlineColor(xi, yi);
          const underlineLen = countText.length <= 1 ? 24 : 40;
          parts.push('<text x="' + countX + '" y="' + countY + '" text-anchor="end" fill="#98a2b3" font-size="64" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="500">' + countText + "</text>");
          parts.push('<line x1="' + (countX - underlineLen) + '" y1="' + (countY + 7) + '" x2="' + countX + '" y2="' + (countY + 7) + '" stroke="' + underlineColor + '" stroke-width="4" stroke-linecap="round"/>');
          for (let i = 0; i < entries.length; i += 1) {
            const columnIndex = Math.floor(i / maxPerColumn);
            const rowIndex = i % maxPerColumn;
            const px = innerLeft + columnIndex * (markerSize + markerGap);
            const py = innerBottom - markerSize - rowIndex * (markerSize + markerGap);
            const href = articleGlyphDataUriOverview();
            parts.push('<rect x="' + px + '" y="' + py + '" width="' + markerSize + '" height="' + markerSize + '" rx="6" fill="rgba(15,23,42,0.06)" stroke="rgba(15,23,42,0.14)"/>');
            parts.push('<image href="' + href + '" x="' + px + '" y="' + py + '" width="' + markerSize + '" height="' + markerSize + '" filter="grayscale(1) brightness(0)"/>');
          }
        }
      }

      parts.push("</svg>");
      const svgText = parts.join("");
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "matrix-overview.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function refreshSelectedPointHighlight() {
      const selected = selectedArticleId ? String(selectedArticleId) : "";
      document.querySelectorAll(".point").forEach((el) => {
        const isSelected = !!selected && el.dataset.articleId === selected;
        el.classList.toggle("selected", isSelected);
        el.classList.toggle("selection-match", isSelected);
        el.classList.toggle("selection-dim", !!selected && !isSelected);
        const icon = el.querySelector(".point-icon.overview-plus");
        if (icon) {
          const rec = recordById.get(String(el.dataset.articleId || "")) || null;
          icon.src = articleGlyphDataUriOverview(rec, isSelected);
        }
        if (isSelected) {
          el.classList.remove("filtered-dim");
        }
      });
    }

    function renderVizTypeFilters() {
      const counts = new Map();
      for (const key of vizTypeOrder) counts.set(key, 0);
      for (const r of records) {
        for (const key of vizTypeOrder) {
          if (recordMatchesFilterType(r, key)) {
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
      vizFilterGrid.innerHTML = vizTypeOrder.map((typeKey) => {
        const checked = selectedVizTypes.has(typeKey) ? "checked" : "";
        const total = counts.get(typeKey) || 0;
        return '<label><input type="checkbox" data-viz-type="' + typeKey + '" ' + checked + '> ' + typeKey + ' <span class="summary">(' + total + ')</span></label>';
      }).join("");
      vizFilterGrid.querySelectorAll("input[data-viz-type]").forEach((el) => {
        el.onchange = () => {
          const key = el.dataset.vizType;
          if (el.checked) selectedVizTypes.add(key);
          else selectedVizTypes.delete(key);
          renderAll();
        };
      });
    }

    function renderVizTypeCounts(rows) {
      const counts = new Map();
      for (const key of vizTypeOrder) counts.set(key, 0);
      for (const r of rows) {
        for (const key of vizTypeOrder) {
          if (recordMatchesFilterType(r, key)) {
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
      vizCountGrid.innerHTML = vizTypeOrder
        .map((key) => '<div class="count-chip">' + key + ': ' + (counts.get(key) || 0) + "</div>")
        .join("");
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"]/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));
    }

    function getOriginalPublicationUrl(record) {
      if (!record || typeof record !== "object") return "";
      const mapped = articleSourceMap.get(String(record.article_id || "")) || null;
      const candidates = [
        mapped && mapped.url,
        record.original_url,
        record.URL,
        record.url,
        record.link,
        record.source_url,
        record.sourceUrl,
        record.publication_url,
        record.publicationUrl,
      ];
      const meta = record.meta && typeof record.meta === "object" ? record.meta : null;
      if (meta) {
        candidates.push(
          meta.original_url,
          meta.URL,
          meta.url,
          meta.link,
          meta.source_url,
          meta.sourceUrl,
          meta.publication_url,
          meta.publicationUrl
        );
      }
      for (const candidate of candidates) {
        const s = String(candidate || "").trim();
        if (/^https?:\/\//i.test(s)) return s;
      }
      return "";
    }

    function getNewsOrganization(record) {
      if (!record || typeof record !== "object") return "";
      const mapped = articleSourceMap.get(String(record.article_id || "")) || null;
      const candidates = [
        mapped && mapped.news_org,
        record.news_org,
        record.newsOrg,
        record.publisher,
        record.publication,
        record.organization,
        record.org,
      ];
      const meta = record.meta && typeof record.meta === "object" ? record.meta : null;
      if (meta) {
        candidates.push(
          meta["News-outlet"],
          meta["News outlet"],
          meta["News-Orga"],
          meta["News Orga"],
          meta["News Organization"],
          meta["News orga"],
          meta.Publisher,
          meta.Outlet,
          meta.Medium
        );
      }
      for (const candidate of candidates) {
        const s = String(candidate || "").trim();
        if (s) return s;
      }
      return "";
    }

    function getEnglishSubtitle(record) {
      if (!record || typeof record !== "object") return "";
      const meta = record.meta && typeof record.meta === "object" ? record.meta : null;
      const originalTitle = String(record.title || "").trim();
      const originalNorm = normalizeTitle(originalTitle);
      const candidates = [
        record["english-title"],
        record.english_title,
        record.title_en,
        record.titleEnglish,
        record.translated_title,
        record.translation_en,
        meta && meta["english-title"],
        meta && meta.english_title,
        meta && meta.title_en,
        meta && meta.title_english,
        meta && meta["English title"],
        meta && meta["English Title"],
        meta && meta["Title (English)"],
        meta && meta.translated_title,
        meta && meta["Translated title"],
        meta && meta["Translated Title"],
      ];
      for (const candidate of candidates) {
        const text = String(candidate || "").trim();
        if (!text) continue;
        if (originalNorm && normalizeTitle(text) === originalNorm) continue;
        return text;
      }
      return "";
    }

    function getDisplayTitle(record) {
      const english = getEnglishSubtitle(record);
      if (english) return english;
      return String(record && record.title ? record.title : "");
    }

    function parsePositiveInt(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      if (!Number.isInteger(n)) return null;
      if (n <= 0) return null;
      return n;
    }

    function parseInputCountFromKeyFeatures(record) {
      if (!record || typeof record !== "object") return null;
      const entries = Array.isArray(record.key_structural_features) ? record.key_structural_features : [];
      for (const entry of entries) {
        const text = String(entry || "").trim().toLowerCase();
        if (!text) continue;
        let m = text.match(/^notation input ids:\s*(\d+)$/);
        if (m) return parsePositiveInt(m[1]);
        m = text.match(/^distinct inputs:\s*(\d+)$/);
        if (m) return parsePositiveInt(m[1]);
      }
      return null;
    }

    function getInputCountTagValue(record) {
      if (!record || typeof record !== "object") return "";
      const candidates = [
        parsePositiveInt(record.input_count_by_notation),
        parsePositiveInt(record.distinct_input_count_by_notation),
        parsePositiveInt(record.input_count),
        parseInputCountFromKeyFeatures(record),
      ];
      const count = candidates.find((value) => value != null) || null;
      if (count == null) return "";
      return count === 1 ? "1 Input" : count + " Inputs";
    }

    function getNarrativeDepthTagValue(record) {
      if (!record || typeof record !== "object") return "";
      const layers = Array.isArray(record.narrative_layers)
        ? record.narrative_layers.filter((entry) => String(entry || "").trim())
        : [];
      if (layers.length === 0) return "";
      const uniqueCount = new Set(layers.map((entry) => String(entry))).size;
      const combo = layerComboKey(record);
      if (uniqueCount >= 3) return "Triple-layer impact (" + combo + ")";
      if (uniqueCount === 2) return "Dual-layer impact (" + combo + ")";
      return "Single-layer impact (" + combo + ")";
    }

    function renderCellList() {
      const rowsInCell = getCellFilteredRows();
      const rows = getVisibleRows();
      const items = rows.map((r) =>
        '<div class="list-item"><a data-id="' + r.article_id + '">' + escapeHtml(String(r.article_id || "")) + " - " + escapeHtml(getDisplayTitle(r)) + '</a></div>'
      ).join("");
      cellList.innerHTML = items || '<div class="summary">No articles match the active filters.</div>';
      if (articlesListSummary) {
        articlesListSummary.textContent = "Articles: " + rows.length + " of " + rowsInCell.length;
      }
      articlesCount.textContent = rows.length + " of " + rowsInCell.length + " articles";
      renderVizTypeCounts(rows);
      cellList.querySelectorAll("a[data-id]").forEach((el) => {
        el.onclick = () => {
          const rec = records.find((r) => r.article_id === el.dataset.id);
          if (rec) showDetail(rec);
        };
      });
    }

    function renderDetailSelectionState() {
      if (selectedArticleId) return;
      if (!activeCell) {
        detail.style.removeProperty("--detail-title-underline-color");
        detail.innerHTML = ""
          + '<div class="detail-header">'
          + '<div class="case-label">Details of Input Data Stories</div>'
          + '<h2 class="detail-title">Select a data story</h2>'
          + '<div class="meta">Click an article in the matrix to view detailed information.</div>'
          + "</div>";
        return;
      }
      const rowsInCell = getCellFilteredRows();
      const rows = getVisibleRows();
      detail.style.removeProperty("--detail-title-underline-color");
      const title = quadrantDisplayNameByAxes(activeCell.y, activeCell.x);
      const items = rows.map((r) =>
        '<div class="detail-selection-item"><a data-detail-id="' + escapeHtml(r.article_id) + '">' + escapeHtml(String(r.article_id || "")) + " - " + escapeHtml(getDisplayTitle(r)) + "</a></div>"
      ).join("");
      detail.innerHTML = ""
        + '<div class="detail-header">'
        + '<div class="case-label">Details of Input Data Stories</div>'
        + '<h2 class="detail-title">' + escapeHtml(title) + "</h2>"
        + '<div class="detail-selection-summary">' + rows.length + " of " + rowsInCell.length + " articles match the active filters.</div>"
        + "</div>"
        + '<div class="detail-selection-list">'
        + (items || '<div class="detail-selection-empty">No articles match the current filters in this matrix cell.</div>')
        + "</div>";
      detail.querySelectorAll("a[data-detail-id]").forEach((el) => {
        el.onclick = () => {
          const rec = records.find((r) => String(r.article_id || "") === String(el.dataset.detailId || ""));
          if (rec) showDetail(rec);
        };
      });
    }

    function showDetail(r) {
      selectedArticleId = String(r.article_id || "");
      activeCell = null;
      const classTag = classificationTagForRecord(r);
      detail.style.setProperty("--detail-title-underline-color", quadrantAccentColorForRecord(r));
      const notationEsc = String(r.notation_string || "").replace(/[&<>]/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[ch]));
      const sourceUrl = getOriginalPublicationUrl(r);
      const newsOrg = getNewsOrganization(r);
      const englishSubtitle = getEnglishSubtitle(r);
      const originalTitle = String(r.title || "");
      const detailTitle = englishSubtitle || originalTitle;
      const originalSubtitleLine = englishSubtitle
        ? '<p class="detail-subtitle">' + escapeHtml(originalTitle) + "</p>"
        : "";
      const inputCountTag = getInputCountTagValue(r);
      const narrativeDepthTag = getNarrativeDepthTagValue(r);
      const articleIdTag = String(r.article_id || "").trim();
      const extraMetaRows = [];
      if (articleIdTag) {
        extraMetaRows.push(
          '<div class="detail-meta-row"><div class="detail-tag">Article ID: ' + escapeHtml(articleIdTag) + "</div></div>"
        );
      }
      if (inputCountTag) {
        extraMetaRows.push(
          '<div class="detail-meta-row"><div class="detail-tag">Input Count: ' + escapeHtml(inputCountTag) + "</div></div>"
        );
      }
      if (narrativeDepthTag) {
        extraMetaRows.push(
          '<div class="detail-meta-row"><div class="detail-tag">Narrative Depth: ' + escapeHtml(narrativeDepthTag) + "</div></div>"
        );
      }
      const extraMetaBlock = extraMetaRows.length > 0
        ? '<div class="detail-meta-extra">' + extraMetaRows.join("") + "</div>"
        : "";
      const sourceAndTagLine = '<div class="detail-meta-row">'
        + (sourceUrl
            ? '<a class="source-link" href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(newsOrg || "Original publication") + "</a>"
            : (newsOrg ? '<span class="source-text">' + escapeHtml(newsOrg) + "</span>" : ""))
        + '<div class="detail-tag">' + classTag + "</div>"
        + "</div>";
      detail.innerHTML = ""
        + '<div class="detail-block detail-story-grid">'
        + '<div class="detail-left-stack">'
        + '<div class="detail-left-title">'
        + '<div class="case-label">Selected data story</div>'
        + '<h2 class="detail-title">' + escapeHtml(detailTitle) + "</h2>"
        + originalSubtitleLine
        + "</div>"
        + '<div class="detail-left-meta">'
        + sourceAndTagLine
        + extraMetaBlock
        + "</div>"
        + '<div class="detail-left-controls">'
        + '<h3 class="detail-heading">Visual representation of the data story</h3>'
        + '<div class="detail-svg-toolbar">'
        + '<button type="button" class="detail-svg-btn" id="detail-zoom-out" aria-label="Zoom out">−</button>'
        + '<button type="button" class="detail-svg-btn" id="detail-zoom-in" aria-label="Zoom in">+</button>'
        + '<button type="button" class="detail-svg-btn" id="detail-zoom-reset">Reset</button>'
        + '<span class="detail-zoom-value" id="detail-zoom-value">100%</span>'
        + "</div>"
        + "</div>"
        + "</div>"
        + '<div class="detail-right-diagram"><div class="detail-svg-wrap"><img class="detail-svg" src="./svg-vertical/' + encodeURIComponent((r.asset_id || r.article_id)) + '.svg" alt="' + escapeHtml(r.title || "") + '"></div></div>'
        + "</div>"
        + '<details class="detail-collapsible">'
        + '<summary>Formal Notation</summary>'
        + '<pre class="detail-notation">' + notationEsc + "</pre>"
        + "</details>";
      detailZoom = DETAIL_ZOOM_BASE;
      bindDetailZoomControls();
      renderAll();
    }

    function applyDetailZoom() {
      const img = detail.querySelector(".detail-svg");
      const zoomLabel = detail.querySelector("#detail-zoom-value");
      if (!img) return;
      const intrinsicWidth = Number(img.dataset.intrinsicWidth || img.naturalWidth || 0);
      const svgUnitToPx = 1.9;
      const widthPx = intrinsicWidth > 0
        ? intrinsicWidth * svgUnitToPx * detailZoom
        : 320 * detailZoom;
      img.style.width = Math.max(80, Math.round(widthPx)) + "px";
      if (zoomLabel) zoomLabel.textContent = Math.round((detailZoom / DETAIL_ZOOM_BASE) * 100) + "%";
    }

    function bindDetailZoomControls() {
      const btnOut = detail.querySelector("#detail-zoom-out");
      const btnIn = detail.querySelector("#detail-zoom-in");
      const btnReset = detail.querySelector("#detail-zoom-reset");
      const wrap = detail.querySelector(".detail-svg-wrap");
      const img = detail.querySelector(".detail-svg");
      if (!btnOut || !btnIn || !btnReset) return;
      btnOut.onclick = () => {
        detailZoom = Math.max(DETAIL_ZOOM_MIN, +(detailZoom - 0.1).toFixed(2));
        applyDetailZoom();
      };
      btnIn.onclick = () => {
        detailZoom = Math.min(DETAIL_ZOOM_MAX, +(detailZoom + 0.1).toFixed(2));
        applyDetailZoom();
      };
      btnReset.onclick = () => {
        detailZoom = DETAIL_ZOOM_BASE;
        applyDetailZoom();
      };
      if (img) {
        const syncIntrinsic = () => {
          const nw = Number(img.naturalWidth || 0);
          if (nw > 0) img.dataset.intrinsicWidth = String(nw);
          applyDetailZoom();
        };
        if (img.complete && Number(img.naturalWidth || 0) > 0) syncIntrinsic();
        else img.onload = syncIntrinsic;
      }
      applyDetailZoom();
    }

    async function loadArticleSources() {
      const paths = [
        "./article-sources.json",
      ];
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (!res.ok) continue;
          const data = await res.json();
          const entries = data && typeof data === "object" ? Object.entries(data) : [];
          for (const [articleId, meta] of entries) {
            if (!articleId || !meta || typeof meta !== "object") continue;
            articleSourceMap.set(String(articleId), {
              news_org: String(meta.news_org || "").trim(),
              url: String(meta.url || "").trim(),
            });
          }
          if (selectedArticleId) {
            const selected = records.find((r) => String(r.article_id || "") === selectedArticleId);
            if (selected) showDetail(selected);
          }
          return;
        } catch (_) {}
      }
    }

    function getStoryRecordId(record) {
      if (!record || typeof record !== "object") return "";
      return String(record.article_id || record.id || "").trim();
    }

    function getStoryMeta(record) {
      if (!record || typeof record !== "object") return null;
      const meta = record.meta;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
      return meta;
    }

    function toNullableNumber(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    function normalizeStoryRecord(sourceRecord, fallbackRecord) {
      const source = sourceRecord && typeof sourceRecord === "object" ? sourceRecord : {};
      const fallback = fallbackRecord && typeof fallbackRecord === "object" ? fallbackRecord : {};
      const id = getStoryRecordId(source) || getStoryRecordId(fallback);
      if (!id) return null;

      const sourceMeta = getStoryMeta(source);
      const fallbackMeta = getStoryMeta(fallback);
      const meta = sourceMeta || fallbackMeta || {};

      const englishTitle = String(
        source.english_title ||
        source["english-title"] ||
        fallback.english_title ||
        fallback["english-title"] ||
        ""
      ).trim();

      const notationString = String(
        source.notation_string ||
        source.notation ||
        fallback.notation_string ||
        fallback.notation ||
        ""
      ).trim();

      const metaUrl = String(meta.URL || meta.url || "").trim();
      const metaNewsOrg = String(meta["News-outlet"] || meta["News outlet"] || "").trim();

      const visualizationTypes = Array.isArray(source.visualization_types)
        ? source.visualization_types
        : (Array.isArray(fallback.visualization_types) ? fallback.visualization_types : []);
      const narrativeLayers = Array.isArray(source.narrative_layers)
        ? source.narrative_layers
        : (Array.isArray(fallback.narrative_layers) ? fallback.narrative_layers : []);

      const hasInputDependentStory =
        typeof source.has_input_dependent_story === "boolean"
          ? source.has_input_dependent_story
          : (typeof fallback.has_input_dependent_story === "boolean" ? fallback.has_input_dependent_story : false);
      const hasInputDependentAnnotation =
        typeof source.has_input_dependent_annotation === "boolean"
          ? source.has_input_dependent_annotation
          : (typeof fallback.has_input_dependent_annotation === "boolean" ? fallback.has_input_dependent_annotation : false);

      return {
        ...fallback,
        ...source,
        id,
        article_id: id,
        asset_id: String(source.asset_id || fallback.asset_id || id).trim() || id,
        title: String(source.title || fallback.title || id).trim(),
        meta,
        notation_string: notationString,
        notation: String(source.notation || fallback.notation || notationString).trim(),
        english_title: englishTitle,
        "english-title": String(source["english-title"] || fallback["english-title"] || englishTitle).trim(),
        original_url: String(source.original_url || fallback.original_url || source.URL || source.url || metaUrl).trim(),
        news_org: String(source.news_org || source.newsOrg || fallback.news_org || metaNewsOrg).trim(),
        x_category: String(source.x_category || fallback.x_category || "parametric").trim() || "parametric",
        y_category: String(source.y_category || fallback.y_category || "local_single").trim() || "local_single",
        visualization_types: visualizationTypes,
        narrative_layers: narrativeLayers,
        has_input_dependent_story: hasInputDependentStory,
        has_input_dependent_annotation: hasInputDependentAnnotation,
        input_count: toNullableNumber(
          source.input_count != null ? source.input_count : fallback.input_count
        ),
        input_count_by_notation: toNullableNumber(
          source.input_count_by_notation != null ? source.input_count_by_notation : fallback.input_count_by_notation
        ),
        distinct_input_count_by_notation: toNullableNumber(
          source.distinct_input_count_by_notation != null
            ? source.distinct_input_count_by_notation
            : fallback.distinct_input_count_by_notation
        ),
        key_structural_features: Array.isArray(source.key_structural_features)
          ? source.key_structural_features
          : (Array.isArray(fallback.key_structural_features) ? fallback.key_structural_features : []),
      };
    }

    async function loadJsonArrayFromPaths(paths) {
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data)) return data;
        } catch (_) {}
      }
      return null;
    }

    async function loadStoriesData() {
      const canonical = await loadJsonArrayFromPaths([
        "./data/stories.json",
        "./stories.json",
      ]);
      const enriched = await loadJsonArrayFromPaths([
        "./data/stories.enriched.json",
      ]);

      const canonicalRows = Array.isArray(canonical) ? canonical : [];
      const enrichedRows = Array.isArray(enriched) ? enriched : [];
      const enrichedById = new Map(
        enrichedRows
          .map((row) => [getStoryRecordId(row), row])
          .filter((entry) => entry[0])
      );

      const merged = canonicalRows
        .map((row) => normalizeStoryRecord(row, enrichedById.get(getStoryRecordId(row))))
        .filter(Boolean);

      if (merged.length > 0) {
        records = merged;
        rebuildDataIndexes();
        return true;
      }

      records = enrichedRows
        .map((row) => normalizeStoryRecord(row, null))
        .filter(Boolean);
      rebuildDataIndexes();
      return records.length > 0;
    }

    function selectCell(x, y) {
      if (activeCell && activeCell.x === x && activeCell.y === y) activeCell = null;
      else activeCell = { x, y };
      selectedArticleId = null;
      renderGridFor(grid);
      renderPointsFor(pointsLayer, activeMatrixView);
      refreshSelectedPointHighlight();
      renderCellList();
      renderDetailSelectionState();
    }

    function renderAll() {
      renderGridFor(grid);
      renderPointsFor(pointsLayer, activeMatrixView);
      refreshSelectedPointHighlight();
      if (matrixLegendOverview) matrixLegendOverview.classList.add("is-hidden");
      if (matrixLegendInput) matrixLegendInput.classList.toggle("is-hidden", activeMatrixView !== "input");
      if (matrixLegendLayer) matrixLegendLayer.classList.toggle("is-hidden", activeMatrixView !== "depth");
      if (matrixViewOverviewBtn) matrixViewOverviewBtn.classList.toggle("active", activeMatrixView === "overview");
      if (matrixViewInputBtn) matrixViewInputBtn.classList.toggle("active", activeMatrixView === "input");
      if (matrixViewDepthBtn) matrixViewDepthBtn.classList.toggle("active", activeMatrixView === "depth");
      if (matrixCaption) {
        matrixCaption.innerHTML = activeMatrixView === "overview"
          ? '<span class="matrix-caption-key">Overview</span> of<br>user input<br>across ' + records.length + ' data stories'
          : (activeMatrixView === "input"
              ? '<span class="matrix-caption-key">Input Count</span><br>across ' + records.length + '<br>data stories'
              : '<span class="matrix-caption-key">Narrative Depth</span><br>across ' + records.length + '<br>data stories');
      }
      renderCellList();
      renderDetailSelectionState();
      logicAndBtn.classList.toggle("active", vizFilterLogic === "and");
      logicOrBtn.classList.toggle("active", vizFilterLogic === "or");
    }

    function setLegendCollapsed(collapsed) {
      legendCollapsed = Boolean(collapsed);
      if (wrapEl) wrapEl.classList.toggle("legend-collapsed", legendCollapsed);
      if (legendPanel) legendPanel.classList.toggle("collapsed", legendCollapsed);
      if (legendToggle) {
        legendToggle.textContent = legendCollapsed ? "‹" : "›";
        legendToggle.setAttribute("aria-expanded", legendCollapsed ? "false" : "true");
        legendToggle.setAttribute("aria-label", legendCollapsed ? "Expand legend" : "Collapse legend");
        legendToggle.title = legendCollapsed ? "Expand legend" : "Collapse legend";
      }
    }

    function applyInitialSelectionFromUrl() {
      if (!initialSelectedArticleId) return;
      const selected = recordById.get(initialSelectedArticleId);
      if (selected) showDetail(selected);
    }

    logicAndBtn.onclick = () => {
      vizFilterLogic = "and";
      renderAll();
    };
    logicOrBtn.onclick = () => {
      vizFilterLogic = "or";
      renderAll();
    };
    clearVizFiltersBtn.onclick = () => {
      selectedVizTypes.clear();
      titleQuery = "";
      titleSearchInput.value = "";
      renderVizTypeFilters();
      renderAll();
    };
    titleSearchInput.oninput = () => {
      titleQuery = normalizeTitle(titleSearchInput.value).trim();
      renderAll();
    };
    if (legendToggle) {
      legendToggle.onclick = () => {
        setLegendCollapsed(!legendCollapsed);
      };
    }
    if (matrixViewOverviewBtn) {
      matrixViewOverviewBtn.onclick = () => {
        activeMatrixView = "overview";
        renderAll();
      };
    }
    if (matrixViewInputBtn) {
      matrixViewInputBtn.onclick = () => {
        activeMatrixView = "input";
        renderAll();
      };
    }
    if (matrixViewDepthBtn) {
      matrixViewDepthBtn.onclick = () => {
        activeMatrixView = "depth";
        renderAll();
      };
    }
    if (matrixEl) {
      matrixEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (
          target.closest(".point") ||
          target.closest(".cell")
        ) {
          return;
        }
        if (!selectedArticleId && !activeCell) return;
        selectedArticleId = null;
        activeCell = null;
        renderAll();
      });
    }
    if (matrixPanelContainer) matrixPanelContainer.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!selectedArticleId) return;
      if (
        target.closest(".point") ||
        target.closest("a[data-id]") ||
        target.closest("a[data-detail-id]")
      ) {
        return;
      }
      selectedArticleId = null;
      renderAll();
    });
    window.addEventListener("resize", () => {
      renderPointsFor(pointsLayer, activeMatrixView);
    });
    async function bootstrap() {
      setLegendCollapsed(false);
      applyLegendGlyphColors();
      await loadStoriesData();
      renderVizTypeFilters();
      renderAll();
      applyInitialSelectionFromUrl();
      loadArticleSources();
    }

    bootstrap();
