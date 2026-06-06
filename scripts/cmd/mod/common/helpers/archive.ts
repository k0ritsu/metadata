import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { normalizePath } from './path.ts';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const BLOCK_SIZE = 512;

export interface TarFile {
  content: Buffer;
  path: string;
  executable: boolean;
}

interface TarEntry {
  content: Buffer;
  path: string;
  mode: number;
}

interface TarPath {
  name: string;
  prefix: string;
}

export async function createGzipTarArchive(
  entries: TarEntry[]
): Promise<Buffer<ArrayBuffer>> {
  const tar = Buffer.concat([
    ...entries.map(({ content, path, mode }) =>
      Buffer.concat([createTarHeader(path, content.length, mode), pad(content)])
    ),
    Buffer.alloc(BLOCK_SIZE * 2)
  ]);

  return gzipAsync(tar);
}

export async function extractGzipTarArchive(
  archive: Uint8Array
): Promise<TarFile[]> {
  const tar = await gunzipAsync(archive).catch(() => {
    assert.fail('archive must be a gzip-compressed tar archive');
  });

  const files: TarFile[] = [];
  let offset = 0;

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;

    if (isEmptyBlock(header)) {
      break;
    }

    const size = readOctal(header, 124, 12);
    const content = tar.subarray(offset, offset + size);

    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    assert(offset <= tar.length, 'unexpected end of tar archive');

    const type = String.fromCharCode(header[156] ?? 0);

    if (type === '5' || type === 'g' || type === 'x') {
      continue;
    }

    const path = readPath(header);

    assert(
      type === '\0' || type === '0',
      `${path}: unsupported tar entry type "${type}"`
    );

    files.push({
      content: Buffer.from(content),
      path: normalizeTarPath(path),
      executable: isExecutable(header)
    });
  }

  assert(files.length > 0, 'tar archive must contain at least one file');

  return files.map((file) => ({
    ...file,
    path: assertSafeRelativePath(file.path)
  }));
}

function assertSafeRelativePath(path: string): string {
  assert(path && !isAbsolute(path), `${path}: path must be relative`);

  const segments = path.split('/');
  assert(
    segments.every((segment) => segment && segment !== '..'),
    `${path}: invalid path`
  );

  return path;
}

function isEmptyBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function readPath(header: Uint8Array): string {
  const name = readString(header, 0, 100);
  const prefix = readString(header, 345, 155);

  return prefix ? `${prefix}/${name}` : name;
}

function readString(
  buffer: Uint8Array,
  offset: number,
  length: number
): string {
  const bytes = buffer.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  const value = end === -1 ? bytes : bytes.subarray(0, end);

  return Buffer.from(value).toString('utf8');
}

function readOctal(buffer: Uint8Array, offset: number, length: number): number {
  const value = readString(buffer, offset, length).trim();
  assert(/^[0-7]*$/.test(value), 'invalid octal number in tar header');

  return value ? Number.parseInt(value, 8) : 0;
}

function normalizeTarPath(path: string): string {
  let normalized = normalizePath(path);
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function isExecutable(header: Uint8Array): boolean {
  const mode = readOctal(header, 100, 8);

  return (mode & 0o111) !== 0;
}

function createTarHeader(
  path: string,
  size: number,
  mode: number
): Buffer<ArrayBuffer> {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitTarPath(path);

  writeString(header, name, 0, 100);
  writeOctal(header, mode & 0o111 ? 0o755 : 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = 48;
  writeString(header, 'ustar', 257, 6);
  writeString(header, '00', 263, 2);
  writeString(header, prefix, 345, 155);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }

  writeChecksum(header, checksum);

  return header;
}

function splitTarPath(path: string): TarPath {
  const bytes = Buffer.byteLength(path);
  assert(bytes <= 255, `${path}: path is too long for tar archive`);

  if (bytes <= 100) {
    return {
      name: path,
      prefix: ''
    };
  }

  const segments = path.split('/');

  for (let index = 1; index < segments.length; index += 1) {
    const prefix = segments.slice(0, index).join('/');
    const name = segments.slice(index).join('/');

    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return {
        name,
        prefix
      };
    }
  }

  assert.fail(`${path}: path is too long for tar archive`);
}

function writeString(
  buffer: Buffer,
  value: string,
  offset: number,
  length: number
): void {
  assert(
    Buffer.byteLength(value) <= length,
    'value is too long for tar header'
  );

  buffer.write(value, offset, length, 'utf8');
}

function writeOctal(
  buffer: Buffer,
  value: number,
  offset: number,
  length: number
): void {
  const octal = value.toString(8).padStart(length - 1, '0');
  assert(octal.length < length, 'value is too large for tar header');

  buffer.write(`${octal}\0`, offset, length, 'ascii');
}

function writeChecksum(buffer: Buffer, checksum: number): void {
  const value = checksum.toString(8).padStart(6, '0');
  buffer.write(`${value}\0 `, 148, 8, 'ascii');
}

function pad(content: Buffer): Buffer {
  const remainder = content.length % BLOCK_SIZE;
  if (remainder === 0) {
    return content;
  }

  return Buffer.concat([content, Buffer.alloc(BLOCK_SIZE - remainder)]);
}
