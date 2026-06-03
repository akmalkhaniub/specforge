import type { Config } from 'tailwindcss';

/**
 * SpecForge design tokens, driven by CSS variables so the theme can switch at
 * runtime (light / dark). Each token is an "R G B" triplet defined in index.css
 * under :root (light) and .dark; the `<alpha-value>` slot keeps opacity
 * utilities (e.g. bg-accent/20) working.
 */
function token(name: string): string {
  return `rgb(var(${name}) / <alpha-value>)`;
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('--c-background'),
        surface: token('--c-surface'),
        'surface-2': token('--c-surface-2'),
        border: token('--c-border'),
        text: token('--c-text'),
        muted: token('--c-muted'),
        accent: token('--c-accent'),
        'accent-fg': token('--c-accent-fg'),
        success: token('--c-success'),
        warning: token('--c-warning'),
        danger: token('--c-danger'),
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'card-dark': '0 1px 2px 0 rgb(0 0 0 / 0.4)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
