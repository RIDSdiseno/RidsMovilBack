"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
app_1.app.listen(env_1.env.PORT, '0.0.0.0', () => {
    console.log(`API escuchando en http://localhost:${env_1.env.PORT}`);
});
