#!/usr/bin/env node

import { main } from './cmd/cmd.ts';

import './cmd/mod/build.ts';
import './cmd/mod/create.ts';
import './cmd/mod/download.ts';
import './cmd/mod/get.ts';
import './cmd/mod/graph.ts';
import './cmd/mod/publish.ts';
import './cmd/mod/remove.ts';
import './cmd/mod/repo.ts';
import './cmd/mod/tidy.ts';
import './cmd/mod/verify.ts';
import './cmd/mod/why.ts';

await main();
