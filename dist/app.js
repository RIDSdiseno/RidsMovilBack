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
const error_middleware_js_1 = require("./middlewares/error.middleware.js");
exports.app = (0, express_1.default)();
exports.app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
exports.app.use((0, cookie_parser_1.default)()); // 👈 DEBE ir antes de las rutas
exports.app.use(express_1.default.json());
exports.app.use((0, morgan_1.default)('dev'));
exports.app.use('/api', routes_js_1.default);
// debug opcional de cookies:
exports.app.get('/debug/cookies', (req, res) => res.json({ cookies: req.cookies }));
exports.app.use(error_middleware_js_1.errorHandler);
