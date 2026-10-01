package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopThisFunctionOpenerTest {
    private val rule = StopAiSlopThisFunctionOpener(TestConfig())

    @Test
    fun `en opener is flagged`() {
        assertEquals(1, rule.lint(lines("// This function does x", "val x = 1")).size)
    }

    @Test
    fun `ru opener is flagged`() {
        assertEquals(1, rule.lint(lines("// Эта функция делает x", "val x = 1")).size)
    }

    @Test
    fun `de opener is flagged`() {
        assertEquals(1, rule.lint(lines("// Diese Funktion macht x", "val x = 1")).size)
    }

    @Test
    fun `fr opener is flagged`() {
        assertEquals(1, rule.lint(lines("// Cette fonction fait x", "val x = 1")).size)
    }

    @Test
    fun `es opener is flagged`() {
        assertEquals(1, rule.lint(lines("// Esta función hace x", "val x = 1")).size)
    }

    @Test
    fun `opener inside a kdoc still fires`() {
        assertEquals(1, rule.lint(lines("/** This function does x */", "fun f() {}")).size)
    }

    @Test
    fun `bare function word is clean`() {
        assertEquals(0, rule.lint(lines("// функция делает x", "val x = 1")).size)
    }
}