package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopCrossFileRefTest {
    private val rule = StopAiSlopCrossFileRef(TestConfig())

    @Test
    fun `bare code ref is flagged`() {
        assertEquals(1, rule.lint(lines("// see handler.py:147", "val x = 1")).size)
    }

    @Test
    fun `pathed code ref is flagged`() {
        assertEquals(1, rule.lint(lines("// see src/util.py:30", "val x = 1")).size)
    }

    @Test
    fun `path form with unknown extension is flagged`() {
        assertEquals(1, rule.lint(lines("// see dir/file.nope:9", "val x = 1")).size)
    }

    @Test
    fun `url anchor is clean`() {
        assertEquals(0, rule.lint(lines("// see https://example.com/x#L12", "val x = 1")).size)
    }

    @Test
    fun `host port is clean`() {
        assertEquals(0, rule.lint(lines("// see host:8080", "val x = 1")).size)
    }

    @Test
    fun `unknown extension without path is clean`() {
        assertEquals(0, rule.lint(lines("// see foo.xyz:12", "val x = 1")).size)
    }

    @Test
    fun `code ref inside a kdoc is clean`() {
        assertEquals(0, rule.lint(lines("/** see handler.py:147 */", "fun f() {}")).size)
    }
}