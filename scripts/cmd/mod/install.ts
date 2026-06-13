import { chmod, glob, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { CmdError, type CommandHandler } from '../cmd.ts';
import { CACHE, MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { extractGzipTarArchive, type TarFile } from './common/helpers/archive.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey, parseModuleKey } from './common/helpers/key.ts';
import { withModuleLock } from './common/helpers/lock.ts';
import {
  assertModuleName,
  isSemver,
  parseModuleManifest,
  readModuleManifest
} from './common/helpers/manifest.ts';
import { readModlock, resolveModuleRoot, writeModlock } from './common/helpers/modlock.ts';
import {
  createTemporarySibling,
  exists,
  isInsidePath,
  replacePathAtomically
} from './common/helpers/path.ts';
import {
  api,
  createRepositoryUrl,
  request,
  resolveRepository
} from './common/helpers/repository.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import { tidyWorkspace } from './tidy.ts';

interface InstallSpec {
  name: string;
  version: string | undefined;
}

interface InstallMetadata {
  integrity: string;
  resolved: string;
}

const LATEST = 'latest';

export const install: CommandHandler = withModuleLock('install', async (args: string[]) => {
  const { positionals, values } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      repository: {
        type: 'string'
      }
    },
    args
  });

  if (positionals.length === 0) {
    await installFromModlock();

    return;
  }

  const repository = await resolveRepository(values.repository);
  const metadata = new Map<string, InstallMetadata>();

  for (const spec of positionals.map(parseInstallSpec)) {
    await installRequestedRoot(repository, spec, metadata);
  }

  const rootSet = await loadRootSet();
  const installed = new Set<string>();

  for (const [name] of rootSet) {
    await installDependencies(repository, resolve(MODULES, name), metadata, rootSet, installed);
  }

  await tidyWorkspace();
  await mergeInstalledMetadata(metadata);
});

async function installFromModlock() {
  const modlock = await readModlock();

  for (const [key, node] of Object.entries(modlock.modules)) {
    if (key === ROOT_NODE) {
      continue;
    }

    if (!node.resolved) {
      throw new CmdError(`${key}: missing resolved`);
    }

    if (!node.integrity) {
      throw new CmdError(`${key}: missing integrity`);
    }

    const { dependency, version } = parseModuleKey(key);
    const root = resolveModuleRoot(key, modlock);

    const metadata = await installArtifactAtRoot(
      root,
      {
        name: dependency,
        version
      },
      node.resolved,
      {
        expectedIntegrity: node.integrity
      }
    );
    if (metadata.integrity !== node.integrity) {
      throw new CmdError(`${key}: integrity verification failed`);
    }
  }

  await createTsconfigs();
}

function parseInstallSpec(spec: string) {
  let name = spec;
  let version: string | undefined;

  const index = spec.lastIndexOf('@');
  if (index > 0) {
    name = spec.slice(0, index);
    version = spec.slice(index + 1);
  }

  assertModuleName(name);
  if (typeof version !== 'undefined' && version !== LATEST && semver.validRange(version) === null) {
    throw new CmdError(`${version}: invalid module version`);
  }

  return {
    name,
    version
  };
}

async function installRequestedRoot(
  repository: string,
  spec: InstallSpec,
  metadata: Map<string, InstallMetadata>
) {
  const version = await resolveVersion(repository, spec);

  const key = createModuleKey(spec.name, version);
  const root = resolve(MODULES, spec.name);

  const existing = await readManifestOrUndefined(root);
  if (existing) {
    if (existing.name !== spec.name) {
      throw new CmdError(
        `${root}: cannot install ${spec.name}@${version} over ${existing.name}@${existing.version}`
      );
    }

    if (existing.version === version) {
      return;
    }
  }

  const cached = resolve(CACHE, key);
  if (await exists(cached)) {
    await replacePathAtomically(root, cached);

    return;
  }

  spec = {
    name: spec.name,
    version
  };

  const resolved = createArchiveUrl(repository, spec);

  metadata.set(key, await installArtifactAtRoot(root, spec, resolved));
}

async function readManifestOrUndefined(root: string) {
  try {
    return await readInstalledManifest(root);
  } catch {
    return;
  }
}

async function loadRootSet() {
  const rootSet = new Map<string, string>();

  for await (const path of glob(resolve(MODULES, '*', MODULE))) {
    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    rootSet.set(manifest.name, manifest.version);
  }

  return rootSet;
}

