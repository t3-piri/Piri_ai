r"""Piri - TEKNOFEST Yarismaci Destek Asistani (web arayuzu).

Iki ayri arayuz sunar:
  /       Yarismaci arayuzu  - GIRIS GEREKTIRMEZ. Kullanici once yarisma/kategori
          bagamini secer; arama yalnizca o baglamin kaynaklarinda yapilir.
  /admin  Yonetim paneli     - kullanici adi + sifre ile girilir, rol bazli yetki.

Mevcut RAG cekirdegini (local_rag_answer / local_ingest / document_registry /
qa_log) DEGISTIRMEDEN uzerine bir HTTP katmani ekler. CLI araclari
(local_rag_answer.py, admin_panel.py) calismaya devam eder.

Calistirma (proje kok dizininden):  .\.venv-local\Scripts\python.exe backend\web_app.py
"""

import os
import secrets
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import users as user_store
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import local_rag_answer
import sss_store
from competitions import ROOT, list_real_competitions
from document_registry import (
    deactivate_all_versions,
    list_documents,
    register_new_version,
    set_status,
)
from local_embed import get_model
from local_ingest import (
    SUPPORTED,
    get_collection,
    get_tokenizer,
    ingest_records,
    records_for_file,
    registry_category,
)
from local_rag_answer import GENERAL_LABEL, answer_auto
from qa_log import read_log, unanswered_questions

load_dotenv()

# On/arka yuz kodlari ayri klasorlerde yasar: web_app.py backend/ icinde,
# HTML/CSS/JS dosyalari kardes klasor olan frontend/ icinde.
STATIC_DIR = Path(__file__).parent.parent / "frontend"

# token -> kullanici adi. Rol her istekte veritabanindan tazelenir; boylece
# rol degisikligi / hesap silinmesi aninda etkili olur.
_sessions = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    created = user_store.ensure_owner()
    if created:
        print(f"[web] Sahip hesabi olusturuldu: '{created}' (sifre: .env ADMIN_PASSWORD)")
    # Embedding modelini acilista yukle: ilk kullanici sorusu 20 sn beklemesin.
    print("[web] Embedding modeli yukleniyor...")
    get_model()
    print("[web] Hazir.")
    yield


app = FastAPI(title="Piri - Yarismaci Destek Asistani", lifespan=lifespan)


# --------------------------------------------------------------------------
# Yardimcilar
# --------------------------------------------------------------------------

def _invalidate_search_cache():
    """BM25 indeksi bellekte cache'lenir; admin bir belgeyi yukler/durumunu
    degistirirse arama bayat indeks kullanmasin diye temizlenmeli."""
    local_rag_answer._bm25_cache.clear()


def _answer_body(answer_text):
    """answer_question(), yanitin sonuna kaynak blogu + guven satiri ekliyor.
    Web'de bunlari yapisal olarak (chip/rozet) gosterdigimiz icin govdeyi ayirir."""
    marker = "\n\nKaynak: ["
    idx = answer_text.find(marker)
    return (answer_text[:idx] if idx != -1 else answer_text).strip()


def _clean_sources(sources, limit=6):
    """Ayni dosyadan birden fazla parca (sayfa/slayt) eslesmis olsa bile,
    kullaniciya o dosyanin yalnizca EN YAKIN (en yuksek siradaki) parcasini
    gosterir - hits listesi zaten alaka sirasina gore geldigi icin bir dosyanin
    ilk gorulen kaydi onun en iyi eslesmesidir."""
    seen, out = set(), []
    for s in sources or []:
        md = s.get("metadata", {})
        key = md.get("file")
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "file": md.get("file", ""),
                "locator": md.get("locator", ""),
                "competition": md.get("competition", ""),
                "score": round(s.get("score", 0), 4),
            }
        )
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------
# Kimlik / yetki
# --------------------------------------------------------------------------

def _session_user(authorization):
    token = (authorization or "").removeprefix("Bearer ").strip()
    username = _sessions.get(token)
    if not username:
        raise HTTPException(status_code=401, detail="Yetkisiz. Lütfen tekrar giriş yapın.")
    user = user_store.get_user(username)
    if user is None:  # hesap silinmis
        _sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Hesabınız kaldırılmış. Yöneticinize başvurun.")
    user["token"] = token
    return user


