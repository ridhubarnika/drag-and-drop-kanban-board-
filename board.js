/* =============================================
   KanFlow — board.js
   Features: Drag & Drop (native HTML API),
   Inline editing, Priority badges, localStorage
   persistence, Search & Filter, Keyboard nav
   ============================================= */

'use strict';

// ── Data model ──────────────────────────────────
const DEFAULT_BOARD = {
  columns: [
    { id: 'backlog',    title: 'Backlog',      cards: [] },
    { id: 'todo',       title: 'To Do',        cards: [] },
    { id: 'inprogress', title: 'In Progress',  cards: [] },
    { id: 'done',       title: 'Done',         cards: [] },
  ]
};

function loadBoard() {
  const raw = localStorage.getItem('kanban-board');
  return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_BOARD));
}

function saveBoard(board) {
  localStorage.setItem('kanban-board', JSON.stringify(board));
}

// ── State ────────────────────────────────────────
let board = loadBoard();
let draggedCardId  = null;
let draggedFromCol = null;
let activeFilter   = 'all';
let searchQuery    = '';
let openDropdown   = null;   // { el, cardId, colId }
let openContextMenu = null;  // DOM node

// ── Helpers ──────────────────────────────────────
function uid() {
  return 'card_' + Math.random().toString(36).slice(2, 9);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function colById(id) {
  return board.columns.find(c => c.id === id);
}

function cardById(cardId) {
  for (const col of board.columns) {
    const card = col.cards.find(c => c.id === cardId);
    if (card) return { card, col };
  }
  return null;
}

// ── Drag & Drop ──────────────────────────────────
function onDragStart(e, cardId, colId) {
  draggedCardId  = cardId;
  draggedFromCol = colId;
  e.dataTransfer.setData('text/plain', cardId);
  e.currentTarget.classList.add('dragging');
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  draggedCardId  = null;
  draggedFromCol = null;
}

// Returns the card element whose bottom edge is closest above y
function getCardAfterCursor(column, y) {
  const cards = [...column.querySelectorAll('.card:not(.dragging)')];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: card };
    }
    return closest;
  }, { offset: -Infinity }).element;
}

function onDragOver(e, colId) {
  e.preventDefault();
  const list = document.querySelector(`[data-col="${colId}"] .cards-list`);
  if (list) list.classList.add('drag-over');
}

function onDragLeave(e, colId) {
  const list = document.querySelector(`[data-col="${colId}"] .cards-list`);
  if (list) list.classList.remove('drag-over');
}

function onDrop(e, targetColId) {
  e.preventDefault();
  const list = document.querySelector(`[data-col="${targetColId}"] .cards-list`);
  if (list) list.classList.remove('drag-over');
  if (!draggedCardId) return;

  const sourceCol = colById(draggedFromCol);
  const targetCol = colById(targetColId);
  if (!sourceCol || !targetCol) return;

  // Remove card from source
  const idx = sourceCol.cards.findIndex(c => c.id === draggedCardId);
  if (idx === -1) return;
  const [card] = sourceCol.cards.splice(idx, 1);

  // Find insertion point
  const afterEl = getCardAfterCursor(list, e.clientY);
  if (afterEl) {
    const afterId = afterEl.dataset.cardId;
    const afterIdx = targetCol.cards.findIndex(c => c.id === afterId);
    targetCol.cards.splice(afterIdx, 0, card);
  } else {
    targetCol.cards.push(card);
  }

  saveBoard(board);
  render();
}

// ── Inline editing ────────────────────────────────
function makeEditable(el, cardId, field) {
  el.setAttribute('contenteditable', 'true');
  el.focus();

  const original = el.textContent;

  function commit() {
    el.removeAttribute('contenteditable');
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('blur', commit);
    const val = el.textContent.trim();
    if (!val) { el.textContent = original; return; }
    const found = cardById(cardId);
    if (found) {
      found.card[field] = val;
      saveBoard(board);
      applyFilters();
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { el.textContent = original; commit(); }
  }

  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', commit);
}

// ── Priority dropdown ─────────────────────────────
function closePriorityDropdown() {
  if (openDropdown) {
    openDropdown.el.remove();
    openDropdown = null;
  }
}

function openPriorityDropdown(badge, cardId) {
  closePriorityDropdown();

  const dd = document.createElement('div');
  dd.className = 'priority-dropdown';

  ['P1', 'P2', 'P3', 'P4'].forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.addEventListener('click', () => {
      const found = cardById(cardId);
      if (found) {
        found.card.priority = p;
        saveBoard(board);
        render();
        applyFilters();
      }
      closePriorityDropdown();
    });
    dd.appendChild(btn);
  });

  // Position under badge
  const rect = badge.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top  = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';

  document.body.appendChild(dd);
  openDropdown = { el: dd, cardId };
}

