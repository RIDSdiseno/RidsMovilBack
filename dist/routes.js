"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_route_js_1 = __importDefault(require("./routes/auth.route.js"));
const entregas_route_js_1 = __importDefault(require("./routes/entregas.route.js"));
const router = (0, express_1.Router)();
router.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));
router.use("/auth", auth_route_js_1.default);
router.use("/entregas", entregas_route_js_1.default);
exports.default = router;
