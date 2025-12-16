"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
exports.env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT || 3000),
    CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:8100').split(','), //ACA MODIFICAR PORT DE FRONT
    JWT_SECRET: process.env.JWT_SECRET || 'change_me',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
    DATABASE_URL: process.env.DATABASE_URL || '',
};
