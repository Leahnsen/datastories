// Build structured narrative frames from the linear parser IR.
import { normalizeInputId } from './helpers.js';

const laneByType = {
  I: 'input',
  S: 'story',
  A: 'annotation',
  V: 'visualization',
  N: 'visualization',
  NDS_SCOPE: 'visualization',
};

function extractDependency(element, warnings) {
  if (Array.isArray(element.inputRefs) && element.inputRefs.length > 1) {
    return {
      dependsOnInput: false,
      inputId: null,
      inputIds: element.inputRefs.map((ref) => String(ref)),
      dependsOnAccumulatedInputs: true,
      inputRange: null,
    };
  }

  if (element.dependsOnAccumulatedInputs && element.inputRange) {
    return {
      dependsOnInput: false,
      inputId: null,
      inputIds: null,
      dependsOnAccumulatedInputs: true,
      inputRange: element.inputRange,
    };
  }

  if (element.inputRef != null) {
    return {
      dependsOnInput: true,
      inputId: String(element.inputRef),
      inputIds: null,
      dependsOnAccumulatedInputs: false,
      inputRange: null,
    };
  }

  // Detect explicit input reference inside raw, e.g., Au(I₁) or Vcuu(Iₙ)
  const rangeMatch = element.raw.match(/\(I([₀-₉0-9]+(?:…|\.\.\.)[₀-₉ₙn0-9]+)\)/);
  if (rangeMatch) {
    const normalized = normalizeInputId(rangeMatch[1]);
    const m = String(normalized || '').match(/^(\d+)(?:…|\.\.\.)(\d+|n)$/);
    if (m) {
      const from = Number.parseInt(m[1], 10);
      const to = /^\d+$/.test(m[2]) ? Number.parseInt(m[2], 10) : 'n';
      if (Number.isFinite(from)) {
        return {
          dependsOnInput: false,
          inputId: null,
          inputIds: null,
          dependsOnAccumulatedInputs: true,
          inputRange: { from, to },
        };
      }
    }
  }

  const matches = [...element.raw.matchAll(/\(I([₀-₉ₙn0-9]+)\)/g)];
  if (matches.length === 0) {
    return {
      dependsOnInput: false,
      inputId: null,
      inputIds: null,
      dependsOnAccumulatedInputs: false,
      inputRange: null,
    };
  }
  if (matches.length > 1) {
    warnings.push(`Ambiguous input dependency in "${element.raw}"`);
  }
  const match = matches[0];

  const idRaw = match[1];
  const inputId = normalizeInputId(idRaw);
  if (inputId == null) {
    warnings.push(`Could not resolve input dependency in "${element.raw}"`);
  }
  return {
    dependsOnInput: true,
    inputId,
    inputIds: null,
    dependsOnAccumulatedInputs: false,
    inputRange: null,
  };
}

