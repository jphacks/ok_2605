package jp.jphacks.reminders.tests;

import android.app.Instrumentation;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Run ONLY in a disposable emulator with a freshly installed preview APK.
 * No external test dependencies; reflects the production APK's actual native code.
 * Fixture DB is produced by the real TypeScript schema initializer.
 */
public class NotificationAlarmTest extends Instrumentation {
  private Bundle args;
  private Context context;
  private SQLiteDatabase db;
  private String day, time, deadline;
  private long deadlineMillis;
  private Object scheduler;
  private Class<?> requestClass;
  private int assertions;

  @Override public void onCreate(Bundle arguments) { args = arguments; start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      context = getTargetContext();
      File file = new File(context.getFilesDir(), "SQLite/nomupay.db");
      if (!file.exists()) {
        if (!"unit".equals(args.getString("mode"))) throw new AssertionError("Run unit fixtures first");
        file.getParentFile().mkdirs();
        try (InputStream input = getContext().getAssets().open("fixture.db"); FileOutputStream output = new FileOutputStream(file)) {
          byte[] buffer = new byte[8192]; int count;
          while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
      }
      db = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READWRITE);
      try (android.database.Cursor timeout = db.rawQuery("PRAGMA busy_timeout = 5000", null)) { timeout.moveToFirst(); }
      scheduler = Class.forName("expo.modules.notifications.service.delegates.ExpoSchedulingDelegate")
        .getConstructor(Context.class).newInstance(context);
      requestClass = Class.forName("expo.modules.notifications.notifications.model.NotificationRequest");
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      manager.createNotificationChannel(new NotificationChannel("medication-reminders", "服薬リマインダー", NotificationManager.IMPORTANCE_HIGH));
      deadlineMillis = System.currentTimeMillis() / 60000 * 60000;
      deadline = iso(deadlineMillis);
      day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(deadlineMillis - 5 * 60000));
      time = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(deadlineMillis - 5 * 60000));
      String mode = args.getString("mode", "unit");
      if (mode.equals("unit")) unit(manager);
      else if (mode.equals("arm")) arm();
      else if (mode.equals("verify")) verify(manager);
      else throw new AssertionError("Unknown mode");
      result.putString("stream", "PASS " + mode + ": " + assertions + " assertions\n");
      finish(-1, result);
    } catch (Throwable failure) {
      result.putString("stream", android.util.Log.getStackTraceString(failure));
      finish(0, result);
    } finally { if (db != null) db.close(); }
  }

  private void unit(NotificationManager manager) throws Exception {
    check(count("SELECT count(*) FROM medications") == 0, "Safety: test requires an empty fresh emulator app");
    // Record the designated receiver: this is the component AlarmManager must wake.
    android.content.Intent intent = new android.content.Intent("expo.modules.notifications.NOTIFICATION_EVENT").setPackage(context.getPackageName());
    String receiver = context.getPackageManager().queryBroadcastReceivers(intent, 0).get(0).activityInfo.name;
    check(receiver.equals("expo.modules.notifications.service.NotificationsService"), "standard Expo OS receiver is selected");
    boolean removed = false;
    try { Class.forName("jp.jphacks.reminders.DeadlineSettlement"); }
    catch (ClassNotFoundException expected) { removed = true; }
    check(removed, "no native background settlement remains in the APK");
    Object request = request("nomupay:regression:unit", deadline, 1);
    schedule(request);
    check(getRequest("nomupay:regression:unit") != null, "deadline is reserved by the standard scheduler");
    scheduler.getClass().getMethod("triggerNotification", String.class).invoke(scheduler, "nomupay:regression:unit");
    String text = body(manager, "nomupay:regression:unit");
    check(text.contains("次回起動時にテスト決済を処理します"), "notification describes deferred settlement");
    check(!text.contains("決済完了"), "notification does not claim successful settlement");
    check(notification(manager, "nomupay:regression:unit").getNotification().contentIntent != null, "deadline has app-open action");
    check(count("SELECT count(*) FROM penalty_payments") == 0, "notification does not write payments");
    check(count("SELECT count(*) FROM penalty_attempts") == 0, "notification does not attempt settlement");
    cancel("nomupay:regression:unit");
    check(getRequest("nomupay:regression:unit") == null, "reservation is cancellable");
    manager.cancelAll();
  }

  private void arm() throws Exception {
    check(count("SELECT count(*) FROM medications WHERE id>=20") == 0, "arm is single-use");
    medication(20, "終了中の薬", 2000);
    medication(21, "終了中に服用済み", 2100);
    medication(22, "キャンセル済み", 2200);
    db.execSQL("INSERT INTO dose_records(medication_id, scheduled_day, taken_at, source) VALUES(21, ?, ?, 'nfc')", new Object[]{day, iso(deadlineMillis - 1)});
    schedule(request("nomupay:regression:closed", deadline, 20, 21));
    schedule(request("nomupay:regression:cancelled", deadline, 22));
    cancel("nomupay:regression:cancelled");
    check(getRequest("nomupay:regression:closed") != null, "deadline reservation remains");
    check(getRequest("nomupay:regression:cancelled") == null, "taken-dose reservation cancelled");
    // Instrumentation may finish immediately; flush Expo's asynchronous store
    // before killing this test process. The production receiver is unmodified.
    context.getSharedPreferences("expo.modules.notifications.SharedPreferencesNotificationsStore", 0).edit().commit();
    context.getSharedPreferences("native-test", 0).edit().putString("deadline", deadline).commit();
    check(count("SELECT count(*) FROM penalty_payments WHERE medication_id>=20") == 0, "not settled before OS alarm");
  }

  private void verify(NotificationManager manager) throws Exception {
    deadline = context.getSharedPreferences("native-test", 0).getString("deadline", "");
    check(count("SELECT count(*) FROM penalty_payments") == 0, "closed-app OS delivery never creates a payment");
    check(count("SELECT count(*) FROM penalty_attempts") == 0, "closed-app OS delivery never attempts settlement");
    // Starting instrumentation force-stops the target and can clear its tray.
    // Inspect dumpsys notification BEFORE running verify for OS display evidence.
    check(getRequest("nomupay:regression:cancelled") == null, "cancelled alarm is still absent");
  }

  private void medication(int id, String name, int amount) {
    db.execSQL("INSERT INTO medications(id,name,dose_time,penalty_amount,created_at) VALUES(?,?,?,?,?)", new Object[]{id, name, time, amount, iso(deadlineMillis - 86400000)});
    db.execSQL("UPDATE medication_schedules SET grace_minutes=5 WHERE medication_id=?", new Object[]{id});
  }
  private Object request(String id, String deadline, int... ids) throws Exception {
    JSONArray occurrences = new JSONArray();
    for (int medicationId : ids) occurrences.put(new JSONObject().put("medicationId", medicationId).put("scheduledDay", day));
    JSONObject data = new JSONObject().put("kind", "medication-reminder").put("pattern", "deadline").put("demo", false).put("deadlineAt", deadline).put("occurrences", occurrences);
    Class<?> builderClass = Class.forName("expo.modules.notifications.notifications.model.NotificationContent$Builder");
    Object builder = builderClass.getConstructor().newInstance();
    builderClass.getMethod("setTitle", String.class).invoke(builder, "のむペイ｜服用期限を過ぎました");
    builderClass.getMethod("setText", String.class).invoke(builder, "終了中の薬：服用期限を過ぎました。次回起動時にテスト決済を処理します。実際の請求はありません。");
    builderClass.getMethod("setBody", JSONObject.class).invoke(builder, data);
    Object content = builderClass.getMethod("build").invoke(builder);
    Object trigger = Class.forName("expo.modules.notifications.notifications.triggers.DateTrigger").getConstructor(String.class, long.class).newInstance("medication-reminders", System.currentTimeMillis() + 15000);
    Constructor<?> constructor = requestClass.getConstructors()[0];
    return constructor.newInstance(id, content, trigger);
  }
  private void schedule(Object request) throws Exception { Class.forName("expo.modules.notifications.service.interfaces.SchedulingDelegate").getMethod("scheduleNotification", requestClass).invoke(scheduler, request); }
  private void cancel(String id) throws Exception { scheduler.getClass().getMethod("removeScheduledNotifications", java.util.Collection.class).invoke(scheduler, Collections.singletonList(id)); }
  private Object getRequest(String id) throws Exception { return scheduler.getClass().getMethod("getScheduledNotification", String.class).invoke(scheduler, id); }
  private long count(String sql) { return DatabaseUtils.longForQuery(db, sql, null); }
  private void check(boolean value, String message) { if (!value) throw new AssertionError(message); assertions++; }
  private StatusBarNotification notification(NotificationManager manager, String tag) {
    // NotificationManager accepts synchronously, but system-server publishes asynchronously.
    for (int retry = 0; retry < 100; retry++) {
      for (StatusBarNotification item : manager.getActiveNotifications()) if (tag.equals(item.getTag())) return item;
      android.os.SystemClock.sleep(50);
    }
    throw new AssertionError("Notification not posted: " + tag);
  }
  private String body(NotificationManager manager, String tag) { return notification(manager, tag).getNotification().extras.getCharSequence("android.text").toString(); }
  private String iso(long millis) {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(millis));
  }
}
