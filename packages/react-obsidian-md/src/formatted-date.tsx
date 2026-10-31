"use client";

import { useEffect, useState } from "react";

/**
 * Numeric date through `Intl.DateTimeFormat` (e.g. `17/02/2026, 11:33` in
 * pt-BR, `2/17/2026, 11:33 AM` in en-US). The server cannot know the visitor's
 * locale, so the ISO string renders first and the formatted value swaps in
 * after hydration: no hydration mismatch, no layout shift.
 *
 * `locales` defaults to the browser's locale; `options` replaces the default
 * numeric format (a datetime still gets its time unless `options` says
 * otherwise).
 */
export function FormattedDate({
  date,
  kind,
  locales,
  options,
}: {
  date: string;
  kind: "date" | "datetime";
  locales?: Intl.LocalesArgument;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [text, setText] = useState(date);
  const optionsKey = JSON.stringify(options ?? null);
  const localesKey = JSON.stringify(locales ?? null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the keys stand for the objects
  useEffect(() => {
    // `T00:00` keeps a date-only value in the local day: `new Date("2025-02-03")`
    // is UTC midnight and would render as the previous day west of UTC.
    const parsed = kind === "date" ? new Date(`${date}T00:00`) : new Date(date);
    setText(
      new Intl.DateTimeFormat(
        locales,
        options ?? {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          ...(kind === "datetime"
            ? { hour: "numeric", minute: "2-digit" }
            : {}),
        },
      ).format(parsed),
    );
  }, [date, kind, localesKey, optionsKey]);

  return (
    <time data-property-date={kind} dateTime={date}>
      {text}
    </time>
  );
}
