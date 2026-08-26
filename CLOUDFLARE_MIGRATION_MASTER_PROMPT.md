# CLAUDE CODE MASTER PROMPT

# Piri (TEKNOFEST Yarışmacı Destek Asistanı) — Cloudflare'e Taşıma

## Mevcut Python/FastAPI backend'ini davranışını birebir koruyarak Cloudflare Workers + D1 + Vectorize + KV'ye taşıma

---

# 0. KRİTİK TALİMAT — HER ŞEYDEN ÖNCE OKU

Bu bir "sıfırdan proje kurma" görevi DEĞİL. **Piri zaten çalışan, canlı
kullanıcıları olacak bir ürün.** Görev: mevcut React frontend'i (`frontend/`)
HİÇ DEĞİŞTİRMEDEN, arkasındaki Python/FastAPI backend'inin (`backend/`) TÜM
davranışını Cloudflare Workers üzerinde birebir yeniden üretmek.

**Asla:**
- Bir endpoint'in path'ini, method'unu, request/response şeklini "daha iyi"
  olur diye değiştirme.
- Bir rolü/yetkiyi/durum makinesini sadeleştirme veya "temizleme".
- Bir özelliği (ör. hibrit arama, SSS döngüsü, activity calendar,
  avatar yükleme) "şimdilik gerekli değil" diyerek atlama.
- Frontend'de tek satır bile değiştirme (CORS/base-URL ayarı dışında).

**Bir şeyi farklı/daha iyi yapabileceğini düşünürsen** (ör. bir güvenlik
açığı, bariz bir performans sorunu, mevcut kodda bir bug fark edersen):
**önce kullanıcıya sor, sessizce karar verip uygulama.** Kullanıcı bunu
açıkça şart koştu.

**Referans kaynaklar (bu konuşmanın geçmişinde, üç ayrı araştırma ajanının
çıkardığı tam envanterler):**
1. `backend/` API sözleşmesi — her endpoint, auth modeli, roller/yetkiler,
   belge versiyonlama, RAG routing davranışı, qa_log/sss_store/insights veri
   şekli. (Bu dosyanın "Ek A" bölümünde özetlenmiştir.)
2. `frontend/src/` API çağrıları — her sayfa/component'in hangi endpoint'i
   nasıl çağırdığı, hangi response alanlarını kullandığı. (Bu dosyanın
   "Ek B" bölümünde özetlenmiştir.)
3. Mevcut `t3_claudeflare/teknofest-rag-api` projesi — Cloudflare
   pattern'leri (Workers AI provider abstraction, KV dosya depolama, D1
   migration yapısı, doğrulanmış model ID'leri) buradan **desen olarak**
   alınacak, ama şema/roller/endpoint'ler Piri'nin kendi sözleşmesine göre
   olacak — o projenin şeması/rolleri KOPYALANMAYACAK.

İlerleme her faz sonunda `CLOUDFLARE_MIGRATION_ILERLEME.md` dosyasına
yazılacak — context/hafıza dolsa bile oradan devam edilecek.

---

# 1. NEYİN DEĞİŞMEYECEĞİ (korunacak davranış sözleşmesi)

## 1.1 Frontend
`frontend/` klasörü kod olarak değişmez. Sadece `VITE_API_BASE_URL` (veya
CORS ayarları) yeni backend'i işaret edecek şekilde ayarlanır.

## 1.2 Auth
`Authorization: Bearer <token>` header'ı ile — cookie DEĞİL. Login
`/api/admin/login` → `{token, user}` döner, frontend bunu localStorage/
sessionStorage'da tutup her isteğe ekler.

## 1.3 Roller ve yetkiler (birebir)

| Rol anahtarı | rank | Yetkiler |
|---|---|---|
| `sahip` | 0 | TÜMÜ (8 yetki), tek kişi, atanamaz, sadece devir ile değişir |
| `yonetici` | 1 | sources.view/upload/status/delete, questions.view/answer, users.view |
| `icerik_yoneticisi` | 2 | sources.view/upload/status |
| `destek_ekibi` | 3 | questions.view/answer |
| `izleyici` | 4 | sources.view, questions.view |

8 yetki anahtarı: `sources.view, sources.upload, sources.status,
sources.delete, questions.view, questions.answer, users.view, users.manage`.

## 1.4 Endpoint envanteri (Ek A'da tam detay — path/method/body/response)

