import { glob } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { CmdError, registerCommand, type CmdContext } from '../cmd.ts';
import { CACHE, MODULE, MODULES } from './common/constants.ts';
import { installArtifactAtRoot, type InstallMetadata } from './common/helpers/install.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName, isSemver, readModuleManifest } from './common/helpers/manifest.ts';
import { readModlock, writeModlock } from './common/helpers/modlock.ts';
import { readModrc } from './common/helpers/modrc.ts';
import { exists, replacePathAtomically } from './common/helpers/path.ts';
import { isRecord } from './common/helpers/record.ts';
import { api, resolveRepository } from './common/helpers/repository.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';
import { tidyWorkspace } from './tidy.ts';

interface InstallSpec {
  name: string;
  version: string | undefined;
}

interface VersionMetadata {
  archiveUrl: string;
}

interface InstalledModule {
  name: string;
  root: string;
  version: string;
}

const LATEST = 'latest';

export const get = withModuleTransaction('get', async (args, context) => {
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
    throw new CmdError('Module name is required');
  }

  const modrc = values.repository ? undefined : await readModrc();
  const repository = resolveRepository(values.repository, modrc);
  const metadata = new Map<string, InstallMetadata>();

  for (const spec of positionals.map(parseInstallSpec)) {
    await installRequestedRoot(repository, spec, metadata, context);
  }

  const roots = await loadInstalledRoots();
  const installed = new Set<string>();

  for (const root of roots.values()) {
    await installDependencies(repository, root, metadata, roots, installed, context);
  }

  await tidyWorkspace();
  await mergeInstalledMetadata(metadata);
});

registerCommand({
  name: 'get',
  description: 'Install or update root modules from the repository',
  main: get
});

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
    throw new CmdError(`${version}: Invalid module version`);
  }

  return {
    name,
    version
  };
}

async function installRequestedRoot(
  repository: string,
  spec: InstallSpec,
  metadata: Map<string, InstallMetadata>,
  env: CmdContext
) {
  const version = await resolveRequestedVersion(repository, spec);
  const key = createModuleKey(spec.name, version);
  const root = resolve(MODULES, spec.name);

  const cached = resolve(CACHE, key);
  if (await exists(cached)) {
    await replacePathAtomically(root, cached);
    metadata.set(key, {
      integrity: await createModuleIntegrity(root),
      resolved: await resolveArchiveUrl(repository, spec.name, version)
    });

    return;
  }

  const resolved = await resolveArchiveUrl(repository, spec.name, version);
  metadata.set(
    key,
    await installArtifactAtRoot(
      root,
      {
        name: spec.name,
        version
      },
      resolved,
      {
        logger: env.logger
      }
    )
  );
}

async function loadInstalledRoots() {
  const roots = new Map<string, InstalledModule>();

  for await (const path of glob(resolve(MODULES, '*', MODULE))) {
    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    roots.set(manifest.name, {
      name: manifest.name,
      root: dirname(path),
      version: manifest.version
    });
  }

  return roots;
}

async function installDependencies(
  repository: string,
  module: InstalledModule,
  metadata: Map<string, InstallMetadata>,
  roots: Map<string, InstalledModule>,
  installed: Set<string>,
  env: CmdContext
) {
  const manifest = await readInstalledManifest(module.root);
  const key = createModuleKey(manifest.name, manifest.version);
  if (installed.has(key)) {
    return;
  }

  installed.add(key);

  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    const dependency = await resolveDependency(repository, name, range, roots, metadata, env);

    await installDependencies(repository, dependency, metadata, roots, installed, env);
  }
}

async function resolveDependency(
  repository: string,
  name: string,
  range: string,
  roots: Map<string, InstalledModule>,
  metadata: Map<string, InstallMetadata>,
  env: CmdContext
) {
  const root = roots.get(name);
  if (root && semver.satisfies(root.version, range)) {
    return root;
  }

  const cached = await findCachedModule(name, range);
  if (cached) {
    return cached;
  }

  const version = await resolveVersion(repository, {
    name,
    version: range
  });
  const key = createModuleKey(name, version);
  const cacheRoot = resolve(CACHE, key);

  if (!(await exists(cacheRoot))) {
    const resolved = await resolveArchiveUrl(repository, name, version);

    metadata.set(
      key,
      await installArtifactAtRoot(
        cacheRoot,
        {
          name,
          version
        },
        resolved,
        {
          logger: env.logger
        }
      )
    );
  }

  return {
    name,
    root: cacheRoot,
    version
  };
}

async function findCachedModule(name: string, range: string) {
  const modules: InstalledModule[] = [];

  for await (const path of glob(resolve(CACHE, `${name}@*`, MODULE))) {
    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    if (manifest.name === name && semver.satisfies(manifest.version, range)) {
      modules.push({
        name,
        root: dirname(path),
        version: manifest.version
      });
    }
  }

  const version = semver.maxSatisfying(
    modules.map((module) => module.version),
    range
  );
  if (!version) {
    return;
  }

  return modules.find((module) => module.version === version);
}

function readInstalledManifest(root: string) {
  return readModuleManifest(root, {
    validateDependencyRanges: true
  });
}

async function resolveRequestedVersion(repository: string, spec: InstallSpec) {
  if (spec.version && isSemver(spec.version)) {
    return spec.version;
  }

  return resolveVersion(repository, spec);
}

async function resolveVersion(repository: string, spec: InstallSpec) {
  const versions = await getVersions(repository, spec.name);

  const sorted = semver.rsort(versions);
  if (sorted.length === 0) {
    throw new CmdError(`${spec.name}: No published versions found`);
  }

  if (!spec.version || spec.version === LATEST) {
    const [latest] = sorted;
    if (!latest) {
      throw new CmdError(`${spec.name}: No published versions found`);
    }

    return latest;
  }

  if (isSemver(spec.version)) {
    if (!sorted.includes(spec.version)) {
      throw new CmdError(`${spec.name}@${spec.version}: Version not found`);
    }

    return spec.version;
  }

  const version = semver.maxSatisfying(sorted, spec.version);
  if (!version) {
    throw new CmdError(`${spec.name}@${spec.version}: No matching version found`);
  }

  return version;
}

async function getVersions(repository: string, name: string) {
  const versions = await api(repository, `modules/${name}/versions`);

  if (!Array.isArray(versions) || !versions.every((version) => typeof version === 'string')) {
    throw new CmdError(`${name}: Repository returned invalid version list`);
  }

  const invalid = versions.find((version) => !isSemver(version));
  if (invalid) {
    throw new CmdError(`${name}: Repository returned invalid version '${invalid}'`);
  }

  return versions;
}

async function resolveArchiveUrl(repository: string, name: string, version: string) {
  const metadata = await api(repository, `modules/${name}/versions/${version}`);

  assertVersionMetadata(metadata, createModuleKey(name, version));

  return metadata.archiveUrl;
}

function assertVersionMetadata(value: unknown, key: string): asserts value is VersionMetadata {
  if (!isRecord(value) || typeof value['archiveUrl'] !== 'string') {
    throw new CmdError(`${key}: Repository returned invalid version metadata`);
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
