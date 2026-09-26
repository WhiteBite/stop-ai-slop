plugins {
    kotlin("jvm") version "2.0.21"
}

group = "whitebite"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("io.gitlab.arturbosch.detekt:detekt-api:1.23.7")
    testImplementation("io.gitlab.arturbosch.detekt:detekt-test:1.23.7")
    testImplementation(kotlin("test-junit"))
}

kotlin {
    jvmToolchain(17)
}

tasks.test {
    useJUnit()
}
