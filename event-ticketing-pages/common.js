function money(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDateTime(iso) {
  if (!iso) return 'Fecha por definir';
  try {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Santiago',
    }).format(new Date(iso));
  } catch (e) {
    return iso;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function qparam(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

function notice(container, kind, text) {
  container.innerHTML = `<div class="notice ${kind}">${escapeHtml(text)}</div>`;
}

function eventTypeLabel(type) {
  return { in_person: 'Presencial', online: 'Online', hybrid: 'Hibrido' }[type] || type;
}

// Envuelve una llamada sincrona a Domain.* y homogeniza el manejo de error
// (Domain lanza DomainError, no promesas rechazadas de fetch).
function tryRun(fn, onError) {
  try {
    return fn();
  } catch (err) {
    onError(err.message || 'Ocurrio un error.');
    return null;
  }
}
