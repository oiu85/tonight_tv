# Tonight TV
## Complete Product & Technical Specification
### Next.js + Supabase Architecture

**Version:** 2.0  
**Status:** Approved architecture for MVP implementation  
**Frontend:** Next.js + React + TypeScript  
**Backend platform:** Supabase  
**Primary infrastructure:** Supabase Postgres, Auth, Realtime, Presence, Storage  
**Media transport:** Direct from the external media host to each viewer  
**Voice/video calls:** Out of scope for MVP  
**Primary use case:** A private synchronized watch room for friends in different countries

---

# 1. Executive Summary

Tonight TV is a private synchronized watch-room application.

It solves the coordination problem that happens when a group of friends wants to watch the same movie or episode remotely. Without Tonight TV, everyone opens a video independently, counts down, presses Play at approximately the same moment, and repeatedly resynchronizes whenever somebody pauses, buffers, reloads the page, loses connectivity, or joins late.

Tonight TV turns that experience into a private television channel.

One administrator controls the shared timeline.

The administrator decides:

- What video is playing.
- When playback starts.
- When playback pauses.
- Where the shared timeline should seek.
- What plays next.
- Which subtitles are available.
- What items are in the queue.

Everyone else is a viewer.

Viewers join the room and automatically watch the currently active program at the correct shared position.

The system should feel like:

> "I opened our private channel and immediately joined whatever my friends are watching right now."

Tonight TV is **not a video hosting service** and should not proxy or rebroadcast movie bytes through the application backend.

Every viewer's browser loads the configured media directly from its approved source. For
`local_p2p`, the owner browser seeds the selected `File` and viewers receive pieces
directly from the WebRTC swarm; Tonight TV infrastructure never carries the movie bytes.

Supabase is responsible only for:

- Authentication.
- Room metadata.
- Authoritative playback state.
- Real-time playback synchronization.
- Presence.
- Chat.
- Playlist state.
- Subtitle file storage.
- Authorization.
- Persistence.

This architecture is intentionally lightweight and is appropriate for a small private group on the Supabase Free plan.

---

# 2. Product Identity

The working product name is:

# Tonight TV

The name fits the core experience because this is not meant to feel like another streaming catalog.

It is closer to:

> "Our private channel is on tonight."

The key product metaphor is **a private TV channel controlled by one operator**.

The application should emphasize:

- `NOW PLAYING`
- `LIVE`
- `UP NEXT`
- `WATCHING`
- `GO LIVE`

Rather than presenting itself as a Netflix-style streaming library.

---

# 3. Core Product Definition

Tonight TV is:

> A private administrator-controlled synchronized watch room where every viewer loads the same externally hosted video directly from its source while Supabase keeps the room's playback state, playlist, subtitles, presence, and chat synchronized in real time.

The simplest user experience is:

```text
ADMIN
1. Open Tonight TV.
2. Add a direct video URL.
3. Add subtitles if needed.
4. Press Play.

FRIENDS
1. Open the room link.
2. Enter a nickname.
3. Press Join Live.
4. Watch.
5. Chat.
```

Everything else exists to make those actions secure, synchronized, and reliable.

---

# 4. Product Goals

## 4.1 Primary Goals

Tonight TV must:

1. Keep remote viewers synchronized.
2. Work correctly for friends located in different countries and time zones.
3. Give one administrator control over the shared timeline.
4. Support direct playable media URLs.
5. Avoid routing video bytes through Tonight TV infrastructure.
6. Support external subtitle files.
7. Allow every viewer to choose their own subtitle language.
8. Provide real-time side-panel text chat.
9. Support a playlist / Up Next queue.
10. Automatically synchronize late joiners.
11. Recover after temporary network or WebSocket disconnection.
12. Correct normal playback drift automatically.
13. Remain inexpensive and simple enough for a small private deployment.
14. Use Supabase as the main backend instead of maintaining a custom backend server.

---

# 5. MVP Non-Goals

The first version does not need:

- Voice calls.
- Video calls.
- Screen sharing.
- Public movie discovery.
- Scraping streaming websites.
- Extracting hidden video URLs.
- DRM circumvention.
- Downloading protected streams.
- Public Torrent search/indexers or browser BitTorrent clients. Owner-supplied
  Magnet URIs and `.torrent` metadata are now an approved first-class source.
- Stream from Device (`local_p2p`) through browser WebTorrent/WebRTC is approved. It
  is file distribution, not screen sharing, and it has no server upload or storage path.
- Application-side video transcoding. Torrent remux/transcode may occur only in
  the separate Webtor Self-Hosted gateway; media bytes still bypass Next.js and Supabase.
- Server-side media rebroadcasting.
- Public social profiles.
- Recommendation algorithms.
- Smart TV applications.
- Native iOS or Android applications.
- Automatic subtitle searching.
- Large public channels.
- Payment systems.
- Public creator channels.
- Multiple administrators per room.

These features can be evaluated later.

---

# 6. Final Technology Direction

The approved MVP stack is:

## Frontend

- Next.js.
- React.
- TypeScript.
- HTML5 `<video>`.
- hls.js for HLS sources where native HLS is unavailable.
- Supabase JavaScript client.

## Backend

No custom Node/Express/Fastify WebSocket backend is required for the MVP.

Use:

- Supabase Postgres.
- Supabase Auth.
- Supabase Realtime Broadcast.
- Supabase Realtime Presence.
- Supabase Storage.
- Postgres RPC/database functions for authoritative playback mutations.
- Postgres triggers + Realtime Broadcast for room-state distribution where appropriate.

Supabase Edge Functions are optional and should only be introduced when a feature genuinely needs server-side TypeScript logic.

## Hosting

The Next.js frontend can be hosted on:

- Vercel.
- Cloudflare-compatible hosting where the chosen Next.js setup works.
- Another standard Next.js host.

The application does not require a permanently running custom application server solely for synchronization.

---

# 7. High-Level Architecture

```text
                       ┌─────────────────────┐
                       │      Next.js UI     │
                       │ React + TypeScript  │
                       └──────────┬──────────┘
                                  │
                    Auth / DB / Realtime / Storage
                                  │
                                  ↓
                       ┌─────────────────────┐
                       │      Supabase       │
                       │                     │
                       │  Auth               │
                       │  Postgres           │
                       │  RPC Functions      │
                       │  Realtime Broadcast │
                       │  Presence           │
                       │  Storage            │
                       └─────────────────────┘


Viewer A Browser ───────────────────────────────→ Media Host
Viewer B Browser ───────────────────────────────→ Media Host
Viewer C Browser ───────────────────────────────→ Media Host

              Direct video traffic
```

The media does **not** flow through Supabase.

---

# 8. Why Supabase Fits Tonight TV

Supabase provides nearly every backend capability required by the MVP:

| Tonight TV Requirement | Supabase Capability |
|---|---|
| Admin authentication | Supabase Auth |
| Temporary viewers | Anonymous Auth |
| Rooms | Postgres |
| Media items | Postgres |
| Playlist | Postgres |
| Authoritative playback state | Postgres |
| Atomic Play/Pause/Seek operations | Postgres RPC |
| Live state propagation | Realtime Broadcast |
| Online viewer count | Realtime Presence |
| Chat | Realtime Broadcast |
| Optional chat persistence | Postgres |
| Subtitle files | Supabase Storage |
| Access control | RLS |
| Server-side timestamps | Postgres database clock |
| State recovery after reconnect | Postgres snapshot |

This removes the need to maintain:

- A separate WebSocket server.
- A separate authentication system.
- A separate database host.
- A separate object-storage provider.
- A Redis instance for the initial version.

---

# 9. Supabase Free Plan Strategy

The MVP is deliberately designed to fit a small private project.

As of August 2026, important Supabase Free-plan characteristics include:

- Up to 200 concurrent Realtime connections.
- Up to 100 Realtime messages per second.
- A Free-plan Realtime quota of 2 million messages per billing period.
- A 500 MB database-size limit before a Free project becomes read-only.
- 1 GB of included Storage size.
- Free-plan bandwidth is limited and should not be used for movie delivery.
- Free projects with sufficiently low activity over a 7-day period may be automatically paused.

