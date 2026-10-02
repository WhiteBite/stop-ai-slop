package whitebite.slop

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.lint
import kotlin.test.Test
import kotlin.test.assertEquals

class StopAiSlopResearchCitationTest {
    private val rule = StopAiSlopResearchCitation(TestConfig())

    @Test
    fun `et al citation is flagged`() {
        assertEquals(1, rule.lint(lines("// see (Cormen et al., 2009) for the proof", "val x = 1")).size)
    }

    @Test
    fun `single author citation is flagged`() {
        assertEquals(1, rule.lint(lines("// see (Cormen, 2009)", "val x = 1")).size)
    }

    @Test
    fun `arxiv id is flagged`() {
        assertEquals(1, rule.lint(lines("// arXiv:2407.12241", "val x = 1")).size)
    }

    @Test
    fun `arxiv id with version suffix is flagged`() {
        assertEquals(1, rule.lint(lines("// arXiv:2407.12241v2", "val x = 1")).size)
    }

    @Test
    fun `ru citation is flagged`() {
        assertEquals(1, rule.lint(lines("// см. (Иванов и др., 2023)", "val x = 1")).size)
    }

    @Test
    fun `clean prose is not flagged`() {
        assertEquals(0, rule.lint(lines("// сбрасываем здесь, т.к. ниже освобождаем слот", "val x = 1")).size)
    }

    @Test
    fun `citation inside kdoc is not flagged`() {
        assertEquals(0, rule.lint(lines("/** see (Cormen et al., 2009) */", "fun f() {}")).size)
    }

    @Test
    fun `citations fire once per line`() {
        assertEquals(
            2,
            rule.lint(
                lines(
                    "// see (Cormen et al., 2009) and (Knuth, 1997)",
                    "val x = 1",
                    "// see (Dijkstra, 1959)",
                    "val y = 2",
                ),
            ).size,
        )
    }
}