def require_session(authorization: str = Header(None)):
    return _session_user(authorization)


def require_permission(permission):
    """Belirli bir yetkiyi zorunlu kilan bagimlilik uretir."""

    def dependency(authorization: str = Header(None)):
        user = _session_user(authorization)
        if not user_store.has_permission(user["role"], permission):
            raise HTTPException(
                status_code=403,
                detail=f"Bu işlem için yetkiniz yok. Rolünüz: {user['role_label']}.",
            )
        return user

    return dependency


def require_owner(authorization: str = Header(None)):
    user = _session_user(authorization)
    if user["role"] != user_store.OWNER_ROLE:
        raise HTTPException(status_code=403, detail="Bu işlemi yalnızca sahip yapabilir.")
    return user


def _user_payload(user):
    return {
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "role_label": user["role_label"],
        "is_owner": user["role"] == user_store.OWNER_ROLE,
        "permissions": user_store.permissions_for(user["role"]),
    }


# --------------------------------------------------------------------------
# Sayfalar
# --------------------------------------------------------------------------

_NO_CACHE = {"Cache-Control": "no-store, must-revalidate"}


@app.get("/")
def page_chat():
    return FileResponse(STATIC_DIR / "index.html", headers=_NO_CACHE)


@app.get("/admin")
def page_admin():
    return FileResponse(STATIC_DIR / "admin.html", headers=_NO_CACHE)


# --------------------------------------------------------------------------
# Yarismaci API (giris gerektirmez)
# --------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    # Ekranda secili yarisma - ISTEGE BAGLI. Bos birakilirsa soru metnindeki
    # yarisma adina, o da yoksa genel kaynaklara gore yanitlanir.
    context: str | None = None
    # geriye donuk uyumluluk (eski istemci/testler)
    competition: str | None = None


@app.get("/api/competitions")
def api_competitions():
    return {"competitions": list_real_competitions()}


@app.get("/api/contexts")
def api_contexts():
    """Yarismacinin baslangicta secmesi icin baglam listesi."""
    return {
        "general_label": GENERAL_LABEL,
        "general_description": "Tüm yarışmalar için geçerli genel kurallar, etik kurallar ve SSS.",
        "competitions": list_real_competitions(),
    }


@app.post("/api/ask")
def api_ask(req: AskRequest):
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Soru boş olamaz.")

    context = (req.context or req.competition or "").strip() or None
    if context and context != GENERAL_LABEL and context not in list_real_competitions():
        raise HTTPException(status_code=400, detail="Geçersiz yarışma seçimi.")

    # Secim zorunlu degil: soruda yarisma adi geciyorsa o kazanir, yoksa ekranda
    # secili yarisma, o da yoksa genel kaynaklar (bkz. answer_auto).
    result = answer_auto(question, context)

    status = result["status"]
    return {
        "answer": _answer_body(result["answer"]),
        "status": status,
        "confidence": result.get("confidence"),
        "top_score": result.get("top_score"),
        "sources": _clean_sources(result.get("sources")) if status == "answered" else [],
        "current_competition": result.get("current_competition"),
        "context": context,
        "competition_options": list_real_competitions() if status == "needs_competition" else [],
    }


