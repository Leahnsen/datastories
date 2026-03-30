// SVG renderer: vertical block layout with stacked glyphs (variant 1).
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- config (keep simple for now) ----
const DEFAULTS = {
  margin: 14,
  glyphSize: 28,      // rendered icon size in px
  blockHeight: 40,    // minimum vertical distance per frameIndex
  rowGap: 6,          // gap between rows inside a frame
  horizontalSpacing: 10, // spacing for simultaneous glyph rows
  framePadding: 4,    // vertical padding inside each frame block
  x: 40,              // center x position of the sequence column
  strokeWidth: 1,
  galleryCardWidth: 340,
  gallerySvgHeight: 720,
};

let tokenCache = null;

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

// Order of stacking inside a block (your variant 1)
const STACK_ORDER = ["input", "story", "annotation", "visualization"];
const SUBSTORY_ARROW_LEN = 16;
const SUBSTORY_GAP = 10;
const SUBSTORY_PAD_X = 8;
const SUBSTORY_PAD_Y = 6;

// ---- helpers ----
function stripOuterSvg(svgText) {
  // Extract inner content of <svg> ... </svg> to inline as <g>...
  const m = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return m ? m[1].trim() : svgText.trim();
}

function safeToken(node) {
  if (node.kind === "substory") return "N";
  if (node.kind === "visualization") {
    const rawKey = normalizeRawKey(node.raw).toLowerCase();
    const wantsAccumulatedVcu = node.dependsOnAccumulatedInputs &&
      node.inputRange &&
      (node.visAction === "Vcu" || rawKey === "vcu");
    if (wantsAccumulatedVcu) {
      return "Vcu";
    }
    // Base visualization with explicit index uses dedicated indexed glyph, e.g. V1 -> V-index.svg.
    // Action variants keep their dedicated glyphs, e.g. V1h -> Vh.svg.
    if (node.visAction === "V" && node.visIndex != null) return "V-index";
    if (node.visAction) return node.visAction;
  }
  if (node.kind === "annotation") {
    return node.isInPersistentAnnotationSpan
      ? (node.persistentAnnotationGlyphToken || "Apd")
      : "A";
  }
  if (node.kind === "input") {
    return node.isInPersistentInputSpan ? "Iu" : "I";
  }
  return normalizeRawKey(node.raw);
}

function assignAnnotationPersistenceGlyphTokens(nodes, rails) {
  for (const node of nodes || []) {
    if (node.kind !== "annotation") continue;
    node.persistentAnnotationGlyphToken = "Apd";
    if (!node.isInPersistentAnnotationSpan) continue;
    const rank = Number.isFinite(node.persistenceStyleRank) ? node.persistenceStyleRank : 1;
    if (rank <= 0) {
      node.persistentAnnotationGlyphToken = "Aps";
    } else {
      node.persistentAnnotationGlyphToken = "Apd";
    }
  }
}

function normalizeRawKey(rawValue) {
  const raw = String(rawValue || "");
  const normalized = raw
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => "₀₁₂₃₄₅₆₇₈₉".indexOf(ch))
    .replace(/^¬+/, "")
    .replace(/\(I[^)]*\)$/i, "")
    .replace(/\s+/g, "");

  // Handle forms like V1h -> Vh
  const middleSubscript = normalized.match(/^([SIVA])(\d+)([A-Za-z]+)$/);
  if (middleSubscript) return `${middleSubscript[1]}${middleSubscript[3]}`;
  return normalized;
}

