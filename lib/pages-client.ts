/** What the page hands the client for each stored page. */
export type PageView = { title: string; body: string; updatedAt: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (n: number) => String(n).padStart(2, "0");

/**
 * A stored ISO timestamp as a fixed UTC string, e.g. "12 Oct 2026, 23:58 UTC".
 *
 * No local timezone and no relative wording ("2 days ago"): either would differ
 * between the server's first render and the client's, which is a hydration mismatch,
 * and a relative one would also go stale while it sits on screen.
 */
export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return (
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`
  );
}

const fold = (text: string) => text.trim().normalize("NFC").toLowerCase();

/**
 * The assistant opens every body with a "# <Title>" heading, which would repeat the
 * pane's own heading directly above it. Drops that one line, and only when it is the
 * first thing in the body, is a level-one heading, and equals the title ignoring case.
 */
export function withoutTitleHeading(body: string, title: string): string {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1) return body;

  const match = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(lines[first].trim());
  if (!match || fold(match[1]) !== fold(title)) return body;

  let next = first + 1;
  while (next < lines.length && lines[next].trim() === "") next++;
  return lines.slice(next).join("\n");
}
