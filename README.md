# Piri — TEKNOFEST Yarışmacı Destek Asistanı

Yarışmacıların şartname ve kılavuzlarla ilgili sorularını, **yalnızca doğrulanmış
kaynaklara dayanarak** yanıtlayan yerel (local) bir RAG sistemi.

Yanıt uydurmaz: kaynaklarda net karşılık yoksa soruyu destek ekibine yönlendirir
ve kayıt altına alır.

## Öne çıkanlar

- **Tamamen yerel arama** — embedding ve vektör veritabanı kendi makinenizde
  (Chroma + `intfloat/multilingual-e5-large-instruct`, GPU destekli)
- **Hibrit arama** — vektör benzerliği + BM25 lexical arama, Reciprocal Rank Fusion
  ile birleştirilir (Türkçe karakter normalizasyonu dahil)
- **Sohbet ekranı, istege bağlı yarışma seçimi** — yarışmacı doğrudan soru
  sorabilir; sorusunda bir yarışma adı geçiyorsa arama otomatik olarak o
  yarışmanın kaynaklarında yapılır. İsterse composer'ın üstündeki şeritten bir
  yarışma seçip her soruda adını tekrar yazmaktan kurtulabilir — ama metindeki
  açık niyet her zaman önceliklidir. Hiçbiri yoksa genel kurallar/SSS'e bakılır.
- **Kaynak gösterimi ve güven seviyesi** — her yanıtta dosya adı + sayfa/slayt/satır
- **Sürüm takibi** — belge güncellenince eski sürüm otomatik pasife alınır (silinmez),
  yalnızca aktif sürümler aranır
- **Kapalı döngü bilgi güncelleme** — yanıtsız kalan soru panelde cevaplanır, cevap
  SSS kaydı olarak anında vektör veritabanına işlenir ve model aynı soruyu artık yanıtlar
- **Rol bazlı yönetim** — tek bir *Sahip* hesabı genel yetkiye sahiptir; diğer hesapları
  o açar ve rollerini o belirler (Yönetici / İçerik Editörü / Gözlemci)

## İki ayrı arayüz

| | Yarışmacı arayüzü (`/`) | Yönetim paneli (`/admin`) |
|---|---|---|
| Giriş | **Gerekmez** | Kullanıcı adı + şifre |
| Akış | Doğrudan soru sor (yarışma seçimi isteğe bağlı) | Rolüne göre yetkilendirilmiş bölümler |
| Bağlantı | Panele bağlantı vermez | Yarışmacı arayüzüne bağlantı verir |

### Roller ve yetkiler

| Rol | Yetkiler |
|---|---|
| **Sahip** (tek kişi) | Tümü — kullanıcıları açar, rolleri belirler, sahipliği devredebilir |
| **Yönetici** | Kaynak yükleme/pasife alma/silme, soru yanıtlama, kullanıcıları görüntüleme |
| **İçerik Yöneticisi** | Yeni şartname yükler, eski kaynağı pasife alır, bilgi havuzunu günceller (silme yok, soru yanıtlamaz) |
| **Destek Ekibi** | İnsana yönlenen soruları görür, yanıtlar, tekrarlayan konuları SSS havuzuna ekler |
| **Gözlemci** | Yalnızca görüntüleme |

Yetki anahtarları: `sources.view/upload/status/delete`, `questions.view/answer`,
`users.view/manage`. Sunucu tarafında zorunlu tutulur; arayüz yalnızca yetkili
olunan bölümleri gösterir.

## Kurulum

```powershell
py -3.12 -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install -r backend\requirements.txt
```

`.env.example` dosyasını `.env` olarak kopyalayıp doldurun:

```
GEMINI_API_KEY=...          # yanıt üretimi için
ADMIN_PASSWORD=...          # ilk SAHİP hesabının şifresi
OWNER_USERNAME=sahip        # ilk SAHİP hesabının kullanıcı adı
OWNER_DISPLAY_NAME=...      # panelde görünen ad
```

