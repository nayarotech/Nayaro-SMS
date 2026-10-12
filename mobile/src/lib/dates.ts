/** Today's date in Nepal (UTC+5:45) as YYYY-MM-DD, whatever the phone's time zone. */
export function todayInNepal(): string {
  return new Date(Date.now() + (5 * 60 + 45) * 60_000).toISOString().slice(0, 10);
}
