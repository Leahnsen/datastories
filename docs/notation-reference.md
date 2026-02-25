# Notation Reference

This document describes the currently supported formal notation in this repository, based on the parser and renderer implementation.

## Scope

- Parser: `tools/src/parser/tokenize.js`, `tools/src/parser/parse.js`
- Structure/Layout/Render: `tools/src/structure/build.js`, `tools/src/layout/build.js`, `tools/src/render/svg.js`
- Glyph mapping: `design/mapping.json`

## 1) Structural Symbols

- `→`: sequential transition to next step.
- `,`: simultaneous elements in one step (reaction window).
- `(` `)`: grouping and dependency arguments.
- `⟦` `⟧` (also `[` `]`): persistence start/context markers.
- `¬` (also `-`): persistence negation/end marker (e.g., `(¬V₁)`).
- `…` and `...`: range shorthand.
- `ₙ₌a…b` (or `ₙ₌a...b`): explicit iteration suffix on grouped expressions.

## 2) Base Element Families

The parser recognizes element heads:

- `S`: Story
- `I`: Input
- `A`: Annotation
- `V`: Visualization
- `N`: N-family visualization-style tokens (currently used for `Nds`)

## 3) Element Forms

### Story

- `S`
- `Su`
- Indexed/ranged story forms such as `S₁…₃`

### Input

- Single input token: `I₁`, `I₂`, ..., `Iₙ`
- Input range block: `I₁…ₙ` (or `I₁...ₙ`)

### Annotation

- `A`
- `Au`
- Indexed forms: `A₁`, `A₁u`, `Au₁`
- Dependency forms: `A(I₁)`, `Au(I₁)`, `A(I₁…Iₙ)`, `A(I₁,I₂)`

### Visualization

- Base: `V`
- Indexed base: `V₁`, `V₂`, ...
- Update/highlight/variants: `Vu`, `Vh`, `Vz`
- Cumulative variants: `Vcu`, `Vcuo`, `Vcuu`, `Vcuuo`
- Indexed variants: `V₁u`, `V₂h`, `V₁cu`, `V₁cuo`, `V₁cuuo`, etc.
- Dependency forms: `Vx(I₁)`, `Vx(I₁…Iₙ)`, `Vx(I₁,I₂)`

### Spawned sub-story

- `Nds(Ik)( ... )`
- Meaning: spawn a sub-story scope; elements inside are structurally scoped and may inherit dependency context.

## 4) Dependency Argument Forms

Supported dependency argument patterns:

- Single input dependency:
  - `X(I₁)`
- Input list dependency:
  - `X(I₁,I₂,...)`
- Input range dependency:
  - `X(I₁…Iₙ)` or `X(I₁...Iₙ)`

Where `X` may be story/annotation/visualization tokens (depending on context).

## 5) Range and Iteration

### Single-token range

- `S₁…₃`, `I₁…₄`, `V₁…₃`, etc.
- Interpreted as structural abbreviation.

### Group range

- `(S→V)₁…₄`
- Compressed representation of repeated group sequence.

### Explicit iteration

- `( ... )ₙ₌₁…ₖ`
- Explicit unfolding semantics by iterator index.

## 6) Persistence

### Start markers

- `⟦V₁⟧`
- `⟦A₁u⟧`
- Combined start forms:
  - `⟦V₁, A₁u⟧`

### End markers

- `(¬V₁)`
- `(¬Au₁)`
- Combined end forms:
  - `(¬V₁, ¬Au₁)`

Persistence notation is reserved for state persistence semantics and is distinct from `Nds(...)` sub-story scope semantics.

## 7) Glyph Mapping Keys

Current mapping keys in `design/mapping.json`:

- Story/Input/Annotation:
  - `S`, `I`, `A`, `Au`, `Su`
- Visualization:
  - `V`, `V-index`, `Vh`, `Vu`, `Vz`
  - `Vcu`, `Vcuo`, `Vcuu`, `Vcuuo`
- Sub-story:
  - `Nds`
- Compatibility keys:
  - `Vh1`, `Vu1`

## 8) Notes and Constraints

- Subscript digits `₀..₉` and `ₙ` are normalized by parser utilities.
- Both `…` and `...` are accepted in range expressions.
- Structural interpretation is independent of UI complexity.
- Some malformed notation patterns may still parse with warnings; parser warnings should be reviewed when present.