These limits can change, so they should be rechecked before public launch or major scale-up.

For the intended use case of a private group of friends, the current limits are much larger than necessary.

## Critical Cost Rule

**Never upload movies to Supabase Storage for the MVP.**

Store only lightweight files such as subtitles and possibly small poster images.

The actual movie should remain on the external media host.

---

# 10. Architecture Change from the Original Design

The earlier architecture considered:

```text
Next.js
+
Custom Node Backend
+
Custom WebSocket Server
+
PostgreSQL
+
Object Storage
```

That is no longer the preferred MVP architecture.

The approved design is:

```text
Next.js
+
Supabase
```

Supabase replaces:

- Custom PostgreSQL hosting.
- Custom WebSocket infrastructure.
- Custom presence infrastructure.
- Custom authentication infrastructure.
- Separate subtitle object storage.

This substantially reduces operational complexity.

---

# 11. Roles

Tonight TV has two primary roles.

## 11.1 Administrator

The administrator is the room operator.

The admin can:

- Create a room.
- Rename a room.
- Configure privacy.
- Add a media URL.
- Edit media metadata.
- Upload subtitles.
- Delete subtitles.
- Add playlist items.
- Reorder the queue.
- Remove playlist items.
- Select the active item.
- Play.
- Pause.
- Seek.
- Restart.
- Skip to next.
- Optionally go to previous.
- Optionally enable automatic next.
- Moderate chat later.
- See viewer presence.

## 11.2 Viewer

The viewer can:

- Join the room.
- Choose a nickname.
- Watch the active media.
- Automatically follow the room timeline.
- Use Go Live.
- Adjust local volume.
- Mute/unmute.
- Fullscreen.
- Picture-in-picture when supported.
- Select a subtitle track.
- Disable subtitles.
- Send chat messages.
- Read chat.
- See Up Next.
- See the number of connected viewers.

A viewer cannot:

- Pause the room.
- Resume the room.
- Seek the shared timeline.
- Change the active media.
- Reorder the playlist.
- Upload subtitles.
- Modify the room.

---

# 12. Administrator Authentication

The administrator should use a permanent Supabase Auth account.

Recommended options:

- Email + password.
- Magic link.
- Passkey later.
- OAuth later if useful.

For the first version, email/password is sufficient.

The frontend must use only a Supabase **publishable key**.

Never expose:

- Secret key.
- Service role key.
- Database password.

Authorization must never rely only on whether the UI shows admin buttons.

Every protected database mutation must verify the user through Supabase Auth + database authorization.

---

# 13. Viewer Authentication

Viewers do not need full accounts.

Use Supabase Anonymous Auth.

Join flow:

```text
Open room
   ↓
Enter nickname
   ↓
Join Live
   ↓
supabase.auth.signInAnonymously()
   ↓
Anonymous authenticated user receives JWT
   ↓
Create/refresh room session
   ↓
Join private Realtime channel
```

Important Supabase behavior:

Anonymous users use the Postgres `authenticated` role.

Therefore:

```text
TO authenticated
```

does **not** automatically mean:

> "Only permanent registered users."

If policies need to distinguish an anonymous viewer from a permanent admin, use secure server-controlled data such as room ownership or the appropriate trusted JWT claims.

Do not use editable user metadata to determine admin authorization.

---

# 14. Viewer Nicknames

The nickname is not an authorization mechanism.

Example:

```text
viewer id: 6f2c...
display name: Omar
```

The stable identity for the current browser session is the Supabase Auth user ID.

The nickname is only display metadata.

Suggested table:

```text
room_sessions
-------------
id
room_id
user_id
display_name
joined_at
last_seen_at
```

A browser may store the preferred nickname locally for convenience.

---

# 15. Room Privacy

The MVP should be private by default.

Recommended first version:

- High-entropy room identifier/slug.
- Private Supabase Realtime channel.
- Optional room password later.

Example:

```text
https://tonight.example/r/6f88dc77-...
```

Do not use easily guessable room identifiers such as:

```text
/room/1
/room/friends
```

unless additional authentication is required.

---

# 16. Server-Authoritative Synchronization

This is the most important technical rule.

The authoritative shared timeline belongs to the backend.

Not to:

- The admin browser.
- The fastest viewer.
- The oldest connected client.
- A participant's local clock.

Supabase Postgres stores the authoritative state.

Example:

```json
{
  "room_id": "room_123",
  "active_media_item_id": "movie_42",
  "status": "playing",
  "anchor_position_sec": 1254.300,
  "anchor_server_time_ms": 1786924300000,
  "playback_rate": 1.0,
  "state_version": 103
}
```

---

# 17. Why Time Zones Do Not Matter

A viewer may be in:

- New York.
- London.
- Berlin.
- Dubai.
- Amman.
- Riyadh.
- Tokyo.

The application does not synchronize using local wall-clock display.

It synchronizes using:

1. A server timestamp.
2. An anchor media position.
3. Elapsed time.

Therefore no timezone conversion is required.

The concept is:

```text
expectedMediaPosition =
    anchorPosition
    + elapsedServerTime
```

If the shared state says:

```text
anchor position = 1200 seconds
anchor server time = T
```

and 15 seconds have elapsed since `T`, the expected current position is approximately:

```text
1215 seconds
```

regardless of country.

---

# 18. Use the Database Clock

The server timestamp should come from Supabase/Postgres, not from the admin browser.

Admin commands should therefore be applied through a database function/RPC.

Conceptually:

```text
Admin presses Pause
        ↓
Call Supabase RPC
        ↓
Postgres verifies room ownership
        ↓
Postgres calculates current server time
        ↓
Postgres atomically updates playback state
        ↓
state_version += 1
        ↓
Realtime Broadcast informs viewers
```

This is significantly safer than trusting a browser-provided timestamp.

---

# 19. Playback State Table

Suggested schema:

```text
room_playback_state
-------------------
room_id                    primary key
active_media_item_id
status                     playing | paused | ended
anchor_position_sec        double precision
anchor_server_time         timestamptz
playback_rate              double precision default 1
state_version              bigint
updated_at                 timestamptz
```

Prefer storing the server timestamp as `timestamptz`.

Clients can convert it to milliseconds as needed.

---

# 20. State Versioning

Every accepted shared playback mutation increments:

```text
state_version
```

Example:

```text
103 Play
104 Pause
105 Seek
106 Play
```

If a client has already applied version `106` and later receives `105`, it ignores `105`.

This protects against:

- Delayed messages.
- Reconnect race conditions.
- Out-of-order WebSocket delivery.
- Old local state.

Rule:

```text
if incomingVersion <= lastAppliedVersion:
    ignore
```

---

# 21. Authoritative Admin RPCs

Suggested database RPC operations:

```text
play_room(room_id, position_sec)
pause_room(room_id, position_sec)
seek_room(room_id, position_sec)
select_media(room_id, media_item_id)
next_media(room_id)
restart_media(room_id)
```

Every function must:

1. Identify the authenticated caller.
2. Verify that caller owns/administers the room.
3. Validate input.
4. Lock or otherwise safely mutate the room playback row.
5. Use the database clock.
6. Increment `state_version`.
7. Commit the new state.
8. Cause the updated state to be broadcast.

The browser should never be able to directly declare itself admin.

---

# 22. RPC Security

Prefer normal invoker behavior wherever practical.

Do not casually add `SECURITY DEFINER` merely to bypass an RLS problem.

If a privileged function is genuinely required:

- Keep its scope extremely narrow.
- Use a safe `search_path`.
- Explicitly verify `auth.uid()`.
- Revoke unnecessary execute permissions.
- Test anonymous and viewer calls.
- Run Supabase security advisors.

For this project, most authorization can be modeled through:

```text
rooms.owner_user_id = auth.uid()
```

plus RLS.

---

# 23. Play Command

When the admin presses Play:

```text
Admin UI
   ↓
RPC: play_room(roomId, currentPosition)
   ↓
Postgres
```

