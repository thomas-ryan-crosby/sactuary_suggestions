(() => {
  const loginSection = document.getElementById('login-section');
  const adminContent = document.getElementById('admin-content');
  const adminList = document.getElementById('admin-list');
  const loginBtn = document.getElementById('login-btn');
  const keyInput = document.getElementById('admin-key');
  const toastEl = document.getElementById('toast');

  let adminKey = sessionStorage.getItem('sanctuary_admin_key') || '';
  let allItems = [];
  let currentFilter = 'all';

  // --- Toast ---
  function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    setTimeout(() => toastEl.classList.remove('visible'), duration);
  }

  // --- API Helper ---
  async function apiCall(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    if (res.status === 401) {
      sessionStorage.removeItem('sanctuary_admin_key');
      adminKey = '';
      showAuthUI(false);
      showToast('Invalid access key. Please try again.');
      throw new Error('Unauthorized');
    }
    return res;
  }

  // --- Auth UI ---
  function showAuthUI(authenticated) {
    if (authenticated) {
      loginSection.style.display = 'none';
      adminContent.style.display = 'block';
      loadSuggestions();
    } else {
      loginSection.style.display = 'flex';
      adminContent.style.display = 'none';
    }
  }

  // --- Login ---
  loginBtn.addEventListener('click', () => {
    adminKey = keyInput.value.trim();
    if (!adminKey) return showToast('Please enter the access key.');
    sessionStorage.setItem('sanctuary_admin_key', adminKey);
    showAuthUI(true);
  });

  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // --- Filter Tabs ---
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.filter-tab.active').classList.remove('active');
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderList();
    });
  });

  function filterItems(items) {
    switch (currentFilter) {
      case 'public': return items.filter(i => !i.is_private);
      case 'private': return items.filter(i => i.is_private);
      case 'unanswered': return items.filter(i => !i.board_response);
      default: return items;
    }
  }

  // --- Format Date ---
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // --- Load & Render ---
  async function loadSuggestions() {
    try {
      const res = await apiCall('GET', '/api/admin/suggestions');
      allItems = await res.json();
      renderList();
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        adminList.innerHTML = '<div class="empty-state">Failed to load submissions.</div>';
      }
    }
  }

  function renderList() {
    const filtered = filterItems(allItems);

    if (filtered.length === 0) {
      adminList.innerHTML = '<div class="empty-state">No submissions match this filter.</div>';
      return;
    }

    adminList.innerHTML = '';
    filtered.forEach(item => {
      adminList.appendChild(renderAdminCard(item));
    });
  }

  function renderAdminCard(item) {
    const card = document.createElement('div');
    card.className = 'admin-card';

    const privacyBadge = item.is_private
      ? '<span class="badge badge-private">Private</span>'
      : '<span class="badge badge-public">Public</span>';

    const responseBadge = item.board_response
      ? '<span class="badge badge-responded">Responded</span>'
      : '<span class="badge badge-pending">Needs Response</span>';

    card.innerHTML = `
      <div class="admin-card-meta">
        <strong>${escapeHtml(item.name)}</strong>
        <span style="color:var(--color-muted); font-size:0.85rem;">${escapeHtml(item.address)}</span>
        ${privacyBadge}
        ${responseBadge}
        <span class="badge badge-promotions">${item.promotions} promotion${item.promotions !== 1 ? 's' : ''}</span>
        <span style="color:var(--color-muted); font-size:0.8rem; margin-left:auto;">${formatDate(item.created_at)}</span>
      </div>
      <div class="admin-card-text">${escapeHtml(item.suggestion)}</div>
      <div class="admin-response-section">
        <label style="font-size:0.8rem; font-weight:500; color:var(--color-accent-light); text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:0.4rem;">Board Response</label>
        <textarea data-id="${item.id}" class="response-input">${escapeHtml(item.board_response || '')}</textarea>
        <div class="admin-actions">
          <button class="btn btn-success btn-sm save-response-btn" data-id="${item.id}">Save Response</button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}">Delete</button>
        </div>
      </div>
    `;

    return card;
  }

  // --- Save Response ---
  adminList.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.save-response-btn');
    if (saveBtn) {
      const id = saveBtn.dataset.id;
      const textarea = adminList.querySelector(`.response-input[data-id="${id}"]`);
      const response = textarea.value.trim();

      try {
        const res = await apiCall('PUT', `/api/admin/suggestions/${id}/respond`, { response });
        if (res.ok) {
          const updated = await res.json();
          const idx = allItems.findIndex(i => i.id === id);
          if (idx !== -1) allItems[idx] = updated;
          showToast('Response saved.');
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save response.');
        }
      } catch {
        showToast('Failed to save response.');
      }
      return;
    }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      if (!confirm('Are you sure you want to delete this submission? This cannot be undone.')) return;
      const id = deleteBtn.dataset.id;

      try {
        const res = await apiCall('DELETE', `/api/admin/suggestions/${id}`);
        if (res.ok) {
          allItems = allItems.filter(i => i.id !== id);
          renderList();
          showToast('Submission deleted.');
        } else {
          showToast('Failed to delete.');
        }
      } catch {
        showToast('Failed to delete.');
      }
    }
  });

  // --- Escape HTML ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  if (adminKey) {
    showAuthUI(true);
  } else {
    showAuthUI(false);
  }
})();
