// Parser that consumes the tokenizer output and produces the IR object.
import { tokenize } from './tokenize.js';

function normalizeNumber(value) {
  if (value == null) return null;
  const mapped = value
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
  const n = Number.parseInt(mapped, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeSubscriptDigits(value) {
  if (value == null) return '';
  return String(value)
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/₅/g, '5')
    .replace(/₆/g, '6')
    .replace(/₇/g, '7')
    .replace(/₈/g, '8')
    .replace(/₉/g, '9')
    .replace(/ₙ/g, 'n');
}

function parseSubscriptRange(raw, warnings, contextLabel = 'range') {
  if (!raw) return null;
  const normalized = normalizeSubscriptDigits(raw);
  const m = normalized.match(/^(\d+)(?:…|\.\.\.)(\d+)$/);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    warnings.push(`Invalid ${contextLabel} "${raw}"`);
    return null;
  }
  return {
    start,
    end,
    count: end - start + 1,
    text: raw,
  };
}

function parseInputRangeRef(raw) {
  if (!raw) return null;
  const normalized = normalizeSubscriptDigits(raw).replace(/\s+/g, '');
  const m = normalized.match(/^I(?:\()?(\d+)(?:…|\.\.\.)I?(\d+|n)(?:\))?$/i);
  if (!m) return null;
  const from = Number.parseInt(m[1], 10);
  if (!Number.isFinite(from)) return null;
  const to = /^\d+$/.test(m[2]) ? Number.parseInt(m[2], 10) : 'n';
  return { from, to };
}

function parseInputListRef(raw) {
  if (!raw) return null;
  const normalized = normalizeSubscriptDigits(raw).replace(/\s+/g, '');
  if (!normalized.includes(',')) return null;
  const parts = normalized.split(',').filter(Boolean);
  if (parts.length === 0) return null;
  const refs = [];
  for (let idx = 0; idx < parts.length; idx += 1) {
    const part = parts[idx];
    // Accept both I1,I2 and shorthand I1,2 (or I1,n).
    let m = part.match(/^I(\d+|n)$/i);
    if (!m && idx > 0) m = part.match(/^(\d+|n)$/i);
    if (!m) return null;
    const token = m[1];
    refs.push(token === 'n' ? 'n' : Number.parseInt(token, 10));
  }
  return refs;
}

function parseVisualizationRest(restRaw) {
  const rest = normalizeSubscriptDigits(restRaw || '');
  if (!rest) return { visIndex: null, variant: null, visAction: 'V' };

  // V1u / Vnu
  let m = rest.match(/^(\d+|n)([A-Za-z]+)$/);
  if (m) {
    const [, visIndex, variant] = m;
    return { visIndex, variant, visAction: `V${variant}` };
  }

  // Vu1 / Vun
  m = rest.match(/^([A-Za-z]+)(\d+|n)$/);
  if (m) {
    const [, variant, visIndex] = m;
    return { visIndex, variant, visAction: `V${variant}` };
  }

  // V1 / Vn
  m = rest.match(/^(\d+|n)$/);
  if (m) {
    const [, visIndex] = m;
    return { visIndex, variant: null, visAction: 'V' };
  }

  // Vu / Vh / Vcuo ...
  m = rest.match(/^([A-Za-z]+)$/);
  if (m) {
    const [, variant] = m;
    return { visIndex: null, variant, visAction: `V${variant}` };
  }

  return { visIndex: null, variant: null, visAction: 'V' };
}

function parseAnnotationRest(restRaw) {
  const rest = normalizeSubscriptDigits(restRaw || '');
  if (!rest) return { annIndex: null, variant: null };

  // A1u / Anu
  let m = rest.match(/^(\d+|n)([A-Za-z]+)$/);
  if (m) {
    const [, annIndex, variant] = m;
    return { annIndex, variant };
  }

  // Au1 / Aun (legacy token forms)
  m = rest.match(/^([A-Za-z]+)(\d+|n)$/);
  if (m) {
    const [, variant, annIndex] = m;
    return { annIndex, variant };
  }

  // A1 / An
  m = rest.match(/^(\d+|n)$/);
  if (m) {
    const [, annIndex] = m;
    return { annIndex, variant: null };
  }

  // A-variant only (e.g. Au / Ad style markers in legacy data)
  m = rest.match(/^([A-Za-z]+)$/);
  if (m) {
    const [, variant] = m;
    return { annIndex: null, variant };
  }

  return { annIndex: null, variant: null };
}

