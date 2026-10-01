package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopMarkdownInCommentTest {
    private val rule = StopAiSlopMarkdownInComment(TestConfig())

    @Test
    fun `bold markdown is flagged`() {
        assertEquals(1, rule.lint(lines("// **bold**", "val x = 1")).size)
    }

    @Test
    fun `list markdown is flagged`() {
        assertEquals(1, rule.lint(lines("// - item", "val x = 1")).size)
    }

    @Test
    fun `table row is flagged`() {
        assertEquals(1, rule.lint(lines("// | a | b |", "val x = 1")).size)
    }

    @Test
    fun `lone pipe in prose is clean`() {
        assertEquals(0, rule.lint(lines("// |flag|", "val x = 1")).size)
    }

    @Test
    fun `markdown inside a kdoc is clean`() {
        assertEquals(0, rule.lint(lines("/** **bold** */", "fun f() {}")).size)
    }
}