package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.RuleSet
import io.gitlab.arturbosch.detekt.api.RuleSetProvider

class StopAiSlopProvider : RuleSetProvider {
    override val ruleSetId: String = "stop-ai-slop"

    override fun instance(config: Config): RuleSet = RuleSet(
        ruleSetId,
        listOf(
            StopAiSlopMultiLineComment(config),
            StopAiSlopChangelogMarker(config),
            StopAiSlopLongComment(config),
        ),
    )
}
