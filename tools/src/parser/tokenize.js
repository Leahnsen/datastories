// Tokenizer for the story notation language.
// Produces a flat list of tokens that the parser can consume.

const SUBSCRIPT_DIGITS = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  'ₙ': 'n'
};

const DELIMITERS = new Set(['→', ',', '(', ')', '⟦', '⟧', '[', ']', '¬', '-']);

function mapSubscripts(value) {
  let out = '';
  for (const ch of value) {
    if (SUBSCRIPT_DIGITS[ch]) out += SUBSCRIPT_DIGITS[ch];
    else out += ch;
  }
  return out;
}

function tryParseRepeat(text) {
  // Matches patterns like ₙ₌1…20 or ₙ₌1...20
  const match = text.match(/^ₙ₌([₀-₉\d]+)(?:…|\.\.\.)([₀-₉\d]+)/);
  if (!match) return null;

  const startStr = mapSubscripts(match[1]);
  const endStr = mapSubscripts(match[2]);

  const start = Number.parseInt(startStr, 10);
  const end = Number.parseInt(endStr, 10);

  return {
    raw: match[0],
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
  };
}

export function tokenize(input) {
  const cleaned = (input || '').replace(/\s+/g, '');
  const tokens = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (ch === '→') {
      tokens.push({ type: 'ARROW', value: ch });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch });
      i += 1;
      continue;
    }

    if (ch === '⟦') {
      tokens.push({ type: 'PERSIST_START', value: ch });
      i += 1;
      continue;
    }

    if (ch === '[') {
      tokens.push({ type: 'PERSIST_START', value: ch });
      i += 1;
      continue;
    }

    if (ch === '⟧') {
      tokens.push({ type: 'PERSIST_END', value: ch });
      i += 1;
      continue;
    }

    if (ch === ']') {
      tokens.push({ type: 'PERSIST_END', value: ch });
      i += 1;
      continue;
    }

    if (ch === '¬') {
      tokens.push({ type: 'PERSIST_NEGATE', value: ch });
      i += 1;
      continue;
    }

    if (ch === '-') {
      tokens.push({ type: 'PERSIST_NEGATE', value: ch });
      i += 1;
      continue;
    }

    if (ch === 'ₙ') {
      const repeat = tryParseRepeat(cleaned.slice(i));
      if (repeat) {
        tokens.push({ type: 'REPEAT', ...repeat });
        i += repeat.raw.length;
        continue;
      }
    }

    // Element token: read until a delimiter or arrow
    const start = i;
    while (
      i < cleaned.length &&
      !DELIMITERS.has(cleaned[i]) &&
      cleaned[i] !== '→'
    ) {
      // Stop before a repetition suffix so it can be tokenised separately
      if (cleaned[i] === 'ₙ' && tryParseRepeat(cleaned.slice(i))) break;
      i += 1;
    }

    const value = cleaned.slice(start, i);
    if (value) {
      tokens.push({ type: 'ELEMENT', value });
      continue;
    }

    // Fallback: skip unknown char to avoid infinite loop
    i += 1;
  }

  return tokens;
}

export default tokenize;