The database commits approximately:

```text
status = playing
anchor_position_sec = requested position
anchor_server_time = database now
state_version = previous + 1
```

Then viewers receive the new state through Realtime.

---

# 24. Pause Command

When the admin presses Pause:

```text
status = paused
anchor_position_sec = exact paused position
anchor_server_time = database now
state_version += 1
```

While paused:

```text
expectedPosition = anchor_position_sec
```

Time does not advance.

---

# 25. Seek Command

If the room is playing and the admin seeks to:

```text
3180.5 sec
```

the database stores:

```text
status = playing
anchor_position_sec = 3180.5
anchor_server_time = database now
state_version += 1
```

If paused, it remains paused.

---

# 26. Selecting Another Video

When the administrator selects a new item:

```text
active_media_item_id = new item
anchor_position_sec = 0
anchor_server_time = database now
status = paused or playing depending on chosen behavior
state_version += 1
```

Recommended MVP behavior:

- Selecting `Play Now` activates the item and starts it.
- Selecting an item for editing does not affect playback.

---

# 27. Realtime Distribution

Use Supabase Realtime **Broadcast**.

Recommended private topic pattern:

```text
room:<room-id>
```

Possible event names:

```text
playback.state
playlist.updated
chat.message
chat.deleted
system.notice
```

Presence can be tracked on the same logical room channel.

Supabase recommends Broadcast for scalable and secure database change distribution.

A strong architecture is:

```text
Postgres row changes
        ↓
Database trigger
        ↓
realtime.broadcast_changes(...)
        ↓
Private room channel
        ↓
Connected clients
```

This means the database update and the event originate from the same authoritative mutation.

---

# 28. Why Not Send Current Time Every Second

Do not implement:

```text
every second:
    admin sends currentTime
```

This wastes Realtime messages and creates unnecessary network noise.

Only broadcast meaningful state changes:

```text
PLAY
PAUSE
SEEK
MEDIA_CHANGE
QUEUE_CHANGE
```

The clients calculate the moving position locally from the last authoritative anchor.

Periodic synchronization is only for clock calibration and drift correction, not for publishing the timeline every second.

---

# 29. Clock Offset Estimation

The browser's clock may differ from the database/server clock.

The client should estimate server offset.

A simple strategy:

1. Client records local send time `t0`.
2. Client calls a lightweight server-time RPC.
3. Database returns current timestamp.
4. Client records receive time `t1`.
5. RTT:

```text
RTT = t1 - t0
```

6. Estimated server time on receipt:

```text
serverAtReceipt ≈ returnedServerTime + RTT/2
```

7. Offset:

```text
offset = serverAtReceipt - t1
```

Take multiple samples.

Prefer:

- Lowest-RTT sample, or
- A rolling filtered median/average after excluding poor samples.

The application then estimates:

```text
estimatedServerNow =
    localNow + offset
```

---

# 30. Server-Time RPC

A small database function can return:

```text
database timestamp
```

No separate server is required.

Conceptually:

```sql
select clock_timestamp();
```

The implementation may wrap this in a restricted RPC.

The function should not expose privileged information.

---

# 31. Expected Position Calculation

When the room is playing:

```text
elapsed =
    estimatedServerNow - anchorServerTime

expectedPosition =
    anchorPositionSec + elapsed
```

When paused:

```text
expectedPosition =
    anchorPositionSec
```

Clamp to:

```text
0 <= expectedPosition <= duration
```

when duration is known.

---

# 32. Drift Correction

Perfect frame-level synchronization is not realistic across ordinary home networks.

The practical goal is that friends perceive the playback as synchronized.

Suggested initial thresholds:

## Tiny Drift

```text
abs(drift) < 0.25 sec
```

Do nothing.

## Moderate Drift

```text
0.25 <= abs(drift) < 1.0 sec
```

Temporarily adjust playback rate.

Examples:

```text
viewer behind → playbackRate 1.02 to 1.04
viewer ahead  → playbackRate 0.96 to 0.98
```

Return to:

```text
1.0
```

after convergence.

## Large Drift

```text
abs(drift) >= 1.0 sec
```

Seek directly to the expected position.

These thresholds must be tuned through real testing.

---

# 33. Drift Calculation

Periodically:

```text
expected = calculateExpectedPosition(roomState)
actual = video.currentTime

drift = actual - expected
```

Example:

```text
Expected: 1842.400
Actual:   1842.820
Drift:      +0.420 sec
```

The viewer is 420 ms ahead.

---

# 34. When Drift Correction Should Pause

Do not continuously correct while:

- Media is loading.
- The video is buffering.
- HLS is switching source/quality.
- The browser is waiting for data.
- The player is currently executing a server-authorized seek.
- The browser has blocked playback.
- The page is hidden and heavily throttled.
- A media source is in an error state.

Resume synchronization once playback is stable.

---

# 35. Late Joiners

Late joining is a core feature.

If the group started the movie 37 minutes ago:

A new viewer should not begin at `00:00`.

Flow:

```text
Join room
   ↓
Authenticate anonymously
   ↓
Fetch current room snapshot
   ↓
Calibrate server clock
   ↓
Load active media
   ↓
Wait until seekable
   ↓
Calculate expected live position
   ↓
Seek to live position
   ↓
Play if room is playing
```

UI:

```text
Joining live...
```

then:

```text
● LIVE
```

---

# 36. The Go Live Button

Every viewer should have:

# GO LIVE

It is a recovery control.

Show it when:

- Viewer is significantly behind.
- Viewer manually moved the local player.
- Browser resumed from sleep.
- WebSocket reconnected.
- Media stalled.
- Tab was suspended.
- Synchronization confidence is low.

When clicked:

1. Obtain latest playback state.
2. Recalculate server time offset if needed.
3. Compute expected live position.
4. Seek.
5. Match play/pause state.
6. Resume drift correction.

---

# 37. Buffering Behavior

One viewer's buffering must **not pause the room**.

Example:

Viewer B buffers for 8 seconds.

The correct behavior:

```text
Room continues.
Viewer A continues.
Viewer C continues.
Viewer B shows Buffering...
```

When Viewer B has enough data:

```text
Catching up to live...
```

Then:

- Small delay → rate correction.
- Large delay → direct seek.

This preserves the "private TV channel" model.

---

# 38. Autoplay Restrictions

Modern browsers may block programmatic playback with audio before a user gesture.

Therefore initial room entry should include:

```text
Friends are watching:
Movie Name

[ JOIN LIVE ]
```

The click is valuable because it counts as a user interaction.

If `video.play()` is still rejected:

```text
Playback needs permission.

[ START WATCHING ]
```

This is particularly important for Safari/iOS.

---

# 39. Media URL Player

The administrator can configure a media item using a direct media URL.

Examples:

```text
https://cdn.example.com/movie.mp4
```

```text
https://video.example.com/master.m3u8
```

Tonight TV behaves similarly in concept to "Open Network Stream" in a media player.

However, a web browser has more restrictions than native players such as VLC or MX Player.

---

# 40. Supported Media Formats

## MVP

Support:

```text
MP4
HLS (.m3u8)
YouTube
Torrent through the current Webtor implementation
Stream from Device through local WebTorrent/WebRTC P2P (`local_p2p`)
```

Optionally:

```text
WebM
```

## Later

Potential:

```text
MPEG-DASH (.mpd)
```

---

# 41. MP4

Recommended codecs for broad compatibility:

- H.264 video.
- AAC audio.

Basic HTML media flow:

```html
<video src="https://example.com/movie.mp4"></video>
```

Actual browser compatibility still depends on the codec inside the container.

---

# 42. HLS

For `.m3u8` streams:

1. Detect native HLS support.
2. If available, assign the source directly.
3. Otherwise use hls.js.
4. Listen for manifest load.
5. Wait for seekable ranges.
6. Join the room's expected position.
7. Recover from non-fatal HLS errors.
8. Show a useful message on fatal source failure.
9. Destroy the old hls.js instance when changing media.

---

# 43. Important URL Limitations

