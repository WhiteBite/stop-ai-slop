package whitebite.slop

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Severity

class StopAiSlopMarkdownInComment(config: Config = Config.empty) : StopAiSlopRule(
    "vend/markdown-in-comment",
    Severity.Style,
    "markdown-разметка внутри комментария (**, -, |)",
    config,
)