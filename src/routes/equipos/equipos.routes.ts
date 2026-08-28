import { Router } from "express";

import {
  createManyEquipos,
  getAllEquipos,
  getEquipoDetalleMovil,
  actualizarEquipo,
  createManyDetalle,
  createEquipo,
  cambiarAsignacionEquipo,
} from "../../controllers/equipos/equipos.controller.js";

import { authGuard } from "../../middlewares/auth.middleware.js";

const r = Router();

/* =========================================================
   EQUIPOS
========================================================= */

// Listado de equipos
r.get("/getAllEquipos",authGuard,getAllEquipos,);

// Detalle de un equipo
r.get("/equipos/:id", authGuard, getEquipoDetalleMovil,);

// Actualizar información del equipo
r.patch("/equipos/:id",authGuard,actualizarEquipo,);

// Cambiar solicitante asociado
r.put("/equipos/:id/asignacion",authGuard,cambiarAsignacionEquipo,);

// Crear equipo
r.post("/createEquipo",authGuard,createEquipo,);

// Carga masiva de equipos
r.post("/createManyEquipos",authGuard,createManyEquipos,);

// Carga masiva de detalles
r.post("/createManyDetalle",authGuard,createManyDetalle,);

export default r;