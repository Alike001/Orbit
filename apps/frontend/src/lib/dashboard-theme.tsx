"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
const KEY = "orbit_dashboard_theme";

/** next-themes injects the initial class before hydration to avoid a theme flash. */
export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={KEY}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

export function useDashboardTheme() {
  const { theme, setTheme } = useTheme();
  return {
    theme: (theme === "light" || theme === "dark" || theme === "system" ? theme : "system") as ThemePreference,
    setTheme: (value: ThemePreference) => setTheme(value),
  };
}
