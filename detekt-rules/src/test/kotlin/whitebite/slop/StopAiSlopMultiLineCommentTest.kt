// stop-ai-slop-ignore-file multi-line-comment -- строки ниже содержат намеренные slop-фикстуры для тестов detekt-правил
package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopMultiLineCommentTest {
    private val rule = StopAiSlopMultiLineComment(TestConfig())

    @Test
    fun `flags two consecutive comment lines`() {
        val code = """
            // removeSource rewrites every symbol row
            // with fresh uuids so zones vanish at once
            fun main() {}
        """.trimIndent()
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `single why-comment line is clean`() {
        val code = """
            // сбрасываем здесь, т.к. ниже освобождаем слот
            val x = 1
        """.trimIndent()
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `license header block is clean`() {
        val code = """
            /*
             * Copyright (c) 2024 Foo Inc.
             * All rights reserved.
             */
            val x = 1
        """.trimIndent()
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `multi-line block comment is flagged`() {
        val code = """
            /* removeSource rewrites every row
            with fresh uuids all vanish at once
            and incremental has no centroids left */
            val x = 1
        """.trimIndent()
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `comments split by blank line are clean`() {
        val code = """
            // отдельный комментарий

            // ещё один отдельный
            val x = 1
        """.trimIndent()
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `trailing comments after code do not form a run`() {
        val code = """
            val x = 1 // первый
            val y = 2 // второй
        """.trimIndent()
        assertEquals(0, rule.lint(code).size)
    }
}
