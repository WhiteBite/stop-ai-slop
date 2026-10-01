package whitebite.slop

internal class Pat(val raw: java.util.regex.Pattern) {
    fun find(s: String): Boolean = raw.matcher(s).find()

    fun count(s: String): Int {
        val m = raw.matcher(s)
        var n = 0
        while (m.find()) n++
        return n
    }

    companion object {
        private val CI = java.util.regex.Pattern.CASE_INSENSITIVE or java.util.regex.Pattern.UNICODE_CASE

        fun of(source: String, ignoreCase: Boolean = false): Pat =
            Pat(java.util.regex.Pattern.compile(source, if (ignoreCase) CI else 0))
    }
}

internal object SlopMarkers {
    private val BS = 0x5C.toChar().toString()
    private val D = 0x24.toChar().toString()

    const val MAX_COMMENT_LENGTH = 120

    val SECURITY_RULES = setOf("vend/zero-width-chars", "vend/bidi-controls", "vend/cjk-noise")

    val CHANGELOG_STRONG = Pat.of(
        """\bwas\b[^,.;\n]{0,60},\s*(?:and\s+)?now\b|\bthis fixes\b|\bthis fix\b|\bmust take over\b|broke, so""",
        ignoreCase = true,
    )

    val CHANGELOG_WEAK = Pat.of(
        """(?<![а-яё])(?:было|стало|раньше|вместо|теперь)(?![а-яё])|\bnow we\b|\bpreviously\b|\binstead of\b|\bno longer\b|(?<![a-zäöüß])(?:stattdessen|nicht mehr|früher war|war vorher)(?![a-zäöüß])|\bau lieu de\b|(?<![a-zéèêàùç])(?:auparavant|désormais)(?![a-zéèêàùç])|\ben lugar de\b|\bantes era\b|\bya no\b|\banteriormente\b""",
        ignoreCase = true,
    )

    val STEP_NUMBERED = Pat.of(
        """^(?:step\s+\d+|шаг\s+\d+|schritt\s+\d+|(?<![a-zéèêàùç])étape\s+\d+|paso\s+\d+|\d+\.)""",
        ignoreCase = true,
    )

    val DIVIDER = Pat.of("""[-=#*\s─-╿]{6,}""")

    val MARKDOWN_BOLD = Pat.of("""^\*\*""")
    val MARKDOWN_LIST = Pat.of("""^-\s+\S""")
    val MARKDOWN_TABLE = Pat.of("""^\|.+\|.+\|""")

    val THIS_OPENER = Pat.of(
        """^(?:this\s+(?:function|class|method|component)\b|(?:эт[ао]т?\s+|данн(?:ая|ый)\s+)(?:функци[а-яё]*|класс[а-яё]*|метод[а-яё]*|компонент[а-яё]*)|diese[rs]?\s+(?:funktion|klasse|methode|komponente)|cett[ee]\s+(?:fonction|classe|méthode|composant)|est[ae]\s+(?:función|clase|método|componente))""",
        ignoreCase = true,
    )

    val TODO_WORD = Pat.of("""\btodo\b""", ignoreCase = true)
    val TICKET_REF = Pat.of("""[A-Z]+-\d+""")
    val ISSUE_LINK = Pat.of("""https?://\S+|#\d+""")
    val LONG_LINK = Pat.of("""https?://\S{30,}""")

    val CROSS_FILE_REF = Pat.of("""(?<![\w@:./\\-])((?:[\w.-]+[/\\])*)([\w-]+)\.([A-Za-z]{1,5}):(\d+)""")

    val CODE_REF_EXT = setOf(
        "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "py", "pyi", "rb", "go", "rs", "java", "kt", "kts",
        "cs", "c", "h", "cc", "cpp", "hpp", "hh", "swift", "dart", "scala", "php", "sh", "bash", "ps1", "sql",
        "yaml", "yml", "toml", "json", "md", "mdx", "html", "css", "scss", "less", "vue", "svelte", "astro", "lua",
        "ex", "exs", "erl", "hrl", "clj", "cljs", "fs", "fsx", "pl", "pm", "r", "jl", "nim", "zig", "gradle",
        "proto", "tf", "nix", "v", "sv", "qml", "coffee", "tex", "vim", "bat", "mk", "cmake", "bzl", "sol", "res",
    )

