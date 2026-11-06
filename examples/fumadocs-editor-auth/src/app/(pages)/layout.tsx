import { RootProvider } from "fumadocs-ui/provider/next";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";

import { AuthToast } from "@/components/auth-toast";
import { THEMES } from "@/lib/config";

export default function PagesLayout({ children }: LayoutProps<"/">) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={THEMES[0]}
      enableSystem
      themes={[...THEMES]}
    >
      <RootProvider>
        {children}
        <Suspense>
          <AuthToast />
        </Suspense>
      </RootProvider>
    </ThemeProvider>
  );
}
