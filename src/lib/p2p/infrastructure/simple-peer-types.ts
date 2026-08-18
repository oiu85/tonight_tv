export interface SimplePeerLike {
  id?: string;
  readonly connected?: boolean;
  readonly destroyed?: boolean;
  signal: (data: unknown) => void;
  destroy: () => void;
  on(event: "signal", listener: (data: unknown) => void): this;
  on(event: "connect" | "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export type SimplePeerConstructor = new (
  options?: Readonly<{
    initiator?: boolean;
    trickle?: boolean;
    config?: RTCConfiguration;
  }>,
) => SimplePeerLike;
