// src/routes/solicitantes-sync/solicitantes-sync.routes.ts

import {
    Router,
} from "express";

import {
    sincronizarGoogleEmpresa,
    sincronizarGoogleUsuario,
    sincronizarMicrosoftEmpresa,
    sincronizarMicrosoftUsuario,
} from "../../controllers/solicitantes-sync/solicitantes-sync.controller";

import {
    authGuard,
} from "../../middlewares/auth.middleware.js";

const r =  Router();

r.post("/google", authGuard, sincronizarGoogleEmpresa,);

r.put("/google", authGuard, sincronizarGoogleUsuario,);

r.post("/microsoft", authGuard, sincronizarMicrosoftEmpresa,);

r.put("/microsoft", authGuard, sincronizarMicrosoftUsuario,);

export default r;