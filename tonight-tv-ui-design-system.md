# Tonight TV — UI Design System

**Version:** 1.0  
**Status:** Frontend Visual Contract  
**Last updated:** 2026-08-17  
**Stack target:** Next.js + React + TypeScript  
**Scope:** Visual design system, interaction styling, responsive rules, accessibility baseline, and reusable UI primitives for the Tonight TV MVP.

---

# 0. Authority and Relationship to Other Specs

This document is the visual source of truth for Tonight TV.

Use the project specifications in this order:

1. Current explicit user instruction.
2. Repository-level instructions (`AGENTS.md`, `CLAUDE.md`, etc.).
3. `tonight-tv-supabase-backend-spec.md` for backend/security/Supabase mechanics.
4. `tonight-tv-nextjs-supabase-spec.md` for product scope and overall architecture.
5. `tonight-tv-ui-supabase-wiring-spec.md` for frontend-to-backend behavior.
6. **This document** for visual tokens, component styling, layout, states, and accessibility.
7. `tonight-tv-ui-screen-architecture.md` for screen composition and UX flows.
8. `tonight-tv-ui-ai-implementation-prompts.md` is an execution guide, not a source of product truth.

If this visual document conflicts with a backend authorization or synchronization invariant, the backend invariant wins.

---

# 1. Product Visual North Star

Tonight TV is a **private live channel for friends**, not a streaming catalog.

The interface should feel like:

> A premium collaborative product wrapped around a private cinema room.

The room experience must immediately answer:

- What is playing?
- Am I live/synchronized?
- Who is watching?
- What is next?
- Where is chat?
- What can I control in my role?

The hierarchy is always:

```text
VIDEO
  -> LIVE / synchronization state
  -> playback controls appropriate to role
  -> NOW PLAYING
  -> Chat / Up Next
  -> Presence
  -> secondary settings
```

The video must remain the strongest visual object in the room.

---

# 2. Non-Negotiable Visual Rules

## 2.1 Dark cinema-first only

The MVP uses one intentional dark theme. Do not build a light theme unless requested later.

## 2.2 No generic "AI UI" styling

Avoid:

- purple/blue gradients across cards,
- neon glows,
- glassmorphism everywhere,
- excessive blur,
- large decorative blobs,
- floating glass cards for every section,
- oversized empty whitespace,
- arbitrary analytics widgets,
- every element inside a pill,
- heavy borders around every card,
- excessive drop shadows,
- fake luxury/3D rendering,
- Netflix-style catalog rails.

## 2.3 Surface hierarchy, not border hierarchy

Use tonal surface changes to separate regions.

Preferred hierarchy:

```text
Canvas
  -> Surface 1
      -> Surface 2
          -> Interactive / Elevated Surface
```

Borders are for:

- focus,
- active selection,
- destructive/warning emphasis,
- fields when needed,
- separators when tonal difference alone is insufficient.

## 2.4 No duplicated player timeline

This rule is critical.

- Do not use native `<video controls>`.
- Do not render a seekable timeline over the video and another timeline below it.
- The **admin has exactly one shared seek timeline**, inside the admin control area.
- The **viewer has no seekable timeline**.
- A viewer may see textual elapsed/total time, LIVE state, or behind-live information, but not an interactive shared seek bar.

## 2.5 Role clarity is visible

The UI must communicate authority before the backend rejects anything.

Admin-only shared actions:

```text
Play
Pause
Shared Seek
Restart
Play Next
Select Media / Play Now
Queue editing
Subtitle management
Room rename/settings
```

Viewer-local actions:

```text
Volume / Mute
Subtitles
Picture-in-Picture
Fullscreen
GO LIVE
Start Watching when autoplay is blocked
```

---

# 3. Color System

The palette is dark neutral/slate with blue for interaction and green for LIVE/synchronization.

Do not use green as the general primary action color; preserve green's semantic meaning.

## 3.1 Core palette

