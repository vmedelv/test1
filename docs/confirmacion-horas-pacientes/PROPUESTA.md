# Sistema de Gestión y Confirmación de Horas de Pacientes — Propuesta Técnica

> Propuesta técnica elaborada en base al prompt de requerimientos del sistema.
> Contexto fijado: **Chile, red asistencial del Servicio de Salud del Maule**,
> con integración a **SisMaule** como sistema maestro de agenda.

## 0. Supuestos y variables abiertas

El prompt original deja varios puntos "[a ajustar]". Aquí se fijan explícitamente;
donde no hay dato de negocio confirmado se marca como **[supuesto]** y debe
validarse con la contraparte antes de comprometerse contractualmente.

| Variable | Resolución |
|---|---|
| Objetivo del documento | **Propuesta técnica** (primera opción del prompt). Incluye arquitectura de referencia y especificaciones funcionales de alto nivel; no reemplaza a las especificaciones formales detalladas, que serían un entregable posterior. |
| País / normativa | **Chile**: Ley 19.628 (datos personales), Ley 21.719 (nueva ley de protección de datos, vigencia escalonada hasta dic. 2026), Ley 20.584 (derechos y deberes de pacientes, ficha clínica), normas técnicas MINSAL sobre seguridad de la información. |
| Sistema de agenda maestro | **SisMaule** es la fuente de verdad de citas y pacientes. El sistema propuesto NO agenda directamente: lee la agenda, gestiona confirmaciones y devuelve estados. **[supuesto]** — si SisMaule permite escritura de estados vía interfaz, se sincronizan de vuelta; si no, se opera en modo espejo con exportes. Ver §6. |
| Canales mínimos | Se proponen **4 canales**: SMS, correo electrónico, WhatsApp (API de WhatsApp Business) e IVR saliente automatizado, con registro de gestión telefónica manual como quinto canal de respaldo. El mínimo contractual exigido (2) queda cubierto con SMS + email desde el día 1; WhatsApp e IVR se activan en fase 2 por sus plazos de habilitación comercial. |
| Volumen de diseño | **[supuesto]** red de tamaño Servicio de Salud regional: ~1.500.000 citas/año (~6.000 citas/día hábil), picos de envío de 20.000–30.000 mensajes/día al recordar con 48 y 24 h de anticipación. |
| Proveedores de mensajería | **[supuesto]** agregador SMS con cobertura nacional (ej. Twilio, Infobip, o proveedor local adjudicado en ChileCompra), WhatsApp Business Platform vía BSP oficial, SMTP transaccional (SES/SendGrid), telefonía IVR vía SIP trunk o CPaaS. Se diseña con capa de abstracción para poder cambiar de proveedor sin tocar la lógica (§3.4). |
| Modalidad de despliegue | **[supuesto]** nube pública con residencia de datos en región sudamericana, o datacenter institucional si la política del Servicio lo exige. La arquitectura (§2) es agnóstica; el costo y el plan de soporte cambian según la opción. |

---

## 1. Resumen ejecutivo

Se propone un **sistema satélite de confirmación de horas** que se acopla a
SisMaule sin reemplazarlo: sincroniza la agenda y los datos de contacto de
pacientes, ejecuta **campañas automáticas de recordatorio y confirmación por
múltiples canales** (SMS, email, WhatsApp, IVR), interpreta las respuestas de
los pacientes, y expone un **dashboard operativo en tiempo real** más un
**módulo de KPIs** para gestión.

El valor central: reducir la **tasa de inasistencia (NSP — "no show")**,
liberar cupos cancelados con anticipación para reasignación, y disminuir la
carga del call center concentrando la gestión telefónica manual solo en los
pacientes que no responden por canales automáticos.

Enfoque de entrega: **MVP vertical en 3–4 meses** (sincronización de agenda +
recordatorios SMS/email + captura de respuestas + dashboard básico), y luego
fases que agregan WhatsApp, IVR, reprogramación asistida y analítica avanzada.
La integración con SisMaule es el hito crítico de ruta: se aborda en la
fase 0 con un piloto de conectividad, y el **certificado de integración** se
emite como entregable formal del protocolo de pruebas conjunto (§6.4).

---

## 2. Arquitectura de referencia

### 2.1 Vista de componentes

