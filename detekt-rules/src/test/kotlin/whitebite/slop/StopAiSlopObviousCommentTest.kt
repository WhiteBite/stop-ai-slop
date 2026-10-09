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

    @Test
    fun `single obvious comment far below the density threshold is dropped`() {
        val dense = (0 until 100).map { "val v$it = $it" }
        val code = (listOf("// increment the counter", "counter += 1") + dense).toTypedArray()
        assertEquals(0, rule.lint(lines(*code)).size)
    }

    @Test
    fun `density exactly at the two percent threshold is kept`() {
        val dense = (0 until 49).map { "val v$it = $it" }
        val code = (listOf("// increment the counter", "counter += 1") + dense).toTypedArray()
        assertEquals(1, rule.lint(lines(*code)).size)
    }

    @Test
    fun `density just below the two percent threshold is dropped`() {
        val dense = (0 until 50).map { "val v$it = $it" }
        val code = (listOf("// increment the counter", "counter += 1") + dense).toTypedArray()
        assertEquals(0, rule.lint(lines(*code)).size)
    }

    @Test
    fun `two obvious comments over fifty code lines stay above the threshold`() {
        val dense = (0 until 48).map { "val v$it = $it" }
        val code = (listOf("// increment the counter", "counter += 1", "// reset slot", "resetSlot()") + dense).toTypedArray()
        assertEquals(2, rule.lint(lines(*code)).size)
    }
}