    val OBVIOUS_WHY = Pat.of(
        """because|since|otherwise|unless|until|so that|in case|workaround|invariant|constraint|intentionally|deliberately|required|\bmust\b|\bshould\b|\bcannot\b|\bavoid\b|\bonly\b|\butc\b|\bgmt\b|\bms\b|millisecond|second|т\.?\s*к\.|так как|потому что|чтобы|иначе|если|пока|должн|нужно|надо|обязательн|нельзя|воркэраунд|инвариант|ограничен|осторожн|намеренн|специальн|требует|только|миллисекунд|секунд""",
        ignoreCase = true,
    )

    private val OBVIOUS_STOPWORDS = setOf(
        "a", "an", "the", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "being",
        "of", "to", "in", "on", "for", "with", "and", "or", "not", "no", "it", "its", "if", "then", "else",
        "from", "by", "as", "at", "we", "you", "they", "do", "does", "did", "has", "have", "had", "will",
        "would", "can", "could", "may", "might", "there", "their", "them", "he", "she", "his", "her", "him",
        "но", "и", "или", "не", "в", "на", "для", "с", "от", "до", "по", "как", "что", "же", "бы", "ли",
        "уже", "ещё", "при", "над", "под", "без", "через", "между", "его", "её", "их", "мы", "вы", "он",
        "она", "они", "оно", "этот", "эта", "это", "эти", "тот", "там", "тут",
    )

    private val OBVIOUS_WORD_SPLIT = Regex("""[^a-zа-яё0-9]+""")
    private val CAMEL = Pat.of("""([a-z0-9])(?=[A-Z])""")
    private val HAS_LETTER = Pat.of("""[a-zа-яё]""")

    val CJK_ANY = Pat.of("""[\u2E80-\u2EFF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]""")

    private const val CJK_RANGE = "[\u2E80-\u2EFF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]"
    private const val LATIN = "[A-Za-z0-9_]"

    val CJK_ADJACENT = Pat.of(CJK_RANGE + LATIN + "|" + LATIN + CJK_RANGE)

    val STRIP_INVISIBLE: java.util.regex.Pattern = java.util.regex.Pattern.compile(
        "[" + 0x200B.toChar() + "-" + 0x200F.toChar() + 0xFEFF.toChar() + "]",
    )

    val ZERO_WIDTH = Pat.of(
        "[" + 0x200B.toChar() + 0x200C.toChar() + 0x2060.toChar() + "]|" +
            BS + BS + "u200[bBcC]|" + BS + BS + "u2060",
    )
    private val ZWJ_ESCAPE = Pat.of(BS + BS + "u200[dD]")
    private val FEFF_ESCAPE = Pat.of(BS + BS + "u[fF][eE][fF][fF]")

    val BIDI = Pat.of(
        "[" + 0x202A.toChar() + "-" + 0x202E.toChar() + 0x2066.toChar() + "-" + 0x2069.toChar() + "]|" +
            BS + BS + "u202[a-eA-E]|" + BS + BS + "u206[6-9]",
    )

    val SUPPRESS_NEXT = Pat.of("""stop-ai-slop-ignore-next-line\b(.*)${D}""")
    val SUPPRESS_LINE = Pat.of("""stop-ai-slop-ignore-line\b(.*)${D}""")
    val SUPPRESS_FILE = Pat.of("""stop-ai-slop-ignore-file\b(.*)${D}""")
    val SUPPRESS_ANY = Pat.of("""stop-ai-slop-ignore-(?:next-line|line|file)\b""")

    val GEN_NAME_SAFE = Pat.of(
        """\.(?:g|g\.i|freezed|gr|chopper|pb|pbenum|pbjson|pbgrpc|pbserver)\.dart${D}|_pb2(?:_grpc)?\.py${D}|_pb2\.pyi${D}|_pb\.go${D}|_grpc\.pb\.go${D}|\.pb\.(?:cc|h|hpp|cpp)${D}|_grpc\.pb\.(?:cc|h)${D}|\.pb\.mojom\.(?:cc|h)${D}|zz_generated\.|_string\.go${D}|\.sql\.go${D}|\.querier\.go${D}|\.Designer\.cs${D}|\.g\.i\.cs${D}|AssemblyAttributes\.cs${D}|^GlobalUsings(?:\.g)?\.cs${D}|\.min\.[cm]?js${D}|\.min\.css${D}|\.bundle\.js${D}""",
        ignoreCase = true,
    )

