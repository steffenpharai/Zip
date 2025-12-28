"use client";

import { ThemeProvider } from "@/lib/theme/theme-provider";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

