(() => {
  // Voter identity — persisted in localStorage
  let voterUid = localStorage.getItem('sanctuary_voter_uid');
  if (!voterUid) {
    voterUid = crypto.randomUUID();
    localStorage.setItem('sanctuary_voter_uid', voterUid);
  }

  // Track which items this user has promoted
  function getPromotedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem('sanctuary_promoted') || '[]'));
    } catch {
      return new Set();
    }
  }

  function savePromotedSet(set) {
    localStorage.setItem('sanctuary_promoted', JSON.stringify([...set]));
  }

  const listEl = document.getElementById('suggestions-list');
  const form = document.getElementById('suggestion-form');
  const toastEl = document.getElementById('toast');

  // --- Toast ---
  function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    setTimeout(() => toastEl.classList.remove('visible'), duration);
  }

  // --- Format Date ---
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // --- Load & Render ---
  async function loadSuggestions() {
    try {
      const res = await fetch('/api/suggestions');
      const items = await res.json();
      const promoted = getPromotedSet();

      if (items.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No suggestions yet. Be the first to share!</div>';
        return;
      }

      listEl.innerHTML = '';
      items.forEach(item => {
        listEl.appendChild(renderCard(item, promoted.has(item.id)));
      });
    } catch (err) {
      listEl.innerHTML = '<div class="empty-state">Unable to load suggestions.</div>';
    }
  }

  function renderCard(item, alreadyPromoted) {
    const card = document.createElement('div');
    card.className = 'suggestion-card' + (item.is_private ? ' card-anonymous' : '');

    let responseHtml = '';
    if (item.board_response) {
      responseHtml = `
        <div class="board-response">
          <div class="board-response-label">Board Response</div>
          ${escapeHtml(item.board_response)}
        </div>`;
    }

    const authorHtml = item.is_private
      ? `<div class="card-author anonymous-author">Anonymous Resident</div>`
      : `<div class="card-author">${escapeHtml(item.name)}</div>
         <div class="card-address">${escapeHtml(item.address)}</div>`;

    card.innerHTML = `
      <div class="card-header">
        <div>${authorHtml}</div>
        <button class="promote-btn ${alreadyPromoted ? 'promoted' : ''}" data-id="${item.id}" ${alreadyPromoted ? 'disabled' : ''} title="${alreadyPromoted ? 'You promoted this' : 'Promote this suggestion'}">
          <span class="arrow">&#9650;</span>
          <span class="count">${item.promotions}</span>
          <span class="promote-label">Promote</span>
          <span class="promoted-label">Promoted</span>
        </button>
      </div>
      <div class="card-body">${escapeHtml(item.suggestion)}</div>
      <div class="card-footer">
        <span class="card-date">${formatDate(item.created_at)}</span>
      </div>
      ${responseHtml}
    `;

    return card;
  }

  // --- Promote ---
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.promote-btn');
    if (!btn || btn.disabled) return;

    const id = btn.dataset.id;

    try {
      const res = await fetch(`/api/suggestions/${id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_uid: voterUid }),
      });

      if (res.ok) {
        const data = await res.json();
        btn.querySelector('.count').textContent = data.promotions;
        btn.classList.add('pop');
        setTimeout(() => {
          btn.classList.remove('pop');
          btn.classList.add('promoted');
          btn.disabled = true;
        }, 300);

        const promoted = getPromotedSet();
        promoted.add(id);
        savePromotedSet(promoted);

        showToast('Suggestion promoted!');
      } else if (res.status === 409) {
        btn.classList.add('promoted');
        btn.disabled = true;
        showToast('You have already promoted this item.');
      }
    } catch {
      showToast('Failed to promote. Please try again.');
    }
  });

  // --- Submit Form ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      name: form.name.value.trim(),
      address: form.address.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      suggestion: form.suggestion.value.trim(),
      is_private: form.is_private.checked,
    };

    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.reset();
        showToast(payload.is_private
          ? 'Private suggestion submitted. Only the board will see it.'
          : 'Suggestion submitted successfully!');
        loadSuggestions();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to submit.');
      }
    } catch {
      showToast('Failed to submit. Please try again.');
    }
  });

  // --- Escape HTML ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  loadSuggestions();
})();
