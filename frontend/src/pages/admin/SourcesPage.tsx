import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FolderKanban, Activity, CircleSlash, Blocks, Trash2,
  UploadCloud, RefreshCw, Pencil, X, Check, AlertTriangle,
} from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost, ApiError } from "@/lib/api";

const cardClass =
  "rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]";

// ── Tipler ──────────────────────────────────────────────────────────────────

type DocType = "sartname" | "kilavuz" | "sss" | null;

type DocumentRecord = {
  document_id: string;
  file_name: string;
  competition: string | null;
  category: string;
  source_path: string;
  version: number;
  status: "active" | "inactive";
  upload_date: string;
  doc_type: DocType;
  kaynak_adi: string | null;
  gecerlilik_bitis: string | null;
};

type DocumentsResponse = {
  documents: DocumentRecord[];
  stats: { total: number; active: number; inactive: number; chunks: number };
};

type DocumentGroup = {
  document_id: string;
  file_name: string;
  competition: string | null;
  versions: DocumentRecord[];
};

// ── Sabitler ─────────────────────────────────────────────────────────────────

const GENEL = "Genel";

const DOC_TYPE_LABELS: Record<NonNullable<DocType> | "null", string> = {
  sartname: "Şartname",
  kilavuz: "Kılavuz",
  sss: "Onaylı SSS",
  null: "Kategorisiz",
};

const DOC_TYPE_COLORS: Record<NonNullable<DocType> | "null", string> = {
  sartname: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  kilavuz: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  sss: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
  null: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
};

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function isExpired(gecerlilik_bitis: string | null): boolean {
  if (!gecerlilik_bitis) return false;
  return new Date(gecerlilik_bitis) < new Date();
}

function docTypeKey(dt: DocType): "sartname" | "kilavuz" | "sss" | "null" {
  return dt ?? "null";
}

