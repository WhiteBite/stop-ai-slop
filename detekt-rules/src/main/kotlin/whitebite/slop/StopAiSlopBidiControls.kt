package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopBidiControls(config: Config = Config.empty) : StopAiSlopRule(
    "vend/bidi-controls",
    Severity.Defect,
    "BiDi-контролы (U+202A-U+202E, U+2066-U+2069 или escape-форма) переопределяют направление текста",
    config,
)