function parseElement(value, warnings) {
  const dependencyMatch = value.match(/\(([^)]*)\)$/);
  const dependencyRaw = dependencyMatch ? dependencyMatch[1] : null;
  const head = dependencyMatch ? value.slice(0, value.lastIndexOf('(')) : value;
  let headForParse = head;
  let range = null;

  const rangeMatch = head.match(/^(.*?)([₀-₉]+(?:…|\.\.\.)[₀-₉]+)$/);
  if (rangeMatch) {
    const parsedRange = parseSubscriptRange(rangeMatch[2], warnings, `token range in "${value}"`);
    if (parsedRange) {
      headForParse = rangeMatch[1];
      range = parsedRange;
    }
  }

  const elementMatch = headForParse.match(/^([SIVAN])(.*)$/);
  if (!elementMatch) {
    warnings.push(`Unrecognized element token "${value}"`);
    return null;
  }

  const [, base, restRaw] = elementMatch;
  const rest = normalizeSubscriptDigits(restRaw || '');

  let variant = null;
  let visIndex = null;
  let visAction = null;
  let annIndex = null;

  if (base === 'V') {
    const parsedVis = parseVisualizationRest(restRaw);
    variant = parsedVis.variant;
    visIndex = parsedVis.visIndex;
    visAction = parsedVis.visAction;
  } else if (base === 'N') {
    // N-family glyphs behave like visualization actions.
    visAction = headForParse;
    variant = rest || null;
  } else if (base === 'A') {
    const parsedAnn = parseAnnotationRest(restRaw);
    variant = parsedAnn.variant;
    annIndex = parsedAnn.annIndex;
  } else {
    const restMatch = rest.match(/^([A-Za-z]*)([0-9n]*)$/);
    if (!restMatch) {
      warnings.push(`Unrecognized element token "${value}"`);
      return null;
    }
    variant = restMatch[1] || null;
  }

  let inputRef = null;
  let inputRefs = null;
  let inputRange = null;
  if (dependencyRaw) {
    inputRange = parseInputRangeRef(dependencyRaw);
    if (inputRange) {
      // Accumulated input argument (state), e.g. I₁…ₙ
      inputRef = null;
    } else {
      const parsedList = parseInputListRef(dependencyRaw);
      if (parsedList && parsedList.length > 1) {
        inputRefs = parsedList;
        // Treat I1,2 (two adjacent inputs) like I1...2 for downstream layout/render logic.
        if (
          parsedList.length === 2 &&
          parsedList[0] !== 'n' &&
          parsedList[1] !== 'n' &&
          Number.isFinite(parsedList[0]) &&
          Number.isFinite(parsedList[1]) &&
          parsedList[1] === parsedList[0] + 1
        ) {
          inputRange = { from: parsedList[0], to: parsedList[1] };
        }
        inputRef = null;
      } else {
        const hasVariableN = /[ₙn]/.test(dependencyRaw);
        const depNum = dependencyRaw.match(/[₀-₉0-9]+/);
        if (depNum) {
          inputRef = normalizeNumber(depNum[0]);
          if (inputRef == null && !hasVariableN) {
            warnings.push(`Could not parse dependency number from "${dependencyRaw}" in "${value}"`);
          }
        } else if (!hasVariableN) {
          warnings.push(`Missing numeric dependency in "${value}"`);
        }
      }
    }
  }

  return {
    type: base,
    raw: headForParse,
    sourceRaw: value,
    inputRef,
    inputRefs,
    variant,
    visIndex,
    visAction,
    annIndex,
    range,
    displayRange: range ? range.text : null,
    dependsOnAccumulatedInputs: Boolean(inputRange || (inputRefs && inputRefs.length > 1)),
    inputRange,
  };
}

function cloneSteps(steps) {
  return steps.map((s) => ({
    index: s.index,
    hasComma: Boolean(s.hasComma),
    elements: s.elements.map((e) => ({ ...e })),
  }));
}

function isNdsElement(element) {
  if (!element) return false;
  if (element.type === 'NDS_SCOPE') return true;
  if (element.type !== 'N') return false;
  const raw = normalizeSubscriptDigits(element.raw || '').toLowerCase();
  return raw === 'n' || raw === 'nds';
}

function readElementDependency(tokens, openPos) {
  if (!tokens[openPos] || tokens[openPos].type !== 'LPAREN') return null;
  let depth = 0;
  const parts = [];
  for (let p = openPos; p < tokens.length; p += 1) {
    const tok = tokens[p];
    if (tok.type === 'LPAREN') {
      depth += 1;
      if (depth > 1) return null; // dependencies are flat
      continue;
    }
    if (tok.type === 'RPAREN') {
      depth -= 1;
      if (depth === 0) {
        const raw = parts.join('');
        if (!raw) return null;
        return { raw, nextPos: p + 1 };
      }
      if (depth < 0) return null;
      continue;
    }
    if (depth !== 1) return null;
    if (tok.type === 'ARROW' || tok.type === 'PERSIST_START' || tok.type === 'PERSIST_END') return null;
    if (tok.type === 'PERSIST_NEGATE') return null;
    if (tok.type === 'COMMA') {
      parts.push(',');
      continue;
    }
    if (tok.type === 'ELEMENT') {
      parts.push(tok.value);
      continue;
    }
    return null;
  }
  return null;
}

