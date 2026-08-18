# Tonight TV — UI ↔ Supabase Wiring Specification

**Version:** 1.0  
**Status:** Frontend/Backend Integration Contract  
**Last updated:** 2026-08-17  
**Stack:** Next.js + React + TypeScript + Supabase  
**Purpose:** Define exactly how the UI consumes and mutates Tonight TV state without violating the authoritative backend and synchronization model.

---

# 0. Authority

Use this precedence for implementation decisions:

1. Current explicit user instruction.
2. Repository-level implementation instructions.
3. `tonight-tv-supabase-backend-spec.md` for security/backend mechanics.
4. `tonight-tv-nextjs-supabase-spec.md` for product scope/overall architecture.
5. **This document** for UI-to-backend data flow and state ownership.
6. `tonight-tv-ui-design-system.md` for visual rules.
7. `tonight-tv-ui-screen-architecture.md` for screen/component composition.
8. UI AI prompts are execution instructions only.

This wiring contract may identify UI-driven backend additions, but those additions must also be reflected in the backend spec/migrations before implementation is considered complete.

---

# 1. Core Integration Principle

The complete client mental model is:

```text
Postgres decides canonical room state.
Realtime tells connected members quickly.
Snapshot repairs uncertainty.
Presence tells who is connected.
The browser player loads media directly from the external media host.
Local UI preferences stay local.
```

No React component should become an independent source of authoritative playback truth.

---

# 2. State Ownership Matrix

| UI/Data concern | Source of truth | Transport | Persisted? | Shared? |
|---|---|---|---:|---:|
| Auth identity | Supabase Auth | Auth SDK/JWT | Yes/session | Per user |
| Room ownership | Postgres `rooms` | Snapshot/RPC | Yes | Yes |
| Durable membership | `room_sessions` | join/snapshot | Yes | Room scoped |
| Room name | Postgres `rooms` | preview/snapshot/room event | Yes | Yes |
| Playback status | `room_playback_state` | RPC result + Broadcast + snapshot | Yes | Yes |
| Current media | Postgres | snapshot/events | Yes | Yes |
| Shared seek position | canonical anchor math | playback state | Yes as anchor | Yes |
| Queue | Postgres | snapshot/refetch after queue event | Yes | Yes |
| Available subtitles | Postgres metadata | snapshot/refetch/event | Yes | Yes |
| Subtitle file bytes | private Storage | authenticated download | Yes object | Room authorized |
| Selected subtitle | local client | local state | No | No |
| Volume/mute | local client | local state | optional local storage | No |
| Fullscreen/PiP | browser | browser APIs | No | No |
| Watchers | Realtime Presence | Presence | No | Ephemeral |
| Chat history | Postgres | snapshot | Yes/bounded | Yes |
| New chat | Postgres commit | RPC + Broadcast | Yes | Yes |
| Active Chat/Up Next tab | local UI | local state | optional local storage | No |
| Buffering | player runtime | local event | No | No |
| Autoplay blocked | browser/player | local error | No | No |
| GO LIVE action | sync coordinator | snapshot/time/player | No mutation | No |
| Reconnecting | Realtime client | local connection state | No | No |

---

# 3. Canonical Supabase Client Strategy

Use exactly one established browser Supabase client pattern in the repository for:

- Auth,
- RPC calls,
- Data API reads where allowed,
- Realtime,
- Storage.

Use the current server/SSR Supabase client only where actual server-side authenticated work is useful.

Do not add a Next.js API proxy merely to call secure RPCs that already work with the user's authenticated JWT + RLS.

Browser configuration uses only:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Never expose secret/service-role credentials.

---

# 4. Route `/r/[roomId]` Integration

The room route has two major phases:

```text
PRE-JOIN
  -> exact-ID preview
  -> nickname + JOIN LIVE

JOINED
  -> durable membership
  -> private realtime
  -> snapshot
  -> player synchronization
  -> role-specific UI
```

Do not expose protected room data before membership except through the intentionally narrow preview function defined below.

