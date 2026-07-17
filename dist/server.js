"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./lib/prisma");
const server = app_1.app.listen(env_1.env.PORT, '0.0.0.0', () => {
    console.log(`API escuchando en http://localhost:${env_1.env.PORT}`);
});
let shuttingDown = false;
const closeHttpServer = () => new Promise((resolve, reject) => {
    if (!server.listening) {
        resolve();
        return;
    }
    server.close((error) => {
        if (error)
            reject(error);
        else
            resolve();
    });
});
const shutdown = async (signal) => {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`${signal} recibido. Cerrando servidor...`);
    const forceExitTimer = setTimeout(() => {
        console.error('Tiempo de cierre agotado. Terminando proceso.');
        process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    try {
        await closeHttpServer();
        await prisma_1.prisma.$disconnect();
        clearTimeout(forceExitTimer);
        console.log('Servidor y Prisma cerrados correctamente.');
        process.exit(0);
    }
    catch (error) {
        clearTimeout(forceExitTimer);
        console.error('Error durante el cierre del servidor:', error);
        process.exit(1);
    }
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
