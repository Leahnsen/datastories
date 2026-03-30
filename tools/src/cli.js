import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import parseNotation from "./parser/parse.js";
import buildStructure from "./structure/build.js";
import { buildLayout } from "./layout/build.js";
import { getRenderMetrics, toSafeSvgBaseName, writeSVG } from "./render/svg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ always resolve from tools/src -> project root data/
const DATA_PATH = path.resolve(__dirname, "../../data/articles.sample.json");

async function loadArticles() {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw);
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function resolveFromCwd(p) {
  if (!p) return null;
  return path.resolve(process.cwd(), p);
}

async function resolveExistingInputPath(p) {
  const candidates = [
    resolveFromCwd(p),
    path.resolve(__dirname, "../../", p),
    path.resolve(__dirname, "../../../", p),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return candidates[0];
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h, idx) => {
    const text = String(h || "").trim();
    return idx === 0 ? text.replace(/^\uFEFF/, "") : text;
  });
  return rows.slice(1).map((values) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = values[idx] ?? "";
    });
    return obj;
  });
}

function slugify(value) {
  const raw = String(value || "").trim().toLowerCase();
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "story";
}

function uniqueId(base, used) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  const id = `${base}-${i}`;
  used.add(id);
  return id;
}

async function importStories(csvPath, outPath, reportPath) {
  const raw = await fs.readFile(csvPath, "utf-8");
  const rows = parseCsv(raw);
  const used = new Set();
  const stories = [];
  const errors = [];
  let skippedEmpty = 0;
  let skippedComment = 0;
  let withNotation = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const formula = String(row.Formula ?? "").trim();
    if (!formula) {
      skippedEmpty += 1;
      continue;
    }
    withNotation += 1;

    if (/grenzfall/i.test(formula)) {
      skippedComment += 1;
      continue;
    }

    const title = String(row.Article ?? "").trim();
    const id = uniqueId(slugify(title || `story-${i + 1}`), used);
    const meta = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "Article" || k === "Formula") continue;
      meta[k] = v;
    }

    try {
      stories.push({
        id,
        title,
        notation: formula,
        meta,
      });
    } catch (err) {
      errors.push({
        row: i + 2,
        message: err.message,
      });
    }
  }

  const report = {
    totalRows: rows.length,
    withNotation,
    renderable: stories.length,
    skippedEmpty,
    skippedComment,
    errors,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(stories, null, 2), "utf-8");
  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
  }

  console.log(`Imported ${stories.length} stories -> ${outPath}`);
  if (reportPath) console.log(`Wrote report -> ${reportPath}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function flattenParsedElements(parsed) {
  const rows = [];
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  for (const step of steps) {
    const stepIndex = Number.isFinite(step?.index) ? step.index : rows.length;
    const elements = Array.isArray(step?.elements) ? step.elements : [];
    for (const el of elements) {
      rows.push({ stepIndex, element: el });
    }
  }
  return rows;
}

function hasMultiInputArgument(element) {
  if (!element || element.type === "I") return false;
  if (element.dependsOnAccumulatedInputs && element.inputRange) return true;
  if (Array.isArray(element.inputRefs) && element.inputRefs.length > 1) return true;
  const src = String(element.sourceRaw || "");
  return /\(I[^)]*(?:…|\.{3}|,I)[^)]*\)/i.test(src);
}

function hasSingleInputArgument(element) {
  if (!element || element.type === "I") return false;
  if (Array.isArray(element.inputRefs) && element.inputRefs.length > 1) return false;
  if (element.dependsOnAccumulatedInputs && element.inputRange) return false;
  return element.inputRef != null;
}

function normalizeSubscript(value) {
  return String(value || "")
    .replace(/₀/g, "0")
    .replace(/₁/g, "1")
    .replace(/₂/g, "2")
    .replace(/₃/g, "3")
    .replace(/₄/g, "4")
    .replace(/₅/g, "5")
    .replace(/₆/g, "6")
    .replace(/₇/g, "7")
    .replace(/₈/g, "8")
    .replace(/₉/g, "9")
    .replace(/ₙ/g, "n");
}

function addInputId(set, value) {
  if (value == null) return;
  const raw = String(value).trim();
  if (!raw) return;
  set.add(raw.toLowerCase());
}

function addRangeInputIds(set, from, to, maxSpan = 200) {
  const start = Number(from);
  if (!Number.isFinite(start)) return;
  if (String(to).toLowerCase() === "n") return;
  const end = Number(to);
  if (!Number.isFinite(end) || end < start) return;
  const span = Math.min(maxSpan, end - start + 1);
  for (let i = 0; i < span; i += 1) {
    set.add(String(start + i));
  }
}

function collectInputUsage(parsed, notation) {
  const rows = flattenParsedElements(parsed);
  const distinctInputs = new Set();
  const argumentStepsByInput = new Map(); // inputId -> Set(stepIndex)
  let hasIntegratedMultiInputExpr = false;
  let hasVariableInputReference = /I[ₙn]/.test(String(notation || ""));
  let maxInputIndex = null;

  function updateMaxInputIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return;
    const intVal = Math.floor(n);
    maxInputIndex = maxInputIndex == null ? intVal : Math.max(maxInputIndex, intVal);
  }

  for (const { stepIndex, element } of rows) {
    if (!element) continue;
    const sourceRawNorm = normalizeSubscript(element.sourceRaw || element.raw || "");

    // Standalone input token (timeline event), including compact ranges like I1...13
    if (element.type === "I") {
      const tokenMatch = sourceRawNorm.match(/^I(\d+|n)$/i);
      if (tokenMatch) {
        addInputId(distinctInputs, tokenMatch[1]);
        if (tokenMatch[1].toLowerCase() === "n") hasVariableInputReference = true;
        else updateMaxInputIndex(tokenMatch[1]);
      }
      if (element.range && Number.isFinite(element.range.start) && Number.isFinite(element.range.end)) {
        addRangeInputIds(distinctInputs, element.range.start, element.range.end);
        updateMaxInputIndex(element.range.start);
        updateMaxInputIndex(element.range.end);
      }
      const rangeTokenMatch = sourceRawNorm.match(/^I(\d+)(?:…|\.{3})(\d+|n)$/i);
      if (rangeTokenMatch) {
        if (String(rangeTokenMatch[2]).toLowerCase() === "n") {
          hasVariableInputReference = true;
          addInputId(distinctInputs, rangeTokenMatch[1]);
          updateMaxInputIndex(rangeTokenMatch[1]);
        } else {
          addRangeInputIds(distinctInputs, rangeTokenMatch[1], rangeTokenMatch[2]);
          updateMaxInputIndex(rangeTokenMatch[1]);
          updateMaxInputIndex(rangeTokenMatch[2]);
        }
      }
      continue;
    }

    // Dependency arguments
    if (element.inputRef != null) {
      const key = String(element.inputRef).toLowerCase();
      addInputId(distinctInputs, key);
      updateMaxInputIndex(key);
      if (!argumentStepsByInput.has(key)) argumentStepsByInput.set(key, new Set());
      argumentStepsByInput.get(key).add(stepIndex);
    }

    if (Array.isArray(element.inputRefs) && element.inputRefs.length > 0) {
      if (element.inputRefs.length > 1) hasIntegratedMultiInputExpr = true;
      for (const ref of element.inputRefs) {
        const key = String(ref).toLowerCase();
        addInputId(distinctInputs, key);
        updateMaxInputIndex(key);
        if (key === "n") hasVariableInputReference = true;
        if (!argumentStepsByInput.has(key)) argumentStepsByInput.set(key, new Set());
        argumentStepsByInput.get(key).add(stepIndex);
      }
    }

    if (element.dependsOnAccumulatedInputs && element.inputRange) {
      hasIntegratedMultiInputExpr = true;
      addRangeInputIds(distinctInputs, element.inputRange.from, element.inputRange.to);
      addInputId(distinctInputs, element.inputRange.from);
      updateMaxInputIndex(element.inputRange.from);
      if (String(element.inputRange.to).toLowerCase() === "n") {
        hasVariableInputReference = true;
      } else {
        addInputId(distinctInputs, element.inputRange.to);
        updateMaxInputIndex(element.inputRange.to);
      }
    }

    if (/\(I[^)]*(?:…|\.{3}|,I)/i.test(sourceRawNorm)) {
      hasIntegratedMultiInputExpr = true;
    }
    if (/I[ₙn]/.test(sourceRawNorm)) {
      hasVariableInputReference = true;
    }
  }

  const hasDistributedEmbedding = [...argumentStepsByInput.values()].some((stepSet) => stepSet.size >= 2);
  const notationNorm = normalizeSubscript(notation || "");
  const notationIndexMatches = [...notationNorm.matchAll(/I(\d+)/g)];
  for (const m of notationIndexMatches) {
    updateMaxInputIndex(m[1]);
  }
  const hasInputIteration = /[ₙn]=/.test(notationNorm) && /I[ₙn]/.test(notationNorm);
  const hasMultipleInputs =
    distinctInputs.size >= 2 ||
    hasVariableInputReference ||
    hasInputIteration ||
    hasIntegratedMultiInputExpr;

  return {
    distinctInputCount: distinctInputs.size,
    maxInputIndex,
    hasMultipleInputs,
    hasDistributedEmbedding: hasDistributedEmbedding || hasIntegratedMultiInputExpr,
    hasIntegratedMultiInputExpr,
  };
}

function canonicalVisualizationAction(element) {
  if (!element || element.type !== "V") return "";
  const fromVisAction = String(element.visAction || "").trim();
  if (fromVisAction) return fromVisAction.toLowerCase();
  // Fallback: normalize raw and strip index between V and action, e.g. V₁cuu -> Vcuu.
  const normalizedRaw = String(element.raw || "")
    .replace(/₀/g, "0")
    .replace(/₁/g, "1")
    .replace(/₂/g, "2")
    .replace(/₃/g, "3")
    .replace(/₄/g, "4")
    .replace(/₅/g, "5")
    .replace(/₆/g, "6")
    .replace(/₇/g, "7")
    .replace(/₈/g, "8")
    .replace(/₉/g, "9")
    .replace(/ₙ/g, "n");
  const match = normalizedRaw.match(/^V(?:\d+|n)?([A-Za-z]+)$/i);
  if (match) return `v${String(match[1]).toLowerCase()}`;
  return normalizedRaw.toLowerCase();
}

function detectStructuralFeatures(article, parsed, structured, layout) {
  const notation = String(article.notation || "");
  const nodes = layout?.layout?.nodes || [];
  const reactionWindows = layout?.layout?.reactionWindows || [];
  const parsedRows = flattenParsedElements(parsed);
  const frameCount = Array.isArray(structured?.frames) ? structured.frames.length : 0;
  const hasSubstory = nodes.some((n) => n.kind === "substory") || /N(?:ds)?\s*\(/i.test(notation);
  const hasPersistence = nodes.some((n) => n.persistentStart || n.persistentEnd) || /⟦|\[/.test(notation);
  const hasIteration = /ₙ₌|n=/.test(notation);
  const hasRange = /…|\.\.\./.test(notation) || nodes.some((n) => n.range?.count > 1);
  const hasAccumulatedInput = nodes.some((n) => n.dependsOnAccumulatedInputs) ||
    parsedRows.some(({ element }) => hasMultiInputArgument(element));
  const hasReactionWindows = reactionWindows.length > 0 || notation.includes(",");
  const hasVizUpdates = nodes.some((n) => {
    if (n.kind !== "visualization") return false;
    const action = String(n.visAction || "V");
    return action !== "V";
  });
  const hasVcuFamily = parsedRows.some(({ element }) => {
    const action = canonicalVisualizationAction(element);
    return action.startsWith("vcu");
  });
  const hasVcuuOrVcuuo = parsedRows.some(({ element }) => {
    const action = canonicalVisualizationAction(element);
    return action === "vcuu" || action === "vcuuo";
  });
  const hasIteratedCumulativeVcu = hasIteration && parsedRows.some(({ element }) => {
    const action = canonicalVisualizationAction(element);
    return action.startsWith("vcu") && hasMultiInputArgument(element);
  });
  const hasNdsScopePattern = /N(?:ds)?\s*\(\s*I/i.test(notation);
  const hasCumulativePattern = /\(\s*I[₀-₉0-9]+\s*(?:…|\.{3})\s*(?:[₀-₉0-9]+|[ₙn])\s*\)/.test(notation) ||
    /\(\s*I[₀-₉0-9]+\s*,\s*I[₀-₉0-9ₙn]/.test(notation);

  const singleInputRefsByStep = new Map(); // legacy feature, kept for summaries
  for (const { stepIndex, element } of parsedRows) {
    if (!hasSingleInputArgument(element)) continue;
    const key = String(element.inputRef);
    if (!singleInputRefsByStep.has(key)) singleInputRefsByStep.set(key, new Set());
    singleInputRefsByStep.get(key).add(stepIndex);
  }
  const hasRepeatedInputRefSteps = [...singleInputRefsByStep.values()].some((s) => s.size >= 2);
  const hasMultiInputRef = parsedRows.some(({ element }) => hasMultiInputArgument(element));
  const inputUsage = collectInputUsage(parsed, notation);

  const inputIds = new Set(
    nodes
      .filter((n) => n.kind === "input" && n.inputId != null)
      .map((n) => String(n.inputId))
  );
  return {
    frameCount,
    inputCount: inputIds.size,
    hasSubstory,
    hasPersistence,
    hasIteration,
    hasRange,
    hasAccumulatedInput,
    hasMultiInputRef,
    hasRepeatedInputRefSteps,
    hasReactionWindows,
    hasVizUpdates,
    hasVcuFamily,
    hasVcuuOrVcuuo,
    hasIteratedCumulativeVcu,
    hasNdsScopePattern,
    hasCumulativePattern,
    hasMultipleInputs: inputUsage.hasMultipleInputs,
    hasDistributedEmbedding: inputUsage.hasDistributedEmbedding,
    hasIntegratedMultiInputExpr: inputUsage.hasIntegratedMultiInputExpr,
    distinctInputCountByNotation: inputUsage.distinctInputCount,
    maxInputIndexByNotation: inputUsage.maxInputIndex,
    inputCountByNotation: inputUsage.maxInputIndex ?? inputUsage.distinctInputCount,
  };
}

function classifyEpistemicMode(features) {
  // Strict operational rule:
  // Generative iff Vcuu/Vcuuo occurs; otherwise Parametric.
  if (features.hasVcuuOrVcuuo) return "generative";
  return "parametric";
}

function classifyStructuralDepth(features) {
  const isDistributed = Boolean(features.hasDistributedEmbedding);
  const isMultiple = Boolean(features.hasMultipleInputs);
  if (isDistributed && isMultiple) return "distributed_multiple";
  if (isDistributed) return "distributed_single";
  if (isMultiple) return "local_multiple";
  return "local_single";
}

function buildPatternSummary(features) {
  const parts = [];
  if (features.hasSubstory || features.hasNdsScopePattern) parts.push("spawned sub-story (N)");
  if (features.hasIteratedCumulativeVcu) parts.push("iterated cumulative Vcu*");
  if (features.hasVcuuOrVcuuo) parts.push("Vcuu/Vcuuo comparison");
  if (features.hasIntegratedMultiInputExpr) parts.push("integrated multi-input expression");
  if (features.hasDistributedEmbedding) parts.push("distributed embedding");
  if (features.hasMultipleInputs) parts.push("multiple inputs");
  if (features.hasRepeatedInputRefSteps) parts.push("same-input across steps");
  if (features.hasPersistence) parts.push("persistence span");
  if (features.hasIteration) parts.push("explicit iteration");
  if (features.hasReactionWindows) parts.push("simultaneous reactions");
  if (parts.length === 0) parts.push("single-window local dependency");
  return parts.slice(0, 3).join(" + ");
}

function buildAnalyticalInterpretation(xCategory, yCategory, features) {
  const xText = {
    parametric: "Parametrisch: User wird im bestehenden Daten-/Modellraum positioniert (Default ohne Vcuu/Vcuuo).",
    generative: "Generativ: Vcuu/Vcuuo zeigt nutzeruebergreifend erzeugten/erweiterten Datenraum.",
    // Legacy fallback for previously generated records.
    simulative: "Parametrisch: User wird im bestehenden Daten-/Modellraum positioniert.",
  }[xCategory];
  const yText = {
    local_single: "Y1a Local + Single: ein Input, lokal eingebettet ohne spaetere Wiederaufnahme.",
    local_multiple: "Y1b Local + Multiple: mehrere Inputs, lokal eingebettet und ohne verteilte Wiederaufnahme.",
    distributed_single: "Y2a Distributed + Single: ein Input wird ueber mehrere Segmente wiederverwendet.",
    distributed_multiple: "Y2b Distributed + Multiple: mehrere Inputs mit verteilter Wiederverwendung/Integration.",
  }[yCategory];
  const details = [];
  if (features.hasSubstory || features.hasNdsScopePattern) details.push("N-Block erkannt.");
  if (features.hasIteratedCumulativeVcu) details.push("Iteration + kumulative Vcu*-Referenz erkannt.");
  if (features.hasVcuuOrVcuuo) details.push("Vcuu/Vcuuo als generativer Marker erkannt.");
  if (features.hasIntegratedMultiInputExpr) details.push("Integrated badge: Multi-Input-Argument erkannt.");
  return [xText, yText, ...details].join(" ");
}

function buildKeyFeatures(features) {
  const rows = [];
  rows.push(`frames: ${features.frameCount}`);
  rows.push(`distinct inputs: ${features.inputCount}`);
  rows.push(`notation input ids: ${features.inputCountByNotation}`);
  if (features.hasIteration) rows.push("explicit iteration block");
  if (features.hasRange) rows.push("structural range/abbreviation");
  if (features.hasReactionWindows) rows.push("reaction window (comma group)");
  if (features.hasPersistence) rows.push("persistence span");
  if (features.hasSubstory || features.hasNdsScopePattern) rows.push("spawned sub-story (N)");
  if (features.hasMultipleInputs) rows.push("multiple input set");
  if (features.hasDistributedEmbedding) rows.push("distributed embedding");
  if (features.hasIntegratedMultiInputExpr) rows.push("Integrated");
  if (features.hasRepeatedInputRefSteps) rows.push("same input referenced across multiple steps");
  if (features.hasIteratedCumulativeVcu) rows.push("iterated cumulative Vcu* pattern");
  if (features.hasVcuuOrVcuuo) rows.push("Vcuu/Vcuuo present");
  return rows;
}

function isElementExplicitlyInputDependent(element) {
  if (!element) return false;
  if (element.inputRef != null) return true;
  if (Array.isArray(element.inputRefs) && element.inputRefs.length > 0) return true;
  if (element.dependsOnAccumulatedInputs && element.inputRange) return true;
  return /\(I/i.test(String(element.sourceRaw || element.raw || ""));
}

function extractInputDependentIntegrationLayers(parsed) {
  let hasStory = false;
  let hasAnnotation = false;

  function walkSteps(steps, scopeInputId = null, inNdsScope = false) {
    const list = Array.isArray(steps) ? steps : [];
    for (const step of list) {
      const elements = Array.isArray(step?.elements) ? step.elements : [];
      for (const element of elements) {
        if (!element) continue;
        const raw = String(element.raw || "").trim();

        if (element.type === "NDS_SCOPE" || /^n(?:ds)?$/i.test(raw)) {
          const nestedScope = element.scopeInputId != null && String(element.scopeInputId).trim()
            ? String(element.scopeInputId).trim()
            : scopeInputId;
          walkSteps(element.subSteps, nestedScope, true);
          continue;
        }

        if (element.type === "GROUP_RANGE") {
          walkSteps(element.childrenSteps, scopeInputId, inNdsScope);
          continue;
        }

        const explicitDependency = isElementExplicitlyInputDependent(element);
        const inheritedNdsDependency = !explicitDependency && inNdsScope && scopeInputId != null && String(scopeInputId).trim() !== "";
        if (!explicitDependency && !inheritedNdsDependency) continue;

        if (element.type === "S") hasStory = true;
        if (element.type === "A") hasAnnotation = true;
      }
    }
  }

  walkSteps(parsed?.steps || [], null, false);
  return {
    hasStoryInputDependency: hasStory,
    hasAnnotationInputDependency: hasAnnotation,
  };
}

function extractVisualizationTypes(parsed, features) {
  const found = new Set();
  const allowed = new Set(["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo"]);

  function normalizeResponseAction(candidate) {
    const raw = String(candidate || "").trim();
    if (!raw) return "";
    if (raw === "Vc") return "Vcu";
    return raw;
  }

  function extractResponseAction(element) {
    const visAction = normalizeResponseAction(element?.visAction);
    if (allowed.has(visAction)) return visAction;

    const raw = String(element?.raw || "").trim();
    const normalizedRaw = raw.replace(/[₀₁₂₃₄₅₆₇₈₉ₙ]/g, (ch) => ({
      "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
      "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₙ": "n",
    }[ch] || ch));
    const m = normalizedRaw.match(/^V(?:\d+|n)?([A-Za-z]+)$/);
    if (!m) return "";
    const parsed = normalizeResponseAction(`V${m[1]}`);
    return allowed.has(parsed) ? parsed : "";
  }

  function walkSteps(steps, scopeInputId = null, inNdsScope = false) {
    const list = Array.isArray(steps) ? steps : [];
    for (const step of list) {
      const elements = Array.isArray(step?.elements) ? step.elements : [];
      for (const element of elements) {
        if (!element) continue;
        const raw = String(element.raw || "").trim();

        if (element.type === "NDS_SCOPE" || /^n(?:ds)?$/i.test(raw)) {
          found.add("N");
          const nestedScope = element.scopeInputId != null && String(element.scopeInputId).trim()
            ? String(element.scopeInputId).trim()
            : scopeInputId;
          walkSteps(element.subSteps, nestedScope, true);
          continue;
        }

        if (element.type === "GROUP_RANGE") {
          walkSteps(element.childrenSteps, scopeInputId, inNdsScope);
          continue;
        }

        if (element.type !== "V") continue;

        const responseAction = extractResponseAction(element);
        if (!responseAction) continue;

        const explicitDependency = isElementExplicitlyInputDependent(element);
        const inheritedNdsDependency = !explicitDependency && inNdsScope && scopeInputId != null && String(scopeInputId).trim() !== "";
        if (explicitDependency || inheritedNdsDependency || !inNdsScope) {
          found.add(responseAction);
        }
      }
    }
  }

  walkSteps(parsed?.steps || [], null, false);
  if (features?.hasSubstory || features?.hasNdsScopePattern) {
    found.add("N");
  }
  const order = ["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo", "N"];
  return order.filter((k) => found.has(k));
}

function extractNarrativeLayers(parsed) {
  let hasVisualization = false;
  let hasAnnotation = false;
  let hasStory = false;

  function walkSteps(steps, scopeInputId = null, inNdsScope = false) {
    const list = Array.isArray(steps) ? steps : [];
    for (const step of list) {
      const elements = Array.isArray(step?.elements) ? step.elements : [];
      for (const element of elements) {
        if (!element) continue;
        const raw = String(element.raw || "").trim();

        if (element.type === "NDS_SCOPE" || /^n(?:ds)?$/i.test(raw)) {
          const nestedScope = element.scopeInputId != null && String(element.scopeInputId).trim()
            ? String(element.scopeInputId).trim()
            : scopeInputId;
          walkSteps(element.subSteps, nestedScope, true);
          continue;
        }

        if (element.type === "GROUP_RANGE") {
          walkSteps(element.childrenSteps, scopeInputId, inNdsScope);
          continue;
        }

        const explicitDependency = isElementExplicitlyInputDependent(element);
        const inheritedNdsDependency = !explicitDependency && inNdsScope && scopeInputId != null && String(scopeInputId).trim() !== "";
        if (!explicitDependency && !inheritedNdsDependency) continue;

        if (element.type === "V") hasVisualization = true;
        if (element.type === "A") hasAnnotation = true;
        if (element.type === "S") hasStory = true;
      }
    }
  }

  walkSteps(parsed?.steps || [], null, false);
  const layers = [];
  if (hasVisualization) layers.push("visualization");
  if (hasAnnotation) layers.push("annotation");
  if (hasStory) layers.push("story");
  return layers.slice(0, 3);
}

function buildMatrixRecord(article, parsed, structured, layout) {
  const features = detectStructuralFeatures(article, parsed, structured, layout);
  let xCategory = classifyEpistemicMode(features);
  // Project-specific exception: Z31 is treated as "creating new data"
  // although input is surfaced annotation-only.
  if (String(article?.id || "").trim() === "Z31") {
    xCategory = "generative";
  }
  const yCategory = classifyStructuralDepth(features);
  const visualizationTypes = extractVisualizationTypes(parsed, features);
  const narrativeLayers = extractNarrativeLayers(parsed);
  const inputDependentLayers = extractInputDependentIntegrationLayers(parsed);
  const meta = article.meta && typeof article.meta === "object" ? article.meta : null;
  const englishTitle = String(
    article["english-title"] ||
    article.english_title ||
    article.title_en ||
    article.titleEnglish ||
    article.translated_title ||
    article.translation_en ||
    (meta && (
      meta["english-title"] ||
      meta.english_title ||
      meta.title_en ||
      meta.title_english ||
      meta["English title"] ||
      meta["English Title"] ||
      meta["Title (English)"] ||
      meta.translated_title ||
      meta["Translated title"] ||
      meta["Translated Title"]
    )) ||
    ""
  ).trim();
  const sourceUrl = String(
    article.original_url ||
    article.url ||
    article.link ||
    (meta && (meta.URL || meta.url || meta.link || meta["Source URL"])) ||
    ""
  ).trim();
  const newsOrg = String(
    article.news_org ||
    article.newsOrg ||
    article.publisher ||
    (meta && (meta["News-outlet"] || meta["News outlet"] || meta["News-Orga"] || meta["News Orga"] || meta.Publisher || meta.Outlet || meta.Medium)) ||
    ""
  ).trim();
  return {
    article_id: article.id,
    asset_id: toSafeSvgBaseName(article.id),
    title: article.title || article.id,
    english_title: englishTitle || undefined,
    meta: meta || undefined,
    original_url: sourceUrl || undefined,
    news_org: newsOrg || undefined,
    x_category: xCategory,
    y_category: yCategory,
    integrated_badge: Boolean(features.hasIntegratedMultiInputExpr),
    visualization_types: visualizationTypes,
    narrative_layers: narrativeLayers,
    has_input_dependent_story: Boolean(inputDependentLayers.hasStoryInputDependency),
    has_input_dependent_annotation: Boolean(inputDependentLayers.hasAnnotationInputDependency),
    structural_pattern_summary: buildPatternSummary(features),
    notation_string: String(article.notation || ""),
    analytical_interpretation: buildAnalyticalInterpretation(xCategory, yCategory, features),
    key_structural_features: buildKeyFeatures(features),
  };
}

async function writeGallery(outDir, metrics, allowedIds = null) {
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  let svgFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    const allowed = new Set(allowedIds.map((id) => `${toSafeSvgBaseName(id)}.svg`.toLowerCase()));
    svgFiles = svgFiles.filter((fileName) => allowed.has(fileName.toLowerCase()));
  }

  const cards = svgFiles
    .map((fileName) => {
      const title = fileName.replace(/\.svg$/i, "");
      return `
        <article class="card">
          <h2>${escapeHtml(title)}</h2>
          <div class="svg-wrap">
            <object type="image/svg+xml" data="${encodeURI(fileName)}" aria-label="${escapeHtml(title)}"></object>
          </div>
        </article>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SVG Vertical Gallery</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f5f6f8;
      color: #111;
    }
    header {
      padding: 14px 18px;
      border-bottom: 1px solid #ddd;
      background: #fff;
      position: sticky;
      top: 0;
    }
    .gallery {
      display: flex;
      flex-wrap: nowrap;
      gap: 14px;
      overflow-x: auto;
      padding: 16px;
      align-items: flex-start;
    }
    .card {
      flex: 0 0 ${metrics.galleryCardWidth}px;
      background: #fff;
      border: 1px solid #d7dbe0;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }
    .card h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .svg-wrap {
      width: 100%;
      height: ${metrics.gallerySvgHeight}px;
      overflow: auto;
      border: 1px solid #eef1f4;
      border-radius: 6px;
      background: #fff;
    }
    .card object {
      width: max-content;
      height: max-content;
      display: block;
    }
  </style>
</head>
<body>
  <header><strong>SVG Vertical Gallery</strong> (${svgFiles.length} files)</header>
  <main class="gallery">${cards}</main>
</body>
</html>`;

  await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getRecordEnglishTitle(record) {
  if (!record || typeof record !== "object") return "";
  const meta = record.meta && typeof record.meta === "object" ? record.meta : null;
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
    if (text) return text;
  }
  return "";
}

function getRecordNewsOrganization(record, articleSourcesById = {}) {
  if (!record || typeof record !== "object") return "";
  const articleId = String(record.article_id || "").trim();
  const source = articleSourcesById[articleId] || {};
  const meta = record.meta && typeof record.meta === "object" ? record.meta : {};
  const candidates = [
    source.news_org,
    record.news_org,
    record.newsOrg,
    record.publisher,
    meta["News-outlet"],
    meta["News outlet"],
    meta["News-Orga"],
    meta["News Orga"],
    meta.Publisher,
    meta.Outlet,
    meta.Medium,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) return text;
  }
  return "";
}

function getRecordSourceUrl(record, articleSourcesById = {}) {
  if (!record || typeof record !== "object") return "";
  const articleId = String(record.article_id || "").trim();
  const source = articleSourcesById[articleId] || {};
  const meta = record.meta && typeof record.meta === "object" ? record.meta : {};
  const candidates = [
    source.url,
    record.original_url,
    record.url,
    record.link,
    meta.URL,
    meta.url,
    meta.link,
    meta["Source URL"],
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (/^https?:\/\//i.test(text)) return text;
  }
  return "";
}

function getRecordDate(record) {
  if (!record || typeof record !== "object") return "";
  const meta = record.meta && typeof record.meta === "object" ? record.meta : {};
  return String(meta.Date || meta.Datum || "").trim();
}

function articleIdSortValue(articleId) {
  const raw = String(articleId || "").trim();
  const match = raw.match(/^([A-Za-z]+)(\d+)$/);
  const prefixOrder = new Map([
    ["BL", 1],
    ["FI", 2],
    ["GR", 3],
    ["GU", 4],
    ["PU", 5],
    ["SP", 6],
    ["WA", 7],
    ["ZE", 8],
  ]);
  if (!match) return { rank: Number.MAX_SAFE_INTEGER, prefix: raw, index: Number.MAX_SAFE_INTEGER };
  const prefix = String(match[1]).toUpperCase();
  const index = Number.parseInt(match[2], 10);
  const rank = prefixOrder.has(prefix) ? prefixOrder.get(prefix) : Number.MAX_SAFE_INTEGER - 1;
  return { rank, prefix, index: Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER };
}

async function writeArticleListPage(matrixOutDir, records, articleSourcesById = {}) {
  const rows = (Array.isArray(records) ? records : [])
    .map((record) => {
      const articleId = String(record?.article_id || "").trim();
      if (!articleId) return null;
      const originalTitle = String(record?.title || "").trim();
      const englishCandidate = getRecordEnglishTitle(record);
      const englishTitle = englishCandidate || originalTitle;
      const hasDistinctOriginal =
        Boolean(englishCandidate) &&
        normalizeComparableTitle(englishCandidate) !== normalizeComparableTitle(originalTitle);
      const sourceUrl = getRecordSourceUrl(record, articleSourcesById);
      const newsOrg = getRecordNewsOrganization(record, articleSourcesById);
      return {
        articleId,
        englishTitle,
        originalTitle: hasDistinctOriginal ? originalTitle : "—",
        newsOrg,
        sourceUrl,
        date: getRecordDate(record),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const sa = articleIdSortValue(a.articleId);
      const sb = articleIdSortValue(b.articleId);
      if (sa.rank !== sb.rank) return sa.rank - sb.rank;
      if (sa.prefix !== sb.prefix) return sa.prefix.localeCompare(sb.prefix);
      if (sa.index !== sb.index) return sa.index - sb.index;
      return a.articleId.localeCompare(b.articleId, undefined, { numeric: true, sensitivity: "base" });
    });

  const tableRows = rows.map((row) => {
    const publisherCell = row.sourceUrl
      ? `<a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.newsOrg || "Source")}</a>`
      : escapeHtml(row.newsOrg || "—");
    return `
      <tr>
        <td><code>${escapeHtml(row.articleId)}</code></td>
        <td>${escapeHtml(row.englishTitle || "—")}</td>
        <td>${escapeHtml(row.originalTitle || "—")}</td>
        <td>${publisherCell}</td>
        <td>${escapeHtml(row.date || "—")}</td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Articles List</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1f2937;
      background: #ffffff;
      line-height: 1.45;
    }
    .wrap {
      max-width: 1280px;
      margin: 0 auto;
      padding: 22px 20px 30px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.2;
      color: #0f172a;
    }
    .meta {
      margin: 0 0 16px;
      font-size: 13px;
      color: #475569;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 14px;
      font-size: 13px;
      color: #1e40af;
      text-decoration: none;
      border-bottom: 1px solid #93c5fd;
    }
    .back-link:hover { border-bottom-color: #1e40af; }
    .table-wrap {
      border: 1px solid #dbe2ea;
      border-radius: 10px;
      overflow: auto;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 920px;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      text-align: left;
      font-size: 12px;
      letter-spacing: 0.02em;
      color: #334155;
      background: #f8fafc;
      border-bottom: 1px solid #dbe2ea;
      padding: 10px 12px;
      white-space: nowrap;
    }
    tbody td {
      border-top: 1px solid #eef2f7;
      padding: 10px 12px;
      vertical-align: top;
      font-size: 13px;
      color: #1f2937;
    }
    tbody tr:hover td {
      background: #f9fbff;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 999px;
      background: #eef2f7;
      color: #1f2937;
      font-weight: 700;
    }
    a {
      color: #1e40af;
      text-decoration: none;
      border-bottom: 1px solid #93c5fd;
    }
    a:hover { border-bottom-color: #1e40af; }
  </style>
</head>
<body>
  <main class="wrap">
    <a class="back-link" href="../index.html">← Back to matrix</a>
    <h1>Articles List</h1>
    <p class="meta">Mapping from paper article IDs to source publications (${rows.length} stories).</p>
    <div class="table-wrap">
      <table aria-label="Article mapping list">
        <thead>
          <tr>
            <th>ID</th>
            <th>English title</th>
            <th>Original title</th>
            <th>News publisher</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`;

  const targetDir = path.join(matrixOutDir, "articles");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "index.html"), html, "utf-8");
}

async function writeMatrix(outDir, records) {
  await fs.mkdir(outDir, { recursive: true });
  const dataPath = path.join(outDir, "matrix-data.json");
  await fs.writeFile(dataPath, JSON.stringify(records, null, 2), "utf-8");
  const articleSources = {};
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const articleId = String(record.article_id || "").trim();
    if (!articleId) continue;
    const meta = record.meta && typeof record.meta === "object" ? record.meta : {};
    const newsOrg =
      String(
        record.news_org ||
        record.newsOrg ||
        meta["News-outlet"] ||
        meta["News outlet"] ||
        meta["News-Orga"] ||
        meta["News Orga"] ||
        meta.Publisher ||
        meta.Outlet ||
        ""
      ).trim();
    const url =
      String(
        record.original_url ||
        record.URL ||
        record.url ||
        record.link ||
        meta.URL ||
        meta.url ||
        meta.link ||
        ""
      ).trim();
    articleSources[articleId] = { news_org: newsOrg, url };
  }
  await fs.writeFile(path.join(outDir, "article-sources.json"), JSON.stringify(articleSources, null, 2), "utf-8");

  const legendDir = path.join(outDir, "legend");
  await fs.mkdir(legendDir, { recursive: true });
  const legendExamples = [
    { id: "legend-input-i1", notation: "I₁" },
    { id: "legend-input-i2", notation: "I₂" },
    { id: "legend-vu-i1", notation: "Vu(I₁)" },
    { id: "legend-vu-i12", notation: "Vu(I₁, I₂)" },
    { id: "legend-persistence", notation: "⟦V₁, A(I₁)⟧ → S → V₁h(I₁) → (¬V₁), (¬A(I₁))" },
    { id: "legend-repetition", notation: "(S → V)₁…₄" },
  ];
  for (const ex of legendExamples) {
    try {
      const parsed = parseNotation(ex.notation);
      const structured = buildStructure(parsed, ex.id);
      const layout = await buildLayout(structured);
      await writeSVG(layout, legendDir);
    } catch (err) {
      console.warn(`[legend] failed to render example ${ex.id}: ${err.message}`);
    }
  }

  const articleGlyphPath = path.resolve(__dirname, "../../design/glyphs/article.svg");
  let articleGlyphTemplate = "";
  try {
    articleGlyphTemplate = await fs.readFile(articleGlyphPath, "utf-8");
    articleGlyphTemplate = articleGlyphTemplate.replace(/\r\n/g, "\n");
  } catch (err) {
    console.warn(`[matrix] failed to load article glyph (${articleGlyphPath}): ${err.message}`);
    articleGlyphTemplate = "";
  }
  const inputGlyphPath = path.resolve(__dirname, "../../design/glyphs/I.svg");
  let inputGlyphTemplate = "";
  try {
    inputGlyphTemplate = await fs.readFile(inputGlyphPath, "utf-8");
    inputGlyphTemplate = inputGlyphTemplate.replace(/\r\n/g, "\n");
  } catch (err) {
    console.warn(`[matrix] failed to load input glyph (${inputGlyphPath}): ${err.message}`);
    inputGlyphTemplate = "";
  }
  const safeJson = JSON.stringify(records).replace(/</g, "\\u003c");
  const safeArticleGlyphTemplate = JSON.stringify(articleGlyphTemplate).replace(/</g, "\\u003c");
  const safeInputGlyphTemplate = JSON.stringify(inputGlyphTemplate).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Input Story Design Space</title>
  <style>
    :root {
      --text-strong:#111827;
      --text-default:#1f2937;
      --text-muted:#6b7280;
      --line:#e5e7eb;
      --line-strong:#cfd4dc;
      --accent-orange-rgb:249,115,22;
      --axis-label-size:16px;
      --axis-label-weight:600;
      --axis-label-letter-spacing:0;
      --h1-size:34px;
      --h2-size:30px;
      --h3-size:18px;
      --body-size:14px;
      --line-height:1.5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background:#fff;
      color:var(--text-default);
      font-size:var(--body-size);
      line-height:var(--line-height);
    }
    h1, h2, h3 { margin:0; color:var(--text-strong); line-height:1.2; }
    .title-h1 { font-size:var(--h1-size); font-weight:800; margin-bottom:32px; letter-spacing:-0.01em; }
    .title-h2 { font-size:var(--h2-size); font-weight:700; margin-bottom:16px; letter-spacing:-0.005em; }
    .title-h3 { font-size:var(--h3-size); font-weight:600; margin-top:24px; margin-bottom:12px; }
    .body-text { font-size:var(--body-size); line-height:var(--line-height); color:var(--text-default); }
    .site-header {
      padding: 14px 22px 10px;
      background:#fff;
      border-bottom:1px solid var(--line);
    }
    .site-header-row {
      display: flex;
      align-items: baseline;
      justify-content: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .site-header h1 {
      margin: 0;
      font-size: 40px;
      font-weight: 700;
      line-height: 1.16;
      color:#0f172a;
      letter-spacing:-0.01em;
    }
    .site-header-link {
      color: #1f4ea8;
      text-decoration: none;
      border-bottom: 1px solid #9db7e8;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .site-header-link:hover {
      border-bottom-color: #1f4ea8;
    }
    .wrap {
      display:grid;
      grid-template-columns: minmax(520px, 620px) minmax(0, 1fr) minmax(320px, 360px);
      gap:24px;
      padding:64px 22px 24px;
      align-items:start;
    }
    .wrap.legend-collapsed {
      grid-template-columns: minmax(520px, 620px) minmax(0, 1fr) 56px;
      gap:24px;
    }
    .panel { background:transparent; border:none; border-radius:0; padding:0; min-width:0; }
    .matrix { position:relative; width:100%; max-width:340px; aspect-ratio: 1/1; border:none; border-radius:0; background:transparent; overflow:visible; margin:2px 0; }
    .grid { position:absolute; inset:0; display:grid; grid-template-columns:repeat(2,1fr); grid-template-rows:repeat(2,1fr); }
    .cell { position:relative; border-right:1px solid transparent; border-bottom:1px solid transparent; padding:10px 10px 10px; cursor:pointer; }
    .cell:nth-child(2n){ border-right:none; }
    .cell:nth-child(n+3){ border-bottom:none; }
    .cell .count { position:absolute; top:10px; right:10px; font-size:32px; line-height:1; font-weight:500; color:rgba(107,114,128,0.7); }
    .cell:nth-child(-n+2) .count { top:2px; }
    .cell:nth-child(n+3) .count { top:8px; }
    .cell[data-x="local"][data-y="parametric"] .count {
      text-decoration-line: underline;
      text-decoration-color: #4aff00;
      text-decoration-thickness: 3px;
      text-underline-offset: 2px;
    }
    .cell[data-x="distributed"][data-y="parametric"] .count {
      text-decoration-line: underline;
      text-decoration-color: #ff00e6;
      text-decoration-thickness: 3px;
      text-underline-offset: 2px;
    }
    .cell[data-x="local"][data-y="generative"] .count {
      text-decoration-line: underline;
      text-decoration-color: #ff7035;
      text-decoration-thickness: 3px;
      text-underline-offset: 2px;
    }
    .cell[data-x="distributed"][data-y="generative"] .count {
      text-decoration-line: underline;
      text-decoration-color: #00ffd9;
      text-decoration-thickness: 3px;
      text-underline-offset: 2px;
    }
    .cell.active { background:#d6e0eb !important; }
    .points-layer { position:absolute; inset:0; pointer-events:none; }
    .point {
      position:absolute;
      width:22px;
      height:22px;
      border-radius:4px;
      border:none;
      pointer-events:auto;
      cursor:pointer;
      background:transparent;
      padding:0;
      overflow:hidden;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .point-icon {
      width:100%;
      height:100%;
      display:block;
      object-fit:contain;
      pointer-events:none;
    }
    .point-icon.overview-plus {
      filter:none;
    }
    .point.selected {
      opacity:1 !important;
      z-index:5;
    }
    .point.selected[data-point-mode="overview"],
    .point.selection-match[data-point-mode="overview"] {
      background-color:transparent !important;
      background-image:none !important;
      border:none !important;
      box-shadow:none !important;
    }
    .axis-x, .axis-y { font-size:var(--axis-label-size); color:#111827; font-weight:var(--axis-label-weight); letter-spacing:var(--axis-label-letter-spacing); }
    .axis-x { display:grid; grid-template-columns:repeat(2,1fr); gap:6px; margin-top:8px; text-align:center; }
    .axis-y { position:absolute; left:42px; top:0; bottom:0; width:82px; display:grid; grid-template-rows:repeat(2,1fr); align-items:center; text-align:left; padding-right:0; }
    .matrix-shell { position:relative; margin:0 auto; width:max-content; padding-left:128px; }
    .matrix-shell.fig1 {
      margin: 0 auto;
      padding-left: 132px;
    }
    .axis-question-top {
      text-align:center;
      margin:0 0 8px;
      width:340px;
      font-size:13px;
      font-weight:600;
      color:var(--text-muted);
      line-height:1.35;
      letter-spacing:0.02em;
    }
    .axis-x-top { display:grid; grid-template-columns:repeat(2, 170px); gap:0; width:340px; margin:0 0 6px; text-align:left; justify-items:start; font-size:var(--axis-label-size); font-weight:var(--axis-label-weight); letter-spacing:var(--axis-label-letter-spacing); color:#111827; }
    .axis-x-top > div { padding-left: 0; text-align:left; }
    .axis-question-y {
      position:absolute;
      left:4px;
      top:0;
      bottom:0;
      width:24px;
      display:flex;
      align-items:center;
      justify-content:center;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size:13px;
      font-weight:600;
      color:var(--text-muted);
      letter-spacing:0.02em;
      line-height:1.35;
      text-align:center;
    }
    .axis-y.fig1-y {
      left:30px;
      width:104px;
      font-size:14px;
      font-weight:600;
      color:#111827;
      gap:10px;
      line-height:1.25;
    }
    .matrix-plain {
      border:none;
      border-radius:0;
      background:transparent;
      overflow:visible;
    }
    .matrix-plain .cell {
      border-right:2px solid #5f6774;
      border-bottom:2px solid #5f6774;
    }
    .matrix-plain .cell:nth-child(2n){ border-right:none; }
    .matrix-plain .cell:nth-child(n+3){ border-bottom:none; }
    .matrix-guide .cell {
      border-right:1px solid var(--line-strong);
      border-bottom:1px solid var(--line-strong);
    }
    .matrix-guide .cell:nth-child(2n){ border-right:none; }
    .matrix-guide .cell:nth-child(n+3){ border-bottom:none; }
    .matrix-title { margin: 54px 0 16px 150px; font-size:28px; font-weight:700; color:#111827; }
    .matrix-legend { margin-top:10px; display:flex; gap:12px; justify-content:flex-end; font-size:11px; color:#6b7280; }
    .matrix-shell.fig1 .matrix-legend { width:100%; margin-left:0; justify-content:flex-end; gap:10px; }
    .matrix-legend.is-hidden { display:none !important; }
    #matrix-legend-layer {
      justify-content: flex-start;
    }
    .matrix-legend-prefix { font-size:11px; color:#6b7280; font-weight:600; }
    .matrix-view-toggle {
      margin-top:6px;
      display:flex;
      justify-content:flex-end;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
    }
    .matrix-view-toggle button {
      border:1px solid #cfd4dc;
      background:#fff;
      color:#344054;
      border-radius:6px;
      padding:5px 10px;
      font-size:12px;
      cursor:pointer;
    }
    .matrix-view-toggle button.active {
      border-color:#5f6774;
      color:#111827;
      font-weight:600;
      background:#f7f8fa;
    }
    .matrix-export-btn {
      border:1px solid #cfd4dc;
      background:#fff;
      color:#344054;
      border-radius:6px;
      padding:5px 10px;
      font-size:12px;
      cursor:pointer;
      margin-left:2px;
    }
    .matrix-export-btn:hover {
      background:#f7f8fa;
      border-color:#aebed1;
      color:#111827;
    }
    .matrix-caption {
      position:absolute;
      left:0;
      top:0;
      width:138px;
      margin:0;
      font-size:11px;
      color:#6b7280;
      text-transform:uppercase;
      letter-spacing:0.08em;
      line-height:1.35;
      font-weight:600;
      pointer-events:none;
    }
    .matrix-caption-key {
      text-decoration:underline;
      text-underline-offset:2px;
    }
    .legend-item { display:flex; align-items:center; gap:6px; }
    .legend-swatch { width:14px; height:14px; border-radius:2px; border:1px solid #7f8792; }
    .filter-panel { margin-top:22px; border-top:1px solid var(--line); padding-top:14px; }
    .filter-head { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .filter-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px 10px; font-size:12px; margin-bottom:8px; }
    .filter-grid label { display:flex; align-items:center; gap:6px; white-space:nowrap; }
    .toggle-group { display:flex; gap:10px; margin-bottom:10px; }
    .toggle-group button { border:none; background:transparent; padding:0; border-radius:0; cursor:pointer; font-size:12px; color:#6b7280; text-decoration:underline; text-underline-offset:2px; }
    .toggle-group button.active { color:#111827; font-weight:600; }
    .search-row { display:flex; gap:8px; margin-bottom:8px; }
    .search-row input { flex:1; border:1px solid #c8cdd5; border-radius:8px; padding:6px 8px; font-size:12px; }
    .search-row button { border:1px solid #d1d5db; background:#fff; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:12px; color:#374151; }
    .count-grid { display:none; }
    .count-chip { display:none; }
    .list { margin-top:6px; max-height:220px; overflow:auto; border-top:1px solid var(--line); padding-top:10px; }
    .list.list-bottom { max-height:280px; }
    .list-item { padding:6px 0; border-bottom:1px solid #f0f2f6; }
    .list-item a { color:#0f62fe; text-decoration:none; cursor:pointer; }
    .summary { font-size:12px; color:#555; }
    .detail { padding:0; }
    .detail-header {
      padding-bottom:14px;
      margin-bottom:10px;
      border-bottom:1px solid var(--line);
    }
    .case-label {
      font-size:11px;
      color:#6b7280;
      text-transform:uppercase;
      letter-spacing:0.08em;
      font-weight:600;
      margin-bottom:6px;
    }
    .detail-title {
      font-size:var(--axis-label-size);
      font-weight:var(--axis-label-weight);
      line-height:1.2;
      margin:0 0 8px;
      color:#111827;
      letter-spacing:var(--axis-label-letter-spacing);
      max-width:24ch;
      text-wrap:balance;
      overflow-wrap:anywhere;
    }
    .detail-left-title .detail-title {
      text-decoration-line:underline;
      text-decoration-color:var(--detail-title-underline-color, rgb(var(--accent-orange-rgb)));
      text-decoration-thickness:2px;
      text-underline-offset:2px;
    }
    .detail-subtitle {
      margin:0;
      font-size:13px;
      line-height:1.35;
      color:#6b7280;
      font-weight:500;
      max-width:28ch;
      text-wrap:balance;
      overflow-wrap:anywhere;
    }
    .detail-meta-row {
      margin-top:8px;
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
    }
    .source-link {
      font-size:12px;
      color:#1f4ea8;
      text-decoration:none;
      border-bottom:1px solid #9db7e8;
      font-weight:600;
    }
    .source-link:hover { border-bottom-color:#1f4ea8; }
    .source-text {
      font-size:12px;
      color:#64748b;
      font-weight:600;
    }
    .detail .meta { font-size:13px; color:#556070; margin-bottom:8px; }
    .detail .detail-block { margin-top:16px; }
    .detail .detail-block:first-of-type { margin-top:0; }
    .detail .detail-heading { font-size:17px; font-weight:600; margin:0 0 4px; color:#111827; letter-spacing:0.01em; line-height:1.2; }
    .detail .detail-notation {
      white-space:pre-wrap;
      background:#f7f8fa;
      border:none;
      border-radius:8px;
      padding:10px 12px;
      font-size:13px;
      line-height:1.5;
      color:#1f2937;
      margin:0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    .detail-story-grid {
      display:grid;
      grid-template-columns:minmax(0,1fr) minmax(0,1fr);
      column-gap:24px;
      align-items:start;
      min-width:0;
      max-width:100%;
    }
    .detail-left-stack {
      grid-column:1;
      grid-row:1;
      min-width:0;
      display:flex;
      flex-direction:column;
      align-items:flex-start;
      gap:10px;
    }
    .detail-left-title,
    .detail-left-meta,
    .detail-left-controls {
      min-width:0;
      width:100%;
    }
    .detail-left-meta .detail-meta-row { margin-top:0; }
    .detail-left-controls { padding-top:0; }
    .detail-right-diagram {
      grid-column:2;
      grid-row:1;
      align-self:start;
      justify-self:start;
      min-width:0;
      margin-top:0;
    }
    .detail-left-controls .detail-heading {
      margin-bottom:8px;
    }
    .detail .detail-svg-wrap {
      border:none;
      border-radius:0;
      background:#fff;
      padding:0;
      height:auto;
      width:auto;
      max-width:none;
      max-height:none;
      overflow:visible;
      display:flex;
      justify-content:flex-start;
      align-items:flex-start;
      overscroll-behavior:unset;
      scrollbar-gutter:auto;
    }
    .detail .detail-svg {
      display:block;
      width:auto;
      height:auto;
      max-width:none;
      margin:0;
    }
    .detail-svg-toolbar {
      display:flex;
      align-items:center;
      gap:8px;
      margin:0 0 8px;
    }
    .detail-svg-btn {
      border:1px solid #c9d3df;
      background:#fff;
      color:#1f2937;
      border-radius:6px;
      font-size:12px;
      font-weight:600;
      line-height:1;
      padding:5px 9px;
      cursor:pointer;
    }
    .detail-svg-btn:hover {
      background:#f8fafc;
      border-color:#aebed1;
    }
    .detail-zoom-value {
      font-size:12px;
      color:#64748b;
      font-weight:600;
      min-width:44px;
      text-align:right;
      margin-left:2px;
    }
    .detail-selection-summary {
      font-size:13px;
      color:#475569;
      margin:2px 0 10px;
    }
    .detail-selection-list {
      margin-top:10px;
      border-top:1px solid var(--line);
      max-height:56vh;
      overflow:auto;
      padding-top:8px;
    }
    .detail-selection-item {
      padding:8px 0;
      border-bottom:1px solid #eef2f7;
    }
    .detail-selection-item:last-child {
      border-bottom:none;
    }
    .detail-selection-item a {
      color:#0f62fe;
      text-decoration:none;
      font-size:20px;
      line-height:1.3;
      font-weight:500;
      cursor:pointer;
    }
    .detail-selection-item a:hover {
      text-decoration:underline;
    }
    .detail-selection-empty {
      font-size:13px;
      color:#64748b;
      padding:8px 0;
    }
    @media (max-width: 1280px) {
      .detail-story-grid {
        grid-template-columns:1fr;
        gap:10px;
      }
      .detail-left-stack,
      .detail-right-diagram {
        grid-column:auto;
        grid-row:auto;
      }
      .detail .detail-svg-wrap {
        justify-content:flex-start;
      }
    }
    .detail-collapsible {
      border-top:1px solid var(--line);
      padding-top:10px;
      margin-top:10px;
    }
    .detail-collapsible summary {
      cursor:pointer;
      list-style:none;
      font-size:15px;
      font-weight:600;
      color:#1f2937;
      user-select:none;
      display:flex;
      align-items:center;
      gap:8px;
    }
    .detail-collapsible summary::-webkit-details-marker { display:none; }
    .detail-collapsible summary::before {
      content:"▸";
      font-size:12px;
      color:#64748b;
      transform:translateY(-1px);
    }
    .detail-collapsible[open] summary::before {
      content:"▾";
    }
    .detail-collapsible .detail-notation,
    .detail-collapsible .body-text {
      margin-top:10px;
    }
    .chips { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
    .chip { font-size:11px; padding:3px 7px; border-radius:999px; background:#eef2f7; color:#334; }
    .tooltip { position:fixed; z-index:1000; padding:6px 8px; background:#111; color:#fff; font-size:11px; border-radius:6px; pointer-events:none; max-width:260px; display:none; }
    .point.filtered-match {
      box-shadow:0 0 0 2px var(--filter-accent, rgba(232,93,4,0.55));
      border-color:var(--filter-accent, #e85d04) !important;
    }
    .point.filtered-dim { opacity:0.28; }
    .point.selection-match:not(.filtered-match) { box-shadow:none; opacity:1 !important; }
    .point.selection-dim { opacity:0.52; }
    .left-panel,
    .matrix-panel { min-width: 0; padding-left: 4px; padding-right: 8px; }
    .center-panel { min-width: 0; padding-left: 8px; max-width:100%; overflow:visible; }
    .center-panel > #detail { min-width:0; max-width:100%; }
    .legend-panel {
      position:relative;
      position: sticky;
      top: 8px;
      max-height: calc(100vh - 16px);
      overflow: auto;
      border: none;
      border-radius: 0;
      background: transparent;
      padding: 0 0 0 46px;
      transition: padding-left 0.22s ease;
      min-width:0;
    }
    .legend-panel::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 22px;
      width: 1px;
      background: var(--line);
      z-index: 1;
    }
    .legend-toggle {
      position:absolute;
      left:10px;
      top:50%;
      transform:translateY(-50%);
      width:16px;
      height:108px;
      border:1px solid #1f2a3b;
      border-radius:999px;
      background:#0f172a;
      color:#f8fafc;
      font-size:20px;
      font-weight:700;
      line-height:1;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      box-shadow:0 4px 10px rgba(15,23,42,0.16);
      z-index:4;
      transition:background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .legend-toggle:hover {
      background:#162136;
      border-color:#31455f;
      box-shadow:0 6px 14px rgba(15,23,42,0.22);
    }
    .wrap.legend-collapsed .legend-panel {
      padding-left:0;
      overflow:hidden;
    }
    .wrap.legend-collapsed .legend-panel .legend-content {
      opacity:0;
      transform:translateX(10px);
      pointer-events:none;
    }
    .wrap.legend-collapsed .legend-panel .legend-toggle {
      left:10px;
    }
    .legend-content {
      transition:opacity 0.18s ease, transform 0.18s ease;
    }
    .legend-section { padding: 10px 0 12px; border-bottom: 1px solid var(--line); }
    .legend-section:last-child { border-bottom: none; }
    .legend-head { margin:0 0 8px; }
    .legend-head h3 { margin:0; font-size:30px; line-height:1.15; letter-spacing:0.01em; color:#111827; }
    .legend-head .sub { margin-top:4px; font-size:12px; color:#6b7280; }
    .legend-title { margin:0 0 8px; font-size:15px; font-weight:600; color:#374151; }
    .legend-note { font-size:11px; color:#556070; line-height:1.35; margin-top:6px; }
    .legend-list { margin:0; padding:0; list-style:none; font-size:12px; color:#2c3642; }
    .legend-list li { display:flex; gap:8px; align-items:flex-start; margin:4px 0; }
    .legend-symbol { width:16px; display:inline-block; text-align:center; font-weight:700; color:#1f2937; }
    .legend-gradient { height:14px; border:1px solid #a6afba; border-radius:3px; margin:6px 0; }
    .legend-small { font-size:11px; color:#6b7280; }
    .detail-tag { display:inline-block; font-size:11px; color:#334155; background:#eef2f7; border:1px solid #dde4ee; border-radius:999px; padding:3px 8px; margin-bottom:8px; }
    .detail-meta-extra {
      margin-top:2px;
      display:flex;
      flex-direction:column;
      align-items:flex-start;
      gap:6px;
    }
    .detail-meta-extra .detail-meta-row {
      margin-top:0;
    }
    .detail-meta-extra .detail-tag {
      margin-bottom:0;
    }
    .legend-glyph-list { margin:0; padding:0; list-style:none; }
    .legend-glyph-row { display:flex; align-items:center; gap:8px; margin:5px 0; font-size:13px; color:#1f2937; }
    .legend-glyph { width:20px; height:20px; display:block; object-fit:contain; }
    .legend-indent { margin-left:28px; margin-top:4px; }
    .legend-subtitle { margin:6px 0 2px; font-size:11px; color:#5f6978; font-weight:600; }
    .legend-subitem {
      display:flex;
      gap:12px;
      align-items:center;
      margin:6px 0;
      padding:0;
      font-size:12px;
      color:#27313f;
      background:transparent;
      border:none;
      border-radius:0;
      box-shadow:none;
    }
    .legend-subitem .legend-glyph {
      width:26px;
      height:26px;
      display:inline-block;
      flex:0 0 26px;
      object-fit:contain;
      background:transparent;
      border:none;
      border-radius:0;
      box-shadow:none;
    }
    .legend-symbol-run { display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap; }
    .legend-input-dot { width:10px; height:10px; border-radius:50%; border:1px solid #aab3bf; display:inline-block; }
    .legend-viz-dot { width:14px; height:14px; border-radius:50%; border:1px solid #9ca6b3; display:inline-block; }
    .legend-concept { border:none; border-radius:0; padding:0; margin:14px 0; }
    .legend-mini-stack { display:flex; flex-direction:column; gap:4px; width:24px; }
    .legend-mini-row { display:flex; gap:4px; align-items:center; }
    .legend-collapsible summary { cursor:pointer; font-size:12px; font-weight:600; color:#1f2937; user-select:none; }
    .legend-collapsible[open] summary { margin-bottom:6px; }
    .legend-glyph-mask {
      width:28px;
      height:28px;
      display:inline-block;
      background: var(--legend-fill, #8dd3c7);
      -webkit-mask-image: var(--legend-glyph);
      mask-image: var(--legend-glyph);
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
      flex:0 0 auto;
    }
    .legend-glyph-mask.gradient {
      background: linear-gradient(90deg, #8dd3c7, #bebada);
    }
    .legend-visibility-icons .legend-glyph-mask {
      width:30px;
      height:30px;
      flex:0 0 30px;
    }
    .legend-align-row {
      display:grid;
      grid-template-columns: 92px 1fr;
      align-items:start;
      column-gap:10px;
      margin-top:14px;
    }
    .legend-align-row:first-child { margin-top:0; }
    .legend-icon-cell { min-height:30px; display:flex; align-items:center; justify-content:center; }
    .legend-icon-cell.vertical { flex-direction:column; gap:5px; }
    .legend-icon-cell.horizontal { flex-direction:row; gap:6px; }
    .legend-text-cell { font-size:12px; color:#6b7280; line-height:1.45; margin-top:1px; }
    .legend-text-cell strong { color:#2c3642; font-weight:700; }
    .legend-concept-row {
      display:grid;
      grid-template-columns: 92px 1fr;
      column-gap:10px;
      align-items:start;
    }
    .legend-mini-svg {
      width:92px;
      height:62px;
      border:none;
      display:block;
      object-fit:contain;
      overflow:hidden;
      background:transparent;
    }
    .legend-mini-svg.persistence {
      width:140px;
      height:170px;
    }
    .legend-mini-svg.repetition {
      width:140px;
      height:86px;
    }
    .legend-visibility-row {
      display:grid;
      grid-template-columns: 92px 1fr;
      column-gap:10px;
      align-items:center;
      margin:8px 0;
    }
    .legend-visibility-icons {
      width:92px;
      display:flex;
      align-items:center;
      justify-content:flex-start;
      gap:0;
      min-height:28px;
      overflow:visible;
    }
    .legend-visibility-icons object {
      width:32px;
      height:32px;
      display:block;
      flex:0 0 32px;
      pointer-events:none;
      transform: scale(1.25);
      transform-origin: left center;
    }
    .legend-visibility-icons object + object {
      margin-left: -10px;
    }
    .legend-flow .legend-icon-cell { justify-content:flex-start; }
    .legend-flow .legend-align-row + .legend-align-row { margin-top:24px; }
    .legend-syntax-mini { font-size:11px; color:#303947; line-height:1.35; }
    .legend-syntax-mini .line { display:block; margin:1px 0; white-space:nowrap; }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-row">
      <h1>Integration of User Input in Data Stories</h1>
      <a class="site-header-link" href="./articles/index.html">Articles list</a>
    </div>
  </header>
  <main class="wrap">
    <section class="panel matrix-panel">
      <div class="matrix-shell fig1">
        <div id="matrix-caption" class="matrix-caption"></div>
        <div class="axis-question-top">Narrativ integration of user input</div>
        <div class="axis-x-top">
          <div>Local integration</div>
          <div>Distributed integration</div>
        </div>
        <div class="axis-question-y">Role of user input</div>
        <div class="axis-y fig1-y">
          <div>Positioning oneself within<br>existing data</div>
          <div>Creating new<br>data</div>
        </div>
        <div class="matrix matrix-plain" id="matrix">
          <div class="grid" id="grid"></div>
          <div class="points-layer" id="points"></div>
        </div>
        <div id="matrix-legend-overview" class="matrix-legend is-hidden"></div>
        <div id="matrix-legend-input" class="matrix-legend is-hidden">
          <div class="legend-item"><span id="legend-single" class="legend-swatch"></span><span>Single Input</span></div>
          <div class="legend-item"><span id="legend-multiple" class="legend-swatch"></span><span>Multiple Inputs</span></div>
        </div>
        <div id="matrix-legend-layer" class="matrix-legend is-hidden">
          <div class="matrix-legend-prefix">Narrative depth:</div>
          <div class="legend-item"><span id="legend-depth-1" class="legend-swatch"></span><span>Single-layer integration</span></div>
          <div class="legend-item"><span id="legend-depth-2" class="legend-swatch"></span><span>Dual</span></div>
          <div class="legend-item"><span id="legend-depth-3" class="legend-swatch"></span><span>Triple</span></div>
        </div>
        <div class="matrix-view-toggle">
          <button id="matrix-view-overview" class="active" type="button">Overview</button>
          <button id="matrix-view-input" type="button">Input Count</button>
          <button id="matrix-view-depth" type="button">Narrative Depth</button>
        </div>
      </div>
      <div class="filter-panel">
        <div class="filter-head">
          <span class="title-h3" style="margin:0;">Visualization Type Filter</span>
          <span id="articles-count" class="summary"></span>
        </div>
        <div class="toggle-group">
          <button id="logic-and" class="active">AND</button>
          <button id="logic-or">OR</button>
        </div>
        <div id="viz-filter-grid" class="filter-grid"></div>
        <div class="search-row">
          <input id="title-search" type="text" placeholder="Search article title">
          <button id="clear-viz-filters">Clear Filters</button>
        </div>
        <div id="viz-count-grid" class="count-grid"></div>
      </div>
      <div class="filter-panel">
        <div class="filter-head">
          <span class="title-h3" style="margin:0;">Articles</span>
        </div>
        <div class="list list-bottom" id="cell-list"></div>
      </div>
    </section>
    <section class="panel detail center-panel">
      <div id="detail">
        <div class="detail-header">
          <div class="case-label">Details of Input Data Stories</div>
          <h2 class="detail-title">Select a data story</h2>
          <div class="meta">Click an article in the matrix to view detailed information.</div>
        </div>
      </div>
    </section>
    <aside class="panel legend-panel">
      <button id="legend-toggle" class="legend-toggle" aria-expanded="true" aria-label="Collapse legend" title="Collapse legend">›</button>
      <div id="legend-content" class="legend-content">
      <div class="legend-head">
        <h3>Legend</h3>
        <div class="sub">Visual Syntax of User Input in Data Stories</div>
      </div>
      <div class="legend-section">
        <h4 class="legend-title">Narrative Elements</h4>
        <div class="legend-small">Shapes represent structural narrative components.</div>
        <ul class="legend-glyph-list">
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/S.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/S.svg'" alt="Story glyph"><span>Story</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/A.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/A.svg'" alt="Annotation glyph"><span>Annotation</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/I.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/I.svg'" data-legend-tone="input" data-glyph-primary="../design/glyphs/I.svg" data-glyph-fallback="../../../design/glyphs/I.svg" alt="Input glyph"><span>User Input</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/Nds.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Nds.svg'" alt="N glyph"><span>Data Story</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/V.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/V.svg'" alt="Visualization glyph"><span>Visualization</span></li>
        </ul>
        <div class="legend-indent">
          <div class="legend-subtitle">How User Input gets visible</div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vh.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vh.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vh.svg" data-glyph-fallback="../../../design/glyphs/Vh.svg" alt="Highlight glyph"><span>Highlight in visualization</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vu.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vu.svg" data-glyph-fallback="../../../design/glyphs/Vu.svg" alt="Update glyph"><span>Update in visualization</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vz.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vz.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vz.svg" data-glyph-fallback="../../../design/glyphs/Vz.svg" alt="Zoom glyph"><span>Zoom in visualization</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcu.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vcu.svg" data-glyph-fallback="../../../design/glyphs/Vcu.svg" alt="Comparison glyph"><span>Comparison user vs herself</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuu.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vcuu.svg" data-glyph-fallback="../../../design/glyphs/Vcuu.svg" alt="User vs users glyph"><span>Comparison user vs users</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuo.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuo.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vcuo.svg" data-glyph-fallback="../../../design/glyphs/Vcuo.svg" alt="User vs official glyph"><span>Comparison user vs official</span></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuuo.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuuo.svg'" data-legend-tone="input-visible" data-glyph-primary="../design/glyphs/Vcuuo.svg" data-glyph-fallback="../../../design/glyphs/Vcuuo.svg" alt="User vs users vs official glyph"><span>Comparison user vs users vs official</span></div>
        </div>
      </div>
      <div class="legend-section">
        <h4 class="legend-title">Visibility of User Input by color</h4>
        <div class="legend-visibility-row">
          <div class="legend-visibility-icons">
            <object type="image/svg+xml" data="./legend/legend-input-i1.svg"></object>
          </div>
          <div class="legend-text-cell">Concrete User Input</div>
        </div>
        <div class="legend-visibility-row">
          <div class="legend-visibility-icons">
            <object type="image/svg+xml" data="./legend/legend-input-i1.svg"></object>
            <object type="image/svg+xml" data="./legend/legend-vu-i1.svg"></object>
          </div>
          <div class="legend-text-cell">Visualization is updated based on User Input</div>
        </div>
        <div class="legend-visibility-row">
          <div class="legend-visibility-icons">
            <object type="image/svg+xml" data="./legend/legend-input-i1.svg"></object>
            <object type="image/svg+xml" data="./legend/legend-input-i2.svg"></object>
            <object type="image/svg+xml" data="./legend/legend-vu-i12.svg"></object>
          </div>
          <div class="legend-text-cell">Visualization is updated based on two distinct User Inputs</div>
        </div>
      </div>
      <div class="legend-section">
        <h4 class="legend-title">Narrative Flow</h4>
        <div class="legend-concept legend-flow">
          <div class="legend-align-row">
            <div class="legend-icon-cell vertical">
              <img class="legend-glyph" src="../design/glyphs/V.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/V.svg'" alt="V">
              <img class="legend-glyph" src="../design/glyphs/A.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/A.svg'" alt="A">
            </div>
            <div class="legend-text-cell"><strong>Vertical alignment</strong> = sequential progression. Elements appear one after another in narrative flow.</div>
          </div>
          <div class="legend-align-row">
            <div class="legend-icon-cell horizontal">
              <img class="legend-glyph" src="../design/glyphs/V.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/V.svg'" alt="V">
              <img class="legend-glyph" src="../design/glyphs/A.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/A.svg'" alt="A">
            </div>
            <div class="legend-text-cell"><strong>Horizontal alignment</strong> = simultaneous event window. Elements are active at the same narrative moment.</div>
          </div>
        </div>
        <div class="legend-concept">
          <div class="legend-concept-row">
            <object class="legend-mini-svg persistence" type="image/svg+xml" data="./legend/legend-persistence.svg"></object>
            <div class="legend-text-cell"><strong>Persistence</strong><br>The framed element remains visible across steps. Matching bracket-like framing marks the persistent element; when input-dependent, updated instances are shown with the same frame.</div>
          </div>
        </div>
        <div class="legend-concept">
          <div class="legend-subtitle">Repetition</div>
          <div class="legend-concept-row">
            <object class="legend-mini-svg repetition" type="image/svg+xml" data="./legend/legend-repetition.svg"></object>
            <div class="legend-text-cell"><strong>Repetition</strong><br>User-input independent repetitions can be compactly aggregated.</div>
          </div>
        </div>
      </div>
      <div class="legend-section">
        <details class="legend-collapsible">
          <summary>Structural Notation Syntax</summary>
          <ul class="legend-list">
            <li><span class="legend-symbol">→</span><span>Sequencing: <code>S → V → A</code></span></li>
            <li><span class="legend-symbol">,</span><span>Event window: <code>V, A, I</code></span></li>
            <li><span class="legend-symbol">⟦ ⟧</span><span>Persistence: <code>⟦V₁⟧ ... (¬V₁)</code></span></li>
            <li><span class="legend-symbol">(¬X)</span><span>Removal marker</span></li>
            <li><span class="legend-symbol">X₁…ₖ</span><span>Range abbreviation</span></li>
            <li><span class="legend-symbol">(X)ₙ</span><span>Iteration block</span></li>
          </ul>
        </details>
      </div>
      </div>
    </aside>
  </main>
  <div class="tooltip" id="tooltip"></div>
  <script>
    const records = ${safeJson};
    const ARTICLE_GLYPH_TEMPLATE = ${safeArticleGlyphTemplate};
    const INPUT_GLYPH_TEMPLATE = ${safeInputGlyphTemplate};
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
    const recordById = new Map(records.map((r) => [String(r.article_id || ""), r]));
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
    const grouped = new Map();
    for (const r of records) {
      const key = cellKey(embeddingFromY(r.y_category), epistemicFromX(r.x_category));
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
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
      : "../design/glyphs/I.svg";
    const overviewIconByAccent = new Map();
    function overviewSelectedGlyphDataUri(colorHex) {
      if (!INPUT_GLYPH_TEMPLATE) return "../design/glyphs/I.svg";
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

    function tintLegendSvg(svgText, mode) {
      if (mode === "input-visible") {
        return String(svgText || "").replace(/#9ee493/gi, LEGEND_INPUT_TINT);
      }
      if (mode !== "input") return String(svgText || "");
      return String(svgText || "").replace(/#[0-9a-fA-F]{6}/g, (hex) => {
        const lc = hex.toLowerCase();
        if (mode === "input") {
          if (lc === "#000000") return hex;
          if (isGrayHex(lc)) return LEGEND_INPUT_TINT;
          return hex;
        }
        if (lc === "#000000" || isGrayHex(lc)) {
          return hex;
        }
        return LEGEND_INPUT_TINT;
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
        const candidates = [
          img.getAttribute("data-glyph-primary"),
          img.getAttribute("data-glyph-fallback"),
          img.getAttribute("src"),
        ];
        const svgText = await fetchGlyphText(candidates);
        if (!svgText) return;
        const tinted = tintLegendSvg(svgText, mode);
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
              p.style.setProperty("--filter-accent", quadrantAccentColorForRecord(r));
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
        if (/^https?:\\/\\//i.test(s)) return s;
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

    function getInputCountTagValue(record) {
      const yCat = String(record && record.y_category ? record.y_category : "");
      if (!yCat.endsWith("_single") && !yCat.endsWith("_multiple")) return "";
      return multiplicityFromY(yCat) === "multiple" ? "Multiple Input" : "Single Input";
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
      let title = "Articles";
      if (activeCell) title = quadrantDisplayNameByAxes(activeCell.y, activeCell.x);
      const items = rows.map((r) =>
        '<div class="list-item"><a data-id="' + r.article_id + '">' + escapeHtml(String(r.article_id || "")) + " - " + escapeHtml(getDisplayTitle(r)) + '</a></div>'
      ).join("");
      cellList.innerHTML =
        '<div class="summary"><strong>' + title + ":</strong> " + rows.length + " of " + rowsInCell.length + "</div>" +
        items;
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
        + '<div class="detail-right-diagram"><div class="detail-svg-wrap"><img class="detail-svg" src="../svg-vertical/' + encodeURIComponent((r.asset_id || r.article_id)) + '.svg" alt="' + escapeHtml(r.title || "") + '"></div></div>'
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
        "../matrix/article-sources.json",
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
    setLegendCollapsed(false);
    applyLegendGlyphColors();
    loadArticleSources();
    renderVizTypeFilters();
    renderAll();
  </script>
</body>
</html>`;

  await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
  await writeArticleListPage(outDir, records, articleSources);
}

function normalizeResponseType(rawType) {
  const t = String(rawType || "").trim();
  if (!t) return "";
  if (t === "N" || t === "Nds") return "N";
  if (t === "Vcu" || t === "Vc") return "Vc";
  if (t === "Vh" || t === "Vu" || t === "Vz" || t === "Vcuu" || t === "Vcuo" || t === "Vcuuo") return t;
  return "";
}

function extractSvgSymbolParts(rawSvg, prefix) {
  const svg = String(rawSvg || "");
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 810 810";
  const innerMatch = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  let inner = innerMatch ? innerMatch[1] : svg;
  inner = inner
    .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`)
    .replace(/\shref="#([^"]+)"/g, (_, id) => ` href="#${prefix}-${id}"`)
    .replace(/\sxlink:href="#([^"]+)"/g, (_, id) => ` xlink:href="#${prefix}-${id}"`);
  return { viewBox, inner };
}

async function writeVisualizationResponseFrequencyFigure(baseOutDir, records) {
  const INPUT_ONE_COLOR = "#8dd3c7";
  const rowDefs = [
    { key: "Vu", glyph: "Vu.svg", sup: "u" },
    { key: "Vh", glyph: "Vh.svg", sup: "h" },
    { key: "Vz", glyph: "Vz.svg", sup: "z" },
    { key: "Vcu", glyph: "Vcu.svg", sup: "cu" },
    { key: "Vcuu", glyph: "Vcuu.svg", sup: "cuu" },
    { key: "Vcuo", glyph: "Vcuo.svg", sup: "cuo" },
    { key: "Vcuuo", glyph: "Vcuuo.svg", sup: "cuuo" },
  ];
  const colDefs = [
    { key: "positioning::local", short: "PL", long: "Positioning, Local", underline: "#4aff00" },
    { key: "positioning::distributed", short: "PD", long: "Positioning, Distributed", underline: "#ff00e6" },
    { key: "creating::local", short: "CL", long: "Creating, Local", underline: "#ff7035" },
    { key: "creating::distributed", short: "CD", long: "Creating, Distributed", underline: "#00ffd9" },
    { key: "overall", short: "All", long: "Overall" },
  ];

  function canonicalHeatType(rawType) {
    const raw = String(rawType || "").trim();
    if (!raw) return "";
    if (raw === "Vc") return "Vcu";
    if (raw === "Vu" || raw === "Vh" || raw === "Vz" || raw === "Vcu" || raw === "Vcuu" || raw === "Vcuo" || raw === "Vcuuo") {
      return raw;
    }
    return "";
  }

  function tintGlyphInputAccent(innerSvg, colorHex) {
    return String(innerSvg || "")
      .replace(/#9ee493/gi, colorHex)
      .replace(/#00ff00/gi, colorHex)
      .replace(/rgb\(\s*158\s*,\s*228\s*,\s*147\s*\)/gi, colorHex);
  }

  const baseRowOrder = rowDefs.map((row) => row.key);
  const colOrder = colDefs.map((col) => col.key);
  const heat = new Map(baseRowOrder.map((rowKey) => [rowKey, new Map(colOrder.map((colKey) => [colKey, 0]))]));

  for (const record of records || []) {
    const embedding = String(record?.y_category || "").startsWith("distributed_") ? "distributed" : "local";
    const dataFunction = record?.x_category === "generative" ? "creating" : "positioning";
    const colKey = `${dataFunction}::${embedding}`;
    if (!colOrder.includes(colKey)) continue;

    const rawTypes = Array.isArray(record?.visualization_types) ? record.visualization_types : [];
    const storyTypes = new Set();
    for (const rawType of rawTypes) {
      const normalized = canonicalHeatType(rawType);
      if (normalized) storyTypes.add(normalized);
    }
    for (const rowKey of storyTypes) {
      if (!heat.has(rowKey)) continue;
      const row = heat.get(rowKey);
      row.set(colKey, (row.get(colKey) || 0) + 1);
      row.set("overall", (row.get("overall") || 0) + 1);
    }
  }

  const rowIndexByKey = new Map(baseRowOrder.map((key, idx) => [key, idx]));
  const sortedRows = [...rowDefs].sort((a, b) => {
    const allA = heat.get(a.key)?.get("overall") || 0;
    const allB = heat.get(b.key)?.get("overall") || 0;
    if (allA !== allB) return allB - allA;
    return (rowIndexByKey.get(a.key) || 0) - (rowIndexByKey.get(b.key) || 0);
  });
  const rowOrder = sortedRows.map((row) => row.key);

  let maxCount = 0;
  for (const rowKey of rowOrder) {
    for (const colKey of colOrder) {
      maxCount = Math.max(maxCount, heat.get(rowKey)?.get(colKey) || 0);
    }
  }

  const HEAT_LIGHT = { r: 216, g: 221, b: 229 }; // #d8dde5 (single-depth light gray)
  const HEAT_DARK = { r: 110, g: 120, b: 134 }; // #6e7886 (triple-depth dark gray)

  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function heatFill(count) {
    if (count <= 0) return "#ffffff";
    if (maxCount <= 0) return "#ffffff";
    const t = Math.max(0, Math.min(1, count / maxCount));
    // Slight easing preserves contrast in lower-frequency cells while keeping the same cool-gray family as the matrix.
    const eased = Math.pow(t, 0.9);
    const r = lerpChannel(HEAT_LIGHT.r, HEAT_DARK.r, eased);
    const g = lerpChannel(HEAT_LIGHT.g, HEAT_DARK.g, eased);
    const b = lerpChannel(HEAT_LIGHT.b, HEAT_DARK.b, eased);
    return `rgb(${r},${g},${b})`;
  }

  function getDistinctInputCount(record) {
    const featureRows = Array.isArray(record?.key_structural_features) ? record.key_structural_features : [];
    for (const raw of featureRows) {
      const text = String(raw || "").trim();
      let m = text.match(/^distinct inputs:\s*(\d+)/i);
      if (m) return Number.parseInt(m[1], 10);
      m = text.match(/^notation input ids:\s*(\d+)/i);
      if (m) return Number.parseInt(m[1], 10);
    }
    return null;
  }

  const distinctInputCounts = (records || [])
    .map((record) => getDistinctInputCount(record))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const distinctMin = distinctInputCounts.length > 0 ? Math.min(...distinctInputCounts) : null;
  const distinctMax = distinctInputCounts.length > 0 ? Math.max(...distinctInputCounts) : null;
  const distinctValues = distinctMin != null && distinctMax != null
    ? Array.from({ length: distinctMax - distinctMin + 1 }, (_, idx) => distinctMin + idx)
    : [];
  const distinctFreq = new Map(distinctValues.map((v) => [v, 0]));
  for (const value of distinctInputCounts) {
    if (!distinctFreq.has(value)) continue;
    distinctFreq.set(value, (distinctFreq.get(value) || 0) + 1);
  }
  const distinctMaxFreq = distinctValues.length > 0
    ? Math.max(...distinctValues.map((v) => distinctFreq.get(v) || 0))
    : 0;
  const sparkBarGap = 1;
  const sparkBarWidth = distinctValues.length > 28 ? 2 : 3;
  const sparkHeight = 32;
  const sparkInnerHeight = 28;
  const sparkWidth = distinctValues.length > 0
    ? distinctValues.length * sparkBarWidth + Math.max(0, distinctValues.length - 1) * sparkBarGap
    : 36;
  const sparkBars = distinctValues.map((v, idx) => {
    const freq = distinctFreq.get(v) || 0;
    // Use log scaling so small non-zero bins remain distinguishable (e.g. 1 vs 3 stories).
    const norm = distinctMaxFreq > 0
      ? (Math.log(freq + 1) / Math.log(distinctMaxFreq + 1))
      : 0;
    const h = freq <= 0 ? 1 : Math.max(2, Math.round(norm * sparkInnerHeight));
    const x = idx * (sparkBarWidth + sparkBarGap);
    const y = sparkHeight - h;
    const step = sparkBarWidth + sparkBarGap;
    const hitW = step;
    const hitX = x;
    const cls = freq <= 0 ? "bar zero" : "bar";
    const segmentsLabel = `${v} input segment${v === 1 ? "" : "s"}`;
    const storiesLabel = `${freq} data stor${freq === 1 ? "y" : "ies"}`;
    const title = escapeHtml(`${segmentsLabel}: ${storiesLabel}`);
    const tipAttr = escapeHtml(`${segmentsLabel}: ${storiesLabel}`);
    return [
      `<g class="bar-bin">`,
      `<rect class="${cls}" x="${x}" y="${y}" width="${sparkBarWidth}" height="${h}" rx="0.6"/>`,
      `<rect class="bar-hit" data-tip="${tipAttr}" x="${hitX}" y="0" width="${hitW}" height="${sparkHeight}" rx="1">`,
      `<title>${title}</title>`,
      `</rect>`,
      `</g>`,
    ].join("");
  }).join("");
  const distinctMinText = distinctMin != null ? String(distinctMin) : "–";
  const distinctMaxText = distinctMax != null ? String(distinctMax) : "–";

  const glyphDir = path.resolve(__dirname, "../../design/glyphs");
  const symbols = [];
  for (const row of rowDefs) {
    const filePath = path.join(glyphDir, row.glyph);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parts = extractSvgSymbolParts(raw, `heat-${row.key}`);
      symbols.push({
        key: row.key,
        viewBox: parts.viewBox,
        inner: tintGlyphInputAccent(parts.inner, INPUT_ONE_COLOR),
      });
    } catch (err) {
      console.warn(`[figures] failed to load glyph ${row.glyph}: ${err.message}`);
    }
  }
  const symbolMarkup = symbols
    .map((s) => `<symbol id="sym-heat-${s.key}" viewBox="${escapeHtml(s.viewBox)}">${s.inner}</symbol>`)
    .join("\n");

  const iconSize = 16;
  const rowHeight = 30;
  const colWidth = 56;
  const gridX = 130;
  const gridY = 52;
  const rowLabelRight = gridX - 10;
  const iconX = rowLabelRight - 46;
  const formulaX = rowLabelRight - 17;
  const gridW = colWidth * colDefs.length;
  const gridH = rowHeight * sortedRows.length;
  const svgWidth = gridX + gridW + 14;
  const svgHeight = gridY + gridH + 20;

  const headerMarkup = colDefs.map((col, colIdx) => {
    const x = gridX + colIdx * colWidth + colWidth / 2;
    const underlineY = gridY - 4;
    const underline = col.underline
      ? `<line x1="${x - 14}" y1="${underlineY}" x2="${x + 14}" y2="${underlineY}" stroke="${col.underline}" stroke-width="2.5" stroke-linecap="round"/>`
      : "";
    return [
      `<text class="col-head" x="${x}" y="${gridY - 8}" text-anchor="middle">${escapeHtml(col.short)}</text>`,
      underline,
    ].join("");
  }).join("\n");

  const rowMarkup = sortedRows.map((row, rowIdx) => {
    const yTop = gridY + rowIdx * rowHeight;
    const yCenter = yTop + rowHeight / 2;
    const formula = [
      `<text class="row-formula-base" x="${formulaX}" y="${yCenter + 4}" text-anchor="end">V</text>`,
      `<text class="row-formula-sup" x="${formulaX + 2}" y="${yCenter - 7}" text-anchor="start">${escapeHtml(row.sup)}</text>`,
    ].join("");
    const icon = `<use href="#sym-heat-${row.key}" x="${iconX}" y="${yCenter - iconSize / 2}" width="${iconSize}" height="${iconSize}"></use>`;
    const cells = colDefs.map((col, colIdx) => {
      const count = heat.get(row.key)?.get(col.key) || 0;
      const x = gridX + colIdx * colWidth;
      const countMarkup = count > 0
        ? `<text class="cell-count" x="${x + colWidth / 2}" y="${yCenter + 4}" text-anchor="middle">${count}</text>`
        : "";
      return [
        `<rect x="${x}" y="${yTop}" width="${colWidth}" height="${rowHeight}" fill="${heatFill(count)}" stroke="#d6dbe2" stroke-width="1"/>`,
        countMarkup,
      ].join("");
    }).join("");
    return `<g class="row row-${row.key}">${icon}${formula}${cells}</g>`;
  }).join("\n");

  const outDir = path.join(baseOutDir, "visualization-response-frequency");
  await fs.mkdir(outDir, { recursive: true });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visualization Response Type Heatmap</title>
  <style>
    * { box-sizing:border-box; }
    body {
      margin:0;
      padding:20px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background:#fff;
      color:#111827;
    }
    .figure-wrap { max-width:100%; }
    .figure-toolbar {
      display:flex;
      gap:8px;
      align-items:center;
      margin-bottom:10px;
    }
    .figure-btn {
      border:1px solid #cfd4dc;
      background:#fff;
      color:#1f2937;
      border-radius:6px;
      padding:6px 10px;
      font-size:12px;
      font-weight:600;
      cursor:pointer;
    }
    .figure-btn:hover { background:#f8fafc; border-color:#aebed1; }
    .figure-note { font-size:11px; color:#667085; margin-left:6px; }
    .dist-overview {
      display:flex;
      align-items:flex-end;
      gap:6px;
      margin:2px 0 8px;
      white-space:nowrap;
    }
    .dist-label {
      font-size:11px;
      color:#374151;
    }
    .dist-min, .dist-max {
      font-size:11px;
      font-weight:600;
      color:#111827;
      line-height:1;
    }
    .dist-spark {
      display:block;
      width:${sparkWidth}px;
      height:${sparkHeight}px;
    }
    .dist-spark .baseline { stroke:#cfd4dc; stroke-width:1; }
    .dist-spark .bar { fill:#6e7886; }
    .dist-spark .bar.zero { fill:#eef2f7; }
    .dist-spark .bar-hit { fill: transparent; pointer-events: all; cursor: default; }
    .dist-tooltip {
      position: fixed;
      z-index: 2000;
      display: none;
      pointer-events: none;
      background: #111827;
      color: #f9fafb;
      border: 1px solid #1f2937;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    svg { display:block; background:#fff; }
    .col-head {
      font-size:12px;
      font-weight:700;
      letter-spacing:0.01em;
      fill:#1f2937;
    }
    .row-formula-base {
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-size:18px;
      fill:#111827;
      font-style:italic;
    }
    .row-formula-sup {
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-size:11px;
      fill:#111827;
      font-style:normal;
    }
    .cell-count {
      font-size:12px;
      font-weight:600;
      fill:#111827;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body>
  <div class="figure-wrap">
    <div class="figure-toolbar">
      <button id="download-svg" class="figure-btn" type="button">Download SVG</button>
      <button id="download-pdf" class="figure-btn" type="button">Download PDF</button>
      <span class="figure-note">PL=Positioning,Local · PD=Positioning,Distributed · CL=Creating,Local · CD=Creating,Distributed · All=Overall</span>
    </div>
    <div class="dist-overview">
      <span class="dist-label">Input segments per data story</span>
      <span class="dist-min">${distinctMinText}</span>
      <svg class="dist-spark" viewBox="0 0 ${sparkWidth} ${sparkHeight}" preserveAspectRatio="none" aria-label="Input segments per data story distribution">
        <line class="baseline" x1="0" y1="${sparkHeight - 0.5}" x2="${sparkWidth}" y2="${sparkHeight - 0.5}"></line>
        ${sparkBars}
      </svg>
      <span class="dist-max">${distinctMaxText}</span>
    </div>
    <svg id="response-frequency-svg" xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <title>Visualization response type frequencies across quadrants</title>
      <defs>
${symbolMarkup}
      </defs>
      ${headerMarkup}
      ${rowMarkup}
    </svg>
  </div>
  <div id="dist-tooltip" class="dist-tooltip" role="status" aria-live="polite"></div>

  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js"></script>
  <script>
    const distTooltip = document.getElementById("dist-tooltip");
    const distSpark = document.querySelector(".dist-spark");
    function moveDistTooltip(evt) {
      if (!distTooltip || distTooltip.style.display === "none") return;
      const offset = 10;
      distTooltip.style.left = (evt.clientX + offset) + "px";
      distTooltip.style.top = (evt.clientY + offset) + "px";
    }
    function hideDistTooltip() {
      if (!distTooltip) return;
      distTooltip.style.display = "none";
    }
    if (distSpark && distTooltip) {
      const hits = distSpark.querySelectorAll(".bar-hit");
      hits.forEach((hit) => {
        hit.addEventListener("mouseenter", (evt) => {
          const tip = evt.currentTarget.getAttribute("data-tip") || "";
          if (!tip) return;
          distTooltip.textContent = tip;
          distTooltip.style.display = "block";
          moveDistTooltip(evt);
        });
        hit.addEventListener("mousemove", moveDistTooltip);
        hit.addEventListener("mouseleave", hideDistTooltip);
      });
      distSpark.addEventListener("mouseleave", hideDistTooltip);
    }

    const svgEl = document.getElementById("response-frequency-svg");
    const embeddedSvgStyle = [
      ".col-head { font-size:12px; font-weight:700; letter-spacing:0.01em; fill:#1f2937; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".row-formula-base { font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-size:18px; fill:#111827; font-style:italic; }",
      ".row-formula-sup { font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-size:11px; fill:#111827; font-style:normal; }",
      ".cell-count { font-size:12px; font-weight:600; fill:#111827; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
    ].join("\\n");
    function downloadSvg() {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      let defs = clone.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        clone.insertBefore(defs, clone.firstChild);
      }
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.setAttribute("type", "text/css");
      styleEl.textContent = embeddedSvgStyle;
      defs.insertBefore(styleEl, defs.firstChild);
      const payload = '<?xml version="1.0" encoding="UTF-8"?>\\n' + clone.outerHTML;
      const blob = new Blob([payload], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "visualization-response-frequency.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    async function downloadPdf() {
      const jspdfNs = window.jspdf || {};
      const jsPDF = jspdfNs.jsPDF;
      const svg2pdfFn = typeof window.svg2pdf === "function" ? window.svg2pdf : null;
      if (!jsPDF || !svg2pdfFn) {
        alert("PDF export requires jsPDF + svg2pdf.js.");
        return;
      }
      const vb = svgEl.viewBox.baseVal;
      const pageW = vb && vb.width ? vb.width : svgEl.clientWidth;
      const pageH = vb && vb.height ? vb.height : svgEl.clientHeight;
      const doc = new jsPDF({
        orientation: pageW >= pageH ? "landscape" : "portrait",
        unit: "pt",
        format: [pageW, pageH],
      });
      await svg2pdfFn(svgEl, doc, { xOffset: 0, yOffset: 0, width: pageW, height: pageH });
      doc.save("visualization-response-frequency.pdf");
    }
    document.getElementById("download-svg").addEventListener("click", downloadSvg);
    document.getElementById("download-pdf").addEventListener("click", () => { downloadPdf(); });
  </script>
</body>
</html>`;

  await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
}

async function writeVisualizationResponseFrequencyFacetsFigure(baseOutDir, records) {
  const NONE_RESPONSE_TYPE = "V";
  const responseOrder = ["Vh", "Vu", "Vz", "Vc", "Vcuu", "Vcuo", "Vcuuo", NONE_RESPONSE_TYPE];
  const responseGlyphFile = {
    Vh: "Vh.svg",
    Vu: "Vu.svg",
    Vz: "Vz.svg",
    Vc: "Vcu.svg",
    Vcuu: "Vcuu.svg",
    Vcuo: "Vcuo.svg",
    Vcuuo: "Vcuuo.svg",
    V: "V.svg",
  };
  const responseOrderIndex = new Map(responseOrder.map((type, index) => [type, index]));
  const facetDefs = [
    { key: "reconfiguring::local", title: "Reconfiguring - Local", row: 0, col: 0 },
    { key: "reconfiguring::distributed", title: "Reconfiguring - Distributed", row: 0, col: 1 },
    { key: "creating::local", title: "Creating - Local", row: 1, col: 0 },
    { key: "creating::distributed", title: "Creating - Distributed", row: 1, col: 1 },
  ];

  const storyIdSeen = new Map();
  const storyInfos = [];
  for (let i = 0; i < (records || []).length; i += 1) {
    const record = records[i] || {};
    const rawBaseId = String(record.article_id || `story-${i + 1}`).trim() || `story-${i + 1}`;
    const seenCount = storyIdSeen.get(rawBaseId) || 0;
    storyIdSeen.set(rawBaseId, seenCount + 1);
    const storyId = seenCount > 0 ? `${rawBaseId}__${seenCount + 1}` : rawBaseId;
    const storyTitle = String(record.title || rawBaseId).trim() || rawBaseId;

    const rawTypes = Array.isArray(record.visualization_types) ? record.visualization_types : [];
    const canonicalSet = new Set();
    for (const rawType of rawTypes) {
      const normalized = normalizeResponseType(rawType);
      if (normalized) canonicalSet.add(normalized);
    }
    const storyTypes = canonicalSet.size > 0 ? [...canonicalSet] : [NONE_RESPONSE_TYPE];
    const linkTypes = canonicalSet.size === 2
      ? [...canonicalSet].sort((a, b) => (responseOrderIndex.get(a) || 0) - (responseOrderIndex.get(b) || 0))
      : null;
    const embedding = String(record.y_category || "").startsWith("distributed_") ? "distributed" : "local";
    const dataFunction = record.x_category === "generative" ? "creating" : "reconfiguring";
    const facetKey = `${dataFunction}::${embedding}`;

    storyInfos.push({
      id: storyId,
      title: storyTitle,
      types: storyTypes,
      linkTypes,
      facetKey,
    });
  }

  const globalCounts = new Map(responseOrder.map((type) => [type, 0]));
  for (const story of storyInfos) {
    for (const type of story.types) {
      if (!globalCounts.has(type)) continue;
      globalCounts.set(type, (globalCounts.get(type) || 0) + 1);
    }
  }
  const sortedTypes = responseOrder
    .map((type) => ({ type, count: globalCounts.get(type) || 0 }))
    .sort((a, b) => (b.count - a.count) || ((responseOrderIndex.get(a.type) || 0) - (responseOrderIndex.get(b.type) || 0)))
    .map((entry) => entry.type);

  const glyphDir = path.resolve(__dirname, "../../design/glyphs");
  const symbols = [];
  for (const type of sortedTypes) {
    const fileName = responseGlyphFile[type];
    if (!fileName) continue;
    const filePath = path.join(glyphDir, fileName);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parts = extractSvgSymbolParts(raw, `facet-${type}`);
      symbols.push({ type, viewBox: parts.viewBox, inner: parts.inner });
    } catch (err) {
      console.warn(`[figures] failed to load glyph ${fileName}: ${err.message}`);
    }
  }
  const symbolMarkup = symbols
    .map((s) => `<symbol id="facet-sym-${s.type}" viewBox="${escapeHtml(s.viewBox)}">${s.inner}</symbol>`)
    .join("\n");

  const storiesByFacet = new Map(facetDefs.map((def) => [def.key, []]));
  for (const story of storyInfos) {
    if (!storiesByFacet.has(story.facetKey)) continue;
    storiesByFacet.get(story.facetKey).push(story);
  }

  const facetCountsByType = new Map();
  let maxPanelStackCount = 1;
  for (const def of facetDefs) {
    const facetStories = storiesByFacet.get(def.key) || [];
    const counts = new Map(sortedTypes.map((type) => [type, 0]));
    for (const story of facetStories) {
      for (const type of story.types) {
        if (!counts.has(type)) continue;
        counts.set(type, (counts.get(type) || 0) + 1);
      }
    }
    const facetMax = Math.max(1, ...[...counts.values()]);
    maxPanelStackCount = Math.max(maxPanelStackCount, facetMax);
    facetCountsByType.set(def.key, counts);
  }

  // Paper-optimized facet layout: larger icons and denser panel packing
  // while keeping the overall figure footprint roughly unchanged.
  const iconSize = 28;
  const iconGap = 1;
  const columnStep = 52;
  const panelPadding = { top: 30, right: 12, bottom: 30, left: 46 };
  const panelGapX = 14;
  const panelGapY = 14;
  const figureMargin = { top: 16, right: 16, bottom: 54, left: 16 };
  const stackHeight = maxPanelStackCount * iconSize + Math.max(0, maxPanelStackCount - 1) * iconGap;
  const panelInnerWidth = (Math.max(0, sortedTypes.length - 1) * columnStep) + iconSize;
  const panelWidth = panelPadding.left + panelInnerWidth + panelPadding.right;
  const panelHeight = panelPadding.top + stackHeight + panelPadding.bottom;
  const svgWidth = figureMargin.left + panelWidth * 2 + panelGapX + figureMargin.right;
  const svgHeight = figureMargin.top + panelHeight * 2 + panelGapY + figureMargin.bottom;

  function buildFacetPanelMarkup(def) {
    const facetStories = storiesByFacet.get(def.key) || [];
    const counts = facetCountsByType.get(def.key) || new Map(sortedTypes.map((type) => [type, 0]));
    const panelStoryById = new Map(facetStories.map((story) => [story.id, story]));
    const localTypeX = new Map(sortedTypes.map((type, idx) => [type, panelPadding.left + idx * columnStep]));
    const baselineY = panelPadding.top + stackHeight;
    const arcTopPadding = 10;
    const storiesByType = new Map(sortedTypes.map((type) => [type, []]));
    for (const story of facetStories) {
      for (const type of story.types) {
        if (!storiesByType.has(type)) continue;
        storiesByType.get(type).push(story);
      }
    }

    const stackSlotsByType = new Map(
      sortedTypes.map((type) => [type, Array.from({ length: counts.get(type) || 0 }, () => null)])
    );
    const assignedStoryIdsByType = new Map(sortedTypes.map((type) => [type, new Set()]));
    const linkCandidates = facetStories
      .filter((story) => Array.isArray(story.linkTypes) && story.linkTypes.length === 2)
      .map((story) => {
        const candidateTypes = story.linkTypes.filter((type) => localTypeX.has(type));
        if (candidateTypes.length !== 2) return null;
        const pair = candidateTypes.sort((a, b) => (localTypeX.get(a) || 0) - (localTypeX.get(b) || 0));
        return {
          story,
          pair,
          distance: Math.abs((localTypeX.get(pair[0]) || 0) - (localTypeX.get(pair[1]) || 0)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.distance - a.distance);

    const nextLinkSlot = new Map(sortedTypes.map((type) => [type, 0]));
    const linkRecords = [];

    for (const candidate of linkCandidates) {
      const [typeA, typeB] = candidate.pair;
      const slotsA = stackSlotsByType.get(typeA) || [];
      const slotsB = stackSlotsByType.get(typeB) || [];
      const slotA = nextLinkSlot.get(typeA) || 0;
      const slotB = nextLinkSlot.get(typeB) || 0;
      if (slotA >= slotsA.length || slotB >= slotsB.length) continue;
      if (slotsA[slotA] || slotsB[slotB]) continue;
      slotsA[slotA] = candidate.story.id;
      slotsB[slotB] = candidate.story.id;
      assignedStoryIdsByType.get(typeA)?.add(candidate.story.id);
      assignedStoryIdsByType.get(typeB)?.add(candidate.story.id);
      linkRecords.push({
        storyId: candidate.story.id,
        storyTitle: candidate.story.title,
        typeA,
        typeB,
        slotA,
        slotB,
      });
      nextLinkSlot.set(typeA, slotA + 1);
      nextLinkSlot.set(typeB, slotB + 1);
    }

    for (const type of sortedTypes) {
      const slots = stackSlotsByType.get(type) || [];
      const assigned = assignedStoryIdsByType.get(type) || new Set();
      const remainingStories = (storiesByType.get(type) || [])
        .filter((story) => !assigned.has(story.id))
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
      let insertIndex = slots.length - 1;
      for (const story of remainingStories) {
        while (insertIndex >= 0 && slots[insertIndex]) insertIndex -= 1;
        if (insertIndex < 0) break;
        slots[insertIndex] = story.id;
        insertIndex -= 1;
      }
    }

    function getIconCenterForTopSlot(type, slotFromTop) {
      const count = counts.get(type) || 0;
      if (slotFromTop < 0 || slotFromTop >= count) return null;
      const x = localTypeX.get(type);
      if (!Number.isFinite(x)) return null;
      const slotFromBottom = count - 1 - slotFromTop;
      const yTop = baselineY - iconSize - slotFromBottom * (iconSize + iconGap);
      return { x: x + iconSize / 2, y: yTop + iconSize / 2 };
    }

    const maxPairDistance = Math.max(
      1,
      ...linkRecords.map((link) => Math.abs((localTypeX.get(link.typeA) || 0) - (localTypeX.get(link.typeB) || 0)))
    );
    const linkMarkup = linkRecords
      .map((link) => {
        const p1 = getIconCenterForTopSlot(link.typeA, link.slotA);
        const p2 = getIconCenterForTopSlot(link.typeB, link.slotB);
        if (!p1 || !p2) return "";
        const distance = Math.abs(p2.x - p1.x);
        const normalizedDistance = distance / maxPairDistance;
        let arcLift = iconSize * (1.2 + 0.15 * normalizedDistance);
        let yArc = Math.min(p1.y, p2.y) - arcLift;
        if (yArc < arcTopPadding) {
          yArc = arcTopPadding;
          arcLift = Math.min(p1.y, p2.y) - yArc;
        }
        if (arcLift <= 0) return "";
        const minDockOffset = Math.max(4, iconSize * 0.2);
        const maxDockOffset = Math.max(8, iconSize * 0.55);
        let dockOffset = Math.min(maxDockOffset, Math.max(minDockOffset, distance * 0.22));
        if (distance < minDockOffset * 1.8) dockOffset = Math.max(2.5, distance * 0.35);
        const preDockX = p2.x - dockOffset;
        const preDockY = p2.y;
        const hookCtrlX = p2.x - dockOffset * 0.35;
        const hookCtrlY = p2.y - Math.min(iconSize * 0.42, 10 + normalizedDistance * 4);
        const safeTitle = escapeHtml(link.storyTitle || link.storyId);
        return `<path class="link-arc" d="M ${p1.x} ${p1.y} C ${p1.x} ${yArc} ${preDockX} ${yArc} ${preDockX} ${preDockY} Q ${hookCtrlX} ${hookCtrlY} ${p2.x} ${p2.y}"><title>${safeTitle}</title></path>`;
      })
      .filter(Boolean)
      .join("\n");

    const stacksMarkup = sortedTypes
      .map((type) => {
        const x = localTypeX.get(type);
        const count = counts.get(type) || 0;
        const slots = stackSlotsByType.get(type) || [];
        const iconNodes = [];
        for (let slotFromTop = 0; slotFromTop < count; slotFromTop += 1) {
          const slotFromBottom = count - 1 - slotFromTop;
          const y = baselineY - iconSize - slotFromBottom * (iconSize + iconGap);
          const storyId = slots[slotFromTop];
          const story = panelStoryById.get(storyId) || { id: storyId || `${type}-${slotFromTop + 1}`, title: "Data Story" };
          iconNodes.push(
            `<g class="icon-node">` +
            `<use href="#facet-sym-${type}" x="${x}" y="${y}" width="${iconSize}" height="${iconSize}"></use>` +
            `<title>${escapeHtml(story.title || story.id)}</title>` +
            `</g>`
          );
        }
        const countY = count > 0
          ? baselineY - count * (iconSize + iconGap) + iconGap - 5
          : baselineY - 5;
        const typeLabel = def.row === 1
          ? `<text class="type-label" x="${x + iconSize / 2}" y="${baselineY + 20}" text-anchor="middle">${type}</text>`
          : "";
        return [
          `<g class="col col-${type}">`,
          ...iconNodes,
          `<text class="count-label" x="${x + iconSize / 2}" y="${countY}" text-anchor="middle">${count}</text>`,
          typeLabel,
          `</g>`,
        ].join("\n");
      })
      .join("\n");

    const panelTitle = `${def.title} (N=${facetStories.length})`;
    const yAxisLabel = def.col === 0
      ? `<text class="axis-title panel-y-title" x="16" y="${panelPadding.top + stackHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${panelPadding.top + stackHeight / 2})">Number of Data Stories</text>`
      : "";
    return [
      `<g class="facet-panel" transform="translate(${figureMargin.left + def.col * (panelWidth + panelGapX)} ${figureMargin.top + def.row * (panelHeight + panelGapY)})">`,
      `<rect class="panel-frame" x="0" y="0" width="${panelWidth}" height="${panelHeight}"></rect>`,
      `<text class="panel-title" x="12" y="20">${escapeHtml(panelTitle)}</text>`,
      `<line class="axis-line" x1="${panelPadding.left - 6}" y1="${baselineY + 3}" x2="${panelPadding.left + panelInnerWidth + 6}" y2="${baselineY + 3}"></line>`,
      yAxisLabel,
      linkMarkup ? `<g class="link-layer">${linkMarkup}</g>` : "",
      stacksMarkup,
      `</g>`,
    ].filter(Boolean).join("\n");
  }

  const panelMarkup = facetDefs.map((def) => buildFacetPanelMarkup(def)).join("\n");
  const xAxisTitleY = svgHeight - 14;
  const outDir = path.join(baseOutDir, "visualization-response-frequency-facets");
  await fs.mkdir(outDir, { recursive: true });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Experimental: Faceted by Quadrant</title>
  <style>
    * { box-sizing:border-box; }
    body {
      margin:0;
      padding:24px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background:#fff;
      color:#111827;
    }
    h1 {
      margin:0 0 12px 0;
      font-size:16px;
      font-weight:700;
      color:#334155;
    }
    .figure-wrap {
      max-width:100%;
      overflow:visible;
    }
    .figure-toolbar {
      display:flex;
      gap:8px;
      align-items:center;
      margin-bottom:12px;
    }
    .figure-btn {
      border:1px solid #cfd4dc;
      background:#fff;
      color:#1f2937;
      border-radius:6px;
      padding:6px 10px;
      font-size:12px;
      font-weight:600;
      cursor:pointer;
    }
    .figure-btn:hover { background:#f8fafc; border-color:#aebed1; }
    svg { display:block; background:#fff; }
    .panel-frame { fill:#fff; stroke:#e5e7eb; stroke-width:1; }
    .panel-title { font-size:12px; fill:#111827; font-weight:600; }
    .axis-line { stroke:#cfd4dc; stroke-width:1.2; }
    .axis-title { font-size:11px; fill:#374151; }
    .count-label { font-size:10px; fill:#6b7280; font-weight:600; }
    .type-label { font-size:12px; fill:#111827; font-weight:600; }
    .link-arc { fill:none; stroke:#bfc5cc; stroke-width:1.1; stroke-opacity:0.72; stroke-linecap:round; stroke-linejoin:round; }
  </style>
</head>
<body>
  <h1>Experimental: Faceted by Quadrant</h1>
  <div class="figure-wrap">
    <div class="figure-toolbar">
      <button id="download-svg" class="figure-btn" type="button">Download SVG</button>
      <button id="download-pdf" class="figure-btn" type="button">Download PDF</button>
    </div>
    <svg id="faceted-response-frequency-svg" xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <title>Visualization response type (unique per Data Story) - faceted by matrix quadrant</title>
      <defs>
${symbolMarkup}
      </defs>
${panelMarkup}
      <text class="axis-title" x="${svgWidth / 2}" y="${xAxisTitleY}" text-anchor="middle">Visualization response type (unique per Data Story)</text>
    </svg>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js"></script>
  <script>
    const svgEl = document.getElementById("faceted-response-frequency-svg");
    const embeddedSvgStyle = [
      ".panel-frame { fill:#fff; stroke:#e5e7eb; stroke-width:1; }",
      ".panel-title { font-size:12px; fill:#111827; font-weight:600; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".axis-line { stroke:#cfd4dc; stroke-width:1.2; }",
      ".axis-title { font-size:11px; fill:#374151; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".count-label { font-size:10px; fill:#6b7280; font-weight:600; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".type-label { font-size:12px; fill:#111827; font-weight:600; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".link-arc { fill:none; stroke:#bfc5cc; stroke-width:1.1; stroke-opacity:0.72; stroke-linecap:round; stroke-linejoin:round; }",
    ].join("\\n");
    function downloadSvg() {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      let defs = clone.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        clone.insertBefore(defs, clone.firstChild);
      }
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.setAttribute("type", "text/css");
      styleEl.textContent = embeddedSvgStyle;
      defs.insertBefore(styleEl, defs.firstChild);
      const payload = '<?xml version="1.0" encoding="UTF-8"?>\\n' + clone.outerHTML;
      const blob = new Blob([payload], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "visualization-response-frequency-facets.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    async function downloadPdf() {
      const jspdfNs = window.jspdf || {};
      const jsPDF = jspdfNs.jsPDF;
      const svg2pdfFn = typeof window.svg2pdf === "function" ? window.svg2pdf : null;
      if (!jsPDF || !svg2pdfFn) {
        alert("PDF export requires jsPDF + svg2pdf.js.");
        return;
      }
      const vb = svgEl.viewBox.baseVal;
      const pageW = vb && vb.width ? vb.width : svgEl.clientWidth;
      const pageH = vb && vb.height ? vb.height : svgEl.clientHeight;
      const doc = new jsPDF({
        orientation: pageW >= pageH ? "landscape" : "portrait",
        unit: "pt",
        format: [pageW, pageH],
      });
      await svg2pdfFn(svgEl, doc, { xOffset: 0, yOffset: 0, width: pageW, height: pageH });
      doc.save("visualization-response-frequency-facets.pdf");
    }
    document.getElementById("download-svg").addEventListener("click", downloadSvg);
    document.getElementById("download-pdf").addEventListener("click", () => { downloadPdf(); });
  </script>
</body>
</html>`;

  await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
}

async function writeVisualizationResponseCombinedFigure(baseOutDir, records) {
  void records;
  const INPUT_ONE_COLOR = "#8dd3c7";
  const TOTAL_STORIES = 65;
  const layerRows = [
    { key: "V", shape: "circle", count: 55 },
    { key: "A", shape: "triangle", count: 50 },
    { key: "S", shape: "square", count: 17 },
  ];
  const comboRows = [
    { label: "VA", active: { V: true, A: true, S: false }, count: 30, depth: "Dual-layer" },
    { label: "V", active: { V: true, A: false, S: false }, count: 12, depth: "Single-layer" },
    { label: "VAS", active: { V: true, A: true, S: true }, count: 10, depth: "Triple-layer" },
    { label: "A", active: { V: false, A: true, S: false }, count: 6, depth: "Single-layer" },
    { label: "AS", active: { V: false, A: true, S: true }, count: 4, depth: "Dual-layer" },
    { label: "VS", active: { V: true, A: false, S: true }, count: 3, depth: "Dual-layer" },
    { label: "S", active: { V: false, A: false, S: true }, count: 0, depth: "Single-layer" },
    { label: "None", active: { V: false, A: false, S: false }, count: 0, depth: "—" },
  ];

  const figW = 640;
  const figH = 410;
  const headerY = 22;
  const part1TitleY = 48;
  const part1RowStartY = 70;
  const part1RowH = 26;
  const part2TitleY = 153;
  const tableTop = 165;
  const headerHeight = 24;
  const rowHeight = 25;

  const colCombo = 30;
  const colV = 228;
  const colA = 270;
  const colS = 312;
  const colCount = 392;
  const colDepth = 492;

  function shapeMarkup(shape, cx, cy, size, className = "", extraAttrs = "") {
    const cls = className ? ` class="${className}"` : "";
    if (shape === "circle") {
      return `<circle${cls} cx="${cx}" cy="${cy}" r="${size / 2}" ${extraAttrs}></circle>`;
    }
    if (shape === "triangle") {
      const h = size * 0.9;
      const halfW = size / 2;
      const topY = cy - h / 2;
      const bottomY = cy + h / 2;
      return `<polygon${cls} points="${cx},${topY} ${cx + halfW},${bottomY} ${cx - halfW},${bottomY}" ${extraAttrs}></polygon>`;
    }
    const x = cx - size / 2;
    const y = cy - size / 2;
    return `<rect${cls} x="${x}" y="${y}" width="${size}" height="${size}" rx="1.6" ${extraAttrs}></rect>`;
  }

  function mathLabel(letter, x, y) {
    return [
      `<text class="math-base" x="${x}" y="${y}" text-anchor="start">${letter}</text>`,
      `<text class="math-paren" x="${x + 14}" y="${y}" text-anchor="start">(I)</text>`,
    ].join("");
  }

  const part1RowsMarkup = layerRows.map((row, index) => {
    const y = part1RowStartY + index * part1RowH;
    const colX = row.key === "V" ? colV : row.key === "A" ? colA : colS;
    const icon = shapeMarkup(row.shape, colX, y - 4, 12, "part1-shape");
    return [
      `<g class="part1-row">`,
      icon,
      mathLabel(row.key, colDepth - 106, y),
      `<text class="part1-count" x="${colDepth + 20}" y="${y}" text-anchor="end">${row.count}/${TOTAL_STORIES}</text>`,
      `</g>`,
    ].join("");
  }).join("\n");

  const tableBottom = tableTop + headerHeight + comboRows.length * rowHeight;
  const tableLeft = colCombo - 10;
  const tableRight = figW - 24;
  const rowsMarkup = comboRows.map((row, idx) => {
    const yTop = tableTop + headerHeight + idx * rowHeight;
    const yMid = yTop + rowHeight / 2 + 1;
    const mutedClass = row.count === 0 ? " is-muted" : "";
    const rowLabel = `<text class="combo-label${mutedClass}" x="${colCombo}" y="${yMid}" text-anchor="start">${escapeHtml(row.label)}</text>`;

    const baseV = shapeMarkup("circle", colV, yMid - 1, 11, `combo-shape${mutedClass}`);
    const baseA = shapeMarkup("triangle", colA, yMid - 1, 11, `combo-shape${mutedClass}`);
    const baseS = shapeMarkup("square", colS, yMid - 1, 11, `combo-shape${mutedClass}`);

    function check(x, active) {
      if (!active) return "";
      return `<text class="checkmark" x="${x + 8}" y="${yMid - 6}" text-anchor="middle">✓</text>`;
    }

    return [
      `<g class="combo-row${mutedClass}">`,
      `<line class="row-line" x1="${tableLeft}" y1="${yTop}" x2="${tableRight}" y2="${yTop}"></line>`,
      rowLabel,
      baseV,
      check(colV, row.active.V),
      baseA,
      check(colA, row.active.A),
      baseS,
      check(colS, row.active.S),
      `<text class="combo-count${mutedClass}" x="${colCount}" y="${yMid}" text-anchor="middle">${row.count}</text>`,
      `<text class="combo-depth${mutedClass}" x="${colDepth}" y="${yMid}" text-anchor="start">${escapeHtml(row.depth)}</text>`,
      `</g>`,
    ].join("");
  }).join("\n");

  const svgMarkup = [
    `<svg id="combined-compact-svg" xmlns="http://www.w3.org/2000/svg" width="${figW}" height="${figH}" viewBox="0 0 ${figW} ${figH}">`,
    `<rect x="0.5" y="0.5" width="${figW - 1}" height="${figH - 1}" fill="#ffffff" stroke="#e5e7eb"/>`,
    `<text class="figure-title" x="22" y="${headerY}" text-anchor="start">Input integration styles and narrative depth (n=${TOTAL_STORIES})</text>`,
    `<text class="section-title" x="22" y="${part1TitleY}" text-anchor="start">Overall response counts by narrative layer</text>`,
    `<text class="section-title" x="22" y="${part2TitleY}" text-anchor="start">Integration-style combinations and narrative depth</text>`,
    `<line class="section-line" x1="22" y1="${part2TitleY - 10}" x2="${figW - 22}" y2="${part2TitleY - 10}"></line>`,
    part1RowsMarkup,
    `<rect class="table-frame" x="${tableLeft}" y="${tableTop}" width="${tableRight - tableLeft}" height="${tableBottom - tableTop}" rx="3"></rect>`,
    `<line class="row-line" x1="${tableLeft}" y1="${tableTop + headerHeight}" x2="${tableRight}" y2="${tableTop + headerHeight}"></line>`,
    `<text class="table-head" x="${colCombo}" y="${tableTop + 16}" text-anchor="start">Combo</text>`,
    `<text class="table-head math-head" x="${colV}" y="${tableTop + 16}" text-anchor="middle">V</text>`,
    `<text class="table-head math-head" x="${colA}" y="${tableTop + 16}" text-anchor="middle">A</text>`,
    `<text class="table-head math-head" x="${colS}" y="${tableTop + 16}" text-anchor="middle">S</text>`,
    `<text class="table-head" x="${colCount}" y="${tableTop + 16}" text-anchor="middle">Count</text>`,
    `<text class="table-head" x="${colDepth}" y="${tableTop + 16}" text-anchor="start">Narrative Depth</text>`,
    rowsMarkup,
    `<line class="row-line" x1="${tableLeft}" y1="${tableBottom}" x2="${tableRight}" y2="${tableBottom}"></line>`,
    `</svg>`,
  ].join("\n");

  const outDir = path.join(baseOutDir, "visualization-response-combined");
  await fs.mkdir(outDir, { recursive: true });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Input Integration Styles and Narrative Depth</title>
  <style>
    * { box-sizing:border-box; }
    body {
      margin:0;
      padding:20px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background:#fff;
      color:#111827;
    }
    .toolbar {
      display:flex;
      gap:8px;
      align-items:center;
      margin-bottom:10px;
      flex-wrap:wrap;
    }
    .figure-btn {
      border:1px solid #cfd4dc;
      background:#fff;
      color:#1f2937;
      border-radius:6px;
      padding:6px 10px;
      font-size:12px;
      font-weight:600;
      cursor:pointer;
    }
    .figure-btn:hover { background:#f8fafc; border-color:#aebed1; }
    .chart-svg {
      display:block;
      width:100%;
      max-width:${figW}px;
      height:auto;
      background:#fff;
    }
    .figure-title { font-size:14px; font-weight:700; fill:#111827; letter-spacing:0.01em; }
    .section-title { font-size:11px; font-weight:700; fill:#334155; letter-spacing:0.03em; text-transform:uppercase; }
    .section-line { stroke:#e5e7eb; stroke-width:1; }
    .part1-shape { fill:${INPUT_ONE_COLOR}; stroke:#2d3643; stroke-width:0.9; }
    .math-base {
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-style: italic;
      font-size:18px;
      fill:#111827;
    }
    .math-paren {
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-size:14px;
      fill:#111827;
    }
    .part1-count { font-size:16px; font-weight:600; fill:#0f172a; }
    .table-frame { fill:#fcfcfd; stroke:#e5e7eb; stroke-width:1; }
    .table-head { font-size:11px; font-weight:700; fill:#334155; letter-spacing:0.02em; }
    .table-head.math-head {
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-style: italic;
      font-size:15px;
    }
    .row-line { stroke:#e5e7eb; stroke-width:1; }
    .combo-label {
      font-size:12px;
      fill:#111827;
      font-family: "Cambria Math", "STIX Two Text", "Times New Roman", serif;
      font-style: italic;
    }
    .combo-shape { fill:#e5e7eb; stroke:#b3bcc8; stroke-width:0.9; }
    .checkmark { font-size:11px; font-weight:700; fill:#111827; }
    .combo-count { font-size:12px; font-weight:600; fill:#111827; }
    .combo-depth { font-size:12px; fill:#374151; }
    .is-muted { opacity:0.38; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="download-svg" class="figure-btn" type="button">Download SVG</button>
    <button id="download-pdf" class="figure-btn" type="button">Download PDF</button>
  </div>
  ${svgMarkup}
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js"></script>
  <script>
    const svgEl = document.getElementById("combined-compact-svg");
    const embeddedSvgStyle = [
      ".figure-title { font-size:14px; font-weight:700; fill:#111827; letter-spacing:0.01em; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".section-title { font-size:11px; font-weight:700; fill:#334155; letter-spacing:0.03em; text-transform:uppercase; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".section-line { stroke:#e5e7eb; stroke-width:1; }",
      ".part1-shape { fill:${INPUT_ONE_COLOR}; stroke:#2d3643; stroke-width:0.9; }",
      ".math-base { font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-style: italic; font-size:18px; fill:#111827; }",
      ".math-paren { font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-size:14px; fill:#111827; }",
      ".part1-count { font-size:16px; font-weight:600; fill:#0f172a; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".table-frame { fill:#fcfcfd; stroke:#e5e7eb; stroke-width:1; }",
      ".table-head { font-size:11px; font-weight:700; fill:#334155; letter-spacing:0.02em; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".table-head.math-head { font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-style: italic; font-size:15px; }",
      ".row-line { stroke:#e5e7eb; stroke-width:1; }",
      ".combo-label { font-size:12px; fill:#111827; font-family: Cambria Math, STIX Two Text, Times New Roman, serif; font-style: italic; }",
      ".combo-shape { fill:#e5e7eb; stroke:#b3bcc8; stroke-width:0.9; }",
      ".checkmark { font-size:11px; font-weight:700; fill:#111827; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".combo-count { font-size:12px; font-weight:600; fill:#111827; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".combo-depth { font-size:12px; fill:#374151; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }",
      ".is-muted { opacity:0.38; }",
    ].join("\\n");

    function downloadSvg() {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      let defs = clone.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        clone.insertBefore(defs, clone.firstChild);
      }
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.setAttribute("type", "text/css");
      styleEl.textContent = embeddedSvgStyle;
      defs.insertBefore(styleEl, defs.firstChild);
      const payload = '<?xml version="1.0" encoding="UTF-8"?>\\n' + clone.outerHTML;
      const blob = new Blob([payload], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "visualization-response-combined.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async function downloadPdf() {
      const jspdfNs = window.jspdf || {};
      const jsPDF = jspdfNs.jsPDF;
      const svg2pdfFn = typeof window.svg2pdf === "function" ? window.svg2pdf : null;
      if (!jsPDF || !svg2pdfFn) {
        alert("PDF export requires jsPDF + svg2pdf.js.");
        return;
      }
      const vb = svgEl.viewBox.baseVal;
      const pageW = vb && vb.width ? vb.width : svgEl.clientWidth;
      const pageH = vb && vb.height ? vb.height : svgEl.clientHeight;
      const doc = new jsPDF({
        orientation: pageW >= pageH ? "landscape" : "portrait",
        unit: "pt",
        format: [pageW, pageH],
      });
      await svg2pdfFn(svgEl, doc, { xOffset: 0, yOffset: 0, width: pageW, height: pageH });
      doc.save("visualization-response-combined.pdf");
    }

    document.getElementById("download-svg").addEventListener("click", downloadSvg);
    document.getElementById("download-pdf").addEventListener("click", () => { downloadPdf(); });
  </script>
</body>
</html>`;

  await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
}

async function main() {
  const importPathArg = getArgValue("--import");
  const outPathArg = getArgValue("--out");
  const reportPathArg = getArgValue("--report");
  if (importPathArg) {
    const csvPath = await resolveExistingInputPath(importPathArg);
    const outPath = resolveFromCwd(outPathArg || "data/stories.json");
    const reportPath = reportPathArg ? resolveFromCwd(reportPathArg) : null;
    await importStories(csvPath, outPath, reportPath);
    return;
  }

  const layoutMode = process.argv.includes("--layout");
  const svgMode = process.argv.includes("--svg");
  const svgVertical = process.argv.includes("--svg-vertical");
  const galleryMode = process.argv.includes("--gallery");
  const matrixMode = process.argv.includes("--matrix");
  const inputPathArg = getArgValue("--input");

  const articles = inputPathArg
    ? JSON.parse(await fs.readFile(await resolveExistingInputPath(inputPathArg), "utf-8"))
    : await loadArticles();
  const verticalOutputDir = path.resolve(__dirname, "../out/svg-vertical");
  const matrixOutputDir = path.resolve(__dirname, "../out/matrix");
  const metrics = await getRenderMetrics();
  const matrixRecords = [];

  if (svgVertical) {
    console.log(
      `SVG metrics: glyphSize=${metrics.glyphSize}, rowHeight=${metrics.rowHeight}, ` +
      `horizontalSpacing=${metrics.horizontalSpacing}, verticalSpacing=${metrics.verticalSpacing}`
    );
  }

  for (const article of articles) {
    const parsed = parseNotation(article.notation);
    const structured = buildStructure(parsed, article.id);
    const needsLayout =
      layoutMode ||
      svgMode ||
      svgVertical ||
      galleryMode ||
      matrixMode;
    let layout = null;

    if (layoutMode) {
      layout = await buildLayout(structured);
      console.log(JSON.stringify(layout, null, 2));
    }

    if (svgMode) {
      if (!layout) layout = await buildLayout(structured);
      const outputDir = path.resolve(__dirname, "../out/svg");
      await writeSVG(layout, outputDir);
      console.log(`Generated SVG for ${article.id}`);
    }

    if (svgVertical || galleryMode || matrixMode) {
      if (!layout) layout = await buildLayout(structured);
      await writeSVG(layout, verticalOutputDir);
      console.log(`Generated vertical SVG for ${article.id}`);
    }

    if (matrixMode) {
      if (!layout) layout = await buildLayout(structured);
      matrixRecords.push(buildMatrixRecord(article, parsed, structured, layout));
    }

    if (!needsLayout) {
      // default: structured IR
      console.log(JSON.stringify(structured, null, 2));
    }
  }

  if (svgVertical || galleryMode) {
    await writeGallery(
      verticalOutputDir,
      metrics,
      Array.isArray(articles) ? articles.map((a) => String(a.id || "").trim()).filter(Boolean) : null
    );
    console.log(`Generated gallery: ${path.join(verticalOutputDir, "index.html")}`);
  }

  if (matrixMode) {
    await writeMatrix(matrixOutputDir, matrixRecords);
    console.log(`Generated matrix: ${path.join(matrixOutputDir, "index.html")}`);
    console.log(`Generated matrix data: ${path.join(matrixOutputDir, "matrix-data.json")}`);
    const figuresOutputDir = path.resolve(__dirname, "../out/figures");
    await writeVisualizationResponseFrequencyFigure(figuresOutputDir, matrixRecords);
    console.log(`Generated figure: ${path.join(figuresOutputDir, "visualization-response-frequency", "index.html")}`);
    await writeVisualizationResponseFrequencyFacetsFigure(figuresOutputDir, matrixRecords);
    console.log(`Generated faceted figure: ${path.join(figuresOutputDir, "visualization-response-frequency-facets", "index.html")}`);
    await writeVisualizationResponseCombinedFigure(figuresOutputDir, matrixRecords);
    console.log(`Generated combined figure: ${path.join(figuresOutputDir, "visualization-response-combined", "index.html")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
