# Tonight TV — AI Agent Implementation Prompts

**Version:** 1.0  
**Last updated:** 2026-08-17  
**Purpose:** A sequence of large, implementation-grade prompts to give to an AI coding agent one at a time.  
**Current project focus:** Backend/Supabase/synchronization foundations. Visual UI work is intentionally excluded.

---

# 0. How to Use This File

This is not a task checklist made of tiny edits.

Each numbered prompt is a **substantial project milestone**. Give the prompts to the coding agent in order. A prompt should normally result in a coherent, working slice of the system with migrations, application integration, authorization, tests, and verification where relevant.

Do not ask the agent to execute all prompts in one run.

Recommended usage:

```text
Prompt 1
-> review result
-> fix any real blockers if needed
-> then Prompt 2
-> review result
-> then Prompt 3
...
```

The project has two critical specification files that the agent must treat as source material:

```text
tonight-tv-nextjs-supabase-spec.md
tonight-tv-supabase-backend-spec.md
```

The first is the overall product/architecture specification.

The second is the authoritative Supabase/backend implementation contract.

If the backend-specific document refines an older Supabase implementation detail, the backend-specific document wins for that detail only. It does not expand product scope.

---

# 1. GLOBAL OPERATING CONTRACT FOR THE AI CODING AGENT

The following instructions apply to **every implementation prompt in this document**.

If your AI agent retains project instructions across turns, provide this contract once before Prompt 1 and keep it active.

If the agent does not retain context reliably, include this contract together with every numbered prompt.

---

## GLOBAL AGENT INSTRUCTIONS

You are implementing **Tonight TV**, a private synchronized watch-room application built with Next.js, TypeScript, and Supabase.

Before writing or changing code, you MUST understand the repository as it exists now. Do not implement from the prompt alone.

### A. Read the project before coding

Before every milestone:

1. Recursively inspect the repository structure.
2. Read all project-owned Markdown specification/instruction files that can affect implementation, especially:
   - `tonight-tv-nextjs-supabase-spec.md`
   - `tonight-tv-supabase-backend-spec.md`
   - `README.md`
   - `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or equivalent repository instructions if present.
3. You do **not** need to recursively read dependency/build-output documentation inside directories such as:
   - `node_modules`
   - `.next`
   - build/dist output
   - generated vendor directories
4. Inspect the **current code**, not only the documentation.
5. Inspect `git status` and relevant diffs before modifying anything.
6. Preserve user changes and unfinished work already present in the working tree.
7. Inspect the current package manager/lockfile, `package.json`, `tsconfig`, Next.js config, test configuration, lint/format configuration, environment-variable conventions, and directory structure.
8. Inspect the current Supabase setup before creating a new one:
   - `supabase/config.toml`
   - `supabase/migrations/`
   - `supabase/schemas/` if present
   - seed files
   - generated database types
   - existing Supabase browser/server clients
   - current Auth helpers
   - existing RPC calls
   - existing Realtime code
   - existing Storage code
9. Determine what is already implemented, partially implemented, duplicated, broken, or missing.
10. If a correct implementation already exists, **integrate with or improve it**. Do not create a parallel implementation just because the prompt describes one.

Do not skip this inspection phase even if you think you already understand the project from a previous milestone. The codebase may have changed.

### B. Respect specification precedence

Use this hierarchy:

1. Current explicit user instruction.
2. Repository-level agent instructions such as `AGENTS.md` when applicable.
3. `tonight-tv-supabase-backend-spec.md` for Supabase/backend mechanics.
4. `tonight-tv-nextjs-supabase-spec.md` for the overall Tonight TV product and architecture.
5. Existing implementation conventions when they do not conflict with the specifications.

If two sources conflict, resolve the conflict using this hierarchy and mention the decision in your final report. Do not silently invent a third architecture.

### C. No scope creep

Do not add features merely because they are common in streaming/watch-party applications.

The current backend scope explicitly excludes, among other things:

- voice/video calls,
- screen sharing,
- public room discovery,
- public movie catalog,
- recommendation systems,
- social graphs,
- invitations/password/ban systems unless explicitly requested later,
- reactions/rich chat,
- video upload/proxy/transcoding,
- DRM bypass,
- protected-link scraping,
- torrents,
- custom WebSocket servers,
- Express/Socket.IO backend,
- Redis,
- Kafka/queue infrastructure,
- generic event sourcing,
- generic audit platforms,
- mobile/TV apps,
- visual redesign work.

If a proposed dependency/table/service/module does not directly implement a documented requirement, do not add it.

### D. Ignore visual UI work for these milestones

The user explicitly wants to defer interfaces/visual design.

You may add the **minimum nonvisual integration surface** required to exercise backend behavior or existing routes/components, but do not spend the milestone on:

- page styling,
- responsive visual polish,
- design systems,
- animation,
- layout redesign,
- icons,
- branding,
- component-library migrations.

Backend and synchronization correctness take priority.

### E. Minimize file proliferation

Do not turn each small function into a new file.

Do not create documentation/report files merely to prove the milestone is finished.

Specifically, unless the existing repository requires them, do **not** create files like:

```text
MILESTONE_1_REPORT.md
IMPLEMENTATION_NOTES.md
TEST_RESULTS.md
PLAN.md
SUMMARY.md
TODO_FOR_NEXT_AGENT.md
```

Your completion report belongs in your response to the user, not in a pile of new repository files.

Prefer a **small number of cohesive files** that fit the current repository structure.

Do not create:

- one repository class per table,
- one service file per single RPC,
- redundant DTO/entity copies of generated Supabase types,
- barrel/index files solely for aesthetics,
- wrappers around wrappers,
- placeholder abstractions with one caller,
- duplicate browser/server Supabase client factories.

Create a new file when it has a real cohesive responsibility or when the current project structure clearly calls for it.

### F. Do not perform gratuitous rewrites

Do not rewrite unrelated code for style.

Do not rename/move the entire project to match your preferred architecture.

Do not replace a working framework/library with another one unless the milestone requires it.

Keep diffs focused on the milestone while still implementing the milestone completely.

### G. Dependencies

Before adding a package:

1. Check whether the repository already has an adequate dependency.
2. Check whether native browser/Node/Postgres/Supabase functionality already solves the problem.
3. Add a package only when it materially reduces risk or is required by the specification.
4. Use the repository's existing package manager.
5. Do not update unrelated packages.

### H. Supabase platform accuracy

Supabase behavior changes over time.

For platform-sensitive details, use current official Supabase documentation rather than old memory when tooling/network access allows it.

Pay particular attention to:

- current publishable/secret key model,
- `@supabase/ssr` integration,
- anonymous Auth,
- RLS behavior,
- database function security,
- Data API grants,
- private Realtime channel authorization through `realtime.messages`,
- Realtime Broadcast/Presence behavior,
- Storage RLS,
- Supabase CLI/migration workflow.

Do not use third-party blog posts as authority when official Supabase documentation is available.

### I. Supabase credentials and connected tools

Never ask the user for the database password if a connected Supabase development tool can perform the required operation without it.

Never print or expose secret keys.

Never place a secret/service-role key in browser code.

Use a publishable key in browser-facing Supabase clients.

If the environment has a connected Supabase project/MCP/tooling:

- inspect the current project/schema before mutating it,
- use the supported SQL execution/migration workflow,
- keep the repository migration files synchronized with the remote state,
- run security/performance advisors if available when the milestone reaches hardening.

If no remote Supabase connection is available:

- implement all repository-side migrations/code/tests possible,
- use the local Supabase CLI if already available,
- do not pretend a remote migration was applied,
- report the exact external step/blocker succinctly.

### J. Preserve the existing database workflow

Determine whether the repository is using:

- imperative migration SQL,
- declarative Supabase schemas plus generated migrations,
- another established supported workflow.

Preserve that workflow.

Do not introduce a second competing schema source of truth.

Every database change must be reproducible from version-controlled project files.

### K. Backend security is part of implementation, not a later TODO

Do not create tables now and promise to add RLS later if the milestone exposes them to the client.

Do not leave security-sensitive TODO placeholders.

Every client-accessible table/RPC/channel/storage path added in a milestone must have the required:

- grants,
- RLS,
- ownership/membership validation,
- function EXECUTE policy,
- input validation,
- tests or verification.

A feature with missing authorization is not complete.

### L. Preserve Tonight TV's core invariants

Never violate these rules:

1. Postgres is authoritative; Realtime is transport/notification.
2. One `room_playback_state` row per room is the canonical timeline.
3. Admin shared-playback actions are database-authorized.
4. Viewers never mutate the shared timeline.
5. Server/database time anchors synchronization.
6. `state_version` is monotonic.
7. No per-second `currentTime` writes/messages.
8. External video streams directly to each browser, never through Supabase/Next.js.
9. Reconnect always recovers from a fresh snapshot/reconciliation.
10. Room data is private and membership-scoped.
11. Realtime application Broadcast events are database-originated; arbitrary client Broadcast must not become an authority bypass.

### M. Tests and verification are required

Before finishing a milestone, run all relevant checks available in the repository, for example:

```text
format/check
lint
typecheck
unit tests
integration tests
Supabase DB reset / migration replay
SQL/RLS tests
build
```

Do not run irrelevant destructive commands.

If a full command cannot run because of an external dependency, run the maximal subset that can run and explain the blocker.

Do not claim a test passed if you did not run it.

### N. No fake completion

Do not leave core behavior as:

- pseudocode,
- uncalled helpers,
- TODOs,
- mocks in production paths,
- hardcoded fake user IDs,
- hardcoded room IDs,
- disabled security checks,
- comments that say "implement later" for requirements inside the current milestone.

If something genuinely cannot be completed because required infrastructure is unavailable, finish everything else and state exactly what remains.

### O. Final response after each milestone

At the end of **each prompt**, stop. Do not begin the next prompt automatically.

Return a concise implementation report in chat containing:

1. **Inspected:** important existing architecture/state you found.
2. **Implemented:** the coherent capability completed.
3. **Changed files:** only the important files, with why they changed.
4. **Database/security:** migrations, RLS, grants, RPCs, Storage/Realtime policies changed.
5. **Verification:** exact checks/tests you actually ran and their results.
6. **Blockers/manual steps:** only if real.
7. **Intentionally not implemented:** relevant scope exclusions preserved.

Do not create a separate report file for this summary.

Then stop and wait for the next user prompt.

---

# PROMPT 1 — Repository Integration, Supabase Clients, and Authentication Foundation

Copy the following prompt to the coding agent.

---

## Prompt 1

Implement the **Tonight TV Supabase integration and authentication foundation** as a complete first milestone.

Before implementation, obey the Global Operating Contract above: re-read all relevant project `.md` files, inspect the full current repository/code state, inspect git status/diffs, inspect existing Supabase and Auth code, and integrate rather than duplicate anything that already works.

### Goal

At the end of this milestone, the repository must have a clean, production-appropriate Supabase client/Auth foundation that later room/database/realtime work can safely build on.

This is not a UI milestone.

### Required work

#### 1. Audit and normalize the current Supabase integration

Inspect whether the repository already has:

- `@supabase/supabase-js`,
- `@supabase/ssr`,
- browser client factory,
- server client factory,
- request/proxy/middleware Auth refresh integration appropriate to the current Next.js version,
- generated database types,
- environment-variable validation,
- Auth helpers.

Reuse correct code. Remove/merge only real duplication.

Do not create a second Supabase-client architecture next to an existing correct one.

#### 2. Use the current publishable-key model

The browser must be configured from values equivalent to:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

If the repository already uses a legacy `ANON_KEY` name and changing it would break existing deployment configuration, handle migration deliberately and document the exact compatibility decision in your final response. Do not blindly rename environment variables.

No Supabase secret/service-role key may enter a browser bundle.

Do not add a secret key unless an existing server-only requirement genuinely needs one.

#### 3. Browser client

Provide exactly one coherent browser Supabase client pattern suitable for:

- Auth,
- future Realtime,
- future Storage,
- client-side RPC calls.

It should use generated database types if they already exist and can be wired correctly now.

#### 4. Server-side client/Auth integration

Provide the current recommended Next.js/Supabase SSR cookie/session path appropriate to the repository's Next.js version.

The server-side Auth boundary must not blindly trust stale/unvalidated client session data for authorization-sensitive decisions.

Do not introduce server-side Supabase usage everywhere just because it is available.

#### 5. Authentication service behavior

Implement or normalize a small cohesive Auth API that supports the future product flow:

```text
persistent admin -> normal Supabase account session
viewer without session -> Supabase anonymous sign-in
existing authenticated viewer -> reuse existing session
```

Required capabilities:

- obtain current authenticated user/session safely,
- ensure a viewer has an authenticated identity, using anonymous sign-in only when no user exists,
- sign out where already required by the app,
- expose Auth readiness/errors cleanly to later room services.

Do not implement room membership yet. That belongs in a later milestone.

#### 6. Anonymous-user correctness

Do not treat "anonymous" as `anon` Postgres-role access after sign-in. Supabase anonymous sign-in yields an authenticated user identity.

Do not infer anonymous/persistent status from nickname or email formatting.

If code needs to distinguish the account type, use current Supabase Auth claims/metadata designed for that purpose.

#### 7. Environment contract

Update the existing environment example/documentation location only if needed.

Do not create several new environment documentation files.

The app should fail clearly in development when required public Supabase configuration is missing rather than failing much later with a cryptic network error.

Do not expose secrets in error messages.

#### 8. Types

If database-generated Supabase TypeScript types already exist, wire the client to them.

If the schema is not yet implemented and therefore accurate generated types cannot exist, do **not** invent a giant fake `Database` interface. Keep the integration ready for the types that will be generated in Prompt 2.

#### 9. Minimal nonvisual verification surface

Use tests or existing development code to prove:

- browser client creation is stable,
- server client creation/cookie handling is valid for the current framework,
- an existing session is reused,
- anonymous sign-in is invoked only when necessary,
- errors propagate correctly.

Do not build a designed login/join page as part of this prompt.

### Constraints

- No database schema for Tonight TV yet unless a correct existing migration already exists and must be preserved.
- No room tables.
- No Realtime channel implementation.
- No video player.
- No visual UI work.
- No service-role/secret key in client code.
- No custom backend server.
- No unnecessary package upgrades.

### Verification

Run the relevant repository checks, including as available:

- lint,
- TypeScript/typecheck,
- Auth-related tests,
- build or the smallest reliable Next.js compile check.

Inspect the built/client code path sufficiently to ensure no privileged Supabase credential was introduced.

### Completion standard

This milestone is complete only when future code can import/use one canonical Supabase browser client, one canonical server/SSR pattern where needed, and one coherent Auth helper/service for persistent and anonymous users without duplicating session logic across the app.

Finish with the required chat completion report and STOP. Do not begin Prompt 2.

---

# PROMPT 2 — Core Postgres Schema, Constraints, Grants, Migrations, and Generated Types

---

## Prompt 2

Implement the **core Tonight TV Supabase/Postgres schema** as one coherent, reproducible database milestone.

Before changing anything, obey the Global Operating Contract: re-read all project Markdown specs, inspect current code and migrations/schema workflow, inspect git status/diffs, and determine exactly what Prompt 1 or previous work already implemented. Preserve the project's existing Supabase migration approach rather than introducing a competing schema representation.

### Goal

At the end of this milestone, the repository must contain a clean reproducible database foundation for Tonight TV with the core tables, types, relationships, constraints, indexes, minimal explicit Data API grants, deny-by-default RLS posture, and synchronized generated TypeScript database types.

Do not implement the full membership/RPC policy surface yet; Prompt 3 will add those access paths. However, every new table must already have RLS enabled so there is no accidental open window.

### Required schema

Implement the logical model from `tonight-tv-supabase-backend-spec.md`.

#### 1. Playback status type

Support exactly the documented MVP states:

```text
idle
paused
playing
ended
```

Use a database enum or a comparably strict database constraint consistent with the repository's schema conventions.

#### 2. Media source type

Support the documented MVP source types:

```text
auto
mp4
hls
```

Do not add DASH, YouTube, torrent, DRM-provider, or other source types without an existing requirement.

#### 3. `rooms`

Implement room identity and ownership with:

- UUID/high-entropy primary key,
- `owner_user_id` referencing Supabase Auth,
- room name,
- timestamps,
- appropriate name constraints,
- owner lookup index.

Do not add public discovery fields, passwords, invitation state, bans, social metadata, or analytics counters.

#### 4. `room_sessions`

Implement durable room membership/display identity with:

- UUID primary key,
- room FK,
- authenticated user FK,
- display name,
- joined/updated timestamps,
- unique `(room_id, user_id)`,
- indexes that support membership and RLS lookups.

Do not use this table as online Presence state.

Do not add moderation/ban/invite state.

#### 5. `media_items`

Implement external-media metadata and deterministic queue position:

- room FK,
- title,
- `source_url`,
- source type,
- queue position,
- creator identity,
- timestamps,
- same-room relationship support for playback/subtitles,
- queue indexes.

The URL is metadata only. Never upload/proxy video.

Choose queue-order constraints that make transactional reorder safe. Do not create a fragile uniqueness scheme that makes valid reordering impossible mid-transaction.

#### 6. `subtitles`

Implement subtitle metadata:

- room FK,
- media FK constrained to the same room,
- label,
- optional language code,
- private Storage path,
- canonical `vtt` format marker,
- creator identity,
- timestamp,
- room/media index.

Do not create the Storage bucket/policies yet; Prompt 8 handles the complete Storage workflow.

#### 7. `room_playback_state`

Implement exactly one authoritative row per room:

- room ID as primary key,
- current media ID constrained to the same room,
- playback status,
- nonnegative anchor position,
- DB/server anchor timestamp,
- nonnegative monotonic `state_version`,
- update timestamp.

Database constraints must reject obvious impossible states/cross-room media.

Do not add per-viewer playback state.

Do not add a playback event-history table.

#### 8. `chat_messages`

Implement persistent plain-text chat storage:

- UUID primary key or repository-consistent stable ID,
- room FK,
- sender user FK with a deletion behavior that does not destroy message history,
- sender display-name snapshot,
- body,
- created timestamp,
- efficient room/time history index.

No edits, reactions, rich HTML, attachments, moderation system, or read receipts.

#### 9. Shared timestamp trigger if needed

If the repository uses `updated_at`, create/reuse one coherent update-timestamp mechanism.

Do not create an auditing framework.

#### 10. Referential-integrity rules

Enforce at the database level:

- subtitle room and media room match,
- playback room and current media room match,
- cross-room FKs cannot be smuggled through the client,
- current-media deletion is rejected by FK/invariant rather than silently corrupting playback state,
- numeric values such as queue position and anchor position remain valid.

#### 11. Explicit grants

Inspect current Supabase project/repo assumptions about Data API privileges.

Establish the minimal grants needed for future authenticated reads/functions, but do not grant broad writes to protected state.

At this stage, RLS should mean the new client-visible tables are effectively deny-by-default until Prompt 3 adds the complete policies.

Do not assume new project objects are automatically exposed correctly.

#### 12. RLS enablement

Enable RLS on every client-accessible application table now.

Do not add permissive `USING (true)` policies merely to make tests easy.

#### 13. Generated database types

Regenerate/update the project's TypeScript Supabase database types using its established workflow.

Wire Prompt 1's Supabase client generics to the real generated `Database` type if not already done.

Do not maintain a handwritten duplicate schema type hierarchy.

#### 14. Minimal development seed only if the repository already uses seeds

If seed infrastructure exists, add only deterministic fake development data that is genuinely useful for schema/test verification.

Never commit:

- real users,
- real private movie links,
- private chat,
- credentials.

If no seed is needed, do not create one just to satisfy the prompt.

### Required verification

Where tooling exists:

1. Run a clean local Supabase DB reset/migration replay.
2. Verify all constraints/indexes/types are created.
3. Run schema tests for cross-room FK rejection and invalid numeric/state values.
4. Verify application TypeScript still compiles against generated DB types.
5. Run lint/typecheck/tests relevant to changed code.

If connected Supabase tooling exists, inspect current remote schema before applying anything and keep migration history/repository state aligned. Do not destructively reset a production project.

### Non-goals

Do not implement in this prompt:

- complete membership RLS policies,
- join/snapshot RPCs,
- playback mutation RPCs,
- Realtime,
- Presence,
- Storage bucket,
- media playback adapter,
- sync engine,
- UI.

### Completion standard

The entire core database model must be reproducible from version control, secure-by-default, relationally valid, and accurately represented by generated TypeScript types.

Finish with the required chat completion report and STOP. Do not begin Prompt 3.

---

# PROMPT 3 — Room Creation/Join, Membership Authorization, RLS, Snapshot, and Server Time

---

## Prompt 3

Implement the **Tonight TV room security and membership layer** end to end.

Before implementation, re-read all relevant `.md` files and inspect the current schema/code/migrations from previous milestones. Do not recreate tables or clients that already exist. Obey the Global Operating Contract in full.

### Goal

At the end of this milestone:

- an authenticated owner can create a private room,
- an authenticated/anonymous viewer who possesses the exact room UUID can join it,
- durable room membership is recorded safely,
- members can read only their room data,
- unrelated authenticated users cannot enumerate/read private rooms,
- core RLS and Data API grants are correct,
- a member can fetch one canonical room snapshot,
- clients can sample database server time for synchronization.

This is a major security milestone. Do not leave permissive placeholder policies.

### Required work

#### 1. Implement/review `create_room`

Create a hardened RPC or equivalent atomic database operation that:

- requires `auth.uid()`,
- derives `owner_user_id` from Auth rather than a caller parameter,
- validates/normalizes room name,
- inserts the room,
- inserts exactly one initial `room_playback_state` row,
- returns canonical created data,
- runs atomically.

Do not let a client create a room owned by another UUID.

#### 2. Implement/review `join_room`

Create the exact-ID private join boundary.

The function must:

- require authenticated identity,
- work for Supabase anonymous-auth users because they are authenticated users after sign-in,
- accept only room ID + display name from the caller,
- validate that exact room exists,
- normalize/validate display name,
- insert or safely upsert the caller's `(room_id, auth.uid())` membership,
- never accept a caller-provided `user_id`,
- return only the data required for the application to continue,
- not create room-listing/discovery capability.

Repeated join by the same user must not create duplicate memberships.

#### 3. Implement member/owner RLS comprehensively

Build the actual policies/grants for:

- `rooms`,
- `room_sessions`,
- `media_items`,
- `subtitles`,
- `room_playback_state`,
- `chat_messages`.

Required read model:

```text
owner of room -> may read room-scoped data
joined member -> may read room-scoped data
unrelated authenticated user -> cannot read room data
unauthenticated/anon role -> cannot read room data
```

Required write posture at this stage:

- playback state: no direct client write,
- room membership creation: through `join_room`, not arbitrary user IDs,
- viewers: no queue/subtitle/room mutation,
- owner-only direct media/subtitle metadata writes may be enabled only if the backend spec allows them and policies are exact,
- chat insert should remain reserved for the later `send_chat_message` RPC rather than broad direct insert.

Do not solve authorization by granting every authenticated user broad room SELECT.

#### 4. Harden privileged DB functions

For functions that require `SECURITY DEFINER` or equivalent privilege crossing:

- set a safe/empty `search_path`,
- fully qualify schema references,
- use `auth.uid()` from request context,
- validate membership/ownership explicitly,
- avoid dynamic SQL,
- revoke overly broad/default EXECUTE,
- grant only required roles.

Review every function created in Prompts 2–3, not only the newest one.

#### 5. Implement `get_server_time`

Expose a minimal authenticated RPC returning database/server time.

No side effects.

This will be sampled by the synchronization engine later.

#### 6. Implement `get_room_snapshot`

Build one member-authorized canonical snapshot function/service contract that returns the state required to reconstruct the room after join/reconnect:

- room identity/basic fields,
- caller identity/session information needed by the client,
- authoritative playback state,
- current media if selected,
- current-media subtitles,
- queue in deterministic order,
- bounded recent chat history,
- server timestamp if useful to the chosen response contract.

Requirements:

- owner/member only,
- no cross-room leakage,
- no Presence data,
- bounded chat limit clamped server-side,
- no unnecessary sensitive Auth fields,
- stable return shape typed in application code.

If the project uses a typed JSON RPC response, define only the domain type needed for that response; do not duplicate all database types.

#### 7. Optional join preview only if existing product flow requires it

If the current code genuinely needs room name/current title before durable join, implement one narrowly scoped exact-ID preview RPC returning minimal safe fields.

Otherwise skip it.

Do not build room discovery/listing.

#### 8. Application-side room service

Create or adapt one cohesive room data service that uses the canonical Supabase client and exposes the operations needed so far:

- create room,
- join room,
- fetch snapshot,
- sample server time.

Keep errors structured enough for later reconnect/sync logic.

Do not spread raw RPC calls across unrelated components.

Do not create a class/file per RPC.

### Required authorization test matrix

Use at least four actor classes in SQL/integration tests or the strongest available equivalent:

```text
Owner A
Viewer B = authenticated anonymous user who joined Room A
Outsider C = authenticated user who did not join Room A
Unauthenticated request
```

Prove at minimum:

- Owner A can create/read Room A.
- Viewer B cannot read Room A before joining.
- Viewer B can join only as themselves.
- Viewer B can read Room A after joining.
- Outsider C cannot list/read Room A.
- Viewer B cannot directly update playback state.
- Viewer B cannot mutate queue/subtitles/room ownership.
- Outsider C cannot fetch snapshot.
- Viewer B can fetch snapshot only for joined room.
- unauthenticated caller cannot use protected operations.
- user cannot create a membership row for another user's UUID.

### Verification

Run as available:

- clean DB migration reset,
- SQL/RLS tests,
- RPC integration tests,
- generated-type check if function signatures affect types,
- lint,
- typecheck,
- relevant build/tests.

If connected Supabase is available, verify the policies against the actual target project after migration rather than assuming local behavior alone.

### Non-goals

Do not implement:

- Realtime authorization yet,
- playback mutation state machine yet,
- media player,
- sync correction engine,
- subtitle Storage,
- chat sending,
- UI design,
- passwords/invites/bans.

### Completion standard

Private room membership must now be a real database security boundary, not a client-side convention. Snapshot and server time must be available to authorized members and impossible for outsiders to read.

Finish with the required chat completion report and STOP. Do not begin Prompt 4.

---

# PROMPT 4 — Authoritative Playback State Machine and Transactional Admin RPCs

---

## Prompt 4

Implement the **authoritative Tonight TV playback state machine in Postgres** as a complete transactional milestone.

Before coding, re-read the project specs and inspect all current migrations/RPCs/types/services/tests. Preserve existing correct work. Obey the Global Operating Contract.

### Goal

Move shared playback control fully behind a secure database boundary so that:

- only the room owner can mutate shared playback,
- every command is atomic,
- database time anchors transitions,
- `state_version` prevents stale races,
- viewers cannot mutate canonical playback by any direct table/RPC path,
- the canonical state returned by RPCs is sufficient for later Realtime and sync-engine work.

### Required RPC capabilities

Implement the documented behavior for operations equivalent to:

```text
room_play(room_id, expected_version)
room_pause(room_id, expected_version)
room_seek(room_id, expected_version, target_position_sec)
room_restart(room_id, expected_version)
room_select_media(room_id, expected_version, media_id, autoplay)
room_mark_ended(room_id, expected_version)
room_play_next(room_id, expected_version)
```

Names may follow existing repository conventions, but do not create multiple competing APIs for the same transition.

### Required transaction model

For every authoritative playback command:

1. Require authenticated caller.
2. Verify caller owns the room.
3. Lock the room's single playback-state row for update.
4. Read current canonical state/version inside that transaction.
5. Require exact `expected_version` match.
6. Reject stale version with a recognizable conflict/error path.
7. Validate state transition and same-room media references.
8. Compute DB-time-dependent values inside Postgres.
9. Increment `state_version` exactly once on success.
10. Update `updated_at`/anchor time coherently.
11. Return the newly committed canonical state.
12. Make no hidden second playback update after returning.

Use one internal helper only if it genuinely centralizes transition invariants without obscuring security. Do not create an overengineered command framework.

### Detailed transition requirements

#### Play

From paused/current media:

```text
anchor_position_sec remains unchanged
anchor_server_time = database now
status = playing
state_version += 1
```

Do not require browser current time simply to resume.

#### Pause

When currently playing, compute the authoritative pause position using DB time:

```text
pause_position = anchor_position_sec + (db_now - anchor_server_time)
```

Then freeze there.

This avoids trusting the admin browser clock/currentTime for a normal pause.

Pausing an already paused room should have an explicit deterministic behavior. Prefer either safe no-op semantics or a validated transition that does not unnecessarily bump versions; choose one and test it. Do not create random version churn from duplicate commands.

#### Seek

- validate finite/nonnegative target at application and DB boundary,
- set anchor position to intentional target,
- anchor to DB now,
- while playing: remain playing,
- while paused: remain paused,
- increment version once.

Do not make seek semantics differ across clients.

#### Restart

Equivalent to intentional seek to zero while preserving current play/pause intent, unless current status makes restart invalid. Define and test the exact ended-state behavior.

#### Select media

- media must belong to room,
- reset position to zero,
- DB anchor time,
- `autoplay=true` => playing,
- otherwise paused,
- increment once.

No cross-room media selection.

#### Mark ended

- owner-only,
- transition current program to ended,
- do not auto-select next,
- viewer reaching local media end does not call authoritative mutation.

#### Play next

In one transaction:

- owner + expected-version check,
- find deterministic next queue item,
- select it,
- reset timeline,
- begin according to the documented explicit-admin Next behavior,
- bump version exactly once.

A retry with an old `expected_version` must not advance twice.

### Protect the table

Re-audit grants/RLS so there is still **no direct client UPDATE/INSERT path** for `room_playback_state`.

The RPCs are the mutation surface.

Viewer access to EXECUTE on admin-only RPCs should be minimized by grants where practical and must always fail the ownership check even if called.

### Application-side command service

Implement/adapt one cohesive typed playback-command client module using the existing Supabase client.

It must:

- pass room ID + expected version,
- normalize Supabase RPC errors into useful domain errors,
- distinguish stale-version conflict from generic failure where possible,
- return canonical state from the DB,
- never optimistically invent a new authoritative version.

Do not wire polished playback controls/UI yet.

### Concurrency tests

Test real race/invariant cases, not only happy paths:

- owner Play increments one version,
- viewer Play rejected,
- outsider Play rejected,
- stale expected version rejected,
- two admin requests based on same version cannot both win silently,
- pause position advances from DB elapsed time,
- seek preserves paused/playing intent,
- cross-room media selection rejected,
- next cannot advance twice on stale retry,
- current media references remain valid,
- state version never goes backward,
- duplicate/no-op command semantics match chosen contract.

Use database tests or integration tests that exercise the actual RPC boundary.

### Verification

Run:

- migration replay/reset,
- playback SQL/RPC tests,
- authorization tests,
- generated types if RPC signatures changed generated definitions,
- application unit tests,
- lint/typecheck/build checks relevant to changed code.

### Non-goals

Do not implement in this prompt:

- Realtime Broadcast,
- clock calibration client,
- drift correction,
- video player,
- HLS integration,
- subtitle storage,
- chat sending,
- UI.

### Completion standard

Postgres must now be capable of safely representing and mutating the entire shared playback state without trusting the browser for ownership, command ordering, or server time.

Finish with the required chat completion report and STOP. Do not begin Prompt 5.

---

# PROMPT 5 — Private Realtime Channel, Database-Originated Broadcast, Presence, and Reconciliation Transport

---

## Prompt 5

Implement the **Tonight TV private Supabase Realtime transport layer** end to end.

Before changing code/database policies, re-read the project specs and inspect the current implementation. Confirm the actual Supabase SDK/API versions installed and use current official Supabase Realtime authorization behavior. Obey the Global Operating Contract.

### Goal

At the end of this milestone:

- each room uses a private Realtime channel,
- only room owner/joined members can subscribe,
- authoritative application events originate from committed database operations,
- viewers cannot forge playback/chat/queue Broadcast events from the client,
- members can use Presence,
- reconnect/channel lifecycle is centralized and safe,
- Realtime remains a notification layer and snapshot remains recovery truth.

### Required architecture

Use one room-scoped private channel unless the existing implementation has a compelling documented reason not to:

```text
room:<room_uuid>
```

Configure it as a private channel using the current Supabase JS API.

Do not open separate WebSocket connections for every feature.

### 1. Realtime authorization on `realtime.messages`

Implement and test RLS policies using the current Supabase Realtime authorization mechanism.

For the exact room topic:

#### SELECT/receive

Allow owner/joined members to receive:

```text
extension = 'broadcast'
extension = 'presence'
```

Deny outsiders.

#### INSERT/send

Allow owner/joined members to publish only what the client genuinely needs for Presence:

```text
extension = 'presence'
```

Do **not** grant arbitrary client Broadcast publishing merely for convenience.

The application will receive database-originated Broadcast events.

Ensure membership lookup policies are supported by proper indexes and do not introduce slow unbounded RLS joins.

If Supabase project configuration has a public-channel access setting that conflicts with this model, configure/document the required private setting using the available project tooling. Do not weaken policies to compensate for configuration mistakes.

### 2. Database-originated room events

After successful committed database mutations, emit compact private Realtime Broadcast messages from Postgres using the current recommended Supabase database-broadcast mechanism.

Prefer a compact custom payload where full raw row-change envelopes are unnecessary.

At minimum support:

```text
playback_state_changed
queue_changed or media metadata change signal as needed
subtitle_metadata_changed as needed
```

Chat Broadcast is completed in Prompt 9, but build the event mechanism so chat can use the same room channel.

For playback events, include the canonical committed state fields and `state_version`.

Do not broadcast before the authoritative transaction is valid.

Do not duplicate every database row field in events when clients can safely refetch infrequent data.

### 3. Typed client room-channel service

Create/adapt one cohesive module/hook/service responsible for:

- creating the room's private channel,
- applying current Auth to Realtime according to the installed SDK,
- subscribing to known Broadcast event names,
- Presence sync/join/leave,
- exposing connection/subscription status,
- retry/reconnect integration,
- cleanup/removing the channel,
- preventing duplicate subscriptions during React re-render/remount,
- validating room ID/event payload before passing events onward.

Do not create one file/hook per event type unless the existing codebase structure strongly supports it.

### 4. Playback event version logic

Client transport must enforce:

```text
incoming_version <= last_applied_version
    -> ignore stale/duplicate event

