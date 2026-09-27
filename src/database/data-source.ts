import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { loadDataSourceOptions } from './data-source-options';

loadEnv({ quiet: true });

export default new DataSource(loadDataSourceOptions());
