package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopChangelogMarker(config: Config = Config.empty) : StopAiSlopRule(
    "changelog-marker",
    Severity.Defect,
    "комментарий пересказывает дифф (пара changelog-маркеров или сильный маркер, ru/en/de/fr/es)",
    config,
)