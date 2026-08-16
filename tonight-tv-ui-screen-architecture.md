# Tonight TV — UI Screen Architecture & Component Specification

**Version:** 1.0  
**Status:** Frontend UX Contract  
**Last updated:** 2026-08-17  
**Target:** Next.js + React + TypeScript + Supabase  
**Companion:** `tonight-tv-ui-design-system.md`

---

# 0. Purpose

This document defines the complete MVP frontend surface for Tonight TV: routes, screens, responsive behavior, component composition, client/server boundaries, role-specific controls, loading states, empty states, error handling, and reusable product components.

It does not replace the backend security or synchronization contracts.

The product remains a private synchronized watch room where one owner controls the shared timeline and viewers follow it.

---

# 1. Screen Inventory

## Route-level screens

1. `/` — Product entry / admin gateway.
2. `/login` — Admin authentication.
3. `/admin` — Admin home / owned rooms / create-room entry.
4. `/r/[roomId]` — Single canonical room route. Before membership it renders Join Room; after membership it renders Viewer Room or Admin Room based on authoritative caller data.
5. Not-found/invalid-room state — route-level error treatment for an invalid exact room link.

## In-room overlays / focused workflows

6. Add Media dialog/sheet.
7. Edit Media dialog/sheet.
8. Queue management mode/panel.
9. Subtitle management dialog/sheet.
10. Room settings dialog/sheet.
11. Autoplay permission overlay (`START WATCHING`).
12. Media failure overlay/state.
13. Reconnect/resync status state.
14. Delete confirmation dialogs.

These overlays are not separate pages unless the actual repository architecture strongly requires route-based dialogs.

---

# 2. Route Philosophy

Use one room URL for both owner and viewer:

```text
/r/<high-entropy-room-id>
```

Do not create separate public URLs such as:

```text
/admin/room/<id>
/viewer/room/<id>
```

for the same live room experience.

The backend snapshot returns caller role information. The UI derives the allowed control composition from that trusted response, while authorization still remains enforced in Postgres/RLS/RPCs.

---

# 3. State Ownership Model

The frontend must separate three categories of state.

## 3.1 Canonical server state

Authoritative in Postgres:

```text
room
caller / durable membership
playback state
current media
queue
available subtitle metadata
recent chat history
```

React must not create a second independent authoritative copy.

## 3.2 Realtime ephemeral state

```text
Realtime connection/subscription state
Presence/watchers
incoming committed Broadcast events
last applied playback version
```

Realtime is transport, not truth.

## 3.3 Local UI/player state

Never write these to shared room state merely because the UI needs them:

```text
volume
muted
selected subtitle
PiP
fullscreen
active sidebar tab
open dialogs
message draft
player buffering
player autoplay blocked
local media error
local correction/catching-up state
focus/hover state
```

---

# 4. Next.js Rendering Boundary

## Server-friendly surfaces

Use Server Components where they provide value for:

- static app shell,
- product landing content,
- login shell,
- non-user-specific layout,
- route metadata.

## Client-required surfaces

The room experience is client-heavy. Use Client Components for:

- Supabase browser Auth lifecycle,
- room join action,
- Realtime subscriptions,
- Presence,
- video element,
- HLS runtime,
- synchronization/drift correction,
- local subtitle selection,
- Fullscreen/PiP,
- chat input,
- role controls,
- dialogs requiring client interaction.

Do not statically cache authenticated room state across users.

---

# 5. Suggested Frontend Structure

Adapt to the repository rather than duplicating a working structure.

