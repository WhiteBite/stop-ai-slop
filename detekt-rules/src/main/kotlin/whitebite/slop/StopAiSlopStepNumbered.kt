package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopStepNumbered(config: Config = Config.empty) : StopAiSlopRule(
    "vend/step-numbered",
    Severity.Style,
    "нумерованный шаг в комментарии (Step N / Шаг N / N., маркер любого языка)",
    config,
)