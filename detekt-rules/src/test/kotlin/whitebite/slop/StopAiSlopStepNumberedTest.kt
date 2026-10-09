package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopStepNumberedTest {
    private val rule = StopAiSlopStepNumbered(TestConfig())

    @Test
    fun `en step marker is flagged`() {
        assertEquals(1, rule.lint(lines("// Step 1: init", "val x = 1")).size)
    }

    @Test
    fun `ru step marker is flagged`() {
        assertEquals(1, rule.lint(lines("// Шаг 2: запуск", "val x = 1")).size)
    }

    @Test
    fun `bare number step is flagged`() {
        assertEquals(1, rule.lint(lines("// 1. сделать", "val x = 1")).size)
    }

    @Test
    fun `step inside a kdoc is clean`() {
        assertEquals(0, rule.lint(lines("/** Step 1: init */", "fun f() {}")).size)
    }

    @Test
    fun `prose without a number is clean`() {
        assertEquals(0, rule.lint(lines("// шаги описаны ниже", "val x = 1")).size)
    }

    @Test
    fun `nbsp between step word and number is flagged`() {
        assertEquals(1, rule.lint(lines("// step" + ch(0x00A0) + "3: init", "val x = 1")).size)
    }

    @Test
    fun `block comment opened mid-line with marker text is flagged`() {
        assertEquals(1, rule.lint(lines("/* Step 1 */ val x = 1")).size)
    }

    @Test
    fun `orphan star continuation line is flagged`() {
        assertEquals(1, rule.lint(lines("val a = 1", " * Step 1")).size)
    }

    @Test
    fun `markerless continuation inside a mid-line block is clean`() {
        assertEquals(0, rule.lint(lines("val x = 1 /* note", "Step 2", "*/")).size)
    }

    @Test
    fun `star continuation inside a mid-line block is flagged`() {
        assertEquals(1, rule.lint(lines("val x = 1 /* note", " * Step 2", " */")).size)
    }
}