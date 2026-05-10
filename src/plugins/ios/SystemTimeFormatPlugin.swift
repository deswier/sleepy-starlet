// SETUP: After running `cap add ios`, copy this file to ios/App/App/
// and register the plugin in ios/App/App/AppDelegate.swift:
//
//   import Capacitor
//   bridge?.registerPlugin(SystemTimeFormatPlugin.self)
//
// No other changes needed — Capacitor routes JS calls automatically.

import Capacitor

// Detects whether iOS is configured for 12-hour time by formatting a known
// time using the "j" skeleton, which honours the system 12/24h preference
// independently of the display language. Intl in WKWebView does NOT reflect
// this setting, so a native call is required on iOS.
@objc(SystemTimeFormatPlugin)
public class SystemTimeFormatPlugin: CAPPlugin {
    @objc func is12HourFormat(_ call: CAPPluginCall) {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        // "j" skeleton uses the system-preferred hour format (12 or 24).
        formatter.setLocalizedDateFormatFromTemplate("j")
        // "a" in the format string means AM/PM marker → 12h clock.
        call.resolve(["value": formatter.dateFormat.contains("a")])
    }
}
