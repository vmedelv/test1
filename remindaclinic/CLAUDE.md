# RemindaClinic

App **sin servidor** para gestionar citas de una clínica/consulta y **enviar
recordatorios** a los pacientes por WhatsApp, SMS o correo. Pensada para
recepcionistas: agendar, ver la agenda del día y mandar recordatorios en pocos
clics.

Todo funciona en el navegador. Los datos se guardan en `localStorage`
(nada se envía a ningún servidor). Los recordatorios se generan como mensajes
listos para copiar o abrir directamente en WhatsApp (`wa.me`), el cliente de
correo (`mailto:`) o SMS (`sms:`).

## Objetivo

Reducir las inasistencias ("no-shows") facilitando el recordatorio de citas.

## Alcance (MVP)

- **Pacientes**: nombre, teléfono, correo, RUT (opcional), notas.
- **Citas**: paciente, fecha/hora, profesional, motivo, estado
  (`agendada`, `confirmada`, `atendida`, `cancelada`, `no_asistió`).
- **Agenda**: vista del día y próximos días con acciones rápidas.
- **Recordatorios**: lista de citas próximas pendientes de avisar; genera el
  mensaje con una plantilla configurable y lo abre en WhatsApp / correo / SMS.
  Marca la cita como "recordada".
- **Ajustes**: nombre y teléfono de la clínica, ventana del recordatorio
  (horas antes), plantilla del mensaje, exportar/importar datos (JSON),
  cargar datos de demostración.

## Convenciones

- Español (es-CL). Fechas y horas con `Intl` en zona horaria local.
- Sin dependencias ni build. Vanilla JS (módulos ES) + CSS.
- Persistencia: `localStorage` bajo la clave `remindaclinic.v1`.
- Teléfonos se normalizan a formato internacional para `wa.me` (Chile: +56).

## Estructura

```
index.html        Shell de una sola página
css/styles.css    Diseño (claro, accesible, responsive)
js/store.js       Modelo de datos y persistencia (localStorage)
js/format.js      Formato de fechas, teléfonos y plantillas de mensaje
js/seed.js        Datos de demostración
js/ui.js          Helpers de UI (toasts, modales)
js/app.js         Router y vistas (Agenda, Citas, Pacientes, Recordatorios, Ajustes)
```

## Probar localmente

```bash
cd remindaclinic
python3 -m http.server 8080
# abre http://localhost:8080
```

## Privacidad

No hay cuentas ni backend. Todos los datos viven en el dispositivo del usuario.