---

# 5. UI-Driven Backend Delta 1 — Required Pre-Join Preview

The new Join Room UI needs the room name and optionally current title before durable membership.

The backend previously treated this as optional. It is now a required UI-support contract.

## 5.1 RPC

Conceptual signature:

```text
get_room_join_preview(p_room_id uuid)
```

## 5.2 Who may call it

Because the preview is shown before viewer Auth/membership is guaranteed, it may be executable by:

```text
anon
authenticated
```

but only as a hardened exact-ID function.

## 5.3 Allowed return shape

Return only minimal capability-link preview information, for example:

```json
{
  "room_id": "...",
  "room_name": "Movie Night",
  "current_title": "Horizon Beyond",
  "has_active_media": true
}
```

`current_title` may be null.

## 5.4 Must not return

- owner user ID,
- source URL,
- playback anchor/time/version,
- queue,
- chat,
- subtitles,
- membership rows,
- storage paths,
- presence/watchers,
- any broad list of rooms.

## 5.5 Security requirements

If `SECURITY DEFINER` is required:

- empty/safe `search_path`,
- fully qualified objects,
- no dynamic SQL,
- exact UUID lookup only,
- revoke `PUBLIC EXECUTE`,
- explicitly grant only `anon` and `authenticated`,
- no enumeration/list function,
- nonexistent room returns a minimal not-found/no-row result.

Knowing the high-entropy room URL intentionally permits this small preview. It does not grant membership.

## 5.6 UI mapping

```text
Open /r/<id>
  -> get_room_join_preview(id)
  -> render room name/current title
  -> user enters nickname
  -> JOIN LIVE
```

Preview failure should not be worked around with direct unrestricted `rooms` SELECT.

---

# 6. UI-Driven Backend Delta 2 — Owner Room Rename

The Room Settings UI includes owner-only room rename.

Use a narrow authoritative operation rather than a broad settings subsystem.

## 6.1 RPC

Conceptual signature:

```text
rename_room(p_room_id uuid, p_name text)
```

## 6.2 Requirements

- authenticated caller,
- caller must own room,
- trim/validate same room-name constraints as create,
- update `rooms.name` and `updated_at`,
- return canonical updated room fields,
- emit `room_changed` after commit so connected members can update visible room name,
- no other room settings are silently added.

## 6.3 UI mapping

```text
Room Settings
  -> Save
  -> rename_room
  -> pending state
  -> canonical result
  -> update room header
```

On event receipt, other connected clients update/refetch room metadata.

---

# 7. Explicit Non-Deltas

The following new UI states do **not** justify new database columns/tables/messages:

```text
GO LIVE visible/hidden
viewer behind-live seconds
selected subtitle
volume/mute
PiP/fullscreen
active Chat/Up Next tab
chat draft
buffering
catching up
reconnecting
autoplay blocked
local media error
control hover/focus
sidebar open/closed
```

These are derived/local states.

Do not add tables such as:

```text
viewer_preferences
viewer_playback_position
viewer_sync_state
room_ui_state
```

for the MVP.

---

# 8. Poster and Duration UI Policy

The visual references contain poster artwork and durations. These are **not required backend dependencies** for the MVP UI.

## Poster

- Render an optional thumbnail/poster only if actual metadata is available in the current implementation.
- Otherwise render a polished fallback media tile.
- Do not add a Storage poster pipeline merely because the mockup shows artwork.

## Duration

- The active HTML media runtime may provide duration after metadata loads.
- Queue rows must omit duration when unknown.
- Do not write duration continuously or invent values.

A future explicit metadata extension may add `poster_url` or `duration_sec`, but this UI build must not depend on them.

---

# 9. Auth and Join Flow

## 9.1 Owner

```text
/login
  -> persistent Supabase sign in
  -> /admin
  -> create/open room
  -> /r/<roomId>
```

## 9.2 Viewer

