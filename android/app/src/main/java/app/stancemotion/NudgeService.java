package app.stancemotion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.util.HashMap;
import java.util.Map;

/**
 * The background watcher. Runs as a foreground service so Android keeps it alive with the app closed.
 * It only does work while the screen is on:
 *   - unlock: nudge when the phone is unlocked
 *   - social: nudge after SOCIAL_MIN minutes straight in a social media app
 *   - still:  nudge after STILL_MIN minutes of screen time with no real movement
 * Every nudge also has to pass Prefs.due(): switched on, inside the chosen hours, no session today,
 * and not too soon after the last one.
 */
public class NudgeService extends Service implements SensorEventListener {
    static volatile boolean running = false;

    private static final String CH_WATCH = "watch";
    private static final String CH_NUDGE = "nudge";
    private static final long TICK_MS = 30000;
    private static final long SAMPLE_MS = 1500;
    /** Spread of acceleration (m/s2) over one sample that counts as walking or drilling, not just holding the phone. */
    private static final double ACTIVE_STDDEV = 1.2;

    private static final Map<String, String> SOCIAL = new HashMap<>();
    static {
        SOCIAL.put("com.instagram.android", "Instagram");
        SOCIAL.put("com.instagram.barcelona", "Threads");
        SOCIAL.put("com.zhiliaoapp.musically", "TikTok");
        SOCIAL.put("com.ss.android.ugc.trill", "TikTok");
        SOCIAL.put("com.snapchat.android", "Snapchat");
        SOCIAL.put("com.google.android.youtube", "YouTube");
        SOCIAL.put("com.twitter.android", "X");
        SOCIAL.put("com.facebook.katana", "Facebook");
        SOCIAL.put("com.reddit.frontpage", "Reddit");
        SOCIAL.put("tv.twitch.android.app", "Twitch");
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SensorManager sensors;
    private boolean screenOn;
    private long lastActive;     // last time the screen came on or the phone really moved
    private String socialPkg;    // social app currently on screen, if any
    private long socialSince;

    // One motion sample: running sums for the standard deviation of acceleration magnitude.
    private int n;
    private double sum, sumSq;

    static void sync(Context c) {
        Intent i = new Intent(c, NudgeService.class);
        try {
            if (Prefs.get(c).getBoolean("on", false)) c.startForegroundService(i);
            else c.stopService(i);
        } catch (Exception ignored) {
            // Android can refuse a background start; the next time the app opens it starts again.
        }
    }

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String a = intent.getAction();
            if (Intent.ACTION_SCREEN_ON.equals(a)) {
                onScreen(true);
            } else if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                onScreen(false);
            } else if (Intent.ACTION_USER_PRESENT.equals(a)) {
                if (Prefs.get(context).getBoolean("pickup", true) && Prefs.due(context)) {
                    post(context, "You just picked up your phone and you have not trained today.", true);
                }
            }
        }
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!screenOn) return;
            startSample();
            checkSocial();
            checkStill();
            handler.postDelayed(this, TICK_MS);
        }
    };

    private final Runnable endSample = this::finishSample;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        channels(this);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);

        startForeground(1, new Notification.Builder(this, CH_WATCH)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Nudges are on")
                .setContentText("Watching for lazy time on days you have not trained.")
                .setContentIntent(openApp(this, false))
                .setOngoing(true)
                .build());

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, f);

        onScreen(((PowerManager) getSystemService(POWER_SERVICE)).isInteractive());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) { }
        sensors.unregisterListener(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void onScreen(boolean on) {
        screenOn = on;
        handler.removeCallbacks(tick);
        socialPkg = null;
        if (on) {
            lastActive = System.currentTimeMillis();
            handler.postDelayed(tick, TICK_MS);
        } else {
            sensors.unregisterListener(this);
        }
    }

    // ---- social media ----

    private void checkSocial() {
        SharedPreferences p = Prefs.get(this);
        if (!p.getBoolean("social", true) || !Prefs.hasUsageAccess(this)) return;
        String pkg = foregroundApp();
        long now = System.currentTimeMillis();
        if (pkg == null || !SOCIAL.containsKey(pkg)) {
            socialPkg = null;
            return;
        }
        if (!pkg.equals(socialPkg)) {
            socialPkg = pkg;
            socialSince = now;
            return;
        }
        long mins = (now - socialSince) / 60000;
        if (mins >= Prefs.SOCIAL_MIN && Prefs.due(this)) {
            post(this, mins + " minutes on " + SOCIAL.get(pkg) + " and no training today. Go drill.", true);
            socialSince = now;
        }
    }

    /** Package of the app on screen: the last one Android reports moving to the foreground. */
    @SuppressWarnings("deprecation")
    private String foregroundApp() {
        try {
            UsageStatsManager usm = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
            long now = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(now - 2 * 60 * 60 * 1000L, now);
            UsageEvents.Event e = new UsageEvents.Event();
            String pkg = null;
            while (events.hasNextEvent()) {
                events.getNextEvent(e);
                if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) pkg = e.getPackageName();
            }
            return pkg;
        } catch (Exception ex) {
            return null;
        }
    }

    // ---- sitting still ----

    private void checkStill() {
        if (!Prefs.get(this).getBoolean("still", true)) return;
        long now = System.currentTimeMillis();
        if (now - lastActive >= Prefs.STILL_MIN * 60000L && Prefs.due(this)) {
            post(this, "Screen on for " + Prefs.STILL_MIN + " minutes and you have not moved. Get up and get in your stance.", true);
            lastActive = now;
        }
    }

    private void startSample() {
        Sensor accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accel == null) return;
        n = 0; sum = 0; sumSq = 0;
        sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
        handler.removeCallbacks(endSample);
        handler.postDelayed(endSample, SAMPLE_MS);
    }

    private void finishSample() {
        sensors.unregisterListener(this);
        if (n < 5) return;
        double mean = sum / n;
        double stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
        if (stddev >= ACTIVE_STDDEV) lastActive = System.currentTimeMillis();
    }

    @Override
    public void onSensorChanged(SensorEvent ev) {
        double m = Math.sqrt(ev.values[0] * ev.values[0] + ev.values[1] * ev.values[1] + ev.values[2] * ev.values[2]);
        n++; sum += m; sumSq += m * m;
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    // ---- notifications ----

    private static void channels(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_WATCH, "Background watcher", NotificationManager.IMPORTANCE_MIN));
        NotificationChannel nudge = new NotificationChannel(CH_NUDGE, "Nudges", NotificationManager.IMPORTANCE_HIGH);
        nudge.enableVibration(true);
        nm.createNotificationChannel(nudge);
    }

    private static PendingIntent openApp(Context c, boolean nudge) {
        Intent i = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_NUDGE, nudge);
        return PendingIntent.getActivity(c, nudge ? 1 : 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Sends a nudge. `record` starts the "not again for a while" timer; test nudges skip it. */
    static void post(Context c, String text, boolean record) {
        channels(c);
        if (record) Prefs.get(c).edit().putLong("lastNudge", System.currentTimeMillis()).apply();
        Notification n = new Notification.Builder(c, CH_NUDGE)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Stance & Motion")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(openApp(c, true))
                .setAutoCancel(true)
                .build();
        try {
            ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).notify(2, n);
        } catch (SecurityException ignored) { }
    }
}
