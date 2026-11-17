import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

// Server-only. Never import this from a client component — it reads the
// private key from env and would leak it into the browser bundle.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let client: objectstorage.ObjectStorageClient | null = null;

function getClient(): objectstorage.ObjectStorageClient {
  if (client) return client;

  const provider = new common.SimpleAuthenticationDetailsProvider(
    requiredEnv("OCI_TENANCY_OCID"),
    requiredEnv("OCI_USER_OCID"),
    requiredEnv("OCI_FINGERPRINT"),
    // .env files store literal "\n" for newlines in a PEM block.
    requiredEnv("OCI_PRIVATE_KEY").replace(/\\n/g, "\n"),
    null,
    common.Region.fromRegionId(requiredEnv("OCI_REGION")),
  );

  client = new objectstorage.ObjectStorageClient({
    authenticationDetailsProvider: provider,
  });
  return client;
}

function bucketRef() {
  return {
    namespaceName: requiredEnv("OCI_NAMESPACE"),
    bucketName: requiredEnv("OCI_BUCKET_NAME"),
  };
}

function objectHost(): string {
  return `https://objectstorage.${requiredEnv("OCI_REGION")}.oraclecloud.com`;
}

// Guards the audio-proxy route against becoming an open proxy — audio
// submissions can also be arbitrary external links (Google Drive/YouTube,
// via the "link" submission mode), so anything that isn't our own bucket
// must be rejected before it's ever fetched server-side.
export function isOwnAudioObjectUrl(url: string): boolean {
  const { namespaceName, bucketName } = bucketRef();
  const prefix = `${objectHost()}/n/${namespaceName}/b/${bucketName}/o/`;
  return url.startsWith(prefix);
}

// Recording container varies by browser: Chrome/Android/desktop Safari give
// WebM/Opus, iOS Safari's MediaRecorder only supports MP4/AAC. Naming every
// object ".webm" regardless of actual bytes made iOS-recorded audio
// undownloadable as audio on iPhone (extension/Content-Type conflict trips
// AVFoundation's strict demuxer selection, even though the bytes are valid).
function audioExtension(contentType: string): string {
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  return "webm";
}

// Apple devices (Safari file picker, iOS Voice Memos exports) commonly
// report a .m4a file's own MIME type as "audio/x-m4a" rather than the
// standard "audio/mp4"/"audio/aac". That non-standard type gets stored as
// this object's Content-Type and served back verbatim — most browsers'
// inline <audio> player won't recognize it as playable even though the
// underlying AAC-in-MP4 bytes are completely valid (Safari, which invented
// the type, plays it fine — nothing else does). Normalize before storing.
export function normalizeAudioContentType(contentType: string): string {
  return contentType === "audio/x-m4a" ? "audio/mp4" : contentType;
}

// Same object path per participant on every call — a re-record overwrites
// the previous upload instead of accumulating orphaned objects.
function audioObjectName(participantId: string, contentType: string): string {
  return `participants/${participantId}/audio.${audioExtension(contentType)}`;
}