## A Webpage Is Not a Media Source

This:

```text
https://site.example/watch/movie123
```

is often an HTML page.

Tonight TV needs something actually playable by the browser, such as:

```text
https://cdn.example/movie123.mp4
```

or:

```text
https://cdn.example/movie123/master.m3u8
```

---

# 44. CORS

Some media servers do not permit another website to load their stream.

This is especially relevant for HLS because browser JavaScript may fetch manifests and segments.

The UI should provide a clear failure state:

```text
This media host does not allow browser playback from Tonight TV.
```

Do not attempt to defeat the host's security policy.

---

# 45. Authentication-Protected Sources

Some video URLs require:

- Cookies.
- Authorization headers.
- Logged-in state.
- Signed tokens.
- Referrer checks.
- Origin checks.

A URL copied from another website may therefore fail inside Tonight TV.

Do not build systems to steal or bypass authentication.

---

# 46. Expiring Media URLs

Some direct links include short-lived signed tokens.

A working URL may later expire.

Admin UI should make replacement fast:

```text
Source failed
[ Replace URL ]
```

Room viewers see:

```text
Video unavailable.
Waiting for admin...
```

---

# 47. DRM

DRM-protected media is outside the MVP.

Do not attempt to bypass:

- Widevine.
- FairPlay.
- PlayReady.
- Encrypted protected streams.
- Service authorization systems.

Tonight TV should work with media that the user is legally and technically allowed to play through a browser.

---

# 48. Media Rights

Tonight TV is a synchronization tool, not a piracy service.

The administrator is responsible for using content that they are authorized to access and share in the intended manner.

The architecture intentionally avoids:

- Movie scraping.
- DRM bypass.
- Re-streaming protected content.
- Acting as an open media proxy.

---

# 49. Direct-to-Viewer Video Traffic

Correct:

```text
Media Host ─────────────→ Viewer A
Media Host ─────────────→ Viewer B
Media Host ─────────────→ Viewer C
```

Supabase only handles:

```text
playback state
presence
chat
playlist
metadata
subtitles
auth
```

Incorrect MVP architecture:

```text
Media Host
   ↓
Supabase / Tonight TV Server
   ↓
A + B + C
```

Do not proxy the movie through Supabase.

---

# 50. Subtitle System

The administrator can attach multiple subtitle tracks to a media item.

Example:

```text
Movie A
├── Arabic
├── English
└── German
```

Every viewer independently selects:

```text
CC
Arabic
English
Off
```

The selected track is a local preference.

---

# 51. Subtitle Formats

## WebVTT

Use WebVTT internally:

```text
.vtt
```

because HTML video supports it naturally.

## SRT

Allow the administrator to upload:

```text
.srt
```

Convert it to VTT before or during storage.

Suggested pipeline:

```text
Upload SRT
   ↓
Validate
   ↓
Normalize encoding to UTF-8
   ↓
Convert SRT → VTT
   ↓
Upload VTT to Supabase Storage
   ↓
Insert subtitle metadata row
```

---

# 52. Where SRT Conversion Should Run

Several valid options exist.

For the MVP, the simplest is:

- Convert in the browser before upload, or
- Use a small Next.js server action/API route if preferred.

If future requirements demand centralized validation, use a Supabase Edge Function.

Do not introduce an Edge Function only because "backend logic sounds cleaner" if the browser can safely perform the deterministic conversion.

Regardless of location, validate the resulting subtitle file.

---

# 53. Subtitle Storage

Use a Supabase Storage bucket such as:

```text
subtitles
```

Recommended:

- Private bucket.
- Read access limited to members of the relevant room.
- Upload/delete access limited to the room owner/admin.

Store files using generated paths:

```text
<room-id>/<media-item-id>/<subtitle-id>.vtt
```

Do not trust original filenames as storage paths.

---

# 54. Subtitle Metadata

Suggested table:

```text
subtitles
---------
id
media_item_id
language_code
label
storage_path
format
is_default
created_by
created_at
```

Example:

```json
{
  "language_code": "ar",
  "label": "Arabic",
  "format": "vtt"
}
```

---

# 55. Subtitle Synchronization

No special network clock is required for subtitles.

Subtitle cues are attached to the video timeline.

If the player's `currentTime` is synchronized, the subtitles are naturally synchronized.

---

# 56. Subtitle Offset

A useful post-MVP feature:

```text
Subtitle delay
-1.0s
-0.5s
0
+0.5s
+1.0s
```

This should initially be a per-viewer local preference.

Later, the admin could save a recommended offset per subtitle track.

---

# 57. Chat

Tonight TV includes a side-panel text chat.

Purpose:

- Reactions.
- Short conversation.
- Movie commentary.

It is not intended to become a full messaging platform.

Example:

```text
CHAT

Omar:
هههههههه

Ali:
what just happened 😂

Sara:
don't spoil it

[ message... ]
```

---

# 58. Chat Architecture

Use Supabase Realtime Broadcast.

Possible event:

```text
chat.message
```

Payload:

```json
{
  "id": "client-generated-id",
  "displayName": "Omar",
  "text": "هههههههه",
  "sentAt": 1786924400123
}
```

The server/Realtimes authorization layer controls whether the user may participate in that room topic.

---

# 59. Chat Persistence

Two options:

## MVP Simple Mode

Chat is ephemeral:

- Broadcast only.
- New viewers do not receive old messages.

Very lightweight.

## Recommended Slightly Better MVP

Persist the last room messages in Postgres.

Flow:

```text
send message
   ↓
insert chat_messages row
   ↓
database broadcast
   ↓
room viewers receive message
```

Advantages:

- Reconnect history.
- Late joiners see recent context.
- Admin moderation later.

For a private group, storing a bounded history is reasonable.

---

# 60. Chat Table

```text
chat_messages
-------------
id
room_id
user_id
display_name_snapshot
message
created_at
deleted_at nullable
```

Limit message size.

For example:

```text
1-1000 characters
```

Exact limit can be tuned.

---

# 61. Chat Security

Never render raw user HTML.

Apply:

- HTML escaping.
- Message-length limits.
- Rate limiting.
- Authentication.
- RLS.
- Optional moderation.
- Optional per-user throttling.

Do not support arbitrary HTML in MVP chat.

---

# 62. Presence

Use Supabase Realtime Presence.

The main UI shows:

```text
● 7 watching
```

Presence payload can contain minimal non-sensitive information:

```json
{
  "viewerId": "uuid",
  "displayName": "Omar"
}
```

Do not place secrets or tokens in Presence metadata.

---

# 63. Presence Is Ephemeral

Presence answers:

> "Who appears connected right now?"

It is not permanent membership history.

If the WebSocket disconnects, the presence state should disappear after Realtime reconciliation.

The persistent database session and Realtime Presence serve different purposes.

---

# 64. Playlist

Each room has an ordered queue.

Example:

```text
NOW PLAYING
Movie A

UP NEXT
1. Episode 4
2. Movie B
3. Episode 5
```

The admin can:

- Add.
- Edit.
- Delete.
- Reorder.
- Play now.
- Skip.
- Restart.

---

# 65. Media Item Schema

Suggested table:

```text
media_items
-----------
id
room_id
title
video_url
media_type
poster_url nullable
duration_sec nullable
queue_position
is_active
created_by
created_at
updated_at
```

Possible media types:

```text
mp4
hls
webm
unknown
```

Do not treat extension detection as absolute truth.

---

# 66. Queue Behavior

Recommended MVP:

When a video ends:

```text
Room state → ended
Viewers → "Waiting for next program..."
Admin → "Play Next"
```

Then add optional:

```text
Auto-play next: ON/OFF
```

after the manual flow is reliable.

---

# 67. Main Viewer UI

Desktop concept:

```text
┌──────────────────────────────────────────────────────────────────┐
│ TONIGHT TV                   Friends Room       ● 7 watching     │
├───────────────────────────────────────────────┬──────────────────┤
│                                               │ CHAT             │
│                                               │                  │
│                VIDEO PLAYER                   │ Omar: 😂         │
│                                               │ Sara: no way     │
│                                               │ Ali: hahaha      │
│                                               │                  │
├───────────────────────────────────────────────┤                  │
│ Movie Name                                    │                  │
│ ● LIVE   01:22:16 / 02:04:53                  │                  │
│                                               │                  │
│ [GO LIVE] [CC Arabic] [Volume] [Fullscreen]   │ [message...]     │
├───────────────────────────────────────────────┴──────────────────┤
│ UP NEXT                                                         │
│ 1. Episode 4                                                    │
│ 2. Movie B                                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

# 68. Viewer Controls

Allowed:

```text
Volume
Mute
Fullscreen
Picture-in-Picture
Subtitle language
Subtitle Off
Go Live
```

Not allowed:

```text
Shared Play
Shared Pause
Shared Seek
Next
Previous
Change media
```

---

# 69. Native Video Controls

Native controls may expose local seeking.

Two valid approaches:

## Preferred

Build custom viewer controls and hide the seekable timeline.

## Alternative

Allow native controls, but if a viewer seeks locally:

- Detect the drift.
- Return the user to the authoritative live position.

Preferred UX is to prevent misleading controls.

---

# 70. Administrator Player Controls

Admin controls:

```text
Play
Pause
Seek
Restart
Next
Previous optional
```

Admin content controls:

```text
Add URL
Edit media
Add subtitle
Remove subtitle
Reorder queue
Delete item
Play now
```

Show clear feedback:

```text
Paused for everyone
```

```text
Playing Movie B
```

---

# 71. Room Snapshot

A newly connected viewer needs a complete authoritative snapshot.

Fetch from Postgres:

```text
room
active playback state
active media item
subtitles
playlist
recent chat history
```

Presence comes from Realtime.

Example logical snapshot:

```json
{
  "room": {
    "id": "room_123",
    "name": "Friends Room"
  },
  "playback": {
    "activeMediaItemId": "movie_42",
    "status": "playing",
    "anchorPositionSec": 1254.3,
    "anchorServerTime": "2026-08-17T00:00:00Z",
    "stateVersion": 103
  },
  "media": {
    "title": "Movie Name",
    "videoUrl": "https://...",
    "mediaType": "hls"
  },
  "subtitles": [],
  "queue": []
}
```

---

# 72. Reconnection

WebSocket disconnects are normal.

After reconnect:

1. Reauthenticate if needed.
2. Resubscribe to private room channel.
3. Rejoin Presence.
4. Refetch playback state.
5. Recalibrate time offset.
6. Compare media ID.
7. Load new media if needed.
8. Calculate live position.
9. Seek if required.
10. Match play/pause.
11. Resume drift correction.
12. Fetch missing chat history if chat is persisted.

Never assume the browser remained synchronized while offline.

---

# 73. Browser Sleep and Background Tabs

Browsers throttle background tabs.

Devices sleep.

Listen to lifecycle signals such as:

```text
visibilitychange
pageshow
focus
online
```

When returning:

```text
Resync room
Recompute expected position
Correct player
```

If automatic playback fails:

```text
[ GO LIVE ]
```

---

# 74. Player State Machine

Maintain explicit internal player state.

Recommended:

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

Synchronization logic should depend on this state.

Example:

Do not hard-seek repeatedly while:

```text
buffering
loading
blocked
```

---

# 75. Media Error States

Good errors are specific.

Instead of:

```text
Error code 4
```

show:

```text
This video could not be played.

Possible reasons:
• The URL expired.
• The media host blocks browser playback.
• The file format or codec is unsupported.
• The source requires authentication.
```

Admin:

```text
[ Replace Source URL ]
```

Viewer:

```text
Waiting for admin...
```

---

# 76. URL Validation

When adding a URL:

Client-side validation:

- Parse valid URL.
- HTTPS required in production.
- Reject malformed URL.
- Guess media type.
- Do not trust guessed type.

Optional future validation may check response metadata.

Do not automatically make unrestricted server-side requests to arbitrary URLs.

---

# 77. SSRF

If a future Edge Function or Next.js server route fetches an administrator-provided URL, implement SSRF protections.

Block access to:

- localhost.
- loopback IPs.
- private IPv4 ranges.
- private IPv6 ranges.
- link-local addresses.
- metadata services.
- internal DNS names.
- unsupported protocols.
- unexpected redirect chains.

The safest MVP is:

> The browser loads the media directly; the backend does not fetch it.

---

# 78. Recommended Supabase Database Tables

```text
rooms
room_sessions
media_items
subtitles
room_playback_state
chat_messages (recommended)
```

Optional later:

```text
room_invites
room_bans
subtitle_preferences
watch_history
```

---

# 79. Rooms Table

```text
rooms
-----
id uuid primary key
owner_user_id uuid not null
name text not null
slug text unique not null
is_active boolean default true
created_at timestamptz
updated_at timestamptz
```

If a password is added later, never store it in plaintext.

---

# 80. Room Sessions Table

```text
room_sessions
-------------
id uuid primary key
room_id uuid
user_id uuid
display_name text
joined_at timestamptz
last_seen_at timestamptz
```

Use a unique constraint such as:

```text
(room_id, user_id)
```

if one active logical identity per room is desired.

---

# 81. Media Items Table

```text
media_items
-----------
id uuid primary key
room_id uuid
title text
video_url text
media_type text
poster_url text nullable
duration_sec double precision nullable
queue_position integer
created_by uuid
created_at timestamptz
updated_at timestamptz
```

---

# 82. Subtitles Table

```text
subtitles
---------
id uuid primary key
media_item_id uuid
language_code text
label text
storage_path text
format text
is_default boolean
created_by uuid
created_at timestamptz
```

---

# 83. Playback State Table

```text
room_playback_state
-------------------
room_id uuid primary key
active_media_item_id uuid nullable
status text
anchor_position_sec double precision
anchor_server_time timestamptz
playback_rate double precision
state_version bigint
updated_at timestamptz
```

There should be exactly one current authoritative state row per room.

---

# 84. Chat Messages Table

```text
chat_messages
-------------
id uuid primary key
room_id uuid
user_id uuid
display_name_snapshot text
message text
created_at timestamptz
deleted_at timestamptz nullable
```

Keep indexes on:

```text
room_id
created_at
```

---

# 85. Row Level Security

Enable RLS on every application table exposed through the Supabase Data API.

Do not ship with:

```text
using (true)
```

on sensitive write operations just to make development easier.

Design policies around actual room membership and ownership.

---

# 86. RLS Intent

High-level authorization matrix:

| Operation | Viewer | Admin |
|---|---:|---:|
| Read room | Yes | Yes |
| Read playback state | Yes | Yes |
| Read playlist | Yes | Yes |
| Read subtitle metadata | Yes | Yes |
| Read chat | Yes | Yes |
| Insert chat | Yes | Yes |
| Edit room | No | Yes |
| Add/edit media | No | Yes |
| Upload subtitles | No | Yes |
| Delete subtitles | No | Yes |
| Mutate playback | No | Yes |
| Reorder queue | No | Yes |

---

# 87. Important Supabase RLS Rules

Keep in mind:

1. Anonymous Auth users are still `authenticated` at the Postgres-role level.
2. `TO authenticated` alone is not authorization.
3. Use ownership/membership predicates.
4. UPDATE generally needs compatible SELECT access.
5. UPDATE policies should use appropriate `USING` and `WITH CHECK`.
6. Do not use user-editable metadata for admin authorization.
7. Keep service/secret keys off the client.
8. Views should be designed carefully with RLS behavior in mind.

---

# 88. Realtime Authorization

Use private Realtime channels.

Recommended topic:

```text
room:<uuid>
```

Create RLS policies on:

```text
realtime.messages
```

that allow only users authorized for that room to receive/send the appropriate events.

Do not make the entire application Realtime channel public merely because the room URL is secret.

---

# 89. Supabase 2026 Realtime Schema Rule

Supabase's internal `realtime` schema is platform-managed.

Do not attempt to:

- Add custom tables to it.
- Alter Realtime internal tables.
- Drop Realtime functions.
- Modify internal schema objects.

The supported exception needed here is creating appropriate authorization policies on `realtime.messages`.

Keep Tonight TV's own tables in the application schema, typically `public` or a deliberately configured application schema.

---

# 90. Data API Exposure

Current Supabase projects should not assume every newly created public table is automatically exposed to the Data API.

For each table the Next.js client must access:

1. Decide whether the table should be client-accessible.
2. Ensure it is exposed/configured appropriately in Data API settings.
3. Grant the intended role access where required.
4. Enable RLS.
5. Create restrictive policies.

Do not fix access errors by disabling RLS.

---

# 91. Supabase API Keys

Use the current Supabase key model.

Frontend:

```text
Publishable key
```

Server-only privileged operations:

```text
Secret key
```

Never expose a secret key through:

```text
NEXT_PUBLIC_*
```

The MVP should ideally need very few privileged server-only operations because RLS and authenticated RPCs handle most access safely.

---

# 92. Next.js Rendering and Anonymous Auth

For room pages using Anonymous Auth, avoid accidentally sharing cached user-specific authentication state.

Use dynamic rendering where authentication/session state is user-specific.

Do not statically cache authenticated room state across visitors.

Room metadata that is intentionally public/private-independent can be cached separately if needed.

---

# 93. Next.js Application Structure

Suggested high-level layout:

```text
app/
  page.tsx
  login/
  r/
    [roomSlug]/
      page.tsx
  admin/
    room/
      [roomId]/