```text
app/
  page.tsx
  login/
    page.tsx
  admin/
    page.tsx
  r/
    [roomId]/
      page.tsx
      loading.tsx       // optional if useful
      not-found.tsx     // optional route-specific treatment

components/
  ui/
    Button.tsx
    IconButton.tsx
    Input.tsx
    Tabs.tsx
    Dialog.tsx
    Sheet.tsx
    Tooltip.tsx
    StatusBadge.tsx

  room/
    RoomClient.tsx
    RoomShell.tsx
    RoomTopBar.tsx
    RoomJoinGate.tsx
    RoomStatus.tsx
    WatcherStrip.tsx
    NowPlaying.tsx
    RoomSidebar.tsx

  player/
    VideoStage.tsx
    AdminControls.tsx
    ViewerControls.tsx
    AdminTimeline.tsx
    LocalMediaControls.tsx
    PlayerStateOverlay.tsx

  chat/
    ChatPanel.tsx
    ChatMessageList.tsx
    ChatComposer.tsx

  queue/
    UpNextPanel.tsx
    QueueItem.tsx
    QueueEditor.tsx
    MediaDialog.tsx

  subtitles/
    SubtitleSelector.tsx
    SubtitleManager.tsx

  settings/
    RoomSettingsDialog.tsx

lib/
  supabase/
  rooms/
  realtime/
  playback/
  sync/
  media/
  subtitles/
  chat/
```

Do not create a file for every one-line helper.

---

# 6. Global App Shell

## Visual structure

- Dark canvas.
- Maximum useful width but not a narrow marketing column.
- Product wordmark is compact.
- No global catalog navigation.
- Room screen uses most available viewport space.

## Global feedback layer

Provide one coherent toast system or the repository's existing equivalent for transient feedback.

Use inline errors for persistent problems.

---

# 7. Screen 1 — Product Entry `/`

## Goal

Give the product a minimal entry point without turning it into a marketing site.

## Primary audience

Owner/admin starting the app.

## Composition

```text
Tonight TV logo
Private watch-room value statement
[Sign in as Admin]
Optional: direct "Open room link" explanation
```

If an authenticated owner already has a session, route/CTA may send them to `/admin`.

## Visual rules

- Same dark tokens.
- Moderate content density.
- No huge hero illustration required.
- Do not create streaming catalog cards.

## Error states

- Supabase configuration unavailable: development-safe clear error.
- Auth initialization error: concise retry action.

---

# 8. Screen 2 — Admin Login `/login`

## Goal

Authenticate the persistent room owner.

## MVP fields

```text
Email
Password
[Sign In]
```

Do not add OAuth/passkey UI unless backend implementation already supports it and the user requested it.

## Composition

Centered compact auth card over the same dark canvas.

## States

- idle,
- submitting,
- invalid credentials,
- network/auth error,
- authenticated redirect.

## Error behavior

Keep errors close to the form. Do not reveal sensitive Auth internals.

---

# 9. Screen 3 — Admin Home `/admin`

## Goal

Provide the owner a minimal place to create or reopen rooms.

## Composition

```text
Top bar: Tonight TV / account
Heading: Your Rooms
[Create Room]

Owned room rows/cards (if any)
  Room name
  created/updated metadata if useful
  [Open Room]
```

This is not a broad admin dashboard.

Do not add analytics, moderation charts, user management, public discovery, or billing.

## Create Room flow

Use a focused dialog or inline card:

```text
Room name
[Create Room]
```

On success, navigate to `/r/<roomId>`.

## Empty state

```text
No rooms yet.
Create a private room to start watching.
[Create Room]
```

---

# 10. Screen 4 — Join Room `/r/[roomId]` Before Membership

## Goal

A friend opens the private link, understands what room they are joining, enters a nickname, and performs one intentional `JOIN LIVE` gesture.

## Required pre-join preview

The page should show only safe exact-link preview data:

```text
Tonight TV
Room name
Current title if available
"Friends are watching" / "Room is ready" style copy
```

Do not expose:

- source URL,
- queue contents,
- chat,
- owner user ID,
- subtitle storage paths,
- broad room enumeration.

## Main composition

```text
Tonight TV
Movie Night
Optional current title

Display name
[________________]

[JOIN LIVE]
```

