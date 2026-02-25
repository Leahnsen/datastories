import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import parseNotation from "./parser/parse.js";
import buildStructure from "./structure/build.js";
import { buildLayout } from "./layout/build.js";
import { getRenderMetrics, writeSVG } from "./render/svg.js";

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

  for (const { stepIndex, element } of rows) {
    if (!element) continue;
    const sourceRawNorm = normalizeSubscript(element.sourceRaw || element.raw || "");

    // Standalone input token (timeline event), including compact ranges like I1...13
    if (element.type === "I") {
      const tokenMatch = sourceRawNorm.match(/^I(\d+|n)$/i);
      if (tokenMatch) {
        addInputId(distinctInputs, tokenMatch[1]);
        if (tokenMatch[1].toLowerCase() === "n") hasVariableInputReference = true;
      }
      if (element.range && Number.isFinite(element.range.start) && Number.isFinite(element.range.end)) {
        addRangeInputIds(distinctInputs, element.range.start, element.range.end);
      }
      const rangeTokenMatch = sourceRawNorm.match(/^I(\d+)(?:…|\.{3})(\d+|n)$/i);
      if (rangeTokenMatch) {
        if (String(rangeTokenMatch[2]).toLowerCase() === "n") {
          hasVariableInputReference = true;
          addInputId(distinctInputs, rangeTokenMatch[1]);
        } else {
          addRangeInputIds(distinctInputs, rangeTokenMatch[1], rangeTokenMatch[2]);
        }
      }
      continue;
    }

    // Dependency arguments
    if (element.inputRef != null) {
      const key = String(element.inputRef).toLowerCase();
      addInputId(distinctInputs, key);
      if (!argumentStepsByInput.has(key)) argumentStepsByInput.set(key, new Set());
      argumentStepsByInput.get(key).add(stepIndex);
    }

    if (Array.isArray(element.inputRefs) && element.inputRefs.length > 0) {
      if (element.inputRefs.length > 1) hasIntegratedMultiInputExpr = true;
      for (const ref of element.inputRefs) {
        const key = String(ref).toLowerCase();
        addInputId(distinctInputs, key);
        if (key === "n") hasVariableInputReference = true;
        if (!argumentStepsByInput.has(key)) argumentStepsByInput.set(key, new Set());
        argumentStepsByInput.get(key).add(stepIndex);
      }
    }

    if (element.dependsOnAccumulatedInputs && element.inputRange) {
      hasIntegratedMultiInputExpr = true;
      addRangeInputIds(distinctInputs, element.inputRange.from, element.inputRange.to);
      addInputId(distinctInputs, element.inputRange.from);
      if (String(element.inputRange.to).toLowerCase() === "n") {
        hasVariableInputReference = true;
      } else {
        addInputId(distinctInputs, element.inputRange.to);
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
  const hasInputIteration = /[ₙn]=/.test(notationNorm) && /I[ₙn]/.test(notationNorm);
  const hasMultipleInputs =
    distinctInputs.size >= 2 ||
    hasVariableInputReference ||
    hasInputIteration ||
    hasIntegratedMultiInputExpr;

  return {
    distinctInputCount: distinctInputs.size,
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
  const hasSubstory = nodes.some((n) => n.kind === "substory") || /Nds\s*\(/i.test(notation);
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
  const hasNdsScopePattern = /Nds\s*\(\s*I/i.test(notation);
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
  if (features.hasSubstory || features.hasNdsScopePattern) parts.push("spawned sub-story (Nds)");
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
  if (features.hasSubstory || features.hasNdsScopePattern) details.push("Nds-Block erkannt.");
  if (features.hasIteratedCumulativeVcu) details.push("Iteration + kumulative Vcu*-Referenz erkannt.");
  if (features.hasVcuuOrVcuuo) details.push("Vcuu/Vcuuo als generativer Marker erkannt.");
  if (features.hasIntegratedMultiInputExpr) details.push("Integrated badge: Multi-Input-Argument erkannt.");
  return [xText, yText, ...details].join(" ");
}

function buildKeyFeatures(features) {
  const rows = [];
  rows.push(`frames: ${features.frameCount}`);
  rows.push(`distinct inputs: ${features.inputCount}`);
  rows.push(`notation input ids: ${features.distinctInputCountByNotation}`);
  if (features.hasIteration) rows.push("explicit iteration block");
  if (features.hasRange) rows.push("structural range/abbreviation");
  if (features.hasReactionWindows) rows.push("reaction window (comma group)");
  if (features.hasPersistence) rows.push("persistence span");
  if (features.hasSubstory || features.hasNdsScopePattern) rows.push("spawned sub-story (Nds)");
  if (features.hasMultipleInputs) rows.push("multiple input set");
  if (features.hasDistributedEmbedding) rows.push("distributed embedding");
  if (features.hasIntegratedMultiInputExpr) rows.push("Integrated");
  if (features.hasRepeatedInputRefSteps) rows.push("same input referenced across multiple steps");
  if (features.hasIteratedCumulativeVcu) rows.push("iterated cumulative Vcu* pattern");
  if (features.hasVcuuOrVcuuo) rows.push("Vcuu/Vcuuo present");
  return rows;
}

function extractVisualizationTypes(parsed, features) {
  const rows = flattenParsedElements(parsed);
  const found = new Set();
  const allowed = new Set(["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo"]);

  for (const { element } of rows) {
    if (!element) continue;
    const raw = String(element.raw || "").trim();
    const visAction = String(element.visAction || "").trim();

    if (element.type === "NDS_SCOPE" || /^nds$/i.test(raw)) {
      found.add("Nds");
      continue;
    }

    if (element.type !== "V") continue;

    if (allowed.has(visAction)) {
      found.add(visAction);
      continue;
    }

    const normalizedRaw = raw.replace(/[₀₁₂₃₄₅₆₇₈₉ₙ]/g, (ch) => ({
      "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
      "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₙ": "n",
    }[ch] || ch));
    const m = normalizedRaw.match(/^V(?:\d+|n)?([A-Za-z]+)$/);
    if (m) {
      const candidate = `V${m[1]}`;
      if (allowed.has(candidate)) found.add(candidate);
    }
  }

  if (features.hasSubstory || features.hasNdsScopePattern) found.add("Nds");
  const order = ["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo", "Nds"];
  return order.filter((k) => found.has(k));
}

function extractNarrativeLayers(parsed) {
  const rows = flattenParsedElements(parsed);
  let hasVisualization = false;
  let hasAnnotation = false;
  let hasStory = false;

  for (const { element } of rows) {
    if (!element) continue;
    if (element.type === "V") hasVisualization = true;
    if (element.type === "A") hasAnnotation = true;
    if (element.type === "S") {
      const depends =
        element.inputRef != null ||
        (Array.isArray(element.inputRefs) && element.inputRefs.length > 0) ||
        (element.dependsOnAccumulatedInputs && element.inputRange) ||
        /\(I/i.test(String(element.sourceRaw || element.raw || ""));
      if (depends) hasStory = true;
    }
  }

  const layers = [];
  if (hasVisualization) layers.push("visualization");
  if (hasAnnotation) layers.push("annotation");
  if (hasStory) layers.push("story");
  return layers.slice(0, 3);
}

function buildMatrixRecord(article, parsed, structured, layout) {
  const features = detectStructuralFeatures(article, parsed, structured, layout);
  const xCategory = classifyEpistemicMode(features);
  const yCategory = classifyStructuralDepth(features);
  const visualizationTypes = extractVisualizationTypes(parsed, features);
  const narrativeLayers = extractNarrativeLayers(parsed);
  return {
    article_id: article.id,
    title: article.title || article.id,
    x_category: xCategory,
    y_category: yCategory,
    integrated_badge: Boolean(features.hasIntegratedMultiInputExpr),
    visualization_types: visualizationTypes,
    narrative_layers: narrativeLayers,
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
    const allowed = new Set(allowedIds.map((id) => `${id}.svg`.toLowerCase()));
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

async function writeMatrix(outDir, records) {
  await fs.mkdir(outDir, { recursive: true });
  const dataPath = path.join(outDir, "matrix-data.json");
  await fs.writeFile(dataPath, JSON.stringify(records, null, 2), "utf-8");

  const legendDir = path.join(outDir, "legend");
  await fs.mkdir(legendDir, { recursive: true });
  const legendExamples = [
    { id: "legend-input-i1", notation: "I₁" },
    { id: "legend-input-i2", notation: "I₂" },
    { id: "legend-vu-i1", notation: "Vu(I₁)" },
    { id: "legend-vu-i12", notation: "Vu(I₁, I₂)" },
    { id: "legend-persistence", notation: "⟦V₁, Au(I₁)⟧ → S → V₁h(I₁) → (¬V₁), (¬Au(I₁))" },
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

  const safeJson = JSON.stringify(records).replace(/</g, "\\u003c");
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
    .site-header h1 {
      margin: 0;
      font-size: 34px;
      font-weight: 800;
      line-height: 1.15;
      color:#0f172a;
      letter-spacing:-0.01em;
    }
    .wrap {
      display:grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 460px;
      gap:28px;
      padding:18px 22px 24px;
      align-items:start;
    }
    .panel { background:transparent; border:none; border-radius:0; padding:0; }
    .matrix { position:relative; width:100%; max-width:410px; aspect-ratio: 1/1.14; border:none; border-radius:0; background:transparent; overflow:visible; margin:4px 0; }
    .grid { position:absolute; inset:0; display:grid; grid-template-columns:repeat(2,1fr); grid-template-rows:repeat(2,1fr); }
    .cell { position:relative; border-right:1px solid transparent; border-bottom:1px solid transparent; padding:14px 12px 14px; cursor:pointer; }
    .cell:nth-child(2n){ border-right:none; }
    .cell:nth-child(n+3){ border-bottom:none; }
    .cell .count { position:absolute; top:12px; right:12px; font-size:38px; line-height:1; font-weight:500; color:rgba(107,114,128,0.7); }
    .cell.active { background:#d6e0eb !important; }
    .points-layer { position:absolute; inset:0; pointer-events:none; }
    .point {
      position:absolute;
      width:23px;
      height:23px;
      border-radius:2px;
      border:1px solid #7f8792;
      pointer-events:auto;
      cursor:pointer;
      background:#f2f4f7;
    }
    .axis-x, .axis-y { font-size:16px; color:#111827; font-weight:600; }
    .axis-x { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-top:12px; text-align:center; }
    .axis-y { position:absolute; left:46px; top:0; bottom:0; width:88px; display:grid; grid-template-rows:repeat(2,1fr); align-items:center; text-align:left; padding-right:0; }
    .matrix-shell { position:relative; margin:0 auto; width:max-content; padding-left:150px; }
    .matrix-shell.fig1 {
      margin: 0 auto;
      padding-left: 154px;
    }
    .figure-head {
      margin: 6px 0 26px;
      text-align:center;
    }
    .figure-head .title-h2 { margin-bottom:0; font-size:32px; }
    .axis-question-top { text-align:center; font-size:13px; color:var(--text-muted); margin:0 0 14px; line-height:1.35; }
    .axis-x-top { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin:0 0 10px; text-align:center; font-size:16px; font-weight:600; color:#111827; }
    .axis-question-y {
      position:absolute;
      left:12px;
      top:0;
      bottom:0;
      width:24px;
      display:flex;
      align-items:center;
      justify-content:center;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size:12px;
      color:var(--text-muted);
      letter-spacing:0.02em;
      text-align:center;
    }
    .axis-y.fig1-y {
      left:44px;
      width:88px;
      font-size:16px;
      font-weight:600;
      color:#111827;
      gap:18px;
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
    .detail .meta { font-size:13px; color:#556070; margin-bottom:8px; }
    .detail .detail-block { margin-top:32px; }
    .detail .detail-heading { font-size:24px; font-weight:600; margin:0 0 14px; color:#111827; }
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
    .detail .detail-svg-wrap {
      border:none;
      border-radius:0;
      background:#fff;
      padding:4px 0;
      max-height:760px;
      overflow:auto;
      display:flex;
      justify-content:center;
    }
    .detail .detail-svg {
      display:block;
      width:auto;
      height:auto;
      max-width:none;
    }
    .chips { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
    .chip { font-size:11px; padding:3px 7px; border-radius:999px; background:#eef2f7; color:#334; }
    .tooltip { position:fixed; z-index:1000; padding:6px 8px; background:#111; color:#fff; font-size:11px; border-radius:6px; pointer-events:none; max-width:260px; display:none; }
    .point.filtered-match { border-color:#e85d04; box-shadow:0 0 0 1px rgba(232,93,4,0.2); }
    .point.filtered-dim { opacity:0.28; }
    .matrix-panel { min-width: 0; padding-left: 4px; padding-right: 6px; }
    .center-panel { min-width: 0; }
    .legend-panel {
      position: sticky;
      top: 12px;
      max-height: calc(100vh - 16px);
      overflow: auto;
      border: none;
      border-left: 1px solid var(--line);
      border-radius: 0;
      background: transparent;
      padding: 0 0 0 14px;
    }
    .legend-section { padding: 10px 0 12px; border-bottom: 1px solid var(--line); }
    .legend-section:last-child { border-bottom: none; }
    .legend-head { margin:0 0 8px; }
    .legend-head h3 { margin:0; font-size:32px; line-height:1.15; letter-spacing:0.01em; color:#111827; }
    .legend-head .sub { margin-top:4px; font-size:12px; color:#6b7280; }
    .legend-title { margin:0 0 8px; font-size:16px; font-weight:600; color:#1f2937; }
    .legend-note { font-size:11px; color:#556070; line-height:1.35; margin-top:6px; }
    .legend-list { margin:0; padding:0; list-style:none; font-size:12px; color:#2c3642; }
    .legend-list li { display:flex; gap:8px; align-items:flex-start; margin:4px 0; }
    .legend-symbol { width:16px; display:inline-block; text-align:center; font-weight:700; color:#1f2937; }
    .legend-gradient { height:14px; border:1px solid #a6afba; border-radius:3px; margin:6px 0; }
    .legend-small { font-size:11px; color:#6b7280; }
    .detail-tag { display:inline-block; font-size:11px; color:#334155; background:#eef2f7; border:1px solid #dde4ee; border-radius:999px; padding:3px 8px; margin-bottom:8px; }
    .legend-glyph-list { margin:0; padding:0; list-style:none; }
    .legend-glyph-row { display:flex; align-items:center; gap:8px; margin:5px 0; font-size:13px; color:#1f2937; }
    .legend-glyph { width:20px; height:20px; display:block; object-fit:contain; }
    .legend-indent { margin-left:28px; margin-top:4px; }
    .legend-subtitle { margin:6px 0 2px; font-size:11px; color:#5f6978; font-weight:600; }
    .legend-subitem { display:flex; gap:8px; align-items:center; margin:4px 0; font-size:12px; color:#27313f; }
    .legend-subitem .legend-glyph { width:22px; height:22px; }
    .legend-symbol-run { display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap; }
    .legend-input-dot { width:10px; height:10px; border-radius:50%; border:1px solid #aab3bf; display:inline-block; }
    .legend-viz-dot { width:14px; height:14px; border-radius:50%; border:1px solid #9ca6b3; display:inline-block; }
    .legend-concept { border:none; border-radius:0; padding:0; margin:14px 0; }
    .legend-mini-stack { display:flex; flex-direction:column; gap:4px; width:22px; }
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
    <h1>Integration of User Input in Data Stories</h1>
  </header>
  <main class="wrap">
    <section class="panel matrix-panel">
      <div class="figure-head">
        <h2 class="title-h2">Structural Distribution</h2>
      </div>
      <div class="matrix-shell fig1">
        <div class="axis-question-top">How is user input embedded in the narrative structure?</div>
        <div class="axis-x-top">
          <div>Local Embedded</div>
          <div>Distributed Embedded</div>
        </div>
        <div class="axis-question-y">How is user input processed at the data level?</div>
        <div class="axis-y fig1-y">
          <div>Parametric</div>
          <div>Generative</div>
        </div>
        <div class="matrix matrix-plain" id="matrix">
          <div class="grid" id="grid"></div>
          <div class="points-layer" id="points"></div>
        </div>
        <div class="matrix-legend">
          <div class="legend-item"><span id="legend-single" class="legend-swatch"></span><span>Single Input</span></div>
          <div class="legend-item"><span id="legend-multiple" class="legend-swatch"></span><span>Multiple Inputs</span></div>
        </div>
      </div>
      <div class="matrix-title">Structural Distribution by Narrative Layer Impact</div>
      <div class="matrix-shell">
        <div class="axis-y">
          <div>Parametric</div>
          <div>Generative</div>
        </div>
        <div class="matrix matrix-guide" id="matrix2">
          <div class="grid" id="grid2"></div>
          <div class="points-layer" id="points2"></div>
        </div>
        <div class="axis-x">
          <div>Local</div>
          <div>Distributed</div>
        </div>
        <div class="matrix-legend">
          <div class="legend-item"><span id="legend-depth-1" class="legend-swatch"></span><span>Single-layer impact</span></div>
          <div class="legend-item"><span id="legend-depth-2" class="legend-swatch"></span><span>Dual-layer impact</span></div>
          <div class="legend-item"><span id="legend-depth-3" class="legend-swatch"></span><span>Triple-layer impact</span></div>
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
        <h2 class="title-h2">Select a point</h2>
        <div class="meta">Click an article point to view formal and visual structure.</div>
      </div>
    </section>
    <aside class="panel legend-panel">
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
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/I.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/I.svg'" alt="Input glyph"><span>User Input</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/Nds.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Nds.svg'" alt="Nds glyph"><span>Data Story</span></li>
          <li class="legend-glyph-row"><img class="legend-glyph" src="../design/glyphs/V.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/V.svg'" alt="Visualization glyph"><span>Visualization</span></li>
        </ul>
        <div class="legend-indent">
          <div class="legend-subtitle">How User Input gets visible</div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vh.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vh.svg'" alt="Highlight glyph"><div>Highlight in visualization</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vu.svg'" alt="Update glyph"><div>Update in visualization</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vz.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vz.svg'" alt="Zoom glyph"><div>Zoom in visualization</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcu.svg'" alt="Comparison glyph"><div>Comparison user vs herself</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuu.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuu.svg'" alt="User vs users glyph"><div>Comparison user vs users</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuo.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuo.svg'" alt="User vs official glyph"><div>Comparison user vs official</div></div>
          <div class="legend-subitem"><img class="legend-glyph" src="../design/glyphs/Vcuuo.svg" onerror="this.onerror=null;this.src='../../../design/glyphs/Vcuuo.svg'" alt="User vs users vs official glyph"><div>Comparison user vs users vs official</div></div>
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
    </aside>
  </main>
  <div class="tooltip" id="tooltip"></div>
  <script>
    const records = ${safeJson};
    const xOrder = ["local", "distributed"];
    const yOrder = ["parametric", "generative"];
    const xLabel = { local:"Local", distributed:"Distributed" };
    const yLabel = { parametric:"Parametric", generative:"Generative" };
    const grid = document.getElementById("grid");
    const pointsLayer = document.getElementById("points");
    const grid2 = document.getElementById("grid2");
    const pointsLayer2 = document.getElementById("points2");
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
    let activeCell = null;
    let vizFilterLogic = "and";
    const selectedVizTypes = new Set();
    let titleQuery = "";
    const vizTypeOrder = ["Vu", "Vh", "Vz", "Vcu", "Vcuo", "Vcuu", "Vcuuo", "Nds"];
    const BASE_INPUT_PALETTE = ["#8dd3c7","#bebada","#fb8072","#80b1d3","#fdb462","#b3de69","#fccde5","#d9d9d9","#bc80bd","#ffffb3"];
    const SINGLE_COLOR = BASE_INPUT_PALETTE[0];
    const MULTI_GRADIENT = "linear-gradient(90deg, " + BASE_INPUT_PALETTE.join(", ") + ")";
    const DEPTH_COLORS = {
      single: "#d8dde5",
      dual: "#aeb6c1",
      triple: "#6e7886",
    };

    const embeddingFromY = (yCat) => String(yCat || "").startsWith("distributed_") ? "distributed" : "local";
    const multiplicityFromY = (yCat) => String(yCat || "").endsWith("_multiple") ? "multiple" : "single";
    const epistemicFromX = (xCat) => (xCat === "generative" ? "generative" : "parametric");
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

    function matchesVizTypes(record) {
      if (selectedVizTypes.size === 0) return true;
      const types = Array.isArray(record.visualization_types) ? record.visualization_types : [];
      if (vizFilterLogic === "or") {
        for (const t of selectedVizTypes) {
          if (types.includes(t)) return true;
        }
        return false;
      }
      for (const t of selectedVizTypes) {
        if (!types.includes(t)) return false;
      }
      return true;
    }

    function matchesTitleQuery(record) {
      if (!titleQuery) return true;
      const hay = normalizeTitle(record.title) + " " + normalizeTitle(record.article_id);
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

    function renderPointsFor(targetLayer, modeName) {
      targetLayer.innerHTML = "";
      document.getElementById("legend-single").style.background = SINGLE_COLOR;
      document.getElementById("legend-multiple").style.backgroundImage = MULTI_GRADIENT;
      document.getElementById("legend-depth-1").style.background = DEPTH_COLORS.single;
      document.getElementById("legend-depth-2").style.background = DEPTH_COLORS.dual;
      document.getElementById("legend-depth-3").style.background = DEPTH_COLORS.triple;
      const box = targetLayer.getBoundingClientRect();
      const cw = box.width / xOrder.length;
      const ch = box.height / yOrder.length;
      const highlightByFilter = hasAnyActiveListFilter() || selectedVizTypes.size > 0;
      const squareSize = 24;
      const gap = 3;
      const leftPadding = 8;
      const bottomPadding = 8;
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

      for (const entries of groupedPoints.values()) {
        if (modeName === "layer") {
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
        } else {
          entries.sort((a, b) => {
            const ma = multiplicityFromY(a.r.y_category) === "multiple" ? 1 : 0;
            const mb = multiplicityFromY(b.r.y_category) === "multiple" ? 1 : 0;
            if (ma !== mb) return ma - mb; // single first
            const t = String(a.r.title || "").localeCompare(String(b.r.title || ""), undefined, { sensitivity: "base" });
            if (t !== 0) return t;
            return String(a.r.article_id || "").localeCompare(String(b.r.article_id || ""), undefined, { numeric: true, sensitivity: "base" });
          });
        }
        const first = entries[0];
        const cellLeft = first.xi * cw;
        const cellTop = first.yi * ch;
        const cellBottom = cellTop + ch;

        for (let i = 0; i < entries.length; i += 1) {
          const r = entries[i].r;
          const columnIndex = Math.floor(i / maxPerColumn);
          const rowIndex = i % maxPerColumn;
          const x = cellLeft + leftPadding + columnIndex * (squareSize + gap);
          const y = cellBottom - bottomPadding - squareSize - rowIndex * (squareSize + gap);
          const p = document.createElement("button");
          p.className = "point";
          if (modeName === "layer") {
            p.style.backgroundImage = "";
            p.style.background = layerDepthColor(layerComboKey(r));
          } else {
            const isMultiple = multiplicityFromY(r.y_category) === "multiple";
            p.style.background = isMultiple ? "#fff" : SINGLE_COLOR;
            if (isMultiple) p.style.backgroundImage = MULTI_GRADIENT;
          }
          if (highlightByFilter) {
            if (matchesVizTypes(r) && matchesTitleQuery(r)) p.classList.add("filtered-match");
            else p.classList.add("filtered-dim");
          }
          p.style.left = x + "px";
          p.style.top = y + "px";
          p.onmouseenter = (e) => {
            tooltip.style.display = "block";
            tooltip.textContent = r.title;
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
          targetLayer.appendChild(p);
        }
      }
    }

    function renderVizTypeFilters() {
      const counts = new Map();
      for (const key of vizTypeOrder) counts.set(key, 0);
      for (const r of records) {
        const types = Array.isArray(r.visualization_types) ? r.visualization_types : [];
        for (const t of types) {
          if (!counts.has(t)) counts.set(t, 0);
          counts.set(t, counts.get(t) + 1);
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
        const types = Array.isArray(r.visualization_types) ? r.visualization_types : [];
        for (const t of types) {
          if (!counts.has(t)) counts.set(t, 0);
          counts.set(t, counts.get(t) + 1);
        }
      }
      vizCountGrid.innerHTML = vizTypeOrder
        .map((key) => '<div class="count-chip">' + key + ': ' + (counts.get(key) || 0) + "</div>")
        .join("");
    }

    function renderCellList() {
      const rowsInCell = getCellFilteredRows();
      const rows = getVisibleRows();
      let title = "Articles";
      if (activeCell) title = yLabel[activeCell.y] + " + " + xLabel[activeCell.x];
      const items = rows.map((r) =>
        '<div class="list-item"><a data-id="' + r.article_id + '">' + r.title + '</a></div>'
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

    function showDetail(r) {
      const classTag = (yLabel[epistemicFromX(r.x_category)] || "Parametric") + " – " + ((xLabel[embeddingFromY(r.y_category)] || "Local") + " Embedded");
      const notationEsc = String(r.notation_string || "").replace(/[&<>]/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[ch]));
      detail.innerHTML = ""
        + '<h2 class="title-h2">' + r.title + "</h2>"
        + '<div class="detail-tag">' + classTag + "</div>"
        + '<div class="detail-block">'
        + '<h3 class="detail-heading">Visual Structural Representation</h3>'
        + '<div class="detail-svg-wrap"><img class="detail-svg" src="../svg-vertical/' + encodeURIComponent(r.article_id) + '.svg" alt="' + String(r.title || "").replace(/"/g, "&quot;") + '"></div>'
        + "</div>"
        + '<div class="detail-block">'
        + '<h3 class="detail-heading">Formula Notation</h3>'
        + '<pre class="detail-notation">' + notationEsc + "</pre>"
        + "</div>"
        + '<div class="detail-block">'
        + '<h3 class="detail-heading">Structural Pattern</h3>'
        + '<div class="body-text">' + r.structural_pattern_summary + "</div>"
        + "</div>";
    }

    function selectCell(x, y) {
      if (activeCell && activeCell.x === x && activeCell.y === y) activeCell = null;
      else activeCell = { x, y };
      renderGridFor(grid);
      renderGridFor(grid2);
      renderPointsFor(pointsLayer, "input");
      renderPointsFor(pointsLayer2, "layer");
      renderCellList();
    }

    function renderAll() {
      renderGridFor(grid);
      renderGridFor(grid2);
      renderPointsFor(pointsLayer, "input");
      renderPointsFor(pointsLayer2, "layer");
      renderCellList();
      logicAndBtn.classList.toggle("active", vizFilterLogic === "and");
      logicOrBtn.classList.toggle("active", vizFilterLogic === "or");
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
    window.addEventListener("resize", () => {
      renderPointsFor(pointsLayer, "input");
      renderPointsFor(pointsLayer2, "layer");
    });
    renderVizTypeFilters();
    renderAll();
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
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
