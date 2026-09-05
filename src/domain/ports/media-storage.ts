export interface StoredMedia {
  url: string;
  mimeType: string;
  size: number;
}

export interface MediaStoragePort {
  save(buffer: Buffer, filename: string, mimeType: string): Promise<StoredMedia>;
  delete(url: string): Promise<void>;
}
