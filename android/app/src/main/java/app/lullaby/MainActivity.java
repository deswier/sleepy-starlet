package app.lullaby;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SystemTimeFormatPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
