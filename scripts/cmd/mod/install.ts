import assert from 'node:assert/strict';
import { chmod, glob, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { CACHE, MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import {
  extractGzipTarArchive,
  type TarFile
} from './common/helpers/archive.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey, parseModuleKey } from './common/helpers/key.ts';
import {
  assertModuleName,
  isSemver,
  parseModuleManifest,
  readModuleManifest
} from './common/helpers/manifest.ts';
import {
  readModlock,
  resolveModuleRoot,
  writeModlock
} from './common/helpers/modlock.ts';
import { exists, isInsidePath } from './common/helpers/path.ts';
import {
  createRepositoryUrl,
  fetchRepository,
  fetchUrl,
  resolveRepository
} from './common/helpers/repository.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { CommandHandler, ModuleManifest } from './common/types.ts';
import { tidy } from './tidy.ts';

interface InstallSpec {
  name: string;
  version: string | undefined;
}

interface InstallMetadata {
  integrity: string;
  resolved: string;
}

const LATEST = 'latest';

export const install: CommandHandler = async (args: string[]) => {
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
    await installDependencies(
      repository,
      resolve(MODULES, name),
      metadata,
      rootSet,
      installed
    );
  }

  await tidy([]);
  await mergeInstalledMetadata(metadata);
};

async function installFromModlock(): Promise<void> {
  const modlock = await readModlock();

  for (const [key, node] of Object.entries(modlock.modules)) {
    if (key === ROOT_NODE) {
      continue;
    }

    assert(node.resolved, `${key}: missing resolved`);
    assert(node.integrity, `${key}: missing integrity`);

    const { dependency, version } = parseModuleKey(key);
    const root = resolveModuleRoot(key, modlock);

    await installArtifactAtRoot(
      root,
      {
        name: dependency,
        version
      },
      node.resolved
    );

    const actual = await createModuleIntegrity(root);
    assert(actual === node.integrity, `${key}: integrity verification failed`);
  }

  await createTsconfigs();
}

function parseInstallSpec(spec: string): InstallSpec {
  let name = spec;
  let version: string | undefined;

  const index = spec.lastIndexOf('@');
  if (index > 0) {
    name = spec.slice(0, index);
    version = spec.slice(index + 1);
  }

  assertModuleName(name);
  assert(
    version === undefined ||
      version === LATEST ||
      semver.validRange(version) !== null,
    `${version}: invalid module version`
  );

  return {
    name,
    version
  };
}

async function installRequestedRoot(
  repository: string,
  spec: InstallSpec,
  metadata: Map<string, InstallMetadata>
): Promise<void> {
  const version = await resolveVersion(repository, spec);

  const key = createModuleKey(spec.name, version);
  const root = resolve(MODULES, spec.name);

  const existing = await readManifestOrUndefined(root);
  if (existing) {
    assert(
      existing.name === spec.name,
      `${root}: cannot install ${spec.name}@${version} over ${existing.name}@${existing.version}`
    );

    if (existing.version === version) {
      return;
    }
  }

  const cached = resolve(CACHE, key);
  if (await exists(cached)) {
    await rm(root, {
      force: true,
      recursive: true
    });
    await rename(cached, root);

    return;
  }

  spec = {
    name: spec.name,
    version
  };

  const resolved = createArchiveUrl(repository, spec);

  await installArtifactAtRoot(root, spec, resolved);
  metadata.set(key, {
    integrity: await createModuleIntegrity(root),
    resolved
  });
}

async function readManifestOrUndefined(
  root: string
): Promise<ModuleManifest | undefined> {
  try {
    return await readInstalledManifest(root);
  } catch {
    return;
  }
}

async function loadRootSet(): Promise<Map<string, string>> {
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
): Promise<void> {
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
        await installDependencies(
          repository,
          resolve(MODULES, name),
          metadata,
          rootSet,
          installed
        );

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

        await installArtifactAtRoot(root, spec, resolved);
        metadata.set(key, {
          integrity: await createModuleIntegrity(root),
          resolved
        });
      }

      await installDependencies(repository, root, metadata, rootSet, installed);
    }
  }
}

function readInstalledManifest(root: string): Promise<ModuleManifest> {
  return readModuleManifest(root, {
    validateDependencyRanges: true
  });
}

async function resolveVersion(
  repository: string,
  spec: InstallSpec
): Promise<string> {
  const versions = await getVersions(repository, spec.name);

  const sorted = semver.rsort(versions.filter(isSemver));
  assert(sorted.length > 0, `${spec.name}: no published versions found`);

  if (!spec.version || spec.version === LATEST) {
    const [latest] = sorted;
    assert(latest, `${spec.name}: no published versions found`);

    return latest;
  }

  if (isSemver(spec.version)) {
    assert(
      sorted.includes(spec.version),
      `${spec.name}@${spec.version}: version not found`
    );

    return spec.version;
  }

  const version = semver.maxSatisfying(sorted, spec.version);
  assert(version, `${spec.name}@${spec.version}: no matching version found`);

  return version;
}

async function getVersions(
  repository: string,
  name: string
): Promise<string[]> {
  const versions = await fetchRepository(
    repository,
    `modules/${name}/versions`
  );

  assert(
    Array.isArray(versions) &&
      versions.every((version) => typeof version === 'string'),
    `${name}: repository returned invalid version list`
  );

  return versions;
}

function createArchiveUrl(
  repository: string,
  spec: NonNullable<InstallSpec>
): string {
  return createRepositoryUrl(
    repository,
    `modules/${spec.name}/versions/${spec.version}/archive`
  );
}

async function installArtifactAtRoot(
  root: string,
  spec: NonNullable<InstallSpec>,
  url: string
): Promise<void> {
  const archive = await downloadArchive(url);
  const files = normalizeArchiveFiles(await extractGzipTarArchive(archive));

  const manifest = readManifest(files);
  assert(
    manifest.name === spec.name && manifest.version === spec.version,
    `${MODULE}: expected ${spec.name}@${spec.version}, got ${manifest.name}@${manifest.version}`
  );

  await writeModule(root, files);

  console.log(`Installed ${manifest.name}@${manifest.version}`);
}

async function downloadArchive(url: string): Promise<Buffer> {
  const response = await fetchUrl(url);

  return Buffer.from(await response.arrayBuffer());
}

function normalizeArchiveFiles(files: TarFile[]): TarFile[] {
  if (files.some((file) => file.path === MODULE)) {
    return files;
  }

  const [root] = new Set(files.map((file) => file.path.split('/')[0]));
  assert(root, 'archive must contain files at a common root');

  assert(
    files.every((file) => file.path.startsWith(`${root}/`)),
    'archive must contain files at a common root'
  );

  return files.map((file) => ({
    ...file,
    path: file.path.slice(root.length + 1)
  }));
}

function readManifest(files: TarFile[]): ModuleManifest {
  const file = files.find((file) => file.path === MODULE);
  assert(file, `archive must contain ${MODULE}`);

  return parseModuleManifest(file.content.toString(), MODULE, {
    validateDependencyRanges: true
  });
}

async function writeModule(root: string, files: TarFile[]): Promise<void> {
  await rm(root, {
    force: true,
    recursive: true
  });

  for (const file of files) {
    const path = resolve(root, file.path);
    assert(isInsidePath(path, root), `${file.path}: invalid file path`);

    await mkdir(dirname(path), {
      recursive: true
    });
    await writeFile(path, file.content);

    if (file.executable) {
      await chmod(path, 0o755);
    }
  }
}

async function mergeInstalledMetadata(
  metadata: Map<string, InstallMetadata>
): Promise<void> {
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
