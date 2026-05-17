import { resolve } from 'node:path';

export const MODLOCK = 'modlock.json';
export const MODRC = 'modrc.json';
export const MODULE = 'module.json';

export const MODULE_NAME = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

export const MODULES = resolve('src', 'modules');
