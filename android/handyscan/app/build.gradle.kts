plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.notarwoinar.handyscan"
    compileSdk = 34

    defaultConfig {
        applicationId = "de.notarwoinar.handyscan"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "2.0"
    }

    // Fester Schlüssel im Repo, damit sich jede neue Version über die alte installieren lässt.
    // Es ist ein reiner Installationsschlüssel ohne Geheimnis (App wird nicht im Play Store verteilt).
    signingConfigs {
        create("buero") {
            storeFile = file("buero.keystore")
            storePassword = "handyscan"
            keyAlias = "handyscan"
            keyPassword = "handyscan"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("buero")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("buero")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
}
