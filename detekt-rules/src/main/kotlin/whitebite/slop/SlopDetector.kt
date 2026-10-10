package whitebite.slop

import org.jetbrains.kotlin.com.intellij.psi.PsiElement
import org.jetbrains.kotlin.psi.KtFile
import java.util.Collections
import java.util.WeakHashMap

internal class SlopHit(val rule: String, val element: PsiElement, val offset: Int)

internal object SlopDetector {
    private const val AI_VOCAB_MIN = 3
    private const val OBVIOUS_DENSITY = 0.02

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
        val n = stripped.size
        val cls = classifyLines(stripped)
        val headComments = collectHeadComments(root, src, n)
        val suppress = collectSuppressions(stripped, cls)
        if (suppress.fileAll) return emptyList()
        val hits = ArrayList<SlopHit>()
        val obviousIdx = ArrayList<Int>()
        var codeLines = 0

        fun push(rule: String, i: Int, markerIdx: Int = -1) {
            val lineNo = i + 1
            if (suppress.fileScoped?.contains(rule) == true) return
            if (suppress.perLine.containsKey(lineNo)) {
                val ids = suppress.perLine[lineNo]
                if (ids == null || ids.contains(rule)) return
            }
            val element: PsiElement
            val offset: Int
            if (markerIdx >= 0) {
                element = root
                offset = (src.startOf(i) + markerIdx).coerceIn(0, text.length)
            } else if (i < n && (cls[i].comment || cls[i].doc) && headComments[i] != null) {
                element = headComments[i]!!
                offset = (src.startOf(i) - element.textRange.startOffset).coerceAtLeast(0)
            } else {
                element = root
                offset = src.startOf(i)
            }
            hits += SlopHit(rule, element, offset)
        }

        fun testLine(text0: String, i: Int, doc: Boolean, markerIdx: Int): Int {
            val t = text0.trim()
            val body = SlopMarkers.stripCommentMarker(t)
            if (SlopMarkers.CHANGELOG_STRONG.find(text0)) push("changelog-marker", i, markerIdx)
            if (!doc && text0.length > SlopMarkers.MAX_COMMENT_LENGTH && !SlopMarkers.LONG_LINK.find(text0) && !SlopMarkers.WHY_MARKERS.find(body)) {
                push("long-comment", i, markerIdx)
            }
            if (!doc && SlopMarkers.STEP_NUMBERED.find(body)) push("vend/step-numbered", i, markerIdx)
            if (SlopMarkers.isDividerLine(t)) push("vend/section-divider", i, markerIdx)
            if (!doc &&
                (SlopMarkers.MARKDOWN_BOLD.find(body) || SlopMarkers.MARKDOWN_LIST.find(body) || SlopMarkers.MARKDOWN_TABLE.find(body))
            ) {
                push("vend/markdown-in-comment", i, markerIdx)
            }
            if (SlopMarkers.THIS_OPENER.find(body)) push("vend/this-function-opener", i, markerIdx)
            if (SlopMarkers.AI_PLAN_NARRATION.find(body) &&
                !(SlopMarkers.TODO_WORD.find(body) && (SlopMarkers.TICKET_REF.find(t) || SlopMarkers.ISSUE_LINK.find(t)))
            ) {
                push("vend/ai-plan-narration", i, markerIdx)
            }
            if (SlopMarkers.TODO_WORD.find(body) && !SlopMarkers.TICKET_REF.find(t) && !SlopMarkers.ISSUE_LINK.find(t)) {
                push("vend/generic-todo", i, markerIdx)
            }
            if (!doc && SlopMarkers.isCrossFileRef(body)) push("vend/cross-file-ref", i, markerIdx)
            if (!doc && SlopMarkers.isResearchCitation(body)) push("vend/research-citation", i, markerIdx)
            return SlopMarkers.weakMarkerHits(text0)
        }

        var weakRun = 0
        var weakRunLine = -1
        fun flushWeakRun() {
            if (weakRun >= 2) push("changelog-marker", weakRunLine)
            weakRun = 0
            weakRunLine = -1
        }

