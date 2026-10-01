package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopSectionDividerTest {
    private val rule = StopAiSlopSectionDivider(TestConfig())

    @Test
    fun `full line divider is flagged`() {
        assertEquals(1, rule.lint(lines("// ==========", "val x = 1")).size)
    }

    @Test
    fun `inline divider is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1 // ==========")).size)
    }

    @Test
    fun `box drawing divider is flagged`() {
        assertEquals(1, rule.lint(lines("// " + ch(0x2500).repeat(8), "val x = 1")).size)
    }

    @Test
    fun `short dash line is clean`() {
        assertEquals(0, rule.lint(lines("// ---", "val x = 1")).size)
    }

    @Test
    fun `ordinary comment is clean`() {
        assertEquals(0, rule.lint(lines("// a - b", "val x = 1")).size)
    }
}