function inferInputIdFromRaw(rawValue) {
  const normalized = String(rawValue || "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => "₀₁₂₃₄₅₆₇₈₉".indexOf(ch))
    .replace(/\s+/g, "");
  const m = normalized.match(/^I(\d+|n)$/i);
  return m ? m[1] : null;
}

function getViewBoxWidth(svgText) {
  const m = svgText.match(/viewBox\s*=\s*"[^"]*?\s([\d.]+)\s+([\d.]+)"/i);
  if (!m) return 24;
  const width = Number.parseFloat(m[1]);
  return Number.isFinite(width) && width > 0 ? width : 24;
}

export function toSafeSvgBaseName(value) {
  const raw = String(value ?? "").trim();
  const replaced = raw
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return replaced || "story";
}

function isMultiInputBlock(node) {
  const count = Number(node?.range?.count);
  return node?.kind === "input" && Number.isFinite(count) && count > 1;
}

async function loadMapping() {
  const mappingPath = path.resolve(__dirname, "../../../design/mapping.json");
  const txt = await fs.readFile(mappingPath, "utf-8");
  return JSON.parse(txt);
}

async function loadRenderTokens() {
  if (tokenCache) return tokenCache;
  const tokenPath = path.resolve(__dirname, "../../../design/design.tokens.json");
  try {
    const raw = await fs.readFile(tokenPath, "utf-8");
    const parsed = JSON.parse(raw);
    tokenCache = { ...DEFAULTS, ...parsed };
  } catch {
    tokenCache = { ...DEFAULTS };
  }
  return tokenCache;
}

function defaultBaseKey(node) {
  if (node.kind === "input") return "I";
  if (node.kind === "story") return "S";
  if (node.kind === "annotation") return "A";
  if (node.kind === "visualization") return "V";
  return "V";
}

function resolveGlyphFile(token, mapping, node) {
  const exactCandidates = [
    token,
    normalizeRawKey(node.raw),
  ].filter(Boolean);

  for (const key of [...new Set(exactCandidates)]) {
    if (mapping[key]) {
      return { fileName: mapping[key], resolvedKey: key, usedFallback: false };
    }
  }

  const baseKey = defaultBaseKey(node);
  if (mapping[baseKey]) {
    return { fileName: mapping[baseKey], resolvedKey: baseKey, usedFallback: true };
  }

  const hardDefault = "V";
  if (mapping[hardDefault]) {
    return { fileName: mapping[hardDefault], resolvedKey: hardDefault, usedFallback: true };
  }

  return { fileName: null, resolvedKey: null, usedFallback: true };
}

function recolorInputGlyph(glyphInner, color) {
  return glyphInner
    .replace(/fill="(?!none|currentColor)[^"]*"/gi, `fill="${color}"`)
    .replace(/stroke="(?!none|currentColor)[^"]*"/gi, `stroke="${color}"`);
}

function recolorDependencyMarkers(glyphInner, color) {
  return glyphInner
    .replace(/#9ee493/gi, color)
    .replace(/#00ff00/gi, color)
    .replace(/rgb\(\s*158\s*,\s*228\s*,\s*147\s*\)/gi, color)
    .replace(/#0000ff/gi, color)
    .replace(/rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/gi, color);
}

function recolorNdsBackground(glyphInner, color) {
  // N glyph uses #737373 for the outer base shape; recolor only that base.
  return glyphInner.replace(/fill="#737373"/i, `fill="${color}"`);
}

function recolorBasicVisualizationBase(glyphInner, color) {
  // Plain V / V-index use neutral #737373 as base circle/background fill.
  // Recolor only that neutral base; keep black strokes/details untouched.
  return glyphInner
    .replace(/fill="#737373"/gi, `fill="${color}"`)
    .replace(/fill:\s*#737373/gi, `fill:${color}`)
    .replace(/fill="rgb\(\s*115\s*,\s*115\s*,\s*115\s*\)"/gi, `fill="${color}"`);
}

function recolorPersistentAnnotationGlyph(glyphInner, color) {
  // A-pers.svg: keep baked black dashed/details black, recolor only neutral base fill.
  return glyphInner
    .replace(/fill="#737373"/gi, `fill="${color}"`)
    .replace(/fill="#000000"/gi, `fill="#000000"`)
    .replace(/stroke="#000000"/gi, `stroke="#000000"`);
}

function recolorPersistentInputGlyph(glyphInner, color) {
  // I-pers.svg: remove exported white artboard rects, recolor only neutral base fill,
  // and keep black persistence marks/details untouched.
  return glyphInner
    .replace(/<rect[^>]*fill="#ffffff"[^>]*\/>/gi, "")
    .replace(/<rect[^>]*fill="rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)"[^>]*\/>/gi, "")
    .replace(/fill="#737373"/gi, `fill="${color}"`)
    .replace(/fill="#000000"/gi, `fill="#000000"`)
    .replace(/stroke="#000000"/gi, `stroke="#000000"`);
}

function accumulatedInputColors(node) {
  let colors = [];
  if (Array.isArray(node?.inputIds) && node.inputIds.length > 0) {
    const k = node.inputIds.length;
    colors = node.inputIds.map((id) => getInputColor(String(id), k));
    logStripeDebug(node, k, colors, "inputIds");
    return colors;
  }
  const from = Number(node?.inputRange?.from);
  const toRaw = node?.inputRange?.to;
  if (!Number.isFinite(from)) return [];
  const to = Number(toRaw);
  if (Number.isFinite(to) && to >= from) {
    const count = to - from + 1;
    colors = Array.from({ length: count }, (_, i) => getInputColor(String(from + i), count));
    logStripeDebug(node, count, colors, "inputRange");
    return colors;
  }
  // Symbolic fallback.
  colors = [getInputColor(String(from), 3), getInputColor(String(from + 1), 3), getInputColor(String(from + 2), 3)];
  logStripeDebug(node, 3, colors, "symbolicFallback");
  return colors;
}

function gradientStops(colors) {
  if (!colors.length) return "";
  if (colors.length === 1) {
    return `<stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[0]}"/>`;
  }
  return colors
    .map((c, i) => {
      const pct = (i / (colors.length - 1)) * 100;
      return `<stop offset="${pct.toFixed(2)}%" stop-color="${c}"/>`;
    })
    .join("");
}

function gradientStopsStepped(colors) {
  if (!colors.length) return "";
  if (colors.length === 1) {
    return `<stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[0]}"/>`;
  }
  const parts = [];
  const step = 100 / colors.length;
  for (let i = 0; i < colors.length; i += 1) {
    const start = (i * step).toFixed(2);
    const end = ((i + 1) * step).toFixed(2);
    parts.push(`<stop offset="${start}%" stop-color="${colors[i]}"/>`);
    parts.push(`<stop offset="${end}%" stop-color="${colors[i]}"/>`);
  }
  return parts.join("");
}

function applyAccumulatedGradientToGlyph(glyphInner, gradientId) {
  // S/A base fills are exported as #737373.
  return glyphInner.replace(/fill="#737373"/gi, `fill="url(#${gradientId})"`);
}

function applyAccumulatedGradientToVcuu(glyphInner, gradientId) {
  // Vcuu.svg uses #9ee493 for the highlighted "single person" shape.
  return glyphInner
    .replace(/fill="#9ee493"/gi, `fill="url(#${gradientId})"`)
    .replace(/fill:\s*#9ee493/gi, `fill:url(#${gradientId})`)
    .replace(/fill="rgb\(\s*158\s*,\s*228\s*,\s*147\s*\)"/gi, `fill="url(#${gradientId})"`);
}

function applyVuAccentFill(glyphInner, fillValue) {
  return glyphInner
    .replace(/fill="#9ee493"/gi, `fill="${fillValue}"`)
    .replace(/fill:\s*#9ee493/gi, `fill:${fillValue}`)
    .replace(/fill="rgb\(\s*158\s*,\s*228\s*,\s*147\s*\)"/gi, `fill="${fillValue}"`);
}

function applyInputBlockGradient(glyphInner, gradientId) {
  // I.svg plus uses the neutral base fill.
  return glyphInner
    .replace(/fill="#737373"/gi, `fill="url(#${gradientId})"`)
    .replace(/fill:\s*#737373/gi, `fill:url(#${gradientId})`)
    .replace(/fill="rgb\(\s*115\s*,\s*115\s*,\s*115\s*\)"/gi, `fill="url(#${gradientId})"`);
}

async function loadGlyph(token, mapping, node) {
  const resolved = resolveGlyphFile(token, mapping, node);
  if (!resolved.fileName) {
    console.warn("[mapping] missing glyph for", token, "-> no fallback available");
    return null;
  }
  if (resolved.usedFallback) {
    console.warn("[mapping] missing glyph for", token, "-> using fallback", resolved.fileName);
  }

  const fileName = resolved.fileName;
  const glyphPath = path.resolve(__dirname, "../../../design/glyphs", fileName);
  const svgText = await fs.readFile(glyphPath, "utf-8");
  let inner = stripOuterSvg(svgText);
  if (node.kind === "input" && token === "Iu" && node.inputId) {
    inner = recolorPersistentInputGlyph(inner, getInputColor(node.inputId));
  } else if (node.kind === "input" && node.inputId && !isMultiInputBlock(node)) {
    inner = recolorInputGlyph(inner, getInputColor(node.inputId));
  } else if (node.kind === "annotation" && (token === "Aps" || token === "Apd")) {
    if (node.dependsOnInput && node.inputId) {
      inner = recolorPersistentAnnotationGlyph(inner, getInputColor(node.inputId));
    }
  } else if (
    node.kind === "visualization" &&
    node.inNdsSubstory &&
    node.substoryDependencyInput &&
    (token === "V" || token === "V-index") &&
    (node.visAction === "V" || node.visAction == null)
  ) {
    inner = recolorBasicVisualizationBase(inner, getInputColor(node.substoryDependencyInput));
  } else if (node.kind === "visualization" && token === "N" && node.dependsOnInput && node.inputId) {
    const dependencyColor = getInputColor(node.inputId);
    inner = recolorNdsBackground(inner, dependencyColor);
    // New N glyph variants can use dependency-marker green instead of neutral gray.
    // Apply marker recoloring here as well so N always follows its input dependency color.
    inner = recolorDependencyMarkers(inner, dependencyColor);
  } else if ((node.kind === "story" || node.kind === "annotation") && node.dependsOnInput && node.inputId) {
    inner = recolorInputGlyph(inner, getInputColor(node.inputId));
  } else if (node.dependsOnInput && node.inputId) {
    inner = recolorDependencyMarkers(inner, getInputColor(node.inputId));
  }
  return {
    inner,
    viewBoxWidth: getViewBoxWidth(svgText),
  };
}

function groupNodesByFrame(nodes) {
  const by = new Map();
  for (const n of nodes) {
    const arr = by.get(n.frameIndex) ?? [];
    arr.push(n);
    by.set(n.frameIndex, arr);
  }
  return by;
}

function sortNodesForStack(nodes) {
  const laneRank = new Map(STACK_ORDER.map((k, i) => [k, i]));
  return [...nodes].sort((a, b) => {
    if (a.groupId && b.groupId && a.groupId === b.groupId) {
      const ao = Number.isFinite(a.orderInStep) ? a.orderInStep : null;
      const bo = Number.isFinite(b.orderInStep) ? b.orderInStep : null;
      if (ao != null && bo != null && ao !== bo) return ao - bo;
    }
    const ra = laneRank.get(a.lane) ?? 999;
    const rb = laneRank.get(b.lane) ?? 999;
    if (ra !== rb) return ra - rb;
    // stable tie-breaker
    return (a.raw || "").localeCompare(b.raw || "");
  });
}

function renderFallbackCircle(x, y, size, color) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2"/>`;
}

function renderIndexRing(out, x, y, size, color = "#000", dash = null) {
  const r = size / 2 + 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2"${dashAttr}/>`);
}

function rangeCount(node) {
  const count = node?.range?.count;
  return Number.isFinite(count) && count > 1 ? count : null;
}

function inputBlockColors(node) {
  if (node?.kind !== "input") return [];
  const count = rangeCount(node);
  if (!count) return [];
  const from = Number(node?.range?.start);
  const start = Number.isFinite(from) && from > 0 ? from : 1;
  return Array.from({ length: count }, (_, i) => getInputColor(String(start + i), count));
}

function getGroupRangeSteps(node) {
  if (Array.isArray(node.groupSteps) && node.groupSteps.length > 0) return node.groupSteps;
  if (Array.isArray(node.groupChildren) && node.groupChildren.length > 0) {
    return [{ hasComma: node.groupChildren.length > 1, elements: node.groupChildren }];
  }
  return [];
}

function stepWidth(step, cfg) {
  const elements = Array.isArray(step?.elements) ? step.elements : [];
  if (elements.length === 0) return cfg.glyphSize;
  if (step?.hasComma) {
    return elements.length * cfg.glyphSize + (elements.length - 1) * cfg.horizontalSpacing;
  }
  return cfg.glyphSize;
}

function groupRangeMetrics(node, cfg) {
  const steps = getGroupRangeSteps(node);
  if (steps.length === 0) {
    return {
      steps: [],
      contentWidth: cfg.glyphSize,
      contentHeight: cfg.glyphSize,
      fullWidth: cfg.glyphSize + 20,
    };
  }
  const widths = steps.map((s) => stepWidth(s, cfg));
  const contentWidth = Math.max(...widths);
  const contentHeight = steps.length * cfg.glyphSize + (steps.length - 1) * cfg.rowGap;
  const fullWidth = contentWidth;
  return { steps, contentWidth, contentHeight, fullWidth };
}

function nodeVisualWidth(node, cfg) {
  if (node.kind === "substory") return cfg.glyphSize;
  if (node.kind === "groupRange") {
    return groupRangeMetrics(node, cfg).contentWidth;
  }
  return cfg.glyphSize;
}

function nodeVisualHeight(node, cfg) {
  // Fork behavior: sub-story must not block main vertical flow.
  if (node.kind === "substory") return cfg.glyphSize;
  if (node.kind === "groupRange") {
    return groupRangeMetrics(node, cfg).contentHeight;
  }
  return cfg.glyphSize;
}

function rowVisualHeight(row, cfg) {
  if (!row?.nodes?.length) return cfg.glyphSize;
  return Math.max(...row.nodes.map((node) => nodeVisualHeight(node, cfg)));
}

function subStoryMetrics(node, cfg) {
  const steps = Array.isArray(node?.subSteps) ? node.subSteps : [];
  if (steps.length === 0) {
    const containerWidth = cfg.glyphSize + SUBSTORY_PAD_X * 2;
    const containerHeight = cfg.glyphSize + SUBSTORY_PAD_Y * 2;
    return {
      steps: [],
      maxRowWidth: cfg.glyphSize,
      rowsHeight: cfg.glyphSize,
      width: containerWidth,
      height: containerHeight,
      overlayRight: SUBSTORY_ARROW_LEN + SUBSTORY_GAP + containerWidth,
    };
  }
  const rowWidths = steps.map((step) => {
    const n = Array.isArray(step?.elements) ? step.elements.length : 0;
    if (n <= 0) return cfg.glyphSize;
    if (step?.hasComma) {
      return n * cfg.glyphSize + (n - 1) * cfg.horizontalSpacing;
    }
    return cfg.glyphSize;
  });
  const maxRowWidth = Math.max(...rowWidths, cfg.glyphSize);
  const rowsHeight = steps.length * cfg.glyphSize + Math.max(0, steps.length - 1) * cfg.rowGap;
  const containerWidth = maxRowWidth + SUBSTORY_PAD_X * 2;
  const containerHeight = rowsHeight + SUBSTORY_PAD_Y * 2;
  return {
    steps,
    rowWidths,
    maxRowWidth,
    rowsHeight,
    width: containerWidth,
    height: containerHeight,
    overlayRight: SUBSTORY_ARROW_LEN + SUBSTORY_GAP + containerWidth,
  };
}

function childKindFromType(type) {
  if (type === "I") return "input";
  if (type === "S") return "story";
  if (type === "A") return "annotation";
  if (type === "V") return "visualization";
  return "visualization";
}

function buildPseudoNodeFromChild(child) {
  const kind = childKindFromType(child.type);
  const childInputIds = Array.isArray(child.inputIds)
    ? child.inputIds
    : (Array.isArray(child.inputRefs) ? child.inputRefs : null);
  const childAccumulated = Boolean(child.dependsOnAccumulatedInputs || (childInputIds && childInputIds.length > 1));
  const inferredInputId = kind === "input" ? inferInputIdFromRaw(child.raw) : null;
  return {
    kind,
    raw: child.raw,
    visAction: child.visAction || null,
    visIndex: child.visIndex || null,
    dependsOnInput: child.inputRef != null,
    inputId: child.inputRef != null ? String(child.inputRef) : inferredInputId,
    dependsOnAccumulatedInputs: childAccumulated,
    inputRange: child.inputRange || null,
    inputIds: childInputIds || null,
  };
}

function applySubStoryScopeDependency(childNode, scopeInputId) {
  if (!scopeInputId || !childNode) return childNode;
  const scoped = {
    ...childNode,
    inNdsSubstory: true,
    substoryDependencyInput: String(scopeInputId),
  };
  if (childNode.inputId != null) return scoped;
  if (childNode.dependsOnInput || childNode.dependsOnAccumulatedInputs) return scoped;
  return {
    ...scoped,
    dependsOnInput: true,
    inputId: String(scopeInputId),
  };
}

function renderRangeBadgeRightOfGlyph(out, x, y, size, count) {
  const label = `×${count}`;
  const bx = x + size + 8;
  const by = y + size / 2 + 5;
  out.push(
    `<text x="${bx}" y="${by}" text-anchor="start" fill="#222" font-size="14" font-weight="600" font-family="sans-serif">${label}</text>`
  );
}

function renderSequenceRangeBracket(out, x, yTop, yBottom, count) {
  const bx = x + 8;
  const tick = 6;
  const labelX = bx + 12;
  const midY = (yTop + yBottom) / 2;
  out.push(
    `<path d="M ${bx} ${yTop} h ${tick} M ${bx + tick} ${yTop} V ${yBottom} M ${bx} ${yBottom} h ${tick}" ` +
    `fill="none" stroke="#222" stroke-width="1.25"/>`
  );
  out.push(
    `<text x="${labelX}" y="${midY + 5}" text-anchor="start" fill="#222" font-size="14" font-weight="600" font-family="sans-serif">×${count}</text>`
  );
}

function accumulatedRangeLabel(node) {
  const from = node?.inputRange?.from;
  const to = node?.inputRange?.to;
  if (!Number.isFinite(from) || to == null) return null;
  return `${from}…${to}`;
}

function accumulatedSegmentColors(node) {
  const from = node?.inputRange?.from;
  const to = node?.inputRange?.to;
  if (!Number.isFinite(from) || to == null) return [];

  if (Number.isFinite(to)) {
    const count = Math.max(0, to - from + 1);
    if (count > 0 && count <= 3) {
      return Array.from({ length: count }, (_, i) => getInputColor(String(from + i), count));
    }
    if (count > 3) {
      return [getInputColor(String(from), count), getInputColor(String(from + 1), count), "#c9c9c9"];
    }
  }
  return [getInputColor(String(from), 3), getInputColor(String(from + 1), 3), "#c9c9c9"];
}

function accumulatedMarkerOverlayRight(node) {
  if (node?.dependsOnAccumulatedInputs && node?.inputRange) return 0;
  if (!node?.dependsOnAccumulatedInputs || !node?.inputRange) return 0;
  const label = accumulatedRangeLabel(node);
  const textW = label ? Math.max(20, label.length * 6) : 0;
  return 18 + textW;
}

function renderAccumulatedInputMarker(out, node, x, y, size) {
  if (node?.dependsOnAccumulatedInputs && node?.inputRange) return;
  if (!node?.dependsOnAccumulatedInputs || !node?.inputRange) return;
  const colors = accumulatedSegmentColors(node);
  if (colors.length === 0) return;

  const markerX = x + size + 6;
  const segW = 8;
  const segH = 3;
  const segGap = 2;
  const totalH = colors.length * segH + (colors.length - 1) * segGap;
  const topY = y + (size - totalH) / 2;

  for (let i = 0; i < colors.length; i += 1) {
    const sy = topY + i * (segH + segGap);
    out.push(`<rect x="${markerX}" y="${sy}" width="${segW}" height="${segH}" rx="1" fill="${colors[i]}" />`);
  }

  const label = accumulatedRangeLabel(node);
  if (label) {
    const tx = markerX + segW + 4;
    const ty = y + size / 2 + 4;
    out.push(`<text x="${tx}" y="${ty}" text-anchor="start" fill="#333" font-size="11" font-family="sans-serif">${label}</text>`);
  }
}

function rangeOverlayRight(node) {
  const count = rangeCount(node);
  if (!count) return 0;
  return node.kind === "groupRange" ? 48 : 36;
}

function nodeOverlayRight(node, cfg = DEFAULTS) {
  if (node.kind === "substory") {
    return subStoryMetrics(node, cfg).overlayRight;
  }
  return rangeOverlayRight(node) + accumulatedMarkerOverlayRight(node);
}

async function renderSubStoryNode(out, node, gx, gy, size, mapping, cfg) {
  const metrics = subStoryMetrics(node, cfg);
  const ndsNode = {
    kind: "visualization",
    raw: "N",
    visAction: "N",
    visIndex: null,
    dependsOnInput: Boolean(node.scopeInputId),
    inputId: node.scopeInputId || null,
    dependsOnAccumulatedInputs: false,
    inputRange: null,
  };
  await renderSingleGlyphNode(out, ndsNode, gx, gy, size, mapping);

  const yMid = gy + size / 2;
  const xArrowStart = gx + size + 4;
  const xArrowEnd = xArrowStart + SUBSTORY_ARROW_LEN;
  out.push(`<path d="M ${xArrowStart} ${yMid} L ${xArrowEnd} ${yMid}" stroke="#222" stroke-width="1.5" fill="none"/>`);
  out.push(`<path d="M ${xArrowEnd - 4} ${yMid - 4} L ${xArrowEnd} ${yMid} L ${xArrowEnd - 4} ${yMid + 4}" stroke="#222" stroke-width="1.5" fill="none"/>`);

  const containerX = xArrowEnd + SUBSTORY_GAP;
  const containerY = gy - SUBSTORY_PAD_Y;
  const containerW = metrics.width;
  const containerH = metrics.height;
  const label = node.scopeInputId ? `N(${formatInputRef(node.scopeInputId)})` : "N";
  out.push(
    `<text x="${containerX + 6}" y="${containerY - 4}" text-anchor="start" fill="#333" font-size="10" font-family="sans-serif">${label}</text>`
  );

  const steps = metrics.steps;
  let yCursor = gy;
  for (let s = 0; s < steps.length; s += 1) {
    const step = steps[s];
    const elements = Array.isArray(step?.elements) ? step.elements : [];
    if (elements.length === 0) {
      yCursor += size + cfg.rowGap;
      continue;
    }
    const rowWidth = step?.hasComma
      ? elements.length * size + (elements.length - 1) * cfg.horizontalSpacing
      : size;
    const rowCenterX = containerX + containerW / 2;
    let rowX = rowCenterX - rowWidth / 2;
    for (let i = 0; i < elements.length; i += 1) {
      const child = elements[i];
      let childNode = buildPseudoNodeFromChild(child);
      childNode = applySubStoryScopeDependency(childNode, node.scopeInputId);
      await renderSingleGlyphNode(out, childNode, rowX, yCursor, size, mapping);
      rowX += size + cfg.horizontalSpacing;
    }
    yCursor += size + cfg.rowGap;
  }
}

async function renderSingleGlyphNode(out, node, gx, gy, size, mapping) {
  const token = safeToken(node);
  const color = ((node.dependsOnInput && node.inputId) || (node.kind === "input" && node.inputId))
    ? getInputColor(node.inputId)
    : NEUTRAL;

  const glyph = await loadGlyph(token, mapping, node);
  if (glyph) {
    let glyphInner = glyph.inner;
    if (node.kind === "input") {
      const blockColors = inputBlockColors(node);
      if (blockColors.length > 1) {
        const gradientSeed = `${node.frameIndex}|input-block|${JSON.stringify(node.range)}|${gx}|${gy}`;
        const gradientId = `acc-input-grad-${Math.abs(hashString(gradientSeed))}`;
        out.push(
          `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">${gradientStopsStepped(blockColors)}</linearGradient></defs>`
        );
        glyphInner = applyInputBlockGradient(glyphInner, gradientId);
      }
    }
    const dependencyColors = (() => {
      if (Array.isArray(node.inputIds) && node.inputIds.length > 0) {
        const k = node.inputIds.length;
        return node.inputIds.map((id) => getInputColor(String(id), k));
      }
      if (node.dependsOnAccumulatedInputs && node.inputRange) {
        return accumulatedInputColors(node);
      }
      if ((node.dependsOnInput && node.inputId) || (node.kind === "input" && node.inputId)) {
        return [getInputColor(node.inputId)];
      }
      return [];
    })();
    if ((node.kind === "story" || node.kind === "annotation") && node.dependsOnAccumulatedInputs && node.inputRange) {
      const colors = accumulatedInputColors(node);
      if (colors.length > 0) {
        const gradientSeed = `${node.frameIndex}|${node.kind}|${node.raw}|${JSON.stringify(node.inputRange)}|${gx}|${gy}`;
        const gradientId = `acc-grad-${Math.abs(hashString(gradientSeed))}`;
        out.push(
          `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">${gradientStopsStepped(colors)}</linearGradient></defs>`
        );
        glyphInner = applyAccumulatedGradientToGlyph(glyphInner, gradientId);
      }
    }
    if (
      node.kind === "visualization" &&
      token.startsWith("Vcu") &&
      node.dependsOnAccumulatedInputs &&
      node.inputRange
    ) {
      const colors = accumulatedInputColors(node);
      if (colors.length > 0) {
        const gradientSeed = `${node.frameIndex}|${node.kind}|${node.raw}|${JSON.stringify(node.inputRange)}|vcu-person|${gx}|${gy}`;
        const gradientId = `acc-vcuu-grad-${Math.abs(hashString(gradientSeed))}`;
        out.push(
          `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">${gradientStopsStepped(colors)}</linearGradient></defs>`
        );
        glyphInner = applyAccumulatedGradientToVcuu(glyphInner, gradientId);
      }
    }
    if (node.kind === "visualization" && token === "Vu" && dependencyColors.length > 0) {
      if (dependencyColors.length === 1) {
        glyphInner = applyVuAccentFill(glyphInner, dependencyColors[0]);
      } else {
        const gradientSeed = `${node.frameIndex}|${node.kind}|${node.raw}|${JSON.stringify(node.inputRange)}|${JSON.stringify(node.inputIds)}|vu|${gx}|${gy}`;
        const gradientId = `acc-vu-grad-${Math.abs(hashString(gradientSeed))}`;
        out.push(
          `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">${gradientStopsStepped(dependencyColors)}</linearGradient></defs>`
        );
        glyphInner = applyVuAccentFill(glyphInner, `url(#${gradientId})`);
      }
    }
    const scale = size / glyph.viewBoxWidth;
    out.push(
      `<g transform="translate(${gx},${gy}) scale(${scale})" style="color:${color}">` +
        glyphInner +
      `</g>`
    );
  } else {
    out.push(renderFallbackCircle(gx, gy, size, color));
  }

  const rank = Number.isFinite(node.persistenceStyleRank) ? node.persistenceStyleRank : null;
  const rankDash = rank == null ? null : persistenceDashForRank(rank);
  if (node.kind === "visualization" && node.visIndex != null && node.isInPersistentVisualizationSpan) {
    renderIndexRing(out, gx, gy, size, "#000", rankDash);
  } else if (node.kind === "input" && node.isInPersistentInputSpan) {
    renderIndexRing(out, gx, gy, size, "#000", rankDash);
  } else if (node.kind === "annotation" && node.isInPersistentAnnotationSpan && rank != null && rank >= 2) {
    renderIndexRing(out, gx, gy, size, "#000", rankDash);
  }
}

function buildFrameRows(frameNodes) {
  const sorted = sortNodesForStack(frameNodes);
  const rows = [];
  const groupRowIndex = new Map();

  for (const node of sorted) {
    if (node.groupId) {
      const key = String(node.groupId);
      let idx = groupRowIndex.get(key);
      if (idx == null) {
        idx = rows.length;
        rows.push({ groupId: key, nodes: [] });
        groupRowIndex.set(key, idx);
      }
      rows[idx].nodes.push(node);
      continue;
    }
    rows.push({ groupId: null, nodes: [node] });
  }

  return rows;
}

function shouldRenderNode(node) {
  return !node.persistentEnd;
}

function buildFrameMetrics(maxFrameIndex, rowsByFrame, cfg) {
  const frameTops = new Map();
  const frameHeights = new Map();
  let cursorY = cfg.margin;

  for (let fi = 0; fi <= maxFrameIndex; fi += 1) {
    const rows = rowsByFrame.get(fi) ?? [];
    const rowCount = rows.length;
    const rowHeights = rows.map((row) => rowVisualHeight(row, cfg));
    const contentHeight = rowCount > 0
      ? rowHeights.reduce((acc, h) => acc + h, 0) + (rowCount - 1) * cfg.rowGap
      : 0;
    const frameHeight = rowCount > 0
      ? Math.max(cfg.blockHeight, contentHeight + cfg.framePadding * 2)
      : 0;
    frameTops.set(fi, cursorY);
    frameHeights.set(fi, frameHeight);
    cursorY += frameHeight;
  }

  return {
    frameTops,
    frameHeights,
    totalHeight: cursorY + cfg.margin,
  };
}

function toSubscriptDigits(value) {
  return String(value || "")
    .replace(/0/g, "₀")
    .replace(/1/g, "₁")
    .replace(/2/g, "₂")
    .replace(/3/g, "₃")
    .replace(/4/g, "₄")
    .replace(/5/g, "₅")
    .replace(/6/g, "₆")
    .replace(/7/g, "₇")
    .replace(/8/g, "₈")
    .replace(/9/g, "₉");
}

function formatIndexedSymbol(prefix, rawIndex) {
  const idx = String(rawIndex ?? "").trim();
  if (!idx || /^n$/i.test(idx)) return `${prefix}`;
  if (/^\d+$/.test(idx)) return `${prefix}${toSubscriptDigits(idx)}`;
  return `${prefix}${idx}`;
}

function formatInputRef(rawInputId) {
  return formatIndexedSymbol("I", rawInputId);
}

function formatAnnotationRailLabel(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) return "A";
  const normalized = key.replace(/\s+/g, "");
  const match = normalized.match(/^A(\d+|n)?$/i);
  if (!match) return normalized;
  const idx = match[1] || "";
  return formatIndexedSymbol("A", idx);
}

function formatInputRailLabel(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) return "I";
  const normalized = key.replace(/\s+/g, "");
  const match = normalized.match(/^I(\d+|n)?$/i);
  if (!match) return normalized;
  const idx = match[1] || "";
  return formatIndexedSymbol("I", idx);
}

function railLabel(rail) {
  if (rail.kind === "visualization") {
    return formatIndexedSymbol("V", rail.visIndex ?? "");
  }
  if (rail.kind === "annotation") {
    return formatAnnotationRailLabel(rail.key);
  }
  if (rail.kind === "input") {
    return formatInputRailLabel(rail.key);
  }
  return rail.key || "";
}

function buildPersistenceRects(rails, frameRows, frameTops, frameHeights, cfg) {
  const out = [];
  const padX = 10;
  const padY = 2;

  for (const rail of rails) {
    let minX = cfg.x - cfg.glyphSize / 2;
    let maxX = cfg.x + cfg.glyphSize / 2;

    let yStart = (frameTops.get(rail.startFrame) ?? cfg.margin) - padY;
    const endTop = frameTops.get(rail.endFrame) ?? cfg.margin;
    const endHeight = frameHeights.get(rail.endFrame) ?? cfg.blockHeight;
    let yEnd = endTop + endHeight + padY;

    for (let fi = rail.startFrame; fi <= rail.endFrame; fi += 1) {
      const rows = frameRows.get(fi) ?? [];
      for (const row of rows) {
        if (row.substoryOnly) continue;
        minX = Math.min(minX, row.startX);
        maxX = Math.max(maxX, row.endX);
      }
    }

    out.push({
      railId: rail.railId || `${rail.kind}:${rail.key}:${rail.startFrame}:${rail.endFrame}`,
      key: rail.key,
      kind: rail.kind || "visualization",
      label: railLabel(rail),
      visIndex: rail.visIndex || null,
      startFrame: rail.startFrame,
      endFrame: rail.endFrame,
      x: minX - padX,
      y: yStart,
      width: (maxX - minX) + padX * 2,
      height: yEnd - yStart,
    });
  }
  return out;
}

function unifyPersistenceRectsWidth(rects, extraPadding = 16) {
  if (!Array.isArray(rects) || rects.length === 0) return rects;
  const left = Math.min(...rects.map((r) => r.x)) - extraPadding;
  const right = Math.max(...rects.map((r) => r.x + r.width)) + extraPadding;
  const width = Math.max(0, right - left);
  for (const rect of rects) {
    rect.x = left;
    rect.width = width;
  }
  return rects;
}

function sortPersistenceRailsByOrder(rails) {
  return [...(rails || [])].sort((a, b) => {
    const ao = Number.isFinite(a?.startOrder) ? a.startOrder : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b?.startOrder) ? b.startOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    if ((a?.startFrame ?? 0) !== (b?.startFrame ?? 0)) return (a?.startFrame ?? 0) - (b?.startFrame ?? 0);
    if ((a?.endFrame ?? 0) !== (b?.endFrame ?? 0)) return (a?.endFrame ?? 0) - (b?.endFrame ?? 0);
    return String(a?.railId || "").localeCompare(String(b?.railId || ""));
  });
}

function buildPersistenceFills(rects, rails, placements) {
  function nodePersistentKey(node) {
    if (!node) return null;
    if (node.kind === "visualization") return node.persistentKey || null;
    if (node.kind === "annotation") return node.annIndex ? `A${node.annIndex}` : (node.persistentKey || null);
    if (node.kind === "input") return node.inputId ? `I${node.inputId}` : (node.persistentKey || null);
    return node.persistentKey || null;
  }

  function findTriggerBand(rail, fillTop, fillHeight) {
    if (!rail || !Number.isFinite(fillTop) || !Number.isFinite(fillHeight) || fillHeight <= 0) return null;
    const fillBottom = fillTop + fillHeight;
    const railKey = String(rail.key || "");
    const kind = String(rail.kind || "");

    const inStartFrame = (placements || []).filter((p) =>
      p?.node &&
      String(p.node.kind || "") === kind &&
      Number(p.node.frameIndex) === Number(rail.startFrame) &&
      String(nodePersistentKey(p.node) || "") === railKey &&
      !p.node.persistentEnd
    );
    const inSpan = (placements || []).filter((p) =>
      p?.node &&
      String(p.node.kind || "") === kind &&
      Number(p.node.frameIndex) >= Number(rail.startFrame) &&
      Number(p.node.frameIndex) <= Number(rail.endFrame) &&
      String(nodePersistentKey(p.node) || "") === railKey &&
      !p.node.persistentEnd
    );
    const candidates = inStartFrame.length > 0 ? inStartFrame : inSpan;
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.node.frameIndex !== b.node.frameIndex) return a.node.frameIndex - b.node.frameIndex;
      return (a.gy || 0) - (b.gy || 0);
    });
    const first = candidates[0];
    const nodeTop = Number(first.gy);
    const nodeHeight = Number(first.height ?? first.size ?? 0);
    if (!Number.isFinite(nodeTop) || !Number.isFinite(nodeHeight) || nodeHeight <= 0) return null;

    const bandTop = Math.max(fillTop, nodeTop - 2);
    const bandBottom = Math.min(fillBottom, nodeTop + nodeHeight + 2);
    const bandHeight = bandBottom - bandTop;
    if (!(bandHeight > 0)) return null;
    return { y: bandTop, height: bandHeight };
  }

  const railRectKey = (rail) => (
    rail.railId || `${rail.kind}:${rail.key}:${rail.startFrame}:${rail.endFrame}`
  );
  const rectByRailId = new Map(
    rects.map((r) => [r.railId || `${r.kind}:${r.key}:${r.startFrame}:${r.endFrame}`, r])
  );
  const visRails = sortPersistenceRailsByOrder((rails || []).filter((r) => r.kind === "visualization"));
  const annRails = sortPersistenceRailsByOrder((rails || []).filter((r) => r.kind === "annotation"));
  const inputRails = sortPersistenceRailsByOrder((rails || []).filter((r) => r.kind === "input"));
  const out = [];
  const railCapInset = 8;
  const interSpanGap = 3;
  const fillPaddingTop = 6;
  let prevBottom = Number.NEGATIVE_INFINITY;

  for (const rail of visRails) {
    const rect = rectByRailId.get(railRectKey(rail));
    if (!rect) continue;

    const railTop = rect.y + railCapInset;
    const railBottom = rect.y + rect.height - railCapInset;
    if (railBottom <= railTop) continue;

    const contentTop = placements
      .filter((p) => p.node.frameIndex >= rail.startFrame && p.node.frameIndex <= rail.endFrame)
      .reduce((min, p) => Math.min(min, p.gy), Number.POSITIVE_INFINITY);
    let fillTop = Number.isFinite(contentTop)
      ? Math.min(contentTop - fillPaddingTop, railTop)
      : railTop;
    fillTop = Math.max(fillTop, prevBottom + interSpanGap);
    fillTop = Math.min(fillTop, railBottom);
    const fillBottom = railBottom - interSpanGap / 2;
    const height = Math.max(0, fillBottom - fillTop);
    if (height <= 0) continue;

    const annOverlappingBlock = annRails.filter(
      (ar) => ar.startFrame <= rail.endFrame && ar.endFrame >= rail.startFrame
    );
    const activeAnnAtStart = annOverlappingBlock
      .filter((ar) => ar.startFrame <= rail.startFrame && ar.endFrame >= rail.startFrame)
      .map((ar) => rectByRailId.get(railRectKey(ar))?.label)
      .filter(Boolean);
    const fallbackAnnLabel = activeAnnAtStart.length === 0
      ? annOverlappingBlock
          .map((ar) => rectByRailId.get(railRectKey(ar))?.label)
          .find(Boolean)
      : null;
    const inputOverlappingBlock = inputRails.filter(
      (ir) => ir.startFrame <= rail.endFrame && ir.endFrame >= rail.startFrame
    );
    const activeInputAtStart = inputOverlappingBlock
      .filter((ir) => ir.startFrame <= rail.startFrame && ir.endFrame >= rail.startFrame)
      .map((ir) => railLabel(ir))
      .filter(Boolean);
    const fallbackInputLabel = activeInputAtStart.length === 0
      ? inputOverlappingBlock
          .map((ir) => railLabel(ir))
          .find(Boolean)
      : null;

    const layerRails = sortPersistenceRailsByOrder([
      rail,
      ...annOverlappingBlock,
      ...inputOverlappingBlock,
    ]);

    const labels = [
      ...new Set([
        rect.label,
        ...activeAnnAtStart,
        fallbackAnnLabel,
        ...activeInputAtStart,
        fallbackInputLabel,
      ].filter(Boolean)),
    ]
      .sort((a, b) => {
        const priority = (value) => {
          if (/^V/i.test(value)) return 0;
          if (/^A/i.test(value)) return 1;
          if (/^I/i.test(value)) return 2;
          return 3;
        };
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      });

    out.push({
      railId: rail.railId || `${rail.kind}:${rail.key}:${rail.startFrame}:${rail.endFrame}`,
      key: rail.key,
      x: rect.x,
      y: fillTop,
      width: rect.width,
      height,
      triggerBand: findTriggerBand(rail, fillTop, height),
      labels,
      layerRails,
    });
    prevBottom = fillTop + height;
  }

  // Annotation-only persistence blocks (no overlapping visualization span).
  for (const rail of annRails) {
    const overlapsVisualization = visRails.some(
      (vr) => vr.startFrame <= rail.endFrame && vr.endFrame >= rail.startFrame
    );
    if (overlapsVisualization) continue;

    const rect = rectByRailId.get(railRectKey(rail));
    if (!rect) continue;

    const railTop = rect.y + railCapInset;
    const railBottom = rect.y + rect.height - railCapInset;
    if (railBottom <= railTop) continue;

    const contentTop = placements
      .filter((p) => p.node.frameIndex >= rail.startFrame && p.node.frameIndex <= rail.endFrame)
      .reduce((min, p) => Math.min(min, p.gy), Number.POSITIVE_INFINITY);
    let fillTop = Number.isFinite(contentTop)
      ? Math.min(contentTop - fillPaddingTop, railTop)
      : railTop;
    fillTop = Math.max(fillTop, prevBottom + interSpanGap);
    fillTop = Math.min(fillTop, railBottom);
    const fillBottom = railBottom - interSpanGap / 2;
    const height = Math.max(0, fillBottom - fillTop);
    if (height <= 0) continue;

    const inputOverlappingBlock = inputRails.filter(
      (ir) => ir.startFrame <= rail.endFrame && ir.endFrame >= rail.startFrame
    );
    const activeInputAtStart = inputOverlappingBlock
      .filter((ir) => ir.startFrame <= rail.startFrame && ir.endFrame >= rail.startFrame)
      .map((ir) => railLabel(ir))
      .filter(Boolean);
    const fallbackInputLabel = activeInputAtStart.length === 0
      ? inputOverlappingBlock
          .map((ir) => railLabel(ir))
          .find(Boolean)
      : null;
    const layerRails = sortPersistenceRailsByOrder([
      rail,
      ...inputOverlappingBlock,
    ]);

    const labels = [
      ...new Set([
        rect.label || railLabel(rail) || "A",
        ...activeInputAtStart,
        fallbackInputLabel,
      ].filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    out.push({
      railId: rail.railId || `${rail.kind}:${rail.key}:${rail.startFrame}:${rail.endFrame}`,
      key: rail.key,
      x: rect.x,
      y: fillTop,
      width: rect.width,
      height,
      triggerBand: findTriggerBand(rail, fillTop, height),
      labels,
      layerRails,
    });
    prevBottom = fillTop + height;
  }

  // Input-only persistence blocks (no overlapping visualization or annotation span).
  for (const rail of inputRails) {
    const overlapsVisualization = visRails.some(
      (vr) => vr.startFrame <= rail.endFrame && vr.endFrame >= rail.startFrame
    );
    if (overlapsVisualization) continue;
    const overlapsAnnotation = annRails.some(
      (ar) => ar.startFrame <= rail.endFrame && ar.endFrame >= rail.startFrame
    );
    if (overlapsAnnotation) continue;

    const rect = rectByRailId.get(railRectKey(rail));
    if (!rect) continue;

    const railTop = rect.y + railCapInset;
    const railBottom = rect.y + rect.height - railCapInset;
    if (railBottom <= railTop) continue;

    const contentTop = placements
      .filter((p) => p.node.frameIndex >= rail.startFrame && p.node.frameIndex <= rail.endFrame)
      .reduce((min, p) => Math.min(min, p.gy), Number.POSITIVE_INFINITY);
    let fillTop = Number.isFinite(contentTop)
      ? Math.min(contentTop - fillPaddingTop, railTop)
      : railTop;
    fillTop = Math.max(fillTop, prevBottom + interSpanGap);
    fillTop = Math.min(fillTop, railBottom);
    const fillBottom = railBottom - interSpanGap / 2;
    const height = Math.max(0, fillBottom - fillTop);
    if (height <= 0) continue;

    out.push({
      railId: rail.railId || `${rail.kind}:${rail.key}:${rail.startFrame}:${rail.endFrame}`,
      key: rail.key,
      x: rect.x,
      y: fillTop,
      width: rect.width,
      height,
      triggerBand: findTriggerBand(rail, fillTop, height),
      labels: [rect.label || railLabel(rail) || rail.key || "I"],
      layerRails: [rail],
    });
    prevBottom = fillTop + height;
  }

  return out;
}

function renderOpenRailsBorder(out, bbox, style) {
  const { x, y, width, height } = bbox;
  const stroke = style?.stroke || "#000";
  const strokeWidth = Number(style?.strokeWidth) || 2;
  const dash = style?.dash || null;
  const cap = Number(style?.capLength) || 12;
  const corner = Number(style?.cornerRadius) || 8;

  const leftX = x;
  const rightX = x + width;
  const topY = y;
  const bottomY = y + height;
  const segmentHeight = Math.max(0, bottomY - topY);
  const effectiveCorner = Math.max(0, Math.min(corner, segmentHeight / 2));
  const effectiveCap = Math.max(0, Math.min(cap, Math.max(0, width / 2)));
  const common = `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}`;

  if (bottomY <= topY) return;

  // Left and right open rails with rounded corner transitions.
  const leftPath =
    `M ${leftX + effectiveCap} ${topY} ` +
    `Q ${leftX} ${topY} ${leftX} ${topY + effectiveCorner} ` +
    `V ${bottomY - effectiveCorner} ` +
    `Q ${leftX} ${bottomY} ${leftX + effectiveCap} ${bottomY}`;
  const rightPath =
    `M ${rightX - effectiveCap} ${topY} ` +
    `Q ${rightX} ${topY} ${rightX} ${topY + effectiveCorner} ` +
    `V ${bottomY - effectiveCorner} ` +
    `Q ${rightX} ${bottomY} ${rightX - effectiveCap} ${bottomY}`;
  out.push(`<path d="${leftPath}" ${common}/>`); 
  out.push(`<path d="${rightPath}" ${common}/>`); 
}

function persistenceLayerStyle(layerIndex) {
  if (layerIndex <= 0) {
    return {
      dash: null,
      capLength: 12,
      cornerRadius: 10,
    };
  }
  if (layerIndex === 1) {
    return {
      dash: "8 5",
      capLength: 9,
      cornerRadius: 10,
    };
  }
  return {
    dash: "1 4",
    capLength: 9,
    cornerRadius: 10,
  };
}

function persistenceDashForRank(rank) {
  const idx = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
  return persistenceLayerStyle(idx).dash || null;
}

// Color helpers -----------------------------------------------------
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function toHex(value) {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return v.toString(16).padStart(2, "0");
}

// d3.interpolateTurbo polynomial approximation (same model as d3-scale-chromatic).
function interpolateTurboHex(tRaw) {
  const t = clamp01(tRaw);
  const r = 34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 + t * (-15327.97 + t * (27814.0 + t * (-22569.18 + t * 6838.66))));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Avoid Turbo's very dark/saturated extremes so palette two sits closer to Set3.
const TURBO_START = 0.14;
const TURBO_END = 0.88;
// d3.schemeSet3 (first 10 colors) for maximally distinct small-k assignment.
const BASE_INPUT_PALETTE = [
  "#8dd3c7",
  "#bebada",
  "#fb8072",
  "#80b1d3",
  "#fdb462",
  "#b3de69",
  "#fccde5",
  "#d9d9d9",
  "#bc80bd",
  "#ffffb3",
];
const PALETTE_TWO = buildPaletteTwo();
const NEUTRAL = "#111";

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function parseInputIndex(inputId) {
  if (inputId == null) return null;
  const raw = String(inputId).trim();
  const iterMatch = raw.match(/^iter:\d+:(\d+)$/);
  if (iterMatch) {
    const iterNumber = Number.parseInt(iterMatch[1], 10);
    return Number.isFinite(iterNumber) && iterNumber > 0 ? iterNumber : null;
  }
  const asNumber = Number.parseInt(raw, 10);
  return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
}

function turboColorByIndex(idxOneBased) {
  const span = 40;
  const idx = Math.max(1, Number(idxOneBased) || 1);
  const i = (idx - 1) % span;
  const t = TURBO_START + (i / (span - 1)) * (TURBO_END - TURBO_START);
  return interpolateTurboHex(t);
}

function mixHexWithWhite(hex, amount = 0.2) {
  const m = String(hex).trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return hex;
  const raw = m[1];
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const blend = (c) => Math.round(c + (255 - c) * clamp01(amount));
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}

function buildPaletteTwo() {
  // Use every second Turbo sample first (larger hue jumps), then fill with the rest.
  const sampleCount = 20;
  const raw = Array.from({ length: sampleCount }, (_, i) => {
    const t = TURBO_START + (i / (sampleCount - 1)) * (TURBO_END - TURBO_START);
    return interpolateTurboHex(t);
  });
  for (let i = 0; i < sampleCount; i += 1) {
    raw[i] = mixHexWithWhite(raw[i], 0.2);
  }
  const even = [];
  const odd = [];
  for (let i = 0; i < sampleCount; i += 1) {
    if (i % 2 === 0) even.push(raw[i]);
    else odd.push(raw[i]);
  }
  return [...even, ...odd];
}

function logStripeDebug(node, n, colors, mode) {
  if (process.env.DEBUG_STRIPES !== "1") return;
  const counts = new Map();
  for (const c of colors) counts.set(c, (counts.get(c) || 0) + 1);
  const countText = [...counts.entries()].map(([c, k]) => `${c}:${k}`).join(", ");
  console.log(
    `[stripes] mode=${mode} raw="${node?.raw || ""}" frame=${node?.frameIndex ?? "?"} ` +
    `N=${n} stripeLen=${colors.length} unique=${counts.size} counts=[${countText}]`
  );
}

function getInputColor(inputId, k) {
  if (inputId == null) return NEUTRAL;
  const raw = String(inputId).trim();
  const numericIndex = parseInputIndex(raw);
  const kNum = Number.isFinite(Number(k)) && Number(k) > 0 ? Math.floor(Number(k)) : null;

  if (numericIndex != null) {
    // Always map numeric input IDs globally so explicit jump dependencies
    // like Vu(I1, I3) preserve their true input colors.
    if (numericIndex <= BASE_INPUT_PALETTE.length) {
      return BASE_INPUT_PALETTE[numericIndex - 1];
    }
    return PALETTE_TWO[(numericIndex - BASE_INPUT_PALETTE.length - 1) % PALETTE_TWO.length];
  }

  const hashed = Math.abs(hashString(raw));
  if (kNum != null && kNum <= BASE_INPUT_PALETTE.length) {
    return BASE_INPUT_PALETTE[hashed % kNum];
  }
  return PALETTE_TWO[hashed % PALETTE_TWO.length];
}

// ---- main render ----
export async function renderSVG(layoutObj) {
  // layoutObj shape: { articleId, layout: { nodes: [...] , ... } }
  const layout = layoutObj.layout;
  const nodes = layout.nodes ?? [];
  const rails = layout.persistenceRails ?? layout.persistenceSpans ?? layout.spans ?? [];
  assignAnnotationPersistenceGlyphTokens(nodes, rails);

  const mapping = await loadMapping();
  const byFrame = groupNodesByFrame(nodes);
  const cfg = await loadRenderTokens();
  const maxFrameIndex = Math.max(
    nodes.length ? Math.max(...nodes.map((n) => n.frameIndex)) : 0,
    rails.length ? Math.max(...rails.map((s) => s.endFrame)) : 0
  );
  const rowsByFrame = new Map();
  for (let fi = 0; fi <= maxFrameIndex; fi += 1) {
    const renderableNodes = (byFrame.get(fi) ?? []).filter(shouldRenderNode);
    rowsByFrame.set(fi, buildFrameRows(renderableNodes));
  }
  const frameMetrics = buildFrameMetrics(maxFrameIndex, rowsByFrame, cfg);

  const placements = [];
  const frameRows = new Map();
  for (let fi = 0; fi <= maxFrameIndex; fi += 1) {
    const rows = rowsByFrame.get(fi) ?? [];
    if (rows.length === 0) continue;
    const frameTop = frameMetrics.frameTops.get(fi) ?? cfg.margin;
    const frameRowLayouts = [];
    let yCursor = frameTop + cfg.framePadding;
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const rowHeight = rowVisualHeight(row, cfg);
      const y = yCursor;
      const n = row.nodes.length;
      const widths = row.nodes.map((node) => nodeVisualWidth(node, cfg));
      const totalWidth = widths.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * cfg.horizontalSpacing;
      const startX = cfg.x - totalWidth / 2;
      let xCursor = startX;
      let rowStartX = Number.POSITIVE_INFINITY;
      let rowEndX = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < row.nodes.length; i += 1) {
        const node = row.nodes[i];
        const nodeWidth = widths[i];
        const nodeHeight = nodeVisualHeight(node, cfg);
        const gx = xCursor;
        placements.push({
          node,
          gx,
          gy: y + (rowHeight - nodeHeight) / 2,
          size: cfg.glyphSize,
          width: nodeWidth,
          height: nodeHeight,
        });
        rowStartX = Math.min(rowStartX, gx);
        rowEndX = Math.max(rowEndX, gx + nodeWidth + nodeOverlayRight(node, cfg));
        xCursor += nodeWidth + cfg.horizontalSpacing;
      }
      frameRowLayouts.push({
        frameIndex: fi,
        groupId: row.groupId,
        substoryOnly: row.nodes.every((n) => n.kind === "substory"),
        startX: Number.isFinite(rowStartX) ? rowStartX : startX,
        endX: Number.isFinite(rowEndX) ? rowEndX : startX + totalWidth,
        y,
        height: rowHeight,
      });
      yCursor += rowHeight + cfg.rowGap;
    }
    frameRows.set(fi, frameRowLayouts);
  }

  const persistenceRects = buildPersistenceRects(
    rails,
    frameRows,
    frameMetrics.frameTops,
    frameMetrics.frameHeights,
    cfg
  );
  unifyPersistenceRectsWidth(persistenceRects, 16);
  const persistenceFills = buildPersistenceFills(persistenceRects, rails, placements);
  let minX = cfg.x - cfg.glyphSize / 2;
  let maxX = cfg.x + cfg.glyphSize / 2;
  for (const p of placements) {
    const pWidth = p.width ?? p.size;
    minX = Math.min(minX, p.gx);
    maxX = Math.max(maxX, p.gx + pWidth + nodeOverlayRight(p.node, cfg));
  }
  for (const bg of persistenceRects) {
    minX = Math.min(minX, bg.x);
    maxX = Math.max(maxX, bg.x + bg.width);
  }
  for (const bg of persistenceFills) {
    minX = Math.min(minX, bg.x);
    maxX = Math.max(maxX, bg.x + bg.width);
  }

  const shiftX = cfg.margin - minX;
  const width = Math.ceil((maxX - minX) + cfg.margin * 2);
  let maxDrawY = frameMetrics.totalHeight - cfg.margin;
  for (const p of placements) {
    if (p.node.kind === "substory") {
      const m = subStoryMetrics(p.node, cfg);
      // Sub-story lane can extend below main timeline; keep full branch visible.
      maxDrawY = Math.max(maxDrawY, p.gy + Math.max(cfg.glyphSize, m.rowsHeight));
    } else {
      maxDrawY = Math.max(maxDrawY, p.gy + (p.height ?? p.size));
    }
  }
  const height = Math.ceil(maxDrawY + cfg.margin);

  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg">`,
  ];

  let triggerFadeIndex = 0;
  for (const bg of persistenceFills) {
    out.push(
      `<rect x="${bg.x + shiftX}" y="${bg.y}" width="${bg.width}" height="${bg.height}" rx="10" ` +
      `fill="rgba(0,0,0,0.08)" stroke="none"/>`
    );
    if (bg.triggerBand && Number.isFinite(bg.triggerBand.y) && Number.isFinite(bg.triggerBand.height) && bg.triggerBand.height > 0) {
      const bandY = bg.triggerBand.y;
      const bandH = Math.min(bg.triggerBand.height, bg.height);
      const topAligned = Math.abs(bandY - bg.y) < 0.5;
      const rx = topAligned ? 10 : 0;
      const fadeSeed = `${bg.railId || bg.key || "rail"}|${bandY}|${bandH}|${triggerFadeIndex}`;
      const gradientId = `persist-trigger-fade-${Math.abs(hashString(fadeSeed))}`;
      triggerFadeIndex += 1;
      out.push(
        `<defs><linearGradient id="${gradientId}" x1="0%" y1="${bandY}" x2="0%" y2="${bandY + bandH}" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0%" stop-color="#000" stop-opacity="0"/>` +
        `<stop offset="14%" stop-color="#000" stop-opacity="0.11"/>` +
        `<stop offset="86%" stop-color="#000" stop-opacity="0.11"/>` +
        `<stop offset="100%" stop-color="#000" stop-opacity="0"/>` +
        `</linearGradient></defs>`
      );
      out.push(
        `<rect x="${bg.x + shiftX}" y="${bandY}" width="${bg.width}" height="${bandH}" rx="${rx}" ` +
        `fill="url(#${gradientId})" stroke="none"/>`
      );
    }
  }

  // Place each persistence label at its own span start (instead of merged block top).
  const labelRects = [...persistenceRects]
    .filter((r) => r.label)
    .sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      const priority = (kind) => {
        if (kind === "visualization") return 0;
        if (kind === "annotation") return 1;
        if (kind === "input") return 2;
        return 3;
      };
      const pa = priority(a.kind);
      const pb = priority(b.kind);
      if (pa !== pb) return pa - pb;
      return String(a.label).localeCompare(String(b.label));
    });
  const labelMinGap = 12;
  let lastPlacedY = Number.NEGATIVE_INFINITY;
  for (const rect of labelRects) {
    const lx = rect.x + shiftX + 8;
    const baseY = rect.y + 24;
    const ly = baseY <= lastPlacedY + labelMinGap
      ? lastPlacedY + labelMinGap
      : baseY;
    lastPlacedY = ly;
    out.push(`<text x="${lx}" y="${ly}" fill="#111" font-size="10" font-family="sans-serif">${rect.label}</text>`);
  }

  const annotationRects = persistenceRects.filter((r) => r.kind === "annotation");
  const inputRects = persistenceRects.filter((r) => r.kind === "input");

  for (const bg of persistenceFills) {
    const baseBBox = {
      x: bg.x + shiftX,
      y: bg.y,
      width: bg.width,
      height: bg.height,
    };
    const layerRails = Array.isArray(bg.layerRails) && bg.layerRails.length > 0
      ? sortPersistenceRailsByOrder(bg.layerRails)
      : [{ kind: "visualization", startOrder: 0 }];
    const layerKinds = layerRails.map((layer) => layer.kind);
    const hasVisualizationBase = layerKinds[0] === "visualization";
    const baseTop = baseBBox.y;
    const baseBottom = baseBBox.y + baseBBox.height;

    for (let layerIndex = 0; layerIndex < layerRails.length; layerIndex += 1) {
      const layerKind = layerRails[layerIndex]?.kind || "visualization";
      const styleCfg = persistenceLayerStyle(layerIndex);
      const outerOffset = layerIndex * 6;
      // Keep all layer brackets vertically flush at start/end.
      const outerShrinkY = layerIndex > 0 ? outerOffset : 0;
      const renderStyle = {
        stroke: "#000",
        strokeWidth: 2,
        dash: styleCfg.dash,
        capLength: styleCfg.capLength,
        cornerRadius: styleCfg.cornerRadius,
      };
      const renderBox = (topY, boxHeight) => {
        renderOpenRailsBorder(out, {
          x: baseBBox.x - outerOffset,
          y: topY - outerOffset + outerShrinkY,
          width: baseBBox.width + outerOffset * 2,
          height: Math.max(0, boxHeight + outerOffset * 2 - outerShrinkY * 2),
        }, renderStyle);
      };

      let overlapRects = null;
      if (layerIndex > 0) {
        if (layerKind === "annotation") overlapRects = annotationRects;
        else if (layerKind === "input") {
          overlapRects = layerKinds.includes("annotation") ? annotationRects : inputRects;
        }
      }

      if (!overlapRects || overlapRects.length === 0) {
        renderBox(baseBBox.y, baseBBox.height);
        continue;
      }

      const overlapping = overlapRects.filter((rect) => {
        const rectTop = rect.y;
        const rectBottom = rect.y + rect.height;
        return rectBottom > baseTop && rectTop < baseBottom;
      });

      if (overlapping.length === 0) {
        renderBox(baseBBox.y, baseBBox.height);
        continue;
      }

      for (const rect of overlapping) {
        const segTop = Math.max(baseTop, rect.y);
        const segBottom = Math.min(baseBottom, rect.y + rect.height);
        const segHeight = segBottom - segTop;
        if (segHeight <= 0) continue;
        renderBox(segTop, segHeight);
      }
    }
  }

  for (const placement of placements) {
    const { node, gy, size } = placement;
    const gx = placement.gx + shiftX;
    const width = placement.width ?? size;
    const height = placement.height ?? size;
    const sequenceCenterX = cfg.x + shiftX;

    if (node.kind === "groupRange") {
      const metrics = groupRangeMetrics(node, cfg);
      const groupBaseX = sequenceCenterX - metrics.contentWidth / 2;
      let yCursor = gy;
      for (const step of metrics.steps) {
        const elements = Array.isArray(step.elements) ? step.elements : [];
        if (elements.length === 0) {
          yCursor += size + cfg.rowGap;
          continue;
        }
        const currentStepWidth = stepWidth(step, cfg);
        const stepStartX = groupBaseX + (metrics.contentWidth - currentStepWidth) / 2;
        for (let i = 0; i < elements.length; i += 1) {
          const child = elements[i];
          const childNode = buildPseudoNodeFromChild(child);
          const childX = stepStartX + i * (size + cfg.horizontalSpacing);
          await renderSingleGlyphNode(out, childNode, childX, yCursor, size, mapping);
        }
        yCursor += size + cfg.rowGap;
      }

      const count = rangeCount(node);
      if (count && metrics.steps.length > 0) {
        const contentRight = groupBaseX + metrics.contentWidth;
        const yTop = gy;
        const yBottom = gy + height;
        renderSequenceRangeBracket(out, contentRight, yTop, yBottom, count);
      }
    } else if (node.kind === "substory") {
      await renderSubStoryNode(out, node, gx, gy, size, mapping, cfg);
    } else {
      const baseX = rangeCount(node) ? (sequenceCenterX - size / 2) : gx;
      await renderSingleGlyphNode(out, node, baseX, gy, size, mapping);
    }

    const count = rangeCount(node);
    if (count && node.kind !== "groupRange") {
      const badgeBaseX = sequenceCenterX - size / 2;
      renderRangeBadgeRightOfGlyph(out, badgeBaseX, gy, size, count);
    }
    renderAccumulatedInputMarker(out, node, gx, gy, size);
  }

  out.push(`</svg>`);
  return out.join("\n");
}

export async function writeSVG(layoutObj, outputDir) {
  const svgContent = await renderSVG(layoutObj);
  const fileName = `${toSafeSvgBaseName(layoutObj.articleId)}.svg`;
  const filePath = path.join(outputDir, fileName);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(filePath, svgContent, "utf-8");
}

export async function getRenderMetrics() {
  const cfg = await loadRenderTokens();
  return {
    glyphSize: cfg.glyphSize,
    rowHeight: cfg.blockHeight,
    horizontalSpacing: cfg.horizontalSpacing,
    verticalSpacing: cfg.rowGap,
    framePadding: cfg.framePadding,
    margin: cfg.margin,
    galleryCardWidth: cfg.galleryCardWidth,
    gallerySvgHeight: cfg.gallerySvgHeight,
  };
}
