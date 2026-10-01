package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopSectionDivider(config: Config = Config.empty) : StopAiSlopRule(
    "vend/section-divider",
    Severity.Style,
    "строка-разделитель из символов -=#*",
    config,
)