| Token | Value | Intended use |
|---|---:|---|
| `canvas` | `#080C12` | App/background canvas |
| `surface-1` | `#0D131C` | Main cards / panels |
| `surface-2` | `#111927` | Elevated sections / sidebar surfaces |
| `surface-3` | `#172131` | Inputs / hoverable cards / control wells |
| `surface-hover` | `#1B2637` | Hover state on neutral surfaces |
| `text-primary` | `#F4F7FB` | Headings, primary labels |
| `text-secondary` | `#A9B3C1` | Body, metadata |
| `text-muted` | `#7D899A` | Timestamps, helper text |
| `text-disabled` | `#586373` | Disabled controls |
| `accent` | `#4B66F5` | Primary interaction / selected state |
| `accent-hover` | `#425DE8` | Hovered primary action |
| `accent-pressed` | `#374CC7` | Pressed primary action |
| `accent-soft` | `rgba(75, 102, 245, 0.14)` | Selected row / highlighted message |
| `live` | `#32D583` | LIVE, synced, connected, online |
| `live-soft` | `rgba(50, 213, 131, 0.10)` | LIVE/synced background |
| `warning` | `#F5B942` | Recoverable warning / attention |
| `warning-soft` | `rgba(245, 185, 66, 0.10)` | Warning surface |
| `danger` | `#F97066` | Destructive/error |
| `danger-soft` | `rgba(249, 112, 102, 0.10)` | Error surface |
| `separator` | `rgba(255,255,255,0.06)` | Minimal separators |
| `focus-ring` | `#8EA2FF` | Keyboard focus |
| `overlay` | `rgba(0,0,0,0.62)` | Dialog/overlay backdrop |

The selected text colors provide strong contrast against the dark canvas/surfaces. Primary button text must remain legible; use white on `accent` and do not replace the accent with a much lighter blue without checking contrast.

## 3.2 Semantic rules

### Blue means interaction

Use blue for:

- primary buttons,
- selected tabs,
- active sliders,
- focus-associated accents,
- interactive link emphasis,
- selected control state.

### Green means live/healthy

Use green for:

- `LIVE`,
- `Synced`,
- connected/online status,
- active Presence dot,
- successful recovery.

Do not use green for ordinary Save/Add/Send buttons.

### Amber means attention, not failure

Use warning for:

- behind-live state,
- expiring/recoverable media conditions,
- playback permission guidance when appropriate.

### Red means failure/destruction

Use danger for:

- invalid source,
- unrecoverable media error,
- delete/remove confirmations,
- failed commands that require intervention.

---

# 4. CSS Token Contract

Use semantic CSS variables as the source of truth. Tailwind utilities may reference these variables.

```css
:root {
  color-scheme: dark;

  --tt-canvas: #080C12;
  --tt-surface-1: #0D131C;
  --tt-surface-2: #111927;
  --tt-surface-3: #172131;
  --tt-surface-hover: #1B2637;

  --tt-text-primary: #F4F7FB;
  --tt-text-secondary: #A9B3C1;
  --tt-text-muted: #7D899A;
  --tt-text-disabled: #586373;

  --tt-accent: #4B66F5;
  --tt-accent-hover: #425DE8;
  --tt-accent-pressed: #374CC7;
  --tt-accent-soft: rgba(75, 102, 245, 0.14);

  --tt-live: #32D583;
  --tt-live-soft: rgba(50, 213, 131, 0.10);
  --tt-warning: #F5B942;
  --tt-warning-soft: rgba(245, 185, 66, 0.10);
  --tt-danger: #F97066;
  --tt-danger-soft: rgba(249, 112, 102, 0.10);

  --tt-separator: rgba(255, 255, 255, 0.06);
  --tt-focus-ring: #8EA2FF;
  --tt-overlay: rgba(0, 0, 0, 0.62);

  --tt-radius-xs: 6px;
  --tt-radius-sm: 8px;
  --tt-radius-md: 12px;
  --tt-radius-lg: 16px;
  --tt-radius-xl: 20px;
  --tt-radius-pill: 999px;

  --tt-shadow-popover: 0 16px 48px rgba(0, 0, 0, 0.38);
  --tt-shadow-floating: 0 8px 28px rgba(0, 0, 0, 0.28);
}
```