## Why `JOIN LIVE` matters

It is both:

- the membership/join action,
- a useful browser user gesture before playback.

## Join lifecycle states

The same shell transitions through:

```text
Preparing room…
Authenticating…
Joining room…
Connecting…
Joining live…
```

Do not flash unrelated pages between stages.

## Errors

### Invalid/unknown room

```text
This room link is invalid or no longer available.
[Back to Tonight TV]
```

### Nickname validation

Inline field error.

### Join RPC failure

Keep nickname and provide Retry.

### Realtime failure after join

Do not undo durable membership. Show reconnect/retry status and attempt snapshot recovery.

---

# 11. Screen 5 — Shared Room Shell

Both owner and viewer use the same structural shell.

## Desktop layout

```text
┌ Top Bar ─────────────────────────────────────────────┐
│ Tonight TV   LIVE   Room Name   N watching    actions│
├──────────────────────────────┬───────────────────────┤
│ Video Stage                  │ Chat | Up Next        │
│                              │                       │
├──────────────────────────────┤                       │
│ Now Playing + Sync Status    │                       │
├──────────────────────────────┤                       │
│ Role Controls                │                       │
├──────────────────────────────┤                       │
│ Presence / room utility      │                       │
└──────────────────────────────┴───────────────────────┘
```

## Mobile layout

```text
Header
Video Stage
Now Playing + Sync
Role Controls
Chat | Up Next
Active panel
Watcher strip
```

## Top bar

Include:

- logo,
- room name,
- LIVE status,
- unique watcher count,
- owner/settings action only where allowed,
- account/menu utility.

Use `Copy room link` rather than an invitation-management system.

---

# 12. Video Stage

## Production rule

No native controls and no permanent native-like progress toolbar.

The stage contains the actual `<video>` element and state overlays.

## Possible overlays

- Private Room label (optional).
- `Loading media…`
- `Buffering… Room is still live.`
- `Playback needs your permission` + `START WATCHING`.
- `This media source could not be played`.
- Owner replacement action where appropriate.

Do not permanently obscure meaningful video content with chrome.

---

# 13. Screen 6 — Viewer Room

## Core user goal

Watch the room at the current canonical position with minimal control chrome.

## Viewer now-playing state

Show:

- `NOW PLAYING`,
- title,
- elapsed / duration when known,
- LIVE/synchronization status.

## Viewer controls

Exactly the local/recovery set:

```text
Volume / Mute
Subtitles
Picture-in-Picture
Fullscreen
GO LIVE
```

Do not render:

- shared Play,
- shared Pause,
- seekable timeline,
- Next,
- Previous,
- media selection.

## Viewer LIVE states

### Synced

```text
● LIVE
Synced with the room
```

`GO LIVE` may be subdued or disabled if no recovery is needed.

### Behind

```text
12s behind live
[GO LIVE]
```

### Catching up

```text
Catching up to live…
```

### Room paused

```text
Paused by admin
```

Do not show a local Resume action that appears to control the room.

### Buffering

```text
Buffering…
Room is still live.
```

### Autoplay blocked

```text
Playback needs your permission.
[START WATCHING]
```

### Source failure

```text
This video could not be played on this device.
Waiting for the room owner to update the source.
```

If retry may help, offer a local Retry without changing room state.

---

# 14. Screen 7 — Admin Room

## Core user goal

Operate the shared channel deliberately and see enough feedback to know what every viewer should be doing.

## Admin role indication

Use a subtle owner/crown/operator indicator. Do not turn the whole room into an "admin dashboard" appearance.

## Admin controls

```text
ADMIN CONTROLS
[Restart] [Play/Pause] [Play Next]

elapsed   [single shared seek timeline]   duration

[Volume] [Subtitles] [PiP] [Fullscreen]
```

### Critical rule

The seek timeline in `AdminControls` is the **only seekable shared progress bar on the screen**.

The video stage must not duplicate it.

