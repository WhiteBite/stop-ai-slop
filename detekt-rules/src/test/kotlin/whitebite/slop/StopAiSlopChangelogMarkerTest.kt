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

    @Test
    fun `en deictic transition marker is flagged`() {
        assertEquals(1, rule.lint(lines("// before this change the content column overflowed", "val x = 1")).size)
    }

    @Test
    fun `en the old with a behavior verb is flagged`() {
        assertEquals(1, rule.lint(lines("// the old rule kept the sidebar collapsed", "val x = 1")).size)
    }

    @Test
    fun `en we used to is flagged`() {
        assertEquals(1, rule.lint(lines("// we used to sort the results here", "val x = 1")).size)
    }

    @Test
    fun `ru strong transition marker is flagged`() {
        assertEquals(1, rule.lint(lines("// старое правило держало сайдбар свёрнутым", "val x = 1")).size)
    }

    @Test
    fun `ru do etogo izmeneniya is flagged`() {
        assertEquals(1, rule.lint(lines("// до этого изменения колонка переполнялась", "val x = 1")).size)
    }

    @Test
    fun `passive used to stays clean`() {
        assertEquals(0, rule.lint(lines("// the map is used to store tokens", "val x = 1")).size)
    }

    @Test
    fun `the old value is returned stays clean`() {
        assertEquals(0, rule.lint(lines("// the old value is returned by reference", "val x = 1")).size)
    }

    @Test
    fun `domain after the change stays clean`() {
        assertEquals(0, rule.lint(lines("// the state of the pipeline after the change", "val x = 1")).size)
    }

    @Test
    fun `relative clause that we used to stays clean`() {
        assertEquals(0, rule.lint(lines("// a socket that we used to connect to the node", "val x = 1")).size)
    }

    @Test
    fun `originally we used to is flagged`() {
        assertEquals(1, rule.lint(lines("// originally we used to sort the results here", "val x = 1")).size)
    }

    @Test
    fun `used to with a removal co-marker is flagged`() {
        assertEquals(1, rule.lint(lines("// the code we used to run has been removed", "val x = 1")).size)
    }

    @Test
    fun `compat invariant with a purpose follower stays clean`() {
        assertEquals(0, rule.lint(lines("// the old handler kept for backwards compatibility", "val x = 1")).size)
    }

    @Test
    fun `modal would stays clean`() {
        assertEquals(0, rule.lint(lines("// the old value would be overwritten by the merge", "val x = 1")).size)
    }

    @Test
    fun `domain commit noun stays clean`() {
        assertEquals(0, rule.lint(lines("// after this commit the transaction becomes visible", "val x = 1")).size)
    }

    @Test
    fun `ru transaction commit stays clean`() {
        assertEquals(0, rule.lint(lines("// после коммита данные видны другим транзакциям", "val x = 1")).size)
    }

    @Test
    fun `ru conditional particle stays clean`() {
        assertEquals(0, rule.lint(lines("// старая версия возвращала бы null при пустом вводе", "val x = 1")).size)
    }

    @Test
    fun `ru non-old star stem stays clean`() {
        assertEquals(0, rule.lint(lines("// старший байт держал флаги состояния", "val x = 1")).size)
    }

    @Test
    fun `ru declension list still catches the old rule`() {
        assertEquals(1, rule.lint(lines("// старое правило держало сайдбар свёрнутым", "val x = 1")).size)
    }
}