Do not hardcode new component-specific colors when an existing semantic token is correct.

---

# 5. Typography

Use a modern neutral sans-serif already appropriate to the repository. If the app has no established font, prefer **Geist** or **Inter** without adding multiple font families.

## 5.1 Type scale

| Role | Desktop | Mobile | Weight | Line height |
|---|---:|---:|---:|---:|
| Display/room title | 28–32px | 24–28px | 650–700 | 1.15 |
| Media title | 24–28px | 20–24px | 600–650 | 1.2 |
| Section heading | 16–18px | 16px | 600 | 1.3 |
| Body | 14–16px | 14–16px | 400–500 | 1.45–1.55 |
| Control label | 14px | 13–14px | 500–600 | 1.2 |
| Metadata | 12–14px | 12–13px | 400–500 | 1.35 |
| Eyebrow | 11–12px | 11px | 600–700 | 1.2 |

Use uppercase only for short labels such as `NOW PLAYING`, not for paragraphs or button labels.

Use tabular numerals for elapsed/duration displays if the font supports it.

---

# 6. Spacing

Use a 4px base grid.

Canonical spacing values:

```text
4  8  12  16  20  24  32  40  48
```

Rules:

- Desktop viewport gutter: 20–24px.
- Main desktop content gap: 16px.
- Card padding: 16–20px.
- Compact control padding: 8–12px.
- Mobile gutter: 12–16px.
- Avoid landing-page-scale whitespace inside the room.
- Do not compress touch targets below accessibility requirements merely to make the interface dense.

---

# 7. Radius

Use moderate radii. Do not make every rectangle a pill.

```text
Small icon button: 8–10px
Inputs/buttons: 10–12px
Cards/panels: 14–16px
Large video/major frame: 16px
Dialog/sheet: 16–20px
Status pill: full pill only when semantically appropriate
```

---

# 8. Borders, Separators, and Elevation

## 8.1 Cards

Default cards do not need a visible border.

Use:

- a one-step lighter surface,
- minimal shadow only for floating layers,
- separator lines at low opacity when necessary.

## 8.2 Inputs

Idle inputs may use a subtle tonal edge or `separator` border.

Focus state must be obvious:

```text
2px focus ring using focus-ring
+ optional 1px accent inset/edge
```

## 8.3 Popovers/dialogs

Floating layers may use `--tt-shadow-popover` and a subtle separator edge.

---

# 9. Motion

Motion is functional and restrained.

| Interaction | Duration |
|---|---:|
| Hover/pressed | 120–160ms |
| Tab selection | 160–200ms |
| Drawer/sheet | 180–240ms |
| Dialog opacity/scale | 160–220ms |
| Status transition | 140–180ms |

Rules:

- No bouncing LIVE indicator.
- No glowing pulses as continuous decoration.
- Avoid large spring movement.
- Respect `prefers-reduced-motion`.
- Player/synchronization corrections should not be represented by distracting animation.

---

# 10. Layout System

## 10.1 Desktop room

Preferred application shell:

```text
Top Bar
Main Grid:  minmax(0, 1fr) + 320–390px sidebar
```

Typical balance:

```text
Main player/content: ~72–75%
Sidebar: ~25–28%
Gap: 16px
```

Do not force exact percentage if the viewport would make the sidebar unusably narrow.

Suggested max content width: 1600px–1720px with flexible full-width behavior below that.

## 10.2 Tablet

At intermediate widths:

- keep video first,
- reduce sidebar width,
- allow sidebar to move below if content becomes cramped,
- do not shrink player controls into unreadable density.

## 10.3 Mobile

Stack:

```text
Header
Video
Now Playing / Sync Status
Role Controls
Chat | Up Next tabs
Active tab content
Presence strip
```

No persistent right sidebar.

---

# 11. Breakpoints

