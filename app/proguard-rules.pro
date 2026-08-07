# The JavaScript bridge methods are called by name from bundled app assets.
-keepclassmembers class org.dc34.badgemanager.AndroidSerialBridge {
    @android.webkit.JavascriptInterface <methods>;
}
