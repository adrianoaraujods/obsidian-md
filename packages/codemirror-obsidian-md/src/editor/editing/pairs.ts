/**
 * Bracket openers and their closers. Selection Wrap and Auto-pair both draw
 * on this; quotes and the backtick close with themselves. Fixed, not
 * configurable (ADR 0016).
 */
export const BRACKET_CLOSERS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
};
