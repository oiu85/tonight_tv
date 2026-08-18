# Tonight TV — Supabase Backend Specification

**Version:** 1.0  
**Status:** Implementation Contract  
**Last updated:** 2026-08-17  
**Primary stack:** Next.js + React + TypeScript + Supabase  
**Scope of this document:** Supabase and the backend contract only. UI/visual design is intentionally excluded.

---

## 0. Document Authority and How to Use It

This document is the backend-specific companion to `tonight-tv-nextjs-supabase-spec.md`.

It exists to remove ambiguity before implementation. It defines what Supabase is responsible for, the database model, authorization boundaries, Realtime behavior, storage behavior, synchronization contracts, failure recovery, testing requirements, and the implementation constraints that prevent the project from growing beyond the intended MVP.

### 0.1 Precedence

When implementing Tonight TV:

1. `tonight-tv-nextjs-supabase-spec.md` remains the authoritative product and overall architecture specification.
2. This document is authoritative for **Supabase/backend mechanics**.
3. If a Supabase detail in the older document conflicts with a newer Supabase platform requirement documented here, this document wins for that backend detail only.
4. This document must **not** be interpreted as permission to add product features.

### 0.2 Current Supabase platform note

The Supabase-specific recommendations in this document were rechecked against current official Supabase documentation on 2026-08-17. In particular:

- Prefer the current **publishable key** (`sb_publishable_...`) for browser/client usage instead of designing new code around legacy `anon` key naming.
- Legacy `anon` and `service_role` keys may still exist during Supabase's transition period, but new Tonight TV code should use the current key model.
- Use explicit Data API privileges/grants for the roles that actually require them.
- Use **private Realtime channels** with authorization through RLS on `realtime.messages`.
- Prefer **Realtime Broadcast** for application events rather than building the application around Postgres Changes subscriptions.
- Presence is for slow-changing online state, not playback position updates.
- Postgres remains the authoritative state store. Realtime remains transport/notification.

These platform details can change over time. Before a production launch, current Supabase documentation and plan quotas must be checked again. The architecture below deliberately avoids depending on fragile quota assumptions.

---

# 1. Product Backend Definition

Tonight TV is a private synchronized viewing room for friends.

It is **not** a media hosting platform and it is **not** a Netflix clone.

The backend has one central responsibility:

> Maintain an authoritative shared room state and securely distribute room events so every client can independently play the same external media at approximately the same moment.

The application model is intentionally asymmetric:

- One room owner/admin controls the shared timeline.
- Viewers consume the shared timeline.
- Viewers may control only their own local playback conveniences such as volume, subtitles, fullscreen, Picture-in-Picture, and local recovery actions.
- A viewer's local player actions must never become authoritative shared actions.

---

# 2. Hard Scope Boundary

Scope control is a backend requirement, not a suggestion.

## 2.1 Included in this Supabase scope

The Supabase/backend implementation includes:

- Supabase project configuration required by Tonight TV.
- Supabase Auth for the persistent admin and anonymous viewers.
- Room identity and durable room membership/session records.
- Postgres schema, constraints, indexes, grants, and RLS.
- Database functions/RPCs for authoritative room mutations.
- One authoritative playback-state row per room.
- Server-time sampling required by synchronization.
- Room snapshot retrieval.
- Realtime private-channel authorization.
- Realtime Broadcast for committed room events.
- Realtime Presence for online/watching state.
- External media metadata and queue persistence.
- Subtitle metadata and private Supabase Storage for subtitle files.
- Persistent chat storage plus realtime delivery.
- Generated TypeScript database types.
- Backend-facing Next.js/Supabase integration boundaries.
- Backend security tests.
- Synchronization-support tests.
- Migration/reproducibility workflow.
- Minimal backend observability and operational checks.

## 2.2 Explicitly excluded from this document and MVP

Do **not** add any of the following while implementing this backend unless a future specification explicitly changes scope:

- Voice calls.
- Video calls.
- WebRTC conferencing.
- Screen sharing.
- Public rooms directory.
- Public movie catalog.
- Movie discovery.
- Recommendation system.
- Ratings/reviews.
- Social profiles.
- Friend system.
- Push notifications.
- Email notification workflows.
- Room passwords.
- Invite management system.
- Ban/moderation system.
- Reactions/emojis as a product feature.
- Chat editing or rich chat formatting.
- Analytics warehouse.
- Generic event-sourcing platform.
- Generic audit-log platform.
- Redis.
- Express backend.
- Socket.IO backend.
- Custom WebSocket server.
- Kafka/queues/microservices.
- Video upload to Supabase.
- Video proxying through Supabase or Next.js.
- Video transcoding inside Supabase or Next.js. The approved external Torrent
  Gateway may remux/transcode outside the application control plane.
- DRM bypass.
- Cookie/referrer protection bypass.
- Scraping protected playback URLs.
- Torrent search/indexers are excluded. The approved Webtor torrent path and the
  browser-only `local_p2p` Stream from Device path are both supported.
- Native mobile applications.
- Smart-TV applications.
- Admin dashboards unrelated to the watch-room MVP.

If a proposed table, package, RPC, service, background job, or infrastructure component exists only to support one of these excluded features, it does not belong in the current implementation.

Approved Torrent exception: one selected torrent video file maps to one normal
Tonight TV media item. Supabase stores durable source identity and private small
`.torrent` recovery metadata only. Runtime HTTP/HLS URLs are derived, sidecar
subtitles reuse the existing subtitle pipeline, and admin/Postgres remain the
sole shared playback authority.

---

# 3. Non-Negotiable Backend Invariants

Every implementation decision must preserve the following invariants.

## 3.1 Media never flows through Supabase

Supabase stores control-plane data only.

The actual media path is:

```text
External Media Host  ---> Viewer browsers
Owner browser File    ---> WebRTC P2P room peers (`local_p2p`)
```

It is never:

```text
External Media Host ---> Supabase/Next.js ---> viewers
```

Supabase must not be used as a video relay, video cache, transcoder, or proxy.

## 3.2 Postgres is the source of truth

Authoritative room state lives in Postgres.

Realtime events are notifications that a committed state change happened. A missed Realtime event must never make the room unrecoverable.

A client can always recover by fetching a fresh room snapshot.

## 3.3 One authoritative playback row per room

There is exactly one canonical `room_playback_state` row for each room.

There must not be per-viewer authoritative playback rows.

There must not be duplicated canonical timeline state in multiple tables.

## 3.4 Admin mutations are server-authorized

Shared playback changes are not trusted because a React component says `isAdmin = true`.

All authoritative playback commands must cross a database authorization boundary where ownership is checked against authenticated identity.

## 3.5 Database time anchors the shared timeline

Room synchronization must not depend on:

- the viewer's timezone,
- the viewer's local wall-clock being correct,
- the admin's local wall-clock being correct.

Authoritative anchor timestamps come from Postgres time.

## 3.6 `state_version` is monotonic

Every committed authoritative playback-state mutation increments `state_version` exactly once.

Clients ignore playback events with versions older than or equal to their last applied version.

## 3.7 No high-frequency playback writes

The backend must not receive `currentTime` every second from every viewer.

Normal playback advances mathematically from the stored anchor and estimated server time.

Network activity is event-driven: play, pause, seek, media change, reconnect, chat, membership/presence changes, and similar meaningful transitions.

## 3.8 Viewer identity is authenticated even when anonymous

Viewers use Supabase Anonymous Auth.

A nickname is display data. It is never an authorization credential.

## 3.9 No privileged key in browser code

No Supabase secret key, legacy service-role key, database password, or other privileged credential may be exposed to browser code or a `NEXT_PUBLIC_*` variable.

## 3.10 Private room means authorized membership

A room URL uses a high-entropy identifier, but knowing the URL alone does not mean every authenticated user receives broad database access.

The join path establishes membership. After membership exists, RLS grants room-scoped access.

---

# 4. High-Level Supabase Architecture

