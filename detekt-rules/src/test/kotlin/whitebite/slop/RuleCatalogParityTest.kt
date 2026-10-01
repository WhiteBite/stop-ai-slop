package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

private class CatalogRule(val id: String, val severity: String, val message: String, val kotlinRule: String)

private class Catalog(val rules: List<CatalogRule>, val excludedIds: Set<String>)

class RuleCatalogParityTest {
    private val catalog = readCatalog()
    private val registered = StopAiSlopProvider().instance(Config.empty).rules.map { it as Rule }
    private val slopRuleIdField = StopAiSlopRule::class.java.getDeclaredField("slopRuleId").apply { isAccessible = true }

    @Test
    fun `provider registration and catalog kotlinRule names agree both ways`() {
        assertEquals(catalog.rules.size, registered.size, "registered rule count vs catalog rules size")
        val registeredNames = registered.map { it.issue.id }
        val catalogNames = catalog.rules.map { it.kotlinRule }
        val notInCatalog = registeredNames.filter { it !in catalogNames }
        val notRegistered = catalogNames.filter { it !in registeredNames }
        assertTrue(notInCatalog.isEmpty(), "registered rules missing from the catalog: $notInCatalog")
        assertTrue(notRegistered.isEmpty(), "catalog kotlinRule entries not registered by the provider: $notRegistered")
    }

    @Test
    fun `ported rule ids equal catalog ids and excluded ids stay unimplemented`() {
        val portedIds = registered.map { slopRuleId(it) }
        assertEquals(catalog.rules.map { it.id }.toSet(), portedIds.toSet())
        val leaked = portedIds.filter { it in catalog.excludedIds }
        assertTrue(leaked.isEmpty(), "excluded catalog ids implemented by the port: $leaked")
    }

    @Test
    fun `issue severity maps catalog error to Defect and warning to Style`() {
        val byId = catalog.rules.associateBy { it.id }
        for (rule in registered) {
            val entry = byId[slopRuleId(rule)] ?: fail("rule ${rule.issue.id} has no catalog entry")
            val expected = when (entry.severity) {
                "error" -> Severity.Defect
                "warning" -> Severity.Style
                else -> fail("unknown catalog severity for ${entry.id}: ${entry.severity}")
            }
            assertEquals(expected, rule.issue.severity, "severity of ${entry.id}")
        }
    }

    @Test
    fun `issue descriptions equal catalog messages`() {
        val byId = catalog.rules.associateBy { it.id }
        val mismatches = registered.mapNotNull { rule ->
            val entry = byId[slopRuleId(rule)] ?: fail("rule ${rule.issue.id} has no catalog entry")
            if (entry.message == rule.issue.description) {
                null
            } else {
                "${entry.id}:\n  catalog: ${entry.message}\n  kotlin:  ${rule.issue.description}"
            }
        }
        assertTrue(mismatches.isEmpty(), "issue descriptions differ from the catalog:\n" + mismatches.joinToString("\n"))
    }

    private fun slopRuleId(rule: Rule): String = slopRuleIdField.get(rule) as String
}

private fun readCatalog(): Catalog {
    var dir: File? = File(RuleCatalogParityTest::class.java.protectionDomain.codeSource.location.toURI()).canonicalFile
    while (dir != null && !File(dir, "rule-catalog.json").isFile) dir = dir.parentFile
    val root = dir ?: fail("rule-catalog.json not found above the compiled test classes")
    val text = File(root, "rule-catalog.json").readText()
    return Catalog(
        arrayObjects(text, "rules").map { obj ->
            CatalogRule(str(obj, "id"), str(obj, "severity"), str(obj, "message"), str(obj, "kotlinRule"))
        },
        arrayObjects(text, "excluded").map { obj -> str(obj, "id") }.toSet(),
    )
}

private fun arrayObjects(text: String, key: String): List<String> {
    val keyAt = text.indexOf("\"$key\"")
    if (keyAt == -1) fail("catalog has no \"$key\" array")
    val open = text.indexOf('[', keyAt)
    var depth = 0
    var inString = false
    var i = open
    while (i < text.length) {
        val c = text[i]
        if (inString) {
            if (c == '\\') i++
            else if (c == '"') inString = false
        } else {
            when (c) {
                '"' -> inString = true
                '[', '{' -> depth++
                ']', '}' -> {
                    depth--
                    if (depth == 0) return objectsIn(text.substring(open + 1, i))
                }
            }
        }
        i++
    }
    fail("catalog \"$key\" array is unterminated")
}

private fun objectsIn(body: String): List<String> {
    val objects = ArrayList<String>()
    var depth = 0
    var inString = false
    var start = -1
    var i = 0
    while (i < body.length) {
        val c = body[i]
        if (inString) {
            if (c == '\\') i++
            else if (c == '"') inString = false
        } else {
            when (c) {
                '"' -> inString = true
                '{' -> {
                    if (depth == 0) start = i
                    depth++
                }
                '}' -> {
                    depth--
                    if (depth == 0 && start != -1) {
                        objects.add(body.substring(start, i + 1))
                        start = -1
                    }
                }
            }
        }
        i++
    }
    return objects
}

private fun str(obj: String, key: String): String {
    val match = Regex("\"$key\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(obj)
        ?: fail("catalog object has no \"$key\" field: $obj")
    return match.groupValues[1].replace("\\\"", "\"").replace("\\\\", "\\")
}
