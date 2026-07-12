async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) {
    const message = (data && data.error) || `Error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

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

function pathSegment(index) {
  return decodeURIComponent(location.pathname.split('/').filter(Boolean)[index] || '');
}

function notice(container, kind, text) {
  container.innerHTML = `<div class="notice ${kind}">${escapeHtml(text)}</div>`;
}

function eventTypeLabel(type) {
  return { in_person: 'Presencial', online: 'Online', hybrid: 'Hibrido' }[type] || type;
}
