---
name: "嘎!RSS"
description: "Warm paper and simple editorial reading and curation."
colors:
  paper: "#f7f5ef"
  panel: "#fdfcf8"
  ink: "#252820"
  muted: "#66695e"
  line: "#deddd3"
  green: "#52613b"
  green-soft: "#ecf0e3"
  olive-deep: "#414e2f"
  red: "#9b4139"
  red-soft: "#f6e9e5"
  amber: "#805d24"
  white: "#ffffff"
typography:
  display:
    fontFamily: '"GARSS Editorial", "Songti SC", SimSun, serif'
    fontSize: "clamp(2.5rem, 4.5vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.025em"
  headline:
    fontFamily: '"GARSS Editorial", "Songti SC", SimSun, serif'
    fontSize: "clamp(2rem, 3.5vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.025em"
  title:
    fontFamily: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.65
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: ".85rem"
    lineHeight: 1.8
  label:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: ".72rem"
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: ".75rem"
    lineHeight: 1.6
rounded:
  control: "4px"
  badge: ".35rem"
  status: ".4rem"
spacing:
  compact: ".4rem"
  small: ".75rem"
  base: "1rem"
  section: "1.5rem"
  large: "2rem"
  column: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: ".55rem .85rem"
  button-primary-hover:
    backgroundColor: "{colors.olive-deep}"
    textColor: "{colors.white}"
  button-quiet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".55rem .8rem"
  button-reject:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    rounded: "{rounded.control}"
    padding: ".55rem .8rem"
  search:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".7rem .85rem"
  source-selected:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.control}"
    padding: ".75rem"
  status-approved:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.status}"
    padding: ".35rem .5rem"
---

# Design System: 嘎!RSS

## Overview

**Creative North Star: "A daily reading desk"**

Warm paper, restrained olive and Chinese serif headings establish a simple editorial world. Headlines carry the reading surface; compact sans controls support browsing and local curation. Rules and spacing provide structure without a decorative card grid.

**Key Characteristics:**

- Warm paper with quiet panel surfaces.
- Serif reading hierarchy and compact sans controls.
- Flat, ruled lists with visible decision states.

## Colors

### Primary

Olive (`green`) identifies publishers, selected sources and approval actions; dark olive (`olive-deep`) supplies approval hover. Pale olive (`green-soft`) marks selection and approved status.

### Neutral

Paper is the page canvas; panel is the lighter field and workbench surface. Ink carries headings and important text, muted carries supporting labels, and line separates rows and regions. White supplies text on solid actions.

Red and pale red distinguish rejection. Amber identifies pending or offline state. These are functional status colors, not additional brand accents.

**The Decision Color Rule.** Pair status color with text or a visible control state.

## Typography

Display and workbench headings use the self-hosted **GARSS Editorial** subset of Noto Serif SC (600), with Songti SC and SimSun fallbacks. The subset covers only the two current page headings, uses `font-display: swap`, and carries SIL OFL 1.1 provenance in `docs/assets/fonts/README.md` and `OFL.txt`. Update the subset when heading text changes.

Article titles use device Chinese serif fonts; controls and supporting copy use PingFang SC, Microsoft YaHei and system sans. Route paths use monospace. The frontmatter records the observed roles, not a universal body size: dense row text is smaller than introductory copy.

Reading titles have generous leading; metadata remains compact. At mobile width the reading heading becomes (2.75rem), article titles become (1.12rem), and search/filter fields use (16px). Counts use tabular numerals.

## Layout

Content is centered within (1280px). The desktop reader pairs a publisher index (220px) with a flexible headline column and a (3rem) gutter. At (950px) the index narrows to (175px) with a (1.75rem) gutter. Below (1350px), reader margins are (2rem).

At (720px) and below, margins become (1rem), headings stack, search spans the column, and the publisher list becomes a horizontally scrollable source strip. Preserve touch targets and source counts in that strip.

The review filters become two columns at (1050px), with search spanning both and transfer controls below selection actions. At (720px), the desktop table becomes labeled mobile rows: feed and checkbox first, source/category/status below, then a separated action row. Candidate actions use three columns and route actions two. Long titles and paths wrap within available width.

## Elevation & Depth

Reading and review surfaces are flat. Borders, rules and pale selected backgrounds establish grouping; ordinary lists and controls have no shadows. Only the fixed notification uses a shadow, recorded in the sidecar. Reduced-motion preference disables transitions and animation.

## Shapes

Controls and workbench containers have lightly curved corners using the control radius. Badges and status labels use their small dedicated radii. The masthead mark is square; tiny status dots are circular. Reading headlines remain ruled rows, without enclosing cards.

## Components

- **Buttons:** solid olive for primary and approval, bordered panel for quiet actions, pale red for rejection. Minimum height is (44px). Approval hover uses dark olive; review pointer hover also applies `brightness(.96)`. Disabled actions use opacity (.45).
- **Fields:** panel background, thin line border and control radius. Review focus changes the border to olive. Shared keyboard focus is a (2px) olive outline with (4px) offset; file import uses its separate visible focus treatment.
- **Navigation:** muted sans links underline when current or hovered. Review tabs show olive text on panel when active; roving tab stops and Left/Right/Home/End keyboard navigation follow the selected panel.
- **Source buttons:** muted text at rest, pale olive and stronger olive text when pressed. Desktop rows become the mobile source strip.
- **Article rows:** serif linked title below publisher/date metadata, thin bottom rule and trailing arrow. Hover underlines the title and turns it olive.
- **Review rows:** structured table on desktop; labeled flat containers on mobile. Selection, approval and rejection remain visible alongside textual status. Badges communicate source capabilities; status combines a colored dot with text.
- **Notifications:** ink surface with white text, fixed near the safe bottom/right edges; mobile width spans between the page margins.

## Do's and Don'ts

### Do:

- **Do** preserve warm paper, restrained olive and serif reading hierarchy.
- **Do** retain visible keyboard focus and (44px) primary touch targets.
- **Do** adapt source navigation and review rows to narrow screens.
- **Do** extend the licensed heading subset when heading copy changes.

### Don't:

- **Don't** turn the reading list into a decorative card grid.
- **Don't** add shadows to ordinary reading or workbench surfaces.
- **Don't** use color alone to convey a review decision.