```text
/r/<roomId>
  -> preview (may be anon)
  -> JOIN LIVE user gesture
  -> ensure current Auth user exists
       existing authenticated user -> reuse
       no user -> signInAnonymously()
  -> join_room(roomId, displayName)
  -> durable membership established
```

Nickname is display data, not authority.

## 9.3 Join ordering

Recommended robust order:

```text
preview
JOIN LIVE click
ensure Auth
join_room
sample server time
subscribe private Realtime channel
fetch snapshot
apply snapshot version
track Presence
load current media
align player
```

The implementation may subscribe before snapshot to avoid races, but it must apply version reconciliation correctly.

---

# 10. Snapshot Wiring

Use `get_room_snapshot` after membership.

It hydrates:

```text
room
caller
playback
current media
current-media subtitles
queue
recent chat
server time if included
```

Presence is not part of snapshot.

## UI hydration

- Header <- room/caller.
- Role-specific control selection <- `caller.is_owner`.
- Now Playing <- current media + playback.
- Player coordinator <- playback/current media.
- Subtitle list <- subtitles.
- Up Next <- queue.
- Chat <- recent_chat.

Never derive owner permission from route or localStorage.

---

# 11. Room Coordinator Boundary

Use one cohesive room coordinator rather than raw Supabase calls scattered across JSX.

Conceptually:

```ts
interface RoomCoordinator {
  snapshot: RoomSnapshot | null
  role: 'owner' | 'viewer' | null
  connection: ConnectionState
  watchers: Watcher[]
  sync: SyncUiState

  join(displayName: string): Promise<void>
  goLive(): Promise<void>
  refreshSnapshot(reason: ReconcileReason): Promise<void>
}
```

The actual repository may use hooks/services instead of this exact interface.

The coordinator composes existing domain modules; it should not become a 3000-line god component.

---

# 12. Realtime Channel Wiring

One private room channel:

```text
room:<room_uuid>
```

Use it for:

- database-originated Broadcast,
- Presence.

Known application events:

```text
playback_state_changed
queue_changed
media_changed
subtitle_metadata_changed
chat_message_created
room_changed
```

The client must not publish authoritative application Broadcast events.

---

# 13. Playback Broadcast Handling

Incoming payload contains canonical playback fields including `state_version`.

Client rule:

```text
incoming <= lastApplied
  -> ignore

incoming == lastApplied + 1
  -> apply

incoming > lastApplied + 1
  -> version gap
  -> fetch fresh snapshot/state
```

Do not animate or display every internal version.

`state_version` is technical reconciliation state, not end-user UI.

---

# 14. Admin Playback UI → RPC Mapping

| UI action | Backend call | Shared? | Optimistic authoritative state? |
|---|---|---:|---:|
| Play | `room_play(room_id, expected_version)` | Yes | No |
| Pause | `room_pause(room_id, expected_version)` | Yes | No |
| Seek | `room_seek(room_id, expected_version, target)` | Yes | No |
| Restart | `room_restart(room_id, expected_version)` | Yes | No |
| Play Now | `room_select_media(room_id, expected_version, media_id, true)` | Yes | No |
| Select paused | `room_select_media(..., false)` if UI exposes | Yes | No |
| Play Next | `room_play_next(room_id, expected_version)` | Yes | No |
| End | `room_mark_ended(room_id, expected_version)` from owner runtime | Yes | No |

## Pending UI

Prevent duplicate click storms while a command is unresolved when appropriate.

Do not freeze unrelated local controls such as volume.

## Stale-version conflict

```text
RPC conflict
  -> fetch fresh snapshot
  -> apply canonical state
  -> show compact notice: "Room changed in another tab. Synced to latest state."
```

Do not blindly retry a seek/next against the new version without fresh user intent.

---

# 15. Admin Timeline Wiring

There is one shared seek slider.

## During pointer/keyboard scrubbing

UI may maintain a temporary local preview value.

This preview is **not** room state.

## Commit

On deliberate seek commit:

```text
room_seek(roomId, expectedVersion, targetSeconds)
```

Until accepted, do not tell viewers or local UI that the canonical state version changed.

