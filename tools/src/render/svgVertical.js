// Vertical block SVG renderer.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULTS = {
  blockHeight: 40,
  iconGap: 6,
};

const PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
const NEUTRAL = '#111111';

async function loadMapping(warnings) {
  const baseDir = path.dirname(fileURLToPath(new URL('../../../../', import.meta.url)));
  const mapPath = path.join(baseDir, 'design', 'mapping.json');
  try {
    const raw = await fs.readFile(mapPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') warnings.push(`Failed to read mapping.json: ${err.message}`);
    return {};
  }
}

function stripSvgWrapper(content) {
  const match = content.match(/<svg[^>]*>([\\s\\S]*?)<\\/svg>/i);
  return match ? match[1] : content;
}

async function loadGlyphContent(token, mapping, warnings) {
  const baseDir = path.dirname(fileURLToPath(new URL('../../../../', import.meta.url)));
  const glyphDir = path.join(baseDir, 'design', 'glyphs');

  const candidateKeys = [
    token,
    token.replace(/[₀-₉]+$/, ''), // strip subscript digits if present
  ];

  let fileName = null;
  for (const key of candidateKeys) {
    if (mapping[key]) {
      fileName = mapping[key];
      break;
    }
  }

  if (!fileName) return null;

  const filePath = path.join(glyphDir, fileName);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return stripSvgWrapper(raw);
  } catch (err) {
    warnings.push(`Missing glyph file "${fileName}" for token "${token}": ${err.message}`);
    return null;
  }
}

function collectByFrame(nodes) {
  const map = new Map();
  nodes.forEach((node) => {
    if (!map.has(node.frameIndex)) map.set(node.frameIndex, []);
    map.get(node.frameIndex).push(node);
  });
  return map;
}

function sortLanes(nodesInFrame) {
  const order = ['input', 'story', 'annotation', 'visualization'];
  return nodesInFrame.sort((a, b) => {
    const laneDiff = order.indexOf(a.lane) - order.indexOf(b.lane);
    if (laneDiff !== 0) return laneDiff;
    return 0;
  });
}

function fallbackCircle(glyphSize) {
  const r = glyphSize / 2;
  return `<circle cx="0" cy="0" r="${r}" fill="white" stroke="currentColor" stroke-width="1.5" />`;
}

function renderNodeGroup(node, x, y, glyphContent, glyphSize) {
  const color = node.color || (node.dependsOnInput ? NEUTRAL : NEUTRAL);
  const sizeTransform = `translate(${x},${y})`;
  const content = glyphContent ?? fallbackCircle(glyphSize);
  return `<g transform="${sizeTransform}" style="color:${color}" fill="currentColor" stroke="currentColor">\n${content}\n</g>`;
}

function computeDimensions(frameCount, tokens, blockHeight) {
  const width = tokens.margin * 2 + tokens.glyphSize;
  const height = tokens.margin * 2 + frameCount * blockHeight;
  return { width, height };
}

function getInputColor(inputId) {
  if (!inputId) return NEUTRAL;
  const idx = Math.abs(hashString(inputId)) % PALETTE.length;
  return PALETTE[idx];
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function computePersistentSpans(nodes, warnings) {
  const spans = [];
  const open = new Map(); // key -> { node, frameIndex }
  let maxFrame = 0;
  nodes.forEach((n) => { if (n.frameIndex > maxFrame) maxFrame = n.frameIndex; });

  nodes
    .filter((n) => n.lane === 'visualization')
    .forEach((node) => {
      const key = node.persistentKey || node.raw;
      if (node.persistentStart) {
        open.set(key, node);
      }
      if (node.persistentEnd) {
        const startNode = open.get(key);
        if (!startNode) {
          warnings.push(`Persistent end without start for ${key} at frame ${node.frameIndex}`);
          return;
        }
        spans.push({
          key,
          startFrame: startNode.frameIndex,
          endFrame: node.frameIndex,
          color: node.dependsOnInput ? getInputColor(node.inputId) : NEUTRAL,
        });
        open.delete(key);
      }
    });

  open.forEach((startNode, key) => {
    warnings.push(`Persistent start without end for ${key}; extending to last frame`);
    spans.push({
      key,
      startFrame: startNode.frameIndex,
      endFrame: maxFrame,
      color: startNode.dependsOnInput ? getInputColor(startNode.inputId) : NEUTRAL,
    });
  });

  return spans;
}

function renderPersistentPanels(svg, spans, tokens, blockHeight) {
  spans.forEach((span) => {
    const xPanel = tokens.margin + tokens.glyphSize / 2 - 12;
    const width = tokens.glyphSize + 24;
    const yStart = tokens.margin + span.startFrame * blockHeight - 6;
    const yEnd = tokens.margin + span.endFrame * blockHeight + blockHeight - 6;
    const height = yEnd - yStart;
    const fill = 'rgba(0,0,0,0.04)';
    const stroke = span.color || NEUTRAL;
    svg.push(
      `<rect x="${xPanel}" y="${yStart}" width="${width}" height="${height}" rx="8" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.25" />`,
    );
  });
}

export async function renderVerticalSVG(layoutResult, options = {}) {
  const warnings = [...(layoutResult.warnings || [])];
  const tokens = layoutResult.layout;
  const blockHeight = options.blockHeight || DEFAULTS.blockHeight;
  const iconGap = options.iconGap || DEFAULTS.iconGap;

  const mapping = await loadMapping(warnings);
  const nodesByFrame = collectByFrame(tokens.nodes);
  const frameIndices = Array.from(nodesByFrame.keys()).sort((a, b) => a - b);

  // Assign colors to nodes based on inputId
  tokens.nodes.forEach((n) => {
    if (n.dependsOnInput) n.color = getInputColor(n.inputId);
    else n.color = NEUTRAL;
  });

  const spans = computePersistentSpans(tokens.nodes, warnings);

  const { width, height } = computeDimensions(frameIndices.length || 0, tokens, blockHeight);
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
  ];

  const xPos = tokens.margin + tokens.glyphSize / 2;

  // Panels behind icons
  renderPersistentPanels(svg, spans, tokens, blockHeight);

  for (const frameIndex of frameIndices) {
    const nodes = sortLanes(nodesByFrame.get(frameIndex));
    let localY = tokens.margin + frameIndex * blockHeight + tokens.glyphSize / 2;

    for (const node of nodes) {
      const glyphContent = await loadGlyphContent(node.variant || node.raw, mapping, warnings);
      svg.push(renderNodeGroup(node, xPos, localY, glyphContent, tokens.glyphSize));
      localY += tokens.glyphSize + iconGap;
    }
  }

  svg.push('</svg>');

  return { svg: svg.join('\\n'), warnings };
}

export async function writeVerticalSVG(layoutResult, outputDir, options = {}) {
  const { svg, warnings } = await renderVerticalSVG(layoutResult, options);
  if (warnings.length) {
    console.warn(warnings.join('\\n'));
  }
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${layoutResult.articleId}.svg`);
  await fs.writeFile(filePath, svg, 'utf-8');
}

export default renderVerticalSVG;