```text
                         TONIGHT TV
                  Next.js + TypeScript
                           |
        +------------------+------------------+
        |                  |                  |
   Supabase Auth      Supabase Postgres   Supabase Storage
        |                  |                  |
        |                  |             private subtitles
        |                  |
        |           authoritative state
        |           RPCs / RLS / queue
        |           chat / membership
        |                  |
        +---------- Supabase Realtime --------+
                    Broadcast + Presence
                           |
                 private room channel
                           |
               +-----------+-----------+
               |           |           |
             Admin       Viewer A    Viewer B

External media host -----------------------------------+
        |                                               |
        +----------------> Admin browser                 |
        +----------------> Viewer A browser              |
        +----------------> Viewer B browser              |
                                                        |
Supabase never carries the media stream <---------------+
```

---

# 5. Responsibility Matrix

| Concern | Supabase component | Authoritative? | Notes |
|---|---|---:|---|
| User identity | Auth | Yes | Persistent admin, anonymous viewers |
| Room ownership | Postgres | Yes | `rooms.owner_user_id` |
| Durable membership | Postgres | Yes | `room_sessions` |
| Online users | Realtime Presence | No | Ephemeral connection state |
| Playback state | Postgres | Yes | One row per room |
| Playback event delivery | Realtime Broadcast | No | Notification/fast propagation |
| Queue/media metadata | Postgres | Yes | External media URLs only |
| Video bytes | External source | No Supabase involvement | Direct browser fetch |
| Subtitle metadata | Postgres | Yes | Language, label, storage path |
| Subtitle file bytes | Supabase Storage | Yes for stored subtitle object | Private bucket |
| Chat history | Postgres | Yes | Bounded recent history in snapshot |
| Chat delivery | Realtime Broadcast | No | DB commit first |
| Server clock sample | Postgres RPC | Yes for sampled time | Used to estimate offset |
| Reconnect recovery | Snapshot RPC | Yes | Replaces missed realtime history |

---

# 6. Supabase Project Configuration

## 6.1 Environment variables

Client/browser configuration should use the current Supabase publishable-key model:

```text
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
```

The publishable key is intentionally safe to expose. Security still depends on Auth, grants, RLS, Realtime authorization, and Storage policies.

Do not add a server secret merely because one exists in Supabase.

For the MVP, most application behavior should work with the authenticated user's own JWT and RLS. If a future server-only administrative operation genuinely requires a Supabase secret key, it must:

- live only in server-only environment variables,
- never be imported into client bundles,
- never be prefixed with `NEXT_PUBLIC_`,
- never be used to bypass RLS for normal user operations,
- be documented as a narrowly scoped exception.

## 6.2 Supabase JavaScript integration

Use current Supabase libraries consistent with the existing repository. Normally:

- `@supabase/supabase-js`
- `@supabase/ssr` for current Next.js cookie/session integration

Do not create multiple competing browser clients.

Do not create a new wrapper layer for every Supabase call. Reuse the repository's existing client/service conventions where they are sound.

## 6.3 Realtime settings

Production behavior requires private channels.

The Supabase project should be configured so public Realtime access is not relied upon. Realtime authorization policies on `realtime.messages` must control access to room topics.

## 6.4 Anonymous sign-ins

Anonymous Auth must be enabled for viewers.

Anonymous viewers still receive authenticated user identities and use the Postgres `authenticated` role after sign-in. If the implementation ever needs to distinguish persistent and anonymous accounts, use the Auth claim designed for that purpose rather than nickname heuristics.

CAPTCHA/Turnstile and tighter anti-abuse controls are operational hardening options. They are not a reason to expand the MVP during initial backend construction.

---

# 7. Authentication and Identity Model

## 7.1 Admin

The room owner/admin uses a persistent Supabase Auth account.

The database authority rule is:

```text
rooms.owner_user_id = auth.uid()
```

Ownership must never be inferred from:

- nickname,
- email passed from the client,
- client-side state,
- URL parameters,
- localStorage flags.

## 7.2 Viewer

A viewer follows this identity flow:

```text
Open room URL
   |
Ensure Supabase auth session exists
   |
If no user: anonymous sign-in
   |
User has an auth.users UUID
   |
Choose display name
   |
Call join_room(room_id, display_name)
   |
Durable room membership/session exists
```

The viewer's `auth.uid()` is the security identity.

The display name is only presentation data.

## 7.3 Auth readiness before protected operations

Any code that performs a protected room operation must wait until Auth is ready.

Do not create race conditions where the application attempts to:

- join a private Realtime channel,
- read a room snapshot,
- download a subtitle,
- insert chat,

before the user has a valid authenticated session.

## 7.4 Durable room membership vs online presence

`room_sessions` and Realtime Presence solve different problems.

`room_sessions` means:

> This authenticated user has joined this private room and may receive room-scoped data according to RLS.

Presence means:

> This connection is currently online/tracking in the room channel.

A temporary WebSocket disconnect must not erase durable room membership.

---

# 8. Private-Room Join Model

## 8.1 High-entropy room identifiers

Room routes use UUID/high-entropy identifiers rather than sequential IDs.

Example:

```text
/r/6f88dc77-2fd1-4b1f-9b8a-...
```

The identifier acts as a capability-style secret shared among friends, but it does not replace Auth/RLS.

## 8.2 Do not grant broad room-table discovery

A random authenticated user must not be able to run a broad query that lists private rooms.

The application should not solve room joining by granting every authenticated user unrestricted `SELECT` on `rooms`.

## 8.3 Join RPC

Use a dedicated database function conceptually named:

```text
join_room(p_room_id uuid, p_display_name text)
```

The function must:

1. Require an authenticated `auth.uid()`.
2. Validate the exact provided room ID exists.
3. Reject invalid/closed room states if closure is ever represented.
4. Normalize/trim the display name.
5. Enforce display-name length constraints.
6. Insert or update the caller's `room_sessions` row for that room.
7. Never accept `user_id` from the client.
8. Return only data necessary to continue the join flow.
9. Be hardened as a database function.
10. Not grant room enumeration.

A viewer who knows a valid high-entropy room ID can join that room. This is the MVP invitation model.

## 8.4 Optional pre-join preview

Do not build a general room-discovery API.

If the product flow genuinely needs a small pre-join preview, expose a narrowly scoped exact-ID function such as `get_room_join_preview(room_id)` that returns only intentionally public-to-link-holders fields such as room name/current title.

This function is optional. Do not add it unless the current application flow actually needs it.

---

# 9. Database Schema

The following schema is the intended logical model. Exact SQL naming should follow repository conventions, but the semantics must remain stable.

## 9.1 PostgreSQL extensions

Use only extensions already required by the project or standard Supabase/Postgres capabilities.

UUID generation can use the platform's supported UUID facilities.

Do not introduce an extension merely for convenience if native Postgres already covers the requirement.

## 9.2 Enumerations

Prefer database enums or tightly constrained text values for small stable state machines.

### `playback_status`

Required values:

```text
idle
paused
playing
ended
```

Semantics:

- `idle`: no current media selected.
- `paused`: media selected, shared timeline frozen at anchor position.
- `playing`: media selected, shared timeline advances from anchor.
- `ended`: current program has ended; room waits for explicit next action in MVP.

### `media_source_type`

Implemented values:

```text
auto
mp4
hls
youtube
torrent
local_p2p
```

`local_p2p` stores only a room-authorized descriptor (info hash, magnet, file name,
and size); Supabase never stores or fetches the movie bytes.

---

## 9.3 `rooms`

Purpose: room identity and ownership.

Suggested columns:

```text
id                 uuid primary key
owner_user_id      uuid not null references auth.users(id)
name               text not null
created_at         timestamptz not null default now()
updated_at         timestamptz not null default now()
```

Constraints:

- trimmed room name must not be empty,
- reasonable maximum room-name length,
- ownership cannot be client-assigned to another user during normal creation.

Indexes:

```text
rooms(owner_user_id)
```

A room must be created atomically with its playback-state row. A `create_room` RPC is preferred for this reason.

---

## 9.4 `room_sessions`

Purpose: durable membership and the viewer's room display identity.

Despite the table name, this is not the source for online/offline state.