Public: `GET /api/competitions`, `GET /api/contexts`, `POST /api/ask`.
Auth: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`.
Profil: `POST /api/admin/profile`, `POST /api/admin/profile/photo`,
`POST /api/admin/profile/photo/delete`, `POST /api/admin/profile/password`.
Kullanıcılar: `GET/POST /api/admin/users`, `POST /api/admin/users/role`,
`POST /api/admin/users/delete`, `POST /api/admin/users/transfer`,
`POST /api/admin/users/password`.
Belgeler: `GET /api/admin/documents`, `POST /api/admin/upload`,
`POST /api/admin/documents/metadata`, `POST /api/admin/documents/status`,
`POST /api/admin/documents/delete`.
Sorular: `GET /api/admin/unanswered`, `GET /api/admin/activity`,
`POST /api/admin/questions/answer`.

## 1.5 Belge versiyonlama
`status ∈ {active, inactive}`. Yeni versiyon yüklenince eskisi `inactive`
yapılır, silinmez (denetim kaydı olarak kalır). Chroma/Vectorize'daki eski
chunk'lar da silinmez, sadece metadata'da `inactive` işaretlenir.

## 1.6 RAG routing davranışı
1. Soruda açık yarışma adı geçiyorsa (en uzun/en spesifik eşleşme) → önce o
   yarışmanın kaynakları.
2. Yoksa → önce genel (SSS/etik) kaynaklar.
3. Belirsizse → `needs_competition` (kullanıcıya sorulur).
4. Hibrit arama: dense (embedding) + BM25 lexical, Reciprocal Rank Fusion
   (rrf_k=60), top_k=14/fetch_k=45.
5. Generation: Gemini (google-genai), marker tabanlı status sınıflandırma
   (`UNRELATED_MARKER`, `FLAG_MARKER`, `SUPPORT_CONTACT`).
6. Çıktı: `{answer, status, confidence, top_score, sources[],
   current_competition, flagged}`, `status ∈ {answered, redirected,
   unrelated, out_of_scope, technical_error, low_confidence,
   needs_competition, unclear}`.

## 1.7 QA log / SSS / Insights
`qa_log` her soru-cevabı `{timestamp, competition, question, answer,
status, top_score, flagged}` ile kaydeder. SSS kayıtları panelden
cevaplanan sorulardan anında yeni chunk olarak indekse işlenir. Insights
(activity/quality/referral/frequent_unanswered) bu logun üzerinde hesaplanan
saf fonksiyonlardır — ayrı depolama gerekmez.

---

# 2. ZORUNLU DEĞİŞİKLİKLER (davranış korunarak, ama alt yapı değişiyor)

Bunların HER BİRİ, o faza gelindiğinde kullanıcıya tekrar hatırlatılacak —
sessizce uygulanmayacak:

1. **Depolama**: SQLite → D1, Chroma → Vectorize, yerel dosya sistemi → KV
   (R2 KULLANILMAYACAK — hafızada kayıtlı kalıcı karar: kullanıcı ödeme
   yöntemi eklemeyi reddetti).
2. **Embedding modeli**: yerel `intfloat/multilingual-e5-large-instruct`
   Cloudflare'de çalışamaz → Workers AI embedding modeline geçilecek
   (aday: `@cf/qwen/qwen3-embedding-0.6b`, diğer projede doğrulanmış).
   **Bu, mevcut skor eşiklerini (`SCORE_THRESHOLD=0.5`,
   `CONFIDENCE_HIGH=0.75`) geçersiz kılar — yeniden kalibrasyon gerekir.**
3. **Generation Gemini'de KALACAK** (Workers AI'ye geçilmeyecek) — mevcut
   `google-genai` + marker tabanlı prompt sözleşmesi davranışsal olarak
   korunsun diye bilinçli tercih. Worker içinden Gemini API'sine `fetch` ile
   çağrı yapılacak.
4. **Session store**: mevcut backend bellek-içi (`_sessions = {}`,
   restart'ta düşer). Workers stateless olduğu için bu birebir taşınamaz →
   D1/KV tabanlı kalıcı session olacak. **Davranış değişikliği — kullanıcıya
   sorulacak.**
5. **BM25**: Vectorize'da native yok → D1 FTS5 virtual table ile yeniden
   kurulacak, Vectorize sonuçlarıyla RRF'de birleştirilecek.

---

# 3. YENİDEN KULLANILACAK DESENLER (t3_claudeflare/teknofest-rag-api'den)

**Kopyalanacak (davranış olarak, kod olarak uyarlanarak):**
- `lib/ai/embeddingProvider.ts` / `rerankerProvider.ts` — provider
  abstraction deseni (interface + Cloudflare Workers AI implementasyonu).
- KV dosya depolama deseni (`kv.put(docversion:{id}, arrayBuffer)`).
- D1 migration dosya yapısı (`migrations/0001_...sql` sıralı numaralama).
- Doğrulanmış model ID'leri (embedding, reranker — generation Gemini'de
  kalacağı için oradaki generation modeli kullanılmayacak).
- `wrangler.jsonc`'deki `"remote": true` gotcha'sı: AI ve Vectorize
  binding'leri yerel `wrangler dev`'de bile remote çalışmalı.

**KOPYALANMAYACAK (Piri'nin kendi sözleşmesine göre sıfırdan yazılacak):**
- D1 şeması (roller/tablolar tamamen farklı).
- Auth modeli (cookie değil, Bearer token).
- Route yapısı ve path'leri.
- RAG answer engine (topic classifier yerine Piri'nin yarışma-adı-tespiti +
  marker tabanlı sistemi).

---

# 4. BENDEN (KULLANICI) GEREKEN İŞLER vs CLAUDE CODE'UN YAPACAKLARI

Her fazda bu ayrım açıkça belirtilecek:

```text
[ BENİM YAPACAĞIM ]
Cloudflare Dashboard / hesap / secret / onay gerektiren adımlar,
menü yolu + buton adı + kaynak adı düzeyinde açıklanacak.