## Continuous writes forbidden

Do not call seek RPC on every pointer pixel/mousemove unless the interaction deliberately debounces to a single/few meaningful commits. Prefer commit on release/keyboard intent.

---

# 16. Viewer Control Wiring

## Volume/mute

Local player only.

## Subtitle selection

Authenticated Storage download + local text track state only.

## PiP/fullscreen

Browser APIs only.

## GO LIVE

No playback mutation RPC.

```text
GO LIVE
  -> fetch fresh snapshot
  -> recalibrate server clock if needed
  -> ensure canonical media loaded
  -> wait for seekability
  -> compute expected position
  -> local seek/correction
  -> match canonical play/pause
```

Never call `room_seek` from viewer GO LIVE.

---

# 17. Clock and UI Wiring

`get_server_time()` is used by the sync engine, not shown raw in UI.

UI derives:

```text
LIVE
behind seconds
catching-up state
```

from sync coordinator measurements.

Do not display client timezone-dependent wall clock as synchronization truth.

---

# 18. Player Runtime Wiring

The synchronization engine interacts with a player adapter.

The React UI renders state from the adapter/coordinator but does not push arbitrary player events into shared backend mutations.

## Viewer local pause/seek event

If such an event occurs through browser/system behavior:

```text
room remains authoritative
sync engine corrects local player
no shared RPC
```

## Owner local player event

Do not treat every native `pause`/`play` event as owner intent. Owner shared intent comes from explicit admin controls or controlled ended behavior, preventing feedback loops.

---

# 19. Media Source Runtime

Source metadata comes from the authorized room snapshot/current media.

Media flow:

```text
Postgres stores control-plane source metadata
External sources load directly in authorized browsers
`local_p2p`: owner File -> owner WebTorrent seed -> WebRTC room peers
```

Never proxy media bytes through Supabase/Next.js.

Support:

```text
auto
mp4
hls
youtube
torrent
local_p2p
```

Native HLS where appropriate; otherwise hls.js according to repository implementation.
Webtor torrent runtime URLs use the existing Webtor adapter. Local P2P descriptors
are room-private metadata only; video bytes, P2P progress, peer count, and upload/
download metrics stay in browser-local state. The existing Postgres playback RPCs
remain the only shared authority.

---

# 20. Media Error Mapping

The media adapter normalizes raw browser/HLS errors into domain categories.

UI mapping:

| Category | Viewer UI | Owner UI |
|---|---|---|
| Network/source unreachable | Local unavailable + retry | Same + edit/replace source |
| CORS/referrer/origin blocked | Source cannot play in browser | Replace source |
| Unsupported codec/container | Unsupported on this device/browser | Replace source/codec guidance |
| HLS fatal failure | Retry if sensible | Retry/replace source |
| Autoplay blocked | `START WATCHING` | `START WATCHING` |
| Protected/cookie source | Unsupported direct source | Replace source |
| Expired URL suspected | Waiting/notify owner | Replace source |
| DRM/encrypted unsupported | Unsupported source | Replace source |

One viewer's local error does not mutate room playback.

---

# 21. Queue Wiring

Read queue from snapshot / room-scoped authorized data.

## Add media

Owner-only direct RLS write or established media service/RPC according to backend implementation.

After committed change:

```text
queue_changed/media_changed
```

Clients may refetch queue/snapshot rather than replicate a complex collection diff.

## Reorder

Use one atomic operation:

```text
reorder_media_items(room_id, ordered_media_ids[])
```

UI drag state is temporary until commit.

## Delete

Owner-only.

If deleting current media is rejected, show:

```text
This item is currently playing. Select another item before deleting it.
```

Do not auto-switch media inside delete UI.

---

# 22. Chat Wiring

Send through:

```text
send_chat_message(room_id, body)
```

The RPC derives sender identity/display name.

## Client state

```text
snapshot recent_chat
+ RPC returned canonical message
+ DB Broadcast chat_message_created
```

Deduplicate by message ID.