Suggested columns:

```text
id                 uuid primary key
room_id            uuid not null references rooms(id) on delete cascade
user_id            uuid not null references auth.users(id) on delete cascade
display_name       text not null
joined_at          timestamptz not null default now()
updated_at         timestamptz not null default now()
```

Constraints:

```text
unique(room_id, user_id)
```

Display name:

- trim whitespace,
- must not be empty,
- use a modest maximum length (for example 40 characters),
- store plain text only.

Indexes:

```text
unique(room_id, user_id)
room_sessions(user_id, room_id)
```

The room owner may be authorized by ownership directly even if no `room_sessions` row exists yet.

---

## 9.5 `media_items`

Purpose: external media metadata and queue order.

Suggested columns:

```text
id                 uuid primary key
room_id            uuid not null references rooms(id) on delete cascade
title              text not null
source_url         text not null
source_type        media_source_type not null default 'auto'
queue_position     integer not null
created_by         uuid not null references auth.users(id)
created_at         timestamptz not null default now()
updated_at         timestamptz not null default now()
```

Constraints:

- title not empty,
- source URL not empty,
- queue position non-negative or positive according to chosen convention,
- `(room_id, id)` should be addressable as a composite relationship if subtitles/playback enforce same-room references,
- queue order must be deterministic.

Recommended indexes:

```text
media_items(room_id, queue_position)
media_items(room_id, id)
```

A deferrable room/order uniqueness constraint may be used if the chosen reorder algorithm supports it cleanly. Do not make queue reordering fragile merely to force uniqueness during intermediate update steps.

`source_url` is room-private application data. Do not expose it to non-members and do not place it in logs unnecessarily.

---

## 9.6 `subtitles`

Purpose: subtitle metadata linked to a media item and a private Storage object.

Suggested columns:

```text
id                 uuid primary key
room_id            uuid not null references rooms(id) on delete cascade
media_id           uuid not null
label              text not null
language_code      text null
storage_path       text not null
format             text not null default 'vtt'
created_by         uuid not null references auth.users(id)
created_at         timestamptz not null default now()
```

Required integrity:

- subtitle media must belong to the same room,
- only normalized WebVTT is stored for browser consumption,
- `storage_path` must follow the project's deterministic room/media/subtitle path convention,
- storage metadata must not point to arbitrary buckets/paths outside the room structure.

Recommended index:

```text
subtitles(room_id, media_id)
```

---

## 9.7 `room_playback_state`

Purpose: the one authoritative shared timeline state.

Suggested columns:

```text
room_id                uuid primary key references rooms(id) on delete cascade
current_media_id       uuid null
status                 playback_status not null default 'idle'
anchor_position_sec    double precision not null default 0
anchor_server_time     timestamptz not null default now()
state_version          bigint not null default 0
updated_at             timestamptz not null default now()
```

Required constraints:

- `anchor_position_sec >= 0`,
- `state_version >= 0`,
- current media, if present, must belong to the same room,
- `idle` implies no current media,
- non-idle playback normally requires current media.

`anchor_server_time` is always generated or normalized at the database mutation boundary. The client never becomes authoritative for server time.

No per-viewer playback state belongs here.

---

## 9.8 `chat_messages`

Purpose: bounded persistent chat history.

Suggested columns:

```text
id                    uuid primary key
room_id               uuid not null references rooms(id) on delete cascade
user_id               uuid null references auth.users(id) on delete set null
sender_display_name   text not null
body                  text not null
created_at            timestamptz not null default now()
```

Why snapshot the display name:

- chat history should still render if the membership row changes,
- anonymous-auth lifecycle cleanup should not destroy message attribution text.

Required behavior:

- messages are immutable in the MVP,
- no rich HTML storage,
- no edit feature,
- no delete/moderation feature,
- body is trimmed and length-limited,
- basic database-side anti-spam/rate limiting is applied in the send RPC.

Recommended index:

```text
chat_messages(room_id, created_at desc)
```

---

# 10. Referential Integrity Rules

The database should reject impossible cross-room relationships rather than relying on TypeScript to notice them.

Important examples:

- A subtitle from Room A cannot point to media in Room B.
- Playback state for Room A cannot select media in Room B.
- A viewer cannot insert a `room_sessions` row on behalf of another user.
- A chat message cannot specify a different sender UUID than `auth.uid()`.
- Deleting currently selected media must fail or be handled through an explicit transactional switch. For the MVP, **reject deleting current media**; this is simpler and safer.

Use composite foreign keys or equivalent database validation where appropriate.

---

# 11. Updated-at Handling

If the schema uses `updated_at`, implement one reusable database trigger function rather than copy/pasting slightly different timestamp functions per table.

The trigger must use database time.

Do not create a generic trigger framework or auditing subsystem.

---

# 12. Data API Privileges and Grants

RLS and SQL privileges are separate controls. Both must be correct.

## 12.1 Principle of least privilege

Do not grant broad table mutation privileges simply because RLS exists.

For each table, grant only the operations the application actually performs directly.

Typical intended direction:

- `anon`: no application-table access before Auth.
- `authenticated`: room-scoped reads where policies permit them.
- owner-only direct writes only where direct table mutation is intentionally supported.
- protected state changes occur through RPC functions rather than broad direct UPDATE access.

## 12.2 Explicit grants

Current Supabase projects should not be assumed to expose every new table/function automatically. Migrations must explicitly establish the intended Data API privileges.

Every implementation milestone that adds a table or function must verify:

- table privileges,
- sequence privileges if any are needed,
- function EXECUTE privileges,
- RLS policies,
- exposed schema expectations.

## 12.3 Function EXECUTE hardening

For security-sensitive functions:

1. Do not rely on default `PUBLIC EXECUTE` behavior.
2. Revoke overly broad function execution.
3. Grant EXECUTE only to roles that need the function, normally `authenticated`.
4. Do not grant viewer access to admin-only mutation RPCs merely because the RPC itself also checks ownership; use both privilege and runtime checks where practical.

---

# 13. Row Level Security Model

RLS is mandatory for every client-accessible application table.

## 13.1 Membership predicate

A user has room read access when either:

```text
rooms.owner_user_id = auth.uid()
```

or a matching room membership exists:

```text
room_sessions.room_id = target_room_id
and room_sessions.user_id = auth.uid()
```

The exact SQL can be implemented directly in policies or through a carefully hardened helper if that measurably improves maintainability.

Do not create a helper-function abstraction merely to avoid a few lines of SQL if it makes authorization harder to audit.

## 13.2 `rooms`

Expected access:

- owner: SELECT own room,
- joined viewer: SELECT joined room,
- random authenticated user: no SELECT,
- anon role: no SELECT,
- owner creation: preferably through `create_room` RPC,
- owner settings mutation: defer or narrowly support only what current backend requires.

## 13.3 `room_sessions`

Expected access:

- room owner/member: room-scoped SELECT as needed,
- current user: may see their own membership,
- INSERT/UPSERT: through `join_room`, not arbitrary client insert,
- client cannot choose `user_id` for somebody else.

## 13.4 `media_items`

Expected access:

- owner/member: SELECT for the room,
- owner: create/update/delete queue items,
- viewer: no writes,
- deleting current media must fail.

Direct owner CRUD is acceptable if RLS is complete and playback invariants are not bypassed. Complex reorder operations should use a transaction/RPC.

## 13.5 `subtitles`

Expected access:

- owner/member: SELECT metadata for the room,
- owner: create/delete metadata,
- viewer: no metadata writes.

## 13.6 `room_playback_state`

Expected access:

- owner/member: SELECT room state,
- no direct client UPDATE,
- no direct client INSERT,
- all mutations through authorized playback RPCs.

This is a critical invariant.

## 13.7 `chat_messages`

Expected access:

- owner/member: SELECT room chat,
- INSERT only through `send_chat_message`,
- no UPDATE,
- no DELETE in the MVP.

## 13.8 UPDATE policy reminder

In Postgres/Supabase, an UPDATE path generally also depends on the row being selectable. Policy design must include the corresponding SELECT visibility where updates are intentionally allowed.

