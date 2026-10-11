import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);
const THEME_STORAGE_KEY = 'dsynq-theme-mode';

function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialThemeMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    if (typeof window !== 'undefined' && mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  });

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const update = () => {
      let nextResolved: ResolvedTheme;
      if (mode === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        nextResolved = isDark ? 'dark' : 'light';
      } else {
        nextResolved = mode;
      }

      setResolved(nextResolved);
      document.documentElement.setAttribute('data-theme', nextResolved);
      document.documentElement.style.colorScheme = nextResolved;

      // Update meta theme-color for mobile chrome / safari
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', nextResolved === 'dark' ? '#08090C' : '#F5F6FA');
      }
    };

    update();

    if (mode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => update();
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function ThemeSwitcher({
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const { resolved, setMode } = useTheme();
  const isDark = resolved === 'dark';

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch theme"
      title="Switch theme"
      aria-pressed={isDark}
      className={`group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border backdrop-blur-md transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas active:scale-95 motion-reduce:transition-none motion-reduce:transform-none ${
        isDark
          ? 'border-white/10 bg-white/[0.04] text-brand shadow-[0_0_12px_-2px_rgba(255,94,104,0.22)] hover:border-brand/40 hover:bg-brand/[0.08] hover:shadow-[0_0_18px_rgba(255,94,104,0.45)]'
          : 'border-black/[0.08] bg-black/[0.03] text-sage hover:border-brand/35 hover:bg-brand/[0.06] hover:text-brand hover:shadow-[0_0_14px_rgba(255,94,104,0.22)]'
      } ${className}`}
    >
      <Lightbulb
        size={19}
        strokeWidth={1.85}
        className={`transition-all duration-200 motion-reduce:transition-none ${
          isDark
            ? 'fill-brand/25 text-brand drop-shadow-[0_0_8px_rgba(255,94,104,0.65)] group-hover:scale-105 group-hover:drop-shadow-[0_0_12px_rgba(255,94,104,0.85)]'
            : 'fill-transparent text-sage group-hover:scale-105 group-hover:text-brand'
        }`}
        aria-hidden="true"
      />
      <span className="sr-only">Switch theme</span>
    </button>
  );
}
