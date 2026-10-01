package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopObviousComment(config: Config = Config.empty) : StopAiSlopRule(
    "vend/obvious-comment",
    Severity.Style,
    "комментарий пересказывает строку кода под ним",
    config,
)