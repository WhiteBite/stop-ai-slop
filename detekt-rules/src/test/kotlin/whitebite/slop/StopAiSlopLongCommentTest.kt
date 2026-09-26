package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopLongCommentTest {
    private val rule = StopAiSlopLongComment(TestConfig())

    @Test
    fun `comment line longer than 120 chars is flagged`() {
        val code = "// " + "y".repeat(118) + "\nval x = 1\n"
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `comment line at 120 chars is clean`() {
        val code = "// " + "y".repeat(117) + "\nval x = 1\n"
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `long kdoc line is clean`() {
        val code = "/** " + "y".repeat(130) + " */\nfun f() {}\n"
        assertEquals(0, rule.lint(code).size)
    }
}
