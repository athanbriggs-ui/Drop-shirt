package app.stancemotion;

import android.app.AppOpsManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;

import java.util.Calendar;

/** Nudge settings and the checks shared by the screen and the background watcher. */
final class Prefs {
    static final int SOCIAL_MIN = 5;
    static final int STILL_MIN = 20;

    private Prefs() {}

    static SharedPreferences get(Context c) {
        return c.getApplicationContext().getSharedPreferences("nudge", Context.MODE_PRIVATE);
    }

    /** Called from the web page: every value arrives as text. */
    static void set(Context c, String key, String value) {
        SharedPreferences.Editor e = get(c).edit();
        switch (key) {
            case "on": case "pickup": case "still": case "social":
                e.putBoolean(key, Boolean.parseBoolean(value));
                break;
            case "from": case "to": case "every":
                try { e.putInt(key, Integer.parseInt(value)); } catch (NumberFormatException ignored) { return; }
                break;
            default:
                return;
        }
        e.apply();
    }

    static boolean inHours(SharedPreferences p) {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        int from = p.getInt("from", 15), to = p.getInt("to", 21);
        return from <= to ? (h >= from && h < to) : (h >= from || h < to);
    }

    static boolean trainedToday(SharedPreferences p) {
        long last = p.getLong("lastSession", 0);
        if (last == 0) return false;
        Calendar a = Calendar.getInstance(), b = Calendar.getInstance();
        a.setTimeInMillis(last);
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    /** True when a nudge is allowed right now. */
    static boolean due(Context c) {
        SharedPreferences p = get(c);
        return p.getBoolean("on", false)
                && !MainActivity.visible
                && inHours(p)
                && !trainedToday(p)
                && System.currentTimeMillis() - p.getLong("lastNudge", 0) >= p.getInt("every", 60) * 60000L;
    }

    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled();
    }
}
