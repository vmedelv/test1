// Router y vistas de RemindaClinic.
import * as store from './store.js';
import { cargarDemo } from './seed.js';
import { el, toast, modal, confirmar, copiar } from './ui.js';
import {
  fechaLarga, fechaCorta, hora, fechaHora, isoToLocalInput,
  telefonoWa, construirMensaje, ESTADOS, esMismoDia, inicioDeHoy,
} from './format.js';

const app = document.getElementById('app');

const RUTAS = {
  agenda: vistaAgenda,
  citas: vistaCitas,
  pacientes: vistaPacientes,
  recordatorios: vistaRecordatorios,
  ajustes: vistaAjustes,
};

function router() {
  const ruta = (location.hash.replace('#/', '') || 'agenda').split('?')[0];
  const render = RUTAS[ruta] || vistaAgenda;
  app.innerHTML = '';
  app.append(render());
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#/${ruta}`);
  });
  actualizarBadge();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('clinica-nombre').textContent = store.getConfig().clinica;
  router();
});

// --- Helpers de dominio ---
function nombrePaciente(id) {
  return store.getPaciente(id)?.nombre || '(paciente eliminado)';
}

function citasPendientesRecordatorio() {
  const cfg = store.getConfig();
  const ahora = Date.now();
  const limite = ahora + cfg.horasAntes * 3600 * 1000;
  return store.getCitas().filter((c) => {
    const t = new Date(c.fechaHora).getTime();
    return (
      !c.recordatorioEnviado &&
      t >= ahora &&
      t <= limite &&
      c.estado !== 'cancelada'
    );
  });
}

function actualizarBadge() {
  const n = citasPendientesRecordatorio().length;
  const badge = document.getElementById('badge-recordatorios');
  if (badge) {
    badge.textContent = n;
    badge.style.display = n ? '' : 'none';
  }
}

function estadoChip(estado) {
  return el('span', { class: `chip estado estado--${estado}`, text: ESTADOS[estado] || estado });
}

// ======================= AGENDA =======================
function vistaAgenda() {
  const wrap = el('div', { class: 'view' });
  const citas = store.getCitas();
  const hoy = citas.filter((c) => esMismoDia(c.fechaHora) && c.estado !== 'cancelada');
  const inicio = inicioDeHoy().getTime();
  const proximas = citas.filter((c) => {
    const t = new Date(c.fechaHora).getTime();
    return t >= inicio && !esMismoDia(c.fechaHora) && c.estado !== 'cancelada';
  }).slice(0, 12);
  const pendientes = citasPendientesRecordatorio();

  wrap.append(
    el('div', { class: 'stats' }, [
      tarjetaStat('Citas hoy', hoy.length, '📅'),
      tarjetaStat('Próximas', proximas.length, '🗓️'),
      tarjetaStat('Recordatorios pendientes', pendientes.length, '🔔', pendientes.length ? '#/recordatorios' : null),
    ])
  );

  wrap.append(el('div', { class: 'row between center head-row' }, [
    el('h2', { text: `Hoy · ${fechaLarga(new Date().toISOString())}` }),
    el('button', { class: 'btn', text: '+ Nueva cita', onClick: () => editarCita() }),
  ]));

  if (!hoy.length) {
    wrap.append(vacio('No hay citas para hoy.'));
  } else {
    wrap.append(listaCitas(hoy));
  }

  if (proximas.length) {
    wrap.append(el('h2', { text: 'Próximos días', class: 'mt' }));
    wrap.append(listaCitas(proximas));
  }

  return wrap;
}

function tarjetaStat(label, valor, icono, href) {
  const card = el('div', { class: 'stat' + (href ? ' stat--link' : '') }, [
    el('div', { class: 'stat-ico', text: icono }),
    el('div', {}, [
      el('div', { class: 'stat-num', text: String(valor) }),
      el('div', { class: 'stat-lbl', text: label }),
    ]),
  ]);
  if (href) card.addEventListener('click', () => (location.hash = href));
  return card;
}

