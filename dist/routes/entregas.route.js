"use strict";
// src/routes/entregas.route.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middlewares/auth.middleware.js");
const entregas_controller_js_1 = require("../controllers/entregas.controller.js");
const evidencias_route_js_1 = __importDefault(require("./evidencias.route.js"));
const r = (0, express_1.Router)();
r.use(auth_middleware_js_1.authGuard);
r.get("/", entregas_controller_js_1.listarEntregas);
r.post("/", entregas_controller_js_1.crearEntrega);
r.get("/:id", entregas_controller_js_1.obtenerEntrega);
r.use("/:id/evidencias", evidencias_route_js_1.default);
exports.default = r;
