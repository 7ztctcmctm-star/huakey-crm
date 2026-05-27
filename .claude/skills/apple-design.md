---
name: apple-design
description: Apple-style design system reference — colors, typography, spacing, components. Use when building UI components, landing pages, or marketing pages.
---

# Apple — Style Reference
> Polished lens on innovation — clear, precise, and understated.

**Theme:** light

The Apple design system exudes a precise, almost ethereal clarity, like a perfectly polished lens focusing on content. Impeccable kerning and tracking, especially in headlines, create an understated authority. A subtle hierarchy of grays defines surfaces without heavy shadows, anchored by a vibrant yet contained blue for interaction. Product imagery is the hero, framed by minimal UI that gets out of the way.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Midnight Graphite | `#1d1d1f` | `--color-midnight-graphite` | Primary text, headline text, glyphs, and navigation elements. Near-black for maximum contrast on light backgrounds. |
| Deep Gray | `#333333` | `--color-deep-gray` | Secondary text and navigation elements, slightly softer than primary text. |
| Charcoal Grey | `#474747` | `--color-charcoal-grey` | Link text and navigation link text, indicating interactive elements. |
| Medium Gray | `#707070` | `--color-medium-gray` | Tertiary text, footer text, and subtle UI elements. Softer body copy. |
| Light Gray | `#858585` | `--color-light-gray` | Muted text for less prominent information, icon fills. |
| Light Silver | `#c7c7c7` | `--color-light-silver` | Subtle image box shadows, creating depth without heavy obscuration. |
| Border Silver | `#d6d6d6` | `--color-border-silver` | Thin, crisp border lines for UI separation. |
| Lightest Gray Background | `#e2e2e5` | `--color-lightest-gray-background` | Subtle background for UI components, hinting at separation. |
| Canvas White | `#f5f5f7` | `--color-canvas-white` | Dominant page background, primary canvas for content. The foundational light surface. |
| Pure White | `#ffffff` | `--color-pure-white` | Elevated UI elements, such as navigation backgrounds or contained content blocks, contrasting subtly with the primary canvas. |
| True Black | `#000000` | `--color-true-black` | Icon fills and occasional headline accents, providing maximum visual punch where needed. |
| Interactive Blue | `#0071e3` | `--color-interactive-blue` | Primary interactive element background, such as filled buttons and focus rings. A vivid, clear blue that signifies action. |
| Action Blue | `#0066cc` | `--color-action-blue` | Link color for interactive text and outline buttons. Slightly darker than Interactive Blue for text hierarchy. |
| Sky Blue Highlight | `#2997ff` | `--color-sky-blue-highlight` | Vivid blue for interactive states, highlighting links, buttons, and other active elements. Creates a bright, inviting focus. |
| Cerulean Shine | `#3397d4` | `--color-cerulean-shine` | Secondary accent color, used in specific graphic elements or backgrounds to provide visual variation. |
| Pale Blue Overlay | `#9fc6f4` | `--color-pale-blue-overlay` | Muted background for specific content sections, providing a soft color block. |
| Vibrant Orange | `#ec893c` | `--color-vibrant-orange` | Accent color for specific products or promotional blocks, providing a warm, energetic contrast. |
| Deep Plum | `#7424b5` | `--color-deep-plum` | Accent color for distinct content blocks, especially in content-rich sections like Apple TV. |
| Blush Pink | `#ea33c0` | `--color-blush-pink` | Accent color for branding specific products or content categories, often in playful, illustrative contexts. |
| Warm Taupe | `#604630` | `--color-warm-taupe` | Contextual background color, likely for specific product displays or themed sections. |
| Cool Teal | `#485b5` | `--color-cool-teal` | Contextual background or accent color, subtly introducing a cool, modern feel. |

## Tokens — Typography

### SF Pro Text — Primary typeface for body text, UI labels, buttons, navigation, and footer content. · `--font-sf-pro-text`
- **Substitute:** system-ui
- **Weights:** 300, 400, 600
- **Sizes:** 12px, 14px, 17px, 18px, 24px, 26px, 34px, 44px
- **Line height:** 1.00, 1.18, 1.24, 1.29, 1.33, 1.47, 1.50, 2.12, 2.41
- **Letter spacing:** -0.26, -0.24, -0.22, -0.19, -0.18, -0.15

