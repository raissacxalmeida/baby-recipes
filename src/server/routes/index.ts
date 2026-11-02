import { authRoutes } from './auth.js';
import { dataRoutes } from './data.js';
import { adminRoutes } from './admin.js';
import { translateRoutes } from './translate.js';
import type { Route } from '../types.js';

export const routes: Route[] = [...authRoutes, ...dataRoutes, ...translateRoutes, ...adminRoutes];
