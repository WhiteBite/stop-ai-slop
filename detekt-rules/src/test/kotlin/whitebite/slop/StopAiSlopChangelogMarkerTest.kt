package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopChangelogMarkerTest {
    private val rule = StopAiSlopChangelogMarker(TestConfig())

    @Test
    fun `single weak marker is prose not a finding`() {
        assertEquals(0, rule.lint(lines("// стало иначе", "val x = 1")).size)
    }

    @Test
    fun `ru weak pair in one run is flagged`() {
        assertEquals(1, rule.lint(lines("// было так", "// стало иначе", "val x = 1")).size)
    }

    @Test
    fun `strong marker alone is flagged`() {
        assertEquals(1, rule.lint(lines("// broke, so full recompute must take over", "val x = 1")).size)
    }

    @Test
    fun `de weak pair is flagged`() {
        assertEquals(1, rule.lint(lines("// stattdessen neu", "// nicht mehr alt", "val x = 1")).size)
    }

    @Test
    fun `fr weak pair is flagged`() {
        assertEquals(1, rule.lint(lines("// auparavant ainsi", "// désormais autrement", "val x = 1")).size)
    }

    @Test
    fun `es weak pair is flagged`() {
        assertEquals(1, rule.lint(lines("// antes era asi", "// ya no es", "val x = 1")).size)
    }

    @Test
    fun `ru marker bounded inside a longer word is clean`() {
        assertEquals(0, rule.lint(lines("// осталось реализовать", "val x = 1")).size)
    }

    @Test
    fun `uppercase ru weak pair is flagged`() {
        assertEquals(1, rule.lint(lines("// Было так", "// Стало иначе", "val x = 1")).size)
    }

    @Test
    fun `single inline weak marker is clean`() {
        assertEquals(0, rule.lint(lines("val x = 1 // было так")).size)
    }

    @Test
    fun `inline weak pair is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1 // было так стало иначе")).size)
    }

    @Test
    fun `zero width inside a marker does not hide a weak pair`() {
        val hidden = "// с" + ch(0x200B) + "тало иначе"
        assertEquals(1, rule.lint(lines(hidden, "// было так", "val x = 1")).size)
    }

    @Test
    fun `strong marker inside a kdoc fires`() {
        assertEquals(1, rule.lint(lines("/** was there, now here */", "fun f() {}")).size)
    }

    @Test
    fun `inline weak pair with zero width still fires`() {
        val code = lines("val x = 1 // было так " + "с" + ch(0x200B) + "тало иначе")
        assertEquals(1, rule.lint(code).size)
    }
}