        val aiVocab = LinkedHashSet<String>()
        var aiVocabLine = -1
        fun aiVocabHit(text: String, i: Int) {
            val m = SlopMarkers.AI_VOCAB_TOKENS.raw.matcher(text)
            while (m.find()) {
                if (aiVocabLine == -1) aiVocabLine = i
                aiVocab += m.group().lowercase()
            }
        }

        for (i in 0 until n) {
            val rawLine = raw[i]
            val line = stripped[i]
            if (!cls[i].comment && !cls[i].doc && line.trim().isNotEmpty()) codeLines++
            if (rawLine.isNotEmpty()) {
                if (SlopMarkers.zeroWidthHit(rawLine, i)) push("vend/zero-width-chars", i)
                if (SlopMarkers.BIDI.find(rawLine)) push("vend/bidi-controls", i)
                if (!cls[i].comment && !cls[i].doc) {
                    val m = inlineMarkerAt(rawLine)
                    val codePart = if (m == null) rawLine else rawLine.substring(0, m.idx)
                    // U+200E/U+200F в комментарии — легальная RTL-типографика, поэтому только код
                    if (SlopMarkers.BIDI_MARK.find(codePart)) push("vend/bidi-controls", i)
                    if (SlopMarkers.CJK_ADJACENT.find(codePart)) push("vend/cjk-noise", i)
                }
            }
            if (directiveOf(line, cls[i]) != null) continue
            if (cls[i].comment || cls[i].doc) {
                val weak = testLine(line, i, cls[i].doc, -1)
                if (!cls[i].doc) aiVocabHit(line, i)
                if (weak > 0) {
                    weakRun += weak
                    if (weakRunLine == -1) weakRunLine = i
                }
                if (cls[i].comment && !cls[i].doc && !SlopMarkers.TODO_WORD.find(SlopMarkers.stripCommentMarker(line.trim()))) {
                    var j = i + 1
                    while (j < n && stripped[j].trim().isEmpty()) j++
                    val prevOk = i == 0 || (!cls[i - 1].comment && !cls[i - 1].doc)
                    if (j < n && !cls[j].comment && !cls[j].doc && prevOk &&
                        SlopMarkers.isObviousComment(SlopMarkers.stripCommentMarker(line.trim()), stripped[j])
                    ) {
                        obviousIdx += i
                    }
                }
            } else {
                flushWeakRun()
                val m = inlineMarkerAt(line)
                if (m != null) {
                    val inline = line.substring(m.idx)
                    if (testLine(inline, i, false, m.idx) >= 2) push("changelog-marker", i, m.idx)
                    aiVocabHit(inline, i)
                }
            }
        }
        flushWeakRun()
        if (obviousIdx.isNotEmpty() && codeLines > 0 && obviousIdx.size.toDouble() / codeLines >= OBVIOUS_DENSITY) {
            for (i in obviousIdx) push("vend/obvious-comment", i)
        }
        if (aiVocab.size >= AI_VOCAB_MIN) push("vend/ai-vocab-density", aiVocabLine)

        var runStart = -1
        for (i in 0..n) {
            val inRun = i < n && cls[i].comment && !(i == 0 && stripped[0].startsWith("#!"))
            if (inRun && runStart == -1) runStart = i
            if (!inRun && runStart != -1) {
                if (i - runStart >= 2) {
                    val runLines = stripped.subList(runStart, i)
                    if (!isLicenseRun(runLines) && !wrappedWhy(runLines)) push("multi-line-comment", runStart)
                }
                runStart = -1
            }
        }

        var headerEnd = 0
        while (headerEnd < n &&
            cls[headerEnd].comment &&
            directiveOf(stripped[headerEnd], cls[headerEnd]) == null &&
            !(headerEnd == 0 && stripped[0].startsWith("#!"))
        ) {
            headerEnd++
        }
        if (headerEnd >= 2 && !isLicenseRun(stripped.subList(0, headerEnd))) {
            push("vend/file-summary-header", 0)
        }
        return hits
    }

    private fun wrappedWhy(runLines: List<String>): Boolean {
        if (runLines.size != 2) return false
        val text = runLines.joinToString(" ") { SlopMarkers.stripCommentMarker(it.trim()) }
        return text.length <= SlopMarkers.MAX_COMMENT_LENGTH && SlopMarkers.WHY_MARKERS.find(text)
    }
}
