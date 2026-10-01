package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopMultiLineComment(config: Config = Config.empty) : StopAiSlopRule(
    "multi-line-comment",
    Severity.Defect,
    "комментарий занимает 2+ строки подряд",
    config,
)