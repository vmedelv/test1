# Demo estático (GitHub Pages) — Confirmación de horas de pacientes

Versión 100% cliente de `demo-confirmacion-horas/`, pensada para publicarse
en GitHub Pages (que solo sirve archivos estáticos y no puede correr el
servidor Node de esa otra carpeta).

## Diferencia clave con `demo-confirmacion-horas/`

**No hay servidor ni base de datos compartida.** Toda la lógica de negocio
(`lib/core.js`, el mismo archivo UMD que usa la versión Node) corre en el
navegador y persiste en `localStorage`. Esto significa:

- Cada visitante tiene su propia copia de los datos: el reloj simulado, las
  respuestas de pacientes y las gestiones que registres solo existen en tu
  navegador. El botón «Reiniciar demo» vuelve al escenario inicial.
- La actualización "en tiempo real" entre pestañas se logra con el evento
  `storage` de `localStorage` (la otra pestaña se recarga al detectar un
  cambio), en vez del stream SSE de la versión Node. El efecto práctico es
  el mismo: responde como paciente en una pestaña y mira el dashboard
  moverse en la otra.
- Igual que en la versión Node, SisMaule, los canales (SMS/WhatsApp/email/
  IVR) y el resultado post-cita son **simulados**. Ver
  `demo-confirmacion-horas/README.md` para el detalle de qué es real y qué
  no, y el recorrido sugerido (aplica igual aquí).

## Estructura

```
index.html      Dashboard de gestión de pacientes
paciente.html   Simulador de paciente (bandeja de mensajes y respuestas)
sismaule.html   Agenda maestra simulada (crear/mover/cancelar citas)
kpis.html       Indicadores de gestión
lib/core.js     Reglas de negocio (mismo código que la versión Node)
lib/store.js    Persistencia en localStorage
common.js       Helpers + despachador local (reemplaza a fetch/SSE)
styles.css      Estilos compartidos
```
