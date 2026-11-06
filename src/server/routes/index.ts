import { authRoutes } from './auth.js';
import { babyRoutes } from './babies.js';
import { dataRoutes } from './data.js';
import { adminRoutes } from './admin.js';
import { translateRoutes } from './translate.js';
import type { Route } from '../types.js';

export const routes: Route[] = [...authRoutes, ...babyRoutes, ...dataRoutes, ...translateRoutes, ...adminRoutes];
