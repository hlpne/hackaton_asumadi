import type { Horizon } from "./types";

export const horizons: Record<Horizon, string> = {
  day: "1 день",
  month: "1 месяц",
  year: "1 год",
};

export const resolutions: Record<string, string> = {
  PT1M: "1 минута",
  PT1H: "1 час",
  P1D: "1 день",
  P1M: "1 месяц",
};

export const snapshotPeriod: Record<Horizon, string> = {
  day: "на выбранное время",
  month: "за первый день выбранного месяца",
  year: "за первый месяц выбранного года",
};
