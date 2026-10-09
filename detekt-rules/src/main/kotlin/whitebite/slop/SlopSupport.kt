package whitebite.slop

import org.jetbrains.kotlin.psi.KtFile

internal enum class DirectiveKind { NEXT, LINE, FILE }

internal class Directive(val kind: DirectiveKind, val tail: String)

internal class Suppressions(
    val fileAll: Boolean,
    val fileScoped: Set<String>?,
    val perLine: Map<Int, Set<String>?>,
)

// зеркало ключей RULE_BY_ID: валидный id директивы — любой id таблицы JS, включая неперенесённые правила
internal val KNOWN_RULE_IDS = setOf(
    "changelog-marker", "long-comment", "multi-line-comment",
    "vend/ai-plan-narration", "vend/ai-vocab-density", "vend/bidi-controls", "vend/cjk-noise",
    "vend/cross-file-ref", "vend/file-summary-header", "vend/generic-todo", "vend/markdown-in-comment",
    "vend/obvious-comment", "vend/research-citation", "vend/section-divider", "vend/step-numbered",
    "vend/this-function-opener", "vend/zero-width-chars", "vend/self-suppression", "vend/ticket-ref",
)

// (?U) — \s в JS юникодный (U+00A0), в Java по умолчанию ASCII
internal fun rulesOfTail(tail: String): Set<String>? {
    val ids = tail.substringBefore("--").trim().split(Regex("""(?U)\s+"""))
        .filter { it.isNotEmpty() && it in KNOWN_RULE_IDS }
    return if (ids.isEmpty()) null else ids.toSet()
}

internal fun directiveHead(text: String): Directive? {
    val m = SlopMarkers.DIRECTIVE_HEAD.find(text) ?: return null
    val kind = when (m.groupValues[1]) {
        "next-line" -> DirectiveKind.NEXT
        "line" -> DirectiveKind.LINE
        else -> DirectiveKind.FILE
    }
    return Directive(kind, text.substring(m.range.last + 1))
}

internal class InlineMarker(val idx: Int, val marker: String)

// единственный префикс cfamily из INLINE_SAFE_PREFIXES; template-литералы с ${ } отслеживаются как в JS
private val INLINE_MARKERS = listOf("//")

internal fun inlineMarkerAt(line: String): InlineMarker? {
    val stack = ArrayList<Char>()
    var i = 0
    while (i < line.length) {
        val top = if (stack.isEmpty()) '\u0000' else stack[stack.size - 1]
        if (top == '\'' || top == '"' || top == '`') {
            when {
                line[i] == '\\' -> i += 2
                line[i] == top -> {
                    stack.removeAt(stack.size - 1)
                    i++
                }
                top == '`' && line[i] == '$' && i + 1 < line.length && line[i + 1] == '{' -> {
                    stack.add('{')
                    i += 2
                }
                else -> i++
            }
            continue
        }
        if (top == '{') {
            when (line[i]) {
                '\'', '"', '`' -> stack.add(line[i])
                '{' -> stack.add('{')
                '}' -> stack.removeAt(stack.size - 1)
            }
            i++
            continue
        }
        val hit = INLINE_MARKERS.firstOrNull { line.startsWith(it, i) }
        if (hit != null) return if (i > 0) InlineMarker(i, hit) else null
        if (line[i] == '\'' || line[i] == '"' || line[i] == '`') stack.add(line[i])
        i++
    }
    return null
}

// директива чтится только первым токеном после настоящего маркера комментария; doc-блоки не комментарии
internal fun directiveOf(line: String, cls: LineCls): Directive? {
    if (cls.doc) return null
    val body = if (isCommentLine(line)) {
        SlopMarkers.stripCommentMarker(line.trim())
    } else {
        val m = inlineMarkerAt(line) ?: return null
        line.substring(m.idx + m.marker.length)
    }
    return directiveHead(body)
}

internal fun collectSuppressions(lines: List<String>, clss: List<LineCls>): Suppressions {
    val perLine = HashMap<Int, Set<String>?>()
    var fileAll = false
    var fileScoped: LinkedHashSet<String>? = null
    lines.forEachIndexed { i, line ->
        val d = directiveOf(line, clss[i]) ?: return@forEachIndexed
        val ids = rulesOfTail(d.tail)
        when (d.kind) {
            DirectiveKind.FILE ->
                if (ids == null) {
                    fileAll = true
                } else {
                    fileScoped = (fileScoped ?: LinkedHashSet<String>().also { fileScoped = it }).apply { addAll(ids) }
                }
            DirectiveKind.NEXT -> perLine[i + 2] = ids
            DirectiveKind.LINE -> perLine[i + 1] = ids
        }
    }
    return Suppressions(fileAll, fileScoped, perLine)
}

private const val GEN_HEAD_LINES = 10

// маркеры шапки ищутся только в строках-комментариях: литерал с текстом маркера не освобождает файл
internal fun isGeneratedFile(root: KtFile): Boolean {
    val base = root.name ?: ""
    if (SlopMarkers.GEN_NAME_SAFE.find(base)) return true
    val headLines = root.text.split("\n").take(GEN_HEAD_LINES)
    val cls = classifyLines(headLines)
    val head = headLines.filterIndexed { i, _ -> cls[i].comment || cls[i].doc }.joinToString("\n")
    if (SlopMarkers.GEN_HEADER_STRICT.find(head)) return true
    return SlopMarkers.GEN_HEADER_LAX.all { it.find(head) }
}
