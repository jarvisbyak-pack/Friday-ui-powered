import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { config } from "../config.js";
import { pool } from "../db/pool.js";

export type StoredFile = {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

type FileRow = {
  id: string;
  user_id: string;
  name: string;
  mime_type: string;
  size_bytes: string;
  storage_path: string;
  sha256: string;
  created_at: Date;
};

function toFile(row: FileRow): StoredFile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    createdAt: row.created_at.toISOString()
  };
}

async function storageRoot(): Promise<string> {
  const configured = resolve(config.FILE_STORAGE_DIR);
  await mkdir(configured, { recursive: true });
  return realpath(configured);
}

async function safeStoragePath(id: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Invalid file identifier.");
  }
  const root = await storageRoot();
  const target = resolve(root, `${id}.bin`);
  if (!target.startsWith(root + sep)) throw new Error("Invalid storage path.");
  return target;
}

export class FileService {
  async list(userId: string, limit = 100): Promise<StoredFile[]> {
    const { rows } = await pool.query<FileRow>(
      `SELECT id, user_id, name, mime_type, size_bytes, storage_path, sha256, created_at
       FROM files WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(Math.trunc(limit), 1), 100)]
    );
    return rows.map(toFile);
  }

  async save(userId: string, name: string, mimeType: string, content: Buffer): Promise<StoredFile> {
    if (!Buffer.isBuffer(content)) throw new Error("File content must be binary data.");
    if (content.length > config.FILE_MAX_BYTES) {
      throw new Error(`File exceeds the ${config.FILE_MAX_BYTES} byte limit.`);
    }

    const safeName = name.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
    const safeMime = mimeType.trim().toLowerCase().slice(0, 255) || "application/octet-stream";
    if (!safeName) throw new Error("A valid file name is required.");

    const id = randomUUID();
    const storagePath = await safeStoragePath(id);
    const sha256 = createHash("sha256").update(content).digest("hex");
    await writeFile(storagePath, content, { flag: "wx", mode: 0o600 });

    try {
      const { rows } = await pool.query<FileRow>(
        `INSERT INTO files (id, user_id, name, mime_type, size_bytes, storage_path, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, name, mime_type, size_bytes, storage_path, sha256, created_at`,
        [id, userId, safeName, safeMime, content.length, storagePath, sha256]
      );
      return toFile(rows[0]!);
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
  }

  async read(userId: string, id: string): Promise<{ file: StoredFile; content: Buffer } | undefined> {
    const { rows } = await pool.query<FileRow>(
      `SELECT id, user_id, name, mime_type, size_bytes, storage_path, sha256, created_at
       FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    const row = rows[0];
    if (!row) return undefined;

    const content = await readFile(await safeStoragePath(row.id));
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== row.sha256) throw new Error("Stored file integrity check failed.");
    return { file: toFile(row), content };
  }
}