```
                 ┌────────────────────────────────────────────┐
                 │                 SisMaule                    │
                 │   (agenda maestra, pacientes, boxes)        │
                 └──────┬──────────────────────────▲──────────┘
                        │ citas + pacientes         │ estados de confirmación
                        ▼                           │ (según capacidad de escritura)
              ┌───────────────────────────────────────────────┐
              │        Capa de Integración (§6)               │
              │  adaptadores HL7 v2 / FHIR / API REST /       │
              │  vistas BD / archivos batch — según lo que    │
              │  exponga SisMaule                             │
              └──────┬────────────────────────────────────────┘
                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                     Núcleo del sistema                        │
   │                                                              │
   │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
   │  │  Réplica    │  │  Motor de    │  │  Máquina de estados  │  │
   │  │  local de   │─▶│  campañas y  │─▶│  de la cita          │  │
   │  │  agenda     │  │  reglas (§3) │  │  (§3.2)              │  │
   │  └────────────┘  └──────┬───────┘  └──────────▲───────────┘  │
   │                         │ colas (jobs)         │ respuestas   │
   │                         ▼                      │              │
   │              ┌─────────────────────────────────┴───────────┐  │
   │              │   Capa de canales (abstracción §3.4)        │  │
   │              │  SMS │ Email │ WhatsApp │ IVR │ gestión     │  │
   │              │      │       │          │     │ manual      │  │
   │              └─────────────────────────────────────────────┘  │
   │                                                              │
   │  ┌─────────────────────────┐  ┌───────────────────────────┐  │
   │  │  Dashboard operativo    │  │  KPIs / reportería (§5)   │  │
   │  │  tiempo real (§4)       │  │                           │  │
   │  └─────────────────────────┘  └───────────────────────────┘  │
   └──────────────────────────────────────────────────────────────┘
```

### 2.2 Stack sugerido

**[supuesto]** — negociable según el estándar tecnológico de la institución:

- **Backend**: servicios en Node.js/TypeScript (NestJS) o Java/Spring Boot;
  API REST interna documentada con OpenAPI.
- **Base de datos**: PostgreSQL (transaccional) + réplica de lectura para
  reportería. Redis para colas, caché y estado del dashboard en tiempo real.
- **Colas / workers**: los envíos y reintentos son asíncronos (BullMQ,
  RabbitMQ o SQS). Ningún envío se hace en el hilo de la petición.
- **Frontend**: SPA (React/Next.js) con WebSockets o SSE para el refresco en
  tiempo real del dashboard.
- **Infraestructura**: contenedores (Docker/Kubernetes o ECS), infra como
  código, ambientes separados de desarrollo/QA/producción.

---

## 3. Confirmación de horas por múltiples canales (RF-1)

### 3.1 Flujo de campaña tipo

1. **T-72 h**: primer recordatorio por el canal preferente del paciente
   (regla por defecto **[supuesto]**: WhatsApp si tiene número móvil validado;
   si no, SMS; email en paralelo si existe).
2. **T-48 h**: si no hay respuesta, segundo intento por canal alternativo.
3. **T-24 h**: si sigue sin respuesta, IVR saliente automatizado
   ("presione 1 para confirmar, 2 para cancelar, 3 para reprogramar").
4. **T-24 h → T-4 h**: los aún no contactados entran a la **cola de gestión
   manual** del call center, priorizados por especialidad/criticidad.
5. Cancelaciones capturadas liberan el cupo y disparan notificación al
   equipo de agenda (o a lista de espera, fase 3).

Los tiempos, el orden de canales, el número de intentos y las plantillas de
mensaje son **configurables por establecimiento, especialidad y tipo de cita**
(primera consulta vs. control, procedimiento con preparación previa, etc.).

### 3.2 Máquina de estados de la cita

```
AGENDADA ──▶ NOTIFICADA ──▶ CONFIRMADA
                │               │
                ├──▶ CANCELADA ─┼──▶ (cupo liberado)
                ├──▶ REPROGRAMACIÓN_SOLICITADA ──▶ REPROGRAMADA
                └──▶ SIN_RESPUESTA ──▶ GESTIÓN_MANUAL ──▶ (confirmada/cancelada/inubicable)
                                                              │
Post-cita (desde SisMaule): ATENDIDA │ NO_SE_PRESENTÓ (NSP) ◀─┘
```

