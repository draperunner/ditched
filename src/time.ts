export function differenceInMilliseconds(dateA: Date, dateB: Date): number {
  return dateA.getTime() - dateB.getTime();
}

function getTimeStringIfBelowThreshold(
  diffInMs: number,
  threshold: number,
  divisor: number,
  unit: string
): string | undefined {
  if (diffInMs >= threshold) return;

  const quotient = Math.floor(diffInMs / divisor);
  const plural = quotient > 1;
  return `${quotient} ${unit}${plural ? "s" : ""}`;
}

function formatLocalDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatTimeSince(date: Date): string {
  const diffMs = differenceInMilliseconds(new Date(), date);

  if (diffMs <= MINUTE) {
    return "Just now";
  }

  const timeDiffString =
    getTimeStringIfBelowThreshold(diffMs, HOUR, MINUTE, "minute") ||
    getTimeStringIfBelowThreshold(diffMs, DAY, HOUR, "hour") ||
    getTimeStringIfBelowThreshold(diffMs, WEEK, DAY, "day") ||
    getTimeStringIfBelowThreshold(diffMs, MONTH, WEEK, "week") ||
    getTimeStringIfBelowThreshold(diffMs, YEAR, MONTH, "month") ||
    `More than ${getTimeStringIfBelowThreshold(
      diffMs,
      Infinity,
      YEAR,
      "year"
    )}`;

  return `${timeDiffString} ago (${formatLocalDate(date)})`;
}