// Safari's audio-only MediaRecorder writes MP4/AAC with a bogus `mvhd`
// duration (observed: a few seconds of real audio reported as ~40 minutes
// by every player, since HTMLMediaElement trusts that header field). Remux
// with `-c copy` — no re-encode, just has ffmpeg recompute and rewrite a
// correct moov/mvhd duration from the actual sample count. Runs for every
// container, not just mp4: cheap, and a no-op if the source was already fine.
async function remuxAudio(input: Buffer, extension: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "audio-remux-"));
  const inPath = join(dir, `in.${extension}`);
  const outPath = join(dir, `out.${extension}`);
  try {
    await writeFile(inPath, input);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpeg.path, [
        "-y",
        "-i",
        inPath,
        "-c",
        "copy",
        ...(extension === "m4a" ? ["-movflags", "+faststart"] : []),
        outPath,
      ]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg remux exited ${code}: ${stderr}`));
      });
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Uploaded server-side (this route, via oci-objectstorage's putObject) —
// browser can't PUT to OCI directly without a CORS rule on the bucket, and
// that console option wasn't available, so the blob is proxied through here
// instead of using a pre-authenticated request.
export async function uploadAudioObject(
  participantId: string,
  body: Buffer,
  rawContentType: string,
): Promise<string> {
  const contentType = normalizeAudioContentType(rawContentType);
  const { namespaceName, bucketName } = bucketRef();
  const objectName = audioObjectName(participantId, contentType);

  let putBody = body;
  try {
    putBody = await remuxAudio(body, audioExtension(contentType));
  } catch (err) {
    console.error("[uploadAudioObject] remux failed, storing original", err);
  }

  await getClient().putObject({
    namespaceName,
    bucketName,
    objectName,
    putObjectBody: putBody,
    contentLength: putBody.length,
    contentType,
  });

  // Plain object URL, not a PAR — only resolves for a reviewer without
  // another signed link if the bucket's visibility is set to "Public"
  // (read-only) in OCI. Same "anyone with the link" trust model as the old
  // Drive-link flow, just backed by the bucket setting instead.
  return `${objectHost()}/n/${namespaceName}/b/${bucketName}/o/${encodeURIComponent(objectName)}`;
}

// Organizer images (gallery photos, partner logos). Random object names, so
// nothing is overwritten or guessable; same public-bucket URL model as audio.
export async function uploadImageObject(
  folder: string,
  extension: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  // Event-page media lives in its own bucket (OCI_MEDIA_BUCKET_NAME, e.g.
  // "event-media-prod"), separate from the audio-submission bucket.
  const namespaceName = requiredEnv("OCI_NAMESPACE");
  const bucketName = requiredEnv("OCI_MEDIA_BUCKET_NAME");
  const objectName = `${folder}/${randomUUID()}.${extension}`;
  await getClient().putObject({
    namespaceName,
    bucketName,
    objectName,
    putObjectBody: body,
    contentLength: body.length,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
  return `${objectHost()}/n/${namespaceName}/b/${bucketName}/o/${encodeURIComponent(objectName)}`;
}

// Large uploads (bigger than Vercel's serverless function body cap, ~4.5MB)
// go through OCI's multipart upload API instead of a single putObject — same
// server-proxy trust model, just split into parts so no single request body
// crosses the Lambda payload limit.
export async function startAudioMultipartUpload(
  participantId: string,
  rawContentType: string,
): Promise<string> {
  const contentType = normalizeAudioContentType(rawContentType);
  const { namespaceName, bucketName } = bucketRef();
  const { multipartUpload } = await getClient().createMultipartUpload({
    namespaceName,
    bucketName,
    createMultipartUploadDetails: {
      object: audioObjectName(participantId, contentType),
      contentType,
    },
  });
  return multipartUpload.uploadId;
}

export async function uploadAudioPart(
  participantId: string,
  uploadId: string,
  partNum: number,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { namespaceName, bucketName } = bucketRef();
  const { eTag } = await getClient().uploadPart({
    namespaceName,
    bucketName,
    objectName: audioObjectName(participantId, contentType),
    uploadId,
    uploadPartNum: partNum,
    contentLength: body.length,
    uploadPartBody: body,
  });
  return eTag;
}

async function readObjectBody(value: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of value) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function commitAudioMultipartUpload(
  participantId: string,
  uploadId: string,
  parts: { partNum: number; etag: string }[],
  contentType: string,
): Promise<string> {
  const { namespaceName, bucketName } = bucketRef();
  const objectName = audioObjectName(participantId, contentType);
  const client = getClient();

  await client.commitMultipartUpload({
    namespaceName,
    bucketName,
    objectName,
    uploadId,
    commitMultipartUploadDetails: { partsToCommit: parts },
  });

  // Multipart-assembled objects skip uploadAudioObject's remux (parts are
  // uploaded individually, before the full file exists) — fetch the just-
  // committed object back and remux it in place so the same bogus-duration
  // fix applies here too.
  try {
    const { value } = await client.getObject({
      namespaceName,
      bucketName,
      objectName,
    });
    const original = await readObjectBody(value as NodeJS.ReadableStream);
    const remuxed = await remuxAudio(original, audioExtension(contentType));
    await client.putObject({
      namespaceName,
      bucketName,
      objectName,
      putObjectBody: remuxed,
      contentLength: remuxed.length,
      contentType,
    });
  } catch (err) {
    console.error(
      "[commitAudioMultipartUpload] remux failed, keeping original",
      err,
    );
  }

  return `${objectHost()}/n/${namespaceName}/b/${bucketName}/o/${encodeURIComponent(objectName)}`;
}

export async function abortAudioMultipartUpload(
  participantId: string,
  uploadId: string,
  contentType: string,
): Promise<void> {
  const { namespaceName, bucketName } = bucketRef();
  await getClient().abortMultipartUpload({
    namespaceName,
    bucketName,
    objectName: audioObjectName(participantId, contentType),
    uploadId,
  });
}
