package whitebite.slop

import org.jetbrains.kotlin.com.intellij.psi.PsiComment
import org.jetbrains.kotlin.com.intellij.psi.PsiElement
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil
import org.jetbrains.kotlin.kdoc.psi.api.KDoc
import org.jetbrains.kotlin.lexer.KtTokens
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid

internal enum class CommentKind { LINE, BLOCK, DOC }

internal class KtCommentInfo(
    val element: PsiElement,
    val kind: CommentKind,
    val startLine: Int,
    val endLine: Int,
) {
    val startOffset: Int = element.textRange.startOffset
    val endOffset: Int = element.textRange.endOffset
}

internal class SourceLines(text: String) {
    val lines: List<String>
    private val starts: List<Int>

    init {
        val accLines = mutableListOf<String>()
        val accStarts = mutableListOf(0)
        var start = 0
        for (i in text.indices) {
            if (text[i] == '\n') {
                accLines += text.substring(start, i).removeSuffix("\r")
                start = i + 1
                accStarts += start
            }
        }
        accLines += text.substring(start).removeSuffix("\r")
        lines = accLines
        starts = accStarts
    }

    fun startOf(line: Int): Int = starts[line]

    fun lineOf(offset: Int): Int {
        val exact = starts.binarySearch(offset)
        return if (exact >= 0) exact else (-exact - 2).coerceAtLeast(0)
    }
}

internal fun collectComments(root: KtFile): Pair<List<KtCommentInfo>, SourceLines> {
    val src = SourceLines(root.text)
    val out = mutableListOf<KtCommentInfo>()
    root.accept(object : KtTreeVisitorVoid() {
        override fun visitComment(comment: PsiComment) {
            val kind = when (comment.node?.elementType) {
                KtTokens.EOL_COMMENT -> if (comment.text.trimStart().startsWith("///")) CommentKind.DOC else CommentKind.LINE
                KtTokens.BLOCK_COMMENT -> if (comment.text.startsWith("/**")) CommentKind.DOC else CommentKind.BLOCK
                else -> CommentKind.DOC
            }
            out += KtCommentInfo(
                comment,
                kind,
                src.lineOf(comment.textRange.startOffset),
                src.lineOf(comment.textRange.endOffset),
            )
        }
    })
    val seen = out.mapTo(HashSet()) { it.startOffset }
    PsiTreeUtil.collectElementsOfType(root, KDoc::class.java).forEach { kdoc ->
        if (kdoc.textRange.startOffset !in seen) {
            out += KtCommentInfo(
                kdoc,
                CommentKind.DOC,
                src.lineOf(kdoc.textRange.startOffset),
                src.lineOf(kdoc.textRange.endOffset),
            )
        }
    }
    return out to src
}

internal class LineCls(val comment: Boolean, val doc: Boolean)

private val LINE_PREFIXES = listOf("//", "/*", "*")
private val BLOCK_PAIRS = listOf("/*" to "*/", "{/*" to "*/}")
private val DOC_OPENERS = listOf(Regex("""^/\*\*""") to "*/", Regex("""^///""") to "")

internal fun isCommentLine(line: String): Boolean {
    val t = line.trim()
    if (LINE_PREFIXES.any { t.startsWith(it) }) return true
    return t.endsWith("*/") && BLOCK_PAIRS.any { t.contains(it.first) }
}

internal class SlopClassifier {
    private var blockClose: String? = null
    private var docClose: String? = null

    fun classify(line: String): LineCls {
        val t = line.trim()
        docClose?.let { close ->
            if (t.contains(close)) docClose = null
            return LineCls(false, true)
        }
        blockClose?.let { close ->
            if (t.contains(close)) blockClose = null
            return LineCls(true, false)
        }
        for ((openRe, close) in DOC_OPENERS) {
            val m = openRe.find(t) ?: continue
            if (!t.substring(m.value.length).contains(close)) docClose = close
            return LineCls(false, true)
        }
        for ((open, close) in BLOCK_PAIRS) {
            if (t.startsWith(open) && !t.substring(open.length).contains(close)) {
                blockClose = close
                return LineCls(true, false)
            }
        }
        return LineCls(isCommentLine(line), false)
    }
}

internal fun classifyLines(lines: List<String>): List<LineCls> {
    val classifier = SlopClassifier()
    return lines.map { classifier.classify(it) }
}

internal fun collectHeadComments(root: KtFile, src: SourceLines, n: Int): Array<PsiElement?> {
    val text = root.text
    val out = arrayOfNulls<PsiElement>(n)
    val (comments, _) = collectComments(root)
    for (c in comments) {
        for (line in c.startLine..c.endLine) {
            if (line >= n) break
            val lineStart = src.startOf(line)
            val lineEnd = lineStart + src.lines[line].length
            val coveredStart = (if (line == c.startLine) c.startOffset else lineStart).coerceIn(lineStart, lineEnd)
            val coveredEnd = (if (line == c.endLine) c.endOffset else lineEnd).coerceIn(lineStart, lineEnd)
            if (text.substring(lineStart, coveredStart).isBlank() && text.substring(coveredEnd, lineEnd).isBlank()) {
                if (out[line] == null) out[line] = c.element
            }
        }
    }
    return out
}

// (?U) — \s в JS юникодный (U+00A0), в Java по умолчанию ASCII
private val licenseHead = Regex(
    "(?U)^(?://+|/\\*+|\\*+|\\(\\*+|<!--+|#+|;+|--+)\\s*(?:copyright|licensed?|SPDX|all rights reserved|permission is hereby granted|public domain|MIT License)",
    RegexOption.IGNORE_CASE,
)

internal fun isLicenseRun(runLines: List<String>): Boolean =
    runLines.take(3).any { licenseHead.containsMatchIn(it.trim()) } ||
        runLines.any { "SPDX-License-Identifier" in it }
