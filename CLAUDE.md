# CLAUDE.md

Guía para trabajar con Claude Code en este repositorio.

## Sobre este repo

Es un repositorio de **demos y prototipos** independientes. Cada demo vive en su
propia carpeta y es autocontenida. Demos actuales:

- `demo-remindaclinic/` — **RemindaClinic**: agenda médica con reserva de horas y
  recordatorios automáticos (Node, sin dependencias). Ver su `README.md`.
- `demo-event-ticketing/` — plataforma de venta de tickets (Node, sin dependencias).
- Raíz / `index.html` — PWA "Mi Reto Saludable" (app de bajar de peso, cliente).

## RemindaClinic (foco actual)

Producto: sistema de **agenda clínica** (reserva de horas + agenda del personal +
recordatorios automáticos por SMS/WhatsApp/email) para reducir el ausentismo.
Contexto: Chile (teléfonos `+569…`, textos en español).

### Cómo correrlo

```bash
cd demo-remindaclinic
npm run seed:reset   # datos de ejemplo en data/db.json
npm start            # http://localhost:8080  (PORT=xxxx para cambiar)
```

No hay pasos de build ni dependencias que instalar.

### Estructura

- `src/server.js` — servidor HTTP + API JSON + router + tick de recordatorios (30 s).
- `src/domain.js` — reglas: profesionales, generación de horas, ciclo de vida de citas.
- `src/reminders.js` — motor de recordatorios (programar, cancelar, enviar).
- `src/store.js` — persistencia en `data/db.json` (sin base de datos).
- `src/seed.js` — datos de ejemplo.
- `public/*.html` — UI estática sin framework (`index`, `agenda`, `recordatorios`, `cita`).

### Modelo de datos (resumen)

- **professional**: `{ id, slug, name, specialty, color, slotMinutes, days[], blocks[] }`.
- **appointment**: `{ id, code, professionalId, patient*, date, time, durationMin,
  reason, channel, status }`. Estados: `reservada`, `confirmada`, `cancelada`,
  `atendida`, `no_asistio`.
- **reminder**: `{ id, appointmentId, channel, kind, hoursBefore, scheduledFor,
  status, sentAt, message }`. Estados: `pendiente`, `enviado`, `cancelado`.

## Convenciones

- **Sin dependencias externas** en las demos de Node: solo módulos nativos. No
  agregues paquetes npm salvo que se pida explícitamente.
- **Idioma**: la UI y los mensajes al usuario van en **español**.
- **Comentarios de código** en español, concisos, explicando el "por qué".
- Estilo JS: `'use strict'`, CommonJS (`require`/`module.exports`), sin transpilar.
- Los errores de negocio se lanzan como `DomainError(mensaje, status)` y el
  servidor los traduce a respuestas JSON `{ error }` con el código HTTP correcto.
- Cambios de estado siempre pasan por la capa `domain`/`reminders`, no se
  manipula `store.db` directamente desde el servidor.

## Verificar cambios

No hay suite de tests todavía. Para validar a mano:

```bash
cd demo-remindaclinic && npm run seed:reset && npm start
# luego probar el flujo en el navegador o con curl contra /api/*
```

Si tocas la lógica de reservas o recordatorios, revisa al menos: reservar una
hora, evitar doble reserva (409), confirmar, cancelar (deben cancelarse los
recordatorios pendientes) y que el tick envíe los recordatorios vencidos.

## Git

- `data/db.json` está en `.gitignore`: no lo commitees.
- Mensajes de commit claros y descriptivos, en español.
