# Demo funcional — Sistema de gestión y confirmación de horas de pacientes

Implementación mínima pero **end-to-end** del sistema descrito en
`docs/confirmacion-horas-pacientes/PROPUESTA.md`: sincronizar la agenda desde
SisMaule (simulado) → campaña multicanal de recordatorios → respuestas del
paciente → dashboard en tiempo real → cola de gestión manual → resultado
post-cita → KPIs. Sin build step, sin dependencias externas: solo Node.js
(mismo criterio que `demo-event-ticketing/` — este sandbox no tiene salida a
`registry.npmjs.org`, así que el servidor usa solo módulos nativos).

## La idea central: el tiempo es simulado

Una campaña de confirmación vive en escalas de días (recordatorio a T-72h,
refuerzo a T-48h, IVR a T-24h, gestión manual a T-12h). Para poder recorrerla
en minutos, el demo tiene un **reloj simulado** que se avanza con botones
desde el dashboard. Cada avance ejecuta, en orden:

1. **Sincronización con SisMaule**: citas nuevas, movidas o canceladas en la
   agenda maestra se reflejan en la réplica local (una cita movida reinicia su
   ciclo de confirmación y se re-notifica).
2. **Motor de campañas**: cada cita ejecuta a lo más el siguiente paso de su
   escalera si entró en la ventana correspondiente y el paciente no ha
   respondido: canal preferente (+email en paralelo) → canal alternativo →
   llamada IVR → cola de gestión manual.
3. **Cierre post-cita**: las citas cuya hora ya pasó reciben resultado
   (atendida / no se presentó). La probabilidad de asistencia es mayor si la
   cita estaba confirmada (92% vs 55%) — el efecto que los KPIs deben hacer
   visible.

## Cómo correrlo

```bash
cd demo-confirmacion-horas
node src/seed.js     # (opcional) reinicia los datos y reproduce ~30 h de operación
node src/server.js   # sirve en http://localhost:8788
```

Si la base está vacía, el servidor carga el escenario de demo solo. El botón
«Reiniciar demo» del dashboard hace lo mismo en caliente.

## Recorrido sugerido

1. **`/`** — el dashboard parte con todos los estados poblados: confirmadas,
   canceladas, sin respuesta, pendientes, una reprogramada y un paciente en la
   cola de gestión manual (Pedro Rojas, cuyos datos de contacto están malos).
   Haz clic en cualquier fila para ver el historial completo de contactos.
2. **`/paciente`** — elige a *Marta Núñez* (solo SMS). Verás sus recordatorios.
   Vuelve al dashboard, avanza el reloj **+6 h**: al entrar su cita en ventana
   de 24 h recibe la **llamada IVR**; respóndela con «Marcar 1 — Confirmar» y
   mira cómo la cita se mueve de columna en el dashboard abierto en otra
   pestaña (SSE, sin recargar).
3. **Cola de gestión manual** — registra una gestión sobre Pedro Rojas:
   confirmada/cancelada por teléfono, inubicable, o reprogramada con nueva
   fecha (crea la cita nueva en SisMaule y la enlaza a la original).
4. **`/sismaule`** — mueve una cita **+24 h** o cancélala en origen, luego
   pulsa «Sincronizar SisMaule» en el dashboard: la cita movida reinicia su
   ciclo y se re-notifica; la cancelada libera el cupo. Agenda también una
   cita nueva y observa cómo entra a la campaña.
5. **Avanza el reloj +12/+24 h varias veces** — las citas van pasando y
   generan resultados (atendida/NSP).
6. **`/kpis`** — tasa de confirmación, tasa de inasistencia, efectividad por
   canal (los envíos a datos inválidos cuentan como fallidos) y tasa de
   contacto con pacientes no contactables detectados.

## Qué es real en este demo (y qué no)

| Área | Estado |
|---|---|
| Máquina de estados de la cita (§3.2 de la propuesta) | Real, con historial auditable por cita |
| Escalera de campaña T-72h → T-48h → T-24h → manual | Real, dirigida por el reloj simulado |
| Selección de canal preferente/alternativo por paciente | Real |
| Acuses de entrega y detección de datos de contacto malos | Real (la validez del contacto se descubre al intentar la entrega) |
| Respuestas del paciente y reflejo en tiempo real (SSE) | Real |
| Cola de gestión manual con registro de operador | Real |
| Reprogramación enlazada (cita original ↔ nueva) | Real |
| KPIs calculados en vivo | Real |
| SisMaule | **Simulado** — una agenda maestra en la misma base; en producción sería un adaptador API/HL7/BD/batch (§6) |
| SMS / WhatsApp / email / IVR | **Simulados** — no hay proveedores reales; la página «Simulador de paciente» hace de teléfono del paciente |
| Resultado post-cita (atendida/NSP) | **Simulado** con probabilidades deterministas por cita |
| Autenticación, RBAC, auditoría de accesos (§7) | No implementados en el demo |

## Estructura

```
src/core.js      Reglas de negocio (UMD: mismo código en Node y navegador)
src/store.js     Persistencia en data/db.json
src/server.js    Servidor HTTP + router + SSE (sin framework)
src/seed.js      Reinicia datos y reproduce el escenario de demo
public/          Front-end (HTML + JS vanilla, sin build step)
```
