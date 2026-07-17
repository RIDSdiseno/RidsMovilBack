import {app} from './app'
import {env} from './config/env'
import {prisma} from './lib/prisma'

const server = app.listen(env.PORT,'0.0.0.0',()=>{
    console.log(`API escuchando en http://localhost:${env.PORT}`);
});

let shuttingDown = false;

const closeHttpServer = () =>
    new Promise<void>((resolve, reject) => {
        if (!server.listening) {
            resolve();
            return;
        }

        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });

const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`${signal} recibido. Cerrando servidor...`);

    const forceExitTimer = setTimeout(() => {
        console.error('Tiempo de cierre agotado. Terminando proceso.');
        process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    try {
        await closeHttpServer();
        await prisma.$disconnect();
        clearTimeout(forceExitTimer);
        console.log('Servidor y Prisma cerrados correctamente.');
        process.exit(0);
    } catch (error) {
        clearTimeout(forceExitTimer);
        console.error('Error durante el cierre del servidor:', error);
        process.exit(1);
    }
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