Use the repository's existing breakpoint system. If none exists, design around these behavior thresholds rather than treating them as branding constants:

```text
< 640px        mobile
640–899px      large mobile / small tablet
900–1199px     tablet / compact desktop
>= 1200px      desktop two-column room
```

Responsive behavior matters more than exact numbers.

---

# 12. Iconography

Use one outline icon family consistently. If the project already has an icon package, reuse it. Otherwise a restrained set such as Lucide is suitable.

Rules:

- default icon size: 18–20px,
- large media action: 20–24px,
- no mixed 3D/filled/cartoon icon styles,
- icon-only controls require tooltips on pointer devices and accessible labels,
- destructive actions should not rely on a red trash icon without textual context in a menu/dialog.

---

# 13. Button System

## 13.1 Primary

Use for the single strongest action in a local context.

Examples:

- `JOIN LIVE`
- Admin `Play`/`Pause` primary action
- `GO LIVE` when significantly behind
- Confirm Add Media

Style:

- accent background,
- white text,
- 40–44px desktop minimum height,
- 44–48px mobile/touch minimum target.

## 13.2 Secondary

Neutral elevated surface for important but non-primary actions.

Examples:

- Restart
- Play Next
- Add subtitle
- Copy room link

## 13.3 Ghost

For utilities:

- Settings
- More menu
- Close
- non-destructive toolbar actions

## 13.4 Destructive

Use danger only for actions such as Delete media/subtitle.

Destructive confirmation should identify the object being deleted and explain restrictions such as "Current media cannot be deleted."

## 13.5 Disabled/loading

Disabled state:

- no pointer interaction,
- reduced but still readable contrast,
- never use disabled state to hide an authorization problem.

Loading state:

- preserve button width,
- compact spinner/progress indicator,
- keep action label or a clear replacement (`Joining…`, `Saving…`).

---

# 14. Status Components

## 14.1 LIVE badge

Use:

- green indicator,
- text label,
- compact shape.

Never communicate LIVE with color alone.

Examples:

```text
● LIVE
● Synced
```

## 14.2 Behind live

Use warning semantics:

```text
12s behind live   [GO LIVE]
```

Do not display milliseconds to users.

## 14.3 Reconnecting

Use neutral/warning status, not a blocking full-screen modal unless the room cannot continue.

```text
Reconnecting…
```

## 14.4 Catching up

```text
Catching up to live…
```

This may use blue/green semantics depending on whether the sync engine is actively recovering or has completed.

---

# 15. Video Surface Contract

The video region is an immersive canvas, not a native browser player UI.

## 15.1 Never enable native controls

Do not use:

```html
<video controls>
```

for the normal Tonight TV room experience.

The application owns its controls.

## 15.2 Overlay content

Allowed subtle overlays:

- `Private Room`,
- quality label only if the runtime truly knows it,
- buffering/error/start-watching state,
- fullscreen-local control overlay if required,
- optional temporary title/status on pointer movement.

Do not permanently overlay a full control bar when the separate role-specific control surface already exists.

## 15.3 Aspect ratio

Default player framing: 16:9.

Preserve source aspect ratio inside the video frame. Do not crop media arbitrarily just to fill the card.

---

# 16. Admin Playback Control Component

The admin owns one shared timeline.

Structure:

```text
ADMIN CONTROLS
[Restart] [Play/Pause] [Play Next]

elapsed  ━━━━━━━━━━━━━━━━━━━━━━━━━  duration
                 shared seek

[Volume] [Subtitles] [PiP] [Fullscreen]
```

Rules:

- The seek slider is the only shared timeline control in the interface.
- Scrubbing is an admin-only intent that becomes authoritative only after the backend accepts the seek RPC.
- Local control events must not accidentally send duplicate shared commands.
- Show command feedback such as `Paused for everyone` only when useful; prefer a short toast/status, not a persistent large banner.

---

# 17. Viewer Control Component

Viewer controls:

```text
[Volume] [Subtitles] [PiP] [Fullscreen] [GO LIVE]
```

