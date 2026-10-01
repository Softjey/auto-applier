import { resolve } from 'node:path';
import { DEFAULT_PORT } from '@applier/protocol';

/** Repo root: autofill/packages/server/src -> ../../../.. */
export const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

export const PORT = DEFAULT_PORT;
/** Loopback only. There is deliberately no option to bind anything else. */
export const HOST = '127.0.0.1';