## Command lifecycle

When owner invokes shared action:

1. show short pending feedback if latency is noticeable,
2. do not invent a new authoritative state/version optimistically,
3. apply the canonical RPC result/event,
4. surface stale-version conflict as reconciliation rather than a generic crash.

## Feedback examples

```text
Paused for everyone
Playing for everyone
Playing next item
Room state changed in another tab; refreshed
```

Keep this feedback short.

---

# 15. Empty Room / No Current Media

This is a role-dependent room state.

## Owner

Video stage becomes a clean empty surface:

```text
Nothing is playing yet.
Add a direct MP4 or HLS source to start the room.
[Add Media]
```

Sidebar/chat may still function if the room is otherwise connected.

## Viewer

```text
Waiting for the room owner to start something…
```

No fake player controls.

---

# 16. Ended State

When authoritative playback state is `ended`:

## Viewer

```text
Program ended.
Waiting for the next program…
```

## Owner

```text
Program ended.
[Restart] [Play Next]
```

Do not auto-next in MVP.

---

# 17. Chat Panel

## Desktop

Persistent right panel by default.

## Mobile

`Chat` is one tab in the room content below controls.

## Components

```text
ChatPanel
  ChatMessageList
  ChatMessage
  ChatComposer
```

## Behavior

- hydrate from snapshot,
- append/deduplicate committed live messages,
- preserve input draft across transient reconnects,
- disable send only when sending is genuinely unavailable,
- show rate-limit or membership errors inline near composer/toast as appropriate.

## Empty state

```text
No messages yet.
Say something to the room.
```

---

# 18. Up Next Panel

## Viewer

Read-only list.

## Owner

Read list + management controls.

## Item anatomy

```text
Optional thumbnail/fallback
Title
Known duration (optional)
Current/next state
Owner overflow/menu
```

If duration is not stored/known, omit it; never render a fake duration.

## Queue empty states

Owner:

```text
Nothing up next.
[Add Media]
```

Viewer:

```text
Nothing queued yet.
```

---

# 19. Add Media Dialog / Sheet

## Fields

```text
Title
Video URL
Source type: Auto / MP4 / HLS
```

## Actions

```text
[Add to Queue]
[Play Now]
```

## Validation

- title nonempty,
- valid URL,
- HTTPS expected in production,
- supported source type,
- explain direct-media requirement.

## Unsupported/watch-page guidance

```text
This URL does not appear to be a directly playable media source.
Use a direct MP4 or HLS (.m3u8) URL.
```

Do not promise to scrape or resolve hidden streams.

## Pending behavior

Disable duplicate submit while preserving entered values.

---

# 20. Edit Media Dialog

Allow owner to change backend-supported media metadata only.

Do not silently switch active playback merely because the owner edits a title/source.

If the current source URL is replaced, the implementation must follow the backend/media event contract so clients reload correctly.

---

# 21. Queue Management

Use inline reorder mode, drag-and-drop with keyboard fallback, or explicit move controls according to existing dependencies.

Backend persists reorder atomically.

Do not issue one network mutation per row movement if the backend contract provides a single reorder operation.

Deletion:

- current media cannot be deleted,
- explain this in the disabled/error state,
- require selecting another item first.

---

# 22. Subtitle Selector — Viewer and Owner

## Local selector

Both roles may choose from available subtitle tracks locally.

Actions:

```text
Off
Arabic
English
...
```

Selection is local only.

Do not broadcast or persist selection to shared playback state.

## Loading

When a private VTT is being downloaded, show a compact loading state in the menu/control; do not block video if subtitles are optional.

## Failure

```text
Could not load this subtitle track.
[Retry]
```

Keep playback running.

---

# 23. Subtitle Manager — Owner

## Purpose

Manage available tracks for current/selected media.

## Add form

```text
Label
Language code (optional)
File (.srt or .vtt)
[Upload]
```

Explain SRT conversion to VTT if helpful.

