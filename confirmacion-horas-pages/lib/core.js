'use strict';

// Reglas de negocio del demo de confirmación de horas (ver
// docs/confirmacion-horas-pacientes/PROPUESTA.md). UMD: el mismo archivo
// corre en Node (src/server.js) y en el navegador (build estático para
// GitHub Pages), inyectando el store que corresponda.
//
// El tiempo es SIMULADO: db.simNow avanza solo con avanzarReloj(). Eso
// permite recorrer el ciclo completo de una campaña (T-72h → T-48h →
// T-24h → gestión manual → resultado post-cita) en minutos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConfirmaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HORA = 3600 * 1000;

  class DomainError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  // Escalera de intentos de la campaña (§3.1 de la propuesta). Cada cita
  // ejecuta a lo más un paso por pasada del motor: el paso siguiente de la
  // escalera se dispara cuando la cita entra en su ventana de horas y el
  // paciente aún no responde.
  const PASOS = [
    { n: 1, h: 72, tipo: 'inicial' }, // canal preferente (+ email en paralelo)
    { n: 2, h: 48, tipo: 'alternativo' }, // canal alternativo
    { n: 3, h: 24, tipo: 'ivr' }, // llamada IVR automatizada
    { n: 4, h: 12, tipo: 'manual' }, // escala a cola de gestión manual
  ];

  const ACTIVAS_CAMPANIA = ['AGENDADA', 'NOTIFICADA', 'SIN_RESPUESTA'];
  const RESPONDIBLES = [
    'AGENDADA',
    'NOTIFICADA',
    'SIN_RESPUESTA',
    'GESTION_MANUAL',
    'INUBICABLE',
    'REPROGRAMACION_SOLICITADA',
  ];

  const CANAL_LABEL = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', ivr: 'IVR' };

  const RESPUESTA_TEXTO = {
    confirmar: { texto: 'CONFIRMAR', ivr: 'Marcó 1 (confirmar)' },
    cancelar: { texto: 'CANCELAR', ivr: 'Marcó 2 (cancelar)' },
    reprogramar: { texto: 'REPROGRAMAR', ivr: 'Marcó 3 (reprogramar)' },
  };

  // Hash determinista → [0,1). Se usa para resolver asistencia/NSP de las
  // citas pasadas de forma estable (misma cita, mismo resultado).
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h / 4294967296;
  }

  // Enmascara todos los dígitos del RUT salvo los últimos 4 (§7: nunca se
  // muestra el RUT completo en pantallas operativas ni mensajes).
  function maskRut(rut) {
    return String(rut).replace(/\d(?=(?:\D*\d){4})/g, '•');
  }

  function createDomain(store) {
    const db = store.db;

    const paciente = (id) => {
      const p = db.pacientes.find((x) => x.id === id);
      if (!p) throw new DomainError('Paciente no encontrado.', 404);
      return p;
    };
    const citaById = (id) => {
      const c = db.citas.find((x) => x.id === id);
      if (!c) throw new DomainError('Cita no encontrada.', 404);
      return c;
    };

    // Lo que el sistema SABE a priori del paciente (tiene móvil, tiene
    // email, declaró WhatsApp). La validez real del dato solo se descubre
    // al intentar la entrega — igual que en producción.
    function canalDisponible(p, canal) {
      if (canal === 'whatsapp') return !!(p.movil && p.tieneWhatsapp);
      if (canal === 'sms' || canal === 'ivr') return !!p.movil;
      if (canal === 'email') return !!p.email;
      return false;
    }

    // Resultado simulado del proveedor de mensajería/telefonía.
    function resultadoEntrega(p, canal) {
      if (canal === 'email') return p.emailValido ? 'entregado' : 'fallido';
      if (canal === 'whatsapp') return p.movilValido && p.tieneWhatsapp ? 'entregado' : 'fallido';
      return p.movilValido ? 'entregado' : 'fallido'; // sms / ivr
    }

    function canalPreferente(p) {
      for (const c of ['whatsapp', 'sms', 'email']) if (canalDisponible(p, c)) return c;
      return null;
    }

    function canalAlternativo(p, usados) {
      for (const c of ['sms', 'whatsapp', 'email']) {
        if (!usados.includes(c) && canalDisponible(p, c)) return c;
      }
      return canalPreferente(p);
    }

    // Sin datos clínicos ni RUT en el contenido del mensaje (§7).
    function textoRecordatorio(p, cita, canal) {
      const nombre = p.nombre.split(' ')[0];
      const fecha = new Date(cita.fechaHora).toISOString();
      if (canal === 'ivr') {
        return (
          `Llamada automática: ${nombre}, le recordamos su hora de ${cita.especialidad} ` +
          `(folio ${cita.folio}). Presione 1 para confirmar, 2 para cancelar, 3 para reprogramar.`
        );
      }
      return (
        `${nombre}, le recordamos su hora de ${cita.especialidad} en ${cita.establecimiento} ` +
        `(folio ${cita.folio}, ${fecha.slice(0, 10)}). Puede confirmar, cancelar o pedir reprogramación.`
      );
    }

    function log(cita, ts, texto, operador) {
      cita.historial.push({ ts, texto, operador: operador || null });
    }

    function enviar(cita, p, canal, ts, etiqueta) {
      const m = {
        id: store.id('msg'),
        citaId: cita.id,
        pacienteId: p.id,
        canal,
        direccion: 'saliente',
        etiqueta,
        contenido: textoRecordatorio(p, cita, canal),
        estadoEntrega: resultadoEntrega(p, canal),
        ts,
        respuesta: null,
        respuestaTs: null,
      };
      db.mensajes.push(m);
      log(cita, ts, `${etiqueta} por ${CANAL_LABEL[canal]}: ${m.estadoEntrega}`);
      return m;
    }

    function nextFolio() {
      db.folioSeq += 1;
      return `C-${db.folioSeq}`;
    }

    function citaActiva(c) {
      return !c.resultadoFinal && c.fechaHora > db.simNow && !['CANCELADA', 'REPROGRAMADA'].includes(c.estado);
    }

    function citaRespondable(c) {
      return citaActiva(c) && RESPONDIBLES.includes(c.estado);
    }

    // ---------- Sincronización con SisMaule (simulado) ----------

    function sincronizar(ts) {
      let nuevas = 0;
      let actualizadas = 0;
      for (const m of db.maestro) {
        const r = db.citas.find((c) => c.sismauleId === m.id);
        if (!r) {
          if (m.canceladaEnOrigen || m.fechaHora <= ts) continue;
          const nueva = {
            id: store.id('cita'),
            sismauleId: m.id,
            folio: nextFolio(),
            pacienteId: m.pacienteId,
            fechaHora: m.fechaHora,
            especialidad: m.especialidad,
            profesional: m.profesional,
            establecimiento: m.establecimiento,
            estado: 'AGENDADA',
            resultadoFinal: null,
            intentos: [],
            historial: [],
            canceladaEn: null,
            reprogramadaDe: null,
            reprogramadaA: null,
          };
          db.citas.push(nueva);
          log(nueva, ts, 'Cita sincronizada desde SisMaule');
          nuevas += 1;
          continue;
        }
        if (!citaActiva(r)) continue;
        if (m.canceladaEnOrigen) {
          r.estado = 'CANCELADA';
          r.canceladaEn = ts;
          log(r, ts, 'Cita cancelada en SisMaule (origen); cupo liberado');
          actualizadas += 1;
        } else if (m.fechaHora !== r.fechaHora) {
          // Cita movida en la agenda maestra: se reinicia el ciclo completo
          // de confirmación (aunque estuviera confirmada) y se re-notifica.
          r.fechaHora = m.fechaHora;
          r.estado = 'AGENDADA';
          r.intentos = [];
          log(r, ts, 'Cita movida en SisMaule; se reinicia el ciclo de confirmación');
          actualizadas += 1;
        }
      }
      db.lastSyncAt = ts;
      return { nuevas, actualizadas };
    }

    // ---------- Motor de campañas ----------

    function procesar(ts) {
      for (const cita of db.citas) {
        if (cita.resultadoFinal || !ACTIVAS_CAMPANIA.includes(cita.estado)) continue;
        if (cita.fechaHora <= ts) continue;
        const horas = (cita.fechaHora - ts) / HORA;
        const paso = PASOS[cita.intentos.length];
        if (!paso || horas > paso.h) continue;

        const p = paciente(cita.pacienteId);
        const usados = cita.intentos.flatMap((i) => i.canales);
        const canales = [];

        if (paso.tipo === 'inicial') {
          const c = canalPreferente(p);
          if (c) {
            enviar(cita, p, c, ts, 'Recordatorio inicial');
            canales.push(c);
            if (c !== 'email' && canalDisponible(p, 'email')) {
              enviar(cita, p, 'email', ts, 'Recordatorio inicial (copia)');
              canales.push('email');
            }
            cita.estado = 'NOTIFICADA';
          } else {
            cita.estado = 'GESTION_MANUAL';
            log(cita, ts, 'Sin datos de contacto utilizables; escalada directa a gestión manual');
          }
        } else if (paso.tipo === 'alternativo') {
          const c = canalAlternativo(p, usados);
          if (c) {
            enviar(cita, p, c, ts, 'Recordatorio de refuerzo');
            canales.push(c);
          }
        } else if (paso.tipo === 'ivr') {
          if (canalDisponible(p, 'ivr')) {
            enviar(cita, p, 'ivr', ts, 'Llamada IVR');
            canales.push('ivr');
            cita.estado = 'SIN_RESPUESTA';
          } else {
            cita.estado = 'GESTION_MANUAL';
            log(cita, ts, 'Paciente sin teléfono para IVR; escalada a gestión manual');
          }
        } else if (paso.tipo === 'manual') {
          cita.estado = 'GESTION_MANUAL';
          log(cita, ts, `Sin respuesta tras ${cita.intentos.length} intentos; entra a cola de gestión manual`);
        }

        cita.intentos.push({ n: paso.n, tipo: paso.tipo, ts, canales });
      }
    }

    // Cierre del ciclo: cuando el reloj pasa la hora de la cita, "SisMaule"
    // informa el resultado. La probabilidad de asistencia depende de si la
    // cita estaba confirmada — es el efecto que el sistema busca medir.
    function resolverPasadas(ts) {
      for (const r of db.citas) {
        if (r.resultadoFinal || r.fechaHora > ts) continue;
        if (['CANCELADA', 'REPROGRAMADA'].includes(r.estado)) continue;
        const pAsiste = r.estado === 'CONFIRMADA' ? 0.92 : 0.55;
        r.resultadoFinal = hash01(r.id) < pAsiste ? 'ATENDIDA' : 'NSP';
        log(
          r,
          ts,
          `Resultado informado por SisMaule: ${r.resultadoFinal === 'ATENDIDA' ? 'paciente atendido' : 'no se presentó (NSP)'}`
        );
        const m = db.maestro.find((x) => x.id === r.sismauleId);
        if (m) m.resultado = r.resultadoFinal;
      }
    }

    // ---------- API ----------

    const api = {};
    api.DomainError = DomainError;

    api.estado = () => ({ simNow: db.simNow, lastSyncAt: db.lastSyncAt });

    api.avanzarReloj = (horas) => {
      const h = Number(horas);
      if (!Number.isFinite(h) || h < 1 || h > 24 * 7) {
        throw new DomainError('Horas inválidas: indique un valor entre 1 y 168.');
      }
      db.simNow += h * HORA;
      sincronizar(db.simNow);
      procesar(db.simNow);
      resolverPasadas(db.simNow);
      store.persist();
      return api.estado();
    };

    api.sincronizarAhora = () => {
      const r = sincronizar(db.simNow);
      procesar(db.simNow);
      store.persist();
      return Object.assign({ lastSyncAt: db.lastSyncAt }, r);
    };

    function vistaCita(c) {
      const p = paciente(c.pacienteId);
      const deFolio = c.reprogramadaDe ? (db.citas.find((x) => x.id === c.reprogramadaDe) || {}).folio : null;
      const aFolio = c.reprogramadaA ? (db.citas.find((x) => x.id === c.reprogramadaA) || {}).folio : null;
      return {
        id: c.id,
        folio: c.folio,
        paciente: p.nombre,
        rut: maskRut(p.rut),
        fechaHora: c.fechaHora,
        horasRestantes: Math.round(((c.fechaHora - db.simNow) / HORA) * 10) / 10,
        especialidad: c.especialidad,
        profesional: c.profesional,
        establecimiento: c.establecimiento,
        estado: c.estado,
        resultadoFinal: c.resultadoFinal,
        nIntentos: c.intentos.length,
        canalesIntentados: [...new Set(c.intentos.flatMap((i) => i.canales))],
        canalesDisponibles: ['whatsapp', 'sms', 'email', 'ivr'].filter((x) => canalDisponible(p, x)),
        reprogramadaDeFolio: deFolio,
        reprogramadaAFolio: aFolio,
        historial: c.historial.slice().reverse(),
      };
    }

    api.dashboard = () => {
      const now = db.simNow;
      const orden = (a, b) => a.fechaHora - b.fechaHora;
      const activas = db.citas
        .filter((c) => !c.resultadoFinal && c.fechaHora > now && c.estado !== 'REPROGRAMADA')
        .sort(orden);

      const buckets = { confirmadas: [], canceladas: [], sinRespuesta: [], pendientes: [] };
      for (const c of activas) {
        if (c.estado === 'CONFIRMADA') buckets.confirmadas.push(c);
        else if (c.estado === 'CANCELADA') buckets.canceladas.push(c);
        else if (['SIN_RESPUESTA', 'GESTION_MANUAL', 'INUBICABLE'].includes(c.estado)) buckets.sinRespuesta.push(c);
        else buckets.pendientes.push(c);
      }
      const reprogramadas = db.citas.filter((c) => c.estado === 'REPROGRAMADA').sort(orden);
      const colaManual = activas.filter((c) => c.estado === 'GESTION_MANUAL');
      const resueltas = db.citas
        .filter((c) => c.resultadoFinal)
        .sort((a, b) => b.fechaHora - a.fechaHora)
        .slice(0, 12);

      return {
        reloj: now,
        lastSyncAt: db.lastSyncAt,
        resumen: {
          confirmadas: buckets.confirmadas.length,
          canceladas: buckets.canceladas.length,
          sinRespuesta: buckets.sinRespuesta.length,
          pendientes: buckets.pendientes.length,
          reprogramadas: reprogramadas.length,
          colaManual: colaManual.length,
          activas: activas.length,
        },
        listas: {
          confirmadas: buckets.confirmadas.map(vistaCita),
          canceladas: buckets.canceladas.map(vistaCita),
          sinRespuesta: buckets.sinRespuesta.map(vistaCita),
          pendientes: buckets.pendientes.map(vistaCita),
        },
        reprogramadas: reprogramadas.map(vistaCita),
        colaManual: colaManual.map(vistaCita),
        resueltas: resueltas.map(vistaCita),
      };
    };

    api.pacientes = () =>
      db.pacientes.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        rut: p.rut,
        movil: p.movil,
        movilValido: p.movilValido,
        email: p.email,
        emailValido: p.emailValido,
        tieneWhatsapp: p.tieneWhatsapp,
      }));

    api.inbox = (pacienteId) => {
      const p = paciente(pacienteId);
      const mensajes = db.mensajes
        .filter((m) => m.pacienteId === p.id && m.direccion === 'saliente' && m.estadoEntrega === 'entregado')
        .sort((a, b) => b.ts - a.ts)
        .map((m) => {
          const c = citaById(m.citaId);
          return {
            id: m.id,
            canal: m.canal,
            etiqueta: m.etiqueta,
            contenido: m.contenido,
            ts: m.ts,
            respuesta: m.respuesta,
            respuestaTs: m.respuestaTs,
            puedeResponder: !m.respuesta && citaRespondable(c),
            cita: {
              folio: c.folio,
              fechaHora: c.fechaHora,
              especialidad: c.especialidad,
              establecimiento: c.establecimiento,
              estado: c.estado,
            },
          };
        });
      return {
        paciente: {
          id: p.id,
          nombre: p.nombre,
          movil: p.movil,
          movilValido: p.movilValido,
          email: p.email,
          emailValido: p.emailValido,
          tieneWhatsapp: p.tieneWhatsapp,
        },
        mensajes,
      };
    };

    api.responderMensaje = (mensajeId, accion) => {
      const m = db.mensajes.find((x) => x.id === mensajeId);
      if (!m || m.direccion !== 'saliente') throw new DomainError('Mensaje no encontrado.', 404);
      if (m.estadoEntrega !== 'entregado') throw new DomainError('El mensaje no fue entregado; no admite respuesta.');
      if (m.respuesta) throw new DomainError('Este mensaje ya tiene una respuesta registrada.');
      if (!RESPUESTA_TEXTO[accion]) throw new DomainError('Acción inválida.');
      const cita = citaById(m.citaId);
      if (!citaRespondable(cita)) {
        throw new DomainError(`La cita ya no admite respuesta (estado ${cita.estado}).`);
      }
      const now = db.simNow;
      m.respuesta = accion;
      m.respuestaTs = now;
      db.mensajes.push({
        id: store.id('msg'),
        citaId: cita.id,
        pacienteId: cita.pacienteId,
        canal: m.canal,
        direccion: 'entrante',
        etiqueta: 'Respuesta del paciente',
        contenido: RESPUESTA_TEXTO[accion][m.canal === 'ivr' ? 'ivr' : 'texto'],
        estadoEntrega: 'entregado',
        ts: now,
        respuesta: null,
        respuestaTs: null,
      });
      if (accion === 'confirmar') {
        cita.estado = 'CONFIRMADA';
        log(cita, now, `Paciente confirmó vía ${CANAL_LABEL[m.canal]}`);
      } else if (accion === 'cancelar') {
        cita.estado = 'CANCELADA';
        cita.canceladaEn = now;
        log(cita, now, `Paciente canceló vía ${CANAL_LABEL[m.canal]}; cupo liberado para reasignación`);
      } else {
        cita.estado = 'REPROGRAMACION_SOLICITADA';
        log(cita, now, `Paciente solicitó reprogramar vía ${CANAL_LABEL[m.canal]}`);
      }
      store.persist();
      return vistaCita(cita);
    };

    api.gestionar = (citaId, datos) => {
      const cita = citaById(citaId);
      if (!citaActiva(cita)) throw new DomainError('La cita no está activa; no admite gestión.');
      const { resultado, nota } = datos || {};
      const operador = ((datos || {}).operador || '').trim();
      if (!operador) throw new DomainError('Indique el nombre del operador que registra la gestión.');
      const now = db.simNow;
      const sufijo = nota && nota.trim() ? ` — ${nota.trim()}` : '';

      if (resultado === 'confirmada') {
        cita.estado = 'CONFIRMADA';
        log(cita, now, `Confirmada por gestión telefónica manual${sufijo}`, operador);
      } else if (resultado === 'cancelada') {
        cita.estado = 'CANCELADA';
        cita.canceladaEn = now;
        log(cita, now, `Cancelada por gestión telefónica manual; cupo liberado${sufijo}`, operador);
      } else if (resultado === 'inubicable') {
        cita.estado = 'INUBICABLE';
        log(cita, now, `Paciente inubicable tras gestión manual${sufijo}`, operador);
      } else if (resultado === 'reprogramada') {
        const nueva = Number((datos || {}).nuevaFechaHora);
        if (!Number.isFinite(nueva) || nueva <= now) {
          throw new DomainError('La nueva fecha de la cita debe ser futura.');
        }
        // La nueva cita nace en la agenda maestra (SisMaule) y de inmediato
        // en la réplica local, enlazada a la original.
        const mNueva = {
          id: store.id('sm'),
          pacienteId: cita.pacienteId,
          fechaHora: nueva,
          especialidad: cita.especialidad,
          profesional: cita.profesional,
          establecimiento: cita.establecimiento,
          canceladaEnOrigen: false,
          resultado: null,
          creadaPor: 'confirmacion',
        };
        db.maestro.push(mNueva);
        const rNueva = {
          id: store.id('cita'),
          sismauleId: mNueva.id,
          folio: nextFolio(),
          pacienteId: cita.pacienteId,
          fechaHora: nueva,
          especialidad: cita.especialidad,
          profesional: cita.profesional,
          establecimiento: cita.establecimiento,
          estado: 'AGENDADA',
          resultadoFinal: null,
          intentos: [],
          historial: [],
          canceladaEn: null,
          reprogramadaDe: cita.id,
          reprogramadaA: null,
        };
        db.citas.push(rNueva);
        log(rNueva, now, `Creada por reprogramación de la cita folio ${cita.folio}`, operador);
        cita.estado = 'REPROGRAMADA';
        cita.reprogramadaA = rNueva.id;
        log(cita, now, `Reprogramada; nueva cita folio ${rNueva.folio}${sufijo}`, operador);
      } else {
        throw new DomainError('Resultado de gestión inválido.');
      }
      store.persist();
      return vistaCita(cita);
    };

    api.reenviar = (citaId, canal) => {
      const cita = citaById(citaId);
      if (!citaActiva(cita)) throw new DomainError('La cita no está activa; no admite reenvío.');
      const p = paciente(cita.pacienteId);
      if (!canalDisponible(p, canal)) {
        throw new DomainError('El paciente no tiene ese canal de contacto registrado.');
      }
      enviar(cita, p, canal, db.simNow, 'Reenvío manual');
      if (cita.estado === 'AGENDADA') cita.estado = 'NOTIFICADA';
      store.persist();
      return vistaCita(cita);
    };

    // ---------- Agenda maestra (SisMaule simulado) ----------

    api.maestro = () =>
      db.maestro
        .slice()
        .sort((a, b) => a.fechaHora - b.fechaHora)
        .map((m) => {
          const p = paciente(m.pacienteId);
          const r = db.citas.find((c) => c.sismauleId === m.id);
          return {
            id: m.id,
            paciente: p.nombre,
            rut: maskRut(p.rut),
            fechaHora: m.fechaHora,
            especialidad: m.especialidad,
            profesional: m.profesional,
            establecimiento: m.establecimiento,
            canceladaEnOrigen: m.canceladaEnOrigen,
            resultado: m.resultado || null,
            creadaPor: m.creadaPor || 'sismaule',
            espejo: r ? { folio: r.folio, estado: r.estado, resultadoFinal: r.resultadoFinal } : null,
          };
        });

    api.crearCitaMaestro = (datos) => {
      const { pacienteId, especialidad, profesional, establecimiento } = datos || {};
      const p = paciente(pacienteId);
      const h = Number((datos || {}).enHoras);
      if (!Number.isFinite(h) || h < 1 || h > 24 * 30) {
        throw new DomainError('Indique en cuántas horas es la cita (1 a 720).');
      }
      if (!especialidad || !String(especialidad).trim()) throw new DomainError('Indique la especialidad.');
      const m = {
        id: store.id('sm'),
        pacienteId: p.id,
        fechaHora: db.simNow + h * HORA,
        especialidad: String(especialidad).trim(),
        profesional: String(profesional || 'Por asignar').trim(),
        establecimiento: String(establecimiento || 'Hospital Regional de Talca').trim(),
        canceladaEnOrigen: false,
        resultado: null,
        creadaPor: 'sismaule',
      };
      db.maestro.push(m);
      store.persist();
      return m;
    };

    api.moverCitaMaestro = (id, horas) => {
      const m = db.maestro.find((x) => x.id === id);
      if (!m) throw new DomainError('Cita no encontrada en la agenda maestra.', 404);
      if (m.canceladaEnOrigen || m.resultado) throw new DomainError('La cita ya no se puede mover.');
      const h = Number(horas);
      if (!Number.isFinite(h) || h === 0) throw new DomainError('Horas inválidas.');
      const nueva = m.fechaHora + h * HORA;
      if (nueva <= db.simNow) throw new DomainError('La cita quedaría en el pasado.');
      m.fechaHora = nueva;
      store.persist();
      return m;
    };

    api.cancelarCitaMaestro = (id) => {
      const m = db.maestro.find((x) => x.id === id);
      if (!m) throw new DomainError('Cita no encontrada en la agenda maestra.', 404);
      if (m.canceladaEnOrigen || m.resultado) throw new DomainError('La cita ya no se puede cancelar.');
      m.canceladaEnOrigen = true;
      store.persist();
      return m;
    };

    // ---------- KPIs ----------

    api.kpis = () => {
      const total = db.citas.filter((c) => c.estado !== 'REPROGRAMADA');
      const confirmadas = total.filter((c) => c.estado === 'CONFIRMADA').length;
      const pasadas = total.filter((c) => c.resultadoFinal);
      const nsp = pasadas.filter((c) => c.resultadoFinal === 'NSP').length;

      const canales = ['whatsapp', 'sms', 'email', 'ivr'].map((canal) => {
        const salientes = db.mensajes.filter((m) => m.canal === canal && m.direccion === 'saliente');
        const entregados = salientes.filter((m) => m.estadoEntrega === 'entregado');
        const respuestas = entregados.filter((m) => m.respuesta);
        const confirmaciones = entregados.filter((m) => m.respuesta === 'confirmar');
        return {
          canal,
          label: CANAL_LABEL[canal],
          enviados: salientes.length,
          entregados: entregados.length,
          respuestas: respuestas.length,
          confirmaciones: confirmaciones.length,
          tasaRespuesta: entregados.length ? respuestas.length / entregados.length : null,
        };
      });

      const notificados = new Set(
        db.mensajes.filter((m) => m.direccion === 'saliente').map((m) => m.pacienteId)
      );
      const contactados = new Set(
        db.mensajes
          .filter((m) => m.direccion === 'saliente' && m.estadoEntrega === 'entregado')
          .map((m) => m.pacienteId)
      );

      const cancelaciones = db.citas.filter((c) => c.estado === 'CANCELADA' && c.canceladaEn);
      const anticipacionHoras = cancelaciones.length
        ? cancelaciones.reduce((acc, c) => acc + (c.fechaHora - c.canceladaEn) / HORA, 0) / cancelaciones.length
        : null;

      return {
        reloj: db.simNow,
        totalCitas: total.length,
        confirmadas,
        tasaConfirmacion: total.length ? confirmadas / total.length : null,
        pasadas: pasadas.length,
        atendidas: pasadas.length - nsp,
        nsp,
        tasaNsp: pasadas.length ? nsp / pasadas.length : null,
        canales,
        pacientesNotificados: notificados.size,
        pacientesContactados: contactados.size,
        tasaContacto: notificados.size ? contactados.size / notificados.size : null,
        cancelaciones: cancelaciones.length,
        anticipacionHoras,
      };
    };

    // ---------- Escenario de demostración ----------

    // Reinicia la base y reproduce ~30 horas simuladas de operación, para
    // que el dashboard muestre todos los estados desde el primer momento.
    api.seedDemo = () => {
      const BASE = Date.UTC(2026, 6, 16, 12, 0, 0); // 2026-07-16 08:00 en Chile (UTC-4)
      Object.assign(db, {
        simNow: BASE,
        lastSyncAt: null,
        folioSeq: 1000,
        pacientes: [],
        maestro: [],
        citas: [],
        mensajes: [],
      });

      const defs = [
        // [nombre, rut, movil?, movilValido, email?, emailValido, whatsapp]
        ['María Contreras Rojas', '12.345.678-5', '+56 9 6123 4501', true, 'maria.contreras@example.cl', true, true],
        ['José Fuentes Aravena', '9.876.543-2', '+56 9 6123 4502', true, 'jose.fuentes@example.cl', true, false],
        ['Ana Sepúlveda Díaz', '15.222.333-4', '+56 9 6123 4503', true, null, false, true],
        ['Pedro Rojas Bravo', '8.111.222-9', '+56 9 6123 4504', false, 'pedro.rojas@example.cl', false, false],
        ['Carmen Muñoz Leiva', '16.444.555-6', null, false, 'carmen.munoz@example.cl', true, false],
        ['Luis Valdés Norambuena', '11.333.444-7', '+56 9 6123 4506', true, 'luis.valdes@example.cl', true, true],
        ['Rosa Tapia Gutiérrez', '7.555.666-8', '+56 9 6123 4507', true, 'rosa.tapia@example.cl', false, false],
        ['Diego Herrera Campos', '18.666.777-9', '+56 9 6123 4508', true, 'diego.herrera@example.cl', true, true],
        ['Marta Núñez Parra', '6.777.888-K', '+56 9 6123 4509', true, null, false, false],
        ['Felipe Ortega Salas', '17.888.999-0', '+56 9 6123 4510', true, 'felipe.ortega@example.cl', true, true],
        ['Claudia Vergara Soto', '13.999.000-1', '+56 9 6123 4511', true, 'claudia.vergara@example.cl', true, true],
        ['Héctor Lagos Fuentealba', '10.000.111-2', '+56 9 6123 4512', true, 'hector.lagos@example.cl', true, false],
      ];
      const P = defs.map(([nombre, rut, movil, movilValido, email, emailValido, tieneWhatsapp]) => {
        const p = { id: store.id('pac'), nombre, rut, movil, movilValido, email, emailValido, tieneWhatsapp };
        db.pacientes.push(p);
        return p;
      });

      const EST = {
        talca: 'Hospital Regional de Talca',
        curico: 'Hospital de Curicó',
        linares: 'Hospital de Linares',
      };
      const citasPlan = [
        // [pacienteIdx, horas desde BASE, especialidad, profesional, establecimiento]
        [0, 26, 'Cardiología', 'Dra. Paula Ríos', EST.talca],
        [1, 30, 'Traumatología', 'Dr. Marco Silva', EST.curico],
        [2, 30, 'Oftalmología', 'Dra. Carolina Pinto', EST.talca],
        [3, 40, 'Medicina Interna', 'Dr. Andrés Molina', EST.linares],
        [4, 46, 'Dermatología', 'Dra. Josefa Riquelme', EST.talca],
        [5, 50, 'Cardiología', 'Dra. Paula Ríos', EST.talca],
        [6, 54, 'Ginecología', 'Dra. Valentina Cruz', EST.curico],
        [7, 60, 'Traumatología', 'Dr. Marco Silva', EST.curico],
        [8, 70, 'Oftalmología', 'Dra. Carolina Pinto', EST.talca],
        [9, 76, 'Medicina Interna', 'Dr. Andrés Molina', EST.linares],
        [10, 90, 'Cardiología', 'Dra. Paula Ríos', EST.talca],
        [11, 96, 'Dermatología', 'Dra. Josefa Riquelme', EST.talca],
        [1, 84, 'Control Traumatología', 'Dr. Marco Silva', EST.curico],
        [0, 100, 'Control Cardiología', 'Dra. Paula Ríos', EST.talca],
        [5, 110, 'Ecocardiograma', 'Dra. Paula Ríos', EST.talca],
        [7, 120, 'Control Traumatología', 'Dr. Marco Silva', EST.curico],
      ];
      for (const [idx, h, especialidad, profesional, establecimiento] of citasPlan) {
        db.maestro.push({
          id: store.id('sm'),
          pacienteId: P[idx].id,
          fechaHora: BASE + h * HORA,
          especialidad,
          profesional,
          establecimiento,
          canceladaEnOrigen: false,
          resultado: null,
          creadaPor: 'sismaule',
        });
      }

      const responderUltimo = (p, accion) => {
        const m = db.mensajes
          .filter((x) => x.pacienteId === p.id && x.direccion === 'saliente' && x.estadoEntrega === 'entregado' && !x.respuesta)
          .sort((a, b) => b.ts - a.ts)[0];
        if (m) api.responderMensaje(m.id, accion);
      };

      // Día 1, 08:00 — primera sincronización y primera pasada de campaña.
      sincronizar(db.simNow);
      procesar(db.simNow);
      responderUltimo(P[0], 'confirmar');
      responderUltimo(P[2], 'confirmar');
      responderUltimo(P[5], 'confirmar');
      responderUltimo(P[1], 'cancelar');

      api.avanzarReloj(6); // Día 1, 14:00
      responderUltimo(P[6], 'confirmar');
      responderUltimo(P[4], 'reprogramar');

      api.avanzarReloj(12); // Día 2, 02:00
      responderUltimo(P[7], 'confirmar');

      api.avanzarReloj(12); // Día 2, 14:00
      responderUltimo(P[10], 'confirmar');
      responderUltimo(P[11], 'cancelar');
      responderUltimo(P[9], 'reprogramar');

      // El SOME resuelve la solicitud de reprogramación de Carmen.
      const citaCarmen = db.citas.find(
        (c) => c.pacienteId === P[4].id && c.estado === 'REPROGRAMACION_SOLICITADA'
      );
      if (citaCarmen) {
        api.gestionar(citaCarmen.id, {
          resultado: 'reprogramada',
          operador: 'C. Núñez (SOME Talca)',
          nota: 'Paciente pidió cambio por motivos laborales',
          nuevaFechaHora: db.simNow + 96 * HORA,
        });
      }

      store.persist();
      return api.estado();
    };

    return api;
  }

  return { createDomain, maskRut, PASOS, HORA };
});