function substituteIterationElement(element, iterValue, iterKey) {
  const cloned = { ...element };
  const normalizedRaw = normalizeSubscriptDigits(cloned.raw || '');
  const normalizedSource = normalizeSubscriptDigits(cloned.sourceRaw || '');
  const iterText = String(iterValue);

  if (cloned.type === 'I' && /^In$/i.test(normalizedRaw)) {
    cloned.raw = `I${iterText}`;
    cloned.inputRef = iterKey;
    if (cloned.sourceRaw) {
      cloned.sourceRaw = cloned.sourceRaw.replace(/I[ₙn]/g, `I${iterText}`);
    }
  }

  if (/\(In\)/i.test(normalizedSource)) {
    cloned.inputRef = iterKey;
  }

  if (Array.isArray(cloned.inputRefs) && cloned.inputRefs.length > 0) {
    cloned.inputRefs = cloned.inputRefs.map((ref) => (String(ref).toLowerCase() === 'n' ? iterKey : ref));
  }

  if (cloned.dependsOnAccumulatedInputs && cloned.inputRange && cloned.inputRange.to === 'n') {
    cloned.inputRange = {
      from: cloned.inputRange.from,
      to: iterValue,
    };
  }

  if (cloned.type === 'V' && String(cloned.visIndex || '').toLowerCase() === 'n') {
    cloned.visIndex = iterText;
    if (cloned.raw) {
      cloned.raw = cloned.raw.replace(/V[ₙn]/g, `V${iterText}`);
    }
    if (cloned.sourceRaw) {
      cloned.sourceRaw = cloned.sourceRaw.replace(/V[ₙn]/g, `V${iterText}`);
    }
  }

  return cloned;
}

function cloneStepsWithIteration(steps, iterValue, iterKey) {
  return steps.map((s) => ({
    index: s.index,
    hasComma: Boolean(s.hasComma),
    elements: s.elements.map((e) => substituteIterationElement(e, iterValue, iterKey)),
  }));
}

