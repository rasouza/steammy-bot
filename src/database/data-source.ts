import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { loadDataSourceOptions } from './data-source-options.js';

loadEnv({ quiet: true });

export default new DataSource(loadDataSourceOptions());
