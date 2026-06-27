declare module "node:http" {
  export type IncomingMessage = {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
    [Symbol.asyncIterator](): AsyncIterableIterator<Buffer | string>;
  };

  export type ServerResponse = {
    setHeader(name: string, value: string | number | readonly string[]): void;
    writeHead(statusCode: number): void;
    end(data?: unknown): void;
  };

  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  ): { listen(port: number, callback?: () => void): void };
}

declare module "node:fs/promises" {
  export function readFile(path: string, encoding: BufferEncoding): Promise<string>;
  export function readFile(path: string): Promise<Buffer>;
  export function writeFile(path: string, data: string, encoding?: BufferEncoding): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function stat(path: string): Promise<unknown>;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: BufferEncoding): string;
}

declare module "node:path" {
  const path: {
    dirname(path: string): string;
    resolve(...paths: string[]): string;
    join(...paths: string[]): string;
    normalize(path: string): string;
    extname(path: string): string;
    relative(from: string, to: string): string;
    isAbsolute(path: string): boolean;
  };
  export default path;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:crypto" {
  const crypto: {
    randomBytes(size: number): { toString(encoding: BufferEncoding): string };
    pbkdf2Sync(password: string, salt: string, iterations: number, keylen: number, digest: string): Buffer;
    timingSafeEqual(a: Buffer, b: Buffer): boolean;
  };
  export default crypto;
}

declare const process: {
  env: Record<string, string | undefined>;
};

type BufferEncoding = "utf8" | "hex" | "base64" | string;

declare class Buffer extends Uint8Array {
  static from(data: string, encoding?: BufferEncoding): Buffer;
  static isBuffer(value: unknown): value is Buffer;
  toString(encoding?: BufferEncoding): string;
}
