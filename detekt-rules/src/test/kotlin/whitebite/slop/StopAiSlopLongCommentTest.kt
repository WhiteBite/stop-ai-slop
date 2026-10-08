package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopLongCommentTest {
    private val rule = StopAiSlopLongComment(TestConfig())

    @Test
    fun `comment line longer than 120 chars is flagged`() {
        val code = lines("// " + "y".repeat(118), "val x = 1")
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `comment line at 120 chars is clean`() {
        val code = lines("// " + "y".repeat(117), "val x = 1")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `long kdoc line is clean`() {
        val code = lines("/** " + "y".repeat(130) + " */", "fun f() {}")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `line dominated by a long link is clean`() {
        val code = lines("// see https://example.com/" + "a".repeat(40), "val x = 1")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `long why line with marker is clean`() {
        val code = lines("// " + "y".repeat(110) + " because the slot is freed below", "val x = 1")
        assertEquals(0, rule.lint(code).size)
    }
}