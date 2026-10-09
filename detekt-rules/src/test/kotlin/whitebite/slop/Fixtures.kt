package whitebite.slop

internal fun lines(vararg parts: String): String = parts.joinToString("\n") + "\n"

internal val BS: String = 0x5C.toChar().toString()

internal fun ch(code: Int): String = code.toChar().toString()

internal fun astral(code: Int): String = String(Character.toChars(code))

internal fun ignoreNext(ids: String): String = "// stop-ai-slop-ignore-next-line $ids"

internal fun ignoreFileLine(): String = "// stop-ai-slop-ignore-file -- probe"