components/
  player/
    VideoPlayer.tsx
    ViewerControls.tsx
    AdminControls.tsx
    LiveBadge.tsx
  chat/
    ChatPanel.tsx
  playlist/
    UpNext.tsx
    QueueEditor.tsx
  subtitles/
    SubtitleSelector.tsx
    SubtitleUploader.tsx

lib/
  supabase/
    browser.ts
    server.ts
  sync/
    clock.ts
    expectedPosition.ts
    driftCorrection.ts
    playbackController.ts
  media/
    hls.ts
    sourceDetection.ts
  subtitles/
    srtToVtt.ts

types/
  database.ts
  realtime.ts
  playback.ts
```

Exact structure can evolve.

---

# 94. Client Components vs Server Components

Use Server Components where appropriate for:

- Static shell.
- Public/non-interactive metadata.
- Initial non-sensitive rendering.

Use Client Components for:

- Video element.
- Realtime subscriptions.
- Presence.
- Chat input.
- Drift correction.
- Browser media APIs.
- Fullscreen/PiP.
- Local subtitle selection.

The synchronized watch experience is necessarily client-heavy.

---

# 95. Local Viewer Preferences

Store locally:

```text
volume
muted
selected subtitle
chat open/closed
picture-in-picture preference where relevant
```

Do not put these in room state.

---

# 96. Shared Room Properties

Store/synchronize:

```text
active media
playing/paused
anchor position
anchor timestamp
state version
playlist
available subtitles
room settings
```

---

# 97. Realtime Event Model

Possible events:

## Database-originated

```text
playback.state
playlist.updated
media.updated
subtitle.updated
chat.message
```

## Client-originated

Potentially:

```text
chat.typing (later)
reaction (later)
```

Playback mutations should not be arbitrary client broadcasts.

They should first become authoritative database state.

---

# 98. Why Playback Events Should Be Database-Originated

Bad:

```text
Admin browser sends:
"pause at 1200"
directly to viewers
```

Problems:

- Client clock is untrusted.
- No durable source of truth.
- Late joiners cannot reconstruct state.
- Race conditions are harder.
- A malicious viewer may imitate admin events if authorization is weak.

Better:

```text
Admin → authenticated RPC → Postgres state update → Broadcast
```

The database state can always rebuild the room.

---

# 99. Chat Can Be Less Strict Than Playback

Chat does not control the room timeline.

Therefore it can be implemented either as:

- Direct authenticated Broadcast, or
- Database insert + Broadcast.

Playback should use the stronger authoritative database flow.

This separation is intentional.

---

# 100. Realtime Message Efficiency

Do not broadcast:

- Current playback second every second.
- Volume.
- Subtitle selection.
- Mouse position.
- Player UI state.

Broadcast only state changes that matter to other users.

This keeps the Free Realtime quota comfortable.

---

# 101. Free-Plan Realtime Capacity Example

Suppose:

```text
10 viewers
3-hour movie
```

If the app broadcasts only:

```text
Play
Pause
Seek
Next
Chat
Presence
```

the synchronization traffic is tiny.

The expensive mistake would be publishing:

```text
currentTime
```

every second to every viewer.

Tonight TV explicitly avoids that design.

---

# 102. Supabase Storage Usage

Use Storage for:

- Subtitle files.
- Optional small poster images.
- Future room artwork.

Do not use Storage for:

- Full movies.
- Multi-gigabyte episodes.
- Re-streamed video segments.

---

# 103. Storage Security

Recommended bucket:

```text
subtitles
```

Prefer private.

Storage access should follow room authorization.

Admin:

```text
INSERT / UPDATE / DELETE
```

Viewer:

```text
SELECT
```

Remember that Storage upsert/replacement requires more permissions than a simple insert.

---

# 104. File Validation

Subtitle uploads are untrusted input.

Validate:

- Allowed extension.
- MIME expectations.
- Maximum size.
- Valid text encoding.
- Subtitle format structure.
- Generated safe storage path.

Reject executable/arbitrary files.

---

# 105. Admin Media Form

Suggested:

```text
Add Program

Title
[________________]

