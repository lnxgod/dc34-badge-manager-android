package org.dc34.badgemanager;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/** Narrow bridge exposed only to the bundled, network-isolated workbench origin. */
public final class AndroidSerialBridge implements UsbSerialController.Callback {
    private static final int MAX_EXPORT_BYTES = 8 * 1024 * 1024;

    private final MainActivity activity;
    private final WebView webView;
    private final UsbSerialController serial;

    AndroidSerialBridge(MainActivity activity, WebView webView, UsbSerialController serial) {
        this.activity = activity;
        this.webView = webView;
        this.serial = serial;
    }

    @JavascriptInterface public void requestPort(String requestId, String sessionId) {
        serial.requestPort(requestId, sessionId);
    }

    @JavascriptInterface public void open(String requestId, String sessionId, int baudRate) {
        serial.open(requestId, sessionId, baudRate);
    }

    @JavascriptInterface
    public String writeBase64(String sessionId, String encoded) {
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length > 65_536) return "error:write exceeds 64 KiB";
            serial.write(sessionId, bytes);
            return "ok";
        } catch (Exception error) {
            return "error:" + safeMessage(error);
        }
    }

    @JavascriptInterface
    public String readBase64(String sessionId) {
        try {
            byte[] bytes = serial.readAvailable(sessionId);
            return bytes.length == 0 ? "" : Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception error) {
            return "error:" + safeMessage(error);
        }
    }

    @JavascriptInterface public void close(String sessionId) { serial.closeSession(sessionId); }

    @JavascriptInterface
    public void setBusy(boolean busy) {
        activity.runOnUiThread(() -> activity.setTransferBusy(busy));
    }

    @JavascriptInterface
    public void copyText(String text) {
        activity.runOnUiThread(() -> {
            ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("DC34 badge payload", text));
        });
    }

    @JavascriptInterface
    public void saveBase64File(String fileName, String mimeType, String encoded) {
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length > MAX_EXPORT_BYTES) throw new IllegalArgumentException("export exceeds 8 MiB");
            activity.runOnUiThread(() -> activity.requestFileExport(fileName, mimeType, bytes));
        } catch (Exception error) {
            activity.showMessage("Could not prepare export: " + safeMessage(error));
        }
    }

    @JavascriptInterface public void openExternal(String url) { activity.runOnUiThread(() -> activity.openExternalUrl(url)); }

    @JavascriptInterface
    public String appInfo() {
        return "{\"platform\":\"android\",\"transport\":\"usb-host\",\"version\":\"" +
                BuildConfig.VERSION_NAME + "\"}";
    }

    @Override public void resolve(String requestId) {
        runScript("window.__dc34Serial && window.__dc34Serial.resolve(" + quote(requestId) + ");");
    }

    @Override public void reject(String requestId, String errorName, String message) {
        runScript("window.__dc34Serial && window.__dc34Serial.reject(" + quote(requestId) + "," +
                quote(errorName) + "," + quote(message) + ");");
    }

    @Override public void disconnected(String sessionId) {
        runScript("window.__dc34Serial && window.__dc34Serial.notifyDisconnected(" + quote(sessionId) + ");");
    }

    @Override public void attached() {
        runScript("window.__dc34Serial && window.__dc34Serial.notifyAttached();");
    }

    private void runScript(String script) { webView.post(() -> webView.evaluateJavascript(script, null)); }
    private static String quote(String value) { return JSONObject.quote(value == null ? "" : value); }
    private static String safeMessage(Throwable error) {
        String value = error.getMessage();
        return value == null || value.isBlank() ? error.getClass().getSimpleName() : value;
    }
}
