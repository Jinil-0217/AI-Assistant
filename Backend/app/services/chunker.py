import hashlib
import re
from dataclasses import dataclass

try:
    import tiktoken
    _ENCODER = tiktoken.get_encoding("cl100k_base")
except Exception:
    _ENCODER = None


@dataclass
class TextChunk:
    chunk_index: int
    content: str
    token_count: int


def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def clean_text(raw_text: str) -> str:
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def count_tokens(text: str) -> int:
    if not text:
        return 0
    if _ENCODER is not None:
        return len(_ENCODER.encode(text))
    return max(1, len(text) // 4)


def chunk_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> list[TextChunk]:
    cleaned = clean_text(text)
    if not cleaned:
        return []

    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    chunks: list[TextChunk] = []
    start = 0
    index = 0
    length = len(cleaned)

    while start < length:
        end = min(start + chunk_size, length)

        if end < length:
            # Prefer breaking on paragraph, sentence, or whitespace boundary
            boundary = max(
                cleaned.rfind("\n\n", start, end),
                cleaned.rfind(". ", start, end),
                cleaned.rfind(" ", start, end),
            )
            if boundary > start + (chunk_size // 2):
                end = boundary + 1

        piece = cleaned[start:end].strip()
        if piece:
            chunks.append(
                TextChunk(
                    chunk_index=index,
                    content=piece,
                    token_count=count_tokens(piece),
                )
            )
            index += 1

        if end >= length:
            break

        next_start = end - chunk_overlap
        start = next_start if next_start > start else end

    return chunks
