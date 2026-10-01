package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopCrossFileRef(config: Config = Config.empty) : StopAiSlopRule(
    "vend/cross-file-ref",
    Severity.Style,
    "указатель на другой файл/строку в комментарии (handler.py:147)",
    config,
)