# RemindaClinic — versión estática (GitHub Pages)

Versión **100% en el navegador** del demo [`demo-remindaclinic/`](../demo-remindaclinic)
(que usa un backend Node). No hay servidor ni base de datos: todo corre en tu
navegador y los datos se guardan en `localStorage`.

Ideal para publicar en **GitHub Pages** y compartir un link donde cualquiera
prueba el flujo sin instalar nada.

## Probar

Ábrelo con cualquier servidor estático (o directamente en GitHub Pages):

```bash
cd remindaclinic-pages
python3 -m http.server 8080
# abre http://localhost:8080
```

La primera vez se siembran datos de ejemplo (profesionales y citas). El botón
**Reiniciar** de la barra superior borra los datos de este navegador y vuelve a
sembrar.

## Páginas

- `index.html` — reservar hora (paciente).
- `agenda.html` — panel del personal.
- `recordatorios.html` — bandeja de recordatorios.
- `cita.html` — ver / confirmar / cancelar por código.

## Cómo funciona

`lib/store.js` (localStorage), `lib/reminders.js` (motor de recordatorios) y
`lib/domain.js` (reglas) son el mismo modelo que el backend Node, portado al
navegador. Un temporizador en `common.js` procesa los recordatorios vencidos
cada 30 s, igual que el "tick" del servidor.

## Diferencias con el backend Node

- **No hay backend compartido**: cada visitante ve solo lo que creó en su propio
  navegador/dispositivo.
- Los recordatorios se "envían" a una bandeja local (no hay SMS/WhatsApp/email
  reales), igual que en el demo Node.
- Para el demo con servidor real (API + persistencia en archivo), ver
  [`demo-remindaclinic/`](../demo-remindaclinic).

## Publicar en GitHub Pages

1. En GitHub: **Settings → Pages**.
2. En *Source*, elige **Deploy from a branch** y selecciona la rama y carpeta
   `/ (root)`.
3. La versión estática quedará en
   `https://<usuario>.github.io/<repo>/remindaclinic-pages/`.
