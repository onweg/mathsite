"""Чанкинг текста по словам с перехлёстом."""

CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 80
MIN_CHUNK_WORDS = 25


def chunk_text(
    text: str,
    *,
    size: int = CHUNK_SIZE_WORDS,
    overlap: int = CHUNK_OVERLAP_WORDS,
    min_words: int = MIN_CHUNK_WORDS,
) -> list[str]:
    assert 0 < overlap < size, "overlap должен быть > 0 и < size"
    words = text.split()
    if len(words) <= size:
        return [text] if len(words) >= min_words else []

    step = size - overlap
    chunks: list[str] = []
    for i in range(0, len(words), step):
        piece = words[i : i + size]
        if len(piece) < min_words:
            break
        chunks.append(" ".join(piece))
        if i + size >= len(words):
            break
    return chunks
