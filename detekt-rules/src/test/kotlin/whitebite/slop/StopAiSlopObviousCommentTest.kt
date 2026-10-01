package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopObviousCommentTest {
    private val rule = StopAiSlopObviousComment(TestConfig())

    @Test
    fun `comment restating the next code line is flagged`() {
        assertEquals(1, rule.lint(lines("// increment the counter", "counter += 1")).size)
    }

    @Test
    fun `camelCase tokens are matched`() {
        assertEquals(1, rule.lint(lines("// reset slot", "resetSlot()")).size)
    }

    @Test
    fun `comment with a why marker is clean`() {
        assertEquals(0, rule.lint(lines("// increment the counter т.к. сбрасываем слот", "counter += 1")).size)
    }

    @Test
    fun `comma requires two word matches`() {
        assertEquals(0, rule.lint(lines("// counter, value", "counter = 1")).size)
    }

    @Test
    fun `comment preceded by another comment is clean`() {
        assertEquals(0, rule.lint(lines("// first line", "// increment the counter", "counter += 1")).size)
    }

    @Test
    fun `todo comment is skipped`() {
        assertEquals(0, rule.lint(lines("// TODO increment the counter", "counter += 1")).size)
    }

    @Test
    fun `unrelated prose is clean`() {
        assertEquals(0, rule.lint(lines("// unrelated prose here", "counter += 1")).size)
    }

    @Test
    fun `comment in a kdoc is clean`() {
        assertEquals(0, rule.lint(lines("/** increment the counter */", "counter += 1")).size)
    }
}