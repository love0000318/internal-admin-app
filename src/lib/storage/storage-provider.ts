export type SaveFileParams = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
};

export type SavedFile = {
  fileKey: string;
  fileSize: number;
  mimeType: string;
};

export interface StorageProvider {
  save(params: SaveFileParams): Promise<SavedFile>;
  getSignedReadUrl?(fileKey: string): Promise<string>;
  read?(fileKey: string): Promise<Buffer>;
  delete?(fileKey: string): Promise<void>;
}