### SF Pro Display — Used for headlines and display-sized text. · `--font-sf-pro-display`
- **Substitute:** system-ui
- **Weights:** 400, 600, 700
- **Sizes:** 21px, 28px, 40px, 56px
- **Line height:** 1.07, 1.10, 1.14, 1.19
- **Letter spacing:** -0.28, 0.29, 0.44

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 12px | 1.5 | -0.15px | `--text-caption` |
| body-sm | 14px | 1.47 | -0.18px | `--text-body-sm` |
| subheading | 18px | 1.24 | -0.22px | `--text-subheading` |
| callout | 21px | 1.19 | -0.28px | `--text-callout` |
| heading-sm | 24px | 1.33 | -0.24px | `--text-heading-sm` |
| heading-lg | 28px | 1.14 | 0.29px | `--text-heading-lg` |
| display-xl | 34px | 1 | -0.1px | `--text-display-xl` |
| display-xxl | 40px | 1.1 | 0.44px | `--text-display-xxl` |
| display-giant | 44px | 2.12 | — | `--text-display-giant` |
| display | 56px | 1.07 | -0.28px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px
**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 52 | 52px | `--spacing-52` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| lists | 999px |
| images | 8px |
| inputs | 0px |
| buttons | 980px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| xl | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0px` | `--shadow-xl` |

### Layout

- **Section gap:** 70px
- **Card padding:** 15px
- **Element gap:** 10px

## Components

### Primary Filled Button
Solid Interactive Blue background (#0071e3) with Pure White text (#ffffff), 980px pill-shape radius. Padding: 11px vertical, 21px horizontal.

### Outline Link Button
Transparent background with Action Blue text (#0066cc) and matching border. 980px pill radius. Padding: 11px vertical, 21px horizontal.

### Text Link Button
Transparent background, Midnight Graphite text (#1d1d1f). No border, 0px padding. For subtle interactions.

### Navigation Link
Transparent background, Midnight Graphite text (#1d1d1f). Typically 8px padding, 4px left margin.

### Product Section Hero
Full-width, headline in SF Pro Display (56px, weight 600) on Canvas White (#f5f5f7). Large product imagery below headline, minimal padding.

### Featured Content Card
Transparent background, 0px border-radius, no shadow. Full-bleed content.

### Interactive Dropdown/Input
Light background (#e2e2e5), Midnight Graphite text, underline border when active. Focus: Interactive Blue (#2997ff) border/glow. Padding: 8px.

## Do's and Don'ts

### Do
- Prioritize SF Pro Display for headlines (21px+) with specific letter spacing and 'numr' feature
- Use SF Pro Text for body, UI labels, navigation (300 for captions, 400 for body, 600 for labels)
- Apply 980px border-radius for all primary and secondary buttons
- Use Interactive Blue (#0071e3) for interactive elements, Action Blue (#0066cc) for link text
- Maintain hierarchy: Midnight Graphite → Deep Gray → Medium Gray for text
- Frame product imagery tightly as the central visual element
- Use 10px element gap and 15px card padding

### Don't
- Avoid harsh drop shadows; use subtle background color shifts and light box-shadows
- Don't deviate from pill-shape radius for buttons
- Avoid heavily saturated backgrounds except for accent areas
- No decorative borders around content blocks
- Avoid excessive letter spacing on body/caption text
- Don't use generic system link styles
- Don't add extraneous visual elements that compete with product imagery

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas White | `#f5f5f7` | Dominant page background |
| 1 | Pure White | `#ffffff` | Elevated UI elements, navigation backgrounds |
| 2 | Lightest Gray Background | `#e2e2e5` | Subtle background for interactive elements |
| 3 | Pale Blue Overlay | `#9fc6f4` | Accent surface for specific sections |

## Quick Color Reference
- Text Primary: #1d1d1f (Midnight Graphite)
- Background Canvas: #f5f5f7 (Canvas White)
- Call To Action: #0071e3 (Interactive Blue)
- Border/Divider: #d6d6d6 (Border Silver)
- Link/Outline Button: #0066cc (Action Blue)

## CSS Custom Properties