async function installDependencies(
  repository: string,
  root: string,
  metadata: Map<string, InstallMetadata>,
  rootSet: Map<string, string>,
  installed: Set<string>
) {
  const manifest = await readInstalledManifest(root);

  const key = createModuleKey(manifest.name, manifest.version);
  if (installed.has(key)) {
    return;
  }

  installed.add(key);

  if (manifest.dependencies) {
    for (const [name, range] of Object.entries(manifest.dependencies)) {
      let version = rootSet.get(name);
      if (version && semver.satisfies(version, range)) {
        await installDependencies(repository, resolve(MODULES, name), metadata, rootSet, installed);

        continue;
      }

      version = await resolveVersion(repository, {
        name,
        version: range
      });

      const key = createModuleKey(name, version);
      const root = resolve(CACHE, key);

      const found = await exists(root);
      if (!found) {
        const spec = {
          name,
          version
        };

        const resolved = createArchiveUrl(repository, spec);

        metadata.set(key, await installArtifactAtRoot(root, spec, resolved));
      }

      await installDependencies(repository, root, metadata, rootSet, installed);
    }
  }
}

function readInstalledManifest(root: string) {
  return readModuleManifest(root, {
    validateDependencyRanges: true
  });
}

async function resolveVersion(repository: string, spec: InstallSpec) {
  const versions = await getVersions(repository, spec.name);

  const sorted = semver.rsort(versions.filter(isSemver));
  if (sorted.length === 0) {
    throw new CmdError(`${spec.name}: no published versions found`);
  }

  if (!spec.version || spec.version === LATEST) {
    const [latest] = sorted;
    if (!latest) {
      throw new CmdError(`${spec.name}: no published versions found`);
    }

    return latest;
  }

  if (isSemver(spec.version)) {
    if (!sorted.includes(spec.version)) {
      throw new CmdError(`${spec.name}@${spec.version}: version not found`);
    }

    return spec.version;
  }

  const version = semver.maxSatisfying(sorted, spec.version);
  if (!version) {
    throw new CmdError(`${spec.name}@${spec.version}: no matching version found`);
  }

  return version;
}

async function getVersions(repository: string, name: string) {
  const versions = await api(repository, `modules/${name}/versions`);

  if (!Array.isArray(versions) || !versions.every((version) => typeof version === 'string')) {
    throw new CmdError(`${name}: repository returned invalid version list`);
  }

  return versions;
}

function createArchiveUrl(repository: string, spec: NonNullable<InstallSpec>) {
  return createRepositoryUrl(repository, `modules/${spec.name}/versions/${spec.version}/archive`);
}

async function installArtifactAtRoot(
  root: string,
  spec: NonNullable<InstallSpec>,
  url: string,
  options = {
    expectedIntegrity: ''
  }
) {
  const archive = await downloadArchive(url);
  const files = normalizeArchiveFiles(await extractGzipTarArchive(archive));

  const manifest = readManifest(files);
  if (manifest.name !== spec.name || manifest.version !== spec.version) {
    throw new CmdError(
      `${MODULE}: expected ${spec.name}@${spec.version}, got ${manifest.name}@${manifest.version}`
    );
  }

  let stage = await writeStagedModule(root, files);
  let integrity = '';
  try {
    integrity = await createModuleIntegrity(stage);
    if (options.expectedIntegrity) {
      if (integrity !== options.expectedIntegrity) {
        throw new CmdError(
          `${createModuleKey(spec.name, spec.version)}: integrity verification failed`
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

  console.log(`Installed ${manifest.name}@${manifest.version}`);

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
  if (files.some((file) => file.path === MODULE)) {
    return files;
  }

  const [root] = new Set(files.map((file) => file.path.split('/')[0]));
  if (!root) {
    throw new CmdError('archive must contain files at a common root');
  }

  if (!files.every((file) => file.path.startsWith(`${root}/`))) {
    throw new CmdError('archive must contain files at a common root');
  }

  return files.map((file) => ({
    ...file,
    path: file.path.slice(root.length + 1)
  }));
}

function readManifest(files: TarFile[]) {
  const file = files.find((file) => file.path === MODULE);
  if (!file) {
    throw new CmdError(`archive must contain ${MODULE}`);
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
      const path = resolve(stage, file.path);
      if (!isInsidePath(path, stage)) {
        throw new CmdError(`${file.path}: invalid file path`);
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

async function mergeInstalledMetadata(metadata: Map<string, InstallMetadata>) {
  if (metadata.size === 0) {
    return;
  }

  const modlock = await readModlock();

  for (const [key, entry] of metadata) {
    const node = modlock.modules[key];
    if (node) {
      node.integrity = entry.integrity;
      node.resolved = entry.resolved;
    }
  }

  await writeModlock(modlock);
}
