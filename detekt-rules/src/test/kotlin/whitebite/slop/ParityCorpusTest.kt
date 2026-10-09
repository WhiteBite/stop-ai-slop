package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

private class ExpectedFinding(val rule: String, val line: Int)

private class ParityCase(val name: String, val lines: List<String>, val expected: List<ExpectedFinding>)

class ParityCorpusTest {
    private val cases = readCorpus()
    private val rules = StopAiSlopProvider().instance(Config.empty).rules.map { it as Rule }
    private val slopRuleIdField = StopAiSlopRule::class.java.getDeclaredField("slopRuleId").apply { isAccessible = true }

    @Test
    fun `kotlin detector findings match the JS verdict corpus`() {
        assertTrue(cases.isNotEmpty(), "parity corpus is empty")
        val mismatches = cases.mapNotNull { case ->
            val actual = findings(case).sorted()
            val expected = case.expected.map { "${it.rule}@${it.line}" }.sorted()
            if (actual == expected) {
                null
            } else {
                "case ${case.name}:\n  expected: $expected\n  actual:   $actual"
            }
        }
        assertTrue(mismatches.isEmpty(), "kotlin/JS parity drift:\n" + mismatches.joinToString("\n"))
    }

    private fun findings(case: ParityCase): List<String> {
        val text = case.lines.joinToString("\n") + "\n"
        val out = ArrayList<String>()
        for (rule in rules) {
            val id = slopRuleId(rule)
            for (finding in rule.lint(text)) out += "$id@${finding.entity.location.source.line}"
        }
        return out
    }

    private fun slopRuleId(rule: Rule): String = slopRuleIdField.get(rule) as String
}

private fun readCorpus(): List<ParityCase> {
    val text = ParityCorpusTest::class.java.getResourceAsStream("/parity-corpus.json")?.bufferedReader()?.use { it.readText() }
        ?: fail("parity-corpus.json not found on the test classpath")
    val root = JsonParser(text).parse() as? List<Any?> ?: fail("parity-corpus.json is not a JSON array")
    return root.map { entry ->
        val map = entry as? Map<*, *> ?: fail("corpus entry is not an object")
        val name = map["name"] as? String ?: fail("corpus entry has no name")
        val lines = (map["lines"] as? List<*>)?.map { it as String } ?: fail("case $name has no lines")
        @Suppress("UNCHECKED_CAST")
        val expected = (map["expected"] as? List<*>).orEmpty().map { e ->
            val em = e as? Map<*, *> ?: fail("case $name has a malformed expected entry")
            ExpectedFinding(em["rule"] as String, (em["line"] as Number).toInt())
        }
        ParityCase(name, lines, expected)
    }
}

// no JSON library on the detekt test classpath — minimal recursive-descent parser
private class JsonParser(private val text: String) {
    private var i = 0

    fun parse(): Any? {
        skip()
        val value = read()
        skip()
        return value
    }

    private fun skip() {
        while (i < text.length && text[i].isWhitespace()) i++
    }

    private fun read(): Any? {
        if (i >= text.length) throw IllegalArgumentException("unexpected end of JSON")
        return when (text[i]) {
            '{' -> readObject()
            '[' -> readArray()
            '"' -> readString()
            't' -> literal("true", true)
            'f' -> literal("false", false)
            'n' -> literal("null", null)
            else -> readNumber()
        }
    }

    private fun readObject(): Map<String, Any?> {
        val out = LinkedHashMap<String, Any?>()
        i++
        skip()
        if (text[i] == '}') {
            i++
            return out
        }
        while (true) {
            skip()
            val key = readString()
            skip()
            i++
            skip()
            out[key] = read()
            skip()
            when (text[i]) {
                ',' -> i++
                '}' -> {
                    i++
                    return out
                }
                else -> throw IllegalArgumentException("expected , or } at $i")
            }
        }
    }

    private fun readArray(): List<Any?> {
        val out = ArrayList<Any?>()
        i++
        skip()
        if (text[i] == ']') {
            i++
            return out
        }
        while (true) {
            skip()
            out += read()
            skip()
            when (text[i]) {
                ',' -> i++
                ']' -> {
                    i++
                    return out
                }
                else -> throw IllegalArgumentException("expected , or ] at $i")
            }
        }
    }

    private fun readString(): String {
        val sb = StringBuilder()
        i++
        while (true) {
            when (val c = text[i++]) {
                '"' -> return sb.toString()
                '\\' -> {
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
                }
                else -> sb.append(c)
            }
        }
    }

    private fun literal(word: String, value: Any?): Any? {
        if (!text.startsWith(word, i)) throw IllegalArgumentException("expected $word at $i")
        i += word.length
        return value
    }

    private fun readNumber(): Number {
        val start = i
        if (text[i] == '-') i++
        while (i < text.length && (text[i].isDigit() || text[i] in ".-+eE")) i++
        val s = text.substring(start, i)
        return if (s.contains('.') || s.contains('e') || s.contains('E')) s.toDouble() else s.toLong()
    }
}