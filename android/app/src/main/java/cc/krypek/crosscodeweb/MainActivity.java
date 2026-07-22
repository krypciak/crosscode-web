package cc.krypek.crosscodeweb;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Rumble rumble = new Rumble(this);
        FileFetch fileFetch = new FileFetch(this);
        Fullscreen fullscreen = new Fullscreen(this);
        FileSave fileSave = new FileSave(this);

        Bridge bridge = getBridge();
        WebView webView = bridge.getWebView();
        if (webView != null) {
            webView.setWebViewClient(new SslBypassWebViewClient(bridge));
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void reportRumble(double strength, double effectDuration) {
                    runOnUiThread(() -> rumble.reportRumble(strength, effectDuration));
                }

                @JavascriptInterface
                public void setFullscreen() {
                    runOnUiThread(() -> fullscreen.enterImmersiveMode());
                }

                @JavascriptInterface
                public String saveFile(String base64, String fileName) {
                    try {
                        byte[] data = Base64.decode(base64, Base64.NO_WRAP);
                        return fileSave.saveFile(data, fileName);
                    } catch (Exception e) {
                        return "ERROR: " + e.getMessage();
                    }
                }

                @JavascriptInterface
                public void fetchBinary(String url, String callbackId) {
                    executor.execute(() -> {
                        final String prefix = "window._crosscodeWebCallbacks.fetchBinary.";
                        try {
                            byte[] data = fileFetch.fetchBinary(url);
                            String base64 = Base64.encodeToString(data, Base64.NO_WRAP);
                            String js = prefix + "success('" + callbackId + "', '" + base64
                                    + "');";
                            runOnUiThread(() -> webView.evaluateJavascript(js, null));
                        } catch (Exception e) {
                            String errorMsg = e.getMessage().replace("'", "\\'");
                            String js = prefix + "error('" + callbackId + "', '" + errorMsg + "');";
                            runOnUiThread(() -> webView.evaluateJavascript(js, null));
                        }
                    });
                }
            }, "CrosscodeWebAndroidNative");
        }
    }
}
