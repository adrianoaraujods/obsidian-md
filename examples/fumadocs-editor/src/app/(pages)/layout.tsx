import { RootProvider } from "fumadocs-ui/provider/next";
import { ThemeProvider } from "next-themes";

import { THEMES } from "@/lib/config";

export default function PagesLayout({ children }: LayoutProps<"/">) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={THEMES[0]}
      enableSystem
      themes={[...THEMES]}
    >
      <RootProvider>{children}</RootProvider>
    </ThemeProvider>
  );
}
