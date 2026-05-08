// Dev-only logging helpers. Calls are compiled away in production builds,
// keeping the browser console clean for end users.
export const devError = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.error(...args);
};
export const devWarn = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.warn(...args);
};
