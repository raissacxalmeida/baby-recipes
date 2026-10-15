import { authRoutes } from './auth.js';
import { dataRoutes } from './data.js';

export const routes = [...authRoutes, ...dataRoutes];
