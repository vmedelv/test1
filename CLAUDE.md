# CLAUDE.md — RemindaClinic

Este archivo es el contexto permanente del proyecto. Claude Code lo lee en cada
sesión. Mantenlo actualizado a medida que el proyecto avanza.

## QUÉ ESTAMOS CONSTRUYENDO

RemindaClinic: un micro-SaaS que reduce las inasistencias (no-shows) de clínicas
y salones en LatAm. Envía un recordatorio automático por **WhatsApp** 24 horas
antes de cada cita y registra la confirmación del paciente.

Mercado inicial: Chile. Idioma de producto: español.

## OBJETIVO DEL MVP (no construir nada fuera de esto)

Flujo funcional end-to-end:
1. La clínica conecta su Google Calendar (OAuth).
2. Un job diario lee las citas del día siguiente.
3. Extrae el teléfono del paciente desde el evento.
4. Envía por WhatsApp: "Hola [Paciente], recordatorio: cita mañana a las [hora]
   con [Doctor] en [Clínica]. ¿Confirmas? Responde SÍ o NO."
5. Un webhook recibe la respuesta y actualiza el estado de la cita.
6. Un dashboard muestra: citas de mañana, confirmadas, canceladas, sin respuesta.

## STACK TÉCNICO

- Frontend/Dashboard: Next.js (App Router) + Tailwind CSS
- DB + Auth: Supabase (PostgreSQL)
- Calendario: Google Calendar API (OAuth 2.0, solo lectura de eventos)
- Mensajería: WhatsApp Cloud API de Meta (oficial). Plan B: Twilio.
- Cron/job diario: Supabase scheduled function (o Vercel Cron)
- Deploy: Vercel

## REGLAS DEL PROYECTO

- El canal de mensajería es WhatsApp, NUNCA SMS (salvo fallback explícito).
- Todo el texto de cara al usuario en español.
- Infraestructura del MVP por debajo de USD 100/mes.
- MVP mínimo: nada de features extra hasta que el flujo core funcione.
- No hardcodear secrets. Todo en variables de entorno (.env.local).
- Código comentado en español donde ayude a entender la lógica de negocio.
- Antes de escribir un módulo nuevo, esperar mi OK.

## PUNTOS CRÍTICOS DE LAS INTEGRACIONES (advertir siempre)

- **Google Calendar OAuth:** los tokens expiran; implementar refresh token.
  Definir un formato ESTÁNDAR para el teléfono del paciente dentro del evento
  (ej. campo en la descripción: "Tel: +569XXXXXXXX").
- **WhatsApp Cloud API:** requiere número de negocio verificado y plantillas de
  mensaje aprobadas por Meta (tarda días). El primer mensaje debe usar plantilla.
- **Webhook de respuestas:** validar la firma del webhook de Meta; manejar
  respuestas ambiguas ("dale", "ok", "no puedo") además de SÍ/NO estrictos.
- **Zona horaria:** las citas están en horario de Chile; cuidar UTC en el cron.

## MODELO DE DATOS (borrador — refinar en el paso 1)

- `clinics`: id, name, whatsapp_number, google_oauth_tokens, created_at
- `appointments`: id, clinic_id, patient_name, patient_phone, doctor_name,
  starts_at, status (pending | confirmed | cancelled | no_response), calendar_event_id
- `messages`: id, appointment_id, direction (out | in), body, sent_at, wa_message_id

## CÓMO QUIERO QUE TRABAJES (orden estricto)

1. Proponer la ARQUITECTURA completa (diagrama de flujo en texto) y el MODELO DE
   DATOS final de Supabase. NO escribir código todavía.
2. Listar los PASOS de implementación en orden, indicando qué debo configurar yo
   (cuentas, credenciales, permisos) en cada paso.
3. Construir un módulo a la vez, esperando mi OK antes de avanzar.
4. En cada integración, advertir de los puntos que suelen fallar.

## ESTADO ACTUAL

- [ ] Arquitectura y modelo de datos aprobados
- [ ] Setup del repo (Next.js + Supabase)
- [ ] OAuth Google Calendar
- [ ] Lectura de citas + extracción de teléfono
- [ ] Envío WhatsApp (plantilla aprobada)
- [ ] Webhook de respuestas
- [ ] Dashboard
- [ ] Job diario (cron)
- [ ] Prueba end-to-end con 1 clínica real