Cada transición queda registrada con timestamp, canal, contenido del mensaje
enviado/recibido y operador (si fue manual) — esto alimenta el dashboard, los
KPIs y la trazabilidad de auditoría.

### 3.3 Gestión de respuestas por canal

| Canal | Envío | Captura de respuesta |
|---|---|---|
| SMS | Plantilla corta con folio | Respuesta por palabra clave ("SI"/"NO") vía número corto o long code; alternativa: link corto a página de confirmación de un toque. |
| Email | Plantilla HTML institucional | Botones "Confirmar / Cancelar / Reprogramar" que llevan a página con token de un solo uso (sin login). |
| WhatsApp | Plantilla HSM aprobada por Meta, con botones de respuesta rápida | Botones interactivos nativos; ventana de sesión de 24 h para preguntas frecuentes con árbol de opciones. |
| IVR | Llamada saliente con texto-a-voz o audio grabado | DTMF (1 = confirmar, 2 = cancelar, 3 = reprogramar → transfiere o registra callback). |
| Manual | Llamada del call center | El operador registra el resultado en el sistema con tipificación estándar. |

Reglas transversales: identidad verificada por coincidencia de número/correo
registrado + folio de cita (nunca se expone RUT completo ni diagnóstico en el
mensaje, ver §7); opt-out respetado por canal; deduplicación para no
bombardear a un paciente con varias citas en la misma semana.

### 3.4 Capa de abstracción de canales

Cada canal se implementa detrás de una interfaz común
(`enviar(mensaje) → acuse`, webhook `respuesta_recibida`), con proveedores
intercambiables por configuración. Esto evita el lock-in con el CPaaS y
permite adjudicar proveedores de mensajería por licitación sin re-desarrollo.
Todos los acuses de entrega (enviado / entregado / fallido / rebotado) se
persisten: son insumo del KPI de efectividad por canal (§5).

---

## 4. Dashboard de gestión de pacientes (RF-2)

Vista principal ("hoy + próximos 7 días", filtrable por establecimiento,
especialidad, profesional y canal):

- **Tarjetas de resumen** con cantidades y porcentaje: confirmadas,
  canceladas, sin respuesta, pendientes de primer contacto, reprogramadas.
- **Listado operable** por cada estado: paciente (nombre + RUT enmascarado),
  cita (fecha/hora, especialidad, profesional, establecimiento), historial de
  contactos (qué se envió, por dónde, qué respondió). Desde el listado el
  operador puede: reenviar recordatorio, registrar gestión telefónica,
  marcar confirmación/cancelación manual.
- **Cola de "no contactados"**: bandeja de trabajo del call center, ordenada
  por proximidad de la cita y prioridad clínica, con asignación por operador
  para evitar dobles llamadas.
- **Actualización en tiempo real** (WebSocket/SSE): las respuestas entrantes
  mueven al paciente de columna sin recargar la página.
- **Trazabilidad de reprogramadas**: vínculo entre la cita original y la
  nueva, para seguimiento y para no contar doble en los KPIs.

Perfiles de acceso: administrativo de agenda (su establecimiento), jefe de
SOME/ambulatorio (todos los establecimientos de su dependencia), gestión
central del Servicio (agregado de la red), TI (configuración). Ver §7.

---

## 5. Indicadores de gestión (RF-3)

| KPI | Fórmula | Corte sugerido |
|---|---|---|
| Tasa de confirmación | confirmadas / total agendado del período | Día, semana, mes; por establecimiento, especialidad, canal. |
| Tasa de inasistencia (NSP) | no se presentó sin cancelar / total agendado | Ídem; con comparación contra línea base pre-implementación. |
| Efectividad por canal | respuestas / mensajes entregados, y confirmaciones / respuestas, por canal | Permite redirigir presupuesto de mensajería al canal que rinde. |
| Tasa de contacto | pacientes con ≥1 acuse de entrega / total | Detecta calidad de los datos de contacto (números malos, correos inválidos). |
| Anticipación de cancelación | horas promedio entre cancelación y cita | Mide cuánto cupo queda reutilizable. |
| Cupos recuperados | citas canceladas con ≥24 h que fueron reasignadas | KPI de impacto económico directo (fase con lista de espera). |

