package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopAiPlanNarrationTest {
    private val rule = StopAiSlopAiPlanNarration(TestConfig())

    @Test
    fun `plan step reference is flagged`() {
        assertEquals(1, rule.lint(lines("// step 2 of the plan: wire the handler", "val x = 1")).size)
    }

    @Test
    fun `spec reference is flagged`() {
        assertEquals(1, rule.lint(lines("// per the spec", "val x = 1")).size)
    }

    @Test
    fun `ru spec reference is flagged`() {
        assertEquals(1, rule.lint(lines("// согласно ТЗ таймаут 30 секунд", "val x = 1")).size)
    }

    @Test
    fun `anchored acknowledgement is flagged`() {
        assertEquals(1, rule.lint(lines("// as instructed, add the retry guard", "val x = 1")).size)
    }

    @Test
    fun `anchored requested acknowledgement is flagged`() {
        assertEquals(1, rule.lint(lines("// as requested, the timeout is 30 seconds", "val x = 1")).size)
    }

    @Test
    fun `narration inside a kdoc still fires`() {
        assertEquals(1, rule.lint(lines("/** per the spec the timeout is 30 seconds */", "fun f() {}")).size)
    }

    @Test
    fun `clean why comment is not flagged`() {
        assertEquals(0, rule.lint(lines("// таймаут 30 с, т.к. вендор не отвечает быстрее", "val x = 1")).size)
    }

    @Test
    fun `todo with a ticket ref is not flagged`() {
        assertEquals(0, rule.lint(lines("// TODO KRY-482 per the ticket drop the workaround", "val x = 1")).size)
    }

    @Test
    fun `changelog text is not flagged`() {
        assertEquals(0, rule.lint(lines("// было иначе, стало так", "val x = 1")).size)
    }

    @Test
    fun `mid-sentence acknowledgement is not flagged`() {
        assertEquals(0, rule.lint(lines("/* Module API version as requested during initialization. */", "val x = 1")).size)
    }
}
