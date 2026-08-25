import { useEffect, useState, Fragment, type FormEvent } from "react";
import { Users, UserPlus, KeyRound, Trash2, Crown, ShieldCheck } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useAuth, type Role } from "@/context/AuthContext";

const cardClass =
  "rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]";

type UserRow = {
  username: string;
  display_name: string;
  role: string;
  role_label: string;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
  avatar_path: string | null;
};

type UsersResponse = {
  users: UserRow[];
  roles: Role[];
  can_manage: boolean;
  is_owner: boolean;
};

const inputClass =
  "h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 dark:focus:ring-white/20";
const selectSmClass =
  "h-7 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 outline-none disabled:opacity-50";
const btnPrimary =
  "h-9 rounded-lg bg-[#1e3a5f] hover:bg-[#16314f] text-white text-sm font-medium px-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnPrimarySm =
  "h-7 rounded-md bg-[#1e3a5f] hover:bg-[#16314f] text-white text-[11px] font-medium px-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnGhost =
  "inline-flex items-center gap-1 h-7 rounded-md border border-zinc-200 dark:border-white/10 px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors";
const btnDanger =
  "inline-flex items-center gap-1 h-7 rounded-md border border-red-200 dark:border-red-500/20 px-2 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors";
const btnAmber =
  "inline-flex items-center gap-1 h-7 rounded-md border border-amber-200 dark:border-amber-500/20 px-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-50 transition-colors";

function roleBadgeClasses(role: string) {
  if (role === "sahip") {
    return "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20";
  }
  return "bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/10";
}