function DocTypeBadge({ doc_type }: { doc_type: DocType }) {
  const key = docTypeKey(doc_type);
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DOC_TYPE_COLORS[key]}`}>
      {DOC_TYPE_LABELS[key]}
    </span>
  );
}

// ── CSS Sınıf Sabitleri ───────────────────────────────────────────────────────

const inputSm =
  "h-8 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 dark:focus:ring-white/20";

const selectSm =
  "h-8 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-xs text-zinc-700 dark:text-zinc-300 outline-none";

// ── Satır İçi Metadata Düzenleme ──────────────────────────────────────────────

function MetadataEditor({
  doc,
  onSaved,
  onCancel,
}: {
  doc: DocumentRecord;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [docType, setDocType] = useState<string>(doc.doc_type ?? "");
  const [kaynak, setKaynak] = useState(doc.kaynak_adi ?? "");
  const [tarih, setTarih] = useState(doc.gecerlilik_bitis ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/api/admin/documents/metadata", {
        document_id: doc.document_id,
        version: doc.version,
        doc_type: docType || null,
        kaynak_adi: kaynak || null,
        gecerlilik_bitis: tarih || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Kayıt sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlowCard glowColor="orange" className="mt-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] p-4 space-y-3">
      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Metadata Düzenle</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Belge Türü</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className={selectSm + " w-full"}>
            <option value="">— Kategorisiz —</option>
            <option value="sartname">Şartname</option>
            <option value="kilavuz">Kılavuz</option>
            <option value="sss">Onaylı SSS</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Kaynak Adı</label>
          <input
            value={kaynak}
            onChange={(e) => setKaynak(e.target.value)}
            placeholder="ör. TEKNOFEST 2025 Robotik Şartnamesi"
            className={inputSm + " w-full"}
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Geçerlilik Bitiş Tarihi</label>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className={inputSm + " w-full"}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 h-7 rounded-md bg-[#1e3a5f] text-white text-[11px] font-medium px-3 disabled:opacity-50"
        >
          <Check size={12} /> {busy ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 h-7 rounded-md border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 text-[11px] px-3"
        >
          <X size={12} /> Vazgeç
        </button>
      </div>
    </GlowCard>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLocaleLowerCase("tr");

  const canStatus = can("sources.status");
  const canUpload = can("sources.upload");
  const canDelete = can("sources.delete");

  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [competitions, setCompetitions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Yükleme formu
  const [uploadCompetition, setUploadCompetition] = useState<string>(GENEL);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [uploadKaynakAdi, setUploadKaynakAdi] = useState<string>("");
  const [uploadGecerlilik, setUploadGecerlilik] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtreler
  const [filterDocType, setFilterDocType] = useState<string>("all");
  const [filterCompetition, setFilterCompetition] = useState<string>("all");
  const [filterValidity, setFilterValidity] = useState<string>("all");

  // Satır işlemleri
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  async function loadDocuments() {
    const docs: DocumentsResponse = await apiGet("/api/admin/documents");
    setData(docs);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet("/api/admin/documents"), apiGet("/api/competitions")])
      .then(([docs, comps]) => {
        if (cancelled) return;
        setData(docs);
        setCompetitions(comps.competitions || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Belgeler → GroupMap
  const groups: DocumentGroup[] = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, DocumentGroup>();
    for (const d of data.documents) {
      let g = map.get(d.document_id);
      if (!g) {
        g = { document_id: d.document_id, file_name: d.file_name, competition: d.competition, versions: [] };
        map.set(d.document_id, g);
      }
      g.versions.push(d);
    }
    const list = Array.from(map.values());
    for (const g of list) g.versions.sort((a, b) => b.version - a.version);
    list.sort((a, b) => a.file_name.localeCompare(b.file_name, "tr"));
    return list;
  }, [data]);

  // Filtreli gruplar
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const latest = g.versions[0];
      if (filterDocType !== "all") {
        const key = filterDocType === "null" ? null : filterDocType;
        if (latest.doc_type !== key) return false;
      }
      if (filterCompetition !== "all") {
        const comp = filterCompetition === "__genel__" ? null : filterCompetition;
        if (g.competition !== comp) return false;
      }
      if (filterValidity !== "all") {
        const expired = isExpired(latest.gecerlilik_bitis);
        const noDate = latest.gecerlilik_bitis === null;
        if (filterValidity === "expired" && !expired) return false;
        if (filterValidity === "valid" && (expired || noDate)) return false;
        if (filterValidity === "nodate" && !noDate) return false;
      }
      if (searchQuery) {
        const haystack = [g.file_name, latest.kaynak_adi, g.competition]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr");
        if (!haystack.includes(searchQuery)) return false;
      }
      return true;
    });
  }, [groups, filterDocType, filterCompetition, filterValidity, searchQuery]);

  // Özet sayaçlar (tüm gruplar üzerinden)
  const summary = useMemo(() => {
    const categorized = groups.filter((g) => g.versions[0].doc_type !== null).length;
    const expired = groups.filter((g) => isExpired(g.versions[0].gecerlilik_bitis)).length;
    const noDate = groups.filter((g) => g.versions[0].gecerlilik_bitis === null).length;
    return { categorized, uncategorized: groups.length - categorized, expired, noDate };
  }, [groups]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const fd = new FormData();
      fd.append("competition", uploadCompetition);
      fd.append("file", uploadFile);
      if (uploadDocType) fd.append("doc_type", uploadDocType);
      if (uploadKaynakAdi) fd.append("kaynak_adi", uploadKaynakAdi);
      if (uploadGecerlilik) fd.append("gecerlilik_bitis", uploadGecerlilik);
      const res = await apiPost("/api/admin/upload", fd);
      setUploadSuccess(`${res.file} başarıyla yüklendi, ${res.chunks} parça işlendi.`);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadDocType("");
      setUploadKaynakAdi("");
      setUploadGecerlilik("");
      await loadDocuments();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Yükleme sırasında bir hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  async function toggleStatus(doc: DocumentRecord) {
    const key = `${doc.document_id}::${doc.version}`;
    const nextStatus = doc.status === "active" ? "inactive" : "active";
    setPendingKey(key);
    setRowError(null);
    try {
      await apiPost("/api/admin/documents/status", {
        document_id: doc.document_id,
        version: doc.version,
        status: nextStatus,
      });
      await loadDocuments();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Durum güncellenemedi.");
    } finally {
      setPendingKey(null);
    }
  }

  async function handleDelete(group: DocumentGroup) {
    if (!window.confirm(`"${group.file_name}" belgesini ve tüm sürümlerini kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    setPendingKey(group.document_id);
    setRowError(null);
    try {
      await apiPost("/api/admin/documents/delete", { document_id: group.document_id });
      await loadDocuments();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Belge silinemedi.");
    } finally {
      setPendingKey(null);
    }
  }

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Yükleniyor...</p>;

  const cards = [
    { v: String(data.stats.total), l: "Toplam Belge", s: "Kaynak havuzundaki kayıt", icon: FolderKanban, tone: "text-zinc-900 dark:text-white", glow: "blue" as const },
    { v: String(data.stats.active), l: "Aktif Sürüm", s: "Aramaya dahil edilen", icon: Activity, tone: "text-emerald-600", glow: "green" as const },
    { v: String(data.stats.inactive), l: "Pasif Sürüm", s: "Aramadan çıkarılmış", icon: CircleSlash, tone: "text-zinc-500", glow: "purple" as const },
    { v: data.stats.chunks.toLocaleString("tr-TR"), l: "Vektör Parça", s: "Chroma koleksiyonunda", icon: Blocks, tone: "text-red-500", glow: "red" as const },
  ];

  return (
    <>
      {/* Özet Kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {cards.map((c) => (
          <GlowCard
            key={c.l}
            glowColor={c.glow}
            className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 flex justify-between shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
          >
            <div>
              <div className={`text-2xl font-bold ${c.tone}`}>{c.v}</div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">{c.l}</div>
              <div className="text-[11px] text-zinc-500">{c.s}</div>
            </div>
            <c.icon size={18} className="text-zinc-400 mt-1" />
          </GlowCard>
        ))}
      </div>

      {/* Metadata Durum Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { v: summary.categorized, l: "Kategorili", color: "text-emerald-600" },
          { v: summary.uncategorized, l: "Kategorisiz", color: "text-amber-600" },
          { v: summary.expired, l: "Süresi Dolmuş", color: "text-red-600" },
          { v: summary.noDate, l: "Tarihi Belirsiz", color: "text-zinc-500" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-3 shadow-sm">
            <div className={`text-xl font-bold ${s.color}`}>{s.v}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Yükleme Formu */}
      {canUpload && (
        <GlowCard glowColor="green" className={cardClass}>
          <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <UploadCloud size={16} className="text-zinc-400" />
            Yeni belge yükle
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Aynı yarışma ve dosya adıyla tekrar yüklenen belgeler yeni bir sürüm olarak kaydedilir.
          </p>
          <form onSubmit={handleUpload} className="mt-4 space-y-3">
            {/* Satır 1: Yarışma + Belge Türü */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Yarışma / Kategori</label>
                <select
                  value={uploadCompetition}
                  onChange={(e) => setUploadCompetition(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#0f0f11] text-sm px-3 py-2 text-zinc-900 dark:text-white"
                >
                  <option value={GENEL}>{GENEL}</option>
                  {competitions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Belge Türü</label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#0f0f11] text-sm px-3 py-2 text-zinc-900 dark:text-white"
                >
                  <option value="">— Kategorisiz —</option>
                  <option value="sartname">Şartname</option>
                  <option value="kilavuz">Kılavuz</option>
                  <option value="sss">Onaylı SSS</option>
                </select>
              </div>
            </div>
            {/* Satır 2: Kaynak Adı + Geçerlilik */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Kaynak Adı</label>
                <input
                  type="text"
                  value={uploadKaynakAdi}
                  onChange={(e) => setUploadKaynakAdi(e.target.value)}
                  placeholder="ör. TEKNOFEST 2025 Robotik Şartnamesi"
                  className="w-full rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#0f0f11] text-sm px-3 py-2 text-zinc-900 dark:text-white placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Geçerlilik Bitiş Tarihi</label>
                <input
                  type="date"
                  value={uploadGecerlilik}
                  onChange={(e) => setUploadGecerlilik(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#0f0f11] text-sm px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
            {/* Satır 3: Dosya + Gönder */}
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Dosya</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-700 dark:file:text-zinc-200"
                />
              </div>
              <button
                type="submit"
                disabled={!uploadFile || uploading}
                className="rounded-lg bg-[#1e3a5f] text-white text-sm font-medium px-4 py-2 disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                {uploading ? "Yükleniyor..." : "Yükle"}
              </button>
            </div>
          </form>
          {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
          {uploadSuccess && <p className="text-xs text-emerald-600 mt-2">{uploadSuccess}</p>}
        </GlowCard>
      )}

      {/* Kaynak Havuzu Listesi */}
      <GlowCard glowColor="blue" className={cardClass}>
        {/* Başlık + Yenile */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Kaynak Havuzu</h3>
          <button
            onClick={() => loadDocuments().catch(() => undefined)}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1"
          >
            <RefreshCw size={12} /> Yenile
          </button>
        </div>

        {/* Filtre Toolbar */}
        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06]">
          <div>
            <select
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
              className={selectSm}
            >
              <option value="all">Tüm Türler</option>
              <option value="sartname">Şartname</option>
              <option value="kilavuz">Kılavuz</option>
              <option value="sss">Onaylı SSS</option>
              <option value="null">Kategorisiz</option>
            </select>
          </div>
          <div>
            <select
              value={filterCompetition}
              onChange={(e) => setFilterCompetition(e.target.value)}
              className={selectSm}
            >
              <option value="all">Tüm Yarışmalar</option>
              <option value="__genel__">Genel</option>
              {competitions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterValidity}
              onChange={(e) => setFilterValidity(e.target.value)}
              className={selectSm}
            >
              <option value="all">Tüm Geçerlilik Durumu</option>
              <option value="valid">Geçerli</option>
              <option value="expired">Süresi Dolmuş</option>
              <option value="nodate">Tarihi Belirsiz</option>
            </select>
          </div>
          {searchQuery && (
            <span className="h-8 flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/10 px-2.5 text-xs text-zinc-600 dark:text-zinc-300">
              "{searchParams.get("q")}"
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("q");
                  setSearchParams(next, { replace: true });
                }}
                aria-label="Aramayı temizle"
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100"
              >
                <X size={11} />
              </button>
            </span>
          )}
          {(filterDocType !== "all" || filterCompetition !== "all" || filterValidity !== "all") && (
            <button
              onClick={() => { setFilterDocType("all"); setFilterCompetition("all"); setFilterValidity("all"); }}
              className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1 px-2"
            >
              <X size={11} /> Filtreleri Temizle
            </button>
          )}
          <span className="ml-auto text-[11px] text-zinc-400 self-center">
            {filteredGroups.length} / {groups.length} belge
          </span>
        </div>

        {rowError && <p className="text-xs text-red-500 mb-3">{rowError}</p>}
        {filteredGroups.length === 0 && (
          <p className="text-xs text-zinc-400">Filtreyle eşleşen belge bulunamadı.</p>
        )}

        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const latest = g.versions[0];
            const olderVersions = g.versions.slice(1);
            const busy = pendingKey === g.document_id || pendingKey === `${g.document_id}::${latest.version}`;
            const expired = isExpired(latest.gecerlilik_bitis);
            const editKey = `${g.document_id}::${latest.version}`;

            return (
              <div
                key={g.document_id}
                className={`rounded-lg border p-3 ${expired
                  ? "border-red-200 dark:border-red-500/20 bg-red-50/30 dark:bg-red-500/5"
                  : "border-zinc-200 dark:border-[rgba(255,255,255,0.08)]"
                }`}
              >
                {/* Ana satır */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white truncate max-w-[260px]">
                        {latest.kaynak_adi || g.file_name}
                      </span>
                      <DocTypeBadge doc_type={latest.doc_type} />
                      {expired && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                          <AlertTriangle size={10} /> Süresi Dolmuş
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {g.competition || GENEL}
                      {latest.kaynak_adi && <span className="mx-1">·</span>}
                      {latest.kaynak_adi && <span className="text-zinc-400 italic">{g.file_name}</span>}
                      <span className="mx-1">·</span>
                      v{latest.version}
                      <span className="mx-1">·</span>
                      {latest.upload_date}
                      {latest.gecerlilik_bitis && (
                        <>
                          <span className="mx-1">·</span>
                          <span className={expired ? "text-red-500" : "text-zinc-400"}>
                            Geçerlilik: {latest.gecerlilik_bitis}
                          </span>
                        </>
                      )}
                      {!latest.gecerlilik_bitis && (
                        <>
                          <span className="mx-1">·</span>
                          <span className="text-zinc-400">Süresi belirsiz</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Butonlar */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span
                      className={
                        latest.status === "active"
                          ? "text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                      }
                    >
                      {latest.status === "active" ? "Aktif" : "Pasif"}
                    </span>
                    {canStatus && (
                      <button
                        onClick={() => setEditingKey(editingKey === editKey ? null : editKey)}
                        className="inline-flex items-center gap-1 h-7 rounded-md border border-zinc-200 dark:border-white/10 px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
                      >
                        <Pencil size={11} /> Düzenle
                      </button>
                    )}
                    {canStatus && (
                      <button
                        onClick={() => toggleStatus(latest)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 h-7 rounded-md border border-zinc-200 dark:border-white/10 px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                      >
                        {latest.status === "active" ? "Pasifleştir" : "Aktifleştir"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(g)}
                        disabled={pendingKey === g.document_id}
                        className="inline-flex items-center gap-1 h-7 rounded-md border border-red-200 dark:border-red-500/20 px-2 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={11} /> Sil
                      </button>
                    )}
                  </div>
                </div>

                {/* Satır içi metadata düzenleme formu */}
                {editingKey === editKey && (
                  <MetadataEditor
                    doc={latest}
                    onSaved={() => {
                      setEditingKey(null);
                      loadDocuments().catch(() => undefined);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                )}

                {/* Eski sürümler */}
                {olderVersions.length > 0 && (
                  <div className="mt-2 pl-3 border-l border-zinc-200 dark:border-[rgba(255,255,255,0.08)] space-y-1.5">
                    {olderVersions.map((v) => {
                      const vKey = `${v.document_id}::${v.version}`;
                      return (
                        <div key={vKey} className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-zinc-500">
                            v{v.version} · {v.upload_date}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                v.status === "active"
                                  ? "text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                              }
                            >
                              {v.status === "active" ? "Aktif" : "Pasif"}
                            </span>
                            {canStatus && (
                              <button
                                onClick={() => toggleStatus(v)}
                                disabled={pendingKey === vKey}
                                className="text-[11px] font-medium px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
                              >
                                {v.status === "active" ? "Pasifleştir" : "Aktifleştir"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlowCard>
    </>
  );
}