Entrega: panel de indicadores en el mismo frontend, exportación a
CSV/Excel, y **[supuesto]** conexión de la réplica de lectura a la
herramienta BI institucional (Power BI) si existe. Los KPIs se calculan sobre
datos consolidados (cierre diario) para que no bailen con el tiempo real.

---

## 6. Integración con SisMaule (RF-4)

Este es el riesgo técnico n.º 1 del proyecto y se trata como tal.

### 6.1 Lo que se necesita de SisMaule

- **Lectura**: citas (paciente, fecha/hora, especialidad, profesional,
  establecimiento, tipo de cita, estado), datos de contacto del paciente
  (teléfonos, correo), y estado post-cita (atendida / NSP) para cerrar el
  ciclo de los KPIs.
- **Escritura (deseable)**: estado de confirmación/cancelación de vuelta a la
  agenda, para que el personal que solo mira SisMaule vea la información.

### 6.2 Estrategia de adaptadores (de mejor a peor caso)

1. **API / servicios web** que exponga SisMaule (REST o SOAP): integración
   directa, sincronización incremental cada pocos minutos + webhooks si
   existen.
2. **Mensajería estándar salud**: HL7 v2 (SIU^S12 y familia para agendas) o
   HL7 FHIR (recursos `Appointment`, `Patient`) si la plataforma o su bus de
   integración lo soportan.
3. **Vistas de base de datos de solo lectura** autorizadas por el
   administrador de la plataforma, con CDC o polling.
4. **Peor caso — batch**: exporte/importe de archivos programado (cada 1–4 h)
   vía SFTP. El sistema funciona igual, con menor frescura; las
   cancelaciones capturadas se devuelven en archivo de retorno para carga.

La capa de integración aísla el adaptador: el resto del sistema no sabe ni le
importa cuál de los 4 mecanismos está activo.

**Pendiente de definición (bloqueante)**: qué interfaces expone realmente
SisMaule y quién autoriza el acceso (Servicio de Salud / proveedor de la
plataforma). La **fase 0** del plan (§9) es exactamente responder esto con un
piloto de conectividad en ambiente de pruebas.

### 6.3 Sincronización

- Réplica local de agenda con marca de agua incremental; reconciliación
  completa nocturna para detectar citas creadas/movidas/eliminadas fuera del
  flujo incremental.
- Idempotencia por identificador de cita de SisMaule; los conflictos
  (cita movida después de confirmada) disparan re-notificación automática al
  paciente con la nueva fecha.
- Monitoreo del lag de sincronización con alerta si supera el umbral
  (**[supuesto]** 15 min en modo API, 1 ciclo en modo batch).

### 6.4 Certificado de integración

Un "certificado de integración exitosa" no es un documento que se pueda
adjuntar de antemano: se **emite como entregable del proyecto**, al aprobar
un **protocolo de pruebas de integración conjunto** (casos de prueba
acordados: sincronización de citas, actualización de estados, tolerancia a
caídas, volumen), firmado por el proveedor, el referente técnico del Servicio
de Salud y —si corresponde— el proveedor de SisMaule. Si el proceso de compra
exige experiencia previa demostrable, debe solicitarse al oferente evidencia
de integraciones equivalentes (HIS/agenda hospitalaria) como referencia,
además del certificado propio del proyecto en su hito de fase 0/1.

---

## 7. Seguridad y cumplimiento normativo

- **Marco legal**: Ley 19.628 y Ley 21.719 (protección de datos; los datos de
  salud son **datos sensibles** — base de licitud, minimización, derechos
  ARCO+), Ley 20.584 (confidencialidad de la ficha clínica). Los mensajes al
  paciente **nunca incluyen diagnóstico ni motivo clínico detallado**: solo
  especialidad genérica, fecha/hora, lugar e instrucciones.
- **Minimización en canales**: RUT enmascarado, sin datos clínicos en SMS/
  WhatsApp/email; el detalle vive detrás del enlace con token de un solo uso
  y expiración.
- **Cifrado**: TLS 1.2+ en tránsito (incluida la conexión a SisMaule),
  cifrado en reposo (discos y backups), secretos en bóveda (no en código).
- **Control de acceso**: SSO institucional si existe (**[supuesto]** AD/LDAP
  del Servicio), MFA para perfiles administrativos, RBAC por establecimiento
  y función, sesiones con expiración.
- **Auditoría**: registro inmutable de accesos a datos de pacientes y de toda
  acción de operador (quién vio/gestionó qué y cuándo), exportable para
  fiscalización.
