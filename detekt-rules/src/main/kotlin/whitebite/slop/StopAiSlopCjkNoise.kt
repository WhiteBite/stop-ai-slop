package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopCjkNoise(config: Config = Config.empty) : StopAiSlopRule(
    "vend/cjk-noise",
    Severity.Style,
    "CJK-иероглифы склеены с латиницей или цифрами в коде (артефакт генерации)",
    config,
)