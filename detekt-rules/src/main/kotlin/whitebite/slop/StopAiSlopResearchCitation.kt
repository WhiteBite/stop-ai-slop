package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopResearchCitation(config: Config = Config.empty) : StopAiSlopRule(
    "vend/research-citation",
    Severity.Style,
    "научная ссылка в комментарии — код не место для библиографии",
    config,
)
