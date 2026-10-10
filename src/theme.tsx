import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

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

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, resolved, setMode } = useTheme();

  const options: Array<{
    value: ThemeMode;
    label: string;
    icon: typeof Sun;
    activeIconColor: string;
    activeGlow: string;
  }> = [
    {
      value: 'light',
      label: 'Light',
      icon: Sun,
      activeIconColor: 'text-amber-400 dark:text-amber-300',
      activeGlow: 'shadow-[0_0_12px_rgba(251,191,36,0.35)]',
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: Moon,
      activeIconColor: 'text-brand',
      activeGlow: 'shadow-[0_0_12px_rgba(255,94,104,0.35)]',
    },
    {
      value: 'system',
      label: 'System',
      icon: Monitor,
      activeIconColor: 'text-cyan-400 dark:text-cyan-300',
      activeGlow: 'shadow-[0_0_12px_rgba(34,211,238,0.35)]',
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className="group relative inline-flex items-center gap-1 rounded-xl border border-color-border/80 bg-color-input/70 p-1 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all duration-300 hover:border-color-border-strong"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} mode`}
            title={`${opt.label} theme (resolved: ${resolved})`}
            onClick={() => setMode(opt.value)}
            className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.94] ${
              active
                ? `bg-color-surface-elevated text-forest ${opt.activeGlow} shadow-[0_2px_8px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.16)] ring-1 ring-color-border-strong`
                : 'text-sage hover:bg-color-hover/80 hover:text-forest'
            }`}
          >
            <Icon
              size={13}
              className={`shrink-0 transition-transform duration-200 ${
                active ? `${opt.activeIconColor} scale-105` : 'text-sage group-hover:text-forest/70'
              }`}
            />
            {!compact && <span className="hidden sm:inline-block leading-none">{opt.label}</span>}
            {active && (
              <span
                className="absolute -top-0.5 right-1 h-1 w-1 rounded-full bg-brand"
                style={{ boxShadow: '0 0 6px #FF5E68' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
