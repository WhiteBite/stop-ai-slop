package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopAiVocabDensity(config: Config = Config.empty) : StopAiSlopRule(
    "vend/ai-vocab-density",
    Severity.Style,
    "3+ разных слов из ИИ-канона (delve, pivotal, tapestry...) в комментариях файла",
    config,
)
