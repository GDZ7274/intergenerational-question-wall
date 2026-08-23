import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const STAGING_BUCKET = "photo-note-staging";
const PUBLIC_BUCKET = "photo-note-public";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const PREVIEW_TTL_SECONDS = 10 * 60;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type JsonObject = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function corsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get("origin") || "*";
  const configuredOrigins = (Deno.env.get("PHOTO_NOTE_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = configuredOrigins.length === 0
    ? requestOrigin
    : configuredOrigins.includes(requestOrigin)
    ? requestOrigin
    : configuredOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-upsert",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(
  request: Request,
  payload: JsonObject,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", "请求内容格式不正确。");
  }
  return value as JsonObject;
}

function asId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "invalid_id", "实体便签编号不正确。");
  }
  return id;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new HttpError(400, "invalid_number", "图片尺寸信息不正确。");
  }
  return number;
}

function rpcFailure(error: { message?: string; code?: string } | null): never {
  const message = error?.message || "后台操作失败，请稍后重试。";
  const code = error?.code || "rpc_failed";
  const status = code === "42501" ? 403 : code === "P0002" ? 404 : 400;
  throw new HttpError(status, code, message);
}

async function authenticatedClients(request: Request): Promise<{
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
}> {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new HttpError(401, "authentication_required", "请先登录管理后台。");
  }

  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  };

  const userClient = createClient(supabaseUrl, anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, clientOptions);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new HttpError(401, "invalid_session", "登录会话已失效，请重新登录。");
  }

  const { error: moderatorError } = await userClient.rpc("admin_whoami");
  if (moderatorError) {
    throw new HttpError(403, "moderator_required", "当前账号没有实体便签管理权限。");
  }

  return { userClient, serviceClient };
}

async function getPhotoNote(userClient: SupabaseClient, id: string): Promise<JsonObject> {
  const { data, error } = await userClient.rpc("admin_get_photo_note", { p_id: id });
  if (error) rpcFailure(error);
  return asObject(data);
}

function requireEditableUpload(note: JsonObject): void {
  if (!["draft", "rejected"].includes(String(note.status || ""))) {
    throw new HttpError(
      409,
      "upload_locked",
      "只有草稿或已驳回的实体便签可以重新上传图片。",
    );
  }
}

function uploadResponse(data: JsonObject, note: JsonObject): JsonObject {
  const signedUrl = String(data.signedUrl || "");
  if (!signedUrl) throw new HttpError(502, "upload_url_failed", "临时上传地址生成失败。");
  return {
    bucket: STAGING_BUCKET,
    path: String(note.stagingObjectPath || ""),
    signedUrl,
    token: typeof data.token === "string" ? data.token : null,
    expiresIn: 60 * 60 * 2,
  };
}

async function createSignedUpload(
  serviceClient: SupabaseClient,
  note: JsonObject,
  upsert: boolean,
): Promise<JsonObject> {
  const path = String(note.stagingObjectPath || "");
  if (!path) throw new HttpError(500, "missing_staging_path", "草稿缺少图片路径。");
  const { data, error } = await serviceClient.storage
    .from(STAGING_BUCKET)
    .createSignedUploadUrl(path, { upsert });
  if (error || !data) {
    throw new HttpError(502, "upload_url_failed", "临时上传地址生成失败，请重试。");
  }
  return uploadResponse(data as unknown as JsonObject, note);
}