incoming_version == last_applied_version + 1
    -> event can be applied

incoming_version > last_applied_version + 1
    -> version gap; trigger canonical snapshot/state refetch
```

Do not infer missing commands.

If malformed/untrusted payload arrives, reject it and reconcile rather than corrupt local state.

### 5. Reconnect contract

When the channel reconnects or subscription is re-established after a meaningful disconnect, provide a clear callback/state transition that allows the room coordinator to:

```text
refetch snapshot
recalibrate clock later
re-track Presence
reconcile player later
```

You may implement the snapshot refetch integration now if it cleanly fits the existing room service, but do not implement the full sync engine until Prompt 6.

Do not depend on historical Realtime replay for correctness.

### 6. Presence

Track a small payload after Auth + durable room join + private channel subscription.

Include enough identity to deduplicate viewers, such as:

- authenticated user ID,
- durable room session ID,
- display name,
- online timestamp.

Do not include:

- playback currentTime,
- video buffering metrics every second,
- chat typing state loops,
- large profile data.

Presence is slow-changing connection state only.

Expose a normalized list/count of unique watchers from Presence state for future UI, without implementing visual UI.

### 7. Authorization cache/lifecycle awareness

Use the current Supabase SDK path for refreshed Auth tokens/private-channel authorization.

Do not build a membership-revocation feature. The MVP has no ban system.

Simply ensure normal token refresh/reconnect does not silently leave the channel unauthenticated.

### Required tests

At minimum verify with real/local Supabase Realtime where feasible:

- owner subscribes to private room channel,
- joined viewer subscribes,
- outsider cannot subscribe,
- playback RPC commits state and subscribed clients receive DB-originated playback event,
- playback event version matches committed DB row,
- viewer cannot send a forged `playback_state_changed` Broadcast from client permissions,
- member can track Presence,
- outsider cannot track/listen to Presence for room,
- multiple presence metas for one logical user are deduplicated by normalized watcher output,
- stale playback event is ignored,
- version-gap event triggers reconciliation path,
- cleanup removes channel and prevents duplicate listeners,
- reconnect exposes/refires the reconciliation pathway.

If local Realtime authorization testing is limited by environment tooling, run the strongest integration checks available and clearly state the exact unverified remote behavior. Do not replace missing verification with permissive policies.

### Verification

Run relevant:

- DB reset/migrations,
- RLS/Realtime authorization tests,
- Realtime integration tests,
- client unit tests,
- lint/typecheck/build.

### Non-goals

Do not implement:

- client clock calibration/drift engine yet,
- player UI,
- chat feature yet,
- subtitle Storage,
- voice/video calls,
- Realtime Broadcast replay dependency,
- custom WebSocket server.

### Completion standard

Realtime must be a private, authorized, database-fed transport that accelerates room state propagation without becoming a second source of truth or a viewer-controlled authority bypass.

Finish with the required chat completion report and STOP. Do not begin Prompt 6.

---

# PROMPT 6 — Synchronization Engine: Clock Calibration, Canonical Position, Drift Correction, Reconnect, and GO LIVE

---

## Prompt 6

Implement the **Tonight TV client synchronization engine** on top of the authoritative Supabase contracts already built.

Before implementation, re-read all project specifications and inspect current room/realtime/playback code. Reuse the existing modules and avoid parallel state stores. Obey the Global Operating Contract.

This is an engineering/synchronization milestone, not a visual-player milestone.

### Goal

At the end of this milestone, the codebase must have a deterministic, well-tested synchronization core that can take:

- canonical playback state,
- calibrated server time,
- a video/player adapter,
- Realtime updates/reconnect events,

and keep a client near the room's shared live position without sending continuous playback position to Supabase.

### 1. Implement server clock calibration

Use the existing `get_server_time` RPC.

Build a cohesive calibrator that:

1. records request send/receive timing,
2. calculates RTT,
3. estimates server offset from the local midpoint,
4. takes multiple samples,
5. rejects/deprioritizes poor high-latency samples,
6. derives a robust final offset,
7. exposes `estimatedServerNow()` or equivalent,
8. tracks calibration age/quality enough for lifecycle decisions.

Prefer monotonic elapsed timing (`performance.now()` or an injectable equivalent) for local interval measurement where appropriate.

Do not call the server-time RPC continuously.

### 2. Make the timing math pure/testable

Implement pure functions for at least:

- expected canonical media position from playback state + estimated server time,
- drift calculation,
- stale-version comparison,
- correction-decision selection.

These functions should not depend directly on React or DOM globals so they can be thoroughly unit tested.

### 3. Canonical expected-position rules

Implement exactly:

```text
paused -> anchor_position_sec
playing -> anchor_position_sec + elapsed server time
idle -> no active live position
ended -> frozen/non-advancing
```

Never include local timezone in the formula.

### 4. Define a player adapter boundary

Do not tightly couple synchronization logic to one React `<video>` component.

Create/reuse a small player adapter/interface exposing only what sync needs, for example:

- current time,
- ready/seekable state,
- play/pause,
- seek,
- playback rate,
- media identity/load readiness,
- buffering/ended events if needed.

Do not build a generic media framework. Keep this boundary minimal.

### 5. Drift policy

Implement the project baseline as tunable constants:

```text
abs(drift) < ~250 ms
    -> no correction

