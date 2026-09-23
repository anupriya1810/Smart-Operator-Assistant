/**
 * Timezone conversion utilities:
 * Ensures all timestamps sent to backend are UTC ISO strings.
 * All displays convert from UTC to the user's local/selected timezone at render time.
 */

export function formatUtcToLocal(utcIsoString: string | null | undefined, timezone?: string): string {
  if (!utcIsoString) return '--:--';
  try {
    const date = new Date(utcIsoString);
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(date);
  } catch (e) {
    return utcIsoString;
  }
}

export function formatUtcTimeOnly(utcIsoString: string | null | undefined, timezone?: string): string {
  if (!utcIsoString) return '--:--';
  try {
    const date = new Date(utcIsoString);
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return utcIsoString;
  }
}

export function localInputToUtcIso(localDateTimeStr: string): string {
  if (!localDateTimeStr) return new Date().toISOString();
  const date = new Date(localDateTimeStr);
  return date.toISOString();
}
