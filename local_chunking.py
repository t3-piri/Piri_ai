MAX_TOKENS = 450
OVERLAP_RATIO = 0.125  # %12.5, istenen %10-15 araligi


def chunk_blocks(blocks, tokenizer, max_tokens=MAX_TOKENS, overlap_ratio=OVERLAP_RATIO):
    """blocks: list of (text, locator). Gruplar ayni locator'a ait ardisik
    bloklari max_tokens'a kadar birlestirir; asan bloklari overlap'li olarak boler."""
    overlap = int(max_tokens * overlap_ratio)

    def token_len(text):
        return len(tokenizer.encode(text, add_special_tokens=False))

    def split_long(text):
        ids = tokenizer.encode(text, add_special_tokens=False)
        if len(ids) <= max_tokens:
            return [text]
        parts = []
        start = 0
        while start < len(ids):
            end = start + max_tokens
            parts.append(tokenizer.decode(ids[start:end]))
            start = end - overlap
        return parts

    chunks = []
    buf_text, buf_locator, buf_tokens = [], None, 0

    def flush():
        nonlocal buf_text, buf_locator, buf_tokens
        if buf_text:
            merged = "\n".join(buf_text)
            for part in split_long(merged):
                chunks.append((part, buf_locator))
        buf_text, buf_tokens = [], 0

    for text, locator in blocks:
        t_len = token_len(text)
        if buf_text and (buf_tokens + t_len > max_tokens or locator != buf_locator):
            flush()
        buf_text.append(text)
        buf_locator = locator
        buf_tokens += t_len
    flush()
    return chunks