Optional non-interactive information:

```text
01:24:17 / 02:15:42
● LIVE
```

Rules:

- no seek slider,
- no shared play/pause,
- no next/previous,
- GO LIVE is a local recovery action,
- if autoplay is blocked, show `START WATCHING` as a local user-gesture action.

---

# 18. Now Playing Card

Purpose: identify current media and live state without turning the room into a catalog page.

Recommended content:

- `NOW PLAYING` eyebrow,
- title,
- elapsed / duration when known,
- source/status metadata only if useful,
- short one-line/two-line description only if actual metadata exists,
- LIVE/sync state.

Poster artwork is optional. The UI must look complete without a poster field in the backend. Use a tasteful generated/fallback media tile rather than a broken image placeholder.

---

# 19. Chat Component

Desktop: right sidebar.  
Mobile: active tab content.

Rules:

- compact avatar,
- name + timestamp,
- plain-text message,
- no oversized bubbles for every message,
- current user's message may have a subtle accent surface,
- no Markdown/rich text,
- no GIF/reaction/typing-indicator product expansion in MVP,
- input stays accessible at the bottom of the panel when possible.

Input:

```text
[ Message everyone…                    ] [Send]
```

Do not depend on an icon-only send affordance when text/space allows a clear button.

---

# 20. Up Next / Queue

Rows are compact and information-dense.

Row content:

- optional thumbnail/fallback,
- title,
- duration only if actually known,
- current item state if relevant,
- owner-only overflow/drag actions.

Viewer:

- read-only,
- no menus implying edit permission.

Admin:

- add,
- edit,
- reorder,
- delete non-current media,
- Play Now / Play Next.

Do not use a large poster carousel.

---

# 21. Presence

Presence is a compact social cue, not a profile system.

Recommended:

```text
8 watching   [avatars…] [+2]
```

Use:

- green dot for online,
- crown/operator marker for owner,
- deduplicated logical watchers.

Do not expose technical session IDs in UI.

---

# 22. Tabs and Segmented Navigation

Use tabs for `Chat` / `Up Next`.

Preferred active treatment:

- stronger text,
- thin accent indicator,
- subtle background only if needed.

Avoid placing both tabs inside large independent pills.

Tabs must support keyboard navigation and visible focus.

---

# 23. Forms

## 23.1 Add/Edit Media

Fields:

```text
Title
Source Type: Auto | MP4 | HLS | YouTube | Torrent
Conditional direct URL, YouTube Video ID, or inspected Magnet/.torrent input
```

Optional UI fields may be shown only if they have a real backend contract.

Torrent inspection displays the normalized file selection and optional matched
sidecar subtitles using Tonight TV controls. It never embeds Webtor player chrome.

Do not promise poster/duration persistence unless the backend is extended intentionally.

Actions:

```text
Add to Queue
Play Now
```

## 23.2 Subtitle management

Fields:

```text
Label
Language code (optional)
File (.srt or .vtt)
```

Explain that SRT is converted to VTT.

## 23.3 Room settings

MVP settings:

```text
Room name
Copy room link
```

Do not add password/invite-management/ban controls in MVP.

---

# 24. Dialogs, Drawers, and Sheets

Desktop:

- use modal/dialog for Add Media, Subtitle management, destructive confirmation, and focused room settings.

Mobile:

- prefer bottom sheet/full-height sheet for multi-field workflows.

Do not navigate away from the room for small management actions if that would unnecessarily interrupt playback.

---

# 25. Toasts and Feedback

Use toasts sparingly.

Good uses:

- `Room link copied`
- `Paused for everyone`
- `Media added to queue`
- `Subtitle uploaded`
- `Could not send message`

Do not toast every Realtime state update.

Persistent problems belong in an inline state surface near the affected feature.

---

# 26. Loading and Skeleton Rules

Avoid whole-page spinners when the shell can render.

Use stable geometry:

- player keeps 16:9 frame,
- sidebar keeps width,
- skeleton lines mimic expected content,
- controls do not jump vertically when data arrives.

