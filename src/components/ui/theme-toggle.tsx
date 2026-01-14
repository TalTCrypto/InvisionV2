"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="border-border bg-background fixed right-6 bottom-6 z-50 flex size-12 items-center justify-center rounded-full border shadow-lg" />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "border-border bg-background fixed right-6 bottom-6 z-50 flex size-12 items-center justify-center rounded-full border shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl",
        "focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none",
      )}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="text-foreground size-5 transition-transform duration-300" />
      ) : (
        <Moon className="text-foreground size-5 transition-transform duration-300" />
      )}
    </button>
  );
}
