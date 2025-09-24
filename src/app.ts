// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';           // 👈
import routes from './routes.js';
import { env } from './config/env.js';
//import { errorHandler } from './middlewares/error.js';
export const app = express();

app.use(cookieParser());                             // 👈 DEBE ir antes de las rutas
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', routes);    
// debug opcional de cookies:
app.get('/debug/cookies', (req, res) => res.json({ cookies: (req as any).cookies }));

