package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopAiVocabDensityTest {
    private val rule = StopAiSlopAiVocabDensity(TestConfig())

    @Test
    fun `three distinct tokens across three comments fire once at the first token line`() {
        val findings = rule.lint(
            lines(
                "val a = 1",
                "// delve into the details",
                "val b = 2",
                "// a pivotal choice",
                "val c = 3",
                "// rich tapestry of cases",
                "val d = 4",
            ),
        )
        assertEquals(1, findings.size)
        assertEquals(2, findings[0].entity.location.source.line)
    }

    @Test
    fun `two distinct tokens are not flagged`() {
        assertEquals(
            0,
            rule.lint(lines("// delve into the details", "val a = 1", "// a pivotal choice", "val b = 2")).size,
        )
    }

    @Test
    fun `same token twice plus one other is not flagged`() {
        assertEquals(
            0,
            rule.lint(
                lines(
                    "// delve into the details",
                    "val a = 1",
                    "// Delve deeper still",
                    "val b = 2",
                    "// a pivotal choice",
                    "val c = 3",
                ),
            ).size,
        )
    }

    @Test
    fun `tokens inside kdoc are not counted`() {
        assertEquals(
            0,
            rule.lint(
                lines(
                    "/**",
                    " * delve into the pivotal tapestry",
                    " */",
                    "fun f() {}",
                ),
            ).size,
        )
    }

    @Test
    fun `inline comment tokens count`() {
        assertEquals(
            1,
            rule.lint(
                lines(
                    "val a = 1 // delve into the details",
                    "val b = 2 // a pivotal choice",
                    "val c = 3 // rich tapestry of cases",
                ),
            ).size,
        )
    }
}