---

# 14. Security-Definer Function Rules

Some functions, especially join/snapshot functions, may need `SECURITY DEFINER` to safely cross RLS boundaries while applying their own explicit authorization.

Every such function must be treated as privileged code.

Required rules:

- Set a safe/empty `search_path`.
- Fully qualify referenced schemas/tables/functions.
- Never trust caller-provided `user_id`.
- Read caller identity using the authenticated request context.
- Explicitly validate ownership/membership before returning protected data.
- Avoid dynamic SQL unless absolutely required.
- Validate array sizes/string lengths/numeric ranges.
- Revoke broad EXECUTE privileges.
- Grant only the intended role.
- Test the function as owner, joined viewer, unrelated authenticated user, and unauthenticated request where applicable.

Do not create security-definer views. If views are introduced later, their RLS behavior must be explicitly reviewed; the MVP does not need views.

---

# 15. Required Backend RPC Contracts

Names may follow the repository's naming convention, but the following capabilities must exist.

## 15.1 `create_room`

Conceptual signature:

```text
create_room(p_name text)
```

Responsibilities:

- require authenticated user,
- create room with `owner_user_id = auth.uid()`,
- create exactly one initial playback-state row,
- return the canonical created room/state information,
- execute atomically.

The client must not send `owner_user_id`.

---

## 15.2 `join_room`

Conceptual signature:

```text
join_room(p_room_id uuid, p_display_name text)
```

Responsibilities were defined in Section 8.

It is the durable membership establishment boundary.

---

## 15.3 `get_server_time`

Conceptual signature:

```text
get_server_time() -> timestamptz
```

Requirements:

- callable by authenticated users,
- returns database-derived time,
- no mutable side effect,
- intentionally minimal payload.

This function is sampled multiple times by clients for clock-offset estimation.

---

## 15.4 `get_room_snapshot`

Conceptual signature:

```text
get_room_snapshot(p_room_id uuid, p_chat_limit integer default 50)
```

The function must require room ownership or durable membership.

It returns the authoritative recovery snapshot needed to initialize/reconcile a room:

```text
room
playback_state
current_media
current_media_subtitles
queue
recent_chat
caller/session information needed by the client
```

It must **not** include Realtime Presence state. Presence is ephemeral and comes from the Realtime channel.

It must not expose data from any other room.

The chat limit must be clamped server-side to a small safe range.

A snapshot should be fetched:

- after joining,
- on hard reload,
- after Realtime reconnect,
- after a large state-version gap or malformed event,
- after returning from long browser sleep/background state when local state may be stale,
- when the user requests GO LIVE/resync.

---

# 16. Authoritative Playback RPCs

All shared playback commands must be atomic database operations.

Suggested public RPC capabilities:

```text
room_play(room_id, expected_version)
room_pause(room_id, expected_version)
room_seek(room_id, expected_version, target_position_sec)
room_restart(room_id, expected_version)
room_select_media(room_id, expected_version, media_id, autoplay)
room_mark_ended(room_id, expected_version)
room_play_next(room_id, expected_version)
```

The exact names are less important than preserving one consistent state machine and authorization boundary.

## 16.1 Common behavior for every playback command

Each playback mutation must:

1. Require `auth.uid()`.
2. Verify the caller owns the room.
3. Lock the authoritative playback row for the transaction.
4. Compare `expected_version` to the current `state_version`.
5. Reject stale commands instead of silently overwriting newer state.
6. Validate the transition and inputs.
7. Use database time for the new anchor time.
8. Increment `state_version` exactly once.
9. Commit one canonical state.
10. Return the newly committed canonical state.
11. Trigger/rely on the room-event broadcast after commit.

## 16.2 Why `expected_version` is required

Multiple admin tabs, retries, slow networks, or double-clicks can otherwise race.

Example:

```text
Admin tab A sees version 50
Admin tab B sees version 50
A pauses -> version 51
B seeks using expected version 50
```

The second command must conflict rather than overwrite version 51 unexpectedly.

The caller then refetches the canonical snapshot/state and decides what to do.

No separate command-log/idempotency subsystem is required for the MVP.

## 16.3 Database row locking

Use a row-level lock on the playback state during mutation so version comparison and state transition happen in one transaction.

The intended semantic is equivalent to:

```text
SELECT playback row FOR UPDATE
check owner
check version
compute new state
UPDATE state
commit
```

## 16.4 `room_play`

If paused:

- preserve `anchor_position_sec`,
- set `anchor_server_time = database now`,
- set status `playing`,
- increment version.

Do not ask the browser for a new authoritative current position merely to resume from pause.

## 16.5 `room_pause`

If currently playing, the database can calculate the canonical pause position itself:

```text
elapsed = database_now - anchor_server_time
pause_position = anchor_position_sec + elapsed
```

Then:

```text
anchor_position_sec = pause_position
anchor_server_time = database_now
status = paused
state_version += 1
```

This is preferable to trusting the admin browser's reported `video.currentTime` for a normal pause command.

## 16.6 `room_seek`

Seek is an intentional new target and therefore accepts a client-specified target position.

The database must:

- reject negative/non-finite values at the application boundary,
- normalize reasonable numeric precision,
- set the new anchor position,
- set the new anchor time to DB time,
- preserve or intentionally choose the status according to the specified API contract,
- increment version.

The implementation should define seek behavior once and use it consistently. Do not have some clients treat seek as pause while others treat it as resume.

Recommended MVP semantic:

- seeking while playing keeps the room playing,
- seeking while paused keeps the room paused.

## 16.7 `room_restart`

Set position to zero while preserving the current play/pause intent according to the same rule used for seek.

## 16.8 `room_select_media`

Requirements:

- selected media must belong to the same room,
- reset position to zero,
- set anchor time to DB time,
- set status to `playing` only if `autoplay = true`; otherwise `paused`,
- increment version.

## 16.9 `room_mark_ended`

Only the admin client may turn the authoritative room state into `ended` in the MVP.

A viewer reaching the end locally does not mutate shared state.

When ended:

- preserve/finalize the end position as appropriate,
- set status `ended`,
- increment version.

Automatic next-item progression is deferred. The owner explicitly triggers next.

## 16.10 `room_play_next`

The operation must atomically:

- lock playback state,
- verify owner and expected version,
- locate the deterministic next queue item,
- select it,
- reset position,
- choose paused/playing behavior according to the MVP contract,
- increment state version once.

A safe default is to select the next item and begin playback only when the admin explicitly requested Play Next.

---

# 17. Playback State Mathematics

## 17.1 Paused room

If:

```text
status = paused
```

then:

```text
expected_position = anchor_position_sec
```

## 17.2 Playing room

If:

```text
status = playing
```

then:

```text
expected_position =
  anchor_position_sec
  + (estimated_server_now - anchor_server_time)
```

All time differences are converted consistently to seconds.

## 17.3 Ended/idle

`idle` has no active media timeline.

`ended` is not mathematically advancing.

## 17.4 Timezone independence

The formula operates on instants and elapsed duration. It does not care whether users are in New York, Damascus, Berlin, Tokyo, or any other timezone.

Timezone is a display concern only.

---

# 18. Server Clock Calibration Contract

A client cannot assume `Date.now()` exactly matches Supabase/Postgres time.

The client must estimate a server offset.

## 18.1 Sampling algorithm

For each sample:

1. Record client send time.
2. Call `get_server_time()`.
3. Record client receive time.
4. Calculate round-trip time (RTT).
5. Estimate the client midpoint between send/receive.
6. Compare the returned DB timestamp to that midpoint.
7. Derive an offset estimate.

Take several samples.

Prefer low-RTT samples and use a robust selection/median strategy rather than trusting the slowest sample.

## 18.2 Use a monotonic elapsed clock where practical

`performance.now()` is preferable for measuring local elapsed intervals because wall-clock corrections can affect `Date.now()`.

A practical implementation can maintain:

- a calibrated wall-clock/server offset,
- a monotonic local reference point,
- an `estimatedServerNow()` function.

## 18.3 Recalibration triggers