async function readStagedImage(
  serviceClient: SupabaseClient,
  note: JsonObject,
): Promise<{ blob: Blob; mimeType: string }> {
  const path = String(note.stagingObjectPath || "");
  if (!path) throw new HttpError(409, "missing_staging_path", "草稿缺少图片路径。");

  const { data, error } = await serviceClient.storage.from(STAGING_BUCKET).download(path);
  if (error || !data) {
    throw new HttpError(404, "staged_image_not_found", "没有找到已上传的图片，请重新上传。");
  }

  if (data.size < 1 || data.size > MAX_FILE_BYTES) {
    throw new HttpError(413, "invalid_file_size", "图片不能超过 8 MB。");
  }

  const inspectionBytes = new Uint8Array(
    await data.slice(0, Math.min(data.size, 256 * 1024)).arrayBuffer(),
  );
  const header = inspectionBytes.slice(0, 16);
  let mimeType = "";
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    mimeType = "image/jpeg";
  } else if (
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
    header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
  ) {
    mimeType = "image/png";
  } else if (
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP"
  ) {
    mimeType = "image/webp";
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, "unsupported_image", "仅支持 JPEG、PNG 或 WebP 图片。");
  }

  const metadataMarker = mimeType === "image/jpeg"
    ? [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // Exif\0\0
    : mimeType === "image/png"
    ? [0x65, 0x58, 0x49, 0x66] // eXIf chunk
    : [0x45, 0x58, 0x49, 0x46]; // EXIF chunk
  const hasMetadataMarker = inspectionBytes.some((_, index) =>
    metadataMarker.every((byte, offset) => inspectionBytes[index + offset] === byte)
  );
  if (hasMetadataMarker) {
    throw new HttpError(
      422,
      "embedded_metadata_detected",
      "图片仍含拍摄信息，请重新压缩编码后再上传。",
    );
  }

  return { blob: data, mimeType };
}

function metadataPatch(body: JsonObject): JsonObject {
  const patch: JsonObject = {};
  const stringFields = [
    "direction",
    "questionText",
    "answerText",
    "altText",
    "internalNote",
  ];
  for (const key of stringFields) {
    if (Object.hasOwn(body, key)) patch[key] = optionalString(body[key]);
  }
  if (Object.hasOwn(body, "rotationDegrees")) {
    patch.rotationDegrees = optionalInteger(body.rotationDegrees) ?? 0;
  }
  if (Object.hasOwn(body, "width")) patch.width = optionalInteger(body.width);
  if (Object.hasOwn(body, "height")) patch.height = optionalInteger(body.height);
  return patch;
}

async function createDraft(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const { data, error } = await userClient.rpc("admin_create_photo_note", {
    p_direction: optionalString(body.direction),
    p_question_text: optionalString(body.questionText),
    p_answer_text: optionalString(body.answerText),
    p_alt_text: optionalString(body.altText),
    p_internal_note: optionalString(body.internalNote),
    p_rotation_degrees: optionalInteger(body.rotationDegrees) ?? 0,
    p_source: optionalString(body.source) || "staff_capture",
  });
  if (error) rpcFailure(error);

  const note = asObject(data);
  const upload = await createSignedUpload(serviceClient, note, false);
  return { ok: true, note, upload };
}

async function refreshUpload(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const note = await getPhotoNote(userClient, asId(body.id));
  requireEditableUpload(note);
  const upload = await createSignedUpload(serviceClient, note, true);
  return { ok: true, note, upload };
}

async function completeDraft(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const id = asId(body.id);
  const currentNote = await getPhotoNote(userClient, id);
  requireEditableUpload(currentNote);
  const image = await readStagedImage(serviceClient, currentNote);
  const patch = {
    ...metadataPatch(body),
    mimeType: image.mimeType,
    fileSizeBytes: image.blob.size,
  };

  const { error: updateError } = await userClient.rpc("admin_update_photo_note", {
    p_id: id,
    p_patch: patch,
  });
  if (updateError) rpcFailure(updateError);

  const { data, error } = await userClient.rpc("admin_submit_photo_note", { p_id: id });
  if (error) rpcFailure(error);
  return { ok: true, note: asObject(data) };
}

