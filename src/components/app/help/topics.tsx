"use client";

import {
  BookOpen,
  CircleHelp,
  Clapperboard,
  Crown,
  Eye,
  Film,
  Headphones,
  KeyRound,
  ListMusic,
  LogIn,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RadioTower,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Tv2,
  Users,
} from "lucide-react";
import { type ReactNode } from "react";

export type HelpTopic = "welcome" | "admin" | "join" | "shortcuts" | "faq";

export type HelpPage = {
  id: HelpTopic;
  title: string;
  subtitle: string;
  icon: typeof CircleHelp;
  render: () => ReactNode;
};

/* ---------- Shared section helpers ---------- */

function Callout({
  icon: Icon,
  title,
  body,
  tone = "accent",
}: {
  icon: typeof CircleHelp;
  title: string;
  body: ReactNode;
  tone?: "accent" | "live" | "warning" | "danger";
}) {
  return (
    <div className={`tt-help-callout tt-help-callout-${tone}`}>
      <span className="tt-help-callout-icon" aria-hidden>
        <Icon size={16} />
      </span>
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: ReadonlyArray<{ title: string; body: string }> }) {
  return (
    <ol className="tt-help-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="tt-help-step-number" aria-hidden>
            {index + 1}
          </span>
          <div>
            <strong>{step.title}</strong>
            <span>{step.body}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Page content ---------- */

function WelcomePage() {
  return (
    <>
      <p>
        Tonight TV is a private watch room. The owner creates a room, shares the
        link, and everyone inside sees and hears the same playback at the same
        moment. There are no public feeds, no algorithms, and no ads — just the
        link.
      </p>
      <Callout
        icon={Sparkles}
        tone="accent"
        title="Three things to remember"
        body={
          <ul>
            <li>Rooms are private — only people with the link can join.</li>
            <li>Playback is synchronized — pause, play, or seek and everyone follows.</li>
            <li>Subtitles and chat stay inside the room and disappear when it ends.</li>
          </ul>
        }
      />
      <Steps
        steps={[
          { title: "Sign in as the admin", body: "Use your admin email to land in the Your Rooms workspace." },
          { title: "Create a room", body: "Give it a friendly name, then copy the share link for your friends." },
          { title: "Watch together", body: "Drop a media item, press play, and enjoy the show in sync." },
        ]}
      />
    </>
  );
}

function AdminPage() {
  return (
    <>
      <p>
        As the admin you control the room. The Your Rooms workspace is where you
        keep track of every room you own and decide which one is open tonight.
      </p>
      <Callout
        icon={Crown}
        tone="live"
        title="Lifecycle"
        body="A room is either Active or Deactivated. Deactivating hides it from the public preview so nobody can join with the link — you can reactivate it any time."
      />
      <Steps
        steps={[
          { title: "Manage from the workspace", body: "Open the action menu on any room card to rename, share, deactivate, reactivate, or delete it." },
          { title: "Drop media in", body: "Inside the room, use Add Media to paste a direct URL, a YouTube ID, or a torrent." },
          { title: "Drive playback", body: "Play, pause, seek, and play next are shared with every viewer the moment you press them." },
        ]}
      />
      <Callout
        icon={ShieldCheck}
        tone="warning"
        title="Private by design"
        body="Only people who received the link can join. We never share or recommend rooms."
      />
    </>
  );
}

function JoinPage() {
  return (
    <>
      <p>
        A friend shared a link? Open it, pick a nickname, and join. You don&rsquo;t
        need an account to watch — Tonight TV creates a private anonymous
        identity for the session.
      </p>
      <Steps
        steps={[
          { title: "Open the link", body: "The join page shows what is currently playing and the room name." },
          { title: "Pick a nickname", body: "Your friends see you by this name in chat and the watcher list." },
          { title: "Get in sync", body: "Tonight TV lines you up with the room timeline. Use the local volume and mute without affecting others." },
        ]}
      />
      <Callout
        icon={Eye}
        tone="accent"
        title="Privacy reminder"
        body="Nicknames stay in the room. Account info never leaves your device."
      />
    </>
  );
}

function ShortcutsPage() {
  const items: ReadonlyArray<{ keys: string; label: string; detail: string }> = [
    { keys: "Space", label: "Play / pause", detail: "Admins control the shared timeline; viewers see the same shortcut for local-only playback." },
    { keys: "←  →", label: "Seek", detail: "Arrow keys nudge playback by five seconds, matching the room's authoritative state." },
    { keys: "M", label: "Mute yourself", detail: "Only your local audio is muted. The room keeps playing." },
    { keys: "↑  ↓", label: "Volume", detail: "Adjust your local volume without touching the room." },
    { keys: "F", label: "Fullscreen", detail: "Toggles browser fullscreen on the video stage." },
    { keys: "?", label: "Open this guide", detail: "Available on every page of the workspace." },
    { keys: "Esc", label: "Close dialogs", detail: "Closes any open dialog, menu, or modal in the workspace." },
  ];
  return (
    <ul className="tt-help-shortcuts">
      {items.map((item) => (
        <li key={item.label}>
          <kbd>{item.keys}</kbd>
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FaqPage() {
  const items: ReadonlyArray<{ q: string; a: ReactNode; icon: typeof CircleHelp }> = [
    {
      q: "Why is playback lagging behind the room?",
      a: "A small lag (under a second) is normal while everyone stabilizes. If the gap grows beyond a few seconds, the room is reconnecting — your screen will resync on its own.",
      icon: RadioTower,
    },
    {
      q: "Can I reactivate a room I deactivated?",
      a: "Yes. The action menu on each room card lets you deactivate and reactivate at any time. Deactivated rooms are hidden from the public preview but stay in your workspace.",
      icon: PauseCircle,
    },
    {
      q: "What happens when I delete a room?",
      a: "Deleting is permanent. The room, its media, subtitles, chat history, and any membership are removed. This is irreversible, so we ask you to confirm.",
      icon: ShieldOff,
    },
    {
      q: "Do viewers need an account?",
      a: "No. Viewers get an anonymous identity tied to the room session. They only need a nickname and the link you shared.",
      icon: LogIn,
    },
    {
      q: "Can I queue multiple shows?",
      a: "Yes. Use the Up Next panel to add as many items as you like. Use the move, play-now, and delete actions to keep the queue tidy.",
      icon: ListMusic,
    },
    {
      q: "What about subtitles?",
      a: "Subtitles are private to the room. Owners can upload SRT or VTT files; viewers can opt in to whichever track they prefer.",
      icon: Headphones,
    },
    {
      q: "What if the video won't play?",
      a: "Tonight TV surfaces the specific reason (autoplay permission, expired URL, DRM, etc.). Replace the source and try again, or pick a different file.",
      icon: Clapperboard,
    },
    {
      q: "How is the room timeline kept in sync?",
      a: "Every command (play, pause, seek, select) goes through a single versioned state in the database. Viewers drift toward the latest version with sub-second corrections.",
      icon: PlayCircle,
    },
    {
      q: "What if a viewer drops out and rejoins?",
      a: "They will be re-synced to the current room state on rejoin. Chat history they can see is loaded up to the most recent 100 messages.",
      icon: MessageSquare,
    },
    {
      q: "What about movies, shows, and clips?",
      a: "Tonight TV is source-agnostic. Drop in a direct MP4/HLS URL, a YouTube Video ID, or a torrent and the room plays it.",
      icon: Film,
    },
    {
      q: "Why is the link the only invite?",
      a: "There are no usernames, no friend graphs, no invites. If you have the link you can join — the room is yours to share or not.",
      icon: Users,
    },
    {
      q: "Does the room owner see everything?",
      a: "Owners see chat and presence. Subtitle tracks are private to the uploader and whichever viewers opt in to load them.",
      icon: Tv2,
    },
  ];
  return (
    <div className="tt-help-faq">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <details key={item.q}>
            <summary>
              <span className="tt-help-faq-icon" aria-hidden>
                <Icon size={15} />
              </span>
              <span>{item.q}</span>
            </summary>
            <p>{item.a}</p>
          </details>
        );
      })}
    </div>
  );
}

/* ---------- Registry ---------- */

export const HELP_PAGES: readonly HelpPage[] = [
  { id: "welcome", title: "Welcome to Tonight TV", subtitle: "Private, synchronized watch rooms for you and your friends.", icon: Sparkles, render: WelcomePage },
  { id: "admin", title: "Owning a room", subtitle: "Create, share, and control your private room as the admin.", icon: Crown, render: AdminPage },
  { id: "join", title: "Joining as a viewer", subtitle: "What to expect when a friend shares a link with you.", icon: Users, render: JoinPage },
  { id: "shortcuts", title: "Keyboard shortcuts", subtitle: "Move through the room quickly without taking your hands off the keyboard.", icon: KeyRound, render: ShortcutsPage },
  { id: "faq", title: "Common questions", subtitle: "Quick answers about privacy, syncing, and what to do when something feels off.", icon: BookOpen, render: FaqPage },
] as const;

export const DEFAULT_HELP_TOPIC: HelpTopic = "welcome";
