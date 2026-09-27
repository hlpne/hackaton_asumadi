import assert from "node:assert/strict";
import test from "node:test";
import { forecastPeriod, modelDate, modelPeriodRequest, periodRequest, snapshotTimestamp } from "../src/forecastPeriod.ts";

test("model dates extend through 2027 and use hourly route data", () => {
  assert.equal(modelDate("2026-09-27", "day"), "2026-09-27");
  assert.equal(modelDate("2028-01-01", "day"), "2027-12-31");
  assert.equal(modelDate("2027-12-31", "month"), "2027-12-02");
  assert.deepEqual(modelPeriodRequest("2025-12-31", "day"), {
    from: "2025-12-31T00:00:00+03:00",
    to: "2026-01-01T00:00:00+03:00",
    resolution: "PT1H",
  });
  assert.deepEqual(modelPeriodRequest("2025-12-01", "month"), {
    from: "2025-12-01T00:00:00+03:00",
    to: "2026-01-01T00:00:00+03:00",
    resolution: "P1D",
  });
});

test("month selected on the first uses calendar boundaries", () => {
  assert.deepEqual(forecastPeriod("2026-09-01", "month"), {
    start: "2026-09-01",
    end: "2026-10-01",
    resolution: "P1D",
    description: "Календарный месяц — с 1-го числа до начала следующего месяца",
  });
});
test("month selected in the middle uses exactly thirty days", () => {
  const period = forecastPeriod("2026-09-26", "month");
  assert.equal(period.start, "2026-09-26");
  assert.equal(period.end, "2026-10-26");
  assert.equal(period.resolution, "P1D");
});

test("month selected at the end of January still uses thirty days", () => {
  const period = forecastPeriod("2026-01-31", "month");
  assert.equal(period.start, "2026-01-31");
  assert.equal(period.end, "2026-03-02");
});

test("year selected in the middle uses 365 days from the selected date", () => {
  const period = forecastPeriod("2026-09-26", "year");
  assert.equal(period.start, "2026-09-26");
  assert.equal(period.end, "2027-09-26");
  assert.equal(period.resolution, "P1M");
});

test("year selected on January 1 uses calendar boundaries, including leap years", () => {
  const period = forecastPeriod("2028-01-01", "year");
  assert.equal(period.start, "2028-01-01");
  assert.equal(period.end, "2029-01-01");
  assert.equal(period.resolution, "P1M");
});

test("API timestamps preserve Moscow offset and a stable day snapshot", () => {
  assert.equal(snapshotTimestamp("2026-09-26", "day"), "2026-09-26T12:00:00+03:00");
  assert.deepEqual(periodRequest("2026-09-26", "day"), {
    from: "2026-09-26T00:00:00+03:00",
    to: "2026-09-27T00:00:00+03:00",
    resolution: "schedule",
  });
});
