"use client";

import { Skeleton, SkeletonCircle } from "@/components/primitives";

/**
 * Loading placeholder for the rooms grid. Mirrors the room card layout so
 * the grid doesn't jump when the data lands.
 */
export function AdminSkeleton() {
  return (
    <div className="tt-room-grid" aria-busy="true" aria-live="polite">
      {[0, 1, 2, 3].map((index) => (
        <div className="tt-room-card" key={index} aria-hidden>
          <div className="tt-room-card-head">
            <SkeletonCircle size={56} />
            <div style={{ display: "grid", gap: 8, flex: 1 }}>
              <Skeleton className="tt-skeleton-line" />
              <Skeleton className="tt-skeleton-line short" />
            </div>
            <Skeleton style={{ width: 36, height: 36, borderRadius: 10 }} />
          </div>
          <Skeleton style={{ height: 12, width: "60%", borderRadius: 6 }} />
          <Skeleton style={{ height: 12, width: "30%", borderRadius: 6, marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
