package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopFileSummaryHeader(config: Config = Config.empty) : StopAiSlopRule(
    "vend/file-summary-header",
    Severity.Style,
    "шапка-резюме из 2+ строк комментария в начале файла",
    config,
)