[ CLAUDE CODE'UN YAPACAĞI ]
Dosya oluşturma/değiştirme, kod yazma, migration hazırlama, test yazma —
kullanıcı beklenmeden yapılır.
```

Kural: klasör/dosya oluşturma, kod yazma, migration hazırlama, test yazma
gibi Claude'un kendi başına yapabildiği işler için kullanıcı BEKLETİLMEZ.
Ama Cloudflare login, API token, secret, dashboard onayı, ücretli kaynak
açma gibi hesap gerektiren işlerde kullanıcı yönlendirilir.

**Secret'lar asla düz metin olarak istenmez** — `wrangler secret put ...`
gibi güvenli yöntem kullanılır.

**Ücretli bir Cloudflare özelliği kullanılmadan önce**: ne işe yaradığı,
ücretsiz/ücretli durumu, limiti, MVP için gerekli olup olmadığı kullanıcıya
sorulur, onaysız açılmaz.

**Model/API bilgisinde emin olunmayan durumda tahmin edilmez** — güncel
Cloudflare dokümantasyonu kontrol edilir (`cloudflare` skill'i kullanılır).

---

# 5. FAZ LİSTESİ

Her faz şu formatla yürütülür: **Amaç → Neden → Benim Yapacağım →
Claude'un Yapacağı → Komutlar → Dosyalar → Test → Beklenen Sonuç → Hata
Olursa → Faz Kontrolü**. Faz bitince `CLOUDFLARE_MIGRATION_ILERLEME.md`
güncellenir. Kullanıcı onayı olmadan bir sonraki BÜYÜK faza geçilmez (küçük
alt adımlar kullanıcı beklenmeden yapılabilir).

## FAZ 0 — Analiz (TAMAMLANDI)
Bu dosya + `CLOUDFLARE_MIGRATION_ILERLEME.md` bu fazın çıktısıdır.

## FAZ 1 — Ortam ve Cloudflare Kaynak Kararı
Node/wrangler/git kontrolü. **Kritik karar (kullanıcıya sorulacak)**: eski
`teknofest-rag-api`nin D1/KV/Vectorize kaynakları silinip yeniden mi
kullanılsın, yoksa yeni isimle mi açılsın.

## FAZ 2 — Proje İskeleti ve wrangler.jsonc
Yeni/yeniden kullanılan Worker projesi, binding'ler (`DB`, `AI`,
`DOCS_KV`, `VECTORIZE`), `assets` (React `frontend/dist` için).

## FAZ 3 — D1 Şeması
Piri'nin tam veri modeli: `users` (5 rol), `permissions`/`role_permissions`,
`sessions`, `documents`/`document_versions` (active/inactive+version),
`qa_log`, `sss_entries`. Migration dosyaları + seed (sahip hesabı).

## FAZ 4 — Auth / RBAC
Bearer token + D1 session store, PBKDF2 (120000 iterasyon/SHA-256/16-byte
salt — mevcut Python parametreleriyle birebir, farklı hash'ler
üretmemesi için `verify()` mantığı da birebir taşınmalı).

## FAZ 5 — Belge Yönetimi
Upload (KV'ye yaz) + metadata + status + delete endpoint'leri, versiyonlama
mantığı.

## FAZ 6 — Belge İşleme (extract + chunk)
Workers AI `toMarkdown` + Piri'nin chunking mantığına yakın bir chunker.

## FAZ 7 — Embedding + Vectorize + Hibrit Arama
Workers AI embedding modeli entegrasyonu, Vectorize upsert/query, D1 FTS5
BM25, RRF birleştirme.

## FAZ 8 — RAG Answer Engine
Yarışma tespiti routing, Gemini generation (fetch), confidence hesaplama,
marker tabanlı status sınıflandırma — `local_rag_answer.py`'nin davranışsal
birebir portu.

## FAZ 9 — Kalan Endpoint'ler
SSS/qa_log, insights/analytics (`/api/admin/unanswered`,
`/api/admin/activity`), kullanıcı yönetimi, profil/avatar.

## FAZ 10 — Frontend Bağlama
`VITE_API_BASE_URL`/CORS. Frontend kodu değişmez.

## FAZ 11 — Uçtan Uca Doğrulama
`backend/test_*.py`'nin kapsadığı senaryolar + Ek A/B'deki davranış
sözleşmesine karşı manuel/otomatik test. Kritik testler (mevcut projenin
FAZ 22-24'ünden esinlenerek): cross-competition izolasyonu, eski versiyon
kullanılmaması, prompt injection savunması, evidence-yoksa-cevap-yok.

## FAZ 12 — Deploy ve Eski Kaynakların Temizliği
`wrangler deploy`. Railway/eski Cloudflare kaynaklarının temizliği yalnızca
kullanıcı onayıyla.

---

# 6. KOD KALİTESİ KURALI

Eksik kod/TODO/placeholder bırakılmaz. Sahte/deprecated API kullanılmaz.
TypeScript strict, modüler (`routes/`, `lib/`). Production-quality.

---

# 7. FINAL ACCEPTANCE CRITERIA

```text
[ ] Frontend (React) hiç değişmedi, aynı build kullanılıyor
[ ] Tüm endpoint'ler path/method/response şekli olarak birebir aynı
[ ] 5 rol + 8 yetki birebir çalışıyor
[ ] Bearer token auth çalışıyor
[ ] Belge versiyonlama (active/inactive) çalışıyor
[ ] Hibrit arama (dense+BM25+RRF) çalışıyor
[ ] Yarışma-adı-tespiti routing önceliği çalışıyor
[ ] Gemini generation + marker sınıflandırma çalışıyor
[ ] Evidence yoksa cevap yok kuralı çalışıyor
[ ] Cross-competition/cross-category izolasyonu çalışıyor
[ ] Eski (inactive) belge versiyonu asla kullanılmıyor
[ ] SSS döngüsü (panelden cevapla → anında indekse gir) çalışıyor
[ ] Admin panel: kaynak havuzu, kullanıcılar, bilgi güncelleme, aktivite,
    genel bakış (grafikler dahil) çalışıyor
[ ] Prompt injection savunması çalışıyor
[ ] Production deploy tamam, canlı URL'de gerçek bir soru doğru cevaplanıyor
```

---

# EK A — Backend API Sözleşmesi (araştırma ajanı 1'in tam çıktısı)

## 1. HTTP API Envanteri (web_app.py) — METHOD /path — açıklama — auth

**Statik/SPA sunum (auth yok):**
- `GET /assets/{...}` — Vite build çıktısı statik dosyalar (hash'li, cache açık) — auth yok
- `GET /avatars/{...}` — kullanıcı profil fotoğrafları, `NoCacheStaticFiles` (her istekte no-store) — auth yok
- `GET /{full_path:path}` — catch-all SPA route, her zaman `frontend/dist/index.html` döner (no-store) — auth yok, **en sonda tanımlı**, yukarıdaki tüm `/api/*` ve statik mount'lar önce eşleşir

**Yarışmacı API (girişsiz, herkese açık):**
- `GET /api/competitions` — gerçek yarışma adları listesi (`{competitions: [...]}`) — auth yok
- `GET /api/contexts` — genel etiket + açıklama + yarışma listesi — auth yok
- `POST /api/ask` — body `AskRequest{question, context?, competition?(deprecated alias)}` → `answer_auto()` çağırır; response `{answer, status, confidence, top_score, sources[], current_competition, context, competition_options[]}` — auth yok

**Oturum:**
- `POST /api/admin/login` — body `LoginRequest{username, password}` → `{token, user}`; `user_store.verify()` + `secrets.token_urlsafe(32)` token, bellekte `_sessions` dict'e yazılır — auth yok (girişin kendisi)
- `POST /api/admin/logout` — `{ok: true}`, token'ı `_sessions`'tan siler — `Depends(require_session)`
- `GET /api/admin/me` — `{user, roles}` — `Depends(require_session)`

**Kaynak havuzu (belgeler):**
- `GET /api/admin/documents` — belge listesi + istatistik (`total/active/inactive/chunks`) — `require_permission("sources.view")`
- `POST /api/admin/documents/status` — body `StatusRequest{document_id, version, status}` (`active`|`inactive`), Chroma metadata'sını da günceller, arama cache'ini temizler — `require_permission("sources.status")`
- `POST /api/admin/upload` — multipart form: `competition, file, doc_type?, kaynak_adi?, gecerlilik_bitis?`; dosyayı diske yazar, `register_new_version()` çağırır, chunk'layıp embed edip Chroma'ya ekler — `require_permission("sources.upload")`
- `POST /api/admin/documents/metadata` — body `MetadataRequest{document_id, version, doc_type?, kaynak_adi?, gecerlilik_bitis?}` — `require_permission("sources.status")`
- `POST /api/admin/documents/delete` — body `DeleteRequest{document_id}`; dosya sistemi + Chroma + registry'den siler — `require_permission("sources.delete")`

**Yanıtsız sorular / SSS:**
- `GET /api/admin/unanswered` — yanıtsız sorular, SSS kayıtları, sıkça sorulanlar kümesi, teknik hatalar, yarışma-belirsiz sorular, bayraklı raporlar, kalite/yönlendirme istatistikleri — `require_permission("questions.view")`
- `GET /api/admin/activity` — yıl×ay etkinlik ızgarası + son 60 hareket — `require_permission("questions.view")`
- `POST /api/admin/questions/answer` — body `AnswerRequest{question, answer, competition?, also_resolves[]}` → `sss_store.add_entry()`, anında Chroma'ya işlenir — `require_permission("questions.answer")`

**Kullanıcılar ve roller:**
- `GET /api/admin/users` — kullanıcı listesi + rol kataloğu + `can_manage`/`is_owner` — `require_permission("users.view")`
- `POST /api/admin/users` — body `CreateUserRequest{username, password, role, display_name?}` — `require_permission("users.manage")`
- `POST /api/admin/users/role` — body `RoleRequest{username, role}`; kendi rolünü değiştiremez — `require_permission("users.manage")`
- `POST /api/admin/users/password` — body `PasswordRequest{username, password}` (başkasının şifresini sıfırlar) — `require_permission("users.manage")`
- `POST /api/admin/users/delete` — body `UsernameRequest{username}`; kendi hesabını silemez; ilgili tüm session'ları düşürür — `require_permission("users.manage")`
- `POST /api/admin/users/transfer` — body `UsernameRequest{username}`; sahiplik devri, eski sahip `yonetici` olur — `require_owner` (özel dependency, `users.manage` değil, `role == "sahip"` kontrolü)

**Profilim (herkes kendi hesabını düzenler, sadece oturum yeter):**
- `POST /api/admin/profile` — body `ProfileRequest{display_name}` — `require_session`
- `POST /api/admin/profile/photo` — multipart `file`; uzantı+magic-byte doğrulama (`.png/.jpg/.jpeg/.webp/.gif`, max 3MB) — `require_session`
- `POST /api/admin/profile/photo/delete` — mevcut avatar dosyalarını siler — `require_session`
- `POST /api/admin/profile/password` — body `SelfPasswordRequest{current_password, new_password}`; mevcut şifre doğrulanır — `require_session`

**Auth mekanizması özeti:** Header `Authorization: Bearer <token>` (cookie DEĞİL). Token → username eşlemesi sadece **bellekte** (`_sessions = {}` dict, process restart'ta tüm oturumlar düşer, kalıcı değil). Her istekte kullanıcı DB'den taze okunur (rol değişikliği/hesap silme anında etkili olur).

## 2. Roller / Yetkiler Tablosu (users.py)

| Rol anahtarı | Etiket | rank | Yetkiler |
|---|---|---|---|
| `sahip` | Sahip | 0 | TÜMÜ (8 yetki) — tek kişi, atanamaz, sadece devir ile değişir |
| `yonetici` | Yönetici | 1 | sources.view/upload/status/delete, questions.view/answer, users.view |
| `icerik_yoneticisi` | İçerik Yöneticisi | 2 | sources.view/upload/status |
| `destek_ekibi` | Destek Ekibi | 3 | questions.view/answer |
| `izleyici` | Gözlemci | 4 | sources.view, questions.view |

8 yetki anahtarı: `sources.view, sources.upload, sources.status, sources.delete, questions.view, questions.answer, users.view, users.manage`.

Not: eski `editor` rolü DB migration'da otomatik `icerik_yoneticisi`'ye çevriliyor (`UPDATE users SET role='icerik_yoneticisi' WHERE role='editor'`).

**Parola/depolama:** SQLite `users.db`, tablo `users(username PK, display_name, role, salt, pw_hash, created_at, created_by, last_login, avatar_path)`. Hash: PBKDF2-HMAC-SHA256, `120_000` round, salt `secrets.token_hex(16)` (16 byte hex), karşılaştırma `secrets.compare_digest`. `ensure_owner()`: DB boşsa `.env`'deki `OWNER_USERNAME`/`ADMIN_PASSWORD`/`OWNER_DISPLAY_NAME` ile tek seferlik sahip hesabı oluşturur (varsayılan `sahip`/`admin123`).

**Session/token:** Cookie kullanılmıyor; `Authorization: Bearer <opaque token>` header'ı. Token → kullanıcı adı eşlemesi yalnızca process belleğinde (`web_app._sessions`), kalıcılığı yok (yeniden başlatmada tüm girişler geçersiz olur). Bu, D1'e taşırken ayrıca modellenmesi gereken bir davranış (persistans yok = "in-memory session store").

## 3. Belge/Versiyon Durum Makinesi (document_registry.py)

Tablo `documents.db` → `documents(id PK autoincrement, document_id, file_name, competition, category, source_path, version INTEGER, status TEXT, upload_date, doc_type, kaynak_adi, gecerlilik_bitis)`.

- `document_id = f"{competition or 'genel'}::{file_name}"` — kompozit anahtar, gerçek unique constraint YOK (kod seviyesinde garanti edilir).
- **Durumlar:** yalnızca `"active"` / `"inactive"` string; DB'de enum/CHECK constraint yok.
- **Versiyonlama:** `register_new_version()` — aynı `document_id`'nin mevcut `active` satırını `inactive` yapar, `MAX(version)+1` ile yeni satırı `active` ekler. Eski versiyon satırı ASLA silinmez (denetim/geçmiş kaydı olarak kalır); Chroma'daki chunk'ları da silinmez, sadece o chunk'ların `status` metadata'sı `inactive` yapılır (arama filtresinden düşer).
- `doc_type/kaynak_adi/gecerlilik_bitis` yeni versiyon eklenirken verilmezse önceki aktif versiyondan miras alınır (geriye dönük uyumluluk).
- `ensure_registered()` — sadece document_id hiç yoksa version=1/active ekler (SSS panel kayıtları ve toplu ingest bunu kullanır); zaten varsa dokunmaz — versiyonlu güncelleme değildir.
- `set_status()` — belirli (document_id, version) satırının durumunu değiştirir; web_app tarafında bu Chroma metadata güncellemesiyle **birlikte** çağrılmalı (endpoint bunu manuel yapıyor, registry kendisi Chroma'ya dokunmuyor).
- `deactivate_all_versions()` — belge silinirken tüm versiyonları `inactive` yapar (registry satırları silinmez, sadece Chroma chunk'ları + kaynak dosya fiziksel olarak silinir).
- `VALID_DOC_TYPES = {"sartname", "kilavuz", "sss"}` (boş string/None = kategorisiz, kabul edilir).

Chroma tarafında chunk metadata şeması (bkz. `local_ingest.records_for_file`/`make_id`): `{competition, category(genel|sss|yarisma), file, file_type, locator, source_path, document_id, version, status}`. Chunk id = `md5(f"{rel_path}|{locator}|{idx}|v{version}")` — versiyon numarası id'ye gömülü, versiyonlar arası id çakışması engellenir.

## 4. RAG Akışı — Davranışsal Sözleşme (local_rag_answer.py)

**Girdi/çıktı sözleşmesi (üç public giriş noktası):**
- `answer_question(question, current_competition=None)` — CLI/eski akış, routing zincirini kendisi yürütür, gerekirse `needs_competition` döner (çağıran taraf yarışma sorup tekrar çağırmalı).
- `answer_in_context(question, context, include_general=True)` — kullanıcı arayüzde bağlamı açıkça seçtiğinde: arama SADECE o bağlamın kaynaklarında yapılır (soru metninde başka yarışma geçse bile bağlam dışına çıkılmaz).
- `answer_auto(question, selected_competition=None)` — **`/api/ask`'ın kullandığı** üst düzey giriş: metinde yarışma adı geçiyorsa direkt o yarışmaya gider (ekrandaki seçimden bile önceliklidir); yoksa ekran seçimine bakar; o da yoksa önce genel kaynaklar, sonra `needs_competition`.

**Yönlendirme (routing) mantığı — öncelik sırası:**
1. Soruda açık yarışma adı geçiyorsa (`detect_competition_mention`, en uzun/en spesifik eşleşme kazanır) → önce o yarışmanın kaynakları, bulunamazsa genel kaynaklar yedek.
2. Yarışma adı yoksa → önce genel (SSS/etik/genel kurallar) kaynaklar denenir; net cevap varsa direkt oradan.
3. Genel de net cevap vermezse → oturumdaki `current_competition`'a bakılır; yoksa kullanıcıya "hangi yarışma?" sorulur (`needs_competition`), veya girdi anlamsız görünüyorsa (`_looks_like_gibberish`) `unclear` statüsü.
4. Yarışma belirliyse o yarışmanın kaynaklarında aranır; net cevap yoksa `low_confidence` (kanıt yetersizliği) ile sonuçlanır ve loglanır.

**Hibrit arama (`_hybrid_search`):** Dense (embedding, `intfloat/multilingual-e5-large-instruct`, cosine, ChromaDB) + BM25 lexical aramayı Reciprocal Rank Fusion (rrf_k=60) ile birleştirir, aynı metni dedup eder, top_k=14 döner (fetch_k=45 aday havuzundan). Ardından, yazım hatalı sorgularda BM25'in RRF sırasını bozmasına karşı bir "rescue" adımı: havuzdaki ham cosine skoru `CONFIDENCE_HIGH (0.75)` üstü ama seçilmemiş adaylar, seçilen kümedeki en zayıf skorluyla değiştirilir. Güven/eşik hesaplaması ham dense cosine skoruna dayanır (RRF skoruna değil). `SCORE_THRESHOLD=0.5`: bu eşiğin altında LLM'e hiç sorulmadan doğrudan yönlendirme yapılır.

**Kapsam filtreleri:** genel arama `category in [genel, sss]` + `status=active`; yarışma araması `competition=<ad>` + `status=active`. Filtreler yalnızca `status="active"` chunk'ları kapsar — inactive versiyonlar aramaya hiç girmez.

**LLM üretimi:** Google Gemini (`google.genai`), model fallback zinciri (`GEN_MODELS` — 8 model, quota/503/timeout'ta sıradakine geçer, her çağrıya 12s timeout), iki farklı sistem promptu (`GENERAL_SYSTEM_PROMPT` / `COMPETITION_SYSTEM_PROMPT`, ikisi de yanıtı yalnızca verilen pasajlara dayandırmayı zorunlu kılar). Cevap metninde özel işaretleyicilerle (`UNRELATED_MARKER`, `SUPPORT_CONTACT`, `FLAG_MARKER`) status sınıflandırması yapılır (`answered/redirected/unrelated/out_of_scope/technical_error`). `FLAG_MARKER` ayrıca metin seviyesinde bir heuristikle (`_reports_live_problem`, LLM'den bağımsız anahtar kelime taraması) OR'lanır — LLM işareti unutsa bile bariz şikayetler yakalanır.

**Çıktı sözleşmesi (her dal):** `{answer, status, confidence, top_score, sources[], current_competition, flagged}` — `status ∈ {answered, redirected, unrelated, out_of_scope, technical_error, low_confidence, needs_competition, unclear}`. `answered` durumunda `answer`'ın sonuna otomatik kaynak bloğu + güven satırı eklenir (`web_app._answer_body` bunu ayırıp yapısal olarak sunuyor).

## 5. qa_log.py ve sss_store.py Veri Şekli

**qa_log.py** — `qa_log.jsonl` (append-only, satır başı bir JSON): `{timestamp, competition, question, answer, status, top_score, flagged}`. `status` değerleri: `answered | low_confidence | technical_error | needs_competition | unclear | redirected | unrelated | out_of_scope`. `flagged` — status'tan bağımsız ayrı boolean sinyal (LLM işareti OR metin heuristiği). Yardımcı filtre fonksiyonları: `unanswered_questions()`/`unresolved_entries()` (`low_confidence`), `technical_errors()` (`technical_error`), `needs_competition_questions()` (`needs_competition`), `flagged_reports()` (`flagged=True`, status'tan bağımsız).

**sss_store.py** — `sss_entries.jsonl` (insan-okunur geçmiş) + Chroma (arama chunk'ı). Her kayıt: `{index, timestamp, question, answer, competition, category, locator, chunk_id, author, also_resolves[]}`. `add_entry()` akışı: metin `"Soru: {q}\nCevap: {a}"` olarak tek chunk haline getirilir, `document_registry.ensure_registered()` ile sanal belge (`VIRTUAL_FILE = "Destek Ekibi Yanıtları (Panel SSS)"`, klasör `SSS_FOLDER="SSS"`) kaydına bağlanır, `ingest_records()` ile anında Chroma'ya embed edilip yazılır. `_scope(competition)`: competition None/`"SSS"` ise genel havuz (`category="sss"`), aksi halde ilgili yarışmanın havuzu (`category="yarisma"`). `also_resolves` alanı ayrı chunk oluşturmaz, sadece `resolved_questions()` ile "yanıtsız" listesinden düşürülecek varyant soruları işaretler.

## 6. insights.py Ne İşe Yarar

Admin panel analytics/dashboard hesaplama katmanı, kalıcı depolama yok — `qa_log.read_log()` çıktısı üzerinde anlık hesap yapan saf fonksiyonlar:
- `quality_breakdown(log)` — `answered` sorular arasında `top_score > CONFIDENCE_HIGH (0.75)` olan/olmayan dağılımı (`{high, mid, total}`).
- `recent_cutoff(days)` — "şimdi - N gün" zaman damgası üretir (7/14 günlük pencereler için).
- `referral_rate(log, since, until)` — belirli aralıkta insana yönlendirme oranı (`status=="low_confidence"` payı).
- `activity_by_month(log, years_back=4)` — son 4 yıl için yıl×ay (12 hücre) etkinlik ızgarası, her hücrede `{total, referred}`.
- `frequent_unanswered(entries, ...)` — `low_confidence` kayıtları embedding modeliyle (RAG'de zaten yüklü olan `intfloat/multilingual-e5-large-instruct`) cosine benzerliğine göre greedy kümeler (eşik 0.86, min 2 üye), yarışma/bağlam bazında ayrı kümeler; her küme için temsilci soru + varyantlar + son soru tarihi döner. Ekstra servis/bağımlılık gerektirmiyor, RAG embed modelini yeniden kullanıyor.

Bu dört fonksiyon `web_app.py`'deki `/api/admin/unanswered` ve `/api/admin/activity` endpoint'lerinin response'unu besliyor.

**Cloudflare'e taşırken dikkat edilmesi gereken davranışsal noktalar:**
1. Session store bellekte ve kalıcı değil (restart = tüm girişler düşer) — D1'e taşırsanız bu davranış değişir; bilinçli bir karar gerekiyor (aynı şekilde mi tutulacak yoksa kalıcı mı yapılacak).
2. Tüm veri katmanı SQLite dosyaları (`users.db`, `documents.db`) + JSONL append-only loglar (`qa_log.jsonl`, `sss_entries.jsonl`) + Chroma persistent client (`./chroma_db`) — D1 (SQL) + Vectorize (Chroma yerine) eşlemesi doğal, ama BM25 hibrit arama (rank_bm25, Python-only) Vectorize'da native yok; Workers AI/D1 FTS5 ile yeniden kurulması gerekecek.
3. Embedding modeli `intfloat/multilingual-e5-large-instruct` (yerel sentence-transformers, `passage:`/`query:` prefix'li) — Workers AI'deki eşdeğer modelle bire bir aynı embedding uzayı olmayacağı için mevcut skor eşikleri (`SCORE_THRESHOLD=0.5`, `CONFIDENCE_HIGH=0.75`) yeniden kalibre edilmesi gerekebilir.
4. LLM tarafı Google Gemini (özel model fallback zinciri + thinking-config stratejileri + status sınıflandırması metin-marker'larına dayalı) — Workers AI modeline geçerken prompt/marker sözleşmesi (`UNRELATED_MARKER`, `FLAG_MARKER`, `SUPPORT_CONTACT` metin eşleşmesi) davranışsal olarak korunmalı.

---

# EK B — Frontend API Çağrıları (araştırma ajanı 2'nin tam çıktısı)

## 0. `frontend/src/lib/api.ts` — Ortak HTTP Katmanı

- **BASE URL**: `import.meta.env.VITE_API_BASE_URL` (yoksa boş string, yani relative path).
- **`request(path, options)`**: tüm çağrıların geçtiği tek fonksiyon.
  - `Authorization: Bearer <token>` header'ı, modül-seviyesi `authToken` değişkeni doluysa otomatik eklenir (cookie kullanılmıyor).
  - Body `FormData` değilse ve `Content-Type` header'ı yoksa otomatik `application/json` set edilir. FormData'da tarayıcı kendi `multipart/form-data; boundary=...` header'ını koyar.
  - Ağ hatası (fetch reddi, AbortError hariç) → `ApiError("Sunucuya ulaşılamadı...", 0)`.
  - **401** → `authToken = null`, response body'den `detail` okunur, global `onUnauthorized` callback'i tetiklenir (AuthContext bunu `clearSession`'a bağlıyor — yani her 401 otomatik logout/temizlik yapar), sonra `ApiError(detail, 401)` fırlatılır.
  - Diğer `!res.ok` → body'den `detail` okunmaya çalışılır, `ApiError(detail, status)`.
  - **204** → `null` döner. Diğerlerinde body text okunup boşsa `null`, doluysa `JSON.parse` edilir. **Backend her zaman JSON döndürmeli (hata durumlarında `{ detail: "..." }` şeklinde), 204 hariç.**
- **`apiGet(path)`**: GET. **`apiPost(path, body?, {signal}?)`**: POST, `body instanceof FormData` ise olduğu gibi, aksi halde `JSON.stringify`. `signal` abort desteği (ChatPage "Durdur" butonu).

## 1. `frontend/src/context/AuthContext.tsx` — Auth Akışı

Token saklama: `localStorage`/`sessionStorage` key = `piri_admin_token` (remember=true → localStorage, false → sessionStorage).

| Endpoint | Method | Body | Kullanılan response alanları |
|---|---|---|---|
| `/api/admin/me` | GET | — | `data.user` (AuthUser: `username, display_name, role, role_label, is_owner, permissions[], avatar_url`), `data.roles` (Role[]: `key, label, description, permissions[], assignable`) |
| `/api/admin/login` | POST | `{ username, password }` | `data.token`, `data.user` — sonra ayrıca `/api/admin/me` çağrılıp `roles` alınır |
| `/api/admin/logout` | POST | — | yanıt kullanılmıyor, hata olsa da local session temizlenir |

**Akış**: Mount'ta storage'da token varsa `setAuthToken` + `/api/admin/me` çağrılır; başarısızsa oturum temizlenir. Login çağrısı token'ı hem `api.ts`'e hem storage'a yazar. Logout backend'e POST atar (best-effort) sonra local temizler. 401 herhangi bir istekte gelirse `AuthContext` otomatik `clearSession` çalıştırır.

`can(permission)`: `user.permissions.includes(permission)` — RBAC tamamen frontend'de local kontrol ediliyor, backend `permissions[]` listesini doğru döndürmeli.

## 2. `frontend/src/context/LanguageContext.tsx`
API çağrısı yok — sadece localStorage (`piri_lang`) tabanlı i18n string sözlüğü (tr/en).

## 3. `frontend/src/context/NotificationContext.tsx` — Bildirim Polling

60 saniyede bir (`POLL_MS = 60_000`) ve kullanıcı değiştiğinde `refresh()` çalışır. `piri_read_notifications` (localStorage) okunan bildirim id'lerini tutar (son 500).

| Endpoint | Method | Koşul (permission) | Kullanılan alanlar |
|---|---|---|---|
| `/api/admin/unanswered` | GET | `can("questions.view")` | `data.unanswered[]` (`.timestamp, .question, .competition`), `data.frequent[]` (`.count, .question, .last_asked, .competition`), `data.technical_errors[]`, `data.needs_competition[]`, `data.flagged[]` |
| `/api/admin/documents` | GET | `can("sources.view")` | `data.documents[]` — `.status, .gecerlilik_bitis (YYYY-MM-DD|null), .document_id, .version, .kaynak_adi, .file_name` — süresi dolmuş aktif belgeler bildirime dönüştürülür |

Bildirim tipleri (`kind`): `question, frequent, error, ambiguous, flag, source` → href: `/admin/bilgi-guncelleme` (question/frequent), `/admin/etkinlik` (error/ambiguous/flag), `/admin/kaynak-havuzu` (source).

## 4. `frontend/src/routes/RequireAuth.tsx`
Doğrudan API çağrısı yok — `useAuth()` üzerinden `user`/`ready` state'ini okur, `!user` ise `/login`'e yönlendirir.

## 5. `frontend/src/pages/ChatPage.tsx` — Ana Sohbet Sayfası

| Endpoint | Method | Body | Kullanılan response alanları |
|---|---|---|---|
| `/api/contexts` | GET | — | `data.competitions[]`, `data.general_label` |
| `/api/ask` | POST | `{ question, context: string|null }` | `data.current_competition, data.status, data.answer, data.sources[] ({file, locator, competition, score}), data.confidence, data.competition_options[]` (status==="needs_competition" iken) |

Abort desteği: `apiPost`'a `AbortController.signal`. `sessionStorage` key `piri_competition` ile seçili yarışma persist edilir.

**Önemli akış**: `needs_competition` durumunda kullanıcı seçenek tıkladığında, aynı soru + seçilen `context` ile `/api/ask` tekrar çağrılır (`pickCompetition`).

## 6-7. LoginPage.tsx / sign-in-card-2.tsx
`login(email.trim(), pass, remember)` → `useAuth().login` → `/api/admin/login`.

## 8-9. chat-input.tsx / PiriChat.tsx / admin-panel.tsx
**API çağrısı YOK** — mock/demo bileşenler, gerçek sözleşmeye dahil değil (gerçek sohbet `ChatPage.tsx`, gerçek admin sayfaları `pages/admin/*`).

## 10. `frontend/src/pages/admin/AdminLayout.tsx`

| Endpoint | Method | Koşul | Kullanılan alanlar |
|---|---|---|---|
| `/api/admin/documents` | GET | `can("sources.view")` | `res.documents[]` → `{document_id, file_name, kaynak_adi, competition}` — global arama kutusu için |

## 11. `frontend/src/pages/admin/OverviewPage.tsx` — Dashboard (recharts)

| Endpoint | Method | Kullanılan alanlar |
|---|---|---|
| `/api/admin/documents` | GET | `documents[]`, `stats: {total, active, inactive, chunks}` |
| `/api/admin/unanswered` | GET | `unanswered[]`, `frequent[]`, `quality: {high, mid, total}`, `referral: {all_time: {total, referred, rate}, last_7d: {total, referred, rate}}`, `stats: {total_questions, answered, unanswered, resolved}` |
| `/api/admin/activity` | GET (hata olursa sessiz geçilir) | `res.activity[]` → `ActivityYear[]` |

**Grafik veri şekilleri:** `CompetitionQuestionsChart` (Bar, client-side gruplanmış `{competition, count}[]`), `QuestionStatusPieChart` (`answered/unanswered/resolved`), `ReferralBarChart` (`last_7d.{total, referred}`), `ActivityCalendar` (`activity[]` doğrudan backend'den).

## 12. `frontend/src/pages/admin/ActivityPage.tsx`

`/api/admin/activity` GET → `activity: ActivityYear[]`, `recent: RecentTurn[] ({timestamp, competition, question, status, flagged})`.

## 13. `frontend/src/pages/admin/KnowledgePage.tsx`

| Endpoint | Method | Body | Kullanılan alanlar |
|---|---|---|---|
| `/api/admin/unanswered` | GET | — | `unanswered[] ({timestamp, competition, question, answer, status, top_score})`, `sss_entries[]`, `frequent[] (+variants[])`, `quality`, `referral` (+`prev_7d`), `stats` |
| `/api/competitions` | GET | — | `c.competitions[]` |
| `/api/admin/questions/answer` | POST | `{ question, answer, competition: string|null, also_resolves: string[] }` | `result.entry` (yeni SssEntry, listeye prepend) |

## 14. `frontend/src/pages/admin/SourcesPage.tsx`

| Endpoint | Method | Body | Kullanılan alanlar |
|---|---|---|---|
| `/api/admin/documents` | GET | — | `documents: DocumentRecord[]`, `stats` |
| `/api/competitions` | GET | — | dropdown için |
| `/api/admin/upload` | POST | multipart: `competition, file, doc_type?, kaynak_adi?, gecerlilik_bitis?` | `res.file, res.chunks` |
| `/api/admin/documents/metadata` | POST | `{document_id, version, doc_type, kaynak_adi, gecerlilik_bitis}` | — |
| `/api/admin/documents/status` | POST | `{document_id, version, status}` | — |
| `/api/admin/documents/delete` | POST | `{document_id}` | — |

## 15. `frontend/src/pages/admin/UsersPage.tsx`

`GET/POST /api/admin/users`, `POST /api/admin/users/role`, `/delete`, `/transfer` (+`refreshMe()`), `/password`.

## 16. `frontend/src/pages/admin/SettingsPage.tsx`

`POST /api/admin/profile {display_name}`, `POST /api/admin/profile/photo` (multipart, ≤3MB), `POST /api/admin/profile/photo/delete`, `POST /api/admin/profile/password {current_password, new_password}`.

---

# EK C — Mevcut Cloudflare Projesinden Yeniden Kullanılabilecekler (ajan 3'ün tam çıktısı)

Repo: `t3_claudeflare/teknofest-rag-api` (ayrı, ilişkisiz proje — bu depoda değil).

## 1. Proje Yapısı

```
src/
  index.ts                    -- tek dosyalık router (regex path matching, framework yok)
  config/{models.ts, rag.ts}
  lib/
    ai/{embeddingProvider,llmProvider,rerankerProvider}.ts
    auth/{cookies,guestRateLimit,middleware,password,rbac,session}.ts
    email/resend.ts
    rag/{answerEngine,chunking,confidence,extraction,promptBuilder,retrieval,topicClassifier}.ts
  routes/                      -- 19 dosya
  types/env.d.ts
migrations/                    -- 6 D1 SQL migration
scripts/
public/                        -- vanilla JS statik arayüz (React DEĞİL)
```

Katmanlı mimari: `routes/` sadece HTTP/auth/validation, iş mantığı `lib/rag/` ve `lib/ai/`. Framework yok (Hono vb. kullanılmamış), elle regex path matching. **`package.json`'da hiç runtime dependency yok** — Web Standard API + Cloudflare binding'lerine dayanıyor (taşınabilirlik açısından olumlu).

## 2. wrangler.jsonc Binding'leri

```jsonc
{
  "d1_databases": [{ "binding": "DB", "database_name": "teknofest-rag-db" }],
  "ai": { "binding": "AI", "remote": true },
  "kv_namespaces": [{ "binding": "DOCS_KV" }],
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "teknofest-rag-chunks", "remote": true }],
  "assets": { "directory": "./public/", "binding": "ASSETS", "run_worker_first": ["/api/*"] }
}
```
`AI`/`VECTORIZE` `"remote": true` — `wrangler dev`'de bile gerçek servise bağlanır (local emülasyon yok). D1/KV varsayılan local dev. R2 binding YOK (kart gerektirdiği için bilinçli ertelenmiş, KV kullanılıyor). `run_worker_first: ["/api/*"]` ile `/api/*` dışı istekler doğrudan statik `public/`'e düşer.

## 3. D1 Migration'ları — Nihai Şema

6 migration (`0001`–`0006`): `users, roles, user_roles, competitions, categories, documents, document_versions, document_chunks, conversations, messages, retrieval_logs, feedback, support_tickets, ticket_messages, faq_items` + `sessions` (0003) + KV'ye geçiş (`storage_key`, 0004) + `is_embedded` (0005) + self-registration alanları (0006). Tüm ID'ler `lower(hex(randomblob(16)))`.

**Not: Bu şema Piri'nin kendi modeline (5 rol, active/inactive+version) UYMUYOR — sadece desen/organizasyon referansı olarak kullanılacak, doğrudan kopyalanmayacak.**

## 4. Route Envanteri (referans, path'ler Piri'de FARKLI olacak)

`/api/auth/{login,logout,me,guest,register,verify-email}`, `/api/competitions`, `/api/categories`, `/api/documents(+versions+file+process+embed)`, `/api/search`, `/api/llm/complete`, `/api/answer`, `/api/chat`, `/api/tickets`, `/api/faq`, `/api/users`, `/api/messages/:id/feedback`, `/api/analytics`, `/api/retrieval-logs`, `/api/admin/{overview,search}`.

## 5. Auth / RBAC Mekanizması (desen referansı, Piri'de cookie yerine Bearer token olacak)

`password.ts`: PBKDF2 100.000 iterasyon/SHA-256, salt 16 byte, format `iterations:salt_hex:hash_hex` (**Piri'nin 120.000 iterasyon + ayrı salt/hash alan formatından farklı — Piri'nin kendi formatı korunacak**). `session.ts`: 32 byte token, SHA-256 hash'i D1'de saklanır (ham token DB'de yok), 7 gün. `middleware.ts`: `authenticate()` her route başında, `users.is_active` her istekte tekrar kontrol edilir.

## 6. RAG Pipeline (model ID'leri doğrulanmış, embedding/reranker için referans)

- **Embedding**: `@cf/qwen/qwen3-embedding-0.6b` (1024 boyut). Asimetrik: `embedDocuments()` → `{documents: texts}`, `embedQuery()` → `{queries: [text]}`.
- **Reranker**: `@cf/baai/bge-reranker-base` (`{query, contexts: [{text}]}`).
- **Generation**: `@cf/qwen/qwen3-30b-a3b-fp8` — **Piri'de KULLANILMAYACAK, Gemini kalacak.**

**Retrieval akışı**: embed query → `vectorize.query(vector, {topK:20, filter:{categoryId, competitionId}})` → D1 JOIN ile `is_active=1 AND deleted_at IS NULL AND valid_from/valid_until` filtresi (**Piri'de bu `status='active'` filtresine karşılık gelir**) → reranker → topK kesim. Her aşama süresi ölçülüyor.

**Evidence gate deseni**: en iyi rerank skoru eşik altındaysa LLM hiç çağrılmadan sabit mesaj — **Piri'nin `SCORE_THRESHOLD` mantığıyla aynı fikir, farklı sayısal eşik (yeniden kalibre edilecek).**

## 7. Belge İşleme Akışı (desen referansı)

Upload → KV'ye yaz (max 20MiB) → `ai.toMarkdown({name, blob})` ile extract (`### Page N` sayfa işaretleyicisi) → chunk (`#`/`##` başlık takibi, hedef 1500/hard limit 3000 karakter, "Metadata" subsection filtrelenir) → D1'e yaz → embed (20'li batch) + `vectorize.upsert()` + `is_embedded=1`. Admin panelinden elle tetiklenen ayrı adımlar (otomatik tek-adım pipeline değil).

## 8. Proje Sağlığı

`devDependencies` only (`wrangler ^4.125.0`, `typescript ^5.5.2`, `vitest`), hiç runtime dependency yok. `tsconfig.json` strict. `test/index.spec.ts` mevcut. `scripts/` altında `create-admin.mjs`, `evaluate-rag.mjs` (golden-set RAG değerlendirme deseni — Piri'nin FAZ 11'inde benzer bir golden-set kalibrasyonu gerekecek), `promote-to-production.mjs`.

## 9. Canlı Veri Uyarısı

Bu Cloudflare hesabında gerçek veri var (20 belge, 616 chunk, 18 KV dosyası). İnceleme sırasında hiçbir şey değiştirilmedi/silinmedi. **FAZ 1'de kullanıcıya bu kaynakların silinip yeniden mi kullanılacağı, yoksa yeni isimle mi açılacağı sorulacak — otomatik silme YAPILMAYACAK.**

### Genel Değerlendirme
RAG çekirdeği (`lib/rag/*`, `lib/ai/*`), auth altyapısı, D1 migration organizasyonu **desen olarak** büyük ölçüde yeniden kullanılabilir. Ana entegrasyon noktaları: (a) router bir framework'e taşınabilir ya da olduğu gibi bırakılabilir, (b) Piri Bearer-token kullandığı için CORS ayarları gerekecek (mevcut projede CORS header'ı yok, cookie+aynı-origin varsayılmış), (c) `public/` React frontend ile değiştirilecek/kaldırılacak.
