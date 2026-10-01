package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopLongComment(config: Config = Config.empty) : StopAiSlopRule(
    "long-comment",
    Severity.Defect,
    "строка комментария длиннее 120 символов",
    config,
)