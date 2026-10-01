package whitebite.slop

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

abstract class StopAiSlopRule(
    private val slopRuleId: String,
    severity: Severity,
    description: String,
    config: Config,
) : Rule(config) {
    override val issue = Issue(javaClass.simpleName, severity, description, Debt.FIVE_MINS)

    override fun visit(root: KtFile) {
        if (isGeneratedFile(root) && slopRuleId !in SlopMarkers.SECURITY_RULES) return
        for (hit in SlopDetector.detect(root)) {
            if (hit.rule != slopRuleId) continue
            report(CodeSmell(issue, Entity.from(hit.element, hit.offset), issue.description))
        }
    }
}