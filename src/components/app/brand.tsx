import { RadioTower } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="tt-wordmark" aria-label="Tonight TV">
      <span className="tt-wordmark-mark" aria-hidden="true"><RadioTower size={compact ? 16 : 18} strokeWidth={2.4} /></span>
      <span>Tonight TV</span>
    </span>
  );
}