Video URL
[https://____________________________]

Type
[ Auto Detect ▼ ]

Poster (optional)
[________________]

Subtitles
Arabic    [ Upload ]
English   [ Upload ]

[ Add to Queue ]
[ Play Now ]
```

---

# 106. Main Viewer States

## Connected and Synced

```text
● LIVE
```

## Behind

```text
18s behind
[ GO LIVE ]
```

## Buffering

```text
Buffering...
```

## Reconnecting

```text
Connection lost.
Reconnecting...
```

## Resynchronizing

```text
Rejoining live...
```

## Media Failure

```text
Video unavailable.
Waiting for admin...
```

## Room Paused

```text
Paused by admin
```

---

# 107. Responsive Layout

## Desktop

- Large video.
- Persistent right-side chat.
- Queue underneath.

## Tablet

- Video first.
- Narrow/collapsible chat.

## Mobile

```text
Video
Now Playing
Controls
[ Chat ] [ Up Next ]
```

Use a drawer, bottom sheet, or tabs for chat and queue.

---

# 108. Visual Direction

Recommended visual identity:

- Dark cinema interface.
- Minimal chrome.
- Strong `LIVE` indicator.
- Clear current title.
- Small number of controls.
- Cozy private-room atmosphere.
- Avoid visual overload.
- Avoid cloning Netflix.

The viewer should immediately understand:

```text
what is playing
whether I am live
who is watching
what is next
where the chat is
```

---

# 109. Accessibility

Include from the beginning:

- Keyboard-accessible buttons.
- Proper labels.
- Visible focus states.
- Good contrast.
- Screen-reader-friendly live status.
- Subtitle support.
- Avoid color-only state communication.
- Chat input labels.
- Appropriate ARIA where needed.

---

# 110. Reconnect Snapshot Rule

Realtime is a delivery mechanism.

Postgres is the source of truth.

Therefore after any uncertainty:

```text
fetch snapshot
```

Do not try to reconstruct authoritative room state only from missed WebSocket events.

---

# 111. Source of Truth Hierarchy

From strongest to weakest:

```text
1. Postgres authoritative playback row
2. Latest valid Realtime state_version event
3. Local calculated expected position
4. Local video.currentTime
```

Local `video.currentTime` is never authoritative for the room.

---

# 112. Sync Client Pseudocode

```text
onRoomLoaded():
    authenticate()
    joinRealtime()
    fetchSnapshot()
    calibrateClock()
    loadActiveMedia()
    applyPlaybackState()

onPlaybackEvent(state):
    if state.version <= lastVersion:
        return

    lastVersion = state.version
    roomState = state

    if mediaChanged:
        loadNewMedia()

    target = expectedPosition(state)

    if state.status == paused:
        seekIfNeeded(target)
        video.pause()
        return

    if video is ready:
        correctToward(target)
        attemptPlay()

every few seconds:
    if roomState.status != playing:
        return

    if playerState in [loading, buffering, blocked, error]:
        return

    expected = expectedPosition(roomState)
    drift = video.currentTime - expected

    if abs(drift) < 0.25:
        video.playbackRate = 1

    else if abs(drift) < 1.0:
        video.playbackRate = rateCorrection(drift)

    else:
        video.currentTime = expected
        video.playbackRate = 1
```

---

# 113. HLS Player Lifecycle

```text
source selected
   ↓
destroy previous HLS instance
   ↓
detect native HLS
   ↓
native supported?
   ├─ yes → set video.src
   └─ no  → create hls.js instance
                 ↓
              loadSource
                 ↓
              attachMedia
                 ↓
              manifest parsed
                 ↓
              wait seekable
                 ↓
              join live
```

---

# 114. Seekable Ranges

Some media cannot seek everywhere immediately.

Before jumping to live:

- Wait for metadata.
- Inspect `video.seekable`.
- Confirm target is available.
- Retry when new ranges become available.

UI:

```text
Loading live position...
```

---

# 115. Duration

Duration may be:

- Known from media metadata.
- Known from HLS manifest.
- Entered manually.
- Unknown.

Do not require known duration to add a video.

The player can update local metadata after load.

If persisting discovered duration, treat it as informational rather than security-sensitive.

---

# 116. End of Media

When duration is known and the room reaches the end:

Possible MVP flow:

```text
room status = ended
```

Viewers:

```text
Program ended.
Waiting for next program...
```

Admin:

```text
[ PLAY NEXT ]
```

Later:

```text
Auto Play Next
```

can be added.

---

# 117. Multi-Tab Admin Race Conditions

The admin may open two browser tabs.

Therefore database mutations must be authoritative and versioned.

Example:

```text
Tab A → Pause → version 120
Tab B → Play  → version 121
```

Version `121` wins.

Clients reject stale `120` if it arrives afterward.

---

# 118. Security Threat Model

Primary risks:

- Viewer impersonating admin.
- Weak RLS.
- Secret key exposed in browser.
- XSS through chat.
- Arbitrary file upload.
- SSRF through URL validation.
- Guessable room links.
- Unauthorized Realtime channel access.
- Direct table mutation bypassing intended RPC flow.
- Abusing anonymous sign-ups.
- Media source URLs containing sensitive signed credentials.

---

# 119. Admin Authorization Rule

The strongest simple rule:

```text
room.owner_user_id = auth.uid()
```

All privileged operations must ultimately verify this or a future equivalent trusted membership role.

Do not use:

```text
nickname == "admin"
```

Do not use:

```text
user_metadata.role == "admin"
```

for authorization.

---

# 120. Anonymous Auth Abuse Protection

Anonymous sign-in endpoints are rate limited by Supabase.

For a public deployment, consider:

- CAPTCHA.
- Rate limits.
- Secret room links.
- Optional room passwords.
- Removing abandoned anonymous identities if necessary through a maintenance strategy.

For a small friend-only project, this can remain simple.

---

# 121. URL Privacy

A direct media URL may contain:

```text
?token=...
&expires=...
&signature=...
```

Treat media URLs as potentially sensitive.

Do not:

- Print them into public logs unnecessarily.
- Expose room records publicly.
- Include them in public metadata pages.
- Send them to unauthorized Realtime channels.

Only room participants who need playback should read them.

---

# 122. Observability

Useful metrics/logs:

## Application

- Room joins.
- Media switches.
- RPC failures.
- Realtime reconnects.
- Source failures.
- Unauthorized admin command attempts.

## Sync Debug

Optional hidden panel:

```text
Expected: 1820.233
Actual:   1820.401
Drift:    +168 ms
Clock offset: -31 ms
RTT:      42 ms
Version:  214
Player:   playing
```

This will be extremely valuable during real-world testing.

---

# 123. Supabase Realtime Monitoring

Use the Supabase dashboard Realtime reports to monitor:

- Connections.
- Broadcast volume.
- Presence traffic.
- Realtime errors.
- Throughput.

For a private group, usage should remain very small.

---

# 124. Free Project Pausing

Supabase Free projects with low activity can be paused after a low-activity period of roughly one week.

Practical consequence:

Before a planned movie night after a long period of inactivity:

- Check that the Supabase project is active.
- Restore it through the Supabase dashboard if needed.

Paid projects are the upgrade path if automatic pausing becomes inconvenient.

---

# 125. Node Runtime Recommendation

Use Node.js 22+ for the development/build environment.

This avoids compatibility problems with current Supabase JavaScript packages, whose support requirements have moved beyond older Node runtimes.

Pin package versions through the lockfile.

Commit:

```text
package-lock.json
pnpm-lock.yaml
or yarn.lock
```

depending on the chosen package manager.

---

# 126. Dependency Strategy

Core dependencies may include:

```text
next
react
react-dom
@supabase/supabase-js
@supabase/ssr or current recommended Supabase server integration
hls.js
```

Optional:

```text
zod
```

for application-level validation.

Always check current Supabase/Next.js guidance before installing or upgrading.

---

# 127. Database Migrations

All schema changes should be reproducible.

Maintain:

```text
supabase/migrations/
```

Use migrations for:

- Tables.
- Indexes.
- RLS.
- Functions.
- Triggers.
- Realtime authorization policies.

Avoid manually changing production without preserving schema history.

---

# 128. Current Supabase Platform Considerations

The implementation must account for current Supabase behavior:

1. Use publishable keys in the browser.
2. Keep secret keys server-only.
3. Do not assume new tables are automatically available through Data API.
4. Enable and test RLS for all client-accessible tables.
5. Use private Realtime channels.
6. Do not modify Supabase-managed Realtime schema objects.
7. Broadcast database changes through supported Realtime functions/triggers.
8. Use Node.js 22+ for modern Supabase JS tooling.
9. Expect Free projects to pause after extended low activity.
10. Recheck plan quotas before scaling.

---

# 129. Testing Strategy

Synchronization requires real multi-device testing.

## Unit Tests

Test:

- Expected-position calculation.
- Clock offset estimation.
- Version rejection.
- Drift thresholds.
- Player correction.
- SRT → VTT conversion.
- Queue ordering.
- Permission helper logic.

## Database Tests

Test:

- Viewer cannot call admin RPC.
- Admin can call admin RPC.
- Viewer cannot update media item.
- Viewer can read allowed room data.
- Viewer can send chat.
- Unauthorized user cannot join another room's private Realtime topic.
- Storage viewer cannot upload subtitles.
- Admin can upload/delete subtitles.

## Integration Tests

Test:

- Admin + 2 viewers.
- Play.
- Pause.
- Seek.
- Media switch.
- Late join.
- Browser refresh.
- Realtime disconnect.
- Device resume.
- HLS buffering.
- Invalid URL.

## Real Device Tests

- Chrome Windows.
- Chrome macOS.
- Firefox.
- Safari.
- iPhone Safari.
- Android Chrome.

---

# 130. Geographic Testing

Ideally test actual friends in different regions.

Important variables are:

- Network latency.
- Media-host latency.
- Browser behavior.
- Device performance.

Timezone is not the synchronization problem.

The synchronization engine uses server-relative elapsed time.

---

# 131. Network Simulation

Simulate:

```text
20 ms RTT
100 ms RTT
300 ms RTT
packet loss
temporary offline
slow HLS loading
WebSocket reconnect
```

The player should recover without requiring everyone to restart manually.

---

# 132. Critical Edge Cases

## Join While Paused

Load media → seek to paused position → remain paused.

## Join During Seek

Newest `state_version` wins.

## Viewer Reload

Fetch snapshot → rejoin live.

## Admin Reload

Database retains authoritative room state.

## Device Sleeps

Resync on wake.

## Viewer Locally Pauses

If room is playing, attempt to resume.

## Viewer Locally Seeks

Sync engine returns to live.

## Source Expires

Admin replaces URL.

## One Viewer Cannot Load Source

Show local error only.

Do not stop room.

## HLS Temporarily Stalls

Catch up afterward.

## Realtime Event Missed

Snapshot recovery fixes state.

---

# 133. MVP Development Phases

## Phase 1 — Supabase Foundation

Build:

- Supabase project.
- Auth.
- Admin account.
- Anonymous Auth.
- Tables.
- RLS.
- Room creation.
- Room join.

Goal:

Security and room identity work.

## Phase 2 — Synchronization Proof

Build:

- One room.
- One hardcoded/test media item.
- Playback state table.
- Admin RPC Play.
- Pause.
- Seek.
- state_version.
- Broadcast.
- Clock calibration.
- Drift correction.

Goal:

Three devices stay synchronized.

## Phase 3 — URL Player

Add:

- Media manager.
- MP4.
- HLS.
- Source switching.
- Media errors.

## Phase 4 — Subtitles

Add:

- SRT upload.
- Conversion to VTT.
- Storage.
- Subtitle metadata.
- Per-viewer subtitle selection.

## Phase 5 — Chat + Presence

Add:

- Nicknames.
- Presence count.
- Chat.
- Optional chat persistence.

## Phase 6 — Playlist

Add:

- Queue.
- Reorder.
- Play now.
- Next.
- Ended state.

## Phase 7 — Polish

Add:

- Responsive UI.
- Better errors.
- Debug panel.
- Room privacy hardening.
- Real cross-country testing.

---

# 134. First Technical Milestone

Do not start with polished design.

First prove:

```text
one Supabase project
one room
one test video
one admin
two viewers
```

Implement only:

```text
AUTH
JOIN
SNAPSHOT
SERVER TIME
PLAY
PAUSE
SEEK
STATE VERSION
REALTIME BROADCAST
EXPECTED POSITION
DRIFT CORRECTION
RECONNECT
```

Success condition:

Three separate browsers/devices can repeatedly:

- Play.
- Pause.
- Seek.
- Reload.
- Join late.

and automatically return to the same timeline.

Once this works, the highest-risk technical part is solved.

---

# 135. MVP Acceptance Criteria

Tonight TV MVP is complete when:

1. Admin authenticates with a permanent Supabase account.
2. Viewer can join using anonymous authentication.
3. Viewer chooses a nickname.
4. Admin adds a valid direct MP4 or HLS source.
5. At least two remote viewers load the same media.
6. Playback remains reasonably synchronized.
7. Admin Pause pauses all viewers.
8. Admin Play resumes all viewers.
9. Admin Seek moves all viewers.
10. Viewer joining late reaches the current live position.
11. Viewer reconnecting reaches the latest room state.
12. Go Live repairs significant drift.
13. Arabic subtitles can be uploaded.
14. Another subtitle language can also be uploaded.
15. Different viewers can select different subtitle tracks.
16. Chat works in real time.
17. Presence displays active viewers.
18. Playlist displays Up Next.
19. Admin can move to next media.
20. Video bytes never pass through Supabase.
21. Viewer cannot invoke admin playback mutations.
22. Unauthorized users cannot read private room data.
23. Subtitle uploads are secured.
24. Invalid media does not crash the application.

---

# 136. Explicitly Forbidden Implementation Shortcuts

Do not ship:

```text
RLS disabled
```

Do not put a Supabase secret/service key in frontend JavaScript.

Do not authorize admin based on a browser boolean.

Do not synchronize using viewer timezone.

Do not update shared currentTime every second.

Do not proxy arbitrary media URLs through a backend without a security design.

Do not upload movies to Supabase Storage for this architecture.

Do not modify Supabase-managed Realtime internals.

Do not bypass DRM or host protections.

---

# 137. Future Features

After MVP:

## Multiple Rooms

```text
/r/friends
/r/family
/r/anime-night
```

## Scheduled Programming

```text
22:00 Movie A
00:05 Episode 4
00:35 Movie B
```

## 24/7 Channel

The schedule can define the active program even when the admin browser is closed.

## Reactions

Temporary emoji reactions over the video.

## Polls

```text
What next?
Movie A
Movie B
Episode 5
```

## Persistent User Accounts

Viewers may convert anonymous accounts to permanent accounts.

## Notifications

Movie-night reminders.

## PWA

Install Tonight TV as an app-like web experience.

## Casting

Chromecast/AirPlay can be researched later; sync behavior becomes more complex.

---

# 138. Future Scheduled Channel Model

A powerful future direction is to stop storing only:

```text
current active video
```

and add:

```text
program schedule
```

Example:

```text
2026-08-17 22:00 Movie A
2026-08-18 00:10 Episode 4
```

Then the backend can determine:

```text
which program should be active
where in the program the channel should currently be
```

This creates a true private TV station.

It is not necessary for MVP.

---

# 139. Final Architecture Decisions

## Decision 1

**Next.js is the frontend application framework.**

## Decision 2

**Supabase is the primary backend platform.**

## Decision 3

**No custom WebSocket server is required for MVP.**

## Decision 4

**Postgres is the authoritative room timeline.**

## Decision 5

**Admin playback commands go through authenticated database operations/RPCs.**

## Decision 6

**The database supplies the authoritative timestamp.**

## Decision 7

**Every shared state mutation increments `state_version`.**

## Decision 8

**Supabase Realtime Broadcast distributes authoritative state changes.**

## Decision 9

**Supabase Presence tracks connected viewers.**

## Decision 10

**Anonymous Auth is used for lightweight viewer identity.**

## Decision 11

**A permanent Supabase Auth account identifies the admin.**

## Decision 12

**RLS protects all client-accessible data.**

## Decision 13

**Realtime channels are private.**

## Decision 14

**Video loads directly from the external media host.**

## Decision 15

**Supabase Storage stores subtitles, not movies.**

## Decision 16

**SRT is accepted and normalized to WebVTT.**

## Decision 17

**Subtitle selection is local per viewer.**

## Decision 18

**One viewer buffering does not pause the room.**

## Decision 19

**Late joiners automatically join live.**

## Decision 20

**Go Live is the universal manual recovery action.**

---

# 140. Final System Diagram

```text
                         TONIGHT TV
                   Next.js + React + TS
                           │
          ┌────────────────┼──────────────────┐
          │                │                  │
          ↓                ↓                  ↓
    Supabase Auth      Supabase DB      Supabase Storage
          │                │             subtitles only
          │                │
          │          playback state
          │          rooms
          │          playlist
          │          chat
          │
          └─────────── Supabase Realtime
                       Broadcast + Presence
                              │
                ┌─────────────┼─────────────┐
                ↓             ↓             ↓
             Viewer A      Viewer B      Viewer C


External Video Host
      │
      ├──────────────────────→ Viewer A
      ├──────────────────────→ Viewer B
      └──────────────────────→ Viewer C
```

---

# 141. Final Product Sentence

**Tonight TV is a private live watch-room built with Next.js and Supabase where one administrator controls a server-authoritative shared timeline, viewers stream supported video URLs directly from the original media host, and Supabase synchronizes playback, presence, chat, playlist state, authentication, and subtitles without rebroadcasting the video itself.**

---

# 142. Implementation Priority

Build in this order:

```text
1. Supabase project
2. Next.js project
3. Auth
4. Database schema
5. RLS
6. Room join
7. Playback-state RPCs
8. Realtime private channel
9. Sync engine
10. MP4
11. HLS
12. Subtitles
13. Presence
14. Chat
15. Playlist
16. UI polish
17. Cross-country testing
```

Do not reverse this order by spending significant time on visual polish before synchronization and security are proven.

---

# 143. Definition of Success

Tonight TV succeeds if a friend can open the private room from another country, click **Join Live**, and immediately watch the same moment as everyone else without asking:

> "What minute are you guys on?"

That is the product.