function mapElementToLane(element, warnings, groupId = null, orderInStep = null) {
  if (element.type === 'NDS_SCOPE') {
    return {
      lane: 'visualization',
      value: {
        kind: 'substory',
        raw: 'Nds',
        sourceRaw: element.sourceRaw || element.raw || 'Nds',
        subSteps: element.subSteps || [],
        scopeInputId: element.scopeInputId || null,
        groupId,
        orderInStep,
        dependsOnInput: false,
        inputId: null,
        inputIds: null,
        dependsOnAccumulatedInputs: false,
        inputRange: null,
        persistentStart: false,
        persistentEnd: false,
        persistentKey: 'Nds',
      },
    };
  }

  if (element.type === 'GROUP_RANGE') {
    return {
      lane: 'story',
      value: {
        kind: 'groupRange',
        raw: element.raw,
        sourceRaw: element.sourceRaw || element.raw,
        groupChildren: element.children || [],
        groupSteps: element.childrenSteps || [],
        range: element.range || null,
        displayRange: element.displayRange || null,
        groupId,
        orderInStep,
        dependsOnInput: false,
        inputId: null,
        persistentStart: false,
        persistentEnd: false,
        persistentKey: element.raw,
      },
    };
  }

  const lane = laneByType[element.type];
  if (!lane) {
    warnings.push(`Unknown element type "${element.type}" in "${element.raw}"`);
    return null;
  }

  const base = {
    raw: element.raw,
    sourceRaw: element.sourceRaw || element.raw,
    variant: element.variant || null,
    visIndex: element.visIndex || null,
    annIndex: element.annIndex || null,
    visAction: element.visAction || null,
    range: element.range || null,
    displayRange: element.displayRange || null,
    persistentStart: element.persistentStart || false,
    persistentEnd: element.persistentEnd || false,
  };

  if (lane === 'input') {
    const derivedId =
      element.inputRef != null
        ? String(element.inputRef)
        : normalizeInputId(element.raw);
    return {
      lane,
      value: {
        id: derivedId || element.raw,
        raw: element.raw,
        sourceRaw: base.sourceRaw,
        range: base.range,
        displayRange: base.displayRange,
        groupId,
        orderInStep,
        persistentStart: base.persistentStart,
        persistentEnd: base.persistentEnd,
        persistentKey: element.raw,
      },
    };
  }

  const dependency = extractDependency(element, warnings);

  return {
    lane,
    value: {
      raw: element.raw,
      sourceRaw: base.sourceRaw,
      variant: base.variant,
      visIndex: base.visIndex,
      annIndex: base.annIndex,
      visAction: base.visAction,
      range: base.range,
      displayRange: base.displayRange,
      groupChildren: element.children || null,
      groupSteps: element.childrenSteps || null,
      groupId,
      orderInStep,
      dependsOnInput: dependency.dependsOnInput,
      inputId: dependency.inputId,
      inputIds: dependency.inputIds,
      dependsOnAccumulatedInputs: dependency.dependsOnAccumulatedInputs,
      inputRange: dependency.inputRange,
      persistentStart: base.persistentStart,
      persistentEnd: base.persistentEnd,
      persistentKey:
        (lane === 'visualization' && base.visIndex) ? `V${base.visIndex}` :
        (lane === 'annotation' && base.annIndex) ? `Au${base.annIndex}` :
        element.raw,
    },
  };
}

function emptyFrame(index) {
  return {
    index,
    lanes: {
      input: [],
      story: [],
      annotation: [],
      visualization: [],
    },
  };
}

function singleNonInputElement(frame) {
  const { lanes } = frame;
  if (lanes.input.length !== 0) return null;
  const nonInput = [
    ...lanes.story,
    ...lanes.annotation,
    ...lanes.visualization,
  ];
  if (nonInput.length !== 1) return null;
  return nonInput[0];
}

function singleInputElement(frame) {
  const { lanes } = frame;
  if (lanes.input.length === 1 &&
      lanes.story.length === 0 &&
      lanes.annotation.length === 0 &&
      lanes.visualization.length === 0) {
    return lanes.input[0];
  }
  return null;
}

function linkTrailingInputParams(frames, warnings) {
  const result = [];
  let i = 0;
  while (i < frames.length) {
    const current = frames[i];
    const next = frames[i + 1];

    const candidate = singleNonInputElement(current);
    const nextInput = next ? singleInputElement(next) : null;

    const canLink =
      candidate &&
      candidate.variant && // only parameterized variants
      nextInput &&
      !candidate.dependsOnInput &&
      !candidate.dependsOnAccumulatedInputs &&
      !/\(I/i.test(candidate.sourceRaw || candidate.raw || '');

    if (canLink) {
      candidate.dependsOnInput = true;
      candidate.inputId = nextInput.id;
      i += 2; // skip next frame (consumed)
      result.push(current);
      continue;
    }

    result.push(current);
    i += 1;
  }

  // Re-index frames after removals
  result.forEach((f, idx) => { f.index = idx; });
  return result;
}

export function buildStructure(parseResult, articleId) {
  const warnings = [...(parseResult.warnings || [])];
  let frames = [];

  parseResult.steps.forEach((step, idx) => {
    const frame = emptyFrame(idx);
    const groupId = step.hasComma ? `rw${idx}` : null;

    step.elements.forEach((el, orderInStep) => {
      const mapped = mapElementToLane(el, warnings, groupId, orderInStep);
      if (mapped) {
        frame.lanes[mapped.lane].push(mapped.value);
      }
    });

    frames.push(frame);
  });

  // Post-pass: link parameter inputs that appeared as their own step
  frames = linkTrailingInputParams(frames, warnings);

  return {
    articleId,
    frames,
    warnings,
  };
}

export default buildStructure;
