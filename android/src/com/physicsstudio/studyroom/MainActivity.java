package com.physicsstudio.studyroom;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.util.Log;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String TAG = "PhysicsStudio";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PATH_PREFIX = "/assets/";
    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final String EDGE_PACKAGE = "com.microsoft.emmx";
    private static final int REQUEST_OPEN_FILE = 4101;
    private static final int REQUEST_SAVE_BACKUP = 4102;
    private static final int REQUEST_CAMERA_PERMISSION = 4103;
    private static final int REQUEST_SAVE_ATTACHMENT = 4104;
    private static final int REQUEST_AUDIO_PERMISSION = 4105;
    private static final String ACTIVATION_PREFERENCES = "physics_studio_activation_v1";
    private static final String ACTIVATION_CODE_KEY = "activation_code";
    private static final String ACTIVATION_FALLBACK_DEVICE_KEY = "fallback_device_secret";
    private static final int MAX_OCR_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingExportText;
    private byte[] pendingAttachmentBytes;
    private PermissionRequest pendingCameraPermissionRequest;
    private PermissionRequest pendingAudioPermissionRequest;
    private final ExecutorService classroomExecutor = Executors.newFixedThreadPool(2);
    private volatile LanClassroomHost classroomHost;
    private volatile boolean classroomHostClosing;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        startClassroomHost();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 246, 242));
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(),
                    insets.getSystemWindowInsetBottom()
                );
                return insets;
            }
        });

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 246, 242));
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        root.requestApplyInsets();

        configureWebView();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private void startClassroomHost() {
        classroomExecutor.execute(new Runnable() {
            @Override
            public void run() {
                LanClassroomHost candidate = null;
                try {
                    candidate = new LanClassroomHost(new java.io.File(getFilesDir(), "classroom-service"));
                    candidate.start();
                    if (classroomHostClosing) {
                        candidate.close();
                    } else {
                        classroomHost = candidate;
                    }
                } catch (IOException ignored) {
                    if (candidate != null) candidate.close();
                    // A port collision can mean another classroom host is
                    // already available on this LAN. Discovery remains usable;
                    // no credential or filesystem path is written to logs.
                }
            }
        });
    }

    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.rgb(244, 246, 242));
        getWindow().setNavigationBarColor(Color.rgb(244, 246, 242));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        String appVersion = "unknown";
        try {
            appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException ignored) {
            // The installed package should always resolve; keep an explicit
            // non-version fallback instead of duplicating the release number.
        }
        settings.setUserAgentString(settings.getUserAgentString() + " PhysicsStudioAndroid/" + appVersion);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebView.setWebContentsDebuggingEnabled(false);

        // Security TODO: migrate this local-only bridge to AndroidX WebMessage
        // with an explicit appassets origin allowlist. Never load arbitrary
        // remote documents in this WebView while the native bridge is present.
        webView.addJavascriptInterface(new AndroidBridge(), "PhysicsStudioAndroid");
        webView.setWebViewClient(new StudioWebViewClient());
        webView.setWebChromeClient(new StudioWebChromeClient());
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        if (isLocalAssetUri(uri)) return false;
        String scheme = uri.getScheme();
        if (scheme == null || "file".equalsIgnoreCase(scheme) || "about".equalsIgnoreCase(scheme)
            || "data".equalsIgnoreCase(scheme) || "blob".equalsIgnoreCase(scheme)) {
            return false;
        }
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)
            || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
            openExternal(uri);
            return true;
        }
        return false;
    }

    private static boolean isLocalAssetUri(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
            && ASSET_HOST.equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null
            && uri.getPath().startsWith(ASSET_PATH_PREFIX);
    }

    private WebResourceResponse loadLocalAsset(Uri uri) {
        if (!isLocalAssetUri(uri)) return null;
        String assetPath = Uri.decode(uri.getPath().substring(ASSET_PATH_PREFIX.length()));
        if (assetPath.isEmpty() || assetPath.contains("..") || assetPath.contains("\\")
            || assetPath.startsWith("/")) {
            return notFoundResponse();
        }
        try {
            InputStream stream = getAssets().open(assetPath);
            return new WebResourceResponse(mimeTypeFor(assetPath), "UTF-8", stream);
        } catch (IOException error) {
            Log.w(TAG, "Missing local asset: " + assetPath, error);
            return notFoundResponse();
        }
    }

    private static WebResourceResponse notFoundResponse() {
        byte[] body = "Not found".getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            404,
            "Not Found",
            Collections.<String, String>emptyMap(),
            new ByteArrayInputStream(body)
        );
    }

    private static String mimeTypeFor(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        String detected = URLConnection.guessContentTypeFromName(path);
        return detected == null ? "application/octet-stream" : detected;
    }

    private void openExternal(Uri uri) {
        if (isWebUri(uri) && openWithEdge(uri)) return;
        openWithDefaultHandler(uri);
    }

    private boolean openWithEdge(Uri uri) {
        Intent edgeIntent = new Intent(Intent.ACTION_VIEW, uri);
        edgeIntent.setPackage(EDGE_PACKAGE);
        try {
            startActivity(edgeIntent);
            return true;
        } catch (ActivityNotFoundException ignored) {
            return false;
        }
    }

    private void openWithDefaultHandler(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可打开此链接的应用。", Toast.LENGTH_SHORT).show();
        }
    }

    private static boolean isWebUri(Uri uri) {
        return "http".equalsIgnoreCase(uri.getScheme())
            || "https".equalsIgnoreCase(uri.getScheme());
    }

    private final class StudioWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse response = loadLocalAsset(request.getUrl());
            return response == null ? super.shouldInterceptRequest(view, request) : response;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            WebResourceResponse response = loadLocalAsset(Uri.parse(url));
            return response == null ? super.shouldInterceptRequest(view, url) : response;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (START_URL.equals(url)) {
                view.evaluateJavascript(
                    "document.documentElement.classList.add('android-app')",
                    null
                );
            }
        }
    }

    private final class StudioWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView view,
            ValueCallback<Uri[]> callback,
            FileChooserParams params
        ) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(intent, REQUEST_OPEN_FILE);
                return true;
            } catch (ActivityNotFoundException error) {
                filePathCallback = null;
                Toast.makeText(MainActivity.this, "没有可选择文件的应用。", Toast.LENGTH_SHORT).show();
                return false;
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    handleWebPermissionRequest(request);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingCameraPermissionRequest == request) pendingCameraPermissionRequest = null;
            if (pendingAudioPermissionRequest == request) pendingAudioPermissionRequest = null;
        }

        @Override
        public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            Message resultMessage
        ) {
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                    boolean handled = handleNavigation(request.getUrl());
                    if (handled) child.destroy();
                    return handled;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView child, String url) {
                    boolean handled = handleNavigation(Uri.parse(url));
                    if (handled) child.destroy();
                    return handled;
                }

                @Override
                public void onPageStarted(WebView child, String url, Bitmap favicon) {
                    if (handleNavigation(Uri.parse(url))) {
                        child.stopLoading();
                        child.destroy();
                    }
                }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMessage.obj;
            transport.setWebView(popup);
            resultMessage.sendToTarget();
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            // Do not synchronously log every WebView message on release
            // devices; verbose console traffic noticeably competes with
            // touch/render work. Keep error visibility for diagnostics.
            if (message != null && message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                Log.e(TAG, message.message() + " @" + message.lineNumber());
            }
            return true;
        }
    }

    private final class AndroidBridge {
        /**
         * The current dependency-free Android shell is compiled directly with android.jar and
         * does not bundle an OCR model. Android itself does not expose a general text-recognition
         * API. These two bridge methods deliberately report that boundary instead of returning
         * fabricated text. The web layer can then fall back to TextDetector or manual entry.
         */
        @JavascriptInterface
        public String getOcrCapability() {
            JSONObject capability = new JSONObject();
            try {
                capability.put("available", false);
                capability.put("engine", "none");
                capability.put("reason", "offline_ocr_engine_not_bundled");
            } catch (Exception ignored) {
                return "{\"available\":false,\"engine\":\"none\",\"reason\":\"offline_ocr_engine_not_bundled\"}";
            }
            return capability.toString();
        }

        @JavascriptInterface
        public String ocrImage(String imageDataUrl) {
            String error = "offline_ocr_engine_not_bundled";
            if (imageDataUrl != null && imageDataUrl.length() > MAX_OCR_IMAGE_DATA_URL_LENGTH) {
                error = "image_too_large";
            }
            JSONObject result = new JSONObject();
            try {
                result.put("text", "");
                result.put("blocks", new JSONArray());
                result.put("engine", "none");
                result.put("error", error);
            } catch (Exception ignored) {
                return "{\"text\":\"\",\"blocks\":[],\"engine\":\"none\",\"error\":\"native_ocr_unavailable\"}";
            }
            return result.toString();
        }

        @JavascriptInterface
        public String getHostedClassroomServiceInfo() {
            LanClassroomHost host = classroomHost;
            if (host == null || !host.isRunning()) return "";
            try {
                JSONObject result = new JSONObject();
                result.put("serverUrl", "http://127.0.0.1:" + LanClassroomHost.SERVICE_PORT);
                JSONArray services = new JSONArray();
                services.put("http://127.0.0.1:" + LanClassroomHost.SERVICE_PORT);
                for (String address : LanClassroomHost.privateIpv4Addresses()) {
                    services.put("http://" + address + ":" + LanClassroomHost.SERVICE_PORT);
                }
                result.put("services", services);
                return result.toString();
            } catch (Exception ignored) {
                return "";
            }
        }

        @JavascriptInterface
        public String getActivationDeviceId() {
            String androidId = Settings.Secure.getString(
                getContentResolver(),
                Settings.Secure.ANDROID_ID
            );
            if (androidId == null || androidId.trim().isEmpty()) {
                SharedPreferences preferences = getSharedPreferences(
                    ACTIVATION_PREFERENCES,
                    MODE_PRIVATE
                );
                androidId = preferences.getString(ACTIVATION_FALLBACK_DEVICE_KEY, "");
                if (androidId.isEmpty()) {
                    androidId = UUID.randomUUID().toString();
                    preferences.edit()
                        .putString(ACTIVATION_FALLBACK_DEVICE_KEY, androidId)
                        .commit();
                }
            }
            return sha256Hex(
                "physics-studio|android|"
                    + getPackageName()
                    + "|"
                    + androidId
            );
        }

        @JavascriptInterface
        public String getStoredActivationCode() {
            String code = getSharedPreferences(ACTIVATION_PREFERENCES, MODE_PRIVATE)
                .getString(ACTIVATION_CODE_KEY, "");
            return isSafeActivationCode(code) ? code : "";
        }

        @JavascriptInterface
        public boolean saveActivationCode(String code) {
            if (!isSafeActivationCode(code)) return false;
            return getSharedPreferences(ACTIVATION_PREFERENCES, MODE_PRIVATE)
                .edit()
                .putString(ACTIVATION_CODE_KEY, code)
                .commit();
        }

        @JavascriptInterface
        public void classroomRequest(final String requestId, final String requestJson) {
            if (!isSafeClassroomRequestId(requestId)) return;
            if (requestJson == null || requestJson.length() > 100000) {
                postClassroomResponse(requestId, false, null, "invalid_request");
                return;
            }
            classroomExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        JSONObject input = new JSONObject(requestJson);
                        Map<String, String> headers = new LinkedHashMap<String, String>();
                        JSONObject sourceHeaders = input.optJSONObject("headers");
                        if (sourceHeaders != null) {
                            for (String name : new String[] {
                                "Authorization", "Idempotency-Key", "X-Physics-Studio-Client"
                            }) {
                                if (sourceHeaders.has(name)) headers.put(name, sourceHeaders.optString(name, ""));
                            }
                        }
                        LanClassroomTransport.Response response = LanClassroomTransport.request(
                            input.optString("serverUrl", ""),
                            input.optString("path", ""),
                            input.optString("method", "GET"),
                            headers,
                            input.optString("bodyText", ""),
                            input.optInt("timeoutMs", 15000)
                        );
                        JSONObject result = new JSONObject();
                        result.put("status", response.status);
                        result.put("bodyText", response.bodyText);
                        postClassroomResponse(requestId, true, result, "");
                    } catch (LanClassroomTransport.TransportException error) {
                        postClassroomResponse(requestId, false, null, error.code);
                    } catch (Exception error) {
                        postClassroomResponse(requestId, false, null, "invalid_request");
                    }
                }
            });
        }

        @JavascriptInterface
        public void discoverClassroomServices(final String requestId) {
            if (!isSafeClassroomRequestId(requestId)) return;
            classroomExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        List<String> services = LanClassroomTransport.discover(1800);
                        JSONObject result = new JSONObject();
                        result.put("services", new JSONArray(services));
                        postClassroomResponse(requestId, true, result, "");
                    } catch (LanClassroomTransport.TransportException error) {
                        postClassroomResponse(requestId, false, null, error.code);
                    } catch (Exception error) {
                        postClassroomResponse(requestId, false, null, "network_error");
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveTextFile(String fileName, String content, String mimeType) {
            if (content == null) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingExportText = content;
                    String safeName = sanitizeGenericFileName(fileName, mimeType);
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(
                        mimeType == null || mimeType.trim().isEmpty()
                            ? "application/json"
                            : mimeType
                    );
                    intent.putExtra(Intent.EXTRA_TITLE, safeName);
                    try {
                        startActivityForResult(intent, REQUEST_SAVE_BACKUP);
                    } catch (ActivityNotFoundException error) {
                        pendingExportText = null;
                        Toast.makeText(MainActivity.this, "没有可保存文件的应用。", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveBase64File(String fileName, String mimeType, String base64Data) {
            if (base64Data == null) return;
            final byte[] decoded;
            try {
                decoded = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (IllegalArgumentException error) {
                Log.e(TAG, "Invalid attachment data", error);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, "附件数据无法读取。", Toast.LENGTH_SHORT).show();
                    }
                });
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingAttachmentBytes = decoded;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(
                        mimeType == null || mimeType.trim().isEmpty()
                            ? "application/octet-stream"
                            : mimeType
                    );
                        intent.putExtra(Intent.EXTRA_TITLE, sanitizeGenericFileName(fileName, mimeType));
                    try {
                        startActivityForResult(intent, REQUEST_SAVE_ATTACHMENT);
                    } catch (ActivityNotFoundException error) {
                        pendingAttachmentBytes = null;
                        Toast.makeText(MainActivity.this, "没有可保存附件的应用。", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }

    private static boolean isSafeClassroomRequestId(String value) {
        if (value == null || value.length() < 8 || value.length() > 80) return false;
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            boolean allowed = character == '-'
                || (character >= '0' && character <= '9')
                || (character >= 'A' && character <= 'Z')
                || (character >= 'a' && character <= 'z');
            if (!allowed) return false;
        }
        return true;
    }

    private void postClassroomResponse(
        final String requestId,
        final boolean ok,
        final JSONObject result,
        final String errorCode
    ) {
        if (!isSafeClassroomRequestId(requestId)) return;
        final JSONObject message = new JSONObject();
        try {
            message.put("channel", "physics-studio-classroom");
            message.put("requestId", requestId);
            message.put("ok", ok);
            if (ok) message.put("result", result == null ? new JSONObject() : result);
            else message.put("error", errorCode == null || errorCode.isEmpty() ? "invalid_request" : errorCode);
        } catch (Exception ignored) {
            return;
        }
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView == null) return;
                webView.evaluateJavascript(
                    "globalThis.PhysicsStudioClassroomNativeResponse&&"
                        + "globalThis.PhysicsStudioClassroomNativeResponse(" + message.toString() + ")",
                    null
                );
            }
        });
    }

    private static boolean isSafeActivationCode(String code) {
        if (code == null
            || code.length() < 80
            || code.length() > 4096
            || !code.startsWith("PSA1.")) {
            return false;
        }
        for (int index = 0; index < code.length(); index += 1) {
            char character = code.charAt(index);
            boolean allowed = character == '.'
                || character == '-'
                || character == '_'
                || (character >= '0' && character <= '9')
                || (character >= 'A' && character <= 'Z')
                || (character >= 'a' && character <= 'z');
            if (!allowed) return false;
        }
        return true;
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder output = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) {
                output.append(String.format(Locale.ROOT, "%02X", item & 0xFF));
            }
            return output.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private static String sanitizeFileName(String fileName) {
        return sanitizeGenericFileName(fileName, "application/json");
    }

    private static String sanitizeGenericFileName(String fileName, String mimeType) {
        String safe = fileName == null ? "物理试题导出" : fileName.trim();
        safe = safe.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        safe = safe.replaceAll("\\.{2,}", "_");
        safe = safe.replaceAll("^\\.+", "");
        if (safe.isEmpty()) safe = "物理试题导出";
        String expectedExtension = extensionForMime(mimeType);
        if (!expectedExtension.isEmpty()) {
            String lower = safe.toLowerCase(Locale.ROOT);
            if (!lower.endsWith(expectedExtension)) {
                int dot = safe.lastIndexOf('.');
                if (dot > 0) safe = safe.substring(0, dot);
                safe += expectedExtension;
            }
        }
        return safe;
    }

    private static String extensionForMime(String mimeType) {
        String mime = mimeType == null ? "" : mimeType.trim().toLowerCase(Locale.ROOT);
        if ("application/json".equals(mime)) return ".json";
        if ("text/html".equals(mime)) return ".html";
        if ("text/csv".equals(mime)) return ".csv";
        if ("text/plain".equals(mime)) return ".txt";
        return "";
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !ASSET_HOST.equalsIgnoreCase(origin.getHost())) {
            request.deny();
            return;
        }
        String[] resources = request.getResources();
        if (resources == null || resources.length == 0) {
            request.deny();
            return;
        }
        if (resources.length != 1) {
            request.deny();
            return;
        }
        String resource = resources[0];
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                return;
            }
            if (pendingCameraPermissionRequest != null) pendingCameraPermissionRequest.deny();
            pendingCameraPermissionRequest = request;
            requestPermissions(new String[] { Manifest.permission.CAMERA }, REQUEST_CAMERA_PERMISSION);
            return;
        }
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                return;
            }
            if (pendingAudioPermissionRequest != null) pendingAudioPermissionRequest.deny();
            pendingAudioPermissionRequest = request;
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_AUDIO_PERMISSION);
            return;
        }
        request.deny();
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CAMERA_PERMISSION && requestCode != REQUEST_AUDIO_PERMISSION) return;
        boolean isCamera = requestCode == REQUEST_CAMERA_PERMISSION;
        PermissionRequest request = isCamera ? pendingCameraPermissionRequest : pendingAudioPermissionRequest;
        if (isCamera) {
            pendingCameraPermissionRequest = null;
        } else {
            pendingAudioPermissionRequest = null;
        }
        if (request == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] {
                isCamera
                    ? PermissionRequest.RESOURCE_VIDEO_CAPTURE
                    : PermissionRequest.RESOURCE_AUDIO_CAPTURE
            });
        } else {
            request.deny();
            Toast.makeText(
                this,
                isCamera ? "未获得摄像头权限，可改用相册图片。" : "未获得麦克风权限，无法采集声音频谱。",
                Toast.LENGTH_SHORT
            ).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_FILE) {
            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            if (filePathCallback != null) filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        if (requestCode == REQUEST_SAVE_BACKUP) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null
                && pendingExportText != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    if (stream == null) throw new IllegalStateException("Cannot open output stream");
                    stream.write(pendingExportText.getBytes(StandardCharsets.UTF_8));
                    stream.flush();
                    Toast.makeText(this, "题库备份已保存。", Toast.LENGTH_SHORT).show();
                } catch (Exception error) {
                    Log.e(TAG, "Failed to save backup", error);
                    Toast.makeText(this, "题库备份保存失败。", Toast.LENGTH_LONG).show();
                }
            }
            pendingExportText = null;
            return;
        }
        if (requestCode == REQUEST_SAVE_ATTACHMENT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null
                && pendingAttachmentBytes != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    if (stream == null) throw new IllegalStateException("Cannot open output stream");
                    stream.write(pendingAttachmentBytes);
                    stream.flush();
                    Toast.makeText(this, "附件已保存。", Toast.LENGTH_SHORT).show();
                } catch (Exception error) {
                    Log.e(TAG, "Failed to save attachment", error);
                    Toast.makeText(this, "附件保存失败。", Toast.LENGTH_LONG).show();
                }
            }
            pendingAttachmentBytes = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        classroomHostClosing = true;
        LanClassroomHost host = classroomHost;
        classroomHost = null;
        if (host != null) host.close();
        classroomExecutor.shutdownNow();
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        if (pendingCameraPermissionRequest != null) {
            pendingCameraPermissionRequest.deny();
            pendingCameraPermissionRequest = null;
        }
        if (pendingAudioPermissionRequest != null) {
            pendingAudioPermissionRequest.deny();
            pendingAudioPermissionRequest = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
