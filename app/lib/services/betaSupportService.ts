export const betaSupportFallback = "Contact your designated Clubhouse HQ beta support owner.";

export type BetaSupportContact = {
  label: string;
  href: string | null;
  configured: boolean;
};

export const resolveBetaSupportContact = (configuredValue?: string): BetaSupportContact => {
  const value = configuredValue?.trim() ?? "";
  if (!value) return { label: betaSupportFallback, href: null, configured: false };

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { label: value, href: `mailto:${value}`, configured: true };
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") return { label: "Open beta support", href: url.toString(), configured: true };
  } catch {
    // Invalid public configuration uses the safe fallback below.
  }

  return { label: betaSupportFallback, href: null, configured: false };
};
