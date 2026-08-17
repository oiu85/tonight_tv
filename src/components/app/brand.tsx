import { RadioTower } from "lucide-react";

export function Brand({
  compact = false,
  size = "md",
}: {
  compact?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const markClass = [
    "tt-wordmark-mark",
    size === "lg" && "tt-mark-lg",
    size === "xl" && "tt-mark-xl",
  ]
    .filter(Boolean)
    .join(" ");
  const iconSize = size === "xl" ? 84 : size === "lg" ? 64 : compact ? 16 : 18;
  const stroke = size === "xl" || size === "lg" ? 1.7 : 2.4;
  return (
    <span className="tt-wordmark" aria-label="Tonight TV">
      <span
        className={markClass}
        style={size === "xl" || size === "lg" ? { background: "var(--tt-accent)", color: "var(--tt-accent-fg)", boxShadow: "0 0 0 1px var(--tt-accent-soft), 0 0 60px var(--tt-accent-glow)" } : undefined}
        aria-hidden="true"
      >
        <RadioTower size={iconSize} strokeWidth={stroke} />
      </span>
      <span className="tt-wordmark-text">Tonight TV</span>
    </span>
  );
}
