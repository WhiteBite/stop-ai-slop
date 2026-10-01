package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopMultiLineCommentTest {
    private val rule = StopAiSlopMultiLineComment(TestConfig())

    @Test
    fun `flags two consecutive comment lines`() {
        val code = lines(
            "// removeSource rewrites every symbol row",
            "// with fresh uuids so zones vanish at once",
            "fun main() {}",
        )
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `single why-comment line is clean`() {
        val code = lines("// сбрасываем здесь, т.к. ниже освобождаем слот", "val x = 1")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `license header block is clean`() {
        val code = lines(
            "/*",
            " * Copyright (c) 2024 Foo Inc.",
            " * All rights reserved.",
            " */",
            "val x = 1",
        )
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `multi-line block comment is flagged`() {
        val code = lines(
            "/* removeSource rewrites every row",
            "with fresh uuids all vanish at once",
            "and incremental has no centroids left */",
            "val x = 1",
        )
        assertEquals(1, rule.lint(code).size)
    }

    @Test
    fun `comments split by blank line are clean`() {
        val code = lines("// отдельный комментарий", "", "// ещё один отдельный", "val x = 1")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `trailing comments after code do not form a run`() {
        val code = lines("val x = 1 // первый", "val y = 2 // второй")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `kdoc block is not a comment run`() {
        val code = lines("/**", " * contract line", " * second contract line", " */", "fun f() {}")
        assertEquals(0, rule.lint(code).size)
    }

    @Test
    fun `jsdoc shaped block detached from code is still doc`() {
        val code = lines("/**", " * contract line", " * second contract line", " */", "", "fun f() {}")
        assertEquals(0, rule.lint(code).size)
    }
}