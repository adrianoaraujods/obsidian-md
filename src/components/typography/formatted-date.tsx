"use client";

import { useEffect, useState } from "react";

/**
 * Numeric date in the browser's locale (e.g. `17/02/2026, 11:33` in pt-BR,
 * `2/17/2026, 11:33 AM` in en-US). The server cannot know the visitor's
 * locale, so the ISO string renders first and the formatted value swaps in
 * after hydration — no hydration mismatch, no layout shift.
 */
export function FormattedDate({
  date,
  kind,
}: {
  date: string;
  kind: "date" | "datetime";
}) {
  const [text, setText] = useState(date);

  useEffect(() => {
    // `T00:00` keeps a date-only value in the local day: `new Date("2025-02-03")`
    // is UTC midnight and would render as the previous day west of UTC.
    const parsed = kind === "date" ? new Date(`${date}T00:00`) : new Date(date);
    setText(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        ...(kind === "datetime" ? { hour: "numeric", minute: "2-digit" } : {}),
      }).format(parsed),
    );
  }, [date, kind]);

  return <time dateTime={date}>{text}</time>;
}
