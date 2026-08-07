package org.dc34.badgemanager;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;

import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class UsbSerialController {
    interface Callback {
        void resolve(String requestId);
        void reject(String requestId, String errorName, String message);
        void disconnected(String sessionId);
        void attached();
    }

    private static final String ACTION_USB_PERMISSION = "org.dc34.badgemanager.USB_PERMISSION";
    private static final String EXTRA_REQUEST_ID = "org.dc34.badgemanager.REQUEST_ID";
    private static final String EXTRA_SESSION_ID = "org.dc34.badgemanager.SESSION_ID";
    private static final int WRITE_TIMEOUT_MS = 5_000;
    private static final int EXPECTED_BAUD = 1_000_000;

    private final Activity activity;
    private final UsbManager usbManager;
    private final Callback callback;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final ByteQueue receiveQueue = new ByteQueue(256 * 1024);
    private final Object portLock = new Object();

    private volatile UsbSerialDriver selectedDriver;
    private volatile int selectedPortIndex;
    private volatile String selectedSessionId;
    private String openSessionId;
    private UsbDeviceConnection connection;
    private UsbSerialPort port;
    private SerialInputOutputManager inputOutputManager;
    private PendingPermission pendingPermission;
    private String pendingSelectionRequestId;
    private String pendingSelectionSessionId;
    private int nextPermissionRequestCode = 1;
    private volatile boolean destroyed;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if (ACTION_USB_PERMISSION.equals(action)) {
                String requestId = intent.getStringExtra(EXTRA_REQUEST_ID);
                String sessionId = intent.getStringExtra(EXTRA_SESSION_ID);
                PendingPermission pending = pendingPermission;
                if (pending == null || !pending.matches(requestId, sessionId, device)) return;
                pendingPermission = null;
                UsbSerialDriver driver;
                String selectedSession;
                synchronized (portLock) {
                    driver = selectedDriver;
                    selectedSession = selectedSessionId;
                }
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted && usbManager.hasPermission(device) && driver != null &&
                        sessionId.equals(selectedSession) &&
                        driver.getDevice().getDeviceId() == device.getDeviceId()) {
                    callback.resolve(pending.requestId);
                } else {
                    clearSelection(sessionId);
                    callback.reject(pending.requestId, "SecurityError", "USB permission was not granted.");
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                PendingPermission pending = pendingPermission;
                if (device != null && pending != null && pending.deviceId == device.getDeviceId()) {
                    pendingPermission = null;
                    clearSelection(pending.sessionId);
                    callback.reject(pending.requestId, "NetworkError", "The USB device detached before permission completed.");
                }
                UsbSerialDriver driver;
                synchronized (portLock) { driver = selectedDriver; }
                if (device != null && driver != null &&
                        driver.getDevice().getDeviceId() == device.getDeviceId()) {
                    close(true);
                    clearSelection(null);
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) callback.attached();
        }
    };

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    UsbSerialController(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
        usbManager = (UsbManager) activity.getSystemService(Context.USB_SERVICE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else activity.registerReceiver(usbReceiver, filter);
    }

    void requestPort(String requestId, String sessionId) {
        activity.runOnUiThread(() -> {
            if (destroyed) {
                callback.reject(requestId, "InvalidStateError", "The Android activity is closing.");
                return;
            }
            if (sessionId == null || sessionId.isBlank()) {
                callback.reject(requestId, "TypeError", "The USB session identifier is missing.");
                return;
            }
            if (pendingSelectionRequestId != null || pendingPermission != null || selectedSessionId != null) {
                callback.reject(requestId, "InvalidStateError", "Another USB selection or connection is already active.");
                return;
            }
            pendingSelectionRequestId = requestId;
            pendingSelectionSessionId = sessionId;
            List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
            if (drivers.isEmpty()) {
                clearPendingSelection(requestId, sessionId);
                callback.reject(requestId, "NotFoundError", activity.getString(R.string.usb_no_devices));
                return;
            }
            if (drivers.size() == 1) {
                selectDriver(requestId, sessionId, drivers.get(0));
                return;
            }
            String[] names = new String[drivers.size()];
            for (int i = 0; i < drivers.size(); i++) names[i] = describe(drivers.get(i));
            new AlertDialog.Builder(activity)
                    .setTitle(R.string.usb_permission_title)
                    .setItems(names, (dialog, which) -> selectDriver(requestId, sessionId, drivers.get(which)))
                    .setOnCancelListener(dialog -> {
                        if (clearPendingSelection(requestId, sessionId)) {
                            callback.reject(requestId, "NotFoundError", "Device selection was cancelled.");
                        }
                    })
                    .show();
        });
    }

    private void selectDriver(String requestId, String sessionId, UsbSerialDriver driver) {
        if (!clearPendingSelection(requestId, sessionId)) return;
        synchronized (portLock) {
            selectedDriver = driver;
            selectedPortIndex = Math.max(0, driver.getPorts().size() - 1);
            selectedSessionId = sessionId;
        }
        UsbDevice device = driver.getDevice();
        if (usbManager.hasPermission(device)) {
            callback.resolve(requestId);
            return;
        }
        pendingPermission = new PendingPermission(requestId, sessionId, device.getDeviceId());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        Intent permissionIntent = new Intent(ACTION_USB_PERMISSION)
                .setPackage(activity.getPackageName())
                .putExtra(EXTRA_REQUEST_ID, requestId)
                .putExtra(EXTRA_SESSION_ID, sessionId);
        int requestCode = nextPermissionRequestCode++;
        usbManager.requestPermission(device,
                PendingIntent.getBroadcast(activity, requestCode, permissionIntent, flags));
    }

    void open(String requestId, String sessionId, int baudRate) {
        if (baudRate != EXPECTED_BAUD) {
            callback.reject(requestId, "NotSupportedError", "The DC34 badge requires 1,000,000 baud.");
            return;
        }
        UsbSerialDriver driver = selectedDriver;
        if (driver == null || sessionId == null || !sessionId.equals(selectedSessionId)) {
            callback.reject(requestId, "InvalidStateError", "Choose a USB serial device first.");
            return;
        }
        ioExecutor.execute(() -> {
            synchronized (portLock) {
                if (destroyed) {
                    callback.reject(requestId, "InvalidStateError", "The Android activity is closing.");
                    return;
                }
                if (port != null) {
                    callback.reject(requestId, "InvalidStateError", "The selected serial port is already open.");
                    return;
                }
                if (driver != selectedDriver || !sessionId.equals(selectedSessionId)) {
                    callback.reject(requestId, "InvalidStateError", "The selected USB session is no longer active.");
                    return;
                }
                try {
                    connection = usbManager.openDevice(driver.getDevice());
                    if (connection == null) throw new SecurityException("USB permission is missing or the badge is unavailable.");
                    UsbSerialPort candidate = driver.getPorts().get(selectedPortIndex);
                    port = candidate;
                    openSessionId = sessionId;
                    candidate.open(connection);
                    candidate.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
                    receiveQueue.clear();
                    inputOutputManager = new SerialInputOutputManager(candidate, new SerialInputOutputManager.Listener() {
                        @Override public void onNewData(byte[] data) { receiveQueue.offer(data); }
                        @Override public void onRunError(Exception error) { close(true); }
                    });
                    inputOutputManager.start();
                    callback.resolve(requestId);
                } catch (SecurityException error) {
                    closeLocked();
                    callback.reject(requestId, "SecurityError", safeMessage(error));
                } catch (Exception error) {
                    closeLocked();
                    callback.reject(requestId, "NetworkError", safeMessage(error));
                }
            }
        });
    }

    void write(String sessionId, byte[] bytes) throws IOException {
        synchronized (portLock) {
            if (port == null || !port.isOpen() || sessionId == null || !sessionId.equals(openSessionId)) {
                throw new IOException("No matching serial session is connected.");
            }
            port.write(bytes, WRITE_TIMEOUT_MS);
        }
    }

    byte[] readAvailable(String sessionId) throws IOException {
        synchronized (portLock) {
            if (port == null || !port.isOpen() || sessionId == null || !sessionId.equals(openSessionId)) {
                throw new IOException("No matching serial session is connected.");
            }
        }
        return receiveQueue.drain();
    }

    void closeSession(String sessionId) {
        boolean matches;
        synchronized (portLock) {
            matches = sessionId != null &&
                    (sessionId.equals(selectedSessionId) || sessionId.equals(openSessionId));
        }
        if (!matches) return;
        close(false);
        clearSelection(sessionId);
    }

    void close(boolean physical) {
        boolean wasOpen;
        String disconnectedSession;
        synchronized (portLock) {
            wasOpen = port != null;
            disconnectedSession = openSessionId;
            closeLocked();
        }
        if (physical) clearSelection(disconnectedSession);
        if (physical && wasOpen) callback.disconnected(disconnectedSession);
    }

    private void closeLocked() {
        SerialInputOutputManager manager = inputOutputManager;
        inputOutputManager = null;
        if (manager != null) manager.stop();
        UsbSerialPort currentPort = port;
        port = null;
        openSessionId = null;
        if (currentPort != null) try { currentPort.close(); } catch (IOException ignored) { }
        UsbDeviceConnection currentConnection = connection;
        connection = null;
        if (currentConnection != null) currentConnection.close();
        receiveQueue.clear();
    }

    void destroy() {
        destroyed = true;
        close(false);
        clearSelection(null);
        pendingPermission = null;
        pendingSelectionRequestId = null;
        pendingSelectionSessionId = null;
        try { activity.unregisterReceiver(usbReceiver); } catch (IllegalArgumentException ignored) { }
        ioExecutor.shutdownNow();
    }

    private boolean clearPendingSelection(String requestId, String sessionId) {
        if (!same(requestId, pendingSelectionRequestId) || !same(sessionId, pendingSelectionSessionId)) return false;
        pendingSelectionRequestId = null;
        pendingSelectionSessionId = null;
        return true;
    }

    private void clearSelection(String expectedSessionId) {
        synchronized (portLock) {
            if (expectedSessionId != null && !expectedSessionId.equals(selectedSessionId)) return;
            selectedDriver = null;
            selectedPortIndex = 0;
            selectedSessionId = null;
        }
    }

    private static boolean same(String left, String right) {
        return left == null ? right == null : left.equals(right);
    }

    private static final class PendingPermission {
        final String requestId;
        final String sessionId;
        final int deviceId;

        PendingPermission(String requestId, String sessionId, int deviceId) {
            this.requestId = requestId;
            this.sessionId = sessionId;
            this.deviceId = deviceId;
        }

        boolean matches(String requestId, String sessionId, UsbDevice device) {
            return device != null && deviceId == device.getDeviceId() &&
                    same(this.requestId, requestId) && same(this.sessionId, sessionId);
        }
    }

    private static String describe(UsbSerialDriver driver) {
        UsbDevice device = driver.getDevice();
        String name = device.getProductName();
        if (name == null || name.isBlank()) name = "USB serial device";
        return String.format(Locale.US, "%s · %04x:%04x · %d port%s", name,
                device.getVendorId(), device.getProductId(), driver.getPorts().size(),
                driver.getPorts().size() == 1 ? "" : "s");
    }

    private static String safeMessage(Throwable error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
