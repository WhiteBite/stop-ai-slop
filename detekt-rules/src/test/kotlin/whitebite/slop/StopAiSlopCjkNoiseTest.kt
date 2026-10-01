package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopCjkNoiseTest {
    private val rule = StopAiSlopCjkNoise(TestConfig())

    @Test
    fun `cjk glued to a latin identifier is flagged`() {
        assertEquals(1, rule.lint(lines("val " + ch(0x9ED8) + "x = 1")).size)
    }

    @Test
    fun `cjk glued to a digit is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1" + ch(0x9ED8))).size)
    }

    @Test
    fun `cjk inside a comment is clean`() {
        assertEquals(0, rule.lint(lines("// " + ch(0x9ED8) + " значение", "val x = 1")).size)
    }

    @Test
    fun `cjk isolated inside a string is clean`() {
        assertEquals(0, rule.lint(lines("val s = \"" + ch(0x9ED8) + "\"")).size)
    }
}