# --------------------------------------------------------------------------
# Oturum
# --------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/admin/login")
def api_admin_login(req: LoginRequest):
    user_store.ensure_owner()
    user = user_store.verify(req.username, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı.")
    token = secrets.token_urlsafe(32)
    _sessions[token] = user["username"]
    return {"token": token, "user": _user_payload(user)}


@app.post("/api/admin/logout")
def api_admin_logout(user=Depends(require_session)):
    _sessions.pop(user["token"], None)
    return {"ok": True}


@app.get("/api/admin/me")
def api_admin_me(user=Depends(require_session)):
    return {"user": _user_payload(user), "roles": user_store.roles_catalog()}


# --------------------------------------------------------------------------
# Kaynak havuzu
# --------------------------------------------------------------------------

@app.get("/api/admin/documents")
def api_admin_documents(_=Depends(require_permission("sources.view"))):
    docs = list_documents()
    return {
        "documents": docs,
        "stats": {
            "total": len(docs),
            "active": sum(1 for d in docs if d["status"] == "active"),
            "inactive": sum(1 for d in docs if d["status"] == "inactive"),
            "chunks": get_collection().count(),
        },
    }


class StatusRequest(BaseModel):
    document_id: str
    version: int
    status: str


@app.post("/api/admin/documents/status")
def api_admin_set_status(req: StatusRequest, _=Depends(require_permission("sources.status"))):
    if req.status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Durum 'active' veya 'inactive' olmalı.")

    set_status(req.document_id, req.version, req.status)
    collection = get_collection()
    matching = collection.get(
        where={"$and": [{"document_id": req.document_id}, {"version": req.version}]},
        include=["metadatas"],
    )
    if matching["ids"]:
        collection.update(
            ids=matching["ids"],
            metadatas=[{**m, "status": req.status} for m in matching["metadatas"]],
        )
    _invalidate_search_cache()
    return {"ok": True, "updated_chunks": len(matching["ids"])}


@app.post("/api/admin/upload")
def api_admin_upload(
    competition: str = Form(...),
    file: UploadFile = File(...),
    _=Depends(require_permission("sources.upload")),
):
    competition = competition.strip()
    if not competition:
        raise HTTPException(status_code=400, detail="Yarışma/kategori seçilmedi.")

    filename = Path(file.filename or "").name
    if Path(filename).suffix.lower() not in SUPPORTED:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen dosya türü. İzin verilenler: {', '.join(sorted(SUPPORTED))}",
        )

    target_dir = ROOT / competition
    target_dir.mkdir(parents=True, exist_ok=True)
    dest_path = target_dir / filename
    rel_path = str(dest_path.relative_to(ROOT))
    is_update = dest_path.exists()

    collection = get_collection()
    deactivated = 0
    if is_update:
        # Eski versiyon SILINMEZ; gecmis kayit olarak kalir, sadece aramadan cikarilir.
        old = collection.get(
            where={"$and": [{"source_path": rel_path}, {"status": "active"}]},
            include=["metadatas"],
        )
        if old["ids"]:
            collection.update(
                ids=old["ids"],
                metadatas=[{**m, "status": "inactive"} for m in old["metadatas"]],
            )
            deactivated = len(old["ids"])

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    document_id, version = register_new_version(
        competition, filename, rel_path, category=registry_category(competition)
    )
    records = records_for_file(
        dest_path,
        competition,
        get_tokenizer(),
        version=version,
        status="active",
        document_id=document_id,
    )
    if not records:
        raise HTTPException(
            status_code=400,
            detail="Dosyadan metin çıkarılamadı (taranmış/görsel PDF olabilir).",
        )
    ingest_records(records, collection)
    _invalidate_search_cache()

    return {
        "ok": True,
        "is_update": is_update,
        "version": version,
        "chunks": len(records),
        "deactivated_chunks": deactivated,
        "file": filename,
        "competition": competition,
    }


class DeleteRequest(BaseModel):
    document_id: str


@app.post("/api/admin/documents/delete")
def api_admin_delete(req: DeleteRequest, _=Depends(require_permission("sources.delete"))):
    docs = [d for d in list_documents() if d["document_id"] == req.document_id]
    if not docs:
        raise HTTPException(status_code=404, detail="Belge kaydı bulunamadı.")

    rel_path = docs[0]["source_path"]
    collection = get_collection()
    collection.delete(where={"source_path": rel_path})

    file_path = ROOT / rel_path
    if file_path.exists():
        file_path.unlink()

    deactivate_all_versions(req.document_id)
    _invalidate_search_cache()
    return {"ok": True, "file": docs[0]["file_name"]}


# --------------------------------------------------------------------------
# Yanitsiz sorular -> SSS (model guncelleme)
# --------------------------------------------------------------------------

@app.get("/api/admin/unanswered")
def api_admin_unanswered(_=Depends(require_permission("questions.view"))):
    log = read_log()
    resolved = sss_store.resolved_questions()
    pending = [e for e in unanswered_questions() if e["question"] not in resolved]
    entries = sss_store.list_entries()
    return {
        "unanswered": list(reversed(pending))[:200],
        "sss_entries": list(reversed(entries))[:100],
        "stats": {
            "total_questions": len(log),
            "answered": sum(1 for e in log if e["status"] == "answered"),
            "unanswered": len(pending),
            "resolved": len(entries),
        },
    }


