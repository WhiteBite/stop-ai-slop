package whitebite.slop

import org.jetbrains.kotlin.com.intellij.psi.PsiElement
import org.jetbrains.kotlin.psi.KtFile
import java.util.Collections
import java.util.WeakHashMap

internal class SlopHit(val rule: String, val element: PsiElement, val offset: Int)

private class LineModel(
    val comment: BooleanArray,
    val doc: BooleanArray,
    val commentElement: Array<PsiElement?>,
    val inlineElement: Array<PsiElement?>,
    val inlineText: Array<String?>,
    val inlineStartCol: IntArray,
)

internal object SlopDetector {
    private val cache = Collections.synchronizedMap(WeakHashMap<KtFile, List<SlopHit>>())

    fun detect(root: KtFile): List<SlopHit> {
        cache[root]?.let { return it }
        val result = run(root)
        cache[root] = result
        return result
    }

    private fun run(root: KtFile): List<SlopHit> {
        val text = root.text
        val src = SourceLines(text)
        val raw = src.lines
        val stripped = raw.map { SlopMarkers.STRIP_INVISIBLE.matcher(it).replaceAll("") }
        val model = buildModel(root, text, src, stripped.size)
        val suppress = collectSuppressions(stripped)
        if (suppress.file) return emptyList()
        val hits = ArrayList<SlopHit>()

        fun push(rule: String, i: Int, inline: Boolean = false) {
            val lineNo = i + 1
            if (suppress.perLine.containsKey(lineNo)) {
                val ids = suppress.perLine[lineNo]
                if (ids == null || ids.contains(rule)) return
            }
            val element: PsiElement
            val offset: Int
            if (inline && model.inlineElement[i] != null) {
                element = model.inlineElement[i]!!
                offset = model.inlineStartCol[i]
            } else if ((model.comment[i] || model.doc[i]) && model.commentElement[i] != null) {
                element = model.commentElement[i]!!
                offset = (src.startOf(i) - element.textRange.startOffset).coerceAtLeast(0)
            } else {
                element = root
                offset = src.startOf(i)
            }
            hits += SlopHit(rule, element, offset)
        }

        fun testLine(text0: String, i: Int, doc: Boolean, inline: Boolean): Int {
            val t = text0.trim()
            if (SlopMarkers.CHANGELOG_STRONG.find(text0)) push("changelog-marker", i, inline)
            if (!doc && text0.length > SlopMarkers.MAX_COMMENT_LENGTH && !SlopMarkers.LONG_LINK.find(text0)) {
                push("long-comment", i, inline)
            }
            val body = SlopMarkers.stripCommentMarker(t)
            if (!doc && SlopMarkers.STEP_NUMBERED.find(body)) push("vend/step-numbered", i, inline)
            if (SlopMarkers.isDividerLine(t)) push("vend/section-divider", i, inline)
            if (!doc &&
                (SlopMarkers.MARKDOWN_BOLD.find(body) || SlopMarkers.MARKDOWN_LIST.find(body) || SlopMarkers.MARKDOWN_TABLE.find(body))
            ) {
                push("vend/markdown-in-comment", i, inline)
            }
            if (SlopMarkers.THIS_OPENER.find(body)) push("vend/this-function-opener", i, inline)
            if (SlopMarkers.AI_PLAN_NARRATION.find(body) &&
                !(SlopMarkers.TODO_WORD.find(t) && (SlopMarkers.TICKET_REF.find(t) || SlopMarkers.ISSUE_LINK.find(t)))
            ) {
                push("vend/ai-plan-narration", i, inline)
            }
            if (SlopMarkers.TODO_WORD.find(t) && !SlopMarkers.TICKET_REF.find(t) && !SlopMarkers.ISSUE_LINK.find(t)) {
                push("vend/generic-todo", i, inline)
            }
            if (!doc && SlopMarkers.isCrossFileRef(body)) push("vend/cross-file-ref", i, inline)
            return SlopMarkers.weakMarkerHits(text0)
        }

        var weakRun = 0
        var weakRunLine = -1
        fun flushWeakRun() {
            if (weakRun >= 2) push("changelog-marker", weakRunLine)
            weakRun = 0
            weakRunLine = -1
        }

        for (i in stripped.indices) {
            val rawLine = raw[i]
            if (rawLine.isNotEmpty()) {
                if (SlopMarkers.zeroWidthHit(rawLine, i)) push("vend/zero-width-chars", i)
                if (SlopMarkers.BIDI.find(rawLine)) push("vend/bidi-controls", i)
                if (!model.comment[i] && !model.doc[i]) {
                    val col = model.inlineStartCol[i]
                    val codePart = if (col >= 0) rawLine.substring(0, col) else rawLine
                    if (SlopMarkers.CJK_ADJACENT.find(codePart)) push("vend/cjk-noise", i)
                    // U+200E/U+200F в комментарии — легальная RTL-типографика, поэтому только код
                    if (SlopMarkers.BIDI_MARK.find(codePart)) push("vend/bidi-controls", i)
                }
            }
            if (SlopMarkers.SUPPRESS_ANY.find(stripped[i])) continue
            if (model.comment[i] || model.doc[i]) {
                val weak = testLine(stripped[i], i, model.doc[i], false)
                if (weak > 0) {
                    weakRun += weak
                    if (weakRunLine == -1) weakRunLine = i
                }
                if (model.comment[i] && !model.doc[i] && !SlopMarkers.TODO_WORD.find(stripped[i])) {
                    var j = i + 1
                    while (j < stripped.size && stripped[j].trim().isEmpty()) j++
                    val prevOk = i == 0 || (!model.comment[i - 1] && !model.doc[i - 1])
                    if (j < stripped.size && !model.comment[j] && !model.doc[j] && prevOk &&
                        SlopMarkers.isObviousComment(SlopMarkers.stripCommentMarker(stripped[i].trim()), stripped[j])
                    ) {
                        push("vend/obvious-comment", i)
                    }
                }
            } else {
                flushWeakRun()
                val inline = model.inlineText[i]
                if (inline != null && testLine(inline, i, false, true) >= 2) push("changelog-marker", i, true)
            }
        }
        flushWeakRun()

        var runStart = -1
        for (i in 0..stripped.size) {
            val inRun = i < stripped.size && model.comment[i] && !SlopMarkers.SUPPRESS_ANY.find(stripped[i])
            if (inRun && runStart == -1) runStart = i
            if (!inRun && runStart != -1) {
                if (i - runStart >= 2) {
                    val runLines = stripped.subList(runStart, i)
                    if (!isLicenseRun(runLines)) push("multi-line-comment", runStart)
                }
                runStart = -1
            }
        }

        var headerEnd = 0
        while (headerEnd < stripped.size &&
            model.comment[headerEnd] &&
            !SlopMarkers.SUPPRESS_ANY.find(stripped[headerEnd]) &&
            !(headerEnd == 0 && stripped[0].startsWith("#!"))
        ) {
            headerEnd++
        }
        if (headerEnd >= 2 && !isLicenseRun(stripped.subList(0, headerEnd))) {
            push("vend/file-summary-header", 0)
        }
        return hits
    }

