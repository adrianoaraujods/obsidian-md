import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@/lib/utils";

import "@/styles/globals.css";
import "katex/dist/katex.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          `flex min-h-screen flex-col antialiased`,
          geistSans.variable,
          geistMono.variable,
        )}
      >
        {children}
      </body>
    </html>
  );
}
