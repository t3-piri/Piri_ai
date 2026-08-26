// Piri RAG API — Cloudflare Worker
//
// Route ekleme sozlesmesi: her endpoint CLOUDFLARE_MIGRATION_MASTER_PROMPT.md
// Ek A'daki tam envanterle birebir eslesmelidir (path, method, request/
// response sekli, auth). Framework yok (referans t3_claudeflare projesindeki
// gibi elle path matching).

import { handleLogin, handleLogout, handleMe } from "./routes/auth";
import { handleCompetitions, handleContexts } from "./routes/competitions";
import {
  handleListDocuments,
  handleUpload,
  handleSetStatus,
  handleUpdateMetadata,
  handleDeleteDocument,
} from "./routes/documents";
import { handleAsk } from "./routes/ask";
import {
  handleListUsers,
  handleCreateUser,
  handleSetRole,
  handleSetPassword,
  handleDeleteUser,
  handleTransferOwner,
} from "./routes/users";
import {
  handleUpdateProfile,
  handleUploadPhoto,
  handleDeletePhoto,
  handleChangeOwnPassword,
  handleGetAvatar,
} from "./routes/profile";
import { handleUnanswered, handleActivity, handleAnswerQuestion, handleFeedback } from "./routes/questions";
import {
  handleGetGeminiSettings,
  handleSetGeminiKey,
  handleToggleGeminiKey,
  handleDeleteGeminiKey,
} from "./routes/settings";

export interface Env {
  DB: D1Database;
  PIRI_DOCS_KV: KVNamespace;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  ASSETS: Fetcher;
  // Secret'lar (wrangler secret put ile eklenir, wrangler types bunlari
  // otomatik uretmez — bu yuzden burada elle tanimli).
  GEMINI_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  OWNER_USERNAME?: string;
  OWNER_DISPLAY_NAME?: string;
  SETTINGS_ENC_KEY?: string;
}

async function router(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/api/health") {
    return Response.json({ ok: true });
  }

  if (pathname === "/api/admin/login" && method === "POST") {
    return handleLogin(request, env);
  }
  if (pathname === "/api/admin/logout" && method === "POST") {
    return handleLogout(request, env);
  }
  if (pathname === "/api/admin/me" && method === "GET") {
    return handleMe(request, env);
  }

  if (pathname === "/api/competitions" && method === "GET") {
    return handleCompetitions(request, env);
  }
  if (pathname === "/api/contexts" && method === "GET") {
    return handleContexts(request, env);
  }

  if (pathname === "/api/admin/documents" && method === "GET") {
    return handleListDocuments(request, env);
  }
  if (pathname === "/api/admin/upload" && method === "POST") {
    return handleUpload(request, env);
  }
  if (pathname === "/api/admin/documents/status" && method === "POST") {
    return handleSetStatus(request, env);
  }
  if (pathname === "/api/admin/documents/metadata" && method === "POST") {
    return handleUpdateMetadata(request, env);
  }
  if (pathname === "/api/admin/documents/delete" && method === "POST") {
    return handleDeleteDocument(request, env);
  }

  if (pathname === "/api/ask" && method === "POST") {
    return handleAsk(request, env);
  }
  if (pathname === "/api/feedback" && method === "POST") {
    return handleFeedback(request, env);
  }

  if (pathname === "/api/admin/unanswered" && method === "GET") {
    return handleUnanswered(request, env);
  }
  if (pathname === "/api/admin/activity" && method === "GET") {
    return handleActivity(request, env);
  }
  if (pathname === "/api/admin/questions/answer" && method === "POST") {
    return handleAnswerQuestion(request, env);
  }

  if (pathname === "/api/admin/users" && method === "GET") {
    return handleListUsers(request, env);
  }
  if (pathname === "/api/admin/users" && method === "POST") {
    return handleCreateUser(request, env);
  }
  if (pathname === "/api/admin/users/role" && method === "POST") {
    return handleSetRole(request, env);
  }
  if (pathname === "/api/admin/users/password" && method === "POST") {
    return handleSetPassword(request, env);
  }
  if (pathname === "/api/admin/users/delete" && method === "POST") {
    return handleDeleteUser(request, env);
  }
  if (pathname === "/api/admin/users/transfer" && method === "POST") {
    return handleTransferOwner(request, env);
  }

  if (pathname === "/api/admin/profile" && method === "POST") {
    return handleUpdateProfile(request, env);
  }
  if (pathname === "/api/admin/profile/photo" && method === "POST") {
    return handleUploadPhoto(request, env);
  }
  if (pathname === "/api/admin/profile/photo/delete" && method === "POST") {
    return handleDeletePhoto(request, env);
  }
  if (pathname === "/api/admin/profile/password" && method === "POST") {
    return handleChangeOwnPassword(request, env);
  }

  if (pathname === "/api/admin/settings/gemini" && method === "GET") {
    return handleGetGeminiSettings(request, env);
  }
  if (pathname === "/api/admin/settings/gemini" && method === "POST") {
    return handleSetGeminiKey(request, env);
  }
  if (pathname === "/api/admin/settings/gemini/toggle" && method === "POST") {
    return handleToggleGeminiKey(request, env);
  }
  if (pathname === "/api/admin/settings/gemini/delete" && method === "POST") {
    return handleDeleteGeminiKey(request, env);
  }

  return Response.json({ detail: "Not found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return router(request, env);
    }

    if (url.pathname.startsWith("/avatars/")) {
      const filename = url.pathname.slice("/avatars/".length);
      return handleGetAvatar(request, env, filename);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
