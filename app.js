(function () {
  const state = {
    data: {withoutEvents: [], withEvents: [], cleared: [], pendingDischarges: []},
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
    cleared: document.getElementById('cleared'),
    discharges: document.getElementById('discharges'),
    withoutCount: document.getElementById('without-count'),
    withCount: document.getElementById('with-count'),
    clearedCount: document.getElementById('cleared-count'),
    dischargeCount: document.getElementById('discharge-count'),
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
        state.data = data || {withoutEvents: [], withEvents: [], cleared: []};
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
        state.data = data || {withoutEvents: [], withEvents: [], cleared: []};
        render();
        setStatus('Saved.');
      })
      .catch((error) => setStatus(error.message || String(error), true))
      .finally(() => setBusy(false));
  }

  function changedRows() {
    return Array.from(document.querySelectorAll('[data-row]')).reduce((updates, row) => {
      const fuDate = row.querySelector('[data-fu-date]').value;
      const mode = row.querySelector('[data-mode]').value;
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
    const cleared = state.data.cleared || [];
    const pendingDischarges = state.data.pendingDischarges || [];
    els.withoutCount.textContent = String(withoutEvents.length);
    els.withCount.textContent = String(withEvents.length);
    els.clearedCount.textContent = String(cleared.length);
    els.dischargeCount.textContent = String(pendingDischarges.length);
    els.summary.textContent = `${withoutEvents.length} need dates, ${withEvents.length} scheduled, ${cleared.length} cleared, ${pendingDischarges.length} possible discharge${pendingDischarges.length === 1 ? '' : 's'}.`;
    renderSection(els.without, withoutEvents, 'needs');
    renderSection(els.with, withEvents, 'scheduled');
    renderSection(els.cleared, cleared, 'cleared');
    renderPendingDischarges(pendingDischarges);
  }

  function renderPendingDischarges(rows) {
    if (!rows.length) {
      els.discharges.innerHTML = '<div class="empty">No possible discharges detected.</div>';
      return;
    }
    els.discharges.innerHTML = [
      '<div class="discharge-list">',
      ...rows.map((row) => `
        <article class="discharge-card" data-discharge-patient="${escapeHtml(row.patientName)}">
          <div>
            <strong>${escapeHtml(row.displayName || row.patientName)}</strong>
            <p>${escapeHtml(row.futureEventCount)} future managed visit${Number(row.futureEventCount) === 1 ? '' : 's'} remain; first is ${escapeHtml(displayEndDate(row.firstFutureVisitDate))}.</p>
          </div>
          <label>Effective discharge date
            <input data-discharge-date type="date" value="${escapeHtml(row.detectedDate || '')}">
          </label>
          <button class="danger-button" type="button" data-confirm-discharge>Confirm patient discharged</button>
        </article>
      `),
      '</div>',
    ].join('');
  }

  function confirmDischarge(card) {
    const patientName = card.dataset.dischargePatient;
    const displayName = card.querySelector('strong').textContent || patientName;
    const endDate = card.querySelector('[data-discharge-date]').value;
    if (!endDate) {
      setStatus('Choose the effective discharge date first.', true);
      return;
    }
    const message = [
      `Confirm ${displayName} discharged on ${endDate}?`,
      '',
      'This will mark the patient inactive and permanently delete linked Bayshore calendar visits on and after that date.',
      'Unrelated calendar events will not be touched.',
    ].join('\n');
    if (!window.confirm(message)) return;

    setBusy(true);
    setStatus('Confirming discharge and removing future visits...');
    api('confirmDischarge', {patientName, endDate})
      .then((result) => api('patients').then((data) => {
        state.data = data || {withoutEvents: [], withEvents: [], cleared: [], pendingDischarges: []};
        render();
        return result;
      }))
      .then((result) => {
        const visits = Number(result && result.futureEventsRemoved || 0);
        const followUps = Number(result && result.followUpEventsRemoved || 0);
        const followUpText = followUps ? ` and ${followUps} FU event${followUps === 1 ? '' : 's'}` : '';
        setStatus(`Discharge confirmed. Removed ${visits} future visit${visits === 1 ? '' : 's'}${followUpText}.`);
      })
      .catch((error) => setStatus(error.message || String(error), true))
      .finally(() => setBusy(false));
  }

  function renderSection(target, rows, sectionState) {
    if (!rows.length) {
      target.innerHTML = '<div class="empty">No patients in this section.</div>';
      return;
    }

    target.innerHTML = [
      '<div class="table-wrap"><table>',
      '<thead><tr><th>Patient</th><th>End Date</th><th>Last FU</th><th>Next FU</th><th>Handling</th><th>Allowance</th><th>Status</th><th>Actions</th></tr></thead>',
      '<tbody>',
      ...rows.map((row) => rowHtml(row, sectionState)),
      '</tbody></table></div>',
    ].join('');

    target.querySelectorAll('input, select').forEach((control) => {
      control.addEventListener('change', markChanged);
    });
  }

  function rowHtml(row, sectionState) {
    const originalMode = row.calendarStatus === 'Manual' ? 'manual' : 'auto';
    const patientName = row.displayName || row.patientName || '';
    const allowance = numericAllowance(row.weeklyAllowance || row.detectedVisitFrequency);
    const color = patientColor(patientName);
    const showDateControls = sectionState !== 'cleared';
    const statusText = sectionState === 'needs'
      ? 'Needs FU Date'
      : sectionState === 'cleared'
        ? 'Cleared'
        : (row.calendarStatus || 'FU Scheduled');
    const actions = sectionState === 'needs'
      ? '<button class="mini-button clear-fu" type="button" data-clear-fu>PT Cleared</button>'
      : sectionState === 'cleared'
        ? '<button class="mini-button" type="button" data-schedule-fu>Schedule FU</button>'
        : '';
    return `
      <tr class="fu-row fu-${sectionState}${showDateControls ? '' : ' date-collapsed'}" data-row="${escapeHtml(row.rowNumber)}" data-patient="${escapeHtml(row.patientName || patientName)}" data-display-name="${escapeHtml(patientName)}" data-original-date="${escapeHtml(row.fuDate || '')}" data-original-mode="${originalMode}" data-original-allowance="${escapeHtml(allowance)}" style="--patient-color: ${color}">
        <td class="patient" data-label="Patient"><span class="patient-swatch"></span>${escapeHtml(patientName)}</td>
        <td data-label="End Date">
          <div class="end-date-cell">
            <span class="end-date-pill">${escapeHtml(displayEndDate(row.patientEndDate) || 'Not refreshed')}</span>
            <button class="mini-button override-end" type="button" data-override-end>Early D/C</button>
          </div>
        </td>
        <td data-label="Last FU">${escapeHtml(displayEndDate(row.lastFuDate) || 'None')}</td>
        <td data-label="Next FU"><input data-fu-date type="date" value="${escapeHtml(row.fuDate || '')}"></td>
        <td data-label="Handling">
          <select data-mode>
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
        <td data-label="Status"><span class="state-pill state-${sectionState}">${escapeHtml(statusText)}</span></td>
        <td data-label="Actions">${actions}</td>
      </tr>
    `;
  }

  function markChanged(event) {
    const row = event.target.closest('[data-row]');
    const fuDate = row.querySelector('[data-fu-date]').value;
    const mode = row.querySelector('[data-mode]').value;
    const allowance = row.querySelector('[data-allowance]').value;
    row.classList.toggle('changed', fuDate !== row.dataset.originalDate || mode !== row.dataset.originalMode || allowance !== row.dataset.originalAllowance);
  }

  function clearFollowUp(row) {
    const name = row.dataset.displayName || row.dataset.patient || 'this patient';
    if (!window.confirm(`Mark ${name} as cleared with no further FU needed?`)) return;
    setBusy(true);
    setStatus('Marking cleared...');
    api('clearFollowUp', {rowNumber: row.dataset.row})
      .then((data) => {
        state.data = data || {withoutEvents: [], withEvents: [], cleared: []};
        render();
        setStatus('Marked cleared.');
      })
      .catch((error) => setStatus(error.message || String(error), true))
      .finally(() => setBusy(false));
  }

  function overrideEndDate(row) {
    const name = row.dataset.displayName || row.dataset.patient || 'this patient';
    const entered = window.prompt(`Enter early discharge date for ${name} as YYYY-MM-DD:`);
    if (entered === null) return;
    const endDate = String(entered || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setStatus('Use YYYY-MM-DD for the early discharge date.', true);
      return;
    }
    const message = [
      `Confirm early discharge override for ${name}?`,
      `New end date: ${endDate}`,
      '',
      'This will move the patient out of Current Patients, flag later calendar events for review, and mark the last in-range calendar event as Last Visit.',
    ].join('\n');
    if (!window.confirm(message)) return;

    setBusy(true);
    setStatus('Applying early discharge override...');
    api('overrideEndDate', {
      rowNumber: row.dataset.row,
      patientName: row.dataset.patient,
      endDate,
    })
      .then((result) => {
        return api('patients').then((data) => {
          state.data = data || {withoutEvents: [], withEvents: [], cleared: []};
          render();
          return result;
        });
      })
      .then((result) => {
        const flagged = result && typeof result.futureEventsFlagged === 'number' ? result.futureEventsFlagged : 0;
        setStatus(`Override saved. ${flagged} future event${flagged === 1 ? '' : 's'} flagged for review.`);
      })
      .catch((error) => setStatus(error.message || String(error), true))
      .finally(() => setBusy(false));
  }

  function stepAllowance(event) {
    const dischargeButton = event.target.closest('[data-confirm-discharge]');
    if (dischargeButton) {
      confirmDischarge(dischargeButton.closest('[data-discharge-patient]'));
      return;
    }
    const clearButton = event.target.closest('[data-clear-fu]');
    if (clearButton) {
      clearFollowUp(clearButton.closest('[data-row]'));
      return;
    }
    const scheduleButton = event.target.closest('[data-schedule-fu]');
    if (scheduleButton) {
      const row = scheduleButton.closest('[data-row]');
      row.classList.remove('date-collapsed');
      row.querySelector('[data-fu-date]').focus();
      return;
    }
    const overrideButton = event.target.closest('[data-override-end]');
    if (overrideButton) {
      overrideEndDate(overrideButton.closest('[data-row]'));
      return;
    }
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

  function displayEndDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
    }
    return text.replace(/\s+\d{1,2}:\d{2}:\d{2}.*$/, '');
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
