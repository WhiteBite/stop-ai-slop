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
            StopAiSlopStepNumbered(config),
            StopAiSlopSectionDivider(config),
            StopAiSlopMarkdownInComment(config),
            StopAiSlopThisFunctionOpener(config),
            StopAiSlopFileSummaryHeader(config),
            StopAiSlopGenericTodo(config),
            StopAiSlopCrossFileRef(config),
            StopAiSlopObviousComment(config),
            StopAiSlopCjkNoise(config),
            StopAiSlopZeroWidthChars(config),
            StopAiSlopBidiControls(config),
        ),
    )
}