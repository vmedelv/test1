# 🩺 RemindaClinic — Demo funcional

Demo **sin dependencias externas** (solo Node.js) de una agenda médica con
**reserva de horas** y **recordatorios automáticos**. Pensado como MVP para una
clínica chilena que quiere reducir el ausentismo ("no-shows") avisando a los
pacientes por SMS / WhatsApp / email antes de su hora.

## ✨ Qué incluye

- **Reserva de horas** (paciente): elige profesional, ve las horas libres según
  su jornada y duración de atención, y reserva con sus datos.
- **Agenda de la clínica** (personal): panel con las citas del día agrupadas por
  fecha, estados (reservada, confirmada, atendida, no asistió, cancelada) y
  cambio de estado en línea.
- **Motor de recordatorios**: cada cita programa avisos automáticos **24 h** y
  **2 h** antes. Un proceso en segundo plano (cada 30 s) los "envía" cuando
  llega su hora y los deja en una **bandeja de salida** visible en la UI.
- **Mi cita** (paciente): busca por código para **confirmar** o **cancelar** su
  hora; al cancelar se liberan el cupo y los recordatorios pendientes.

## 🧱 Arquitectura

```
src/
  server.js     Servidor HTTP + API JSON + router simple + tick de recordatorios
  domain.js     Reglas de negocio: profesionales, horas disponibles, citas
  reminders.js  Motor de recordatorios (programar / cancelar / enviar)
  store.js      Persistencia en data/db.json (sin base de datos)
  seed.js       Datos de ejemplo
public/         UI estática (HTML + CSS + JS, sin framework)
  index.html        Reservar hora
  agenda.html       Panel de la clínica
  recordatorios.html Bandeja de recordatorios
  cita.html         Ver / confirmar / cancelar por código
```

Los datos viven en `data/db.json` (ignorado por git). No hay dependencias npm.

## 🚀 Probar localmente

```bash
cd demo-remindaclinic
npm run seed:reset   # crea profesionales y citas de ejemplo
npm start            # levanta http://localhost:8080
```

Abre <http://localhost:8080> y prueba el flujo: reserva una hora, míra la agenda
y revisa la bandeja de recordatorios. El puerto se cambia con `PORT=xxxx npm start`.

## 🔌 API (resumen)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET  | `/api/professionals` | Lista de profesionales |
| GET  | `/api/professionals/:id/slots?date=YYYY-MM-DD` | Horas del día |
| POST | `/api/appointments` | Reserva una hora |
| GET  | `/api/appointments?professionalId=&date=&status=` | Agenda filtrable |
| POST | `/api/appointments/:id/confirm` | El paciente confirma |
| POST | `/api/appointments/:id/cancel` | Anula la hora |
| POST | `/api/appointments/:id/status` | Cambia el estado (personal) |
| GET  | `/api/lookup?code=ABC-123` | Buscar una cita por código |
| GET  | `/api/reminders?status=` | Bandeja de recordatorios |
| POST | `/api/reminders/process` | Envía los recordatorios vencidos |
| GET  | `/api/summary` | Métricas para el panel |

## ⚠️ Alcance del demo

Es un MVP para mostrar el flujo completo. Para producción faltaría, entre otros:
integración real de SMS/WhatsApp/email, autenticación del personal, zonas
horarias robustas, base de datos real y control de concurrencia en la reserva.
