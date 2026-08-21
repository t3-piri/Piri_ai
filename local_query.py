import sys

import chromadb

from local_embed import embed_query
from local_ingest import COLLECTION_NAME, PERSIST_DIR


def query(text, top_k=5):
    client = chromadb.PersistentClient(path=PERSIST_DIR)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )
    vector = embed_query(text)
    result = collection.query(
        query_embeddings=[vector.tolist()],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )
    hits = []
    for doc, meta, dist in zip(result["documents"][0], result["metadatas"][0], result["distances"][0]):
        similarity = 1 - dist  # cosine space: distance = 1 - cosine_similarity
        hits.append({"text": doc, "metadata": meta, "score": similarity})
    return hits


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "Roket yarismasina kimler katilabilir?"
    print(f"Sorgu: {q}\n")
    for i, hit in enumerate(query(q), start=1):
        md = hit["metadata"]
        print(f"[{i}] skor={hit['score']:.4f} | {md['competition']} | {md['file']} | {md['locator']}")
        print("   ", hit["text"][:200].replace("\n", " "))
        print()