    val GEN_HEADER_STRICT = Pat.of(
        """@generated\b|code generated by [^\n]*do not edit|generated code - do not modify by hand|<auto-generated|automatically generated by rust-bindgen|@generated by prost-build|@javax\.annotation\.(?:processing\.)?Generated\(|generated by openapi-generator|code generated by sqlc""",
        ignoreCase = true,
    )

    val GEN_HEADER_LAX = listOf(
        Pat.of("""generat|codegen""", ignoreCase = true),
        Pat.of("""do not (?:edit|modify)|do-not-edit""", ignoreCase = true),
    )

    private val COMMENT_LEAD = Regex(
        "^(?://+|/\\*+|\\*+|#+|--+|;+|%+|!+|\\(\\*+|<!--+|::+|\\.\\.+|'+|\"+|\\{\\{!--?|\\{\\{!|\\{\\{/\\*+)\\s?",
    )
    private val BLOCK_TAIL = Regex("\\*/\\s*$")
    private val DOC_OPEN = Regex("^[rbf]?(?:\"\"\"|''')")
    private val DOC_CLOSE = Regex("(?:\"\"\"|''')$")

    fun stripCommentMarker(line: String): String =
        line.trim()
            .replace(COMMENT_LEAD, "")
            .replace(BLOCK_TAIL, "")
            .replace(DOC_OPEN, "")
            .replace(DOC_CLOSE, "")

    fun isDividerLine(trimmed: String): Boolean {
        if (DIVIDER.find(trimmed)) return true
        val inner = stripCommentMarker(trimmed).trim()
        return inner.length >= 6 && DIVIDER.find(inner)
    }

    fun isCrossFileRef(text: String): Boolean {
        val m = CROSS_FILE_REF.raw.matcher(text)
        if (!m.find()) return false
        val path = m.group(1) ?: ""
        val ext = (m.group(3) ?: "").lowercase()
        return path.isNotEmpty() || ext in CODE_REF_EXT
    }

    fun weakMarkerHits(text: String): Int = CHANGELOG_WEAK.count(text)

    private fun camelSplit(line: String): String = CAMEL.raw.matcher(line).replaceAll("${D}1 ")

    private fun commentContentWords(text: String): List<String> =
        text.lowercase()
            .split(OBVIOUS_WORD_SPLIT)
            .filter { it.isNotEmpty() && HAS_LETTER.find(it) && it !in OBVIOUS_STOPWORDS }

    private fun codeTokenSet(line: String): Set<String> =
        camelSplit(line)
            .lowercase()
            .split(OBVIOUS_WORD_SPLIT)
            .filter { it.isNotEmpty() }
            .toSet()

    fun isObviousComment(text: String, codeLine: String): Boolean {
        if (OBVIOUS_WHY.find(text) || CJK_ANY.find(text)) return false
        val words = commentContentWords(text)
        if (words.isEmpty() || words.size > 6) return false
        val tokens = codeTokenSet(codeLine)
        val hits = words.count { it in tokens }
        return hits >= if (text.contains(',')) 2 else 1
    }

    private fun isEmoji(cp: Int): Boolean =
        (cp in 0x2600..0x27BF) ||
            (cp in 0x1F300..0x1F5FF) ||
            (cp in 0x1F600..0x1F64F) ||
            (cp in 0x1F680..0x1F6C5) ||
            (cp in 0x1F900..0x1F9FF) ||
            (cp in 0x1F3FB..0x1F3FF)

    private fun hasBadZwj(line: String): Boolean {
        if (ZWJ_ESCAPE.find(line)) return true
        val cps = line.codePoints().toArray()
        for (k in cps.indices) {
            if (cps[k] != 0x200D) continue
            if (k == 0 || k == cps.size - 1 || !isEmoji(cps[k - 1]) || !isEmoji(cps[k + 1])) return true
        }
        return false
    }

    private fun hasBadFeff(line: String, lineIdx: Int): Boolean {
        if (FEFF_ESCAPE.find(line)) return true
        val idx = line.indexOf(0xFEFF.toChar())
        if (idx == -1) return false
        if (lineIdx == 0 && idx == 0) return line.indexOf(0xFEFF.toChar(), 1) != -1
        return true
    }

    fun zeroWidthHit(line: String, lineIdx: Int): Boolean =
        ZERO_WIDTH.find(line) || hasBadZwj(line) || hasBadFeff(line, lineIdx)
}