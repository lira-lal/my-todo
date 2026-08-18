import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfGsQuQRlbUTRWDo5RJQwL9NdT1C_yFjc",
  authDomain: "my-todo-960ac.firebaseapp.com",
  projectId: "my-todo-960ac",
  storageBucket: "my-todo-960ac.firebasestorage.app",
  messagingSenderId: "447793022218",
  appId: "1:447793022218:web:8cca8d2cfb14f8b57526f3",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const STORAGE_KEY = "todo-app-state-v1";
const SYNC_ID_KEY = "todo-sync-id-v1";
const SYNC_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { todos: [], dumps: [] };
    const parsed = JSON.parse(raw);
    return {
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      dumps: Array.isArray(parsed.dumps) ? parsed.dumps : [],
    };
  } catch {
    return { todos: [], dumps: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncId) {
    setDoc(syncDocRef(), { todos: state.todos, dumps: state.dumps }).catch(() => {
      if (syncStatusEl) syncStatusEl.textContent = "동기화 실패 (오프라인이거나 규칙 설정이 필요해요)";
    });
  }
}

function makeSyncId() {
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += SYNC_CODE_CHARS[Math.floor(Math.random() * SYNC_CODE_CHARS.length)];
  }
  return id;
}

function syncDocRef() {
  return doc(db, "todoLists", syncId);
}

function initSync() {
  const isNewDevice = !syncId;
  if (isNewDevice) {
    syncId = makeSyncId();
    localStorage.setItem(SYNC_ID_KEY, syncId);
    setDoc(syncDocRef(), { todos: state.todos, dumps: state.dumps }).catch(() => {});
  }
  if (syncCodeDisplay) syncCodeDisplay.textContent = syncId;

  onSnapshot(
    syncDocRef(),
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.data();
      if (!data) return;
      state = {
        todos: Array.isArray(data.todos) ? data.todos : [],
        dumps: Array.isArray(data.dumps) ? data.dumps : [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      if (syncStatusEl) syncStatusEl.textContent = "동기화됨";
    },
    () => {
      if (syncStatusEl) syncStatusEl.textContent = "동기화 실패 (오프라인이거나 규칙 설정이 필요해요)";
    }
  );
}

function joinSync(newId) {
  localStorage.setItem(SYNC_ID_KEY, newId);
  location.reload();
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let state = loadState();
let syncId = localStorage.getItem(SYNC_ID_KEY);
let pendingDumpId = null;
let editingTodoId = null;
let expandedMemoIds = new Set();
let justOpenedMemoId = null;
let expandedSubtaskIds = new Set();
let justOpenedSubtaskId = null;
let editingSubtaskId = null;
let expandedSubtaskMemoIds = new Set();
let justOpenedSubtaskMemoId = null;
let editingDateId = null;
let justOpenedDateId = null;

const todayDateEl = document.getElementById("todayDate");
const tabs = document.getElementById("tabs");
const panels = document.querySelectorAll("[data-panel]");
const dumpForm = document.getElementById("dumpForm");
const dumpInput = document.getElementById("dumpInput");
const dumpList = document.getElementById("dumpList");
const todoForm = document.getElementById("todoForm");
const todoInput = document.getElementById("todoInput");
const todoDateInput = document.getElementById("todoDate");
const todoGroups = document.getElementById("todoGroups");
const dateModal = document.getElementById("dateModal");
const modalDumpText = document.getElementById("modalDumpText");
const modalDateInput = document.getElementById("modalDateInput");
const modalCancel = document.getElementById("modalCancel");
const modalConfirm = document.getElementById("modalConfirm");
const syncBtn = document.getElementById("syncBtn");
const syncModal = document.getElementById("syncModal");
const syncCodeDisplay = document.getElementById("syncCodeDisplay");
const syncCopyBtn = document.getElementById("syncCopyBtn");
const syncStatusEl = document.getElementById("syncStatus");
const syncJoinInput = document.getElementById("syncJoinInput");
const syncJoinBtn = document.getElementById("syncJoinBtn");
const syncCloseBtn = document.getElementById("syncCloseBtn");

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatBadge(str) {
  const d = parseDate(str);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });
}

