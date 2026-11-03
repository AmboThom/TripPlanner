import { describe, expect, test } from "vitest";
import { formatUpdated, withoutTitleHeading } from "./pages-client";

describe("formatUpdated", () => {
  test("renders a fixed UTC string", () => {
    expect(formatUpdated("2026-10-12T23:58:11.357Z")).toBe("12 Oct 2026, 23:58 UTC");
  });

  test("pads the hour and minute, and does not pad the day", () => {
    expect(formatUpdated("2026-01-05T03:07:00.000Z")).toBe("5 Jan 2026, 03:07 UTC");
  });

  test("is independent of the machine's timezone", () => {
    const before = process.env.TZ;
    try {
      const results = ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"].map((tz) => {
        process.env.TZ = tz;
        return formatUpdated("2026-10-12T23:58:11.357Z");
      });
      expect(new Set(results).size).toBe(1);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  test("gives an empty string for something that is not a timestamp", () => {
    expect(formatUpdated("not a date")).toBe("");
    expect(formatUpdated("")).toBe("");
  });
});

describe("withoutTitleHeading", () => {
  const body = "# Flights\n\n## Outbound\n- 3 May";

  test("removes a leading heading that repeats the title, and the blank lines after it", () => {
    expect(withoutTitleHeading(body, "Flights")).toBe("## Outbound\n- 3 May");
  });

  test.each([
    ["different case", "FLIGHTS"],
    ["surrounding spaces", "  flights  "],
  ])("matches regardless of %s", (_label, title) => {
    expect(withoutTitleHeading(body, title)).toBe("## Outbound\n- 3 May");
  });

  test("matches accented titles in either Unicode form", () => {
    const composed = "Café";
    const decomposed = "Café";
    expect(withoutTitleHeading(`# ${composed}\n\ntext`, decomposed)).toBe("text");
  });

  test("tolerates blank lines before the heading and a closing hash run", () => {
    expect(withoutTitleHeading("\n\n# Flights #\n\nbody", "Flights")).toBe("body");
  });

  test("leaves a heading for a different title alone", () => {
    expect(withoutTitleHeading("# Lisbon\n\nbody", "Flights")).toBe("# Lisbon\n\nbody");
  });

  test("leaves a level-two heading with the same text alone", () => {
    expect(withoutTitleHeading("## Flights\n\nbody", "Flights")).toBe("## Flights\n\nbody");
  });

  test("leaves a title heading that is not first alone", () => {
    const text = "Some opening line.\n\n# Flights\n\nbody";
    expect(withoutTitleHeading(text, "Flights")).toBe(text);
  });

  test("leaves a body that is only the heading empty, and an empty body unchanged", () => {
    expect(withoutTitleHeading("# Flights", "Flights")).toBe("");
    expect(withoutTitleHeading("", "Flights")).toBe("");
    expect(withoutTitleHeading("   \n  ", "Flights")).toBe("   \n  ");
  });

  test("does not treat a hash with no space as a heading", () => {
    expect(withoutTitleHeading("#Flights\n\nbody", "Flights")).toBe("#Flights\n\nbody");
  });
});