~250 ms to ~1 s
    -> temporary slight playback-rate correction

> ~1 s
    -> hard seek to canonical position
```

Use conservative rate adjustment around normal speed, approximately the documented small range, then restore exactly to normal after correction.

Ensure:

- correction does not oscillate rapidly,
- playback rate is reset on state/media changes,
- paused state is not "corrected" by playing faster,
- hard seek respects seekable/ready state.

Treat thresholds as configuration constants, not database data/user settings.

### 6. Apply canonical playback events

When a valid new playback version arrives:

- ignore stale/duplicate versions,
- if current media changed, coordinate with the media-loading boundary rather than seeking the old source,
- apply paused/playing intent,
- calculate expected position using server clock,
- align player after it is seekable,
- avoid duplicate play/pause loops caused by the player's own events.

The authoritative state comes from DB/Reatime snapshot/event, not local video controls.

### 7. Reconciliation coordinator

Create/adapt one room synchronization coordinator that composes:

```text
Auth/room membership
snapshot
Realtime channel
clock calibration
canonical playback state
player adapter
```

It must support:

- initial join synchronization,
- fresh snapshot apply,
- Realtime playback apply,
- version-gap snapshot reconciliation,
- channel reconnect reconciliation,
- long visibility/background resume,
- media buffering recovery,
- explicit GO LIVE.

Avoid putting all of this into a single giant React component if an existing domain/module structure can isolate it cleanly.

### 8. GO LIVE implementation

Implement GO LIVE as a callable nonvisual action/service, not a shared playback mutation.

It should:

1. fetch/reconcile fresh snapshot,
2. recalibrate clock if calibration is stale/questionable,
3. load canonical current media if needed,
4. wait for required player readiness,
5. compute expected canonical position,
6. seek/correct local player,
7. match canonical pause/play state.

A viewer invoking GO LIVE must never call admin playback mutation RPCs.

### 9. Reconnect and visibility

Implement robust lifecycle behavior:

- Realtime reconnect -> fresh snapshot + clock recalibration policy + resync,
- long hidden/background duration -> resync on return,
- do not assume browser timers were accurate while backgrounded,
- do not spawn duplicate calibration/reconciliation loops.

Use reasonable debouncing/coalescing so reconnect does not issue a storm of identical snapshot/time requests.

### 10. Buffering behavior

A viewer buffering does **not** pause the room.

When the player becomes ready again:

- recompute current expected position,
- use drift policy to catch up,
- hard seek if too far behind.

No backend write is needed.

### 11. No per-second network synchronization

Audit the code to ensure synchronization does not send:

- current time every second,
- current time every animation frame,
- drift telemetry to Postgres/Presence every correction tick.

A local timer may measure drift locally. Network traffic remains event/reconciliation based.

### Required deterministic tests

Use fake/injectable clocks and a fake player adapter so tests are stable.

Cover at least:

#### Clock calibration

- symmetric low-latency sample,
- noisy/high-RTT sample handling,
- offset calculation,
- recalibration replacing stale sample set.

#### Position math

- paused state constant,
- playing state advances correctly,
- negative elapsed/clamp edge case if clock sample shifts,
- timezone-independent timestamps.

#### Drift policy

- below threshold no-op,
- slightly late speeds up,
- slightly early slows down,
- large drift hard seeks,
- rate resets to 1,
- paused state never rate-catches up.

#### Versions/events

- duplicate ignored,
- old ignored,
- sequential applies,
- gap reconciles.

#### Lifecycle

- initial snapshot aligns player,
- reconnect causes one reconciliation,
- long visibility resume resyncs,
- buffering recovery catches up,
- GO LIVE does not mutate server playback.

### Minimal integration proof

Where possible, create/run a nonvisual test harness with:

```text
1 admin browser/session
2 viewer browser/session contexts
```

and verify canonical Play/Pause/Seek transitions can be consumed by the sync engine.

Do not spend this prompt building the final visual player.

### Verification

Run:

- sync-engine unit tests,
- relevant integration tests,
- lint,
- typecheck,
- build,
- DB tests only if backend changes were necessary.

### Non-goals

Do not implement:

- polished player controls,
- final responsive layout,
- subtitle UI,
- chat UI,
- auto-next,
- voice/video.

### Completion standard

Synchronization logic must now be deterministic enough that the next media-integration milestone can connect a real HTML5/HLS player without inventing timing rules inside the UI.

Finish with the required chat completion report and STOP. Do not begin Prompt 7.

---

# PROMPT 7 — External Media Runtime and Owner Queue Management

---

## Prompt 7

Implement the **Tonight TV external-media runtime and complete owner-controlled queue backend/service layer**.

Before coding, read the project specs again and inspect the current media schema, queue APIs, playback RPCs, sync adapter, package dependencies, and any existing video/HLS code. Obey the Global Operating Contract and preserve correct existing work.

### Goal

At the end of this milestone:

- the admin can persist and manage a room's external MP4/HLS queue securely,
- queue operations are deterministic and owner-only,
- the sync engine can drive a real browser media adapter,
- MP4 and HLS source loading are handled correctly,
- source failure is classified without trying to bypass CORS/DRM/auth restrictions,
- no video bytes pass through Supabase or Next.js.

No visual redesign is required.

### Part A — Queue/media data operations

#### 1. Owner media CRUD

Implement/adapt the application/backend operations for owner-only:

- add media item,
- edit title/source URL/source type,
- remove a non-current media item,
- read queue for owner/members.

Honor existing RLS. If direct table mutation is used, prove policies are correct. If the current architecture already funnels these through RPCs, keep one coherent model rather than adding a second one.

Validate at appropriate boundaries:

- title nonempty/length bounded,
- source URL syntactically reasonable,
- source type one of MVP types,
- queue position valid.

Do not perform server-side scraping to "resolve" watch-page URLs.

#### 2. Atomic reorder

Implement a single transactional reorder operation equivalent to:

```text
reorder_media_items(room_id, ordered_media_ids[])
```

It must:

- require owner,
- ensure all IDs belong to the room,
- reject duplicates/invalid set according to contract,
- write final order atomically,
- emit one compact queue-change signal after commit,
- avoid N independent race-prone HTTP updates.

#### 3. Current media deletion

Preserve MVP rule:

```text
current media cannot be deleted
```

Return a clear domain error and require the owner to select another item first.

Do not silently mutate playback during delete.

#### 4. Manual next

Integrate the already-built `room_play_next` authoritative RPC with queue state.

Do not add automatic next playback.

### Part B — Media source detection/runtime

#### 5. Source type

Support:

```text
auto
mp4
hls
```

For `auto`, use conservative URL/content hints available to the browser/application. Do not fetch/scrape protected pages on the server to discover hidden streams.

A URL that points to an HTML watch page is not magically a video source.

#### 6. HTML5 MP4/direct media adapter

Connect the Prompt 6 player adapter to a real HTML media element/runtime abstraction capable of:

- load source,
- detect readiness/seekability,
- expose current time,
- play/pause,
- seek,
- playback rate,
- buffering/playing/ended/error events,
- cleanup on source change/unmount.

Keep DOM/React coupling narrow enough that sync logic remains testable.

#### 7. HLS

Implement HLS support:

- use native HLS where the browser supports it appropriately,
- use `hls.js` where needed and where already appropriate for the project,
- only add `hls.js` if it is not already present and is genuinely required,
- destroy HLS instances/listeners on source change/unmount,
- map fatal/nonfatal errors into a coherent source error model.

Do not add DASH unless a future requirement requests it.

#### 8. Source failure taxonomy

Represent failures such as:

```text
network/source unreachable
CORS/referrer/origin blocked
unsupported codec/container
HLS manifest/media error
autoplay permission blocked
authenticated/cookie-protected source unsupported
expired URL suspected
encrypted/DRM source unsupported
unknown media error
```

Do not claim the app can distinguish every browser failure with certainty; expose a safe actionable category/message based on available signals.

Never attempt to bypass restrictions.

#### 9. Autoplay/user gesture contract

The media runtime must expose the difference between:

- canonical room wants `playing`,
- browser allowed play,
- browser rejected autoplay and requires user gesture.

A rejected `play()` promise must not be treated as the room becoming paused.

Provide a nonvisual `startWatching/allowPlayback` action path that the future JOIN LIVE UI can call.

#### 10. Admin vs viewer local controls

Preserve the invariant:

- owner shared commands call authoritative playback RPCs,
- viewer local video events do not become shared commands.

Prevent native/local media events from accidentally triggering server Play/Pause loops.

#### 11. Ended behavior

A viewer's local `ended` event never changes shared state.

The admin runtime may call the owner-only `room_mark_ended` behavior when appropriate, with current expected version.

Do not auto-next.

### Tests

Cover:

- media CRUD owner success/viewer denial,
- atomic reorder,
- invalid cross-room reorder,
- delete-current rejection,
- manual next integration,
- MP4 adapter lifecycle,
- HLS native path,
- hls.js path via mocks where browser support is unavailable in test environment,
- cleanup/destroy behavior,
- autoplay rejection handled locally,
- viewer local pause does not call shared pause RPC,
- admin shared command does call authoritative RPC,
- source change resets old player/HLS state,
- buffering recovery feeds Prompt 6 sync engine,
- media errors never invoke proxy/bypass behavior.

### Verification

Run:

- database/migration tests if queue functions changed,
- RLS tests,
- media adapter tests,
- sync regression tests,
- lint/typecheck/build.

Use a legal/test-controlled direct MP4/HLS source for manual/integration verification if available. Do not commit private media URLs to the repository.

### Non-goals

Do not add:

- video uploads,
- proxy/transcoding,
- DRM circumvention,
- scraper/resolver service,
- public catalog,
- auto-next,
- final UI styling.

### Completion standard

The project must now be able to take a valid direct MP4/HLS URL stored in the room queue and let the existing authoritative/sync layers drive real browser playback without routing the media through Tonight TV infrastructure.

Finish with the required chat completion report and STOP. Do not begin Prompt 8.

---

# PROMPT 8 — Private Subtitle Storage and SRT/VTT Pipeline

---

## Prompt 8

Implement the **Tonight TV subtitle pipeline completely**, including Supabase private Storage authorization, metadata integrity, SRT-to-VTT conversion, authenticated browser retrieval, and cleanup.

Before implementation, read all project specs and inspect existing Storage buckets/policies, subtitle schema/services, media adapter, generated types, and current Supabase project state. Obey the Global Operating Contract.

### Goal

At the end of this milestone:

- the room owner can add/remove subtitle tracks for room media,
- viewers can read/download subtitle files only for rooms they joined,
- Storage remains private,
- `.srt` input is converted to canonical WebVTT,
- the browser can attach a private subtitle to media without making the bucket public,
- subtitle selection remains local per viewer and never changes shared playback state.

No visual subtitle menu is required.

### 1. Private bucket

Create/reuse one private bucket dedicated to subtitle objects, conceptually:

```text
subtitles
```

Do not create a video bucket.

Do not make subtitle files public as a shortcut.

Represent bucket creation/configuration reproducibly according to the repository/Supabase workflow.

### 2. Deterministic object path

Use a path equivalent to:

```text
rooms/<room_id>/media/<media_id>/<subtitle_id>.vtt
```

If existing code already has a compatible deterministic path convention, preserve it.

The path must let policies/services prove room/media ownership.

### 3. Storage RLS

Implement/test `storage.objects` authorization so that:

- room owner may upload/update/delete subtitle objects for their room,
- joined room member may read/download subtitle objects for their room,
- viewer may not upload/update/delete,
- outsider may not read,
- no authenticated user can escape the room path namespace,
- operations used by SDK upload/upsert/delete have the exact required SELECT/INSERT/UPDATE/DELETE privileges/policies.

Do not use a service-role key in the browser to make Storage easier.

### 4. Metadata authorization/integrity

Re-audit `subtitles` table RLS/grants:

- member read,
- owner write,
- same-room media enforcement,
- `storage_path` matches the object's intended room/media identity according to service validation.

Do not allow a client to attach an arbitrary storage path from another room.

### 5. SRT -> VTT conversion

Implement a robust application-side conversion path.

Requirements:

- accept UTF-8 SRT text/file input,
- normalize BOM/newlines,
- emit valid `WEBVTT` header,
- convert comma millisecond separators to VTT-compatible timestamp format,
- preserve multiline cue text,
- tolerate normal SRT cue numbering,
- reject/return useful error for clearly invalid input,
- do not interpret cue text as HTML in a dangerous custom renderer.

If an existing small dependency already solves this correctly, evaluate/reuse it. Do not add a heavyweight subtitle framework unnecessarily.

Canonical stored format is `.vtt`.

### 6. Upload workflow with compensation

Implement one cohesive subtitle service operation:

```text
validate/convert
-> determine subtitle ID/path
-> upload private VTT
-> persist metadata
-> if metadata persistence fails, attempt Storage cleanup
-> surface unresolved cleanup failure
```

If the existing database-first workflow is safer given current code, use a compensating inverse order. The required property is that partial failures are handled deliberately rather than ignored.

Do not create a distributed transaction/job system.

### 7. Delete workflow

Owner-only delete should remove both metadata and object using a deterministic order with safe compensation/error reporting.

Do not leave silent orphan objects/rows as normal behavior.

### 8. Authenticated browser download

Do **not** assume a private authenticated Storage URL can simply be put into HTML `<track src>`.

Implement the preferred MVP flow:

```text
Supabase authenticated download
-> Blob
-> URL.createObjectURL(blob)
-> attach object URL to subtitle track/runtime
-> URL.revokeObjectURL when track/media changes or cleanup occurs
```

A signed URL may be used only if the existing implementation already has a strong reason and correctly handles expiration. Do not add signed-URL refresh complexity unnecessarily.

### 9. Viewer-local selection

Expose a media/subtitle runtime API for:

- list available tracks from snapshot/metadata,
- load selected private VTT,
- enable one selected track locally,
- disable subtitles locally,
- switch track with correct Blob URL cleanup.

Do not persist the viewer's selected language in shared room playback state.

Do not broadcast subtitle selection.

### 10. Realtime metadata changes

If Prompt 5 already supports `subtitle_metadata_changed`, integrate owner add/delete so connected members can refetch/update available tracks.

Do not broadcast subtitle file bytes.

### Required tests

Test:

- SRT conversion with normal cues,
- BOM/CRLF input,
- multiline cues,
- invalid timestamp/input failure,
- owner upload allowed,
- viewer upload denied,
- member download allowed,
- outsider download denied,
- cross-room path denied,
- metadata cannot point to another room's media,
- upload metadata failure triggers cleanup attempt,
- delete workflow handles partial failure explicitly,
- Blob/object URL created and revoked,
- viewer subtitle selection causes no shared playback RPC or Broadcast,
- subtitle metadata change signal works if implemented.

### Verification

Run:

- Storage/RLS tests against local/connected Supabase where possible,
- conversion unit tests,
- subtitle service/runtime tests,
- migration reset if Storage SQL/policies are represented in migrations,
- lint/typecheck/build.

### Non-goals

Do not implement:

- subtitle OCR,
- subtitle translation,
- AI subtitle generation,
- video transcoding,
- public subtitle marketplace,
- per-viewer shared preference database,
- visual subtitle settings menu.

### Completion standard

Subtitles must be private, room-authorized, browser-usable, local-per-viewer, and operationally clean without weakening Storage security.

Finish with the required chat completion report and STOP. Do not begin Prompt 9.

---

# PROMPT 9 — Persistent Chat, Database Broadcast, Session/Presence Integration, and Snapshot Completion

---

## Prompt 9

Implement the **Tonight TV persistent room chat** and finish the durable-session/Presence/snapshot integration around it.

Before implementation, re-read all project specs and inspect the current chat table, RLS, room snapshot, Realtime room channel, Presence service, and existing code. Obey the Global Operating Contract.

### Goal

At the end of this milestone:

- room members can send small plain-text messages through an authorized DB boundary,
- recent messages persist in Postgres,
- committed messages appear live through the existing private room Realtime channel,
- reconnect/late join recovers bounded recent history from snapshot,
- Presence remains ephemeral and distinct from durable `room_sessions`,
- basic server-side anti-spam exists without introducing new infrastructure.

No visual chat panel design is required.

### 1. Implement `send_chat_message`

Create/adapt one database RPC equivalent to:

```text
send_chat_message(room_id, body)
```

Requirements:

- caller authenticated,
- caller owner or joined member,
- caller identity from `auth.uid()`, never request `user_id`,
- sender display name derived from trusted room membership/owner context,
- trim body,
- reject empty body,
- enforce one documented fixed maximum length in the 500–1000 character range,
- store plain text only,
- insert authoritative DB timestamp,
- return canonical inserted message,
- emit DB-originated private `chat_message_created` Broadcast after commit.

Do not permit direct arbitrary `chat_messages` INSERT if the RPC is the canonical path.

### 2. Basic database-side rate limit

Implement a small-room-appropriate rolling rate limit using existing chat data rather than new infrastructure.

A reasonable documented target is equivalent to:

```text
maximum 5 messages per 10 seconds per user per room
```

Choose a deterministic constant and test it.

Requirements:

- enforced server-side,
- indexed/query-efficient for private-room scale,
- returns a recognizable error,
- no Redis,
- no separate rate-limit table unless an existing project pattern makes it clearly simpler and justified.

### 3. Chat RLS/grants

Re-audit:

- owner/member can read room chat,
- outsider cannot read,
- viewer cannot edit/delete messages,
- no UPDATE/DELETE feature,
- RPC EXECUTE appropriately restricted,
- `anon` role has no chat access before Auth.

### 4. Realtime integration

Use the existing single private room channel from Prompt 5.

Chat event must be database-originated.

Do not grant client arbitrary Broadcast permission to send chat as a WebSocket-only ephemeral feature.

On event receipt:

- validate payload,
- deduplicate by message ID,
- insert into local chat collection in authoritative order,
- do not duplicate a message already returned from the sender's RPC response.

### 5. Snapshot integration

Ensure `get_room_snapshot` returns a bounded recent chat history.

Requirements:

- hard server-side max limit,
- deterministic ordering,
- no entire room history dump,
- no unrelated room leakage.

Decide one canonical local ordering contract (for example ascending for rendering after fetching the newest N), and test it.

### 6. Durable session vs Presence

Re-audit the implementation to guarantee:

- `room_sessions` is durable membership/display identity,
- Presence is connected state,
- disconnect does not delete durable membership,
- reconnect re-tracks Presence,
- watcher list/count deduplicates logical users,
- Presence carries no playback time and no chat history.

Do not add a ban/moderation feature.

### 7. Application chat service/state

Implement/adapt a compact client domain surface supporting:

- hydrate recent messages from snapshot,
- send message through RPC,
- merge live DB-originated message event,
- deduplicate messages,
- expose send/rate-limit/auth errors cleanly.

Do not add a global state-management library solely for chat.

Do not build the styled chat panel.

### 8. Plain text/XSS boundary

The database stores text, not HTML.

Do not add Markdown/rich-text rendering.

Ensure any minimal existing rendering/test harness relies on framework escaping rather than `dangerouslySetInnerHTML`.

### Required tests

Cover:

- joined member send succeeds,
- owner send succeeds,
- outsider send rejected,
- unauthenticated rejected,
- caller cannot spoof `user_id`/display name,
- whitespace-only rejected,
- over-limit rejected,
- rate limit enforced,
- client cannot UPDATE/DELETE message,
- member receives DB-originated live event,
- outsider cannot subscribe/read chat event through room channel,
- sender does not duplicate RPC-returned message when Broadcast arrives,
- snapshot history bounded and ordered,
- reconnect snapshot restores missed messages,
- Presence disconnect does not erase membership.

### Verification

Run:

- DB reset/migrations,
- RLS/RPC tests,
- Realtime integration tests,
- client chat tests,
- existing sync/media regressions,
- lint/typecheck/build.

### Non-goals

Do not add:

- reactions,
- Markdown,
- GIFs,
- attachments,
- typing indicators,
- message editing,
- moderation dashboard,
- bans,
- private DMs,
- notifications,
- visual chat redesign.

### Completion standard

Chat must now be a small, secure, persistent room feature that uses the same membership and private Realtime architecture as playback without becoming a second authority model or a new infrastructure subsystem.

Finish with the required chat completion report and STOP. Do not begin Prompt 10.

---

# PROMPT 10 — End-to-End Backend Hardening, Security Audit, Multi-Client Proof, and Deployment Readiness

---

## Prompt 10

Perform the **Tonight TV backend/synchronization hardening milestone**. This is not a request to add more product features. It is a request to prove, repair, and finish the Supabase/backend implementation created by the previous prompts.

Before making changes, re-read **all relevant project Markdown files** and inspect the entire current codebase, migrations, tests, Supabase clients, Auth, RLS, RPCs, Realtime, Storage, media runtime, sync engine, chat, and git status/diffs. Obey the Global Operating Contract.

### Goal

At the end of this milestone, the existing backend must be demonstrably ready for the later UI phase:

- reproducible database,
- complete authorization,
- no privileged-browser secrets,
- private Realtime,
- transactional playback,
- working snapshot/reconnect,
- tested synchronization logic,
- external MP4/HLS path,
- private subtitles,
- persistent chat,
- no scope creep,
- one admin + at least two viewers verified through the real system as far as the environment permits.

This prompt should primarily **audit, test, repair, simplify, and verify**. Do not invent features to make the milestone look bigger.

### Part 1 — Repository architecture audit

Inspect for accidental duplication introduced across milestones:

- multiple Supabase browser clients,
- duplicate server clients,
- duplicate room/snapshot services,
- competing playback state stores,
- duplicate Realtime channels for one room,
- overlapping media adapters,
- handwritten DB types duplicating generated types,
- orphan migration/schema approaches,
- stale TODO/mock paths.

Consolidate only genuine duplication. Do not perform a cosmetic rewrite.

### Part 2 — Credential/security audit

Search the repository and build configuration for:

- `service_role`,
- `sb_secret_`,
- database passwords,
- hardcoded JWTs,
- Supabase secrets in `NEXT_PUBLIC_*`,
- tokens committed in source/tests,
- private real media URLs committed in fixtures.

If a secret is discovered, remove it from tracked code/config and report that credential rotation may be required. Do not print the secret in your response.

Verify browser code needs only Supabase URL + publishable key.

### Part 3 — Full RLS/grants audit

Build a table/RPC/storage/realtime authorization matrix from the implementation and test it.

Actors:

```text
Owner A
Viewer B joined Room A
Viewer C joined Room A
Outsider D authenticated but not joined
Unauthenticated caller
```

Verify every relevant action:

#### Rooms/membership

- create room,
- join exact room,
- read joined room,
- outsider listing/read denial,
- identity spoof denial.

#### Media/queue

- member read,
- owner write/reorder,
- viewer write denial,
- current-media delete rejection,
- cross-room IDs rejection.

#### Playback

- owner commands only,
- direct table mutation denied,
- stale-version conflict,
- cross-room media rejected.

#### Subtitles

- metadata member read,
- owner write,
- Storage member download,
- Storage viewer upload denial,
- outsider read denial,
- path escape denial.

#### Chat

- member read/send,
- outsider denial,
- edit/delete denial,
- rate-limit enforcement.

#### Realtime

- member subscribe,
- outsider subscribe denial,
- member Presence,
- arbitrary client Broadcast denial,
- DB-originated Broadcast reception.

Do not leave any broad `USING (true)`/`WITH CHECK (true)` application policy unless there is a very specific safe documented reason.

### Part 4 — Function security audit

Review every database function/RPC for:

- safe `search_path`,
- fully qualified sensitive references,
- correct Auth identity source,
- owner/member check,
- EXECUTE grants,
- input bounds,
- dynamic SQL avoidance,
- correct row locking,
- transaction behavior,
- accidental RLS bypass data leak.

Repair problems.

Do not convert every function into `SECURITY DEFINER`; use it only where the documented boundary requires it.

### Part 5 — State-machine/concurrency proof

Run strong tests for:

- play/pause/seek/restart/select/ended/next,
- DB pause-time computation,
- simultaneous admin commands using same version,
- stale retry,
- monotonic version,
- version event matches DB row,
- missed event recovery,
- out-of-order event recovery,
- gap reconciliation.

If any command can produce an invalid state, repair the smallest correct layer.

### Part 6 — Multi-client end-to-end proof

Using the strongest environment available (browser E2E, integration harness, local Supabase, or connected development project), exercise at least:

```text
Admin A
Viewer B
Viewer C
```

Scenario:

1. Admin authenticates and creates room.
2. B and C obtain anonymous authenticated identities.
3. B and C join using room ID and display names.
4. All three subscribe to private Realtime room channel.
5. Presence shows the connected users.
6. Admin adds one test-controlled direct media source.
7. Admin selects it.
8. Admin Play.
9. Both viewers receive same canonical version/state.
10. Admin Pause.
11. Verify canonical position derived from server timeline.
12. Admin Seek.
13. Verify viewers converge.
14. Reload/disconnect Viewer B.
15. Admin changes state while B is absent.
16. B reconnects and gets correct snapshot without needing missed events.
17. Put Viewer C through a simulated visibility/sleep recovery path.
18. C resynchronizes.
19. Invoke viewer GO LIVE and prove it does not mutate shared state.
20. Send chat from B and verify A/C live receive it.
21. Verify bounded chat survives B reload.
22. If subtitle fixture is available, owner uploads private VTT/SRT-converted track and B can download while outsider cannot.

Do not commit private copyrighted media or credentials as test fixtures.

If real cross-network manual testing cannot be automated in the agent environment, provide a concise manual verification checklist **in the final response only**, not as a new repository file, and complete all automated proof possible.

### Part 7 — Sync-engine regression/quality proof

Run deterministic tests for:

- clock calibration,
- server-time offset selection,
- expected position,
- drift thresholds,
- temporary playback-rate correction,
- hard seek,
- rate reset,
- buffering recovery,
- reconnect,
- visibility resume,
- autoplay blocked state,
- source change,
- stale/gapped Realtime events.

Audit network behavior to ensure there is no per-second playback write/broadcast.

### Part 8 — Supabase advisor/observability checks

If connected Supabase tooling exposes security/performance advisors, run them after schema/policy changes.

Resolve relevant findings introduced by this project, especially:

- missing RLS,
- unsafe function configuration,
- missing indexes used by authorization,
- obviously inefficient membership queries.

Do not broaden this into a general database-optimization project unrelated to Tonight TV.

Inspect Realtime authorization/log behavior where available.

### Part 9 — Migration/type reproducibility

Verify:

- clean local DB reset succeeds,
- migrations are ordered and self-contained,
- no critical remote-only schema drift is required for app behavior,
- generated TypeScript DB types match the final schema,
- current build uses those types correctly,
- Storage/Realtime policy SQL is represented reproducibly where the project workflow supports it.

Do not destructively reset production.

### Part 10 — Build quality

Run the project's real quality gates, as applicable:

```text
format/check
lint
typecheck
unit tests
integration tests
E2E tests
Supabase tests
production build
```

Fix errors caused by the implementation.

Do not suppress type/lint errors with broad `any`, disabled rules, or ignored tests merely to get green output.

### Part 11 — Scope audit

Search the final implementation for accidental scope expansion.

Remove or leave unimplemented any unjustified systems for:

- voice/video calls,
- screen sharing,
- public catalog/discovery,
- recommendation engine,
- invites/passwords/bans,
- analytics event pipeline,
- video proxy/upload/transcode,
- Redis/custom WebSocket backend,
- auto-next if not explicitly approved,
- visual design work.

Do not remove a feature that predates these prompts and is clearly user-owned without first preserving the user's work; simply report it if it lies outside this implementation scope.

### Documentation updates

Do **not** create a new implementation report document.

Only update existing project documentation if implementation reality differs in a way future developers/agents must know, and keep those edits surgical.

The two architecture spec files should not be rewritten wholesale to match code style.

### Final completion report

In addition to the normal Global Contract completion report, provide a compact backend readiness matrix in your response:

```text
Auth                 PASS / PARTIAL / BLOCKED
Schema               PASS / PARTIAL / BLOCKED
RLS & grants          PASS / PARTIAL / BLOCKED
Room membership      PASS / PARTIAL / BLOCKED
Snapshot             PASS / PARTIAL / BLOCKED
Playback RPCs        PASS / PARTIAL / BLOCKED
Realtime auth        PASS / PARTIAL / BLOCKED
Presence             PASS / PARTIAL / BLOCKED
Sync engine          PASS / PARTIAL / BLOCKED
MP4/HLS media        PASS / PARTIAL / BLOCKED
Queue                PASS / PARTIAL / BLOCKED
Subtitles            PASS / PARTIAL / BLOCKED
Chat                 PASS / PARTIAL / BLOCKED
Migration reset      PASS / PARTIAL / BLOCKED
Typecheck/build      PASS / PARTIAL / BLOCKED
3-client proof       PASS / PARTIAL / BLOCKED
```

For any non-PASS item, state one precise reason and the smallest required next step.

Do not hide an unverified item behind "PASS".

### Completion standard

This milestone is complete when the backend is either demonstrably ready for the later UI phase or the remaining blockers are external and precisely identified. It is **not** complete merely because the code compiles.

Finish the report and STOP. Do not start UI work.

---

# 2. Milestone Dependency Map

The prompts intentionally build in this order:

```text
Prompt 1
Supabase clients + Auth foundation
        |
        v
