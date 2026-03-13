import org.gradle.api.tasks.Sync
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val repoRoot = rootProject.projectDir.parentFile
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/web-assets/main")
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

fun propOrEnv(key: String, envKey: String = key): String? {
    return keystoreProperties.getProperty(key) ?: System.getenv(envKey)
}

android {
    namespace = "io.github.mohhp.essentialduas"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.mohhp.essentialduas"
        minSdk = 26
        targetSdk = 35
        versionCode = 13
        versionName = "2.1.3"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        val storeFilePath = propOrEnv("storeFile", "KEYSTORE_FILE")
        val storePasswordValue = propOrEnv("storePassword", "KEYSTORE_PASSWORD")
        val keyAliasValue = propOrEnv("keyAlias", "KEY_ALIAS")
        val keyPasswordValue = propOrEnv("keyPassword", "KEY_PASSWORD")

        if (!storeFilePath.isNullOrBlank() && !storePasswordValue.isNullOrBlank() && !keyAliasValue.isNullOrBlank() && !keyPasswordValue.isNullOrBlank()) {
            create("release") {
                storeFile = file(storeFilePath)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.named("main") {
        assets.srcDir(generatedWebAssetsDir)
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

val syncWebAssets by tasks.registering(Sync::class) {
    from(repoRoot) {
        include(
            "index.html",
            "offline.html",
            "privacy.html",
            "manifest.json",
            "sw.js",
            "app.js",
            "app.min.js",
            "styles.css",
            "styles.min.css",
            "pashto.js",
            "pashto-translation-player.js",
            "version.json",
            "icon-*.png",
            "audio/duas/**",
            "audio/reminders/**",
            "audio/pashto_audit/*.json",
            "vendor/**",
            "chrome/**"
        )
        exclude("android/**")
    }
    into(generatedWebAssetsDir)
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("com.batoulapps.adhan:adhan:1.2.1")
}
