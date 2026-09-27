import type { Horizon } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface ForecastPeriod {
  start: string;
  end: string;
  resolution: "schedule" | "P1D" | "P1M";
  description: string;
}

/**
 * Builds an exclusive API range from the date selected in the UI.
 * A month selected on its first day means the calendar month; otherwise it
 * spans 30 days. A year selected on January 1 means the calendar year;
 * otherwise it spans 365 days, including the selected date.
 */
export function forecastPeriod(date: string, horizon: Horizon): ForecastPeriod {
  const selected = parseUtcDate(date);
  if (horizon === "day") {
    const end = new Date(selected.getTime() + DAY_MS);
    return {
      start: dateKey(selected),
      end: dateKey(end),
      resolution: "schedule",
      description: "Полные сутки по московскому времени",
    };
  }

  if (horizon === "month") {
    const calendarMonth = selected.getUTCDate() === 1;
    const end = calendarMonth
      ? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 1))
      : new Date(selected.getTime() + 30 * DAY_MS);
    return {
      start: dateKey(selected),
      end: dateKey(end),
      resolution: "P1D",
      description: calendarMonth
        ? "Календарный месяц — с 1-го числа до начала следующего месяца"
        : "30 дней вперёд, включая выбранную дату",
    };
  }

  const calendarYear = selected.getUTCMonth() === 0 && selected.getUTCDate() === 1;
  const end = calendarYear
    ? new Date(Date.UTC(selected.getUTCFullYear() + 1, 0, 1))
    : new Date(selected.getTime() + 365 * DAY_MS);
  return {
    start: dateKey(selected),
    end: dateKey(end),
    resolution: "P1M",
    description: calendarYear
      ? "Календарный год — с 1 января до начала следующего года"
      : "365 дней вперёд, включая выбранную дату",
  };
}

export function moscowTimestamp(date: string): string {
  return `${date}T00:00:00+03:00`;
}

export function periodRequest(date: string, horizon: Horizon) {
  const period = forecastPeriod(date, horizon);
  return {
    from: moscowTimestamp(period.start),
    to: moscowTimestamp(period.end),
    resolution: period.resolution,
  };
}

export function snapshotTimestamp(date: string, horizon: Horizon): string {
  const period = forecastPeriod(date, horizon);
  if (horizon === "day") return `${period.start}T12:00:00+03:00`;
  return moscowTimestamp(period.start);
}
