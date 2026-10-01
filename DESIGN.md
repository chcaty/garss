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
  android-heading:
    fontFamily: "Editorial, serif"
    fontSize: "24px"
    lineHeight: 1.5
  android-title:
    fontFamily: "sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.55
  android-summary:
    fontFamily: "sans-serif"
    fontSize: "14px"
    lineHeight: 1.7
  android-detail-title:
    fontFamily: "sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.5
  android-detail-body:
    fontFamily: "sans-serif"
    fontSize: "18px"
    lineHeight: 1.9
rounded:
  control: "4px"
  badge: ".35rem"
  status: ".4rem"
  android-field: "12px"
spacing:
  compact: ".4rem"
  small: ".75rem"
  base: "1rem"
  section: "1.5rem"
  large: "2rem"
  column: "3rem"
  android-gutter: "20px"
  android-detail-gutter: "24px"
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
  manual-source-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".7rem"
  android-search:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.android-field}"
    padding: "12px 16px"
  android-bottom-navigation:
    backgroundColor: "{colors.panel}"
    height: "72px"
---

# Design System: 嘎!RSS

## Overview

**Creative North Star: "A daily reading desk"**

Warm paper, restrained olive and Chinese serif headings establish a simple editorial world. Headlines carry the reading surface; compact sans controls support browsing and local curation. Rules and spacing provide structure without a decorative card grid.

Android extends the same reading desk with native Material 3 controls, platform back navigation and four bottom destinations. Its editorial introduction retains the serif identity; article text uses the platform sans for accessible native reading.

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

Android bundles the same heading subset as `Editorial`; its license is `app/assets/OFL.txt`. Android values in the frontmatter describe Flutter logical pixels at base text scale. List titles use the native title role, summaries stop at three lines, and metadata is (12px). Read titles soften to muted ink at weight (500); unread titles use weight (700) and a small olive dot. Article title and summary sizes multiply by the user's reading scale (1.0–1.4), in addition to platform text scaling. The detail summary is selectable text with generous leading.

## Layout

Content is centered within (1280px). The desktop reader pairs a publisher index (220px) with a flexible headline column and a (3rem) gutter. At (950px) the index narrows to (175px) with a (1.75rem) gutter. Below (1350px), reader margins are (2rem).

At (720px) and below, margins become (1rem), headings stack, search spans the column, and the publisher list becomes a horizontally scrollable source strip. Preserve touch targets and source counts in that strip.

The review filters become two columns at (1050px), with search spanning both and transfer controls below selection actions. At (720px), the desktop table becomes labeled mobile rows: feed and checkbox first, source/category/status below, then a separated action row. Candidate actions use three columns and route actions two. Long titles and paths wrap within available width.

Pages manual source entry is an expandable, ruled section with two field columns and (1rem) gaps. At (640px) it becomes one column with (16px) field text. Fetch controls wrap with (.75rem) gaps; explanatory and result text spans the section.

Android uses one scrolling column: editorial heading and sync status, search, wrapping unread/count/order controls, source dropdown, then ruled article rows. The list uses the native gutter, with row padding (20px 18px 20px 20px). Detail content uses the wider native detail gutter. The bottom bar stays available on the four main destinations: reading, favorites, sources and settings. Article detail and original-page views use the native app bar and back stack. Sources are searchable switch rows; settings use a text-size slider and image switch.

## Elevation & Depth

Reading and review surfaces are flat. Borders, rules and pale selected backgrounds establish grouping; ordinary lists and controls have no shadows. Only the fixed notification uses a shadow, recorded in the sidecar. Reduced-motion preference disables transitions and animation.

Android app bars have zero elevation and transparent surface tint; article rows remain flat. Native controls retain Material interaction feedback and platform motion rather than inheriting web hover behavior. A thin progress strip and textual sync result keep loading visible.

## Shapes

Controls and workbench containers have lightly curved corners using the control radius. Badges and status labels use their small dedicated radii. The masthead mark is square; tiny status dots are circular. Reading headlines remain ruled rows, without enclosing cards.

Android fields and publisher-image clips use the native field radius. Publisher images crop to full row width at (180px) high in the stream and (220px) in detail; failed images collapse away. The logo reuses `docs/_media/review-icon-192.png`, bundled as `app/assets/logo.png` and displayed at (32px) in the native app bar.

## Components

- **Buttons:** solid olive for primary and approval, bordered panel for quiet actions, pale red for rejection. Minimum height is (44px). Approval hover uses dark olive; review pointer hover also applies `brightness(.96)`. Disabled actions use opacity (.45).
- **Fields:** panel background, thin line border and control radius. Review focus changes the border to olive. Shared keyboard focus is a (2px) olive outline with (4px) offset; file import uses its separate visible focus treatment.
- **Navigation:** muted sans links underline when current or hovered. Review tabs show olive text on panel when active; roving tab stops and Left/Right/Home/End keyboard navigation follow the selected panel.
- **Source buttons:** muted text at rest, pale olive and stronger olive text when pressed. Desktop rows become the mobile source strip.
- **Article rows:** serif linked title below publisher/date metadata, thin bottom rule and trailing arrow. Hover underlines the title and turns it olive.
- **Review rows:** structured table on desktop; labeled flat containers on mobile. Selection, approval and rejection remain visible alongside textual status. Badges communicate source capabilities; status combines a colored dot with text.
- **Notifications:** ink surface with white text, fixed near the safe bottom/right edges; mobile width spans between the page margins.
- **Manual source proposal:** native HTML details with a plus/minus marker, labeled name/address/category/optional-description fields, and an olive submit action. The live status makes the GitHub branch/PR handoff and backup explicit; submission is a proposal, with inclusion after validation and merge.
- **Manual fetch:** quiet actions for opening GitHub, refreshing the published result and maintaining the source directory. The result line identifies the latest publication and explains that the previous valid snapshot remains visible during a run.
- **Android reading:** search with clear action, unread chip, source dropdown and order menu above a flat list. Bookmark icons have action tooltips; tapping a row marks it read and opens detail. Pull-to-refresh and the app-bar sync action share visible loading state; retry and empty states provide explanatory text.
- **Android article detail:** title, date, optional publisher image, selectable summary, primary original-page action, browser alternative and mark-unread action. Original pages use a WebView with progress, reload, browser fallback and a visible main-page load error.
- **Android navigation:** native four-destination bottom bar with pale olive selection indicator on panel, plus platform switches and slider for preferences. Material seed-derived interaction colors are platform defaults; the shared explicit palette remains normative for custom surfaces.

## Do's and Don'ts

The masthead and browser tab use the existing repository RSS icon (`docs/_media/review-icon-192.png`); its 512px variant remains the installed PWA icon. The old landscape favicon and boxed text placeholder are not part of the current identity. Candidate rows show dated link observations, explicitly distinguishing valid, invalid, uncertain, untested and expired results.

### Do:

- **Do** preserve warm paper, restrained olive and serif reading hierarchy.
- **Do** retain visible keyboard focus and (44px) primary touch targets.
- **Do** adapt source navigation and review rows to narrow screens.
- **Do** extend the licensed heading subset when heading copy changes.
- **Do** preserve native text scaling, back navigation and labeled Android controls.
- **Do** explain GitHub handoffs and show the published result beside manual fetch controls.

### Don't:

- **Don't** turn the reading list into a decorative card grid.
- **Don't** add shadows to ordinary reading or workbench surfaces.
- **Don't** use color alone to convey a review decision.
