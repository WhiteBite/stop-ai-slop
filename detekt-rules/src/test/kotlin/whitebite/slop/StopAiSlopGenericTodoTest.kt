package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopGenericTodoTest {
    private val rule = StopAiSlopGenericTodo(TestConfig())

    @Test
    fun `uppercase todo is flagged`() {
        assertEquals(1, rule.lint(lines("// TODO fix this", "val x = 1")).size)
    }

    @Test
    fun `lowercase todo is flagged`() {
        assertEquals(1, rule.lint(lines("// todo later", "val x = 1")).size)
    }

    @Test
    fun `todo with a ticket ref is clean`() {
        assertEquals(0, rule.lint(lines("// TODO ABC-123 fix this", "val x = 1")).size)
    }

    @Test
    fun `todo with an issue link is clean`() {
        assertEquals(0, rule.lint(lines("// TODO see #42", "val x = 1")).size)
    }

    @Test
    fun `todo with a url is clean`() {
        assertEquals(0, rule.lint(lines("// TODO https://example.com/1", "val x = 1")).size)
    }

    @Test
    fun `todo inside code identifier is clean`() {
        assertEquals(0, rule.lint(lines("val todos = 1")).size)
    }
}