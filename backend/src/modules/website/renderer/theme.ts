/**
 * Website themes. A theme is a set of colours, fonts and shapes turned into CSS
 * variables; site.css uses only these variables, so every block follows the theme.
 *
 * To add a preset: add an entry to THEME_PRESETS. To offer another font: add it to FONTS.
 */

export interface Theme {
  preset: string;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    background: string;
    muted: string;
    dark: string;
  };
  headingFont: string;
  bodyFont: string;
  radius: "none" | "sm" | "md" | "lg";
  buttonShape: "square" | "rounded" | "pill";
}

/** Google Fonts offered in the theme editor, with the weights each one has. */
export const FONTS = [
  { name: "Poppins", category: "sans-serif", weights: "400;500;600;700" },
  { name: "Inter", category: "sans-serif", weights: "400;500;600;700" },
  { name: "Mukta", category: "sans-serif", weights: "400;500;600;700", note: "Good for Nepali text" },
  { name: "Noto Sans", category: "sans-serif", weights: "400;500;600;700", note: "Good for Nepali text" },
  { name: "Nunito", category: "sans-serif", weights: "400;500;600;700" },
  { name: "Source Sans 3", category: "sans-serif", weights: "400;500;600;700" },
  { name: "Merriweather", category: "serif", weights: "400;700" },
  { name: "Lora", category: "serif", weights: "400;500;600;700" },
  { name: "Playfair Display", category: "serif", weights: "400;500;600;700" },
  { name: "Roboto Slab", category: "serif", weights: "400;500;600;700" },
];

export const THEME_PRESETS: { id: string; name: string; theme: Theme }[] = [
  {
    id: "classic",
    name: "Classic Blue",
    theme: {
      preset: "classic",
      colors: { primary: "#1d4ed8", secondary: "#f59e0b", text: "#1e293b", background: "#ffffff", muted: "#f1f5f9", dark: "#0f172a" },
      headingFont: "Poppins",
      bodyFont: "Inter",
      radius: "md",
      buttonShape: "rounded",
    },
  },
  {
    id: "himalaya",
    name: "Himalayan Green",
    theme: {
      preset: "himalaya",
      colors: { primary: "#047857", secondary: "#eab308", text: "#1c2b25", background: "#ffffff", muted: "#ecfdf5", dark: "#052e22" },
      headingFont: "Nunito",
      bodyFont: "Nunito",
      radius: "lg",
      buttonShape: "pill",
    },
  },
  {
    id: "heritage",
    name: "Heritage Maroon",
    theme: {
      preset: "heritage",
      colors: { primary: "#9f1239", secondary: "#c9a227", text: "#2b1b1f", background: "#fffdf8", muted: "#fbf3e8", dark: "#3b0a18" },
      headingFont: "Merriweather",
      bodyFont: "Source Sans 3",
      radius: "sm",
      buttonShape: "square",
    },
  },
  {
    id: "sunrise",
    name: "Sunrise Orange",
    theme: {
      preset: "sunrise",
      colors: { primary: "#ea580c", secondary: "#1e3a8a", text: "#1f2937", background: "#ffffff", muted: "#fff7ed", dark: "#1e293b" },
      headingFont: "Poppins",
      bodyFont: "Mukta",
      radius: "lg",
      buttonShape: "pill",
    },
  },
  {
    id: "royal",
    name: "Royal Indigo",
    theme: {
      preset: "royal",
      colors: { primary: "#4338ca", secondary: "#db2777", text: "#1e1b4b", background: "#ffffff", muted: "#eef2ff", dark: "#1e1b4b" },
      headingFont: "Playfair Display",
      bodyFont: "Inter",
      radius: "md",
      buttonShape: "rounded",
    },
  },
];

export const DEFAULT_THEME = THEME_PRESETS[0].theme;

const RADIUS = { none: "0px", sm: "4px", md: "10px", lg: "18px" };
const BUTTON_RADIUS = { square: "4px", rounded: "10px", pill: "999px" };

/** Fills in anything missing so old or partial themes still render. */
export function normalizeTheme(value: unknown): Theme {
  const theme = (value && typeof value === "object" ? value : {}) as Partial<Theme>;
  return {
    ...DEFAULT_THEME,
    ...theme,
    colors: { ...DEFAULT_THEME.colors, ...(theme.colors ?? {}) },
  };
}

const fontStack = (name: string) => {
  const font = FONTS.find((f) => f.name === name);
  return `"${name}", ${font?.category === "serif" ? "Georgia, serif" : "system-ui, sans-serif"}, "Noto Sans Devanagari"`;
};

/** CSS variables for a theme, applied to the .sms-site element. */
export function themeCss(theme: Theme): string {
  const c = theme.colors;
  return `.sms-site{
  --c-primary:${c.primary};
  --c-primary-dark:color-mix(in srgb, ${c.primary} 78%, black);
  --c-primary-soft:color-mix(in srgb, ${c.primary} 10%, white);
  --c-secondary:${c.secondary};
  --c-text:${c.text};
  --c-heading:color-mix(in srgb, ${c.text} 92%, ${c.primary});
  --c-muted-text:color-mix(in srgb, ${c.text} 62%, white);
  --c-bg:${c.background};
  --c-muted:${c.muted};
  --c-dark:${c.dark};
  --c-border:color-mix(in srgb, ${c.text} 12%, white);
  --font-heading:${fontStack(theme.headingFont)};
  --font-body:${fontStack(theme.bodyFont)};
  --radius:${RADIUS[theme.radius] ?? RADIUS.md};
  --btn-radius:${BUTTON_RADIUS[theme.buttonShape] ?? BUTTON_RADIUS.rounded};
}`;
}

/** Google Fonts stylesheet URL for the theme's fonts (plus Devanagari fallback). */
export function googleFontsUrl(theme: Theme): string {
  const families = [...new Set([theme.headingFont, theme.bodyFont, "Noto Sans Devanagari"])]
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@${FONTS.find((f) => f.name === name)?.weights ?? "400;500;600;700"}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