// ── Context menu (keyboard) ───────────────────────
function closeContextMenu() {
  if (openContextMenu) { openContextMenu.remove(); openContextMenu = null; }
}

function openContextMenuForCard(cardEl, cardId, colId) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  const colIds = board.columns.map(c => c.id);
  const currentIdx = colIds.indexOf(colId);

  // Move next/prev column
  if (currentIdx > 0) {
    const prevCol = board.columns[currentIdx - 1];
    const btn = document.createElement('button');
    btn.textContent = `← Move to ${prevCol.title}`;
    btn.addEventListener('click', () => { moveCardToCol(cardId, colId, prevCol.id); closeContextMenu(); });
    menu.appendChild(btn);
  }
  if (currentIdx < colIds.length - 1) {
    const nextCol = board.columns[currentIdx + 1];
    const btn = document.createElement('button');
    btn.textContent = `Move to ${nextCol.title} →`;
    btn.addEventListener('click', () => { moveCardToCol(cardId, colId, nextCol.id); closeContextMenu(); });
    menu.appendChild(btn);
  }

  const sep = document.createElement('div');
  sep.className = 'sep';
  menu.appendChild(sep);

  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑 Delete card';
  delBtn.className = 'danger';
  delBtn.addEventListener('click', () => { deleteCard(cardId, colId); closeContextMenu(); });
  menu.appendChild(delBtn);

  const rect = cardEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top  = rect.top + 'px';
  menu.style.left = (rect.right + 6) + 'px';

  document.body.appendChild(menu);
  openContextMenu = menu;
  menu.querySelector('button')?.focus();
}

function moveCardToCol(cardId, fromColId, toColId) {
  const src = colById(fromColId);
  const dst = colById(toColId);
  const idx = src.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  const [card] = src.cards.splice(idx, 1);
  dst.cards.push(card);
  saveBoard(board);
  render();
  applyFilters();
}

// ── Delete ────────────────────────────────────────
function deleteCard(cardId, colId) {
  const col = colById(colId);
  col.cards = col.cards.filter(c => c.id !== cardId);
  saveBoard(board);
  render();
  applyFilters();
}

// ── Add card ──────────────────────────────────────
function showAddForm(colId) {
  const area = document.querySelector(`[data-col="${colId}"] .add-card-area`);
  area.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'add-card-form';

  const ta = document.createElement('textarea');
  ta.placeholder = 'Card title…';
  ta.rows = 2;
  form.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const confirm = document.createElement('button');
  confirm.className = 'btn-confirm';
  confirm.textContent = 'Add card';

  const cancel = document.createElement('button');
  cancel.className = 'btn-cancel';
  cancel.textContent = 'Cancel';

  actions.appendChild(confirm);
  actions.appendChild(cancel);
  form.appendChild(actions);
  area.appendChild(form);
  ta.focus();

  confirm.addEventListener('click', () => {
    const title = ta.value.trim();
    if (!title) { ta.focus(); return; }
    addCard(colId, title);
  });

  cancel.addEventListener('click', () => resetAddArea(colId));

  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const title = ta.value.trim();
      if (!title) return;
      addCard(colId, title);
    }
    if (e.key === 'Escape') resetAddArea(colId);
  });
}

function addCard(colId, title) {
  const col = colById(colId);
  col.cards.push({
    id:          uid(),
    title,
    description: '',
    priority:    'P3',
    createdAt:   new Date().toISOString()
  });
  saveBoard(board);
  render();
  applyFilters();
}

function resetAddArea(colId) {
  const area = document.querySelector(`[data-col="${colId}"] .add-card-area`);
  area.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'add-card-btn';
  btn.textContent = '+ Add Card';
  btn.addEventListener('click', () => showAddForm(colId));
  area.appendChild(btn);
}