function renderTodayHeader() {
  const now = new Date();
  todayDateEl.textContent = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function bucketFor(todo) {
  if (!todo.date) return "noDate";
  const today = dateOnly(new Date());
  const target = dateOnly(parseDate(todo.date));
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "thisWeek";
  return "later";
}

const BUCKET_META = {
  overdue: { label: "기한 지남", cls: "overdue" },
  today: { label: "오늘", cls: "" },
  tomorrow: { label: "내일", cls: "" },
  thisWeek: { label: "이번 주", cls: "" },
  later: { label: "나중에", cls: "" },
  noDate: { label: "날짜 미정", cls: "" },
};

const BUCKET_ORDER = ["overdue", "today", "tomorrow", "thisWeek", "later", "noDate"];

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text) node.textContent = opts.text;
  if (opts.type) node.type = opts.type;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  if (opts.onclick) node.addEventListener("click", opts.onclick);
  if (opts.onchange) node.addEventListener("change", opts.onchange);
  children.forEach((c) => node.appendChild(c));
  return node;
}

function autoResizeTextarea(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

function syncCompletionFromSubtasks(todo) {
  if (todo.subtasks && todo.subtasks.length > 0) {
    todo.completed = todo.subtasks.every((s) => s.completed);
  }
}

function commitSubtaskEdit(sub, value) {
  const trimmed = value.trim();
  if (trimmed) {
    sub.text = trimmed;
    saveState();
  }
  editingSubtaskId = null;
  render();
}

function buildSubtaskItem(todo, sub) {
  const cb = el("input", {
    attrs: { type: "checkbox" },
    onchange: () => {
      sub.completed = cb.checked;
      syncCompletionFromSubtasks(todo);
      saveState();
      render();
    },
  });
  cb.checked = sub.completed;

  let txt;
  if (editingSubtaskId === sub.id) {
    txt = el("textarea", {
      class: "subtask-edit-input",
      attrs: { rows: "1" },
    });
    txt.value = sub.text;
    const commit = () => commitSubtaskEdit(sub, txt.value);
    txt.addEventListener("input", () => autoResizeTextarea(txt));
    txt.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        txt.removeEventListener("blur", commit);
        editingSubtaskId = null;
        render();
      }
    });
    txt.addEventListener("blur", commit);
  } else {
    txt = el("span", {
      class: "subtask-text" + (sub.completed ? " completed" : ""),
      text: sub.text,
      attrs: { title: "클릭해서 수정" },
    });
    txt.addEventListener("click", () => {
      editingSubtaskId = sub.id;
      render();
    });
  }

  const hasMemo = Boolean(sub.memo && sub.memo.trim());
  const memoExpanded = expandedSubtaskMemoIds.has(sub.id);

  const memoToggleBtn = el("button", {
    class: "subtask-memo-toggle" + (hasMemo ? " has-memo" : ""),
    text: "메모",
    attrs: { type: "button", title: "메모 추가/보기" },
    onclick: () => {
      if (expandedSubtaskMemoIds.has(sub.id)) {
        expandedSubtaskMemoIds.delete(sub.id);
      } else {
        expandedSubtaskMemoIds.add(sub.id);
        justOpenedSubtaskMemoId = sub.id;
      }
      render();
    },
  });

  const del = el("button", {
    class: "subtask-delete",
    text: "×",
    attrs: { type: "button", "aria-label": "서브테스크 삭제" },
    onclick: () => {
      todo.subtasks = todo.subtasks.filter((s) => s.id !== sub.id);
      syncCompletionFromSubtasks(todo);
      saveState();
      render();
    },
  });

  const row = el("div", { class: "subtask-row" }, [
    el("div", { class: "subtask-row-main" }, [cb, txt, memoToggleBtn]),
    del,
  ]);
  const liChildren = [row];

  if (memoExpanded) {
    const memoInput = el("textarea", {
      class: "subtask-memo-input",
      attrs: { rows: "2", placeholder: "메모를 적어보세요…", "data-subtask-id": sub.id },
    });
    memoInput.value = sub.memo || "";
    memoInput.addEventListener("blur", () => {
      sub.memo = memoInput.value.trim();
      saveState();
      memoToggleBtn.classList.toggle("has-memo", Boolean(sub.memo));
    });
    liChildren.push(memoInput);
  } else if (hasMemo) {
    const preview = el("p", { class: "subtask-memo-preview", text: sub.memo });
    preview.addEventListener("click", () => {
      expandedSubtaskMemoIds.add(sub.id);
      justOpenedSubtaskMemoId = sub.id;
      render();
    });
    liChildren.push(preview);
  }

  return el("li", { class: "subtask-item" }, liChildren);
}

