// Layout builder: converts structured frames into positioned nodes for rendering.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_TOKENS = {
  columnWidth: 22,
  laneHeight: 26,
  margin: 14,
  glyphSize: 28,
  x: 40,
  blockHeight: 40,
  rowGap: 6,
  horizontalSpacing: 10,
  framePadding: 4,
  strokeWidth: 1,
  galleryCardWidth: 340,
  gallerySvgHeight: 720,
};

const LANES = [
  { name: 'input', order: 0 },
  { name: 'story', order: 1 },
  { name: 'annotation', order: 2 },
  { name: 'visualization', order: 3 },
];

async function loadTokens(warnings) {
  const baseDir = path.dirname(fileURLToPath(new URL('../../../../', import.meta.url)));
  const designPath = path.resolve(baseDir, 'design', 'design.tokens.json');

  try {
    const raw = await fs.readFile(designPath, 'utf-8');
    const json = JSON.parse(raw);
    return { ...DEFAULT_TOKENS, ...json };
  } catch (err) {
    // If file is missing, fall back to defaults silently; other errors emit warning.
    if (err.code !== 'ENOENT') {
      warnings.push(`Could not read design tokens: ${err.message}`);
    }
    return { ...DEFAULT_TOKENS };
  }
}

function buildLanePositions(tokens) {
  return LANES.map((lane) => ({
    name: lane.name,
    y: lane.order * tokens.laneHeight,
  }));
}

function nodesFromFrames(structured, tokens) {
  const nodes = [];
  structured.frames.forEach((frame) => {
    const x = tokens.margin + frame.index * tokens.columnWidth;
    LANES.forEach((lane) => {
      const y = lane.order * tokens.laneHeight;
      const items = frame.lanes[lane.name] || [];
      items.forEach((item) => {
        const isInputLane = lane.name === 'input';
        nodes.push({
          frameIndex: frame.index,
          lane: lane.name,
          x,
          y,
          kind: item.kind || lane.name,
          raw: item.raw,
          sourceRaw: item.sourceRaw || item.raw,
          variant: item.variant || null,
          visIndex: item.visIndex || null,
          annIndex: item.annIndex || null,
          visAction: item.visAction || null,
          range: item.range || null,
          displayRange: item.displayRange || null,
          groupChildren: item.groupChildren || null,
          groupSteps: item.groupSteps || null,
          subSteps: item.subSteps || null,
          scopeInputId: item.scopeInputId || null,
          groupId: item.groupId || null,
          orderInStep: Number.isFinite(item.orderInStep) ? item.orderInStep : null,
          dependsOnInput: isInputLane ? false : Boolean(item.dependsOnInput),
          inputId: isInputLane ? (item.id || null) : (item.inputId || null),
          inputIds: isInputLane ? null : (item.inputIds || null),
          dependsOnAccumulatedInputs: isInputLane ? false : Boolean(item.dependsOnAccumulatedInputs),
          inputRange: isInputLane ? null : (item.inputRange || null),
          persistentStart: Boolean(item.persistentStart),
          persistentEnd: Boolean(item.persistentEnd),
          persistentKey: normalizeKey(item.persistentKey || item.raw || null),
        });
      });
    });
  });
  return nodes;
}

function normalizeKey(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/\s+/g, '')
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/₅/g, '5')
    .replace(/₆/g, '6')
    .replace(/₇/g, '7')
    .replace(/₈/g, '8')
    .replace(/₉/g, '9');
}

function buildPersistenceRails(nodes, warnings) {
  const rails = [];
  const open = new Map(); // key -> { startFrame, lastContentFrame, kind, inputId, dependsOnInput }
  let maxFrame = 0;

  nodes.forEach((n) => { if (n.frameIndex > maxFrame) maxFrame = n.frameIndex; });

  const sorted = [...nodes].sort((a, b) => a.frameIndex - b.frameIndex);

  function contributesRenderedContent(node) {
    // End marker token "(¬Vₙ)" is structural only and must not reserve a visual slot.
    if (node.persistentEnd) {
      return false;
    }
    return true;
  }

  function canonicalPersistentKey(node) {
    if (node.kind === 'annotation' && node.annIndex) {
      return `Au${node.annIndex}`;
    }
    return node.persistentKey;
  }

  for (const node of sorted) {
    if (contributesRenderedContent(node)) {
      open.forEach((state) => {
        state.lastContentFrame = node.frameIndex;
      });
    }

    if (node.kind !== 'visualization' && node.kind !== 'annotation') continue;
    const key = canonicalPersistentKey(node);
    if (!key) continue;

    if (node.persistentStart) {
      if (open.has(key)) {
        warnings.push(`Persistent span already open for key ${key} at frame ${node.frameIndex}`);
        continue;
      }
      open.set(key, {
        startFrame: node.frameIndex,
        lastContentFrame: node.frameIndex,
        kind: node.kind,
        inputId: node.inputId || null,
        dependsOnInput: node.dependsOnInput || false,
      });
    }

    if (node.persistentEnd) {
      const start = open.get(key);
      if (!start) {
        warnings.push(`Persistent end without start for key ${key} at frame ${node.frameIndex}`);
        continue;
      }
      const visIndex = extractVisIndex(start.kind, key);
      rails.push({
        key,
        kind: start.kind,
        visIndex,
        startFrame: start.startFrame,
        endFrame: Math.max(start.startFrame, start.lastContentFrame ?? start.startFrame),
        inputId: start.inputId,
        dependsOnInput: start.dependsOnInput,
      });
      open.delete(key);
    }
  }

  open.forEach((start, key) => {
    warnings.push(`Persistent start without end for key ${key}; closing at last frame ${maxFrame}`);
    const visIndex = extractVisIndex(start.kind, key);
    rails.push({
      key,
      kind: start.kind,
      visIndex,
      startFrame: start.startFrame,
      endFrame: maxFrame,
      inputId: start.inputId,
      dependsOnInput: start.dependsOnInput,
    });
  });

  return rails;
}

