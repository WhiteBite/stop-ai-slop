package whitebite.slop

import org.jetbrains.kotlin.com.intellij.psi.PsiComment
import org.jetbrains.kotlin.lexer.KtTokens
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid

internal enum class CommentKind { LINE, BLOCK, DOC }

internal class KtCommentInfo(
    val element: PsiComment,
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
                KtTokens.EOL_COMMENT -> CommentKind.LINE
                KtTokens.BLOCK_COMMENT -> CommentKind.BLOCK
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
    return out to src
}

private val licenseHead = Regex("^(?://+|/\\*+|\\*+|<!--|#+|;+|--+)\\s*(?:copyright|licensed?|SPDX)", RegexOption.IGNORE_CASE)

internal fun isLicenseRun(runLines: List<String>): Boolean =
    runLines.take(3).any { licenseHead.containsMatchIn(it.trim()) } ||
        runLines.any { "SPDX-License-Identifier" in it }
