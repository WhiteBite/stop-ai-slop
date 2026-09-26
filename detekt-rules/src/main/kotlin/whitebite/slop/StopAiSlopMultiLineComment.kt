package whitebite.slop

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

class StopAiSlopMultiLineComment(config: Config = Config.empty) : Rule(config) {
    override val issue = Issue(
        "StopAiSlopMultiLineComment",
        Severity.Defect,
        "комментарий занимает 2+ строки подряд",
        Debt.FIVE_MINS,
    )

    override fun visit(root: KtFile) {
        val (comments, src) = collectComments(root)
        val commentOnlyLines = sortedSetOf<Int>()
        for (c in comments) {
            if (c.kind == CommentKind.DOC) continue
            for (line in c.startLine..c.endLine) {
                if (isCommentOnlyLine(c, line, src)) commentOnlyLines += line
            }
        }
        val sorted = commentOnlyLines.toList()
        var i = 0
        while (i < sorted.size) {
            var j = i
            while (j + 1 < sorted.size && sorted[j + 1] == sorted[j] + 1) j++
            if (j - i + 1 >= 2) {
                val runLines = (i..j).map { src.lines[sorted[it]] }
                if (!isLicenseRun(runLines)) {
                    val first = comments.first { sorted[i] in it.startLine..it.endLine }
                    val offset = (src.startOf(sorted[i]) - first.startOffset).coerceAtLeast(0)
                    report(CodeSmell(issue, Entity.from(first.element, offset), issue.description))
                }
            }
            i = j + 1
        }
    }

    private fun isCommentOnlyLine(c: KtCommentInfo, line: Int, src: SourceLines): Boolean {
        val text = src.lines[line]
        val startCol = if (line == c.startLine) c.startOffset - src.startOf(line) else 0
        val endCol = if (line == c.endLine) (c.endOffset - src.startOf(line)).coerceAtMost(text.length) else text.length
        return text.substring(0, startCol).isBlank() && text.substring(endCol).isBlank()
    }
}
