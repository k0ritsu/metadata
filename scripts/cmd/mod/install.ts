import assert from 'node:assert/strict';
import { chmod, glob, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { CACHE, MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
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
  createRepositoryError,
  createRepositoryUrl,
  resolveRepository
} from './common/helpers/repository.ts';
import {
  extractInstallArchive,
  type TarFile
} from './common/helpers/tarball.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { CommandHandler } from './common/types.ts';
import { tidy } from './tidy.ts';

interface InstallSpec {
  name: string;
  version?: string;
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
  const installedDependencies = new Set<string>();
  for (const [name] of rootSet) {
    await installDependencies(
      repository,
      resolve(MODULES, name),
      rootSet,
      metadata,
      installedDependencies
    );
  }

  await tidy([]);
  await mergeInstalledMetadata(metadata);
};

async function installFromModlock() {
  const modlock = await readModlock();

  for (const [key, node] of Object.entries(modlock.modules)) {
    if (key === ROOT_NODE) {
      continue;
    }

    assert(node.resolved, `${key}: resolved is required`);
    assert(node.integrity, `${key}: integrity is required`);

    const { dependency: name, version } = parseModuleKey(key);
    const root = resolveModuleRoot(modlock, key);

    await installArtifactAtRoot(node.resolved, name, version, root);

    const actual = await createModuleIntegrity(root);
    assert(actual === node.integrity, `${key}: integrity verification failed`);
  }

  await createTsconfigs();
}

async function installRequestedRoot(
  repository: string,
  spec: InstallSpec,
  metadata: Map<string, InstallMetadata>
) {
  const version = await resolveVersion(repository, spec);
  const key = createModuleKey(spec.name, version);
  const root = resolve(MODULES, spec.name);
  const cached = resolve(CACHE, key);
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

  if (await exists(cached)) {
    await rm(root, {
      force: true,
      recursive: true
    });
    await rename(cached, root);
    return;
  }

  const resolved = String(
    createRepositoryUrl(
      repository,
      `modules/${spec.name}/versions/${version}/archive`
    )
  );
  await installArtifactAtRoot(resolved, spec.name, version, root);

  metadata.set(key, {
    integrity: await createModuleIntegrity(root),
    resolved
  });
}

async function installDependencies(
  repository: string,
  root: string,
  rootSet: Map<string, string>,
  metadata: Map<string, InstallMetadata>,
  installed: Set<string>
) {
  const manifest = await readInstalledManifest(root);
  const key = createModuleKey(manifest.name, manifest.version);
  if (installed.has(key)) {
    return;
  }

  installed.add(key);

  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    const rootVersion = rootSet.get(name);
    if (rootVersion && semver.satisfies(rootVersion, range)) {
      await installDependencies(
        repository,
        resolve(MODULES, name),
        rootSet,
        metadata,
        installed
      );
      continue;
    }

    const version = await resolveVersion(repository, {
      name,
      version: range
    });
    const dependencyKey = createModuleKey(name, version);
    const dependencyRoot = resolve(CACHE, dependencyKey);

    if (!(await exists(dependencyRoot))) {
      const resolved = String(
        createRepositoryUrl(
          repository,
          `modules/${name}/versions/${version}/archive`
        )
      );
      await installArtifactAtRoot(resolved, name, version, dependencyRoot);
      metadata.set(dependencyKey, {
        integrity: await createModuleIntegrity(dependencyRoot),
        resolved
      });
    }

    await installDependencies(
      repository,
      dependencyRoot,
      rootSet,
      metadata,
      installed
    );
  }
}

function parseInstallSpec(spec: string): InstallSpec {
  const separator = spec.lastIndexOf('@');
  const name = separator > 0 ? spec.slice(0, separator) : spec;
  const version = separator > 0 ? spec.slice(separator + 1) : undefined;

  assertModuleName(name);
  assert(
    version === undefined ||
      version === LATEST ||
      semver.validRange(version) !== null,
    `${version}: invalid module version spec`
  );

  return {
    name,
    ...(version === undefined ? {} : { version })
  };
}

async function resolveVersion(repository: string, spec: InstallSpec) {
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

async function getVersions(repository: string, name: string) {
  const response = await fetch(
    createRepositoryUrl(repository, `modules/${name}/versions`)
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      createRepositoryError('Fetch versions failed', response, body)
    );
  }

  const versions: unknown = JSON.parse(body);
  assert(
    Array.isArray(versions) &&
      versions.every((version) => typeof version === 'string'),
    `${name}: repository returned invalid version list`
  );

  return versions;
}

async function installArtifactAtRoot(
  url: string,
  name: string,
  version: string,
  root: string
) {
  const archive = await downloadArchive(url);
  const files = await extractInstallArchive(archive);
  const manifest = readManifest(files);

  assert(
    manifest.name === name,
    `${MODULE}: expected module "${name}", got "${manifest.name}"`
  );
  assert(
    manifest.version === version,
    `${MODULE}: expected ${name}@${version}, got ${manifest.name}@${manifest.version}`
  );

  await writeModule(root, files);
  console.log(`Installed ${manifest.name}@${manifest.version}`);
}

async function downloadArchive(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      createRepositoryError(
        'Download archive failed',
        response,
        await response.text()
      )
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

function readManifest(files: TarFile[]) {
  const moduleJson = files.find((file) => file.path === MODULE);
  assert(moduleJson, `Archive must contain ${MODULE}.`);

  return parseModuleManifest(moduleJson.content.toString(), MODULE, {
    validateDependencyRanges: true
  });
}

async function readInstalledManifest(root: string) {
  return readModuleManifest(root, {
    validateDependencyRanges: true
  });
}

async function writeModule(root: string, files: TarFile[]) {
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

async function readManifestOrUndefined(root: string) {
  try {
    return await readInstalledManifest(root);
  } catch {
    return undefined;
  }
}

async function loadRootSet() {
  const rootSet = new Map<string, string>();

  for await (const path of glob(resolve(MODULES, '*', MODULE))) {
    const mod = await readModuleManifest(path, {
      validateDependencyRanges: true
    });
    rootSet.set(mod.name, mod.version);
  }

  return rootSet;
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
