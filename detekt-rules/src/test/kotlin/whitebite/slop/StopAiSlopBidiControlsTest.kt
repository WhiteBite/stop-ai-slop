package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopBidiControlsTest {
    private val rule = StopAiSlopBidiControls(TestConfig())

    @Test
    fun `actual rlo control is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1" + ch(0x202E))).size)
    }

    @Test
    fun `escape spelling in source is flagged`() {
        assertEquals(1, rule.lint(lines("// a " + BS + "u202E")).size)
    }

    @Test
    fun `lrm mark is not a bidi control`() {
        assertEquals(0, rule.lint(lines("val x = 1" + ch(0x200E))).size)
    }

    @Test
    fun `generated file still flags bidi controls`() {
        assertEquals(1, rule.lint(lines("// @generated", "val x = 1" + ch(0x202E))).size)
    }
}