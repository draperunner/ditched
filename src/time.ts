const DAY = 24 * 60 * 60 * 1000;

export function daysSince(date: Date): number {
  const diffMs = new Date().getTime() - date.getTime();
  return Math.floor(diffMs / DAY);
}