async function createPreview(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const note = await getPhotoNote(userClient, asId(body.id));
  const path = String(note.stagingObjectPath || "");
  const { data, error } = await serviceClient.storage
    .from(STAGING_BUCKET)
    .createSignedUrl(path, PREVIEW_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new HttpError(404, "preview_unavailable", "暂时无法读取这张实体便签图片。");
  }
  return {
    ok: true,
    preview: { url: data.signedUrl, expiresIn: PREVIEW_TTL_SECONDS },
  };
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function publishPhotoNote(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const id = asId(body.id);
  const note = await getPhotoNote(userClient, id);
  if (!["pending", "hidden"].includes(String(note.status || ""))) {
    throw new HttpError(409, "not_publishable", "只有待审核或已隐藏的实体便签可以发布。");
  }

  const image = await readStagedImage(serviceClient, note);
  const publicPath = `${id}/${crypto.randomUUID()}.${extensionForMimeType(image.mimeType)}`;
  const { error: uploadError } = await serviceClient.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, image.blob, {
      cacheControl: "31536000",
      contentType: image.mimeType,
      upsert: false,
    });
  if (uploadError) {
    throw new HttpError(502, "publish_upload_failed", "公开图片写入失败，请重试。");
  }

  const { data, error } = await userClient.rpc("admin_moderate_photo_note", {
    p_id: id,
    p_action: note.status === "hidden" ? "publish" : "approve",
    p_reason: optionalString(body.reason),
    p_public_object_path: publicPath,
  });
  if (error) {
    await serviceClient.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    rpcFailure(error);
  }

  const publicUrl = serviceClient.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath)
    .data.publicUrl;
  const previousPublicPath = optionalString(note.publicObjectPath);
  if (previousPublicPath && previousPublicPath !== publicPath) {
    await serviceClient.storage.from(PUBLIC_BUCKET).remove([previousPublicPath]);
  }
  return {
    ok: true,
    note: { ...asObject(data), publicUrl },
  };
}

async function hidePhotoNote(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const id = asId(body.id);
  const note = await getPhotoNote(userClient, id);
  const publicPath = optionalString(note.publicObjectPath);
  const { data, error } = await userClient.rpc("admin_moderate_photo_note", {
    p_id: id,
    p_action: "hide",
    p_reason: optionalString(body.reason),
    p_public_object_path: null,
  });
  if (error) rpcFailure(error);

  let mediaRemoved = true;
  if (publicPath) {
    const { error: removeError } = await serviceClient.storage
      .from(PUBLIC_BUCKET)
      .remove([publicPath]);
    mediaRemoved = !removeError;
  }
  return { ok: true, note: asObject(data), mediaRemoved };
}

async function removeHiddenPublicMedia(
  body: JsonObject,
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<JsonObject> {
  const note = await getPhotoNote(userClient, asId(body.id));
  if (note.status !== "hidden") {
    throw new HttpError(409, "not_hidden", "只有已隐藏的实体便签可以清理公开图片。");
  }
  const publicPath = optionalString(note.publicObjectPath);
  if (!publicPath) return { ok: true, mediaRemoved: true };
  const { error } = await serviceClient.storage.from(PUBLIC_BUCKET).remove([publicPath]);
  if (error) {
    throw new HttpError(502, "media_cleanup_failed", "公开图片清理失败，请重试。");
  }
  return { ok: true, mediaRemoved: true };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, {
      ok: false,
      error: "method_not_allowed",
      message: "仅支持 POST 请求。",
    }, 405);
  }

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1024 * 1024) {
      throw new HttpError(413, "request_too_large", "请求内容过大。");
    }
    const body = asObject(await request.json());
    const action = typeof body.action === "string" ? body.action : "";
    const { userClient, serviceClient } = await authenticatedClients(request);

    let payload: JsonObject;
    switch (action) {
      case "createDraft":
        payload = await createDraft(body, userClient, serviceClient);
        break;
      case "refreshUpload":
        payload = await refreshUpload(body, userClient, serviceClient);
        break;
      case "completeDraft":
        payload = await completeDraft(body, userClient, serviceClient);
        break;
      case "preview":
        payload = await createPreview(body, userClient, serviceClient);
        break;
      case "publish":
        payload = await publishPhotoNote(body, userClient, serviceClient);
        break;
      case "hide":
        payload = await hidePhotoNote(body, userClient, serviceClient);
        break;
      case "removeHiddenPublicMedia":
        payload = await removeHiddenPublicMedia(body, userClient, serviceClient);
        break;
      default:
        throw new HttpError(400, "unsupported_action", "不支持的媒体操作。");
    }

    return jsonResponse(request, payload);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, {
        ok: false,
        error: error.code,
        message: error.message,
      }, error.status);
    }
    console.error("photo-note-media failed", error);
    return jsonResponse(request, {
      ok: false,
      error: "internal_error",
      message: "实体便签媒体处理失败，请稍后重试。",
    }, 500);
  }
});
