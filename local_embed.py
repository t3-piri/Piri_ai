MODEL_NAME = "intfloat/multilingual-e5-large-instruct"

_model = None


def get_model():
    global _model
    if _model is None:
        import torch
        from sentence_transformers import SentenceTransformer

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[local_embed] model yukleniyor: {MODEL_NAME} (device={device})")
        _model = SentenceTransformer(MODEL_NAME, device=device)
    return _model


def get_tokenizer():
    return get_model().tokenizer


def embed_passages(texts, batch_size=32, show_progress_bar=True):
    model = get_model()
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(
        prefixed,
        batch_size=batch_size,
        show_progress_bar=show_progress_bar,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )


def embed_query(text):
    model = get_model()
    return model.encode(
        [f"query: {text}"],
        convert_to_numpy=True,
        normalize_embeddings=True,
    )[0]


if __name__ == "__main__":
    import torch

    print("CUDA mevcut mu:", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("GPU:", torch.cuda.get_device_name(0))
    vecs = embed_passages(["Merhaba dunya", "Vektor veritabani nedir"], show_progress_bar=False)
    print("Embedding boyutu:", vecs.shape)
