package whitebite.slop

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

class StopAiSlopChangelogMarker(config: Config = Config.empty) : Rule(config) {
    override val issue = Issue(
        "StopAiSlopChangelogMarker",
        Severity.Defect,
        "комментарий пересказывает дифф (было/стало/раньше/вместо/fixes)",
        Debt.FIVE_MINS,
    )

    override fun visit(root: KtFile) {
        val (comments, _) = collectComments(root)
        for (c in comments) {
            var offset = 0
            for (raw in c.element.text.split('\n')) {
                // lowercase(): kotlin Regex не умеет UNICODE_CASE, кириллица без него по регистру не складывается
                val line = zeroWidth.replace(raw.removeSuffix("\r"), "").lowercase()
                if (changelogMarker.containsMatchIn(line)) {
                    report(CodeSmell(issue, Entity.from(c.element, offset), issue.description))
                }
                offset += raw.length + 1
            }
        }
    }

    private companion object {
        val zeroWidth = Regex("[\u200B-\u200F\uFEFF]")
        val changelogMarker = Regex(
            "(?<![а-яёА-ЯЁ])(?:было|стало|раньше|вместо|теперь)(?![а-яёА-ЯЁ])" +
                "|\\bnow we\\b|\\bpreviously\\b|\\binstead of\\b|\\bthis fixes\\b|\\bthis fix\\b" +
                "|\\bmust take over\\b|\\bno longer\\b|broke, so",
        )
    }
}
