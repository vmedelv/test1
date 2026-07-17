# 🩺 RemindaClinic

App web **sin servidor** para gestionar las citas de una clínica o consulta y
**enviar recordatorios** a los pacientes por **WhatsApp, SMS o correo**, con el
objetivo de reducir las inasistencias ("no-shows").

Pensada para recepción: agenda del día, alta de pacientes y citas, y un panel de
recordatorios que arma el mensaje con una plantilla y lo abre directamente en
WhatsApp (`wa.me`), el cliente de correo (`mailto:`) o SMS (`sms:`).

Todo corre en el navegador. Los datos se guardan **solo en tu dispositivo**
(`localStorage`); no hay cuentas ni backend.

## ✨ Funciones

- **Agenda**: resumen del día, próximas citas y contador de recordatorios
  pendientes.
- **Citas**: crear, editar y eliminar; estados (agendada, confirmada, atendida,
  cancelada, no asistió); búsqueda y filtro por estado.
- **Pacientes**: nombre, teléfono, correo, RUT y notas.
- **Recordatorios**: lista de citas dentro de la ventana configurada (por
  defecto 24 h) sin avisar; genera el mensaje y lo abre en el canal elegido;
  marca la cita como "recordada".
- **Ajustes**: nombre y teléfono de la clínica, código de país, ventana del
  recordatorio, plantilla del mensaje (con variables), y exportar/importar/
  borrar datos y cargar una demo.

## 🚀 Probar localmente

Los módulos ES necesitan servirse por HTTP (no funcionan con `file://`):

```bash
cd remindaclinic
python3 -m http.server 8080
# abre http://localhost:8080
```

En **Ajustes → Datos → Cargar demo** puedes poblar la app con pacientes y citas
de ejemplo.

## 🌐 Publicar en GitHub Pages

Si el sitio se publica desde la raíz del repo, la app queda disponible en
`.../remindaclinic/`.

## 🗂️ Estructura

```
index.html        Shell de una sola página
css/styles.css    Diseño (claro, responsive, mobile-first)
js/store.js       Modelo de datos y persistencia (localStorage)
js/format.js      Formato de fechas, teléfonos y plantillas de mensaje
js/seed.js        Datos de demostración
js/ui.js          Helpers de UI (elementos, toasts, modales)
js/app.js         Router y vistas
CLAUDE.md         Notas del proyecto para Claude Code
```

## 🔒 Privacidad

Sin servidores ni cuentas. Todos los datos viven en tu navegador. Puedes
exportarlos/importarlos como JSON desde **Ajustes → Datos**.