Calibrate:

- during initial room join,
- after significant Realtime reconnect,
- after a long page visibility/background sleep,
- when drift behavior suggests the local estimate became poor,
- periodically at a low frequency if the session lasts a long time.

Do not call the server-time RPC continuously.

A periodic interval on the order of several minutes can be tuned from real testing. The exact interval is not a product feature.

---

# 19. Realtime Architecture

## 19.1 One private room channel

Prefer one room-scoped private Realtime channel per connected room client, for example:

```text
room:<room_uuid>
```

Do not create separate WebSocket connections for playback, chat, presence, queue, and subtitles unless a proven platform constraint requires it.

A single channel can carry multiple broadcast event names plus Presence.

## 19.2 Realtime is not authoritative

A client must be able to receive zero historical Realtime messages and still reconstruct current state from Postgres.

Realtime delivery improves responsiveness; it does not replace the snapshot.

## 19.3 Private-channel authorization

Authorization is implemented with RLS on:

```text
realtime.messages
```

Policies must evaluate the requested topic with Supabase's Realtime topic mechanism and verify room ownership/membership.

Clients create the channel as private.

## 19.4 Read permissions

An active room owner/member may receive:

```text
extension = broadcast
extension = presence
```

for that exact room topic.

A user who is not a member/owner may not subscribe to that private room topic.

## 19.5 Write permissions: critical restriction

Application clients should **not** be allowed to emit arbitrary authoritative Broadcast events.

Tonight TV's critical events come from committed database operations.

Therefore the intended Realtime write model is:

- client may INSERT Realtime messages only for `extension = presence` when needed by Presence tracking,
- client does not receive generic permission to publish arbitrary `broadcast` events,
- playback events are emitted from the database after authorized state mutations,
- chat events are emitted from the database after `send_chat_message` commits,
- queue/state events are emitted from the database after their authoritative changes.

This prevents a viewer from fabricating a `playback_state_changed` event directly over a WebSocket even though Postgres would reject the underlying state mutation.

## 19.6 Database-originated Broadcast

Use database-originated Realtime Broadcast for committed events.

Prefer compact custom payloads (for example with `realtime.send`) when the application does not need a complete raw row-change envelope.

Example event families:

```text
playback_state_changed
queue_changed
media_changed
subtitle_metadata_changed
chat_message_created
room_changed
```

Do not broadcast secrets or unrelated table fields.

## 19.7 Playback event payload

A playback-state event should include enough data to apply immediately without another query when the event is valid, for example:

```json
{
  "room_id": "...",
  "state_version": 42,
  "status": "playing",
  "current_media_id": "...",
  "anchor_position_sec": 1523.4,
  "anchor_server_time": "2026-08-17T00:00:00.000Z"
}
```

The client still treats this as a representation of committed DB state, not an independent command.

## 19.8 State-version handling

Client algorithm:

```text
if incoming_version <= last_applied_version:
    ignore event
else if incoming_version == last_applied_version + 1:
    apply canonical state
else:
    event gap detected -> fetch fresh snapshot/state
```

A gap does not necessarily mean data corruption. It means the client cannot prove it saw every relevant transition and should reconcile.

## 19.9 Broadcast replay is optional, not required

Supabase may provide Broadcast replay capabilities for database-originated private broadcasts.

Tonight TV correctness must not depend on replay.

The existing snapshot + version + reconnect model is simpler and is the required MVP recovery mechanism.

Do not add replay-specific complexity unless later real-world testing shows a concrete need.

## 19.10 Realtime policy caching

Realtime authorization is evaluated when joining/subscribing and can be cached for the connection.

If room authorization/membership rules are changed in a future feature, the application must account for reconnect/JWT refresh behavior.

The current MVP has no ban/revocation feature, so do not build an authorization-revocation subsystem now.

---

# 20. Presence

Presence is only for ephemeral online/watch-room state.

## 20.1 Allowed Presence payload

Keep it small, for example:

```json
{
  "user_id": "...",
  "room_session_id": "...",
  "display_name": "Omar",
  "online_at": "..."
}
```

No sensitive data.

## 20.2 Presence must not carry playback position

Do not call Presence `track()` every second with `currentTime`.

Do not use Presence as the synchronization engine.

It is designed for slow-changing connected state.

## 20.3 Viewer counting

One person may have multiple connections/tabs.

The UI-facing watching count should be based on unique authenticated user/session identity rather than naïvely counting every Presence metadata record as a person.

The exact presentation is UI scope, but the backend/client Presence service should expose enough identity to deduplicate.

## 20.4 Presence lifecycle

Track after:

- Auth ready,
- durable join complete,
- private Realtime channel subscribed.

Untrack/remove the channel during normal cleanup where possible.

Unexpected disconnects are handled by Presence semantics.

---

# 21. External Media Metadata

Supabase stores only metadata required to identify the source.

Implemented source types:

- MP4/direct browser-playable file.
- HLS `.m3u8`.
- YouTube identity resolved by the existing YouTube adapter.
- Torrent identity (`infoHash` plus one selected file) resolved at runtime by
  Webtor Self-Hosted into browser-playable HTTP/HLS.
- Local device identity (`infoHash`, room-private magnet, file name, and size)
  resolved by browser WebTorrent/WebRTC peers. Peer availability is local state,
  not canonical playback state, and no per-peer telemetry is persisted.

Preferred MP4 encoding for browser compatibility remains H.264 video + AAC audio where the source provides it.

Supabase must not attempt to make an incompatible media host compatible.
Torrent remux/transcode and cache state belong only to the external gateway.

Failures can still happen because of:

- CORS,
- missing browser codec support,
- authentication cookies,
- referer/origin restrictions,
- expiring signed URLs,
- DRM,
- network/server failure.

Tonight TV must report these as media-source failures. It must not bypass the source's access controls.

---

# 22. Queue / Up Next Backend

## 22.1 Owner-only mutation

Only the room owner may:

- add a media item,
- change title/source metadata,
- remove a non-current media item,
- reorder items,
- select/play an item,
- advance to the next item.

Viewers receive read-only queue data.

## 22.2 Reorder transaction

Queue reorder must be applied atomically.

A conceptual API:

```text
reorder_media_items(room_id, ordered_media_ids[])
```

must validate:

- caller owns room,
- all IDs belong to the room,
- no duplicate IDs,
- the provided set is valid according to the operation contract,
- final positions are deterministic.

Do not make one client request per individual row position if a single transaction can perform the reorder safely.

## 22.3 Current media deletion

MVP rule:

> Reject deletion of the currently selected media item.

The owner can select another item first, then delete the old one.

This avoids hidden state transitions inside a queue CRUD operation.

## 22.4 Auto-next

Automatic next playback is deferred.

The backend must support explicit `room_play_next`, but must not silently invent auto-play-next behavior.

---

# 23. Subtitle Storage Architecture

## 23.1 Storage bucket

Use a private bucket dedicated to subtitles, for example:

```text
subtitles
```

Do not store video in this bucket.

## 23.2 Storage path

Use deterministic room/media/subtitle ownership in the path:

```text
rooms/<room_id>/media/<media_id>/<subtitle_id>.vtt
```

The exact prefix can differ if the repository already has a convention, but policies must be able to derive room ownership/membership from metadata/path safely.

## 23.3 Format

The browser-facing canonical format is WebVTT.

If the admin supplies `.srt`, convert it to VTT before or during the application upload workflow.

Supabase is not a subtitle transcoding service. The conversion is simple application logic.

## 23.4 Storage permissions

Required policy behavior:

- owner/member can download subtitle objects for their room,
- only room owner can upload/replace/delete subtitle objects,
- users cannot escape into another room's path,
- no public bucket URL is required.

Remember that Storage upload/upsert permissions can require different SQL privileges/policies for INSERT/SELECT/UPDATE depending on the operation. Test the actual SDK operations used by the app.

## 23.5 Browser `<track>` authentication issue

A private Storage object cannot be assumed to work by placing its protected URL directly into `<track src>` because HTML media subresource requests cannot be configured like a normal authenticated Supabase client request.

