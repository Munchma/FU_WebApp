(function () {
  const state = {
    data: {withoutEvents: [], withEvents: []},
    busy: false,
  };

  const els = {
    setup: document.getElementById('setup'),
    endpoint: document.getElementById('endpoint'),
    saveEndpoint: document.getElementById('save-endpoint'),
    status: document.getElementById('status'),
    summary: document.getElementById('summary'),
    refresh: document.getElementById('refresh'),
    save: document.getElementById('save'),
    without: document.getElementById('without'),
    with: document.getElementById('with'),
    withoutCount: document.getElementById('without-count'),
    withCount: document.getElementById('with-count'),
  };

  function configuredEndpoint() {
    const fromConfig = window.BAYSHORE_CONFIG && window.BAYSHORE_CONFIG.appsScriptUrl;
    return String(localStorage.getItem('bayshoreAppsScriptUrl') || fromConfig || '').trim();
  }

  function setEndpoint(value) {
    localStorage.setItem('bayshoreAppsScriptUrl', String(value || '').trim());
  }

  function api(action, params) {
    const endpoint = configuredEndpoint();
    if (!endpoint) return Promise.reject(new Error('Apps Script web app URL is not set.'));

    return new Promise((resolve, reject) => {
      const callback = `bayshoreCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      const url = new URL(endpoint);
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callback);
      Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out.'));
      }, 30000);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callback];
        script.remove();
      }

      window[callback] = (payload) => {
        cleanup();
        if (!payload || payload.ok !== true) {
          reject(new Error((payload && payload.error) || 'Request failed.'));
          return;
        }
        resolve(payload.data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('Could not reach Apps Script.'));
      };

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function setBusy(value) {
    state.busy = value;
    els.refresh.disabled = value;
    els.save.disabled = value;
  }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.classList.toggle('error', Boolean(isError));
  }

  function load() {
    if (!configuredEndpoint()) {
      els.setup.hidden = false;
      els.endpoint.value = '';
      setStatus('Paste your Apps Script web app URL to connect.', true);
      return;
    }

    els.setup.hidden = true;
    setBusy(true);
    setStatus('Loading...');
    api('patients')
      .then((data) => {
        state.data = data || {withoutEvents: [], withEvents: []};
        render();
        setStatus('Ready');
      })
      .catch((error) => {
        els.setup.hidden = false;
        els.endpoint.value = configuredEndpoint();
        setStatus(error.message || String(error), true);
      })
      .finally(() => setBusy(false));
  }

  function save() {
    const updates = changedRows();
    if (!updates.length) {
      setStatus('No changes to save.');
      return;
    }

    setBusy(true);
    setStatus('Saving...');
    api('saveFollowUps', {updates: JSON.stringify(updates)})
      .then((data) => {
        state.data = data || {withoutEvents: [], withEvents: []};
        render();
        setStatus('Saved.');
      })
      .catch((error) => setStatus(error.message || String(error), true))
      .finally(() => setBusy(false));
  }

  function changedRows() {
    return Array.from(document.querySelectorAll('[data-row]')).reduce((updates, row) => {
      const fuDate = row.querySelector('input[type="date"]').value;
      const mode = row.querySelector('select').value;
      if (fuDate !== row.dataset.originalDate || mode !== row.dataset.originalMode) {
        updates.push({
          rowNumber: row.dataset.row,
          fuDate,
          mode,
        });
      }
      return updates;
    }, []);
  }

  function render() {
    const withoutEvents = state.data.withoutEvents || [];
    const withEvents = state.data.withEvents || [];
    els.withoutCount.textContent = String(withoutEvents.length);
    els.withCount.textContent = String(withEvents.length);
    els.summary.textContent = `${withoutEvents.length} need FU events, ${withEvents.length} already logged.`;
    renderSection(els.without, withoutEvents);
    renderSection(els.with, withEvents);
  }

  function renderSection(target, rows) {
    if (!rows.length) {
      target.innerHTML = '<div class="empty">No patients in this section.</div>';
      return;
    }

    target.innerHTML = [
      '<div class="table-wrap"><table>',
      '<thead><tr><th>Patient</th><th>FU Date</th><th>Handling</th><th>Allowance</th><th>Status</th></tr></thead>',
      '<tbody>',
      ...rows.map((row) => rowHtml(row)),
      '</tbody></table></div>',
    ].join('');

    target.querySelectorAll('input, select').forEach((control) => {
      control.addEventListener('change', markChanged);
    });
  }

  function rowHtml(row) {
    const originalMode = row.calendarStatus === 'Manual' ? 'manual' : 'auto';
    return `
      <tr data-row="${escapeHtml(row.rowNumber)}" data-original-date="${escapeHtml(row.fuDate || '')}" data-original-mode="${originalMode}">
        <td class="patient">${escapeHtml(row.displayName || row.patientName || '')}</td>
        <td><input type="date" value="${escapeHtml(row.fuDate || '')}"></td>
        <td>
          <select>
            <option value="auto"${originalMode === 'auto' ? ' selected' : ''}>Create Google event</option>
            <option value="manual"${originalMode === 'manual' ? ' selected' : ''}>Already in calendar</option>
          </select>
        </td>
        <td>${escapeHtml(row.weeklyAllowance || '')}</td>
        <td>${escapeHtml(row.calendarStatus || '')}</td>
      </tr>
    `;
  }

  function markChanged(event) {
    const row = event.target.closest('[data-row]');
    const fuDate = row.querySelector('input[type="date"]').value;
    const mode = row.querySelector('select').value;
    row.classList.toggle('changed', fuDate !== row.dataset.originalDate || mode !== row.dataset.originalMode);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  els.refresh.addEventListener('click', load);
  els.save.addEventListener('click', save);
  els.saveEndpoint.addEventListener('click', () => {
    setEndpoint(els.endpoint.value);
    load();
  });

  els.endpoint.value = configuredEndpoint();
  load();
})();