function buildTodoItem(todo) {
  const bucket = bucketFor(todo);
  const isOverdue = bucket === "overdue" && !todo.completed;

  const checkbox = el("input", {
    attrs: { type: "checkbox" },
    onchange: () => {
      todo.completed = checkbox.checked;
      if (todo.subtasks && todo.subtasks.length > 0) {
        todo.subtasks.forEach((s) => (s.completed = checkbox.checked));
      }
      saveState();
      render();
    },
  });
  checkbox.checked = todo.completed;

  let text;
  if (editingTodoId === todo.id) {
    text = el("textarea", {
      class: "todo-edit-input",
      attrs: { rows: "1" },
    });
    text.value = todo.text;
    const commit = () => commitTodoEdit(todo.id, text.value);
    text.addEventListener("input", () => autoResizeTextarea(text));
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        text.removeEventListener("blur", commit);
        editingTodoId = null;
        render();
      }
    });
    text.addEventListener("blur", commit);
  } else {
    text = el("span", { class: "todo-text", text: todo.text, attrs: { title: "클릭해서 수정" } });
    text.addEventListener("click", () => {
      editingTodoId = todo.id;
      render();
    });
  }

  const hasMemo = Boolean(todo.memo && todo.memo.trim());
  const isExpanded = expandedMemoIds.has(todo.id);

  const rowChildren = [checkbox, text];

  if (editingDateId === todo.id) {
    const dateInput = el("input", {
      class: "todo-date-input",
      attrs: { type: "date", "data-todo-id": todo.id },
    });
    dateInput.value = todo.date || "";
    dateInput.addEventListener("change", () => {
      todo.date = dateInput.value || null;
      saveState();
      editingDateId = null;
      render();
    });
    dateInput.addEventListener("blur", () => {
      if (editingDateId === todo.id) {
        editingDateId = null;
        render();
      }
    });
    rowChildren.push(dateInput);
  } else if (todo.date) {
    const dateBadge = el("span", {
      class: "todo-date-badge",
      text: formatBadge(todo.date),
      attrs: { title: "클릭해서 날짜 변경" },
    });
    dateBadge.addEventListener("click", () => {
      editingDateId = todo.id;
      justOpenedDateId = todo.id;
      render();
    });
    rowChildren.push(dateBadge);
  } else {
    const dateAddBtn = el("button", {
      class: "todo-date-add-btn",
      text: "+ 날짜",
      attrs: { type: "button", title: "날짜 지정" },
      onclick: () => {
        editingDateId = todo.id;
        justOpenedDateId = todo.id;
        render();
      },
    });
    rowChildren.push(dateAddBtn);
  }

  const memoToggleBtn = el("button", {
    class: "todo-memo-toggle" + (hasMemo ? " has-memo" : ""),
    text: "메모",
    attrs: { type: "button", title: "메모 추가/보기" },
    onclick: () => {
      if (expandedMemoIds.has(todo.id)) {
        expandedMemoIds.delete(todo.id);
      } else {
        expandedMemoIds.add(todo.id);
        justOpenedMemoId = todo.id;
      }
      render();
    },
  });
  rowChildren.push(memoToggleBtn);

  const subtasks = todo.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const doneSubCount = subtasks.filter((s) => s.completed).length;
  const subExpanded = expandedSubtaskIds.has(todo.id);

  const subtaskToggleBtn = el("button", {
    class: "todo-subtask-toggle" + (hasSubtasks ? " has-subtasks" : ""),
    text: hasSubtasks ? `서브 ${doneSubCount}/${subtasks.length}` : "+ 서브테스크",
    attrs: { type: "button", title: "서브테스크" },
    onclick: () => {
      if (expandedSubtaskIds.has(todo.id)) {
        expandedSubtaskIds.delete(todo.id);
      } else {
        expandedSubtaskIds.add(todo.id);
        justOpenedSubtaskId = todo.id;
      }
      render();
    },
  });
  rowChildren.push(subtaskToggleBtn);

  const deleteBtn = el("button", {
    class: "todo-delete",
    text: "×",
    attrs: { "aria-label": "삭제", title: "삭제" },
    onclick: () => {
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      saveState();
      render();
    },
  });

  const classes = ["todo-item"];
  if (todo.completed) classes.push("completed");
  if (isOverdue) classes.push("overdue");

  const row = el("div", { class: "todo-row" }, [
    el("div", { class: "todo-row-main" }, rowChildren),
    deleteBtn,
  ]);
  const liChildren = [row];

  if (isExpanded) {
    const memoInput = el("textarea", {
      class: "todo-memo-input",
      attrs: { rows: "2", placeholder: "메모를 적어보세요…", "data-todo-id": todo.id },
    });
    memoInput.value = todo.memo || "";
    memoInput.addEventListener("blur", () => {
      todo.memo = memoInput.value.trim();
      saveState();
      memoToggleBtn.classList.toggle("has-memo", Boolean(todo.memo));
    });
    liChildren.push(memoInput);
  } else if (hasMemo) {
    const preview = el("p", { class: "todo-memo-preview", text: todo.memo });
    preview.addEventListener("click", () => {
      expandedMemoIds.add(todo.id);
      justOpenedMemoId = todo.id;
      render();
    });
    liChildren.push(preview);
  }

  if (subExpanded) {
    const panelChildren = [];
    if (hasSubtasks) {
      panelChildren.push(
        el(
          "ul",
          { class: "subtask-list" },
          subtasks.map((s) => buildSubtaskItem(todo, s))
        )
      );
    }

    const subInput = el("input", {
      class: "subtask-input",
      attrs: { type: "text", placeholder: "서브테스크 추가", "data-todo-id": todo.id },
    });
    const subForm = el(
      "form",
      { class: "subtask-form" },
      [subInput, el("button", { class: "subtask-add-btn", text: "추가", attrs: { type: "submit" } })]
    );
    subForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = subInput.value.trim();
      if (!val) return;
      todo.subtasks = todo.subtasks || [];
      todo.subtasks.push({ id: makeId(), text: val, completed: false, memo: "" });
      syncCompletionFromSubtasks(todo);
      saveState();
      expandedSubtaskIds.add(todo.id);
      justOpenedSubtaskId = todo.id;
      render();
    });
    subInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        subForm.requestSubmit();
      }
    });
    panelChildren.push(subForm);

    liChildren.push(el("div", { class: "subtask-panel" }, panelChildren));
  }

  return el("li", { class: classes.join(" ") }, liChildren);
}