## List

Existing tracks with delete action.

Deleting a track affects availability, not other users' shared timeline.

---

# 24. Room Settings

MVP only:

```text
Room name
Room link [Copy]
```

Owner-only rename.

Do not add:

- room password,
- invitations table/workflow,
- bans,
- moderation dashboard,
- public/private discovery switch.

The room is private by high-entropy link + membership authorization.

---

# 25. Presence / Watchers

## Data

Presence gives current connected state and must be deduplicated by logical authenticated user/session identity.

## UI

Desktop compact strip or top-bar summary:

```text
8 watching   [avatars]
```

Mobile compact horizontal row near the bottom of room content.

Do not create a full participant management page.

---

# 26. Realtime Connection UX

Connection state should be visible but not intrusive.

## Healthy

No special banner beyond normal LIVE state.

## Temporary disconnect

```text
Reconnecting…
```

Keep local media running if the sync coordinator determines it is safe; do not pretend the state is freshly authoritative.

## Restored

Perform snapshot reconciliation. Then display:

```text
Synced
```

for a short period if useful.

## Prolonged failure

Inline persistent status with Retry/Reconnect action if automatic recovery has failed.

---

# 27. Browser Sleep / Visibility Resume UX

When returning after a meaningful background period:

```text
Rejoining live…
```

Then reconcile and update to LIVE/paused state.

Do not show stale elapsed time as authoritative while reconciliation is pending.

---

# 28. Player UI State Machine

Recommended local player states:

```text
idle
loading
ready
playing
paused
buffering
seeking
catching_up
blocked
error
ended
```

Map them to UI intentionally.

| State | Primary UI |
|---|---|
| `idle` | Empty/no media state |
| `loading` | Stable video frame + loading message |
| `ready` | Normal room state |
| `playing` | LIVE/playing status |
| `paused` | `Paused by admin` or owner paused state |
| `buffering` | Non-blocking buffering overlay |
| `seeking` | Minimal internal feedback; avoid flashing |
| `catching_up` | `Catching up to live…` |
| `blocked` | `START WATCHING` |
| `error` | Source-specific error panel |
| `ended` | Waiting/Play Next state |

---

# 29. Error Taxonomy and UI Mapping

## 29.1 Auth

Examples:

- session unavailable,
- sign-in failure,
- anonymous Auth failure.

UI:

- route-level form error or join error,
- Retry,
- no secret/internal details.

## 29.2 Room/membership

Examples:

- room not found,
- join denied,
- snapshot denied.

UI:

- join-screen error or invalid-room screen,
- never disable RLS or fall back to broad reads.

## 29.3 Playback command

Examples:

- owner permission failure,
- stale expected version,
- invalid transition.

UI:

- stale version -> reconcile snapshot and show compact notice,
- permission failure -> owner session/authorization error,
- invalid action -> disable/improve local state if deterministic.

## 29.4 Realtime

Examples:

- subscribe failed,
- connection lost,
- malformed/gapped event.

UI:

- reconnection status,
- snapshot reconciliation,
- do not attempt to infer missing authoritative commands.

## 29.5 Media source

Categories:

```text
network/source unreachable
CORS/referrer/origin blocked
unsupported codec/container
HLS manifest/media failure
autoplay permission blocked
authenticated/cookie-protected source unsupported
expired URL suspected
encrypted/DRM unsupported
unknown media error
```

Owner can replace source when appropriate. Viewer sees local failure without stopping the room.

## 29.6 Subtitle

Upload/download/convert failures stay localized to subtitle UI.

## 29.7 Chat

Empty, over-limit, rate-limited, auth/membership failure, transient send failure.

Do not erase draft on a failed send.

---

# 30. Retry Policy UX

Do not expose exponential-backoff mechanics to users.

Use automatic retry for transient connection/realtime operations where safe.

Provide explicit Retry when:

