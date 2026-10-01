package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopThisFunctionOpener(config: Config = Config.empty) : StopAiSlopRule(
    "vend/this-function-opener",
    Severity.Style,
    "комментарий начинается с «This function/…», «Эта функция/…», «Diese Funktion…», «Cette fonction…» или «Esta función…»",
    config,
)