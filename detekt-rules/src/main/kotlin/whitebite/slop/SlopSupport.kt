package whitebite.slop

import org.jetbrains.kotlin.psi.KtFile

internal class Suppressions(
    val file: Boolean,
    val perLine: Map<Int, Set<String>?>,
)

internal fun rulesOfTail(tail: String): Set<String>? {
    val ids = tail.substringBefore("--").trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }
    return if (ids.isEmpty()) null else ids.toSet()
}

internal fun collectSuppressions(lines: List<String>): Suppressions {
    val perLine = HashMap<Int, Set<String>?>()
    var file = false
    lines.forEachIndexed { i, raw ->
        val next = SlopMarkers.SUPPRESS_NEXT.raw.matcher(raw)
        val nextMatch = if (next.find()) next.group(1) else null
        val same = SlopMarkers.SUPPRESS_LINE.raw.matcher(raw)
        val sameMatch = if (nextMatch == null && same.find()) same.group(1) else null
        val fileMatch = SlopMarkers.SUPPRESS_FILE.raw.matcher(raw)
        val hasFile = fileMatch.find()
        if (nextMatch == null && sameMatch == null && !hasFile) return@forEachIndexed
        val tail = if (hasFile) fileMatch.group(1) ?: "" else (nextMatch ?: sameMatch) ?: ""
        val ids = rulesOfTail(tail)
        if (hasFile) {
            file = true
        } else {
            perLine[if (nextMatch != null) i + 2 else i + 1] = ids
        }
    }
    return Suppressions(file, perLine)
}

internal fun isGeneratedFile(root: KtFile): Boolean {
    val base = root.name ?: ""
    if (SlopMarkers.GEN_NAME_SAFE.find(base)) return true
    val head = root.text.split("\n").take(10).joinToString("\n")
    if (SlopMarkers.GEN_HEADER_STRICT.find(head)) return true
    return SlopMarkers.GEN_HEADER_LAX.all { it.find(head) }
}