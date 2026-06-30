# 🏆 Mi Reto Saludable

Web app **gamificada para bajar de peso**, pensada para usarse en el iPhone como
PWA (se instala en la pantalla de inicio). Cuenta calorías, te recuerda comer y
tomar agua a las horas correctas, registra tus ejercicios y tu progreso, y te da
**puntos, niveles, rachas y logros** para mantenerte motivado.

Todo funciona **sin servidor**: tus datos se guardan solo en tu teléfono
(`localStorage`) y la app funciona **offline**.

## ✨ Funciones

- **Contador de calorías** con meta diaria calculada según tu perfil
  (fórmula Mifflin-St Jeor). Base local de alimentos + entrada manual.
- **Juego de horarios**: comer dentro de la ventana de cada comida da puntos extra.
- **Agua**: vasos rápidos, meta diaria y recordatorios cada N horas.
- **Ejercicio**: registra tipo y duración; estima calorías quemadas (tabla MET).
- **Progreso**: gráfico de peso con línea de meta, calorías y ejercicio por semana.
- **Gamificación**: puntos, niveles, rachas, medallas, reto diario y mensajes
  motivacionales con confeti 🎉.
- **Notificaciones** para comer y beber agua (al instalar como PWA en iPhone).

## 🚀 Probar localmente

Necesitas servir los archivos por HTTP (el service worker no funciona con
`file://`):

```bash
python3 -m http.server 8080
# luego abre http://localhost:8080
```

## 📱 Instalar en el iPhone

1. Publica la app (ver abajo) y abre la URL en **Safari**.
2. Toca **Compartir** → **Agregar a inicio**.
3. Abre la app desde su ícono.
4. Entra a **Ajustes ⚙️ → Activar notificaciones** para recibir recordatorios.

> En iOS, las notificaciones del sistema solo llegan cuando la web está
> **instalada** en la pantalla de inicio (iOS 16.4+). Mientras no la instales,
> los recordatorios aparecen como avisos dentro de la app.

## 🌐 Publicar en GitHub Pages

1. En GitHub: **Settings → Pages**.
2. En *Build and deployment → Source*, elige **Deploy from a branch**.
3. Selecciona la rama `claude/weight-loss-tracker-app-sdejyg` (o `main` tras
   fusionar) y carpeta `/ (root)`. Guarda.
4. Espera el despliegue y abre la URL pública (algo como
   `https://<usuario>.github.io/test1/`) en tu iPhone.

## 🗂️ Estructura

```
index.html            Shell de la app (una sola página)
manifest.webmanifest  Metadatos PWA
sw.js                 Service worker (offline + notificaciones)
css/styles.css        Diseño mobile-first (tema oscuro, safe-area iPhone)
js/app.js             Arranque, router y vistas
js/store.js           Persistencia (localStorage) y modelo de datos
js/calc.js            BMR/TDEE, meta calórica, IMC, calorías de ejercicio
js/gamify.js          Puntos, niveles, rachas, logros
js/reminders.js       Horarios, recordatorios y notificaciones
js/foods.js           Base local de alimentos
js/exercises.js       Base local de ejercicios (valores MET)
js/charts.js          Gráficos SVG sin dependencias
js/ui.js              Helpers de UI (toasts, modales, confeti)
icons/                Iconos PWA
```

## 🔒 Privacidad

No hay cuentas ni servidores. Todos tus datos viven en tu dispositivo. Puedes
exportarlos/importarlos como JSON desde **Ajustes → Datos**.
