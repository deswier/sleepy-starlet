import { registerPlugin } from "@capacitor/core";

export interface SystemTimeFormatPlugin {
  is12HourFormat(): Promise<{ value: boolean }>;
}

// Web fallback: read hour cycle from the resolved system locale via Intl.
// Capacitor uses this implementation when platform === "web".
// On Android it also uses this (via the bridge calling the web impl
// is not how Capacitor works — Android falls back here because we
// intentionally have no Android native impl; see sleep-utils.ts).
class SystemTimeFormatWeb implements SystemTimeFormatPlugin {
  async is12HourFormat(): Promise<{ value: boolean }> {
    try {
      const { hourCycle, hour12 } = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
      if (hourCycle) return { value: hourCycle === "h11" || hourCycle === "h12" };
      return { value: hour12 ?? false };
    } catch {
      return { value: false };
    }
  }
}

// On Android: SystemTimeFormatPlugin.java (registered in MainActivity) handles calls.
// On iOS: SystemTimeFormatPlugin.swift (see src/plugins/ios/) handles calls.
// On web: the web fallback above (Intl-based) is used.
// TODO(ios): after `cap add ios`, copy src/plugins/ios/SystemTimeFormatPlugin.swift
// to ios/App/App/ and add `bridge?.registerPlugin(SystemTimeFormatPlugin.self)`
// in ios/App/App/AppDelegate.swift.
export const SystemTimeFormat = registerPlugin<SystemTimeFormatPlugin>(
  "SystemTimeFormat",
  { web: new SystemTimeFormatWeb() },
);