Preferred MVP flow:

```text
Authenticated Supabase client
   |
Download private VTT object
   |
Receive Blob
   |
URL.createObjectURL(blob)
   |
Use object URL as track source
   |
Revoke object URL on cleanup/change
```

An expiring signed URL is another possible design, but it introduces expiry/refresh behavior and is not required for the MVP.

## 23.6 Metadata/object consistency

A subtitle operation crosses two stores:

- Postgres metadata,
- Storage object.

The application service should use a deterministic workflow and best-effort compensation.

Example upload:

1. validate/convert subtitle locally,
2. create/generate subtitle metadata identity/path,
3. upload private VTT,
4. persist metadata,
5. if metadata persistence fails, attempt to delete the orphan object,
6. surface any cleanup failure for manual recovery/logging.

Do not add a distributed transaction framework.

---

# 24. Persistent Chat Backend

Chat is intentionally simple.

## 24.1 Source of truth

A chat message is committed to Postgres first.

Realtime then notifies connected room members.

On reload/reconnect, recent chat comes from the room snapshot/history query.

## 24.2 `send_chat_message` RPC

Conceptual signature:

```text
send_chat_message(p_room_id uuid, p_body text)
```

Requirements:

1. caller authenticated,
2. caller owns or joined the room,
3. body trimmed,
4. reject empty body,
5. enforce maximum length,
6. derive `user_id` from `auth.uid()`,
7. derive/snapshot display name from trusted membership/owner identity data,
8. basic server-side rate limit,
9. insert message,
10. return canonical inserted row,
11. database broadcasts `chat_message_created` after commit.

## 24.3 Message length

Use a modest fixed maximum, for example 500–1000 characters.

Choose one value in implementation and test it. Do not make this a settings subsystem.

## 24.4 Rate limiting

For small private rooms, a simple database-side rolling check against recent messages from the same user is enough.

Example policy target:

```text
no more than 5 messages in 10 seconds per user per room
```

The exact constants are implementation constants, not a user-configurable feature.

Do not create Redis or a dedicated rate-limit service for this MVP.

## 24.5 XSS and content rules

Store plain text.

Do not store raw HTML.

Rendering layers must escape content normally.

The database does not need an HTML sanitizer if it never accepts an HTML rendering contract.

---

# 25. Room Snapshot Contract

The snapshot is the recovery primitive for the whole system.

A conceptual response:

```json
{
  "server_time": "...",
  "room": {
    "id": "...",
    "name": "...",
    "owner_user_id": "..."
  },
  "caller": {
    "user_id": "...",
    "is_owner": false,
    "room_session_id": "...",
    "display_name": "..."
  },
  "playback": {
    "current_media_id": "...",
    "status": "playing",
    "anchor_position_sec": 1200.5,
    "anchor_server_time": "...",
    "state_version": 103
  },
  "current_media": {
    "id": "...",
    "title": "...",
    "source_url": "...",
    "source_type": "hls"
  },
  "subtitles": [],
  "queue": [],
  "recent_chat": []
}
```

This is illustrative. Generated TypeScript types and exact SQL return structure should be stable and explicit.

## 25.1 Consistency

The snapshot should be assembled within one database function/transaction context where practical so related fields are not arbitrarily mixed from very different moments.

Perfect serializable-world consistency is not required for a private watch room, but the returned playback row must be internally valid.

## 25.2 No Presence in snapshot

Presence is not persisted in the snapshot.

Connected users are obtained after joining the Realtime channel.

---

# 26. Client Reconciliation State Machine

Although the visual UI is out of scope, the Supabase contract must support this lifecycle.

## 26.1 Initial join

```text
Auth ready
  -> anonymous sign-in if needed
  -> join_room
  -> clock calibration
  -> fetch snapshot
  -> configure media
  -> subscribe private room Realtime channel
  -> track Presence
  -> calculate expected position
  -> align local player
```

The implementation may subscribe before/after snapshot to reduce race windows, but it must reconcile versions so no transition is silently lost.

A robust variant:

```text
Auth
join_room
clock samples
subscribe Realtime
fetch snapshot
apply snapshot version
ignore any buffered event <= snapshot version
apply newer event or refetch on gap
```

## 26.2 Realtime reconnect

```text
WebSocket reconnect/subscription restored
  -> refresh/reassert auth if required by SDK lifecycle
  -> refetch room snapshot
  -> recalibrate server clock
  -> re-track Presence
  -> reconcile current media and playback
```

Do not assume Realtime will replay every missed event.

## 26.3 Visibility resume / device sleep

After a long background period:

```text
visibility becomes active
  -> determine state may be stale
  -> refresh/reconcile snapshot as needed
  -> recalibrate clock if needed
  -> calculate live position
  -> correct local player
```

## 26.4 GO LIVE backend meaning

GO LIVE is not a special database mutation.

It is a client recovery command:

```text
fetch fresh snapshot
recalibrate if necessary
load correct current media if changed
calculate canonical expected position
seek/correct local player
match shared play/pause state
```

No viewer write to shared playback state occurs.

---

# 27. Drift-Correction Contract

The backend does not stream continuous time updates.

The client periodically compares:

```text
expectedPositionFromCanonicalState
vs
video.currentTime
```

Baseline policy from the project specification:

```text
|drift| < ~0.250s
    -> no correction

~0.250s <= |drift| <= ~1.0s
    -> temporary small playbackRate correction

|drift| > ~1.0s
    -> hard seek to canonical live position
```

Small rate examples may be around 0.98x–1.04x, but these values are tuning constants, not protocol guarantees.

After catch-up, restore playback rate to normal.

Real-world testing across devices/networks determines final thresholds.

No threshold change requires a database schema change.

---

# 28. Media Buffering Semantics

A viewer who buffers does not pause the room.

The authoritative room remains playing.

When local playback can continue:

1. recalculate current expected room position,
2. measure drift,
3. catch up using the correction policy,
4. hard-seek if too far behind.

The backend must not implement a "wait for slowest viewer" barrier.

---

# 29. Next.js Integration Boundary

This document does not prescribe UI components. It prescribes backend-facing integration.

## 29.1 Browser client

Browser-side responsibilities include:

- anonymous Auth creation,
- current session access,
- private Realtime channel,
- Presence,
- member-authorized Storage download,
- room service calls allowed from browser,
- synchronization engine consumption of canonical state.

## 29.2 Server client

Use the current Supabase SSR/server-client pattern where server-side authenticated reads are actually needed.

Do not blindly trust an unvalidated session object for server authorization decisions. Use the current Supabase-supported claim/user validation path appropriate to the repository version.

## 29.3 Domain services

Prefer a few coherent modules by responsibility rather than dozens of one-function files.

A reasonable logical split may include:

```text
lib/supabase/          clients + generated DB types
lib/rooms/             room/join/snapshot domain access
lib/realtime/          room channel + presence lifecycle
lib/sync/              clock math + playback reconciliation
lib/media/             external media adapter/source handling
lib/subtitles/         VTT conversion/storage retrieval
lib/chat/              chat service
```

This is a logical guide, not a command to create every directory if the repository already has a better coherent structure.

## 29.4 Avoid abstraction inflation

Do not create:

- a repository class for each table,
- a service class for each RPC,
- duplicate DTO and entity types when generated DB types are adequate,
- index/barrel files solely for aesthetics,
- an event bus on top of Supabase Realtime,
- a custom ORM.

Add an abstraction only when it owns real behavior or isolates a meaningful boundary.

---

# 30. Generated TypeScript Types

Database schema and TypeScript must stay synchronized.

After migration/schema changes, regenerate Supabase database types using the workflow already adopted by the repository.

The generated type file should be committed if that is the repository's convention.

Application code should avoid handwritten copies of database row shapes when generated types can express them.

For domain-level Realtime payloads or computed sync state, explicit TypeScript types are appropriate because those are not identical to raw rows.

---

# 31. Migration and Local Development Strategy

## 31.1 Preserve one schema workflow

Before changing the database, inspect the repository.

If it already uses:

