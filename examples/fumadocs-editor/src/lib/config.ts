export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