function parseSequence(tokens, startIndex, warnings, state) {
  const steps = [];
  let currentElements = [];
  let currentHasComma = false;
  let pos = startIndex;
  let persistentStartScope = false;
  let persistentEndScope = false;

  const flushStep = () => {
    if (currentElements.length) {
      steps.push({ index: 0, elements: currentElements, hasComma: currentHasComma });
      currentElements = [];
      currentHasComma = false;
    }
  };

  while (pos < tokens.length) {
    const token = tokens[pos];

    if (token.type === 'ARROW') {
      flushStep();
      persistentEndScope = false;
      pos += 1;
      continue;
    }

    if (token.type === 'COMMA') {
      currentHasComma = true;
      pos += 1;
      continue;
    }

    if (token.type === 'LPAREN') {
      // Parse inner sequence
      const inner = parseSequence(tokens, pos + 1, warnings, state);
      pos = inner.nextPos;

      const compactRangeToken = tokens[pos];
      if (compactRangeToken?.type === 'ELEMENT') {
        const compactRange = parseSubscriptRange(
          compactRangeToken.value,
          warnings,
          `group range near index ${pos}`
        );
        if (compactRange) {
          flushStep();
          const childrenSteps = cloneSteps(inner.steps);
          const children = childrenSteps.flatMap((s) => s.elements.map((e) => ({ ...e })));
          steps.push({
            index: 0,
            hasComma: false,
            elements: [{
              type: 'GROUP_RANGE',
              raw: `GROUP_RANGE_${compactRangeToken.value}`,
              sourceRaw: `(...)${compactRangeToken.value}`,
              childrenSteps,
              children,
              range: compactRange,
              displayRange: compactRange.text,
            }],
          });
          pos += 1;
          continue;
        }
      }

      // Optional explicit iteration suffix: (...)ₙ₌₁…ₖ
      if (pos < tokens.length && tokens[pos].type === 'REPEAT') {
        const { start, end } = tokens[pos];
        const repeatStart = Number.isFinite(start) ? start : 1;
        const repeatEnd = Number.isFinite(end) ? end : repeatStart;
        if (repeatEnd < repeatStart) {
          warnings.push(`Invalid iteration range ₙ₌${repeatStart}…${repeatEnd}`);
        }

        pos += 1;
        flushStep();
        const expanded = [];
        const blockId = ++state.iterationBlockCounter;
        for (let iter = repeatStart; iter <= repeatEnd; iter += 1) {
          const iterKey = `iter:${blockId}:${iter}`;
          expanded.push(...cloneStepsWithIteration(inner.steps, iter, iterKey));
        }
        steps.push(...expanded);
        continue;
      }

      flushStep();
      steps.push(...cloneSteps(inner.steps));
      continue;
    }

    if (token.type === 'RPAREN') {
      flushStep();
      persistentEndScope = false;
      return { steps, nextPos: pos + 1 };
    }

    if (token.type === 'PERSIST_START') {
      persistentStartScope = true;
      pos += 1;
      continue;
    }

    if (token.type === 'PERSIST_END') {
      persistentStartScope = false;
      pos += 1;
      continue;
    }

    if (token.type === 'PERSIST_NEGATE') {
      // Keep negation active for a comma-separated close list, e.g. (¬V2, A1, I2).
      persistentEndScope = true;
      pos += 1;
      continue;
    }

    if (token.type === 'ELEMENT') {
      let elementValue = token.value;
      let consumeUntil = pos + 1;
      // Join dependency split by tokenizer: Token + (I₁), Token + (I₁,I₂), Token + (I₁…Iₙ)
      const dep = readElementDependency(tokens, pos + 1);
      if (dep && /^I/i.test(dep.raw || '')) {
        elementValue = `${token.value}(${dep.raw})`;
        consumeUntil = dep.nextPos;
      }

      const element = parseElement(elementValue, warnings);
      if (element) {
        if (persistentStartScope) {
          element.persistentStart = true;
        }
        if (persistentEndScope) {
          element.persistentEnd = true;
          // End negation scope after a standalone token, but keep it alive across commas.
          if (tokens[consumeUntil]?.type !== 'COMMA') {
            persistentEndScope = false;
          }
        }

        // Optional explicit iteration suffix for a single element:
        // A(Iₙ)ₙ₌₁…₉, V(Iₙ)ₙ₌₁…ₖ, ...
        if (tokens[consumeUntil]?.type === 'REPEAT') {
          const { start, end } = tokens[consumeUntil];
          const repeatStart = Number.isFinite(start) ? start : 1;
          const repeatEnd = Number.isFinite(end) ? end : repeatStart;
          if (repeatEnd < repeatStart) {
            warnings.push(`Invalid iteration range ₙ₌${repeatStart}…${repeatEnd}`);
          } else {
            flushStep();
            const blockId = ++state.iterationBlockCounter;
            for (let iter = repeatStart; iter <= repeatEnd; iter += 1) {
              const iterKey = `iter:${blockId}:${iter}`;
              const cloned = substituteIterationElement(element, iter, iterKey);
              steps.push({
                index: 0,
                hasComma: false,
                elements: [cloned],
              });
            }
            pos = consumeUntil + 1;
            continue;
          }
        }

        // Spawned sub-story scope: N(Ik)( ... )
        if (isNdsElement(element) && tokens[consumeUntil]?.type === 'LPAREN') {
          const innerStart = consumeUntil + 1;
          const inner = parseSequence(tokens, innerStart, warnings, state);
          element.type = 'NDS_SCOPE';
          element.subSteps = cloneSteps(inner.steps);
          element.scopeInputId = element.inputRef != null ? String(element.inputRef) : null;
          pos = inner.nextPos;
          currentElements.push(element);
          continue;
        }
        currentElements.push(element);
      }
      pos = consumeUntil;
      continue;
    }

    // Fallback: advance to avoid infinite loop
    warnings.push(`Unexpected token "${token.value ?? token.type}"`);
    pos += 1;
  }

  flushStep();
  return { steps, nextPos: pos };
}

export function parseNotation(notation) {
  const warnings = [];
  const tokens = tokenize(notation);
  const state = { iterationBlockCounter: 0 };

  const { steps } = parseSequence(tokens, 0, warnings, state);

  // Re-index steps in order of appearance
  steps.forEach((step, idx) => {
    step.index = idx;
  });

  // Detect unmatched parentheses at top-level
  const openParens = tokens.filter((t) => t.type === 'LPAREN').length;
  const closeParens = tokens.filter((t) => t.type === 'RPAREN').length;
  if (openParens !== closeParens) {
    warnings.push('Unmatched parentheses detected');
  }

  return { steps, warnings };
}

export default parseNotation;