    private fun buildModel(root: KtFile, text: String, src: SourceLines, n: Int): LineModel {
        val comment = BooleanArray(n)
        val doc = BooleanArray(n)
        val commentElement = arrayOfNulls<PsiElement>(n)
        val inlineElement = arrayOfNulls<PsiElement>(n)
        val inlineText = arrayOfNulls<String>(n)
        val inlineStartCol = IntArray(n) { -1 }
        val (comments, _) = collectComments(root)
        for (c in comments) {
            val el = c.element
            if (c.kind == CommentKind.LINE) {
                val line = c.startLine
                if (line >= n) continue
                val prefix = text.substring(src.startOf(line), c.startOffset)
                if (prefix.isBlank()) {
                    if (commentElement[line] == null) commentElement[line] = el
                    comment[line] = true
                } else {
                    inlineElement[line] = el
                    inlineText[line] = SlopMarkers.STRIP_INVISIBLE.matcher(el.text.removeSuffix("\r")).replaceAll("")
                    inlineStartCol[line] = c.startOffset - src.startOf(line)
                }
                continue
            }
            for (line in c.startLine..c.endLine) {
                if (line >= n) continue
                val lineStart = src.startOf(line)
                val lineEnd = lineStart + src.lines[line].length
                val coveredStart = (if (line == c.startLine) c.startOffset else lineStart).coerceIn(lineStart, lineEnd)
                val coveredEnd = (if (line == c.endLine) c.endOffset else lineEnd).coerceIn(lineStart, lineEnd)
                if (text.substring(lineStart, coveredStart).isBlank() && text.substring(coveredEnd, lineEnd).isBlank()) {
                    if (commentElement[line] == null) commentElement[line] = el
                    if (c.kind == CommentKind.DOC) doc[line] = true else comment[line] = true
                }
            }
        }
        return LineModel(comment, doc, commentElement, inlineElement, inlineText, inlineStartCol)
    }
}