Prompt 2
Core schema + migrations + types
        |
        v
Prompt 3
Room membership + RLS + snapshot + server time
        |
        v
Prompt 4
Authoritative playback state machine
        |
        v
Prompt 5
Private Realtime + DB Broadcast + Presence
        |
        v
Prompt 6
Clock/sync/drift/reconnect engine
        |
        v
Prompt 7
External MP4/HLS runtime + queue
        |
        v
Prompt 8
Private subtitles
        |
        v
Prompt 9
Persistent chat + Presence/session completion
        |
        v
Prompt 10
Security + E2E + hardening + readiness proof
```

Do not casually reorder the milestones.

The most important dependency chain is:

```text
Database truth
-> authorization
-> playback state machine
-> Realtime propagation
-> synchronization engine
-> real media runtime
```

Building a polished player before this chain is correct would hide architecture problems rather than solve them.

---

# 3. What the Agent Must Not Do Between Prompts

After completing a prompt, the agent must not "helpfully" continue by doing the next milestone.

Examples:

- After Prompt 2, do not go implement Realtime.
- After Prompt 4, do not build the player.
- After Prompt 6, do not redesign the room page.
- After Prompt 8, do not add subtitle translation.
- After Prompt 9, do not add reactions.
- After Prompt 10, do not start UI work unless explicitly asked.

The point of the sequence is to let the user review the codebase after each meaningful architectural slice.

---

# 4. What Counts as a Good Agent Result

A strong result from one of these prompts typically has these properties:

- It read the repository before changing it.
- It reused existing correct code.
- It implemented a substantial coherent capability.
- Database changes are reproducible.
- Security was implemented with the feature, not deferred.
- Tests exercise real boundaries rather than only mocks.
- Generated types remain synchronized.
- The diff is focused, not a repository rewrite.
- File count is reasonable.
- The agent did not create report/document clutter.
- It clearly tells the user what was actually verified.
- It stops after the milestone.

A weak result includes things such as:

- creating 20 tiny wrapper files,
- adding a permissive RLS policy to get tests passing,
- putting service-role credentials in Next.js,
- writing a new custom backend despite Supabase already solving the requirement,
- implementing UI while backend invariants remain unresolved,
- sending playback time every second,
- trusting client-side `isAdmin`,
- treating Realtime as the only source of truth,
- implementing a fake "sync" that just broadcasts `currentTime`,
- adding future features not requested,
- declaring success without running tests.

---

# 5. Backend Completion Boundary

When Prompt 10 is complete, stop the backend construction sequence.

The project should then be ready for a separate future set of prompts for:

- room/join UX,
- admin player controls,
- viewer player controls,
- chat layout,
- Up Next layout,
- responsive/mobile behavior,
- visual states for loading/buffering/autoplay/source failure,
- design polish.

Those are intentionally **not** part of this file's implementation sequence.

The backend sequence is successful when Tonight TV can truthfully say:

> One owner controls one authoritative shared timeline, authorized members receive committed room state in realtime, every client can recover from Postgres after missed events, and each browser independently plays the external media at the calculated shared position without Supabase carrying the video stream.
