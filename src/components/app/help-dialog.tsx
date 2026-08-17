"use client";

import {
  BookOpen,
  CircleHelp,
  Clapperboard,
  Compass,
  Crown,
  Eye,
  Film,
  History,
  KeyRound,
  ListMusic,
  LogIn,
  Plus,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Tv2,
  Users,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { Dialog, IconButton, cx } from "../ui/primitives";

export type HelpPageId = "welcome" | "admin" | "join" | "shortcuts" | "faq";

type HelpPage = {
  id: HelpPageId;
  title: string;
  subtitle: string;
  icon: typeof CircleHelp;
  render: () => ReactNode;
};

const PAGES: readonly HelpPage[] = [
  {
    id: "welcome",
    title: "Welcome to Tonight TV",
    subtitle: "Private, synchronized watch rooms for you and your friends.",
    icon: Sparkles,
    render: WelcomePage,
  },
  {
    id: "admin",
    title: "Owning a room",
    subtitle: "Create, share, and control your private room as the admin.",
    icon: Crown,
    render: AdminPage,
  },
  {
    id: "join",
    title: "Joining as a viewer",
    subtitle: "What to expect when a friend shares a link with you.",
    icon: Users,
    render: JoinPage,
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    subtitle: "Move through the room quickly without taking your hands off the keyboard.",
    icon: KeyRound,
    render: ShortcutsPage,
  },
  {
    id: "faq",
    title: "Common questions",
    subtitle: "Quick answers about privacy, syncing, and what to do when something feels off.",
    icon: BookOpen,
    render: FaqPage,
  },
] as const;

export type HelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage?: HelpPageId;
};

