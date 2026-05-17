import assert from 'node:assert';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { MODULE, MODULES } from './common/constants.ts';
import {
  assertModuleName,
  isSemver,
  parseModuleManifest,
  readModuleManifest
} from './common/helpers/manifest.ts';
import { assertLockNode, readModlock } from './common/helpers/modlock.ts';
import { isInsidePath } from './common/helpers/path.ts';
import {
  createRepositoryError,
  createRepositoryUrl,
  resolveRepository
} from './common/helpers/repository.ts';
import {
  extractInstallArchive,
  type TarFile
} from './common/helpers/tarball.ts';
import { createDependencyCandidates } from './common/helpers/tsconfig.ts';
import type { Modlock } from './common/types.ts';
import { init } from './init.ts';

interface InstallSpec {
  name: string;
  version?: string;
}

interface InstallOptions {
  repository: string;
  installed: Map<string, string>;
  installedDependencies: Set<string>;
}

export async function install(args: string[]) {
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

  const repository = await resolveRepository(values.repository);
  const options: InstallOptions = {
    repository,
    installed: new Map(),
    installedDependencies: new Set()
  };

  if (positionals.length === 0) {
    await installFromModlock(options);
  } else {
    for (const spec of positionals.map(parseInstallSpec)) {
      await installModule(spec, MODULES, options);
    }
  }

  await init(['--repository', repository]);
}

async function installFromModlock(options: InstallOptions) {
  const modlock = await readModlock();
  const nodes = Object.values(modlock);

  for (const node of nodes) {
    await installLockedModule(node, MODULES, options);
  }

  for (const node of nodes) {
    const root = resolve(MODULES, node.name);
    await installLockedDependencies(root, node, options);
  }
}

async function installModule(
  spec: InstallSpec,
  parentRoot: string,
  options: InstallOptions
) {
  const version = await resolveVersion(options.repository, spec);
  const root = await installResolvedModule(
    {
      name: spec.name,
      version
    },
    parentRoot,
    options
  );

  await installDependencies(root, options);

  return root;
}

async function installLockedModule(
  node: Modlock[string],
  parentRoot: string,
  options: InstallOptions
) {
  assertLockNode(node);

  return installResolvedModule(
    {
      name: node.name,
      version: node.version
    },
    parentRoot,
    options
  );
}

async function installLockedDependencies(
  root: string,
  node: Modlock[string],
  options: InstallOptions
) {
  assertLockNode(node);

  for (const dependency of Object.values(node.dependencies)) {
    const dependencyRoot = await installLockedModule(
      dependency,
      resolve(root, 'modules'),
      options
    );
    await installLockedDependencies(dependencyRoot, dependency, options);
  }
}

async function installResolvedModule(
  spec: Required<InstallSpec>,
  parentRoot: string,
  options: InstallOptions
) {
  const { version } = spec;
  const key = `${parentRoot}:${spec.name}@${version}`;
  const installed = options.installed.get(key);

  if (installed) {
    return installed;
  }

  const existing = await findInstalledCandidate(parentRoot, spec.name, version);
  if (existing) {
    options.installed.set(key, existing);

    return existing;
  }

  const root = resolve(parentRoot, spec.name);
  const archive = await downloadArchive(options.repository, spec.name, version);
  const files = await extractInstallArchive(archive);
  const manifest = readManifest(files);

  assert(
    manifest.name === spec.name,
    `${MODULE}: expected module "${spec.name}", got "${manifest.name}"`
  );
  assert(
    manifest.version === version,
    `${MODULE}: expected ${spec.name}@${version}, got ${manifest.name}@${manifest.version}`
  );

  await writeModule(root, files);
  options.installed.set(key, root);
  console.log(`Installed ${manifest.name}@${manifest.version}`);

  return root;
}

async function installDependencies(root: string, options: InstallOptions) {
  if (options.installedDependencies.has(root)) {
    return;
  }

  options.installedDependencies.add(root);

  const manifest = await readInstalledManifest(root);

  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    await installModule(
      {
        name,
        version
      },
      resolve(root, 'modules'),
      options
    );
  }
}

function parseInstallSpec(spec: string): InstallSpec {
  const separator = spec.lastIndexOf('@');
  const name = separator > 0 ? spec.slice(0, separator) : spec;
  const version = separator > 0 ? spec.slice(separator + 1) : undefined;

  assertModuleName(name);
  assert(
    version === undefined || semver.validRange(version) !== null,
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

  if (!spec.version) {
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

async function downloadArchive(
  repository: string,
  name: string,
  version: string
) {
  const response = await fetch(
    createRepositoryUrl(
      repository,
      `modules/${name}/versions/${version}/archive`
    )
  );

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

async function findInstalledCandidate(
  parentRoot: string,
  name: string,
  version: string
) {
  for (const root of createDependencyCandidates(parentRoot, name)) {
    const manifest = await readManifestOrUndefined(root);
    if (manifest?.version === version) {
      return root;
    }
  }

  return undefined;
}

async function readManifestOrUndefined(root: string) {
  try {
    return await readInstalledManifest(root);
  } catch {
    return undefined;
  }
}
