package io.github.mohhp.essentialduas

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.gson.Gson
import com.google.gson.JsonParser
import io.github.mohhp.essentialduas.reminders.PrayerAlarmScheduler
import io.github.mohhp.essentialduas.reminders.ReminderPermissionChecker
import io.github.mohhp.essentialduas.reminders.ReminderRepository
import io.github.mohhp.essentialduas.reminders.SystemReminderPermissionChecker
import java.io.FileNotFoundException
import java.io.InputStream
import java.util.Locale

class MainActivity : AppCompatActivity(), ReminderPermissionChecker {
    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var repository: ReminderRepository
    private lateinit var scheduler: PrayerAlarmScheduler
    private lateinit var bridge: ReminderBridge
    private lateinit var permissionChecker: SystemReminderPermissionChecker
    private val gson = Gson()

    private var pendingGeoRequest: Triple<String, GeolocationPermissions.Callback, Boolean>? = null

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        ensureReminderPermissions(autoChain = false)
        scheduler.rescheduleAll("notifications-updated")
        publishReminderStateToWeb("notifications-updated")
    }

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoRequest?.let { (origin, callback, retain) ->
            callback.invoke(origin, granted, retain)
        }
        pendingGeoRequest = null
    }

    private val exactAlarmSettingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        scheduler.rescheduleAll("exact-alarm-settings")
        publishReminderStateToWeb("exact-alarm-settings")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        repository = ReminderRepository(this)
        permissionChecker = SystemReminderPermissionChecker(this)
        scheduler = PrayerAlarmScheduler(this, repository, permissionChecker)
        bridge = ReminderBridge(this, repository, scheduler)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        webView = findViewById(R.id.webView)

        configureWebView()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(APP_URL)
        }

        scheduler.rescheduleAll("app-create")
    }

    override fun onResume() {
        super.onResume()

        val permissionsReady = canPostNotifications() && canScheduleExactAlarms()
        if (!permissionsReady) {
            repository.disableRemindersDueToPermissionRevocation("permissions-revoked-on-resume")
            scheduler.cancelAll(saveState = true)
            publishReminderStateToWeb("permissions-revoked")
            ensureReminderPermissions(autoChain = false)
            return
        }

        scheduler.rescheduleAll("activity-resume")
        publishReminderStateToWeb("activity-resume")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        publishReminderStateToWeb("new-intent")
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun canScheduleExactAlarms(): Boolean = permissionChecker.canScheduleExactAlarms()

    override fun canPostNotifications(): Boolean = permissionChecker.canPostNotifications()

    fun ensureReminderPermissions(autoChain: Boolean) {
        when {
            !canPostNotifications() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }

            !canScheduleExactAlarms() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:$packageName")
                }
                exactAlarmSettingsLauncher.launch(intent)
            }

            autoChain -> {
                scheduler.rescheduleAll("permissions-ready")
                publishReminderStateToWeb("permissions-ready")
            }
        }
    }

    fun buildBridgeStateJson(reason: String): String {
        val state = repository.getState()
        val payload = linkedMapOf<String, Any?>(
            "nativeReminderSupported" to true,
            "permissions" to mapOf(
                "notificationsGranted" to canPostNotifications(),
                "exactAlarmGranted" to canScheduleExactAlarms(),
                "ready" to (canPostNotifications() && canScheduleExactAlarms())
            ),
            "settings" to JsonParser.parseString(gson.toJson(state.settings)),
            "location" to state.location?.let { JsonParser.parseString(gson.toJson(it)) },
            "nextReminder" to state.nextReminder?.let { JsonParser.parseString(gson.toJson(it)) },
            "reason" to reason,
            "lastSyncReason" to state.lastSyncReason,
            "lastSyncedAt" to state.lastSyncedAt
        )
        return gson.toJson(payload)
    }

    fun publishReminderStateToWeb(reason: String) {
        if (!::webView.isInitialized) return
        val payload = buildBridgeStateJson(reason)
        val escaped = org.json.JSONObject.quote(payload)
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    const detail = JSON.parse($escaped);
                    window.dispatchEvent(new CustomEvent('android-prayer-reminder-state', { detail }));
                })();
                """.trimIndent(),
                null
            )
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
        swipeRefresh.setOnChildScrollUpCallback { _, _ ->
            // Allow pull-to-refresh only when the WebView is already at top.
            webView.canScrollVertically(-1)
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            databaseEnabled = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        WebView.setWebContentsDebuggingEnabled(false)

        webView.addJavascriptInterface(bridge, "AndroidPrayerBridge")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                if (origin == null || callback == null) return
                val fineGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                val coarseGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                if (fineGranted || coarseGranted) {
                    callback.invoke(origin, true, false)
                    return
                }
                pendingGeoRequest = Triple(origin, callback, false)
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }
        webView.webViewClient = AssetWebViewClient()
    }

    private fun openExternalUri(uri: Uri) {
        runCatching {
            CustomTabsIntent.Builder().build().launchUrl(this, uri)
        }.onFailure {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        }
    }

    fun openStoreUpdate(url: String?): Boolean {
        val target = url?.trim().orEmpty().ifBlank { APP_PLAY_STORE_URL }
        val parsed = runCatching { Uri.parse(target) }.getOrNull() ?: return false
        runOnUiThread {
            openExternalUri(parsed)
        }
        return true
    }

    private inner class AssetWebViewClient : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            swipeRefresh.isRefreshing = false
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val uri = request?.url ?: return false
            if (uri.scheme != "https") return false
            if (uri.host == APP_HOST) return false
            openExternalUri(uri)
            return true
        }

        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
            val uri = request?.url ?: return null
            if (uri.scheme != "https" || uri.host != APP_HOST) return null
            val assetPath = uri.path.orEmpty().removePrefix("/").ifBlank { "index.html" }
            val inputStream = openAsset(assetPath) ?: return null
            val mimeType = guessMimeType(assetPath)
            return WebResourceResponse(mimeType, "utf-8", inputStream)
        }

        private fun openAsset(path: String): InputStream? {
            return try {
                assets.open(path)
            } catch (_: FileNotFoundException) {
                null
            }
        }

        private fun guessMimeType(path: String): String {
            val lower = path.lowercase(Locale.US)
            return when {
                lower.endsWith(".html") -> "text/html"
                lower.endsWith(".js") -> "application/javascript"
                lower.endsWith(".css") -> "text/css"
                lower.endsWith(".json") -> "application/json"
                lower.endsWith(".png") -> "image/png"
                lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
                lower.endsWith(".svg") -> "image/svg+xml"
                lower.endsWith(".mp3") -> "audio/mpeg"
                lower.endsWith(".opus") -> "audio/ogg"
                lower.endsWith(".woff2") -> "font/woff2"
                else -> "text/plain"
            }
        }
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val APP_URL = "https://appassets.androidplatform.net/index.html"
        private const val APP_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=io.github.mohhp.essentialduas"
    }
}