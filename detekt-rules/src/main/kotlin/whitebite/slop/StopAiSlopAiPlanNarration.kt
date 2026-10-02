package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopAiPlanNarration(config: Config = Config.empty) : StopAiSlopRule(
    "vend/ai-plan-narration",
    Severity.Style,
    "комментарий пересказывает рабочий процесс агента (ссылки на план/спеку/задачу, подтверждение инструкций)",
    config,
)
