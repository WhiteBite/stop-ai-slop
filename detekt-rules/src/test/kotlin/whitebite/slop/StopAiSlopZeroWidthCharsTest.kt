package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopZeroWidthCharsTest {
    private val rule = StopAiSlopZeroWidthChars(TestConfig())

    @Test
    fun `actual zero width space is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1 // a" + ch(0x200B))).size)
    }

    @Test
    fun `escape spelling in source is flagged`() {
        assertEquals(1, rule.lint(lines("// a " + BS + "u200B")).size)
    }

    @Test
    fun `zwj outside an emoji sequence is flagged`() {
        assertEquals(1, rule.lint(lines("val x = \"a" + ch(0x200D) + "b\"")).size)
    }

    @Test
    fun `legit emoji zwj sequence is clean`() {
        val emoji = astral(0x1F468) + ch(0x200D) + astral(0x1F469)
        assertEquals(0, rule.lint(lines("val s = \"" + emoji + "\"")).size)
    }

    @Test
    fun `leading bom is clean`() {
        assertEquals(0, rule.lint(ch(0xFEFF) + "val x = 1").size)
    }

    @Test
    fun `non leading bom is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1" + ch(0xFEFF))).size)
    }

    @Test
    fun `generated file still flags zero width`() {
        assertEquals(1, rule.lint(lines("// @generated", "val x = 1" + ch(0x200B))).size)
    }
}