import { authRoutes } from './auth.js';
import { dataRoutes } from './data.js';
import { adminRoutes } from './admin.js';
import { translateRoutes } from './translate.js';

export const routes = [...authRoutes, ...dataRoutes, ...translateRoutes, ...adminRoutes];
