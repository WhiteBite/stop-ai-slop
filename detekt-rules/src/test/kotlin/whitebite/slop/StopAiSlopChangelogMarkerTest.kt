package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopChangelogMarkerTest {
    private val rule = StopAiSlopChangelogMarker(TestConfig())

    @Test
    fun `ru marker bounded inside longer word is clean`() {
        assertEquals(0, rule.lint("// осталось реализовать\nval x = 1\n").size)
    }

    @Test
    fun `ru marker stalo is flagged`() {
        assertEquals(1, rule.lint("// стало иначе\nval x = 1\n").size)
    }

    @Test
    fun `ru marker uppercase is flagged`() {
        assertEquals(1, rule.lint("// Было: старый путь\nval x = 1\n").size)
    }

    @Test
    fun `en marker is flagged`() {
        assertEquals(1, rule.lint("// broke, so full recompute must take over\nval x = 1\n").size)
    }

    @Test
    fun `trailing comment marker is flagged`() {
        assertEquals(1, rule.lint("val x = 1 // было так\n").size)
    }

    @Test
    fun `zero width chars do not hide marker`() {
        assertEquals(1, rule.lint("// с\u200Bтало иначе\nval x = 1\n").size)
    }
}