function renderTodos() {
  todoGroups.innerHTML = "";

  const active = state.todos.filter((t) => !t.completed);
  const completed = state.todos.filter((t) => t.completed);

  if (state.todos.length === 0) {
    todoGroups.appendChild(el("p", { class: "empty", text: "할 일이 없어요. 위에서 추가해보세요." }));
    return;
  }

  const grouped = {};
  BUCKET_ORDER.forEach((b) => (grouped[b] = []));
  active.forEach((t) => grouped[bucketFor(t)].push(t));

  BUCKET_ORDER.forEach((bucketKey) => {
    const items = grouped[bucketKey];
    if (items.length === 0) return;
    const meta = BUCKET_META[bucketKey];

    const list = el(
      "ul",
      { class: "todo-list" },
      items.map((t) => buildTodoItem(t))
    );

    const groupEl = el("div", { class: `todo-group ${meta.cls}`.trim() }, [
      el("div", { class: "todo-group-title" }, [
        el("span", { text: meta.label }),
        el("span", { class: "todo-group-count", text: String(items.length) }),
      ]),
      list,
    ]);
    todoGroups.appendChild(groupEl);
  });

  if (active.length === 0) {
    todoGroups.appendChild(el("p", { class: "empty", text: "오늘 할 일을 다 끝냈어요 🎉" }));
  }

  if (completed.length > 0) {
    const isEditingCompleted =
      completed.some((t) => t.id === editingTodoId) ||
      completed.some((t) => expandedMemoIds.has(t.id)) ||
      completed.some((t) => expandedSubtaskIds.has(t.id)) ||
      completed.some((t) => (t.subtasks || []).some((s) => s.id === editingSubtaskId)) ||
      completed.some((t) => (t.subtasks || []).some((s) => expandedSubtaskMemoIds.has(s.id))) ||
      completed.some((t) => t.id === editingDateId);
    const details = el("details", { class: "completed-section" }, [
      el("summary", { text: `완료됨 (${completed.length})` }),
      el(
        "ul",
        { class: "todo-list" },
        completed.map((t) => buildTodoItem(t))
      ),
    ]);
    if (isEditingCompleted) details.open = true;
    todoGroups.appendChild(details);
  }

  if (editingTodoId) {
    const input = todoGroups.querySelector(".todo-edit-input");
    if (input) {
      autoResizeTextarea(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  if (justOpenedMemoId) {
    const memoInput = todoGroups.querySelector(`.todo-memo-input[data-todo-id="${justOpenedMemoId}"]`);
    if (memoInput) {
      memoInput.focus();
      memoInput.setSelectionRange(memoInput.value.length, memoInput.value.length);
    }
    justOpenedMemoId = null;
  }

  if (justOpenedSubtaskId) {
    const subInput = todoGroups.querySelector(`.subtask-input[data-todo-id="${justOpenedSubtaskId}"]`);
    if (subInput) subInput.focus();
    justOpenedSubtaskId = null;
  }

  if (editingSubtaskId) {
    const input = todoGroups.querySelector(".subtask-edit-input");
    if (input) {
      autoResizeTextarea(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  if (justOpenedSubtaskMemoId) {
    const memoInput = todoGroups.querySelector(
      `.subtask-memo-input[data-subtask-id="${justOpenedSubtaskMemoId}"]`
    );
    if (memoInput) {
      memoInput.focus();
      memoInput.setSelectionRange(memoInput.value.length, memoInput.value.length);
    }
    justOpenedSubtaskMemoId = null;
  }

  if (justOpenedDateId) {
    const dateInput = todoGroups.querySelector(`.todo-date-input[data-todo-id="${justOpenedDateId}"]`);
    if (dateInput) dateInput.focus();
    justOpenedDateId = null;
  }
}

function commitTodoEdit(id, value) {
  const trimmed = value.trim();
  const todo = state.todos.find((t) => t.id === id);
  if (todo) {
    if (trimmed) {
      todo.text = trimmed;
      saveState();
    }
  }
  editingTodoId = null;
  render();
}

function buildDumpItem(dump) {
  return el("li", { class: "dump-item" }, [
    el("p", { text: dump.text }),
    el("div", { class: "dump-item-actions" }, [
      el("button", {
        class: "to-todo",
        text: "→ 일정으로",
        onclick: () => openDateModal(dump.id),
      }),
      el("button", {
        text: "삭제",
        onclick: () => {
          state.dumps = state.dumps.filter((d) => d.id !== dump.id);
          saveState();
          render();
        },
      }),
    ]),
  ]);
}

function renderDumps() {
  dumpList.innerHTML = "";
  if (state.dumps.length === 0) {
    dumpList.appendChild(el("p", { class: "empty", text: "덤프함이 비었어요." }));
  } else {
    state.dumps
      .slice()
      .reverse()
      .forEach((d) => dumpList.appendChild(buildDumpItem(d)));
  }

  const dumpTabBtn = tabs.querySelector('[data-tab="dump"]');
  dumpTabBtn.textContent = state.dumps.length > 0 ? `생각 모음 (${state.dumps.length})` : "생각 모음";
}

function render() {
  renderTodos();
  renderDumps();
}

function openDateModal(dumpId) {
  const dump = state.dumps.find((d) => d.id === dumpId);
  if (!dump) return;
  pendingDumpId = dumpId;
  modalDumpText.textContent = dump.text;
  const today = new Date();
  modalDateInput.value = today.toISOString().slice(0, 10);
  dateModal.classList.remove("hidden");
  modalDateInput.focus();
}

function closeDateModal() {
  dateModal.classList.add("hidden");
  pendingDumpId = null;
}

todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;
  state.todos.push({
    id: makeId(),
    text,
    date: todoDateInput.value || null,
    completed: false,
    memo: "",
    subtasks: [],
    createdAt: Date.now(),
  });
  saveState();
  todoForm.reset();
  todoInput.focus();
  render();
});

dumpForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = dumpInput.value.trim();
  if (!text) return;
  state.dumps.push({ id: makeId(), text, createdAt: Date.now() });
  saveState();
  dumpForm.reset();
  render();
});

dumpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    dumpForm.requestSubmit();
  }
});