function listaCitas(citas) {
  const ul = el('div', { class: 'list' });
  for (const c of citas) {
    const p = store.getPaciente(c.pacienteId);
    ul.append(
      el('div', { class: 'card cita' }, [
        el('div', { class: 'cita-time' }, [
          el('div', { class: 'cita-hora', text: hora(c.fechaHora) }),
          el('div', { class: 'cita-dia', text: fechaCorta(c.fechaHora) }),
        ]),
        el('div', { class: 'cita-main' }, [
          el('div', { class: 'row center gap wrap' }, [
            el('strong', { text: p?.nombre || nombrePaciente(c.pacienteId) }),
            estadoChip(c.estado),
            c.recordatorioEnviado ? el('span', { class: 'chip mini ok', text: '✓ recordado' }) : null,
          ]),
          el('div', { class: 'muted', text: `${c.motivo || 'Sin motivo'} · ${c.profesional || 'Sin profesional'}` }),
        ]),
        el('div', { class: 'cita-acc' }, [
          el('button', { class: 'icon-btn', title: 'Recordar', text: '🔔', onClick: () => abrirRecordatorio(c.id) }),
          el('button', { class: 'icon-btn', title: 'Editar', text: '✏️', onClick: () => editarCita(c.id) }),
        ]),
      ])
    );
  }
  return ul;
}

// ======================= CITAS =======================
let filtroCitas = { estado: '', q: '' };

function vistaCitas() {
  const wrap = el('div', { class: 'view' });
  wrap.append(el('div', { class: 'row between center head-row' }, [
    el('h2', { text: 'Citas' }),
    el('button', { class: 'btn', text: '+ Nueva cita', onClick: () => editarCita() }),
  ]));

  const filtros = el('div', { class: 'row gap wrap filtros' }, [
    inputBusqueda('Buscar paciente o motivo…', filtroCitas.q, (v) => { filtroCitas.q = v; refrescar(); }),
    selectSimple(
      [['', 'Todos los estados'], ...Object.entries(ESTADOS)],
      filtroCitas.estado,
      (v) => { filtroCitas.estado = v; refrescar(); }
    ),
  ]);
  wrap.append(filtros);

  const cont = el('div', {});
  wrap.append(cont);

  function refrescar() {
    cont.innerHTML = '';
    let citas = store.getCitas();
    if (filtroCitas.estado) citas = citas.filter((c) => c.estado === filtroCitas.estado);
    if (filtroCitas.q) {
      const q = filtroCitas.q.toLowerCase();
      citas = citas.filter((c) => {
        const nombre = nombrePaciente(c.pacienteId).toLowerCase();
        return nombre.includes(q) || (c.motivo || '').toLowerCase().includes(q) ||
          (c.profesional || '').toLowerCase().includes(q);
      });
    }
    if (!citas.length) cont.append(vacio('No hay citas que coincidan.'));
    else cont.append(listaCitas(citas));
  }
  refrescar();
  return wrap;
}

function editarCita(id) {
  const cita = id ? store.getCita(id) : null;
  const pacientes = store.getPacientes();
  if (!pacientes.length && !cita) {
    toast('Primero agrega un paciente', 'err');
    location.hash = '#/pacientes';
    return;
  }

  modal(cita ? 'Editar cita' : 'Nueva cita', (close) => {
    const form = el('form', { class: 'form' });
    const fPaciente = selectSimple(
      pacientes.map((p) => [p.id, p.nombre]),
      cita?.pacienteId || pacientes[0]?.id || '',
    );
    const fFecha = el('input', {
      type: 'datetime-local', required: 'true',
      value: cita ? isoToLocalInput(cita.fechaHora) : isoToLocalInput(defecto1030()),
    });
    const fProf = el('input', { type: 'text', placeholder: 'Ej: Dra. Fuentes', value: cita?.profesional || '' });
    const fMotivo = el('input', { type: 'text', placeholder: 'Ej: Control general', value: cita?.motivo || '' });
    const fEstado = selectSimple(Object.entries(ESTADOS), cita?.estado || 'agendada');

    form.append(
      campo('Paciente', fPaciente),
      campo('Fecha y hora', fFecha),
      campo('Profesional', fProf),
      campo('Motivo', fMotivo),
      cita ? campo('Estado', fEstado) : null,
      el('div', { class: 'row end gap mt' }, [
        cita ? el('button', {
          type: 'button', class: 'btn danger ghost', text: 'Eliminar',
          onClick: async () => {
            if (await confirmar('¿Eliminar esta cita?')) {
              store.deleteCita(cita.id); close(); toast('Cita eliminada'); router();
            }
          },
        }) : null,
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Cancelar', onClick: close }),
        el('button', { type: 'submit', class: 'btn', text: 'Guardar' }),
      ]),
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fechaISO = new Date(fFecha.value).toISOString();
      store.saveCita({
        id: cita?.id,
        pacienteId: fPaciente.value,
        fechaHora: fechaISO,
        profesional: fProf.value.trim(),
        motivo: fMotivo.value.trim(),
        estado: cita ? fEstado.value : 'agendada',
      });
      close();
      toast('Cita guardada');
      router();
    });
    return form;
  });
}

