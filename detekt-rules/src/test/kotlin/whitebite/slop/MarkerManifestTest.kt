package whitebite.slop

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

class MarkerManifestTest {
    @Test
    fun `kotlin marker patterns match the generated manifest`() {
        val kt = readManifest()["kt"] ?: fail("marker-manifest.json has no kt section")
        assertTrue(kt.isNotEmpty(), "marker-manifest kt section is empty")
        val mismatches = kt.entries.mapNotNull { (name, expected) ->
            val actual = patternSourceOf(name)
                ?: return@mapNotNull "no runtime Pat found for $name"
            if (actual == expected) null else "$name:\n  manifest: $expected\n  runtime:  $actual"
        }
        assertTrue(mismatches.isEmpty(), "SlopMarkers.kt drifted from marker-manifest.json:\n" + mismatches.joinToString("\n"))
    }

    private fun patternSourceOf(name: String): String? {
        val indexed = Regex("""^(\w+)\[(\d+)\]$""").find(name)
        if (indexed === null) {
            val pat = fieldValue(name) as? Pat ?: return null
            return pat.raw.pattern()
        }
        val list = fieldValue(indexed.groupValues[1]) as? List<*> ?: return null
        val pat = list.getOrNull(indexed.groupValues[2].toInt()) as? Pat ?: return null
        return pat.raw.pattern()
    }

    private fun fieldValue(name: String): Any? {
        val field = runCatching { SlopMarkers::class.java.getDeclaredField(name) }.getOrNull() ?: return null
        field.isAccessible = true
        return field.get(SlopMarkers)
    }
}

private fun readManifest(): Map<String, Map<String, String>> {
    val text = MarkerManifestTest::class.java.getResourceAsStream("/marker-manifest.json")
        ?.bufferedReader(Charsets.UTF_8)
        ?.use { it.readText() }
        ?: fail("marker-manifest.json not found on the test classpath")
    return ManifestParser(text).parse()
}

// no JSON library on the detekt test classpath — minimal parser for the manifest's fixed shape
private class ManifestParser(private val text: String) {
    private var i = 0

    fun parse(): Map<String, Map<String, String>> {
        skip()
        expect('{')
        val out = LinkedHashMap<String, Map<String, String>>()
        skip()
        if (peek() == '}') {
            i++
            return out
        }
        while (true) {
            skip()
            val key = readString()
            skip()
            expect(':')
            skip()
            out[key] = readStringMap()
            skip()
            when (peek()) {
                ',' -> i++
                '}' -> {
                    i++
                    return out
                }
                else -> throw IllegalArgumentException("expected , or } at $i")
            }
        }
    }

    private fun readStringMap(): Map<String, String> {
        expect('{')
        val out = LinkedHashMap<String, String>()
        skip()
        if (peek() == '}') {
            i++
            return out
        }
        while (true) {
            skip()
            val key = readString()
            skip()
            expect(':')
            skip()
            out[key] = readString()
            skip()
            when (peek()) {
                ',' -> i++
                '}' -> {
                    i++
                    return out
                }
                else -> throw IllegalArgumentException("expected , or } at $i")
            }
        }
    }

    private fun readString(): String {
        expect('"')
        val sb = StringBuilder()
        while (true) {
            when (val c = text[i++]) {
                '"' -> return sb.toString()
                '\\' ->
                    when (val e = text[i++]) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            sb.append(text.substring(i, i + 4).toInt(16).toChar())
                            i += 4
                        }
                        else -> throw IllegalArgumentException("bad escape \\$e")
                    }
                else -> sb.append(c)
            }
        }
    }

    private fun skip() {
        while (i < text.length && text[i].isWhitespace()) i++
    }

    private fun peek(): Char = text[i]

    private fun expect(c: Char) {
        if (text[i] != c) throw IllegalArgumentException("expected $c at $i")
        i++
    }
}
