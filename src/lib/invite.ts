/**
 * Invites, and the names an invite needs to be able to say anything.
 *
 * `design/Trips.dc.html` writes the pending invite as two lines — *Mika
 * invited you to Korea* over *Mar 2026* — and `design/Members.dc.html` puts
 * real people in a list with real initials on them. Both sentences are built
 * here rather than in the client, for the same reason PLAN.md section 8 builds
 * the Move to day reasons on the server: the browser should render a sentence,
 * not compose one.
 */

/** The random half of an invite link. */
export function inviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Where the link points. The origin comes from the request, not a constant. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/i/${token}`;
}

/**
 * `Mika Tanaka` -> `Mika`. The invite banner uses a first name, because
 * *Mika invited you to Korea* is how someone would say it out loud.
 */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** `Mika invited you to Korea`, exactly as `design/Trips.dc.html` writes it. */
export function inviteSentence(from: string, tripName: string): string {
  const who = firstName(from);
  return who ? `${who} invited you to ${tripName}` : `You have been invited to ${tripName}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `Mar 2026`, the line under the invite.
 *
 * The card is an invitation rather than an itinerary, so it says roughly when
 * rather than which days — the exact range is on the trip once you are in it.
 * A trip that straddles two months says both, because *Mar 2026* for a trip
 * that is mostly in April would be wrong rather than merely vague.
 */
export function monthLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const startMonth = MONTHS[start.getUTCMonth()] as string;
  const endMonth = MONTHS[end.getUTCMonth()] as string;
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (startYear !== endYear) return `${startMonth} ${startYear} – ${endMonth} ${endYear}`;
  if (startMonth !== endMonth) return `${startMonth} – ${endMonth} ${endYear}`;
  return `${startMonth} ${startYear}`;
}

/**
 * The grey line under a person on the People screen.
 *
 * `design/Members.dc.html` writes it as `added 9 places` for everyone but you,
 * and shows your own email under your own name. Better Auth knows the email
 * now, so the artboard gets both halves as drawn: your row says which account
 * you are signed in as, and everyone else's counts what they have added. A
 * person who has added nothing yet says so rather than saying `0`, because
 * "added 0 places" reads as a scoreboard.
 */
export function contributionLine(places: number): string {
  if (places === 0) return "nothing added yet";
  return `added ${places} ${places === 1 ? "place" : "places"}`;
}

/** `2 days ago`, for the line under a live invite link. */
export function agoLabel(createdAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - createdAt) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}
