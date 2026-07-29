"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// src/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser")); // 👈
const routes_js_1 = __importDefault(require("./routes.js"));
const env_js_1 = require("./config/env.js");
const error_middleware_js_1 = require("./middlewares/error.middleware.js");
exports.app = (0, express_1.default)();
// CORS según env.CORS_ORIGIN. La app móvil es nativa y no aplica CORS; esto
// solo afecta a clientes de navegador. Si CORS_ORIGIN es "*" se permite todo
// (comodín string); si es una lista, se restringe a esos orígenes.
const corsOrigin = env_js_1.env.CORS_ORIGIN.includes('*') ? '*' : env_js_1.env.CORS_ORIGIN;
exports.app.use((0, cors_1.default)({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
exports.app.use((0, cookie_parser_1.default)()); // 👈 DEBE ir antes de las rutas
exports.app.use(express_1.default.json({ limit: '10mb' }));
exports.app.use((0, morgan_1.default)('dev'));
exports.app.use('/api', routes_js_1.default);
exports.app.use(error_middleware_js_1.errorHandler);
