package org.dc34.badgemanager;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + LOCAL_HOST + "/assets/www/index.html";
    private static final int REQUEST_FILE = 7001;
    private static final int REQUEST_EXPORT = 7002;

    private WebView webView;
    private UsbSerialController serialController;
    private AndroidSerialBridge serialBridge;
    private ValueCallback<Uri[]> fileCallback;
    private PendingExport pendingExport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(16, 20, 16));
        getWindow().setNavigationBarColor(Color.rgb(16, 20, 16));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 20, 16));
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWebView(webView);

        serialController = new UsbSerialController(this, new UsbSerialController.Callback() {
            @Override public void resolve(String requestId) { serialBridge.resolve(requestId); }
            @Override public void reject(String requestId, String name, String message) { serialBridge.reject(requestId, name, message); }
            @Override public void disconnected(String sessionId) { serialBridge.disconnected(sessionId); }
            @Override public void attached() { serialBridge.attached(); }
        });
        serialBridge = new AndroidSerialBridge(this, webView, serialController);
        webView.addJavascriptInterface(serialBridge, "DC34Android");
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction()) && serialBridge != null) {
            serialBridge.attached();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " DC34BadgeManager/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new LocalAssetClient());
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_FILE);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    showMessage("No file picker is available.");
                    return false;
                }
            }
        });
    }

    void setTransferBusy(boolean busy) {
        if (busy) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    void requestFileExport(String rawName, String rawMimeType, byte[] bytes) {
        String name = rawName == null ? "dc34-export.bin" : rawName.replaceAll("[\\r\\n/\\\\]", "_");
        String mimeType = rawMimeType == null || rawMimeType.isBlank() ? "application/octet-stream" : rawMimeType;
        pendingExport = new PendingExport(name, mimeType, bytes);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mimeType)
                .putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(intent, REQUEST_EXPORT);
        } catch (ActivityNotFoundException error) {
            pendingExport = null;
            showMessage("No document provider is available for exports.");
        }
    }

    void openExternalUrl(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            String scheme = uri.getScheme();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                showMessage("Only HTTP and HTTPS links can leave the app.");
                return;
            }
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            showMessage("Could not open that link.");
        }
    }

    void showMessage(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback != null) callback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
        if (requestCode == REQUEST_EXPORT) {
            PendingExport export = pendingExport;
            pendingExport = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || export == null) return;
            try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output == null) throw new FileNotFoundException("Document provider returned no output stream");
                output.write(export.bytes);
                output.flush();
                showMessage("Saved " + export.name);
            } catch (IOException error) {
                showMessage("Could not save " + export.name + ": " + error.getMessage());
            }
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        setTransferBusy(false);
        if (serialController != null) serialController.destroy();
        if (webView != null) {
            webView.removeJavascriptInterface("DC34Android");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class LocalAssetClient extends WebViewClient {
        private static final String PREFIX = "/assets/www/";

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (LOCAL_HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
            openExternalUrl(uri.toString());
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !LOCAL_HOST.equals(uri.getHost())) return blockedResponse();
            String path = uri.getPath();
            if (path == null || !path.startsWith(PREFIX)) return blockedResponse();
            String relative = path.substring(PREFIX.length());
            if (!AssetPathPolicy.isSafe(relative)) return blockedResponse();
            try {
                InputStream stream = getAssets().open("www/" + relative);
                String mime = mimeType(relative);
                String encoding = mime.startsWith("text/") || mime.contains("javascript") ? "UTF-8" : null;
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse(mime, encoding, 200, "OK", headers, stream);
            } catch (IOException error) {
                return response(404, "Not Found");
            }
        }

        private WebResourceResponse blockedResponse() { return response(403, "Blocked"); }

        private WebResourceResponse response(int status, String reason) {
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                    headers, new ByteArrayInputStream(new byte[0]));
        }

        private String mimeType(String path) {
            String extension = MimeTypeMap.getFileExtensionFromUrl(path).toLowerCase(Locale.US);
            return switch (extension) {
                case "html" -> "text/html";
                case "css" -> "text/css";
                case "js" -> "application/javascript";
                case "png" -> "image/png";
                case "jpg", "jpeg" -> "image/jpeg";
                case "svg" -> "image/svg+xml";
                case "json" -> "application/json";
                case "bin" -> "application/octet-stream";
                default -> "application/octet-stream";
            };
        }
    }

    private static final class PendingExport {
        final String name;
        final String mimeType;
        final byte[] bytes;
        PendingExport(String name, String mimeType, byte[] bytes) {
            this.name = name;
            this.mimeType = mimeType;
            this.bytes = bytes;
        }
    }
}