Do not duplicate the sender's own message when the Broadcast arrives after the RPC response.

## Error mapping

- empty: client + server validation,
- over length: inline error,
- rate limited: "You're sending messages too quickly. Try again shortly.",
- auth/membership: reconnect/session error,
- network: preserve draft and allow retry.

---

# 23. Presence Wiring

Track only after:

```text
Auth ready
join_room complete
private Realtime subscribed
```

Payload remains small:

```json
{
  "user_id": "...",
  "room_session_id": "...",
  "display_name": "...",
  "online_at": "..."
}
```

Normalize Presence into a unique watcher list.

Do not persist Presence into `room_sessions` as online truth.

---

# 24. Subtitle Wiring

## Availability

Subtitle metadata comes from snapshot/current media refetch.

## Owner upload

Application workflow:

```text
read file
validate
SRT -> VTT if needed
create deterministic path
upload private VTT
persist metadata
compensate/cleanup if metadata write fails
```

## Viewer selection

```text
select metadata row
authenticated Storage download
Blob
URL.createObjectURL
attach local track
revoke old object URL on switch/cleanup
```

No shared state mutation.

## Metadata changes

`subtitle_metadata_changed` tells connected clients to refresh available tracks.

Do not broadcast VTT bytes.

---

# 25. Room Rename Wiring

Owner Settings:

```text
edit name locally
Save
rename_room(roomId, newName)
```

After canonical success:

- update local snapshot state,
- `room_changed` updates connected viewers,
- preview for future joiners returns new name.

Do not add a generic arbitrary JSON room-settings field.

---

# 26. Room Link / "Invite" Wiring

The visual reference may show an `Invite` action. In MVP this must mean:

```text
Copy room link
```

It is a browser clipboard action.

No invitations table, email workflow, or invite-token subsystem is added.

Suggested UI label:

```text
Share Room
```

with action:

```text
Copy link
```

This preserves scope.

---

# 27. Reconnect Wiring

On meaningful Realtime reconnection:

```text
refresh/reassert Auth token as required by SDK
resubscribe
fetch fresh snapshot
recalibrate clock
re-track Presence
reconcile media
reconcile playback position/state
```

UI:

```text
Reconnecting…
-> Rejoining live…
-> LIVE / Paused by admin
```

Do not depend on Broadcast replay.

---

# 28. Visibility/Sleep Wiring

On meaningful return from hidden/suspended state:

- determine local state may be stale,
- reconcile snapshot when needed,
- recalibrate time if stale,
- compute expected live position,
- correct player,
- update UI status.

Do not trust old interval timers.

---

# 29. Buffering Wiring

Buffering event is local.

```text
player buffering
  -> UI says Buffering… Room is still live.
  -> no backend write

player ready again
  -> recompute expected position
  -> drift correction/hard seek
  -> UI Catching up…
  -> LIVE when converged
```

---

# 30. Autoplay Wiring

`video.play()` rejection due to browser policy is local.

Do not convert canonical room state to paused.

UI:

```text
Playback needs your permission
[START WATCHING]
```

Action calls local player start/allow path then synchronization reconciliation.

---

# 31. SSR / Hydration / Caching Rules

- Do not statically cache user-specific authenticated room snapshots.
- Do not embed privileged room data in public page output before membership.
- Pre-join preview is the only intentional unauth/exact-link room metadata surface.
- Browser room state should hydrate after Auth/join rather than relying on shared static server cache.
- Use server rendering for shell/metadata only when it does not cross privacy boundaries.

---

# 32. Error Boundary Strategy

## Route-level error

Use for:

- irrecoverable page/config errors,
- invalid room preview,
- catastrophic app-shell issue.

## Room-level inline error

Use for:

- snapshot load failure,
- persistent Realtime failure.

## Feature-level inline error

Use for:

- media,
- subtitle,
- queue form,
- chat composer.

## Toast

Use for transient success/failure where the affected UI remains intact.

Do not route every failure to a generic full-screen `Something went wrong` page.