function defecto1030() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 30, 0, 0);
  return d.toISOString();
}

// ======================= PACIENTES =======================
function vistaPacientes() {
  const wrap = el('div', { class: 'view' });
  wrap.append(el('div', { class: 'row between center head-row' }, [
    el('h2', { text: 'Pacientes' }),
    el('button', { class: 'btn', text: '+ Nuevo paciente', onClick: () => editarPaciente() }),
  ]));

  const pacientes = store.getPacientes();
  if (!pacientes.length) {
    wrap.append(vacio('Aún no hay pacientes. Agrega el primero.'));
    return wrap;
  }
  const list = el('div', { class: 'list' });
  for (const p of pacientes) {
    const nCitas = store.getCitas().filter((c) => c.pacienteId === p.id).length;
    list.append(
      el('div', { class: 'card paciente', onClick: () => editarPaciente(p.id) }, [
        el('div', { class: 'avatar', text: iniciales(p.nombre) }),
        el('div', { class: 'grow' }, [
          el('strong', { text: p.nombre }),
          el('div', { class: 'muted', text: [p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin contacto' }),
        ]),
        el('span', { class: 'chip mini', text: `${nCitas} cita${nCitas === 1 ? '' : 's'}` }),
      ])
    );
  }
  wrap.append(list);
  return wrap;
}

function iniciales(nombre) {
  return nombre.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase();
}

function editarPaciente(id) {
  const p = id ? store.getPaciente(id) : null;
  modal(p ? 'Editar paciente' : 'Nuevo paciente', (close) => {
    const form = el('form', { class: 'form' });
    const fNombre = el('input', { type: 'text', required: 'true', value: p?.nombre || '', placeholder: 'Nombre y apellido' });
    const fTel = el('input', { type: 'tel', value: p?.telefono || '', placeholder: '+56 9 1234 5678' });
    const fEmail = el('input', { type: 'email', value: p?.email || '', placeholder: 'correo@ejemplo.cl' });
    const fRut = el('input', { type: 'text', value: p?.rut || '', placeholder: '12.345.678-9' });
    const fNotas = el('textarea', { rows: '2', placeholder: 'Notas (opcional)' });
    fNotas.value = p?.notas || '';

    form.append(
      campo('Nombre', fNombre),
      campo('Teléfono', fTel),
      campo('Correo', fEmail),
      campo('RUT', fRut),
      campo('Notas', fNotas),
      el('div', { class: 'row end gap mt' }, [
        p ? el('button', {
          type: 'button', class: 'btn danger ghost', text: 'Eliminar',
          onClick: async () => {
            if (await confirmar('¿Eliminar el paciente y todas sus citas?')) {
              store.deletePaciente(p.id); close(); toast('Paciente eliminado'); router();
            }
          },
        }) : null,
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Cancelar', onClick: close }),
        el('button', { type: 'submit', class: 'btn', text: 'Guardar' }),
      ]),
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!fNombre.value.trim()) return;
      store.savePaciente({
        id: p?.id,
        nombre: fNombre.value.trim(),
        telefono: fTel.value.trim(),
        email: fEmail.value.trim(),
        rut: fRut.value.trim(),
        notas: fNotas.value.trim(),
      });
      close();
      toast('Paciente guardado');
      router();
    });
    return form;
  });
}

// ======================= RECORDATORIOS =======================
function vistaRecordatorios() {
  const wrap = el('div', { class: 'view' });
  wrap.append(el('h2', { text: 'Recordatorios' }));
  const cfg = store.getConfig();
  wrap.append(el('p', { class: 'muted',
    text: `Citas dentro de las próximas ${cfg.horasAntes} h sin recordatorio enviado.` }));

  const pendientes = citasPendientesRecordatorio();
  if (!pendientes.length) {
    wrap.append(vacio('¡Todo al día! No hay recordatorios pendientes.'));
  } else {
    const list = el('div', { class: 'list' });
    for (const c of pendientes) {
      const p = store.getPaciente(c.pacienteId);
      list.append(
        el('div', { class: 'card cita' }, [
          el('div', { class: 'cita-time' }, [
            el('div', { class: 'cita-hora', text: hora(c.fechaHora) }),
            el('div', { class: 'cita-dia', text: fechaCorta(c.fechaHora) }),
          ]),
          el('div', { class: 'cita-main' }, [
            el('strong', { text: p?.nombre || nombrePaciente(c.pacienteId) }),
            el('div', { class: 'muted', text: `${c.motivo || 'Sin motivo'} · ${c.profesional || ''}` }),
            el('div', { class: 'muted mini', text: (p?.telefono || 'sin teléfono') }),
          ]),
          el('div', { class: 'cita-acc' }, [
            el('button', { class: 'btn small', text: 'Enviar', onClick: () => abrirRecordatorio(c.id) }),
          ]),
        ])
      );
    }
    wrap.append(list);
  }
  return wrap;
}

function abrirRecordatorio(citaId) {
  const c = store.getCita(citaId);
  if (!c) return;
  const p = store.getPaciente(c.pacienteId);
  const cfg = store.getConfig();
  const mensaje = construirMensaje(cfg.plantilla, {
    nombre: p?.nombre?.split(' ')[0] || 'paciente',
    clinica: cfg.clinica,
    fecha: fechaLarga(c.fechaHora),
    hora: hora(c.fechaHora),
    profesional: c.profesional || 'su profesional',
    motivo: c.motivo || 'su atención',
    telefonoClinica: cfg.telefonoClinica,
  });

  modal('Enviar recordatorio', (close) => {
    const ta = el('textarea', { rows: '6', class: 'msg' });
    ta.value = mensaje;
    const tel = p?.telefono ? telefonoWa(p.telefono, cfg.codigoPais) : '';
    const waUrl = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(ta.value)}` : null;
    const smsUrl = p?.telefono ? `sms:${p.telefono.replace(/\s/g, '')}?&body=${encodeURIComponent(ta.value)}` : null;
    const mailUrl = p?.email
      ? `mailto:${p.email}?subject=${encodeURIComponent('Recordatorio de cita · ' + cfg.clinica)}&body=${encodeURIComponent(ta.value)}`
      : null;

    const abrir = (url) => {
      if (!url) return;
      window.open(url, '_blank');
      marcar();
    };
    const marcar = () => {
      store.marcarRecordada(c.id, true);
      toast('Marcado como recordado');
      close();
      router();
    };

    const wrap = el('div', {}, [
      el('div', { class: 'muted mb', text: `Para: ${p?.nombre || ''} · ${fechaHora(c.fechaHora)}` }),
      el('label', { class: 'lbl', text: 'Mensaje' }),
      ta,
      el('div', { class: 'canales' }, [
        waUrl ? el('button', { class: 'btn wa', text: '💬 WhatsApp', onClick: () => abrir(waUrl) })
              : el('button', { class: 'btn wa', disabled: 'true', text: '💬 WhatsApp' }),
        el('button', { class: 'btn', text: '📱 SMS', disabled: smsUrl ? null : 'true', onClick: () => abrir(smsUrl) }),
        el('button', { class: 'btn', text: '✉️ Correo', disabled: mailUrl ? null : 'true', onClick: () => abrir(mailUrl) }),
        el('button', { class: 'btn ghost', text: '📋 Copiar', onClick: () => copiar(ta.value) }),
      ]),
      el('div', { class: 'row end gap mt' }, [
        el('button', { class: 'btn ghost', text: 'Cerrar', onClick: close }),
        el('button', { class: 'btn', text: c.recordatorioEnviado ? 'Ya recordado ✓' : 'Marcar como enviado', onClick: marcar }),
      ]),
    ]);
    return wrap;
  });
}

// ======================= AJUSTES =======================
function vistaAjustes() {
  const wrap = el('div', { class: 'view' });
  wrap.append(el('h2', { text: 'Ajustes' }));
  const cfg = store.getConfig();
  const form = el('form', { class: 'form card pad' });

  const fClinica = el('input', { type: 'text', value: cfg.clinica });
  const fTel = el('input', { type: 'tel', value: cfg.telefonoClinica });
  const fCodigo = el('input', { type: 'text', value: cfg.codigoPais, class: 'narrow' });
  const fHoras = el('input', { type: 'number', min: '1', max: '168', value: cfg.horasAntes, class: 'narrow' });
  const fPlantilla = el('textarea', { rows: '5', class: 'msg' });
  fPlantilla.value = cfg.plantilla;

  form.append(
    campo('Nombre de la clínica', fClinica),
    campo('Teléfono de la clínica', fTel),
    campo('Código de país (para WhatsApp)', fCodigo),
    campo('Recordar cuántas horas antes', fHoras),
    campo('Plantilla del mensaje', fPlantilla),
    el('div', { class: 'muted mini' , html:
      'Variables: <code>{nombre}</code> <code>{clinica}</code> <code>{fecha}</code> ' +
      '<code>{hora}</code> <code>{profesional}</code> <code>{motivo}</code> <code>{telefonoClinica}</code>' }),
    el('div', { class: 'row end gap mt' }, [
      el('button', { type: 'submit', class: 'btn', text: 'Guardar ajustes' }),
    ]),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateConfig({
      clinica: fClinica.value.trim() || 'Mi Clínica',
      telefonoClinica: fTel.value.trim(),
      codigoPais: fCodigo.value.replace(/\D/g, '') || '56',
      horasAntes: Math.max(1, parseInt(fHoras.value, 10) || 24),
      plantilla: fPlantilla.value.trim(),
    });
    document.getElementById('clinica-nombre').textContent = store.getConfig().clinica;
    toast('Ajustes guardados');
  });
  wrap.append(form);

  // Datos
  wrap.append(el('h2', { text: 'Datos', class: 'mt' }));
  const zonaDatos = el('div', { class: 'card pad' }, [
    el('div', { class: 'row gap wrap' }, [
      el('button', { class: 'btn ghost', text: '⬇️ Exportar JSON', onClick: exportar }),
      el('button', { class: 'btn ghost', text: '⬆️ Importar JSON', onClick: importar }),
      el('button', { class: 'btn ghost', text: '🧪 Cargar demo', onClick: async () => {
        if (await confirmar('Esto reemplazará tus datos actuales por datos de ejemplo. ¿Continuar?')) {
          cargarDemo();
          document.getElementById('clinica-nombre').textContent = store.getConfig().clinica;
          toast('Datos de demostración cargados');
          location.hash = '#/agenda';
          router();
        }
      } }),
      el('button', { class: 'btn danger ghost', text: '🗑️ Borrar todo', onClick: async () => {
        if (await confirmar('¿Borrar TODOS los pacientes y citas? No se puede deshacer.')) {
          store.resetAll();
          document.getElementById('clinica-nombre').textContent = store.getConfig().clinica;
          toast('Datos borrados');
          location.hash = '#/agenda';
          router();
        }
      } }),
    ]),
    el('p', { class: 'muted mini mt', text: 'Tus datos se guardan solo en este navegador (localStorage).' }),
  ]);
  wrap.append(zonaDatos);
  return wrap;
}

function exportar() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `remindaclinic-${fechaCorta(new Date().toISOString()).replace(/\//g, '-')}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Datos exportados');
}

function importar() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importData(reader.result);
        document.getElementById('clinica-nombre').textContent = store.getConfig().clinica;
        toast('Datos importados');
        location.hash = '#/agenda';
        router();
      } catch {
        toast('Archivo inválido', 'err');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ======================= Componentes reutilizables =======================
function campo(label, input) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'lbl', text: label }),
    input,
  ]);
}

function selectSimple(opciones, valor, onChange) {
  const sel = el('select', {});
  for (const [v, t] of opciones) {
    const o = el('option', { value: v, text: t });
    if (v === valor) o.selected = true;
    sel.append(o);
  }
  if (onChange) sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function inputBusqueda(placeholder, valor, onInput) {
  const i = el('input', { type: 'search', placeholder, value: valor || '', class: 'grow' });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function vacio(texto) {
  return el('div', { class: 'empty', text: texto });
}
