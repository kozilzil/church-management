import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export abstract class EvidenceStorage {
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract removeFailedUpload(key: string): Promise<void>;
}
@Injectable()
export class VolumeEvidenceStorage extends EvidenceStorage implements OnModuleInit {
  private root = resolve(process.env.UPLOAD_DIR ?? '../../.tmp/uploads', 'expenses');
  async onModuleInit() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  private path(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key);
  }
  async put(key: string, bytes: Buffer) {
    await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async removeFailedUpload(key: string) {
    await unlink(this.path(key));
  }
}
