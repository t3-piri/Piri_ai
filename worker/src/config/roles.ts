// Piri rol/yetki matrisi — backend/users.py'nin birebir karsiligi.
// CLOUDFLARE_MIGRATION_MASTER_PROMPT.md Ek A, bolum 2.
//
// DB tablosu degil (orijinalinde de degildi) — kod icinde sabit.
//
// GUNCELLEME (takim arkadasinin main'deki rol yeniden yapilandirmasi
// portlandi): eski "yonetici" ve "izleyici" rolleri kaldirildi, net gorev
// tanimlarina (Icerik Yoneticisi / Destek Ekibi / Sistem Yoneticisi)
// ayrildilar. Gercek D1'de bu iki eski role sahip hicbir hesap yoktu
// (dogrulandi), bu yuzden veri tasima gerekmedi.

export type RoleKey =
  | "sahip"
  | "icerik_yoneticisi"
  | "destek_ekibi"
  | "sistem_yoneticisi";

export type Permission =
  | "sources.view"
  | "sources.upload"
  | "sources.status"
  | "sources.delete"
  | "questions.view"
  | "questions.answer"
  | "users.view"
  | "users.manage"
  | "insights.view";

export const ALL_PERMISSIONS: Permission[] = [
  "sources.view",
  "sources.upload",
  "sources.status",
  "sources.delete",
  "questions.view",
  "questions.answer",
  "users.view",
  "users.manage",
  "insights.view",
];

interface RoleDef {
  label: string;
  description: string;
  rank: number;
  permissions: Permission[];
}

export const ROLES: Record<RoleKey, RoleDef> = {
  sahip: {
    label: "Sahip",
    description: "Tüm yetkilere sahiptir; diğer hesapları açar ve rollerini belirler.",
    rank: 0,
    permissions: ALL_PERMISSIONS,
  },
  icerik_yoneticisi: {
    label: "İçerik Yöneticisi",
    description: "Kaynakları yükler, eski sürümü pasife alır ve bilgi havuzunu günceller.",
    rank: 1,
    permissions: ["sources.view", "sources.upload", "sources.status"],
  },
  destek_ekibi: {
    label: "Destek Ekibi",
    description: "İnsana yönlenen soruları görür, yanıtlar ve tekrarlayan/yeni konuları SSS havuzuna ekler.",
    rank: 2,
    permissions: ["questions.view", "questions.answer"],
  },
  sistem_yoneticisi: {
    label: "Sistem Yöneticisi",
    description: "Yanıt kalitesi, insana yönlendirme oranı ve sık sorulan konuları izleyerek sistemi iyileştirir.",
    rank: 3,
    permissions: ["insights.view"],
  },
};

export function isValidRole(role: string): role is RoleKey {
  return role in ROLES;
}

export function permissionsFor(role: RoleKey): Permission[] {
  return ROLES[role].permissions;
}

export function hasPermission(role: RoleKey, permission: Permission): boolean {
  return ROLES[role].permissions.includes(permission);
}

// Frontend'in /api/admin/me ve /api/admin/users response'unda bekledigi
// Role[] sekli (Ek B, bolum 1 ve 15): { key, label, description, permissions[], assignable }
export function roleCatalog(): Array<{
  key: RoleKey;
  label: string;
  description: string;
  permissions: Permission[];
  assignable: boolean;
}> {
  return (Object.keys(ROLES) as RoleKey[]).map((key) => ({
    key,
    label: ROLES[key].label,
    description: ROLES[key].description,
    permissions: ROLES[key].permissions,
    assignable: key !== "sahip", // sahiplik yalnizca devir ile degisir, atanamaz
  }));
}