class AnswerRequest(BaseModel):
    question: str
    answer: str
    competition: str | None = None


@app.post("/api/admin/questions/answer")
def api_admin_answer_question(
    req: AnswerRequest, user=Depends(require_permission("questions.answer"))
):
    """Yetkilinin yazdigi cevabi SSS kaydi olarak isler ve ANINDA vektor
    veritabanina ekler; ayni soru tekrar sorulursa model artik yanitlar."""
    competition = (req.competition or "").strip() or None
    if competition and competition not in list_real_competitions():
        raise HTTPException(status_code=400, detail="Geçersiz yarışma seçimi.")
    try:
        entry, added = sss_store.add_entry(
            req.question, req.answer, competition=competition, author=user["username"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _invalidate_search_cache()
    return {"ok": True, "entry": entry, "indexed_chunks": added}


# --------------------------------------------------------------------------
# Kullanicilar ve roller
# --------------------------------------------------------------------------

@app.get("/api/admin/users")
def api_admin_users(user=Depends(require_permission("users.view"))):
    return {
        "users": user_store.list_users(),
        "roles": user_store.roles_catalog(),
        "can_manage": user_store.has_permission(user["role"], "users.manage"),
        "is_owner": user["role"] == user_store.OWNER_ROLE,
    }


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str
    display_name: str | None = None


@app.post("/api/admin/users")
def api_admin_create_user(
    req: CreateUserRequest, user=Depends(require_permission("users.manage"))
):
    try:
        created = user_store.create_user(
            req.username, req.password, req.role,
            display_name=req.display_name, created_by=user["username"],
        )
    except user_store.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": created}


class RoleRequest(BaseModel):
    username: str
    role: str


@app.post("/api/admin/users/role")
def api_admin_set_role(req: RoleRequest, user=Depends(require_permission("users.manage"))):
    if req.username == user["username"]:
        raise HTTPException(status_code=400, detail="Kendi rolünüzü değiştiremezsiniz.")
    try:
        updated = user_store.set_role(req.username, req.role)
    except user_store.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": updated}


class PasswordRequest(BaseModel):
    username: str
    password: str


@app.post("/api/admin/users/password")
def api_admin_set_password(
    req: PasswordRequest, _=Depends(require_permission("users.manage"))
):
    try:
        user_store.set_password(req.username, req.password)
    except user_store.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


class UsernameRequest(BaseModel):
    username: str


@app.post("/api/admin/users/delete")
def api_admin_delete_user(
    req: UsernameRequest, user=Depends(require_permission("users.manage"))
):
    if req.username == user["username"]:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz.")
    try:
        user_store.delete_user(req.username)
    except user_store.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Silinen kullanicinin acik oturumlarini dusur.
    for tok, name in list(_sessions.items()):
        if name == req.username:
            _sessions.pop(tok, None)
    return {"ok": True}


@app.post("/api/admin/users/transfer")
def api_admin_transfer_owner(req: UsernameRequest, user=Depends(require_owner)):
    try:
        new_owner = user_store.transfer_ownership(user["username"], req.username)
    except user_store.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "user": new_owner}


# --------------------------------------------------------------------------

class NoCacheStaticFiles(StaticFiles):
    """Tarayici eski CSS/JS'i onbellekten gostermesin: her istekte sunucuya
    dogrulatir. Aksi halde arayuz guncellemeleri Ctrl+F5 yapilmadan gorunmez."""

    def is_not_modified(self, response_headers, request_headers):
        return False

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        return response


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


def _free_port(preferred=8000, tries=20):
    """Tercih edilen port doluysa (baska bir uygulama kullaniyorsa) bir sonraki
    bos portu secer; boylece calisan diger servisler kesintiye ugramaz."""
    import socket

    for offset in range(tries):
        port = preferred + offset
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError("Bos port bulunamadi.")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PIRI_PORT") or _free_port())
    print(f"\n  >>> Piri web arayuzu:  http://127.0.0.1:{port}\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
