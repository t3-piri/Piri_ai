"""Yonetim paneli kullanici ve rol yonetimi.

Tek bir SAHIP hesabi vardir; genel yetki ondadir ve diger hesaplari o acar,
rollerini o belirler. Diger roller (yonetici / editor / izleyici) sahibin
verdigi yetki kadarini gorur.

Sifreler PBKDF2-HMAC-SHA256 ile saklanir (ek bagimlilik yok). Bu bir demo
kurulumu oldugundan sifre politikasi bilincli olarak gevsek tutulmustur.
"""

import hashlib
import os
import secrets
import sqlite3
import time
from pathlib import Path

DB_FILE = Path("users.db")

PBKDF2_ROUNDS = 120_000

# ---------------------------------------------------------------- roller

OWNER_ROLE = "sahip"

# Yetki anahtarlari - arayuz de bu listeye gore bolum/dugme gosterir.
PERMISSIONS = (
    "sources.view",      # kaynak havuzunu goruntule
    "sources.upload",    # yeni belge / yeni surum yukle
    "sources.status",    # belgeyi aktif-pasif yap
    "sources.delete",    # belgeyi tamamen sil
    "questions.view",    # yanitsiz sorulari goruntule
    "questions.answer",  # yanitsiz soruyu yanitlayip SSS'e isle
    "users.view",        # kullanici listesini gor
    "users.manage",      # kullanici ekle/sil, rol degistir
)

ROLES = {
    "sahip": {
        "label": "Sahip",
        "description": "Tüm yetkiler. Kullanıcıları açar, rollerini belirler. Tek kişidir.",
        "permissions": set(PERMISSIONS),
        "rank": 0,
    },
    "yonetici": {
        "label": "Yönetici",
        "description": "Kaynakları ve soruları tam yönetir; kullanıcı listesini görür ama değiştiremez.",
        "permissions": {
            "sources.view", "sources.upload", "sources.status", "sources.delete",
            "questions.view", "questions.answer", "users.view",
        },
        "rank": 1,
    },
    "editor": {
        "label": "İçerik Editörü",
        "description": "Belge yükler ve yanıtsız soruları cevaplar; silme/pasife alma yetkisi yoktur.",
        "permissions": {"sources.view", "sources.upload", "questions.view", "questions.answer"},
        "rank": 2,
    },
    "izleyici": {
        "label": "Gözlemci",
        "description": "Yalnızca görüntüler; hiçbir değişiklik yapamaz.",
        "permissions": {"sources.view", "questions.view"},
        "rank": 3,
    },
}

ASSIGNABLE_ROLES = [r for r in ROLES if r != OWNER_ROLE]


def role_label(role):
    return ROLES.get(role, {}).get("label", role)


def permissions_for(role):
    return sorted(ROLES.get(role, {}).get("permissions", set()))


def has_permission(role, permission):
    return permission in ROLES.get(role, {}).get("permissions", set())


def roles_catalog():
    """Arayuzde rol secimi/aciklamasi icin sirali rol listesi."""
    return [
        {
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "permissions": sorted(meta["permissions"]),
            "assignable": key != OWNER_ROLE,
        }
        for key, meta in sorted(ROLES.items(), key=lambda kv: kv[1]["rank"])
    ]


# ---------------------------------------------------------------- depolama

def _connect():
    conn = sqlite3.connect(DB_FILE)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            username    TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            role        TEXT NOT NULL,
            salt        TEXT NOT NULL,
            pw_hash     TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            created_by  TEXT,
            last_login  TEXT
        )
        """
    )
    return conn


def _hash(password, salt):
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ROUNDS
    ).hex()


def _row_to_user(row):
    return {
        "username": row[0],
        "display_name": row[1],
        "role": row[2],
        "role_label": role_label(row[2]),
        "created_at": row[5],
        "created_by": row[6],
        "last_login": row[7],
    }


class UserError(Exception):
    """Cagiran tarafin kullaniciya gosterebilecegi dogrulama hatasi."""


def ensure_owner():
    """Hic kullanici yoksa .env'deki bilgilerle SAHIP hesabini olusturur.
    Zaten bir sahip varsa dokunmaz (sifre .env'den yeniden yazilmaz)."""
    conn = _connect()
    try:
        cur = conn.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] > 0:
            return None

        username = (os.environ.get("OWNER_USERNAME") or "sahip").strip()
        password = os.environ.get("ADMIN_PASSWORD") or "admin123"
        display = os.environ.get("OWNER_DISPLAY_NAME") or "Sistem Sahibi"
        salt = secrets.token_hex(16)
        conn.execute(
            """INSERT INTO users
               (username, display_name, role, salt, pw_hash, created_at, created_by, last_login)
               VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)""",
            (username, display, OWNER_ROLE, salt, _hash(password, salt),
             time.strftime("%Y-%m-%d %H:%M")),
        )
        conn.commit()
        return username
    finally:
        conn.close()