Sahip hesabı yalnızca `users.db` boşken, sunucunun ilk açılışında oluşturulur.
Sonraki hesaplar panelden açılır; `.env` bir daha okunmaz.

Belgeleri `Piri-veriler/<Yarışma Adı>/` klasörlerine yerleştirin
(`Genel ve Etik kuralar` ve `SSS` klasörleri tüm yarışmalar için geçerli sayılır),
sonra indeksi oluşturun:

```powershell
.\.venv-local\Scripts\python.exe backend\local_ingest.py
```

## Kullanım

| Arayüz | Komut |
|---|---|
| **Web (önerilen)** | `.\run_web.ps1` → http://127.0.0.1:8000 |
| Web — yönetim | http://127.0.0.1:8000/admin |
| Terminal — sohbet | `.\.venv-local\Scripts\python.exe backend\local_rag_answer.py` |
| Terminal — yönetim | `.\.venv-local\Scripts\python.exe backend\admin_panel.py` (aynı hesap/rol sistemi) |

Tüm komutlar proje **kök dizininden** çalıştırılır (backend klasörüne `cd` yapılmaz) —
veri klasörleri (`Piri-veriler/`, `chroma_db/`, `*.db`, `*.jsonl`) köke göre bulunur.

## Testler

```powershell
.\.venv-local\Scripts\python.exe backend\test_routing.py            # yönlendirme mantığı
.\.venv-local\Scripts\python.exe backend\test_features.py           # kaynak/sürüm/güven
.\.venv-local\Scripts\python.exe backend\test_roles_and_context.py  # roller + bağlam + SSS döngüsü (sunucu açıkken)
.\.venv-local\Scripts\python.exe backend\test_admin_cli.py          # terminal aracının rol bazlı menüsü
.\.venv-local\Scripts\python.exe backend\test_optional_scope.py     # istege bağlı yarışma seçimi + metin önceliği (sunucu açıkken)
```

## Dosya düzeni

Ön yüz (frontend/) ve arka yüz (backend/) kodları ayrı klasörlerde tutulur;
web sunucusu ikisini `/static` üzerinden birbirine bağlar.

| Dosya | Görev |
|---|---|
| `backend/web_app.py` | FastAPI sunucusu + REST API + rol bazlı yetki kontrolü |
| `backend/users.py` | Kullanıcı/rol yönetimi, PBKDF2 şifreleme (SQLite `users.db`) |
| `backend/sss_store.py` | Panelden yazılan cevapları SSS kaydı olarak modele işler |
| `backend/local_rag_answer.py` | Yönlendirme, hibrit arama, yanıt üretimi |
| `backend/local_ingest.py` | Belge tarama, parçalama, indeksleme |
| `backend/local_loaders.py` | PDF / Word / PowerPoint / Excel okuma |
| `backend/local_chunking.py` | Token bazlı parçalama (overlap'lı) |
| `backend/local_embed.py` | GPU embedding modeli |
| `backend/document_registry.py` | Belge kayıt/sürüm/durum takibi (SQLite) |
| `backend/qa_log.py` | Soru-yanıt kaydı, yanıtsız sorular |
| `backend/competitions.py` | Yarışma adı tespiti/eşleştirme |
| `backend/admin_panel.py` | Terminal yönetim aracı (web ile aynı rol/yetki modeli) |
| `backend/requirements.txt` | Python bağımlılıkları |
| `frontend/` | Web arayüzü (HTML/CSS/JS) — `index.html` (sohbet), `admin.html` (yönetim) |

Kalıcı veri ve ortam dosyaları (`Piri-veriler/`, `chroma_db/`, `*.db`, `*.jsonl`,
`.env`, `.venv-local/`) proje kök dizininde kalır; hem backend hem tooling
CWD'nin kök olduğunu varsayar.

## Bilinen sınırlama

Yalnızca görsel/onay işareti içeren tablolar (ör. şartnamelerdeki "hangi eğitim
seviyesi uygun" tabloları) PDF'ten metin olarak çıkarılamadığı için aranamaz. 
