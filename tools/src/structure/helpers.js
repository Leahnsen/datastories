const SUBSCRIPT_MAP = {
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
  'ₙ': 'n',
  'ₐ': 'a',
};

export function normalizeSubscriptDigits(raw) {
  if (raw == null) return null;
  let out = '';
  for (const ch of String(raw)) {
    out += SUBSCRIPT_MAP[ch] || ch;
  }
  return out || null;
}

export function normalizeInputId(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(/^I/, '');
  return normalizeSubscriptDigits(text);
}