- migration-first SQL, keep that model;
- declarative Supabase schemas + generated migrations, keep that model.

Do not introduce both representations independently and force the team to maintain duplicate schema sources.

## 31.2 Migration files are the reproducible contract

Database changes must be represented in version control.

A remote Dashboard-only change is not sufficient.

If changes are made directly on a linked development Supabase project, capture/reconcile them into migrations before calling the milestone complete.

## 31.3 Local reset verification

Where local Supabase tooling is available, a backend milestone is not complete until migrations can be replayed from a clean local database:

```text
supabase db reset
```

or the repository-equivalent command.

## 31.4 Seeds

Seed data is for development/test only.

Do not dump real user data, real private media URLs, secrets, or production chat into committed seed files.

Keep seed data minimal and deterministic.

---

# 32. Failure and Recovery Model

## 32.1 RPC succeeds, Realtime event is missed

Expected recovery:

- database remains correct,
- affected client receives state on next snapshot/reconciliation,
- no repair write is necessary.

## 32.2 Realtime event arrives out of order

Use `state_version`.

Stale event is ignored.

## 32.3 State-version gap

Fetch canonical snapshot/state.

Do not attempt to infer missing commands.

## 32.4 WebSocket disconnect

Resubscribe, fetch snapshot, recalibrate, re-track Presence.

## 32.5 Browser sleep/background throttling

On meaningful resume, reconcile rather than trusting old timers.

## 32.6 Auth refresh

Realtime and data access must continue with the refreshed Auth token according to the current Supabase SDK lifecycle.

Do not work around expired JWTs with a privileged server key.

## 32.7 Media source failure

This is not a Supabase consistency error.

The room can remain authoritative while the media adapter reports:

- CORS failure,
- network failure,
- unsupported codec,
- HLS failure,
- auth/referrer restriction,
- expired source URL,
- DRM/unsupported source.

Admin may later replace/update the source metadata. No bypass mechanism is part of Tonight TV.

## 32.8 Subtitle upload partially fails

Use compensation/cleanup described in the Storage section.

Do not introduce a job queue solely for this.

---

# 33. Concurrency Model

## 33.1 Playback

Serialize conflicting authoritative playback commands on the room playback row.

Use `expected_version` plus row lock.

## 33.2 Queue reorder

One transaction validates and writes the final order.

## 33.3 Chat

Chat inserts can be concurrent. Ordering is by authoritative `created_at` plus stable tie-breaking ID if needed.

## 33.4 Join

`unique(room_id, user_id)` makes repeated join calls safe to upsert rather than create duplicate durable memberships.

## 33.5 Subtitle metadata

Each subtitle row has its own UUID/path. Replacing an existing track should have an explicit service behavior rather than racing blind upserts.

---

# 34. Realtime Event Design

Keep events compact and typed.

## 34.1 Required event properties

Every room-scoped application Broadcast should make its room context clear.

Playback event must include its state version.

Other events should include stable IDs and enough canonical data to update local state or a clear signal to refetch.

## 34.2 Event examples

### Playback

```json
{
  "event": "playback_state_changed",
  "payload": {
    "room_id": "...",
    "state_version": 54,
    "status": "paused",
    "current_media_id": "...",
    "anchor_position_sec": 932.14,
    "anchor_server_time": "..."
  }
}
```

### Queue

For simplicity and correctness, a queue change event may contain only:

```json
{
  "event": "queue_changed",
  "payload": {
    "room_id": "..."
  }
}
```

and clients refetch queue/snapshot if queue changes are infrequent.

Do not optimize prematurely by designing a full replicated collection protocol.

### Chat

```json
{
  "event": "chat_message_created",
  "payload": {
    "id": "...",
    "room_id": "...",
    "user_id": "...",
    "sender_display_name": "Omar",
    "body": "...",
    "created_at": "..."
  }
}
```

## 34.3 Never trust event origin alone

Even though events are database-originated by design, client code still validates payload shape and room/version before applying it.

---

# 35. Free-Plan Efficiency Principles

The architecture is intentionally economical.

## 35.1 What does not consume Supabase video bandwidth

External movie bytes go from the media host to browsers directly.

A large movie file does not become Supabase egress simply because its URL is stored in Postgres.

## 35.2 Realtime efficiency

Use:

- one room channel per connected client,
- event-driven broadcasts,
- compact payloads,
- Presence only for connection state,
- no per-second playback updates,
- no per-frame data,
- no continuous viewer telemetry.

## 35.3 Database efficiency

Use indexes on every room-membership lookup that appears in RLS/Realtime authorization.

Private-channel RLS must remain simple enough to avoid expensive subscription authorization.

## 35.4 Chat history

Snapshot only a bounded recent number of messages.

Do not download entire historical chat on every join.

## 35.5 Plan limits

Do not encode assumptions such as "the Free plan will always allow exactly N connections/messages" into application logic.

Current quotas can change.

Before deployment/launch, verify current Supabase plan quotas. The friend-room use case should remain naturally low-volume because of the architecture above.

---

# 36. Security Checklist

The backend is not complete unless all items below are verified.

## 36.1 Credentials

- [ ] Browser uses project URL + publishable key only.
- [ ] No secret/service-role key is in client code.
- [ ] No database password is committed.
- [ ] `.env*` handling follows repository security conventions.
- [ ] Logs do not print Auth tokens.

## 36.2 Database

- [ ] RLS enabled on every client-accessible application table.
- [ ] `anon` has no unintended application-table access.
- [ ] `authenticated` grants are explicit and minimal.
- [ ] Owner-only writes cannot be performed by a viewer.
- [ ] Playback state has no direct client write path.
- [ ] Cross-room relationships are rejected by DB constraints.
- [ ] Security-definer functions use safe search path and explicit authorization.
- [ ] Function EXECUTE privileges are restricted.
- [ ] Snapshot cannot leak another room.

## 36.3 Realtime

- [ ] Room channel is private.
- [ ] Non-member cannot subscribe.
- [ ] Member can receive room broadcast/presence.
- [ ] Client cannot publish arbitrary Broadcast events.
- [ ] Member can publish only required Presence state.
- [ ] Realtime membership lookup columns are indexed.
- [ ] Channel is removed/unsubscribed on cleanup.

## 36.4 Storage

- [ ] Subtitle bucket is private.
- [ ] Member can read only allowed room subtitle objects.
- [ ] Viewer cannot upload/delete.
- [ ] Owner cannot write outside valid room path via application policy.
- [ ] Object URLs are revoked in client cleanup.

## 36.5 Chat

- [ ] Sender UUID comes from Auth, not request payload.
- [ ] Sender must be room owner/member.
- [ ] Body limits enforced server-side.
- [ ] Rate limit enforced server-side.
- [ ] No raw HTML rendering contract.

---

# 37. Backend Test Matrix

Tests should focus on contracts and security, not visual behavior.

## 37.1 Schema/migration tests

- clean migration replay succeeds,
- required tables/enums/constraints/indexes exist,
- exactly one playback row created per room,
- foreign keys prevent cross-room relationships,
- deleting current media fails,
- generated TypeScript types are up to date.

## 37.2 Auth/membership tests

Actors:

```text
Owner A
Viewer B (anonymous authenticated user)
Outsider C (anonymous authenticated user, not joined)
Unauthenticated request
```

Verify:

- owner creates room,
- viewer with exact room ID can call join,
- outsider cannot read room before joining,
- joined viewer can read room snapshot,
- viewer cannot mutate owner-only data,
- unauthenticated user cannot call protected functions.

## 37.3 Playback RPC tests

Verify:

- owner can play/pause/seek/restart/select/end/next,
- viewer cannot call authoritative playback mutations,
- outsider cannot call them,
- stale `expected_version` conflicts,
- successful command increments version exactly once,
- pause while playing computes position from DB time,
- selected media must belong to room,
- state transitions remain internally valid.

## 37.4 Realtime authorization tests

Verify:

- owner can join room channel,
- member can join room channel,
- outsider cannot join room channel,
- member receives DB-originated playback Broadcast,
- member receives chat Broadcast,
- member can track Presence,
- viewer cannot send forged application Broadcast event.

