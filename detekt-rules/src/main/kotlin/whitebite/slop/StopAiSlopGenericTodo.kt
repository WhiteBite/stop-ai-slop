package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopGenericTodo(config: Config = Config.empty) : StopAiSlopRule(
    "vend/generic-todo",
    Severity.Style,
    "TODO без ссылки на тикет",
    config,
)