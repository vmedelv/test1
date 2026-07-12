# Demo estático (GitHub Pages) — Plataforma de ticketing

Versión 100% cliente de `demo-event-ticketing/`, pensada para publicarse en
GitHub Pages (que solo sirve archivos estáticos y no puede correr el
servidor Node de esa otra carpeta).

## Diferencia clave con `demo-event-ticketing/`

**No hay servidor ni base de datos compartida.** Toda la lógica de negocio
(`lib/domain.js`, el mismo código que en la versión Node) corre en el
navegador y persiste en `localStorage`. Esto significa:

- Cada visitante tiene su propia copia de los datos — si creas un evento
  en tu navegador, solo tú lo ves. No hay forma de que un "comprador" en
  otro dispositivo compre una entrada y que el "organizador" la vea, salvo
  que sea el mismo navegador.
- Es perfecto para explorar el flujo completo tú solo (crear evento →
  comprar → pagar → check-in → estadísticas), pero **no simula un sistema
  multiusuario real**. Para eso hace falta el backend real que describe
  `docs/saas-event-ticketing/DISENO.md`.
- Igual que en la versión Node, el "QR" es un patrón visual determinista,
  no un QR ISO/IEC 18004 real, y las pasarelas de pago están simuladas.
  Ver `demo-event-ticketing/README.md` para el detalle de por qué.

## Estructura

```
index.html      Vitrina publica de eventos
admin.html       Panel del organizador (crear/publicar evento, ver stats)
event.html        Landing publica + checkout (?slug=...)
pay.html           Pago simulado Webpay Plus / Flow (?order=...)
order.html          Confirmacion de compra (?order=...)
ticket.html          Ticket individual con QR (?id=...)
checkin.html    Control de acceso por codigo
lib/store.js    Persistencia en localStorage
lib/domain.js   Reglas de negocio (mismo codigo que la version Node)
lib/qr.js       Imagen tipo QR (estilizada, ver nota arriba)
lib/seed.js     Siembra un evento de ejemplo si el navegador esta vacio
common.js       Helpers de formato + routing por query string
```

Como GitHub Pages no puede reescribir rutas, la navegación usa parámetros
de query (`event.html?slug=...`) en vez de rutas bonitas (`/e/:slug`) como
en la versión Node.
