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
      const weeklyAllowance = row.querySelector('[data-allowance]').value;
      if (fuDate !== row.dataset.originalDate || mode !== row.dataset.originalMode || weeklyAllowance !== row.dataset.originalAllowance) {
        updates.push({
          rowNumber: row.dataset.row,
          fuDate,
          mode,
          weeklyAllowance,
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
    const patientName = row.displayName || row.patientName || '';
    const allowance = numericAllowance(row.weeklyAllowance);
    const color = patientColor(patientName);
    return `
      <tr data-row="${escapeHtml(row.rowNumber)}" data-original-date="${escapeHtml(row.fuDate || '')}" data-original-mode="${originalMode}" data-original-allowance="${escapeHtml(allowance)}" style="--patient-color: ${color}">
        <td class="patient" data-label="Patient"><span class="patient-swatch"></span>${escapeHtml(patientName)}</td>
        <td data-label="FU Date"><input type="date" value="${escapeHtml(row.fuDate || '')}"></td>
        <td data-label="Handling">
          <select>
            <option value="auto"${originalMode === 'auto' ? ' selected' : ''}>Create Google event</option>
            <option value="manual"${originalMode === 'manual' ? ' selected' : ''}>Already in calendar</option>
          </select>
        </td>
        <td data-label="Allowance">
          <div class="allowance-control">
            <button type="button" data-step="-1" aria-label="Decrease weekly visit allowance">-</button>
            <input data-allowance type="number" min="0" max="7" step="1" value="${escapeHtml(allowance)}">
            <button type="button" data-step="1" aria-label="Increase weekly visit allowance">+</button>
          </div>
        </td>
        <td data-label="Status">${escapeHtml(row.calendarStatus || '')}</td>
      </tr>
    `;
  }

  function markChanged(event) {
    const row = event.target.closest('[data-row]');
    const fuDate = row.querySelector('input[type="date"]').value;
    const mode = row.querySelector('select').value;
    const allowance = row.querySelector('[data-allowance]').value;
    row.classList.toggle('changed', fuDate !== row.dataset.originalDate || mode !== row.dataset.originalMode || allowance !== row.dataset.originalAllowance);
  }

  function stepAllowance(event) {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    const row = button.closest('[data-row]');
    const input = row.querySelector('[data-allowance]');
    const next = Math.min(7, Math.max(0, Number(input.value || 0) + Number(button.dataset.step)));
    input.value = String(next);
    markChanged({target: input});
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function numericAllowance(value) {
    const match = String(value || '').match(/\d+/);
    return match ? String(Number(match[0])) : '';
  }

  function patientColor(value) {
    const colors = [
      '#1a73e8',
      '#d93025',
      '#188038',
      '#f9ab00',
      '#9334e6',
      '#00acc1',
      '#e8710a',
      '#5f6368',
      '#c5221f',
      '#0b8043',
      '#b06000',
      '#3f51b5',
    ];
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  els.refresh.addEventListener('click', load);
  els.save.addEventListener('click', save);
  document.addEventListener('click', stepAllowance);
  els.saveEndpoint.addEventListener('click', () => {
    setEndpoint(els.endpoint.value);
    load();
  });

  els.endpoint.value = configuredEndpoint();
  load();
})();
