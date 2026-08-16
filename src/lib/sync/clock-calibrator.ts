import type { RoomService } from "../rooms/room-service";

export type LocalClock = Readonly<{
  wallNowMs: () => number;
  monotonicNowMs: () => number;
}>;

export type ClockSample = Readonly<{
  requestStartedWallMs: number;
  serverTimeMs: number;
  roundTripTimeMs: number;
  offsetMs: number;
}>;

export type CalibrationQuality = "excellent" | "good" | "poor";

export type ClockCalibration = Readonly<{
  offsetMs: number;
  roundTripTimeMs: number;
  calibratedAtWallMs: number;
  calibratedAtMonotonicMs: number;
  estimatedServerAtCalibrationMs: number;
  quality: CalibrationQuality;
  samples: readonly ClockSample[];
}>;

export type ClockCalibratorOptions = Readonly<{
  sampleCount?: number;
  acceptedSampleFraction?: number;
  maximumAcceptedRttMs?: number;
  staleAfterMs?: number;
}>;

export type ClockCalibrator = Readonly<{
  calibrate: () => Promise<ClockCalibration>;
  estimatedServerNowMs: () => number;
  getCalibration: () => ClockCalibration | null;
  getCalibrationAgeMs: () => number | null;
  isCalibrationStale: () => boolean;
}>;

const DEFAULT_OPTIONS = Object.freeze({
  sampleCount: 5,
  acceptedSampleFraction: 0.6,
  maximumAcceptedRttMs: 1_500,
  staleAfterMs: 5 * 60 * 1_000,
});

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calibrationQuality(roundTripTimeMs: number): CalibrationQuality {
  if (roundTripTimeMs <= 150) {
    return "excellent";
  }

  return roundTripTimeMs <= 500 ? "good" : "poor";
}

export function createSystemClock(): LocalClock {
  return Object.freeze({
    wallNowMs: () => Date.now(),
    monotonicNowMs: () =>
      typeof performance === "undefined" ? Date.now() : performance.now(),
  });
}

export function createClockCalibrator(
  sampleServerTime: () => Promise<string>,
  clock: LocalClock = createSystemClock(),
  options: ClockCalibratorOptions = {},
): ClockCalibrator {
  const config = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isSafeInteger(config.sampleCount) || config.sampleCount < 1) {
    throw new Error("Clock calibration sample count must be a positive integer.");
  }

  if (
    !Number.isFinite(config.acceptedSampleFraction) ||
    config.acceptedSampleFraction <= 0 ||
    config.acceptedSampleFraction > 1
  ) {
    throw new Error("Accepted clock sample fraction must be in the range (0, 1].");
  }

  if (
    !Number.isFinite(config.maximumAcceptedRttMs) ||
    config.maximumAcceptedRttMs <= 0 ||
    !Number.isFinite(config.staleAfterMs) ||
    config.staleAfterMs <= 0
  ) {
    throw new Error("Clock latency and staleness limits must be positive.");
  }

  let calibration: ClockCalibration | null = null;
  let pendingCalibration: Promise<ClockCalibration> | null = null;

  async function takeSample(): Promise<ClockSample> {
    const requestStartedWallMs = clock.wallNowMs();
    const requestStartedMonotonicMs = clock.monotonicNowMs();
    const serverTimestamp = await sampleServerTime();
    const requestFinishedMonotonicMs = clock.monotonicNowMs();
    const roundTripTimeMs = Math.max(
      0,
      requestFinishedMonotonicMs - requestStartedMonotonicMs,
    );
    const serverTimeMs = Date.parse(serverTimestamp);

    if (!Number.isFinite(serverTimeMs)) {
      throw new Error("The server clock sample was not a valid timestamp.");
    }

    const localMidpointMs = requestStartedWallMs + roundTripTimeMs / 2;
    return Object.freeze({
      requestStartedWallMs,
      serverTimeMs,
      roundTripTimeMs,
      offsetMs: serverTimeMs - localMidpointMs,
    });
  }

  async function runCalibration(): Promise<ClockCalibration> {
    const samples: ClockSample[] = [];
    for (let index = 0; index < config.sampleCount; index += 1) {
      samples.push(await takeSample());
    }

    const ranked = [...samples].sort(
      (left, right) => left.roundTripTimeMs - right.roundTripTimeMs,
    );
    const desiredCount = Math.max(
      1,
      Math.ceil(ranked.length * config.acceptedSampleFraction),
    );
    const belowLatencyLimit = ranked.filter(
      (sample) => sample.roundTripTimeMs <= config.maximumAcceptedRttMs,
    );
    const accepted = (belowLatencyLimit.length > 0 ? belowLatencyLimit : ranked).slice(
      0,
      desiredCount,
    );
    const offsetMs = median(accepted.map((sample) => sample.offsetMs));
    const roundTripTimeMs = median(
      accepted.map((sample) => sample.roundTripTimeMs),
    );
    const calibratedAtWallMs = clock.wallNowMs();
    const calibratedAtMonotonicMs = clock.monotonicNowMs();

    calibration = Object.freeze({
      offsetMs,
      roundTripTimeMs,
      calibratedAtWallMs,
      calibratedAtMonotonicMs,
      estimatedServerAtCalibrationMs: calibratedAtWallMs + offsetMs,
      quality: calibrationQuality(roundTripTimeMs),
      samples: Object.freeze(samples),
    });
    return calibration;
  }

  function calibrate(): Promise<ClockCalibration> {
    pendingCalibration ??= runCalibration().finally(() => {
      pendingCalibration = null;
    });
    return pendingCalibration;
  }

  function estimatedServerNowMs(): number {
    if (!calibration) {
      throw new Error("The server clock has not been calibrated.");
    }

    const elapsedMs = Math.max(
      0,
      clock.monotonicNowMs() - calibration.calibratedAtMonotonicMs,
    );
    return calibration.estimatedServerAtCalibrationMs + elapsedMs;
  }

  function getCalibrationAgeMs(): number | null {
    if (!calibration) {
      return null;
    }

    return Math.max(
      0,
      clock.monotonicNowMs() - calibration.calibratedAtMonotonicMs,
    );
  }

  return Object.freeze({
    calibrate,
    estimatedServerNowMs,
    getCalibration: () => calibration,
    getCalibrationAgeMs,
    isCalibrationStale: () => {
      const ageMs = getCalibrationAgeMs();
      return (
        ageMs === null ||
        ageMs >= config.staleAfterMs ||
        calibration?.quality === "poor"
      );
    },
  });
}

export function createRoomClockCalibrator(
  roomService: Pick<RoomService, "sampleServerTime">,
  options?: ClockCalibratorOptions,
): ClockCalibrator {
  return createClockCalibrator(
    () => roomService.sampleServerTime(),
    createSystemClock(),
    options,
  );
}