export default function UsersPage() {
  const { user, refreshMe } = useAuth();

  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [rowBusyUser, setRowBusyUser] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ username: string; message: string } | null>(null);

  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/admin/users")
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Kullanıcılar yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (data && !newRole) {
      const first = data.roles.find((r) => r.assignable);
      if (first) setNewRole(first.key);
    }
  }, [data, newRole]);

  async function reload() {
    try {
      const res = await apiGet("/api/admin/users");
      setData(res);
    } catch {
      /* mevcut veri korunur; ilgili aksiyon zaten kendi hatasını gösterdi */
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    if (!newUsername.trim() || !newPassword || !newRole) {
      setCreateError("Kullanıcı adı, şifre ve rol gerekli.");
      return;
    }
    setCreating(true);
    try {
      await apiPost("/api/admin/users", {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        display_name: newDisplayName.trim() || null,
      });
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      await reload();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Kullanıcı eklenemedi.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(username: string, role: string) {
    setRowBusyUser(username);
    setRowError(null);
    try {
      await apiPost("/api/admin/users/role", { username, role });
      await reload();
    } catch (err) {
      setRowError({ username, message: err instanceof ApiError ? err.message : "Rol değiştirilemedi." });
    } finally {
      setRowBusyUser(null);
    }
  }

  async function handleDelete(username: string) {
    if (!window.confirm(`"${username}" kullanıcısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }
    setRowBusyUser(username);
    setRowError(null);
    try {
      await apiPost("/api/admin/users/delete", { username });
      await reload();
    } catch (err) {
      setRowError({ username, message: err instanceof ApiError ? err.message : "Kullanıcı silinemedi." });
    } finally {
      setRowBusyUser(null);
    }
  }

  async function handleTransfer(username: string) {
    const ok = window.confirm(
      `Sahipliği "${username}" kullanıcısına devretmek istediğinize emin misiniz?\n\nBu işlemden sonra kendi hesabınız "Yönetici" rolüne düşer ve bu geri alınamaz.`
    );
    if (!ok) return;
    setRowBusyUser(username);
    setRowError(null);
    try {
      await apiPost("/api/admin/users/transfer", { username });
      await reload();
      await refreshMe();
    } catch (err) {
      setRowError({ username, message: err instanceof ApiError ? err.message : "Sahiplik devredilemedi." });
    } finally {
      setRowBusyUser(null);
    }
  }

  function openReset(username: string) {
    setResetTarget(username);
    setResetValue("");
    setResetError(null);
  }

  function closeReset() {
    setResetTarget(null);
    setResetValue("");
    setResetError(null);
  }

  async function submitReset(username: string) {
    if (resetValue.length < 4) {
      setResetError("Şifre en az 4 karakter olmalı.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await apiPost("/api/admin/users/password", { username, password: resetValue });
      closeReset();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Şifre sıfırlanamadı.");
    } finally {
      setResetBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-zinc-500">Yükleniyor...</p>;
  }

  const { users, roles, can_manage, is_owner } = data;
  const assignableRoles = roles.filter((r) => r.assignable);
  const columnCount = can_manage ? 6 : 5;

  return (
    <>
      {can_manage && (
        <GlowCard glowColor="green" className={cardClass}>
          <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <UserPlus size={16} className="text-zinc-400" /> Yeni Kullanıcı Ekle
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Hesap açın ve bir rol atayın; sahip rolü buradan verilemez.</p>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-500">Kullanıcı Adı</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className={inputClass}
                placeholder="ör. destek1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-500">Şifre</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="En az 4 karakter"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-500">Görünen Ad (opsiyonel)</label>
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className={inputClass}
                placeholder="ör. Destek Ekibi 1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-500">Rol</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={inputClass}>
                {assignableRoles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={creating || assignableRoles.length === 0} className={btnPrimary}>
              {creating ? "Ekleniyor..." : "Ekle"}
            </button>
          </form>
          {createError && <p className="text-xs text-red-500 mt-2">{createError}</p>}
        </GlowCard>
      )}

      <GlowCard glowColor="purple" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <Users size={16} className="text-zinc-400" /> Kullanıcılar
        </h3>
        <p className="text-xs text-zinc-500 mt-1">{users.length} hesap.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-white/10">
                <th className="pb-2 pr-3">Görünen Ad</th>
                <th className="pb-2 pr-3">Kullanıcı Adı</th>
                <th className="pb-2 pr-3">Rol</th>
                <th className="pb-2 pr-3">Son Giriş</th>
                <th className="pb-2 pr-3">Oluşturulma</th>
                {can_manage && <th className="pb-2 pr-3">Aksiyonlar</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.username === user?.username;
                const isOwnerRow = u.role === "sahip";
                const busy = rowBusyUser === u.username;
                return (
                  <Fragment key={u.username}>
                    <tr className="border-b border-zinc-100 dark:border-white/5 last:border-0 align-top hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                      <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">
                        {u.display_name}
                        {isSelf && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">(Sen)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-600 dark:text-zinc-400">{u.username}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadgeClasses(u.role)}`}
                        >
                          {u.role === "sahip" && <Crown size={11} />}
                          {u.role_label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {u.last_login || "Hiç giriş yapmadı"}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">{u.created_at}</td>
                      {can_manage && (
                        <td className="py-2.5 pr-3">
                          {isSelf || isOwnerRow ? (
                            <span className="text-xs text-zinc-400">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={u.role}
                                disabled={busy}
                                onChange={(e) => handleRoleChange(u.username, e.target.value)}
                                className={selectSmClass}
                              >
                                {assignableRoles.map((r) => (
                                  <option key={r.key} value={r.key}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <button onClick={() => openReset(u.username)} disabled={busy} className={btnGhost}>
                                <KeyRound size={13} /> Şifre
                              </button>
                              <button onClick={() => handleDelete(u.username)} disabled={busy} className={btnDanger}>
                                <Trash2 size={13} /> Sil
                              </button>
                              {is_owner && (
                                <button onClick={() => handleTransfer(u.username)} disabled={busy} className={btnAmber}>
                                  <Crown size={13} /> Sahipliği Devret
                                </button>
                              )}
                              {rowError?.username === u.username && (
                                <p className="w-full text-[11px] text-red-500">{rowError.message}</p>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {resetTarget === u.username && (
                      <tr className="border-b border-zinc-100 dark:border-white/5">
                        <td colSpan={columnCount} className="pb-3 pt-0">
                          <GlowCard glowColor="blue" className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                            <span className="text-xs text-zinc-500">
                              <strong className="text-zinc-700 dark:text-zinc-300">{u.username}</strong> için yeni şifre:
                            </span>
                            <input
                              type="password"
                              autoFocus
                              value={resetValue}
                              onChange={(e) => setResetValue(e.target.value)}
                              placeholder="En az 4 karakter"
                              className={inputClass}
                            />
                            <button onClick={() => submitReset(u.username)} disabled={resetBusy} className={btnPrimarySm}>
                              {resetBusy ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                            <button onClick={closeReset} disabled={resetBusy} className={btnGhost}>
                              Vazgeç
                            </button>
                            {resetError && <p className="w-full text-[11px] text-red-500">{resetError}</p>}
                          </GlowCard>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlowCard>

      <GlowCard glowColor="blue" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <ShieldCheck size={16} className="text-zinc-400" /> Roller ve Yetkiler
        </h3>
        <p className="text-xs text-zinc-500 mt-1">Her rolün erişebildiği işlemler; referans amaçlıdır.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {roles.map((r) => (
            <div
              key={r.key}
              className="rounded-lg bg-zinc-50 dark:bg-[#1a1a1e] border border-zinc-200 dark:border-white/10 p-3"
            >
              <div className="flex items-center gap-1.5">
                {r.key === "sahip" && <Crown size={12} className="text-amber-600" />}
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">{r.label}</span>
                {!r.assignable && <span className="text-[10px] text-zinc-400">(atanamaz)</span>}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">{r.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {r.permissions.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] rounded bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 font-mono"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </GlowCard>
    </>
  );
}