```css
:root {
  --color-midnight-graphite: #1d1d1f;
  --color-deep-gray: #333333;
  --color-charcoal-grey: #474747;
  --color-medium-gray: #707070;
  --color-light-gray: #858585;
  --color-light-silver: #c7c7c7;
  --color-border-silver: #d6d6d6;
  --color-lightest-gray-background: #e2e2e5;
  --color-canvas-white: #f5f5f7;
  --color-pure-white: #ffffff;
  --color-true-black: #000000;
  --color-interactive-blue: #0071e3;
  --color-action-blue: #0066cc;
  --color-sky-blue-highlight: #2997ff;
  --color-cerulean-shine: #3397d4;
  --color-pale-blue-overlay: #9fc6f4;
  --color-vibrant-orange: #ec893c;
  --color-deep-plum: #7424b5;
  --color-blush-pink: #ea33c0;
  --color-warm-taupe: #604630;
  --color-cool-teal: #485b5;

  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, sans-serif;

  --text-caption: 12px; --leading-caption: 1.5; --tracking-caption: -0.15px;
  --text-body-sm: 14px; --leading-body-sm: 1.47; --tracking-body-sm: -0.18px;
  --text-subheading: 18px; --leading-subheading: 1.24; --tracking-subheading: -0.22px;
  --text-callout: 21px; --leading-callout: 1.19; --tracking-callout: -0.28px;
  --text-heading-sm: 24px; --leading-heading-sm: 1.33; --tracking-heading-sm: -0.24px;
  --text-heading-lg: 28px; --leading-heading-lg: 1.14; --tracking-heading-lg: 0.29px;
  --text-display-xl: 34px; --leading-display-xl: 1; --tracking-display-xl: -0.1px;
  --text-display-xxl: 40px; --leading-display-xxl: 1.1; --tracking-display-xxl: 0.44px;
  --text-display-giant: 44px; --leading-display-giant: 2.12;
  --text-display: 56px; --leading-display: 1.07; --tracking-display: -0.28px;

  --font-weight-light: 300; --font-weight-regular: 400;
  --font-weight-semibold: 600; --font-weight-bold: 700;

  --spacing-8: 8px; --spacing-12: 12px; --spacing-16: 16px;
  --spacing-20: 20px; --spacing-24: 24px; --spacing-40: 40px;
  --spacing-48: 48px; --spacing-52: 52px;

  --section-gap: 70px; --card-padding: 15px; --element-gap: 10px;

  --radius-cards: 0px; --radius-lists: 999px; --radius-images: 8px;
  --radius-inputs: 0px; --radius-buttons: 980px;

  --shadow-xl: rgba(0, 0, 0, 0.22) 3px 5px 30px 0px;

  --surface-canvas-white: #f5f5f7; --surface-pure-white: #ffffff;
  --surface-lightest-gray-background: #e2e2e5; --surface-pale-blue-overlay: #9fc6f4;
}
```

## Tailwind v4

```css
@theme {
  --color-midnight-graphite: #1d1d1f;
  --color-deep-gray: #333333;
  --color-charcoal-grey: #474747;
  --color-medium-gray: #707070;
  --color-light-gray: #858585;
  --color-light-silver: #c7c7c7;
  --color-border-silver: #d6d6d6;
  --color-lightest-gray-background: #e2e2e5;
  --color-canvas-white: #f5f5f7;
  --color-pure-white: #ffffff;
  --color-true-black: #000000;
  --color-interactive-blue: #0071e3;
  --color-action-blue: #0066cc;
  --color-sky-blue-highlight: #2997ff;
  --color-cerulean-shine: #3397d4;
  --color-pale-blue-overlay: #9fc6f4;
  --color-vibrant-orange: #ec893c;
  --color-deep-plum: #7424b5;
  --color-blush-pink: #ea33c0;
  --color-warm-taupe: #604630;
  --color-cool-teal: #485b5;

  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, sans-serif;

  --text-caption: 12px; --leading-caption: 1.5; --tracking-caption: -0.15px;
  --text-body-sm: 14px; --leading-body-sm: 1.47; --tracking-body-sm: -0.18px;
  --text-subheading: 18px; --leading-subheading: 1.24; --tracking-subheading: -0.22px;
  --text-callout: 21px; --leading-callout: 1.19; --tracking-callout: -0.28px;
  --text-heading-sm: 24px; --leading-heading-sm: 1.33; --tracking-heading-sm: -0.24px;
  --text-heading-lg: 28px; --leading-heading-lg: 1.14; --tracking-heading-lg: 0.29px;
  --text-display-xl: 34px; --leading-display-xl: 1; --tracking-display-xl: -0.1px;
  --text-display-xxl: 40px; --leading-display-xxl: 1.1; --tracking-display-xxl: 0.44px;
  --text-display-giant: 44px; --leading-display-giant: 2.12;
  --text-display: 56px; --leading-display: 1.07; --tracking-display: -0.28px;

  --spacing-8: 8px; --spacing-12: 12px; --spacing-16: 16px;
  --spacing-20: 20px; --spacing-24: 24px; --spacing-40: 40px;
  --spacing-48: 48px; --spacing-52: 52px;

  --radius-lg: 8px; --radius-lg-2: 11px; --radius-full: 980px; --radius-full-2: 999px;
  --shadow-xl: rgba(0, 0, 0, 0.22) 3px 5px 30px 0px;
}
```