- media local retry may work,
- subtitle download failed,
- join operation failed,
- reconnect automatic attempts are exhausted.

Never automatically retry destructive/admin mutations in a way that could double-apply without backend idempotency/version protection.

---

# 31. Optimistic UI Rules

## Safe local optimism

Allowed:

- active tab,
- opening/closing dialog,
- volume/mute,
- message draft,
- local subtitle selection UI after local load succeeds.

## Do not optimistically invent canonical state

Do not assume success for:

- Play/Pause/Seek/Next,
- room rename,
- queue reorder,
- Play Now,
- media delete,
- subtitle metadata mutation.

The backend response or committed event defines canonical success.

---

# 32. Responsive Component Behavior

## Desktop >= ~1200px

- two-column room,
- sidebar persistent,
- admin controls horizontal where possible,
- watcher strip compact.

## Tablet

- prioritize video width,
- controls may wrap into two rows,
- sidebar may collapse below player.

## Mobile

- one-column,
- no sidebar,
- Chat/Up Next tabs,
- controls become touch-friendly grid/row,
- dialogs become sheets when helpful,
- no horizontal page overflow,
- no tiny seek targets for admin timeline.

---

# 33. Keyboard / Accessibility Interaction Map

Required:

- Tab reaches all controls in logical order.
- Enter/Space activate buttons.
- Admin seek slider supports keyboard arrow adjustments.
- Tabs follow accessible tab semantics.
- Dialogs trap focus and restore it on close.
- Menus support Escape.
- Tooltips are supplemental, never the only accessible name.
- Status changes that matter to screen-reader users use a controlled live region without announcing every drift tick.

---

# 34. Component Responsibility Rules

## `RoomClient`

Owns composition/coordinator connection, not raw media implementation details.

## `VideoStage`

Owns video DOM/runtime attachment and visual player state overlays; it does not directly decide backend authority.

## `AdminControls`

Renders admin command intents and one shared timeline; calls typed command service, not raw database mutation code in JSX.

## `ViewerControls`

Only local/recovery actions.

## `RoomSidebar`

Presentation/navigation for Chat/Up Next.

## `ChatPanel`

Uses chat service/store; no arbitrary client Realtime Broadcast.

## `QueueEditor`

Owner-only UI, but backend remains authoritative.

## `SubtitleSelector`

Local selection, private file download through subtitle service.

---

# 35. Required UI Acceptance Scenarios

The frontend phase is not complete until the following visibly work:

1. Owner signs in and creates a room.
2. Owner opens the room with owner controls.
3. Viewer opens exact link and sees safe preview before membership.
4. Viewer enters nickname and presses JOIN LIVE.
5. Viewer room renders no shared play/pause/seek controls.
6. Owner room renders exactly one shared seek timeline.
7. Owner Play/Pause/Seek/Next produce correct pending/canonical feedback.
8. Viewer sees LIVE/synced state.
9. Viewer behind state exposes GO LIVE.
10. GO LIVE recovers locally without mutating shared room state.
11. Buffering shows local non-blocking status.
12. Autoplay blocked shows START WATCHING.
13. Realtime reconnect shows status and resolves through snapshot.
14. Chat hydrates and receives live committed messages.
15. Up Next is read-only for viewer and editable for owner.
16. Owner adds/edits/reorders media.
17. Current media delete is rejected clearly.
18. Owner adds/removes subtitle tracks.
19. Two viewers may choose different subtitles locally.
20. Mobile layout uses tabs and touch-friendly controls.
21. No native video controls appear.
22. No duplicated seek/progress bar appears.
23. UI remains coherent without poster metadata.
24. UI remains coherent when duration is unknown.
25. Focus/keyboard behavior is testable and visible.

---

# 36. Final Screen Principle

The room screen is successful when an unfamiliar viewer can answer within seconds:

> "What are my friends watching, am I live, and what can I safely control?"

No additional dashboard complexity should compete with that task.
