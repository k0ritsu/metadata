import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CmdContext } from '../../../cmd.ts';
import { MODULE } from '../constants.ts';
import { extractGzipTarArchive, type TarFile } from './archive.ts';
import { createModuleIntegrity } from './integrity.ts';
import { createModuleKey } from './key.ts';
import { parseModuleManifest } from './manifest.ts';
import { createTemporarySibling, isInsidePath, replacePathAtomically } from './path.ts';
import { request } from './repository.ts';

interface InstallSpec {
  name: string;
  version: string;
}

export interface InstallMetadata {
  integrity: string;
  resolved: string;
}

class InstallModuleError extends Error {}

export async function installArtifactAtRoot(
  root: string,
  spec: InstallSpec,
  url: string,
  options?: {
    expectedIntegrity?: string;
    logger?: CmdContext['logger'];
  }
) {
  const archive = await downloadArchive(url);
  const files = normalizeArchiveFiles(await extractGzipTarArchive(archive));

  const manifest = readManifest(files);
  if (manifest.name !== spec.name || manifest.version !== spec.version) {
    throw new InstallModuleError(
      `${MODULE}: Expected ${spec.name}@${spec.version}, got ${manifest.name}@${manifest.version}`
    );
  }

  let stage = await writeStagedModule(root, files);
  let integrity = '';
  try {
    integrity = await createModuleIntegrity(stage);
    if (options?.expectedIntegrity) {
      if (integrity !== options.expectedIntegrity) {
        throw new InstallModuleError(
          `${createModuleKey(spec.name, spec.version)}: Integrity verification failed`
        );
      }
    }

    await replacePathAtomically(root, stage);
    stage = '';
  } finally {
    if (stage) {
      await rm(stage, {
        force: true,
        recursive: true
      });
    }
  }

  options?.logger?.info(`Installed ${manifest.name}@${manifest.version}`);

  return {
    integrity,
    resolved: url
  };
}

async function downloadArchive(url: string) {
  const response = await request(url);

  return Buffer.from(await response.arrayBuffer());
}

function normalizeArchiveFiles(files: TarFile[]) {
  const roots = new Set(files.map((file) => file.path.split('/')[0]));
  if (roots.size !== 1) {
    throw new InstallModuleError('Archive must contain files at a common root');
  }

  const [root] = roots;
  if (!root || !files.every((file) => file.path.startsWith(`${root}/`))) {
    throw new InstallModuleError('Archive must contain files at a common root');
  }

  return files.map((file) => ({
    ...file,
    path: file.path.slice(root.length + 1)
  }));
}

function readManifest(files: TarFile[]) {
  const file = files.find((file) => file.path === MODULE);
  if (!file) {
    throw new InstallModuleError(`Archive must contain ${MODULE}`);
  }

  return parseModuleManifest(file.content.toString(), {
    context: MODULE,
    validateDependencyRanges: true
  });
}

async function writeStagedModule(root: string, files: TarFile[]) {
  const stage = await createTemporarySibling(root);

  try {
    for (const file of files) {
      if (file.path.split('/').includes('modules')) {
        throw new InstallModuleError(`${file.path}: Nested modules directories are not allowed`);
      }

      const path = resolve(stage, file.path);
      if (!isInsidePath(path, stage)) {
        throw new InstallModuleError(`${file.path}: Invalid file path`);
      }

      await mkdir(dirname(path), {
        recursive: true
      });
      await writeFile(path, file.content);

      if (file.executable) {
        await chmod(path, 0o755);
      }
    }

    return stage;
  } catch (error) {
    await rm(stage, {
      force: true,
      recursive: true
    });

    throw error;
  }
}
