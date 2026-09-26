package whitebite.slop

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

class StopAiSlopLongComment(config: Config = Config.empty) : Rule(config) {
    override val issue = Issue(
        "StopAiSlopLongComment",
        Severity.Defect,
        "строка комментария длиннее $MAX_COMMENT_LENGTH символов",
        Debt.FIVE_MINS,
    )

    override fun visit(root: KtFile) {
        val (comments, _) = collectComments(root)
        for (c in comments) {
            if (c.kind == CommentKind.DOC) continue
            var offset = 0
            for (raw in c.element.text.split('\n')) {
                if (raw.removeSuffix("\r").length > MAX_COMMENT_LENGTH) {
                    report(CodeSmell(issue, Entity.from(c.element, offset), issue.description))
                }
                offset += raw.length + 1
            }
        }
    }

    private companion object {
        const val MAX_COMMENT_LENGTH = 120
    }
}
