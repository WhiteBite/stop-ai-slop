package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopFileSummaryHeaderTest {
    private val rule = StopAiSlopFileSummaryHeader(TestConfig())

    @Test
    fun `two leading comment lines are flagged`() {
        assertEquals(1, rule.lint(lines("// file overview", "// second line", "val x = 1")).size)
    }

    @Test
    fun `license header is exempt`() {
        assertEquals(0, rule.lint(lines("// Copyright 2024 Foo Inc.", "// All rights reserved.", "val x = 1")).size)
    }

    @Test
    fun `single leading comment is clean`() {
        assertEquals(0, rule.lint(lines("// one line", "val x = 1")).size)
    }

    @Test
    fun `comment run away from the top is clean`() {
        assertEquals(0, rule.lint(lines("val x = 1", "// a", "// b")).size)
    }
}