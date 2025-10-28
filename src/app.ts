// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';           // 👈
import routes from './routes.js';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.middleware.js';
export const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET','POST','PUT','DELETE'],
    credentials: false,
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());                             // 👈 DEBE ir antes de las rutas
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', routes);    
// debug opcional de cookies:
app.get('/debug/cookies', (req, res) => res.json({ cookies: (req as any).cookies }));

app.use(errorHandler);