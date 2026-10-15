import { authRoutes } from './auth.js';
import { dataRoutes } from './data.js';
import { adminRoutes } from './admin.js';

export const routes = [...authRoutes, ...dataRoutes, ...adminRoutes];
