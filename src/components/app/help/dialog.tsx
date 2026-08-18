"use client";

import { Compass, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, Dialog } from "@/components/primitives";
import { cx } from "@/components/primitives/cx";
import { DEFAULT_HELP_TOPIC, HELP_PAGES, type HelpTopic } from "./topics";

/**
 * Interactive guide for the entire app. Pages are registered in
 * `topics.tsx`; this component just renders the nav + content switcher and
 * exposes a clean close callback.
 */
export function HelpDialog({
  open,
  onOpenChange,
  initialPage = DEFAULT_HELP_TOPIC,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage?: HelpTopic;
}) {
  const [active, setActive] = useState<HelpTopic>(initialPage);
  const [lastInitial, setLastInitial] = useState<HelpTopic>(initialPage);

  // Resync the active page when the caller changes the requested topic, but
  // never on every render — we want this to feel like a fresh page open.
  if (open && lastInitial !== initialPage) {
    setLastInitial(initialPage);
    setActive(initialPage);
  }

  const page = HELP_PAGES.find((entry) => entry.id === active) ?? HELP_PAGES[0];
  const pageIndex = HELP_PAGES.findIndex((entry) => entry.id === page.id);

  const goPrev = useCallback(() => {
    const next = HELP_PAGES[(pageIndex - 1 + HELP_PAGES.length) % HELP_PAGES.length];
    setActive(next.id);
  }, [pageIndex]);

  const goNext = useCallback(() => {
    setActive(HELP_PAGES[(pageIndex + 1) % HELP_PAGES.length].id);
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
          {HELP_PAGES.map((entry) => {
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
              Section {pageIndex + 1} of {HELP_PAGES.length}
            </span>
            <h3>{page.title}</h3>
            <p>{page.subtitle}</p>
          </header>

          <div className="tt-help-body">{page.render()}</div>

          <footer className="tt-help-content-foot">
            <Button
              variant="ghost"
              size="sm"
              label="Previous section"
              onClick={goPrev}
            >
              <Compass size={17} aria-hidden style={{ transform: "rotate(180deg)" }} />
            </Button>

            <div className="tt-help-progress" aria-hidden>
              {HELP_PAGES.map((entry) => (
                <span
                  key={entry.id}
                  className={cx(
                    "tt-help-progress-dot",
                    entry.id === page.id && "tt-help-progress-dot-active",
                  )}
                />
              ))}
            </div>

            {pageIndex === HELP_PAGES.length - 1 ? (
              <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
                Got it
              </Button>
            ) : (
              <Button variant="primary" size="sm" label="Next section" onClick={goNext}>
                <Compass size={17} aria-hidden />
              </Button>
            )}
          </footer>
        </article>
      </div>

      <span className="tt-visually-hidden" aria-hidden>
        <X size={0} />
      </span>
    </Dialog>
  );
}
