import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HelpDialog } from "../../src/components/app/help-dialog";
import { ToastProvider, TooltipProvider } from "../../src/components/ui/primitives";

function renderHelp(initialPage: Parameters<typeof HelpDialog>[0]["initialPage"] = "welcome"): string {
  return renderToStaticMarkup(
    <ToastProvider>
      <TooltipProvider>
        <HelpDialog open onOpenChange={() => undefined} initialPage={initialPage} />
      </TooltipProvider>
    </ToastProvider>,
  );
}

describe("HelpDialog", () => {
  it("renders the welcome page with the section navigation", () => {
    const markup = renderHelp();
    expect(markup).toContain("Welcome to Tonight TV");
    expect(markup).toContain("Owning a room");
    expect(markup).toContain("Joining as a viewer");
    expect(markup).toContain("Keyboard shortcuts");
    expect(markup).toContain("Common questions");
  });

  it("highlights the active section in the navigation", () => {
    const markup = renderHelp("admin");
    expect(markup).toContain("Section 2 of");
    expect(markup).toContain("Lifecycle");
  });

  it("renders keyboard shortcuts on the shortcuts page", () => {
    const markup = renderHelp("shortcuts");
    expect(markup).toContain("Play / pause");
    expect(markup).toContain("Fullscreen");
  });

  it("renders FAQ items on the FAQ page", () => {
    const markup = renderHelp("faq");
    expect(markup).toContain("Why is playback lagging behind the room?");
    expect(markup).toContain("Can I reactivate a room I deactivated?");
  });
});