export function HelpDialog({ open, onOpenChange, initialPage = "welcome" }: HelpDialogProps) {
  const [active, setActive] = useState<HelpPageId>(initialPage);
  const [lastInitial, setLastInitial] = useState<HelpPageId>(initialPage);

  // Resync the active page only when the caller changes the requested topic
  // or opens the dialog — never on every render.
  if (open && lastInitial !== initialPage) {
    setLastInitial(initialPage);
    setActive(initialPage);
  }

  const page = PAGES.find((entry) => entry.id === active) ?? PAGES[0];
  const pageIndex = PAGES.findIndex((entry) => entry.id === page.id);
  const goPrev = useCallback(() => {
    const next = PAGES[(pageIndex - 1 + PAGES.length) % PAGES.length];
    setActive(next.id);
  }, [pageIndex]);
  const goNext = useCallback(() => {
    setActive(PAGES[(pageIndex + 1) % PAGES.length].id);
  }, [pageIndex]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tonight TV Guide"
      description="A quick walkthrough of the admin workspace, viewer experience, and shortcuts."
      className="tt-help-dialog"
    >
      <div className="tt-help-shell" role="document">
        <nav className="tt-help-nav" aria-label="Guide sections">
          {PAGES.map((entry) => {
            const Icon = entry.icon;
            const isActive = entry.id === page.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={cx("tt-help-nav-item", isActive && "tt-help-nav-item-active")}
                aria-current={isActive ? "true" : undefined}
                onClick={() => setActive(entry.id)}
              >
                <span className="tt-help-nav-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <span>
                  <strong>{entry.title}</strong>
                  <span>{entry.subtitle}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <article className="tt-help-content" key={page.id}>
          <header className="tt-help-content-head">
            <span className="tt-help-eyebrow">
              Section {pageIndex + 1} of {PAGES.length}
            </span>
            <h3>{page.title}</h3>
            <p>{page.subtitle}</p>
          </header>
          <div className="tt-help-body">{page.render()}</div>
          <footer className="tt-help-content-foot">
            <IconButton variant="ghost" label="Previous section" onClick={goPrev}>
              <Compass size={18} aria-hidden style={{ transform: "rotate(180deg)" }} />
            </IconButton>
            <div className="tt-help-progress" aria-hidden>
              {PAGES.map((entry) => (
                <span
                  key={entry.id}
                  className={cx(
                    "tt-help-progress-dot",
                    entry.id === page.id && "tt-help-progress-dot-active",
                  )}
                />
              ))}
            </div>
            {pageIndex === PAGES.length - 1 ? (
              <ButtonSmall onClick={() => onOpenChange(false)} autoFocus>
                Got it
              </ButtonSmall>
            ) : (
              <IconButton variant="primary" label="Next section" onClick={goNext}>
                <Compass size={18} aria-hidden />
              </IconButton>
            )}
          </footer>
        </article>
      </div>
    </Dialog>
  );
}

function ButtonSmall({
  children,
  onClick,
  autoFocus,
}: {
  children: ReactNode;
  onClick: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className="tt-button tt-button-primary tt-button-sm"
      onClick={onClick}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  );
}

function HelpCallout({
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
    <div className={cx("tt-help-callout", `tt-help-callout-${tone}`)}>
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

function HelpSteps({ steps }: { steps: ReadonlyArray<{ title: string; body: string }> }) {
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

function WelcomePage() {
  return (
    <>
      <p>
        Tonight TV is a private watch room. The owner creates a room, shares the
        link, and everyone inside sees and hears the same playback at the same
        moment. There are no public feeds, no algorithms, and no ads — just the
        link.
      </p>
      <HelpCallout
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
      <HelpSteps
        steps={[
          {
            title: "Sign in as the admin",
            body: "Use your admin email to land in the Your Rooms workspace.",
          },
          {
            title: "Create a room",
            body: "Give it a friendly name, then copy the share link for your friends.",
          },
          {
            title: "Watch together",
            body: "Drop a media item, press play, and enjoy the show in sync.",
          },
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
      <HelpCallout
        icon={Crown}
        tone="live"
        title="Lifecycle"
        body="A room is either Active or Deactivated. Deactivating hides it from the public preview so nobody can join with the link — you can reactivate it any time."
      />
      <HelpSteps
        steps={[
          {
            title: "Manage from the workspace",
            body: "Open the action menu on any room card to rename, share, deactivate, reactivate, or delete it.",
          },
          {
            title: "Drop media in",
            body: "Inside the room, use Add Media to paste a direct URL, a YouTube ID, or a torrent.",
          },
          {
            title: "Drive playback",
            body: "Play, pause, seek, and play next are shared with every viewer the moment you press them.",
          },
        ]}
      />
      <HelpCallout
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
        A friend shared a link? Open it, pick a nickname, and join. You don’t
        need an account to watch — Tonight TV creates a private anonymous
        identity for the session.
      </p>
      <HelpSteps
        steps={[
          {
            title: "Open the link",
            body: "The join page shows what is currently playing and the room name.",
          },
          {
            title: "Pick a nickname",
            body: "Your friends see you by this name in chat and the watcher list.",
          },
          {
            title: "Get in sync",
            body: "Tonight TV lines you up with the room timeline. Use the local volume and mute without affecting others.",
          },
        ]}
      />
      <HelpCallout
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
    { keys: "←  →", label: "Seek", detail: "Arrow keys nudge playback by five seconds, matching the room’s authoritative state." },
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
      icon: History,
    },
    {
      q: "What happens when I delete a room?",
      a: "Deleting is permanent. The room, its media, subtitles, chat history, and any membership are removed. This is irreversible, so we ask you to confirm.",
      icon: Clapperboard,
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
      icon: Film,
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

export const HelpTrigger = ({
  label = "Help",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) => (
  <IconButton variant="ghost" {...props} label={label}>
    <CircleHelp size={18} aria-hidden />
  </IconButton>
);

export type { HelpPageId as HelpTopic };

// Re-exports for convenience (unused but keeps the icon names reachable for stories).
export const _helpIcons = {
  Tv2,
  Clapperboard,
  Plus,
  Film,
  Users,
};
