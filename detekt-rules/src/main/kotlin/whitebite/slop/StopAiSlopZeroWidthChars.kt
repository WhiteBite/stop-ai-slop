package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopZeroWidthChars(config: Config = Config.empty) : StopAiSlopRule(
    "vend/zero-width-chars",
    Severity.Defect,
    "невидимый символ нулевой ширины (U+200B, U+200C, U+200D, U+2060, U+FEFF или escape-форма)",
    config,
)