---

# 33. Typed Domain Error Suggestions

Normalize Supabase/browser failures into a limited set such as:

```ts
type RoomUiError =
  | { kind: 'auth'; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'membership'; message: string }
  | { kind: 'version-conflict'; message: string }
  | { kind: 'realtime'; message: string }
  | { kind: 'media'; category: MediaErrorCategory; message: string }
  | { kind: 'subtitle'; message: string }
  | { kind: 'chat-rate-limit'; message: string }
  | { kind: 'validation'; field?: string; message: string }
  | { kind: 'unknown'; message: string };
```

Do not expose raw Postgres errors directly to users.

---

# 34. UI Action Wiring Matrix

| Screen/component | User action | Backend/local action | Recovery |
|---|---|---|---|
| Join Room | Preview | `get_room_join_preview` | invalid-room UI |
| Join Room | JOIN LIVE | ensure Auth -> `join_room` | retain nickname + retry |
| Admin Home | Create room | `create_room` | form error/retry |
| Room Header | Rename | `rename_room` | keep form + error |
| Share Room | Copy link | Clipboard only | copy failure message |
| Admin Controls | Play | `room_play` | conflict -> snapshot |
| Admin Controls | Pause | `room_pause` | conflict -> snapshot |
| Admin Timeline | Seek | `room_seek` | conflict -> snapshot |
| Admin Controls | Restart | `room_restart` | conflict -> snapshot |
| Queue | Play Now | `room_select_media` | conflict/refetch |
| Queue | Next | `room_play_next` | conflict -> snapshot |
| Queue | Reorder | `reorder_media_items` | revert/refetch queue |
| Queue | Add/Edit/Delete | media service under owner RLS | refetch queue |
| Viewer Controls | GO LIVE | snapshot/time/player local | retry if snapshot fails |
| Viewer Controls | Volume | local player | none |
| Viewer Controls | Subtitle | Storage download/local track | retry subtitle |
| Chat | Send | `send_chat_message` | preserve draft |
| Presence | Connect | Presence track | reconnect |
| Subtitle Manager | Upload | Storage + metadata | compensation |
| Realtime | event gap | snapshot | canonical replace |

---

# 35. UI-Backend Testing Contract

At minimum test:

## Preview/join

- unauth exact room preview returns only safe fields,
- random/invalid room does not enumerate,
- preview does not confer membership,
- JOIN LIVE establishes Auth + membership,
- outsider cannot snapshot.

## Role UI

- snapshot `is_owner=true` yields admin controls,
- `is_owner=false` yields viewer controls,
- viewer never invokes admin RPC through UI paths.

## Player

- no native controls attribute,
- viewer has no seek slider,
- admin has exactly one shared seek slider,
- local viewer media events cause no shared RPC,
- GO LIVE causes no playback mutation RPC.

## Realtime

- stale event ignored,
- gap refetches snapshot,
- reconnect refetches/recalibrates,
- `room_changed` updates name,
- queue/subtitle change refreshes relevant data.

## Chat

- RPC/Broadcast deduplication,
- draft survives failed send,
- rate-limit UI.

## Local preferences

- subtitle/volume/tab changes do not write shared state.

---

# 36. Backend Changes Required by This UI Contract

This UI phase requires exactly these backend contract additions if they are not already implemented:

1. **Required `get_room_join_preview(p_room_id)`** with minimal exact-link safe output and controlled `anon`/`authenticated` execute permission.
2. **Owner-only `rename_room(p_room_id, p_name)`** with canonical validation and `room_changed` broadcast.

No additional table is required.

No per-viewer playback or UI-state persistence is required.

No invitation subsystem is required.

No poster-storage subsystem is required.

---

# 37. Final Wiring Principle

A correct Tonight TV UI should be able to disappear and reconnect without losing truth because the truth never belonged to the component tree.

The UI is a projection of:

```text
Auth + Postgres snapshot + committed Broadcast + Presence + local player state
```

and nothing in the visual layer should weaken that model.
