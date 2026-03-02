# Z_Auth Auth UX Design System (Google-Style)

## Color Scheme

### Core surfaces
- `--color-bg: #f0f4f9` (app background)
- `--color-bg-accent: #e8f0fe` (background accent glow)
- `--color-card: #ffffff` (cards and elevated surfaces)

### Text
- `--color-text: #1f1f1f` (primary text)
- `--color-subtext: #444746` (secondary headings)
- `--color-muted: #5f6368` (helper and tertiary text)

### Borders
- `--color-line: #dadce0` (default borders)
- `--color-line-strong: #c4c7c5` (strong separators)

### Brand and actions
- `--color-brand: #1a73e8` (primary brand/action)
- `--color-brand-hover: #0b57d0` (primary hover)
- `--color-brand-soft: #d3e3fd` (brand tint backgrounds)

### Feedback
- `--color-success: #137333`
- `--color-success-soft: #e6f4ea`
- `--color-danger: #c5221f`
- `--color-danger-soft: #fce8e6`

## Typography

- Display/UI title font: `"Google Sans", "Roboto", "Segoe UI", Arial, sans-serif`
- Body font: `"Roboto", "Google Sans", "Segoe UI", Arial, sans-serif`
- Heading scale:
  - `h1`: `36px`, weight `500`, line-height `1.22`
  - `h2`: `16px`, weight `400`, line-height `1.45`
- Body controls: `14px` and `16px` for forms

## Spacing and Radius

- Spacing tokens: `4, 8, 12, 16, 20, 24, 28, 32`
- Card radius: `28px`
- Control radius: `12px`
- Button radius: full pill (`999px`)

## Interaction Principles

- Single primary CTA per step (blue pill button).
- Secondary action as neutral pill outline.
- Text links for low-priority alternatives.
- Status blocks use subtle tinted backgrounds; no harsh alerts.
- Multi-step mobile flow uses explicit `Step 1/2/3` sections.

## Layout Rules

- Desktop auth cards use split layout (`intro + interaction pane`) for clarity.
- Mobile collapses to single column while preserving hierarchy.
- All auth screens share one tokenized style block to guarantee consistency.