- **Resguardo operacional**: backups diarios cifrados con prueba de
  restauración trimestral; RPO ≤ 24 h, RTO ≤ 8 h **[supuesto — ajustar a
  exigencia de bases]**.
- **Proveedores de mensajería**: contratos de encargado de tratamiento;
  evaluación de que el BSP de WhatsApp y el agregador SMS cumplan el estándar
  exigible para datos sensibles.

## 8. Escalabilidad

- Envíos desacoplados por colas: los picos (20–30 mil mensajes en la ventana
  de la mañana) se absorben con workers horizontales; el rate limit por
  proveedor se gestiona en la capa de canal.
- Base transaccional dimensionada para ~1,5 M citas/año con particionado por
  fecha; reportería sobre réplica de lectura para no competir con la
  operación.
- Arquitectura multi-establecimiento desde el día 1 (un despliegue sirve a
  toda la red del Servicio); escalar a otro Servicio de Salud = nuevo tenant
  o nuevo despliegue, sin re-desarrollo.
- Pruebas de carga como criterio de aceptación de fase 1 (**[supuesto]**
  objetivo: 50 mensajes/seg sostenidos, dashboard < 2 s con 10.000 citas del
  día en pantalla).

## 9. Plan de implementación

| Fase | Contenido | Duración estimada |
|---|---|---|
| **0. Descubrimiento e integración** | Levantamiento de interfaces reales de SisMaule, accesos, piloto de conectividad en ambiente de pruebas, protocolo de certificación acordado. | 4–6 semanas |
| **1. MVP** | Sincronización de agenda, campañas SMS + email, captura de respuestas, máquina de estados, dashboard operativo básico, KPIs de confirmación y NSP. Piloto en 1–2 establecimientos. | 8–10 semanas |
| **2. Canales avanzados** | WhatsApp Business (aprobación de plantillas incluida), IVR saliente, cola de gestión manual con asignación, escritura de estados hacia SisMaule (si es viable). Certificado de integración emitido. | 6–8 semanas |
| **3. Optimización** | Reprogramación autoservicio, reasignación de cupos a lista de espera, reglas por riesgo de NSP (priorizar gestión sobre pacientes con historial de inasistencia), BI avanzado. | continuo |

## 10. Soporte y mantenimiento

**[supuesto — estructura estándar, ajustar a bases de licitación]**

- **Mesa de ayuda** en horario hábil (8:00–18:00) para incidencias
  funcionales; canal de emergencia 24/7 para caída total del servicio.
- **SLA sugeridos**: disponibilidad mensual ≥ 99,5 %; incidente crítico
  (sistema caído o sin envíos): respuesta ≤ 1 h, resolución objetivo ≤ 8 h;
  incidente mayor: respuesta ≤ 4 h; menor: ≤ 1 día hábil.
- **Mantenimiento**: correctivo incluido; evolutivo por bolsa de horas o
  roadmap acordado; ventanas de mantención programadas fuera de horario de
  envío de campañas.
- **Monitoreo proactivo**: alertas sobre lag de sincronización con SisMaule,
  tasa de fallo de envíos por canal y salud de la plataforma, con reporte
  mensual de niveles de servicio.
- **Capacitación**: sesiones por perfil (operadores, jefaturas, TI), manuales
  y videos cortos; ambiente de capacitación con datos ficticios.

## 11. Pendientes de definición (checklist para la contraparte)

1. Interfaces reales disponibles de SisMaule (API / HL7 / BD / batch) y
   procedimiento de autorización de acceso — **bloqueante de fase 0**.
2. ¿SisMaule acepta escritura de estados de confirmación, o se opera en modo
   espejo?
3. Volúmenes reales (citas/año, establecimientos, especialidades) para
   dimensionar infraestructura y costos de mensajería.
4. Política institucional de despliegue (nube pública vs. datacenter propio)
   y exigencias de residencia de datos.
5. Presupuesto de mensajería (el costo por SMS/WhatsApp/minuto IVR es el
   principal costo variable del sistema).
6. Titularidad del número corto SMS y de la línea WhatsApp Business
   (institucional vs. del proveedor).
7. Criterios de priorización clínica para la cola de gestión manual.
8. Formato exacto exigido del certificado de integración en las bases.
