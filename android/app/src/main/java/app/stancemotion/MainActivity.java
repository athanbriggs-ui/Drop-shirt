package app.stancemotion;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONException;
import org.json.JSONObject;

/** Shows the web app full screen and gives it a bridge ("Native") to the background watcher. */
public class MainActivity extends Activity {
    static final String URL = "https://athanbriggs-ui.github.io/Drop-shirt/";
    static final String EXTRA_NUDGE = "nudge";
    /** True while the app is on screen, so the watcher never nudges someone who is training. */
    static volatile boolean visible = false;

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff101216);
        getWindow().setNavigationBarColor(0xff101216);

        web = new WebView(this);
        web.setBackgroundColor(0xff101216);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // coach clips play without a tap
        web.setWebChromeClient(new WebChromeClient()); // needed for confirm() dialogs
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith(URL)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true; // outside links (sources, downloads) open in the browser
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);

        if (state != null) web.restoreState(state);
        else web.loadUrl(startUrl(getIntent()));

        NudgeService.sync(this);
    }

    private static String startUrl(Intent intent) {
        return intent != null && intent.getBooleanExtra(EXTRA_NUDGE, false) ? URL + "?nudge=1" : URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra(EXTRA_NUDGE, false)) web.loadUrl(startUrl(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
        web.evaluateJavascript("window.onNativeResume&&window.onNativeResume()", null);
    }

    @Override
    protected void onPause() {
        visible = false;
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        web.evaluateJavascript("window.onNativeResume&&window.onNativeResume()", null);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Methods the web page can call as window.Native.xxx(). They run on a background thread. */
    private final class Bridge {
        @JavascriptInterface
        public String getState() {
            SharedPreferences p = Prefs.get(MainActivity.this);
            JSONObject o = new JSONObject();
            try {
                o.put("on", p.getBoolean("on", false));
                o.put("socialMin", Prefs.SOCIAL_MIN);
                o.put("stillMin", Prefs.STILL_MIN);
                o.put("notif", Prefs.canNotify(MainActivity.this));
                o.put("usage", Prefs.hasUsageAccess(MainActivity.this));
                o.put("running", NudgeService.running);
            } catch (JSONException ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public void set(String key, String value) {
            Prefs.set(MainActivity.this, key, value);
            if ("on".equals(key)) runOnUiThread(() -> NudgeService.sync(MainActivity.this));
        }

        @JavascriptInterface
        public void sessionDone() {
            Prefs.get(MainActivity.this).edit().putLong("lastSession", System.currentTimeMillis()).apply();
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && !Prefs.canNotify(MainActivity.this)) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
                }
            });
        }

        @JavascriptInterface
        public void openUsageAccess() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void testNudge() {
            NudgeService.post(MainActivity.this, "Test nudge. This is what one looks like.", false);
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> web.setKeepScreenOn(on));
        }
    }
}
