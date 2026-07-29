// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';           // 👈
import routes from './routes.js';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.middleware.js';
export const app = express();

// CORS según env.CORS_ORIGIN. La app móvil es nativa y no aplica CORS; esto
// solo afecta a clientes de navegador. Si CORS_ORIGIN es "*" se permite todo
// (comodín string); si es una lista, se restringe a esos orígenes.
const corsOrigin: string | string[] = env.CORS_ORIGIN.includes('*') ? '*' : env.CORS_ORIGIN;
app.use(cors({
    origin: corsOrigin,
    methods: ['GET','POST','PUT','DELETE'],
    credentials: false,
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());                             // 👈 DEBE ir antes de las rutas
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use('/api', routes);

app.use(errorHandler);