Canonical loading copy:

```text
Preparing room…
Joining room…
Connecting…
Joining live…
Loading media…
```

---

# 27. Error Visual Language

## Recoverable local media error

Inline over/under video:

```text
This media source could not be played.
The room is still live.
[Retry]  (viewer when retry is meaningful)
[Replace source] (owner only)
```

## Realtime disconnect

Small persistent status:

```text
Connection lost. Reconnecting…
```

## Autoplay blocked

Not a red error:

```text
Playback needs your permission.
[START WATCHING]
```

## Invalid/expired room link

Dedicated route-level empty/error screen with a simple return action. Do not reveal whether a private room exists through broad discovery behavior beyond the exact-ID preview contract.

---

# 28. Accessibility Baseline

Required from the first implementation:

- Keyboard-accessible controls.
- `aria-label` for icon-only actions.
- Visible focus ring.
- Proper form labels.
- Semantic buttons, inputs, headings, tabs, dialogs.
- Screen-reader live-region treatment for important connection/sync changes without excessive announcements.
- Do not communicate status only with color.
- Minimum touch target approximately 44x44 CSS pixels for mobile primary controls.
- Sufficient text/background contrast.
- Caption/subtitle control accessible by keyboard.
- Dialog focus trap and focus restoration.
- Respect `prefers-reduced-motion`.

Do not claim full WCAG compliance without actual testing.

---

# 29. Next.js Styling Setup

Preserve the repository's existing styling system.

If Tailwind is already present:

- map Tailwind theme values to semantic CSS variables,
- avoid scattering raw hex values across JSX,
- create reusable class recipes only where repetition is real.

If the repository already uses shadcn/Radix primitives:

- reuse accessible primitives for Dialog, Popover, Tooltip, Tabs, Dropdown Menu, Slider, and Sheet,
- restyle them to Tonight TV tokens,
- do not accept default shadcn visual styling when it conflicts with this design.

If no component system exists:

- add the smallest accessible primitives needed,
- do not migrate the entire app to a new framework solely for aesthetics.

---

# 30. Recommended Component Style Layers

```text
styles/globals.css
  semantic tokens
  global reset/base
  body canvas

components/ui/
  only real reusable primitives
  Button
  IconButton
  Input
  Dialog/Sheet adapters
  Tabs
  Tooltip
  StatusBadge

components/room/
  product-specific compositions
```

Do not make every product component generic.

---

# 31. Reference Visuals

The generated mockups are useful references for visual language only:

- Desktop reference: `tonight-tv-ui-reference-desktop.png`
- Mobile reference: `tonight-tv-ui-reference-mobile.png`

Important correction to both references:

> Ignore any native/overlay seekable video progress bar shown by the mockup. The production UI follows the role-based timeline rules in this document.

---

# 32. Design QA Checklist

Before calling a screen visually complete:

- [ ] Video is the strongest visual element.
- [ ] No native video controls are visible.
- [ ] No duplicated seek/progress timeline exists.
- [ ] Viewer has no shared seek/play/pause controls.
- [ ] Admin has exactly one shared seek timeline.
- [ ] LIVE state uses green + text, not color alone.
- [ ] Blue is reserved primarily for interaction.
- [ ] Cards rely on tonal surfaces, not repeated borders.
- [ ] No decorative gradients/glows were added.
- [ ] Whitespace is controlled and not excessive.
- [ ] Chat and Up Next are readable but secondary to video.
- [ ] Mobile is intentionally recomposed, not merely shrunk.
- [ ] Focus states are visible.
- [ ] Touch targets are adequate.
- [ ] Loading/error states preserve layout stability.
- [ ] The screen still works when optional poster/duration metadata is absent.
- [ ] All role-sensitive UI agrees with backend permissions.

---

# 33. Final Design Principle

Tonight TV should look quiet while the movie is playing.

The design succeeds when the user stops noticing the interface and immediately understands:

> what the room is watching, whether they are live, and what actions they are actually allowed to take.
