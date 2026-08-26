import { useEffect, useRef, useState } from "react";
import { Camera, Eye, EyeOff, KeyRound, Loader2, Power, Sparkles, Trash2, UserRound } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost, ApiError } from "@/lib/api";

interface GeminiKeyStatus {
  configured: boolean;
  enabled: boolean;
  masked: string | null;
  source: "db" | "secret" | "none";
}

const cardClass =
  "rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]";

const inputClass =
  "h-10 w-full rounded-lg px-3 text-sm outline-none border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.06] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:border-[#1e3a5f] dark:focus:border-white/30 transition";

const labelClass = "text-xs font-medium text-zinc-700 dark:text-zinc-300";

const primaryButtonClass =
  "h-10 px-4 rounded-lg bg-[#1e3a5f] hover:bg-[#16304c] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition shrink-0";

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [avatarNonce, setAvatarNonce] = useState(0);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [geminiStatus, setGeminiStatus] = useState<GeminiKeyStatus | null>(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [togglingGemini, setTogglingGemini] = useState(false);
  const [deletingGemini, setDeletingGemini] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiSuccess, setGeminiSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  useEffect(() => {
    if (!user?.is_owner) return;
    apiGet("/api/admin/settings/gemini")
      .then((status: GeminiKeyStatus) => setGeminiStatus(status))
      .catch(() => {
        /* durum yüklenemedi, kart hata göstermeden sessizce "yükleniyor" kalır */
      });
  }, [user?.is_owner]);

  if (!user) {
    return <p className="text-sm text-zinc-500">Yükleniyor...</p>;
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    setNameSuccess(null);
    if (!trimmed) {
      setNameError("Görünen ad boş olamaz.");
      return;
    }
    setNameError(null);
    setSavingName(true);
    try {
      const res = await apiPost("/api/admin/profile", { display_name: trimmed });
      setUser(res.user);
      setNameSuccess("Görünen ad güncellendi.");
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "Görünen ad güncellenemedi.");
    } finally {
      setSavingName(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiPost("/api/admin/profile/photo", fd);
      setUser(res.user);
      setAvatarNonce((n) => n + 1);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Fotoğraf yüklenemedi.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleDeletePhoto() {
    if (!window.confirm("Profil fotoğrafını kaldırmak istediğinize emin misiniz?")) return;
    setPhotoError(null);
    setDeletingPhoto(true);
    try {
      const res = await apiPost("/api/admin/profile/photo/delete");
      setUser(res.user);
      setAvatarNonce((n) => n + 1);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Fotoğraf kaldırılamadı.");
    } finally {
      setDeletingPhoto(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSuccess(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Tüm alanları doldurun.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Yeni şifreler eşleşmiyor.");
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    try {
      await apiPost("/api/admin/profile/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess("Şifre güncellendi.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSaveGeminiKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = geminiKeyInput.trim();
    setGeminiSuccess(null);
    if (!trimmed) {
      setGeminiError("API anahtarı boş olamaz.");
      return;
    }
    setGeminiError(null);
    setSavingGeminiKey(true);
    try {
      const status = await apiPost("/api/admin/settings/gemini", { api_key: trimmed });
      setGeminiStatus(status);
      setGeminiKeyInput("");
      setShowGeminiKey(false);
      setGeminiSuccess("API anahtarı kaydedildi.");
    } catch (err) {
      setGeminiError(err instanceof ApiError ? err.message : "API anahtarı kaydedilemedi.");
    } finally {
      setSavingGeminiKey(false);
    }
  }

  async function handleToggleGemini() {
    if (!geminiStatus) return;
    setGeminiError(null);
    setGeminiSuccess(null);
    setTogglingGemini(true);
    try {
      const status = await apiPost("/api/admin/settings/gemini/toggle", { enabled: !geminiStatus.enabled });
      setGeminiStatus(status);
    } catch (err) {
      setGeminiError(err instanceof ApiError ? err.message : "Durum değiştirilemedi.");
    } finally {
      setTogglingGemini(false);
    }
  }

  async function handleDeleteGeminiKey() {
    if (
      !window.confirm(
        "Kayıtlı Gemini API anahtarını silmek istediğinize emin misiniz? Anahtar silinince sistem, varsa deploy sırasında ayarlanmış varsayılan anahtara döner, yoksa yedek modeli kullanır."
      )
    )
      return;
    setGeminiError(null);
    setGeminiSuccess(null);
    setDeletingGemini(true);
    try {
      const status = await apiPost("/api/admin/settings/gemini/delete");
      setGeminiStatus(status);
      setGeminiSuccess("API anahtarı silindi.");
    } catch (err) {
      setGeminiError(err instanceof ApiError ? err.message : "API anahtarı silinemedi.");
    } finally {
      setDeletingGemini(false);
    }
  }

  const avatarSrc = user.avatar_url
    ? `${user.avatar_url}${user.avatar_url.includes("?") ? "&" : "?"}v=${avatarNonce}`
    : null;
  const initial = (user.display_name || user.username || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <GlowCard glowColor="purple" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white">Profil</h3>
        <p className="text-xs text-zinc-500 mt-1">Hesap bilgilerinizi ve profil fotoğrafınızı yönetin.</p>

        <div className="mt-5 flex items-center gap-4">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="Profil fotoğrafı"
              className="w-16 h-16 rounded-full object-cover border border-zinc-200 dark:border-white/10 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-xl font-bold shrink-0">
              {initial}
            </div>
          )}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {uploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                {uploadingPhoto ? "Yükleniyor..." : "Fotoğraf yükle"}
              </button>
              {user.avatar_url && (
                <button
                  type="button"
                  onClick={handleDeletePhoto}
                  disabled={deletingPhoto}
                  className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {deletingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {deletingPhoto ? "Kaldırılıyor..." : "Fotoğrafı kaldır"}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <p className="text-[11px] text-zinc-500">PNG, JPG, WEBP veya GIF · en fazla 3MB.</p>
            {photoError && <p className="text-xs text-red-500">{photoError}</p>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-zinc-500">Kullanıcı Adı</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-white mt-0.5 truncate">{user.username}</div>
          </div>
          <div>
            <div className="text-[11px] text-zinc-500">Rol</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-white mt-0.5 truncate">{user.role_label}</div>
          </div>
        </div>

        <form onSubmit={handleSaveName} className="mt-5 space-y-2">
          <label className={labelClass} htmlFor="display-name-input">
            Görünen Ad
          </label>
          <div className="flex gap-2">
            <input
              id="display-name-input"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameSuccess(null);
              }}
              placeholder="Görünen adınız"
              className={inputClass}
            />
            <button type="submit" disabled={savingName} className={primaryButtonClass}>
              {savingName && <Loader2 size={14} className="animate-spin" />}
              {savingName ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
          {nameError && <p className="text-xs text-red-500">{nameError}</p>}
          {nameSuccess && <p className="text-xs text-emerald-600">{nameSuccess}</p>}
        </form>
      </GlowCard>

      <GlowCard glowColor="blue" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <KeyRound size={15} className="text-zinc-400" />
          Şifre Değiştir
        </h3>
        <p className="text-xs text-zinc-500 mt-1">Hesabınızın güvenliği için güçlü bir şifre kullanın.</p>

        <form onSubmit={handleChangePassword} className="mt-5 space-y-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="current-password-input">
              Mevcut Şifre
            </label>
            <input
              id="current-password-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSuccess(null);
              }}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="new-password-input">
              Yeni Şifre
            </label>
            <input
              id="new-password-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordSuccess(null);
              }}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="confirm-password-input">
              Yeni Şifre (Tekrar)
            </label>
            <input
              id="confirm-password-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordSuccess(null);
              }}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
          {passwordSuccess && <p className="text-xs text-emerald-600">{passwordSuccess}</p>}

          <button type="submit" disabled={savingPassword} className={`${primaryButtonClass} w-full`}>
            {savingPassword && <Loader2 size={14} className="animate-spin" />}
            {savingPassword ? "Güncelleniyor..." : "Şifreyi Güncelle"}
          </button>
        </form>
      </GlowCard>

      {user.is_owner && (
        <GlowCard glowColor="green" className={`${cardClass} md:col-span-2`}>
          <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Sparkles size={15} className="text-zinc-400" />
            Gemini API Anahtarı
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Yanıt üretiminde kullanılan Gemini anahtarını buradan girin, değiştirin veya devre dışı bırakın. Anahtar
            şifrelenmiş olarak saklanır ve kaydedildikten sonra tekrar tam olarak gösterilmez.
          </p>

          {geminiStatus ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`px-2 py-1 rounded-md font-medium ${
                  geminiStatus.source === "db"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : geminiStatus.source === "secret"
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                }`}
              >
                {geminiStatus.source === "db"
                  ? "Aktif (panelden girilen anahtar kullanılıyor)"
                  : geminiStatus.source === "secret"
                    ? "Aktif (sistem varsayılan anahtarı kullanılıyor)"
                    : "Kapalı — yanıtlar yedek modele düşüyor"}
              </span>
              {geminiStatus.masked && (
                <span className="font-mono text-zinc-500 dark:text-zinc-400">{geminiStatus.masked}</span>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-zinc-400">Durum yükleniyor...</p>
          )}

          <form onSubmit={handleSaveGeminiKey} className="mt-4 space-y-2">
            <label className={labelClass} htmlFor="gemini-key-input">
              {geminiStatus?.configured ? "Anahtarı Değiştir" : "Yeni API Anahtarı"}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="gemini-key-input"
                  type={showGeminiKey ? "text" : "password"}
                  autoComplete="off"
                  value={geminiKeyInput}
                  onChange={(e) => {
                    setGeminiKeyInput(e.target.value);
                    setGeminiSuccess(null);
                  }}
                  placeholder="AIza..."
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  tabIndex={-1}
                >
                  {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button type="submit" disabled={savingGeminiKey} className={primaryButtonClass}>
                {savingGeminiKey && <Loader2 size={14} className="animate-spin" />}
                {savingGeminiKey ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>

          {geminiStatus?.configured && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleGemini}
                disabled={togglingGemini}
                className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {togglingGemini ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                {geminiStatus.enabled ? "Devre Dışı Bırak" : "Yeniden Etkinleştir"}
              </button>
              <button
                type="button"
                onClick={handleDeleteGeminiKey}
                disabled={deletingGemini}
                className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {deletingGemini ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deletingGemini ? "Siliniyor..." : "Anahtarı Sil"}
              </button>
            </div>
          )}

          {geminiError && <p className="mt-2 text-xs text-red-500">{geminiError}</p>}
          {geminiSuccess && <p className="mt-2 text-xs text-emerald-600">{geminiSuccess}</p>}
        </GlowCard>
      )}

      <GlowCard
        glowColor="cyan"
        className="md:col-span-2 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 flex items-center gap-3 shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
      >
        <UserRound size={16} className="text-zinc-400 shrink-0" />
        <p className="text-[11px] text-zinc-500">
          Kullanıcı adı ve rol yalnızca yöneticiler tarafından değiştirilebilir; bu sayfadan yalnızca kendi görünen
          adınızı, fotoğrafınızı ve şifrenizi güncelleyebilirsiniz.
        </p>
      </GlowCard>
    </div>
  );
}
