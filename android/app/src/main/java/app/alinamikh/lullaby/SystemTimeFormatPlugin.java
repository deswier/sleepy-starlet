package app.alinamikh.lullaby;

import android.text.format.DateFormat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Reads the Android system 12/24h preference via DateFormat.is24HourFormat(),
// which checks Settings.System.TIME_12_24 and falls back to the locale default.
// Intl in the WebView does not have access to this system setting.
@CapacitorPlugin(name = "SystemTimeFormat")
public class SystemTimeFormatPlugin extends Plugin {

    @PluginMethod
    public void is12HourFormat(PluginCall call) {
        boolean is24h = DateFormat.is24HourFormat(getContext());
        JSObject result = new JSObject();
        result.put("value", !is24h);
        call.resolve(result);
    }
}
