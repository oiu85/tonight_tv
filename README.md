# Tonight TV

Tonight TV is a private synchronized watch-room built with Next.js and Supabase.

## Development foundation

- Use Node.js 22 or newer.
- Copy `.env.example` to `.env.local` and set the Supabase project URL and
  browser-safe publishable key.
- Enable Anonymous Sign-Ins in the Supabase project's Auth settings before
  exercising the viewer identity flow.
- In the hosted project's Realtime settings, disable **Allow public access**.
  Tonight TV room clients always subscribe to private `room:<room_uuid>`
  channels authorized by `realtime.messages` RLS.
- Run `npm install`, then `npm run dev`.

Only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are required for this milestone. Never
place a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable.

## Local Supabase database

The canonical database source is the ordered SQL in `supabase/migrations`.
Docker Desktop must be running for the local database commands.

- `npm run db:start` starts the local core Supabase services.
- `npm run db:reset` recreates the database and replays every migration.
- `npm run db:test` runs the transactional pgTAP schema tests.
- `npm run db:lint` checks the migrated `public` schema for SQL errors.
- `npm run db:types` regenerates `src/lib/supabase/database.types.ts` from the
  migrated local schema.
- `npm run db:stop` stops this project's local services.

Do not edit the generated database type file by hand. Regenerate it after every
schema migration and commit the result with that migration.