modalCancel.addEventListener("click", closeDateModal);

modalConfirm.addEventListener("click", () => {
  if (!pendingDumpId) return;
  const dump = state.dumps.find((d) => d.id === pendingDumpId);
  if (!dump) return closeDateModal();
  state.todos.push({
    id: makeId(),
    text: dump.text,
    date: modalDateInput.value || null,
    completed: false,
    memo: "",
    subtasks: [],
    createdAt: Date.now(),
  });
  state.dumps = state.dumps.filter((d) => d.id !== pendingDumpId);
  saveState();
  closeDateModal();
  render();
  switchTab("todo");
});

dateModal.addEventListener("click", (e) => {
  if (e.target === dateModal) closeDateModal();
});

const TAB_STORAGE_KEY = "todo-app-active-tab-v1";

function switchTab(tabName) {
  tabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== tabName);
  });
  localStorage.setItem(TAB_STORAGE_KEY, tabName);
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function openSyncModal() {
  syncCodeDisplay.textContent = syncId || "";
  syncStatusEl.textContent = syncId ? "동기화 중…" : "";
  syncJoinInput.value = "";
  syncModal.classList.remove("hidden");
}

function closeSyncModal() {
  syncModal.classList.add("hidden");
}

syncBtn.addEventListener("click", openSyncModal);
syncCloseBtn.addEventListener("click", closeSyncModal);
syncModal.addEventListener("click", (e) => {
  if (e.target === syncModal) closeSyncModal();
});

syncCopyBtn.addEventListener("click", () => {
  if (!syncId) return;
  navigator.clipboard
    .writeText(syncId)
    .then(() => {
      syncCopyBtn.textContent = "복사됨";
      setTimeout(() => (syncCopyBtn.textContent = "복사"), 1500);
    })
    .catch(() => {});
});

syncJoinBtn.addEventListener("click", () => {
  const val = syncJoinInput.value.trim().toUpperCase();
  if (!val) return;
  if (val === syncId) return;
  joinSync(val);
});

syncJoinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    syncJoinBtn.click();
  }
});

renderTodayHeader();
render();
switchTab(localStorage.getItem(TAB_STORAGE_KEY) === "dump" ? "dump" : "todo");
initSync();
