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
  let railCounter = 0;
  let startOrderCounter = 0;
  let maxFrame = 0;

  nodes.forEach((n) => { if (n.frameIndex > maxFrame) maxFrame = n.frameIndex; });

  const sorted = [...nodes].sort((a, b) => {
    if (a.frameIndex !== b.frameIndex) return a.frameIndex - b.frameIndex;
    const ao = Number.isFinite(a.orderInStep) ? a.orderInStep : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.orderInStep) ? b.orderInStep : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return 0;
  });

  function contributesRenderedContent(node) {
    // End marker token "(¬Vₙ)" is structural only and must not reserve a visual slot.
    if (node.persistentEnd) {
      return false;
    }
    return true;
  }

  function canonicalPersistentKey(node) {
    if (node.kind === 'annotation' && node.annIndex) {
      return `A${node.annIndex}`;
    }
    if (node.kind === 'input' && node.inputId) {
      return `I${node.inputId}`;
    }
    return node.persistentKey;
  }

  for (const node of sorted) {
    if (contributesRenderedContent(node)) {
      open.forEach((state) => {
        state.lastContentFrame = node.frameIndex;
      });
    }

    if (node.kind !== 'visualization' && node.kind !== 'annotation' && node.kind !== 'input') continue;
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
        startOrder: startOrderCounter,
      });
      startOrderCounter += 1;
    }

    if (node.persistentEnd) {
      const start = open.get(key);
      if (!start) {
        warnings.push(`Persistent end without start for key ${key} at frame ${node.frameIndex}`);
        continue;
      }
      const visIndex = extractVisIndex(start.kind, key);
      railCounter += 1;
      rails.push({
        railId: `rail:${railCounter}`,
        key,
        kind: start.kind,
        visIndex,
        startFrame: start.startFrame,
        endFrame: Math.max(start.startFrame, start.lastContentFrame ?? start.startFrame),
        inputId: start.inputId,
        dependsOnInput: start.dependsOnInput,
        startOrder: start.startOrder,
      });
      open.delete(key);
    }
  }

  open.forEach((start, key) => {
    warnings.push(`Persistent start without end for key ${key}; closing at last frame ${maxFrame}`);
    const visIndex = extractVisIndex(start.kind, key);
    railCounter += 1;
    rails.push({
      railId: `rail:${railCounter}`,
      key,
      kind: start.kind,
      visIndex,
      startFrame: start.startFrame,
      endFrame: maxFrame,
      inputId: start.inputId,
      dependsOnInput: start.dependsOnInput,
      startOrder: start.startOrder,
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
    const m = String(key || '').match(/^A(\d+|n)$/i);
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
    const key = node.annIndex ? `A${node.annIndex}` : node.persistentKey;
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

function assignPersistenceStyleRank(nodes, rails) {
  const persistenceKinds = new Set(['visualization', 'annotation', 'input']);
  const activeRails = (rails || []).filter((rail) => persistenceKinds.has(rail.kind));
  if (activeRails.length === 0) {
    for (const node of nodes || []) {
      node.persistenceStyleRank = null;
      node.persistenceStyleRailId = null;
    }
    return;
  }

  const sortedRails = [...activeRails].sort((a, b) => {
    const ao = Number.isFinite(a.startOrder) ? a.startOrder : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.startOrder) ? b.startOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    if (a.endFrame !== b.endFrame) return a.endFrame - b.endFrame;
    return String(a.railId || '').localeCompare(String(b.railId || ''));
  });

  function nodePersistentKey(node) {
    if (!node) return null;
    if (node.kind === 'visualization') return node.persistentKey;
    if (node.kind === 'annotation') return node.annIndex ? `A${node.annIndex}` : node.persistentKey;
    if (node.kind === 'input') return node.inputId ? `I${node.inputId}` : node.persistentKey;
    return null;
  }

  function nodeInPersistentSpan(node) {
    if (!node) return false;
    if (node.kind === 'visualization') return Boolean(node.isInPersistentVisualizationSpan);
    if (node.kind === 'annotation') return Boolean(node.isInPersistentAnnotationSpan);
    if (node.kind === 'input') return Boolean(node.isInPersistentInputSpan);
    return false;
  }

  for (const node of nodes || []) {
    node.persistenceStyleRank = null;
    node.persistenceStyleRailId = null;
    if (!persistenceKinds.has(node.kind)) continue;
    if (!nodeInPersistentSpan(node)) continue;
    const key = nodePersistentKey(node);
    if (!key) continue;

    const matchingRail = sortedRails.find(
      (rail) =>
        rail.kind === node.kind &&
        rail.key === key &&
        node.frameIndex >= rail.startFrame &&
        node.frameIndex <= rail.endFrame
    );
    if (!matchingRail) continue;

    const activeAtFrame = sortedRails.filter(
      (rail) => node.frameIndex >= rail.startFrame && node.frameIndex <= rail.endFrame
    );
    const rank = activeAtFrame.findIndex((rail) => rail.railId === matchingRail.railId);
    if (rank < 0) continue;

    node.persistenceStyleRank = rank;
    node.persistenceStyleRailId = matchingRail.railId || null;
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

function markPersistentInputMembership(nodes, warnings) {
  const open = new Map(); // key -> spanId
  let spanCounter = 0;
  const sorted = nodes
    .map((node, idx) => ({ node, idx }))
    .sort((a, b) => {
      if (a.node.frameIndex !== b.node.frameIndex) return a.node.frameIndex - b.node.frameIndex;
      return a.idx - b.idx;
    });

  for (const { node } of sorted) {
    node.persistentInputSpanId = null;
    node.isInPersistentInputSpan = false;
  }

  for (const { node } of sorted) {
    if (node.kind !== 'input') continue;
    const key = node.inputId ? `I${node.inputId}` : node.persistentKey;
    if (!key) continue;

    if (node.persistentStart) {
      if (open.has(key)) {
        warnings.push(`Input persistence already open for key ${key} at frame ${node.frameIndex}`);
      } else {
        spanCounter += 1;
        open.set(key, `inp:${key}:${spanCounter}`);
      }
    }

    const activeSpanId = open.get(key);
    if (activeSpanId && !node.persistentEnd) {
      node.persistentInputSpanId = activeSpanId;
      node.isInPersistentInputSpan = true;
    }

    if (node.persistentEnd) {
      if (!activeSpanId) {
        warnings.push(`Input persistence end without start for key ${key} at frame ${node.frameIndex}`);
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
  markPersistentInputMembership(nodes, warnings);
  const persistenceRails = buildPersistenceRails(nodes, warnings);
  assignPersistenceStyleRank(nodes, persistenceRails);
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