## 37.5 Snapshot/reconnect tests

Simulate:

- join after movie already playing,
- missed Realtime event,
- out-of-order event,
- state-version gap,
- disconnect/reconnect,
- page sleep/resume,
- fresh snapshot restores canonical media/status/position inputs.

## 37.6 Clock tests

Use deterministic/fake clocks where possible.

Verify:

- midpoint/RTT offset calculation,
- low-RTT sample selection,
- expected-position math,
- paused state does not advance,
- playing state advances correctly,
- timezone does not enter the equation.

## 37.7 Storage tests

Verify:

- owner uploads VTT,
- member downloads it,
- outsider cannot download it,
- viewer cannot upload/delete,
- path cannot escape room/media namespace,
- metadata points to correct room/media.

## 37.8 Chat tests

Verify:

- member sends valid plain-text message,
- outsider rejected,
- empty rejected,
- over-limit rejected,
- rate-limit threshold enforced,
- recent history returned newest/oldest in intended order,
- message broadcast occurs after commit.

---

# 38. Synchronization Proof Before UI Work

The backend/sync proof is successful when one admin and at least two viewers in separate browser contexts can perform the following repeatedly:

```text
create/join room
load one test media item
JOIN LIVE
play
pause
seek
restart
reload a viewer
join a late viewer
simulate missed event/reconnect
return from background
GO LIVE/resync
```

and all clients recover to the canonical room state without viewer actions mutating the shared timeline.

This proof matters more than visual polish.

---

# 39. Minimal Observability

Use Supabase's built-in logs/reports and application error reporting that already exists in the project.

Monitor at least:

- Auth failures,
- RLS permission failures,
- RPC errors/version conflicts,
- Realtime subscribe failures,
- Realtime reconnect frequency,
- Storage access failures,
- unexpected snapshot failures.

Do not log:

- JWTs,
- secret keys,
- full private media URLs unless absolutely necessary for local debugging,
- private chat payloads in production logs by default.

Do not introduce a new analytics/observability platform as part of this backend unless the project already uses one.

---

# 40. Performance Rules

## 40.1 RLS indexes

Indexes must support authorization queries, especially:

```text
room_sessions(room_id, user_id)
rooms(id, owner_user_id) / owner index
```

Complex RLS that scans whole membership tables is unacceptable.

## 40.2 Snapshot boundedness

The snapshot must not become an unbounded dump.

- queue size naturally small,
- subtitles only for relevant media/queue contract,
- chat limited,
- no entire historical event log.

## 40.3 Payload size

Broadcast the minimum necessary canonical fields.

Do not send raw database rows with unrelated columns when a compact event is enough.

---

# 41. Deployment Checklist

Before applying backend changes to the target Supabase project:

- [ ] Review current code and existing migrations.
- [ ] Verify migration ordering.
- [ ] Run clean local reset where available.
- [ ] Run database/RLS tests.
- [ ] Generate/update TypeScript DB types.
- [ ] Verify environment variable names.
- [ ] Verify browser bundle contains no privileged key.
- [ ] Verify Anonymous Auth setting.
- [ ] Verify private Realtime configuration.
- [ ] Verify `realtime.messages` authorization policies.
- [ ] Verify subtitle bucket is private.
- [ ] Verify Storage policies.
- [ ] Verify all sensitive RPC EXECUTE grants.
- [ ] Verify member/outsider test matrix against target environment.
- [ ] Verify one admin + two viewers end-to-end.
- [ ] Verify reconnect/snapshot recovery.
- [ ] Recheck current Supabase quotas before relying on Free plan for real users.

For a remote migration deployment, use the repository's established Supabase CLI/MCP workflow and preview changes where supported. Never destructively reset a production database.

---

# 42. Definition of Done — Supabase Backend

The Supabase backend is considered MVP-complete when all of the following are true:

1. Admin persistent Auth works.
2. Viewer anonymous Auth works.
3. Private room creation works.
4. Exact-ID viewer join establishes durable membership.
5. RLS prevents private-room discovery/leakage.
6. Room snapshot returns all required canonical room data to members only.
7. Server-time calibration RPC exists.
8. One playback-state row exists per room.
9. Owner-only playback RPCs are atomic and version-checked.
10. `state_version` is monotonic.
11. Database time anchors playback.
12. Private Realtime room channel is authorized by membership.
13. Clients cannot forge authoritative Broadcast application events.
14. Playback changes broadcast after committed DB mutation.
15. Presence tracks connected room users without carrying playback time.
16. Reconnect always recovers via snapshot.
17. Media queue persists external source metadata only.
18. Current media cannot be deleted accidentally.
19. Private subtitle Storage works for owner/member permissions.
20. SRT-to-VTT application path is supported without video processing.
21. Persistent bounded chat works with membership validation and basic rate limiting.
22. Generated TypeScript DB types match schema.
23. Clean migrations replay successfully.
24. Security test matrix passes for owner/member/outsider/unauthenticated actors.
25. One admin + two viewer synchronization proof passes.
26. No UI redesign work was required to achieve backend completion.
27. No excluded feature was added.

---

# 43. Change-Control / Anti-Scope-Creep Gate

Before adding any new backend object, ask all of these questions:

```text
What existing requirement does this serve?
Which invariant does it preserve or implement?
Can the requirement be implemented with the existing schema/services?
Does this create a new product feature rather than backend support?
Does it introduce a second source of truth?
Does it create another realtime channel, server, queue, or background service without necessity?
Does it store or relay media bytes?
Can it be deferred until a real test proves it is needed?
```

If the proposed object cannot be tied to a requirement in this document or the primary project spec, reject it for the MVP.

Examples of changes that require a future explicit decision rather than quiet implementation:

- room password table,
- invitations table,
- bans table,
- watch-history table,
- reactions table,
- notification table,
- command/event log,
- playback telemetry table,
- per-user playback-position table,
- analytics events table,
- media proxy service,
- Edge Function just to wrap an RPC that already works securely,
- Redis cache,
- custom WebSocket gateway.

---

# 44. Implementation Notes That Must Not Become New Features

## 44.1 Current API-key terminology

New code should say **publishable key** when referring to the browser key.

Legacy projects may still expose environment variables named around `ANON_KEY`. Do not rename a working production environment blindly; migrate deliberately. The security property matters more than the variable label.

## 44.2 Broadcast vs Postgres Changes

Tonight TV should prefer database-originated Broadcast for room events.

Postgres Changes can be useful for quick prototypes, but it is not the intended long-term event-delivery contract in this specification.

Do not implement both mechanisms for the same event unless there is a measured reason.

## 44.3 Realtime replay

Available platform features such as replay do not replace the snapshot model.

Do not add them simply because they exist.

## 44.4 Edge Functions

No Supabase Edge Function is required by the core MVP architecture.

Use Postgres RPC + RLS + Realtime + Storage first.

Add an Edge Function only when a future requirement genuinely needs a trusted non-database server environment, external secret/API call, or behavior that Postgres should not own.

---

# 45. Official Supabase References Used for This Backend Contract

These references should be rechecked by the implementing agent when current platform behavior matters:

- Supabase Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization
- Supabase Realtime Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Subscribing to Database Changes / Broadcast recommendation: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Presence: https://supabase.com/docs/guides/realtime/presence
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Anonymous Sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Next.js server-side Auth: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase TypeScript type generation: https://supabase.com/docs/guides/api/rest/generating-types
- Supabase local development workflow: https://supabase.com/docs/guides/local-development/cli-workflows

The product requirements themselves come from `tonight-tv-nextjs-supabase-spec.md`; the links above are platform implementation references, not permission to expand Tonight TV's feature set.

---

# 46. Final Backend Principle

The simplest correct mental model is:

> Postgres decides what the room is doing. Realtime tells connected members quickly. Each browser calculates where the shared timeline should be and plays the media directly from its external source. Auth, RLS, and private-channel authorization ensure only the room owner can change shared state and only room members can read it.

Anything that makes this model materially more complicated must prove why it is necessary before entering the MVP.