// ── Render ────────────────────────────────────────
function renderCard(card, colId) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId  = card.id;
  el.dataset.priority = card.priority;
  el.draggable = true;
  el.tabIndex  = 0;
  el.setAttribute('role', 'listitem');
  el.setAttribute('aria-label', `Card: ${card.title}, Priority ${card.priority}`);

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = card.title;
  titleEl.setAttribute('role', 'heading');
  el.appendChild(titleEl);

  // Double-click to edit title
  titleEl.addEventListener('dblclick', () => makeEditable(titleEl, card.id, 'title'));

  // Description
  const descEl = document.createElement('div');
  descEl.className = 'card-description';
  descEl.textContent = card.description || '';
  el.appendChild(descEl);
  descEl.addEventListener('dblclick', () => makeEditable(descEl, card.id, 'description'));

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  // Priority badge
  const badge = document.createElement('span');
  badge.className = 'priority-badge';
  badge.dataset.p  = card.priority;
  badge.textContent = card.priority;
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-label', `Priority ${card.priority}, click to change`);
  badge.setAttribute('tabindex', '0');
  badge.addEventListener('click', e => { e.stopPropagation(); openPriorityDropdown(badge, card.id); });
  badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPriorityDropdown(badge, card.id); } });
  meta.appendChild(badge);

  // Timestamp
  const ts = document.createElement('span');
  ts.className = 'card-ts';
  ts.textContent = formatDate(card.createdAt);
  meta.appendChild(ts);

  // Delete
  const del = document.createElement('button');
  del.className = 'card-delete';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Delete card');
  del.addEventListener('click', e => { e.stopPropagation(); deleteCard(card.id, colId); });
  meta.appendChild(del);

  el.appendChild(meta);

  // Drag events
  el.addEventListener('dragstart', e => onDragStart(e, card.id, colId));
  el.addEventListener('dragend',   e => onDragEnd(e));

  // Keyboard: Space → context menu, Delete → delete
  el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      openContextMenuForCard(el, card.id, colId);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target === el) deleteCard(card.id, colId);
    }
  });

  return el;
}

function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  board.columns.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    if (col.id === 'done') colEl.classList.add('done-col');
    colEl.dataset.col = col.id;

    // Header
    const header = document.createElement('div');
    header.className = 'column-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'column-title';
    titleEl.textContent = col.title;

    const countEl = document.createElement('span');
    countEl.className = 'column-count';
    countEl.textContent = col.cards.length;

    header.appendChild(titleEl);
    header.appendChild(countEl);
    colEl.appendChild(header);

    // Cards list
    const list = document.createElement('div');
    list.className = 'cards-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', `${col.title} column`);

    col.cards.forEach(card => list.appendChild(renderCard(card, col.id)));

    // Drop events on list
    list.addEventListener('dragover',  e => onDragOver(e, col.id));
    list.addEventListener('dragleave', e => onDragLeave(e, col.id));
    list.addEventListener('drop',      e => onDrop(e, col.id));

    colEl.appendChild(list);

    // Add card area
    const addArea = document.createElement('div');
    addArea.className = 'add-card-area';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-card-btn';
    addBtn.textContent = '+ Add Card';
    addBtn.addEventListener('click', () => showAddForm(col.id));
    addArea.appendChild(addBtn);
    colEl.appendChild(addArea);

    boardEl.appendChild(colEl);
  });
}

// ── Search & Filter ───────────────────────────────
function applyFilters() {
  const q = searchQuery.toLowerCase();
  document.querySelectorAll('.card').forEach(el => {
    const title = el.querySelector('.card-title')?.textContent.toLowerCase() || '';
    const desc  = el.querySelector('.card-description')?.textContent.toLowerCase() || '';
    const prio  = el.dataset.priority;

    const matchesSearch = !q || title.includes(q) || desc.includes(q);
    const matchesFilter = activeFilter === 'all' || prio === activeFilter;

    el.classList.toggle('hidden', !(matchesSearch && matchesFilter));
    if (!matchesSearch && matchesFilter) {
      el.style.opacity = '0.3';
      el.classList.remove('hidden');
    } else {
      el.style.opacity = '';
    }
  });

  // Update column counts
  board.columns.forEach(col => {
    const colEl = document.querySelector(`[data-col="${col.id}"]`);
    if (!colEl) return;
    const visible = colEl.querySelectorAll('.card:not(.hidden)').length;
    const countEl = colEl.querySelector('.column-count');
    if (countEl) countEl.textContent = visible;
  });
}

// ── Global event listeners ────────────────────────
document.addEventListener('click', e => {
  if (openDropdown && !openDropdown.el.contains(e.target)) closePriorityDropdown();
  if (openContextMenu && !openContextMenu.contains(e.target)) closeContextMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePriorityDropdown(); closeContextMenu(); }
});

// Search
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  applyFilters();
});

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  });
});

// ── Init ──────────────────────────────────────────
render();
applyFilters();