def get_user(username):
    conn = _connect()
    try:
        cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def list_users():
    conn = _connect()
    try:
        cur = conn.execute("SELECT * FROM users")
        users = [_row_to_user(r) for r in cur.fetchall()]
    finally:
        conn.close()
    return sorted(users, key=lambda u: (ROLES.get(u["role"], {}).get("rank", 9), u["username"]))


def verify(username, password):
    """Dogruysa kullanici sozlugunu, degilse None dondurur."""
    conn = _connect()
    try:
        cur = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),))
        row = cur.fetchone()
        if row is None:
            return None
        if not secrets.compare_digest(_hash(password, row[3]), row[4]):
            return None
        conn.execute(
            "UPDATE users SET last_login = ? WHERE username = ?",
            (time.strftime("%Y-%m-%d %H:%M"), row[0]),
        )
        conn.commit()
        return _row_to_user(row)
    finally:
        conn.close()


def create_user(username, password, role, display_name=None, created_by=None):
    username = (username or "").strip().lower()
    if not username or not username.isascii() or " " in username:
        raise UserError("Kullanıcı adı boşluksuz ve ASCII olmalı.")
    if len(password or "") < 4:
        raise UserError("Şifre en az 4 karakter olmalı.")
    if role not in ASSIGNABLE_ROLES:
        raise UserError("Sahip rolü yeni hesaba verilemez; devretmek için sahipliği aktarın.")

    salt = secrets.token_hex(16)
    conn = _connect()
    try:
        conn.execute(
            """INSERT INTO users
               (username, display_name, role, salt, pw_hash, created_at, created_by, last_login)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
            (username, (display_name or username).strip(), role, salt, _hash(password, salt),
             time.strftime("%Y-%m-%d %H:%M"), created_by),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise UserError("Bu kullanıcı adı zaten var.")
    finally:
        conn.close()
    return get_user(username)


def set_role(username, role):
    if role not in ASSIGNABLE_ROLES:
        raise UserError("Geçersiz rol. Sahiplik yalnızca devir ile değişir.")
    user = get_user(username)
    if user is None:
        raise UserError("Kullanıcı bulunamadı.")
    if user["role"] == OWNER_ROLE:
        raise UserError("Sahibin rolü değiştirilemez; önce sahipliği devredin.")
    conn = _connect()
    try:
        conn.execute("UPDATE users SET role = ? WHERE username = ?", (role, username))
        conn.commit()
    finally:
        conn.close()
    return get_user(username)


def set_password(username, password):
    if len(password or "") < 4:
        raise UserError("Şifre en az 4 karakter olmalı.")
    if get_user(username) is None:
        raise UserError("Kullanıcı bulunamadı.")
    salt = secrets.token_hex(16)
    conn = _connect()
    try:
        conn.execute(
            "UPDATE users SET salt = ?, pw_hash = ? WHERE username = ?",
            (salt, _hash(password, salt), username),
        )
        conn.commit()
    finally:
        conn.close()


def delete_user(username):
    user = get_user(username)
    if user is None:
        raise UserError("Kullanıcı bulunamadı.")
    if user["role"] == OWNER_ROLE:
        raise UserError("Sahip hesabı silinemez.")
    conn = _connect()
    try:
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
    finally:
        conn.close()


def transfer_ownership(current_owner, new_owner):
    """Sahiplik tek kisidedir: yeni sahip atanirken eski sahip 'yonetici' olur."""
    target = get_user(new_owner)
    if target is None:
        raise UserError("Devredilecek kullanıcı bulunamadı.")
    if target["role"] == OWNER_ROLE:
        raise UserError("Bu kullanıcı zaten sahip.")
    conn = _connect()
    try:
        conn.execute("UPDATE users SET role = 'yonetici' WHERE username = ?", (current_owner,))
        conn.execute("UPDATE users SET role = ? WHERE username = ?", (OWNER_ROLE, new_owner))
        conn.commit()
    finally:
        conn.close()
    return get_user(new_owner)
