pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        exclusiveContent {
            forRepository {
                maven {
                    name = "JitPack"
                    url = uri("https://jitpack.io")
                }
            }
            filter { includeGroup("com.github.mik3y") }
        }
    }
}

rootProject.name = "DC34BadgeManager"
include(":app")