function extractVisIndex(kind, key) {
  if (kind === 'visualization') {
    const m = String(key || '').match(/^V(\d+|n)$/i);
    return m ? m[1] : null;
  }
  if (kind === 'annotation') {
    const m = String(key || '').match(/^Au(\d+|n)$/i);
    return m ? m[1] : null;
  }
  return null;
}

function buildReactionWindows(nodes) {
  const grouped = new Map();
  for (const node of nodes) {
    if (!node.groupId) continue;
    const key = `${node.frameIndex}::${node.groupId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.nodeCount += 1;
      existing.lanes.add(node.lane);
      continue;
    }
    grouped.set(key, {
      frameIndex: node.frameIndex,
      groupId: node.groupId,
      nodeCount: 1,
      lanes: new Set([node.lane]),
    });
  }

  return [...grouped.values()].map((rw) => ({
    frameIndex: rw.frameIndex,
    groupId: rw.groupId,
    nodeCount: rw.nodeCount,
    lanes: [...rw.lanes],
  }));
}

function markPersistentAnnotationMembership(nodes, warnings) {
  const open = new Map(); // key -> spanId
  let spanCounter = 0;
  const sorted = nodes
    .map((node, idx) => ({ node, idx }))
    .sort((a, b) => {
      if (a.node.frameIndex !== b.node.frameIndex) return a.node.frameIndex - b.node.frameIndex;
      return a.idx - b.idx;
    });

  for (const { node } of sorted) {
    node.persistentAnnotationSpanId = null;
    node.isInPersistentAnnotationSpan = false;
  }

  for (const { node } of sorted) {
    if (node.kind !== 'annotation') continue;
    const key = node.annIndex ? `Au${node.annIndex}` : node.persistentKey;
    if (!key) continue;

    if (node.persistentStart) {
      if (open.has(key)) {
        warnings.push(`Annotation persistence already open for key ${key} at frame ${node.frameIndex}`);
      } else {
        spanCounter += 1;
        open.set(key, `ann:${key}:${spanCounter}`);
      }
    }

    const activeSpanId = open.get(key);
    if (activeSpanId && !node.persistentEnd) {
      node.persistentAnnotationSpanId = activeSpanId;
      node.isInPersistentAnnotationSpan = true;
    }

    if (node.persistentEnd) {
      if (!activeSpanId) {
        warnings.push(`Annotation persistence end without start for key ${key} at frame ${node.frameIndex}`);
      } else {
        open.delete(key);
      }
    }
  }
}

function markPersistentVisualizationMembership(nodes, warnings) {
  const open = new Map(); // key -> spanId
  let spanCounter = 0;
  const sorted = nodes
    .map((node, idx) => ({ node, idx }))
    .sort((a, b) => {
      if (a.node.frameIndex !== b.node.frameIndex) return a.node.frameIndex - b.node.frameIndex;
      return a.idx - b.idx;
    });

  for (const { node } of sorted) {
    node.persistentVisualizationSpanId = null;
    node.isInPersistentVisualizationSpan = false;
  }

  for (const { node } of sorted) {
    if (node.kind !== 'visualization') continue;
    const key = node.persistentKey;
    if (!key) continue;

    if (node.persistentStart) {
      if (open.has(key)) {
        warnings.push(`Visualization persistence already open for key ${key} at frame ${node.frameIndex}`);
      } else {
        spanCounter += 1;
        open.set(key, `vis:${key}:${spanCounter}`);
      }
    }

    const activeSpanId = open.get(key);
    if (activeSpanId && !node.persistentEnd) {
      node.persistentVisualizationSpanId = activeSpanId;
      node.isInPersistentVisualizationSpan = true;
    }

    if (node.persistentEnd) {
      if (!activeSpanId) {
        warnings.push(`Visualization persistence end without start for key ${key} at frame ${node.frameIndex}`);
      } else {
        open.delete(key);
      }
    }
  }
}

export async function buildLayout(structuredResult) {
  const warnings = [...(structuredResult.warnings || [])];
  const tokens = await loadTokens(warnings);
  const lanes = buildLanePositions(tokens);
  const nodes = nodesFromFrames(structuredResult, tokens);
  markPersistentAnnotationMembership(nodes, warnings);
  markPersistentVisualizationMembership(nodes, warnings);
  const persistenceRails = buildPersistenceRails(nodes, warnings);
  const reactionWindows = buildReactionWindows(nodes);

  return {
    articleId: structuredResult.articleId,
    layout: {
      ...tokens,
      lanes,
      nodes,
      spans: persistenceRails,
      persistenceSpans: persistenceRails,
      persistenceRails,
      reactionWindows,
    },
    warnings,
  };
}

export default buildLayout;
