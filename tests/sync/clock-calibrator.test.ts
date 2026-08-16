import { describe, expect, it, vi } from "vitest";

import {
  createClockCalibrator,
  type LocalClock,
} from "../../src/lib/sync/clock-calibrator";

function createFakeClock(startWallMs = Date.parse("2026-08-17T12:00:00.000Z")) {
  let wallMs = startWallMs;
  let monotonicMs = 0;
  const clock: LocalClock = {
    wallNowMs: () => wallMs,
    monotonicNowMs: () => monotonicMs,
  };

  return {
    clock,
    advance(milliseconds: number) {
      wallMs += milliseconds;
      monotonicMs += milliseconds;
    },
    jumpWall(milliseconds: number) {
      wallMs += milliseconds;
    },
    wallNow: () => wallMs,
  };
}

describe("server clock calibration", () => {
  it("calculates offset from the local request midpoint", async () => {
    const fake = createFakeClock();
    const sampler = vi.fn(async () => {
      const serverAtMidpoint = fake.wallNow() + 50 + 2_000;
      fake.advance(100);
      return new Date(serverAtMidpoint).toISOString();
    });
    const calibrator = createClockCalibrator(sampler, fake.clock, {
      sampleCount: 1,
    });

    const result = await calibrator.calibrate();

    expect(result.roundTripTimeMs).toBe(100);
    expect(result.offsetMs).toBe(2_000);
    expect(result.quality).toBe("excellent");
    expect(calibrator.estimatedServerNowMs()).toBe(fake.wallNow() + 2_000);
  });

  it("deprioritizes noisy high-RTT samples", async () => {
    const fake = createFakeClock();
    const samples = [
      { rtt: 20, offset: 1_000 },
      { rtt: 900, offset: 8_000 },
      { rtt: 30, offset: 1_010 },
      { rtt: 26, offset: 1_005 },
      { rtt: 700, offset: -4_000 },
    ];
    let index = 0;
    const calibrator = createClockCalibrator(
      async () => {
        const sample = samples[index++];
        const serverAtMidpoint =
          fake.wallNow() + sample.rtt / 2 + sample.offset;
        fake.advance(sample.rtt);
        return new Date(serverAtMidpoint).toISOString();
      },
      fake.clock,
      { sampleCount: samples.length, acceptedSampleFraction: 0.6 },
    );

    const result = await calibrator.calibrate();

    expect(result.offsetMs).toBe(1_005);
    expect(result.roundTripTimeMs).toBe(26);
    expect(result.samples).toHaveLength(5);
  });

  it("uses monotonic elapsed time and replaces stale sample sets on recalibration", async () => {
    const fake = createFakeClock();
    let offset = 500;
    const calibrator = createClockCalibrator(
      async () => {
        const serverAtMidpoint = fake.wallNow() + 5 + offset;
        fake.advance(10);
        return new Date(serverAtMidpoint).toISOString();
      },
      fake.clock,
      { sampleCount: 1, staleAfterMs: 1_000 },
    );

    await calibrator.calibrate();
    fake.jumpWall(60_000);
    fake.advance(1_001);
    expect(calibrator.isCalibrationStale()).toBe(true);

    offset = 2_000;
    const replacement = await calibrator.calibrate();

    expect(replacement.offsetMs).toBe(2_000);
    expect(replacement.samples).toHaveLength(1);
    expect(calibrator.getCalibrationAgeMs()).toBe(0);
    expect(calibrator.isCalibrationStale()).toBe(false);
  });
});
