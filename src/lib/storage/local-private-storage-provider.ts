import { randomUUID } from "crypto";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

import type { SaveFileParams, SavedFile, StorageProvider } from "@/lib/storage/storage-provider";

const LEAVE_ATTACHMENT_PREFIX = "leave-attachments";

function safeExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();

  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) {
    return "";
  }

  return ext;
}

function resolvePrivateFilePath(fileKey: string) {
  const uploadRoot = path.resolve(process.cwd(), "private", "uploads");
  const resolved = path.resolve(uploadRoot, fileKey);

  if (!resolved.startsWith(uploadRoot + path.sep)) {
    throw new Error("Invalid private file key.");
  }

  return resolved;
}

export class LocalPrivateStorageProvider implements StorageProvider {
  async save(params: SaveFileParams): Promise<SavedFile> {
    const fileKey = path.join(
      LEAVE_ATTACHMENT_PREFIX,
      `${randomUUID()}${safeExtension(params.fileName)}`,
    );
    const target = resolvePrivateFilePath(fileKey);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, params.buffer);

    return {
      fileKey,
      fileSize: params.buffer.byteLength,
      mimeType: params.contentType,
    };
  }

  async read(fileKey: string): Promise<Buffer> {
    return readFile(resolvePrivateFilePath(fileKey));
  }
}

export function getStorageProvider(): StorageProvider {
  const storage = process.env.LEAVE_ATTACHMENT_STORAGE || "local";

  if (storage !== "local") {
    throw new Error("Only local private storage is configured in this environment.");
  }

  return new LocalPrivateStorageProvider();
}
