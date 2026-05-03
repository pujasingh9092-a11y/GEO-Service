(function () {
  const STORAGE_KEY = "geoPlannerState.v2";
  const LEGACY_KEY = "geoPlannerState.v1";
  const template = window.GEO_TEMPLATE;
  const app = document.querySelector("#app");
  const OWNER_OPTIONS = [
    "Analyst",
    "Content Writer",
    "Client",
    "Designer",
    "Developer",
    "Video Producer",
    "Social Media Manager",
    "Marketing Automator",
    "CSL",
  ];
  const TEAM_ROLE_OPTIONS = OWNER_OPTIONS;

  const state = loadState();
  let dirty = false;
  applyTheme();

  function loadState() {
    const fallback = {
      user: null,
      projects: [],
      globalPeople: [],
      activeProjectId: null,
      view: "projects",
      activeChapterIndex: 0,
      theme: "dark",
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      return { ...fallback, ...JSON.parse(stored || "{}") };
    } catch {
      return fallback;
    }
  }

  function persist(message = "Saved") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    dirty = hasDirtyTasks();
    updateSaveButton(message);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme || "dark";
  }

  function themeToggleHtml() {
    const isLight = state.theme === "light";
    return `
      <button class="theme-toggle" data-action="toggle-theme" type="button" aria-pressed="${isLight}" title="Switch theme">
        <span class="theme-toggle-track"><span class="theme-toggle-thumb"></span></span>
        <span>${isLight ? "Light" : "Dark"}</span>
      </button>
    `;
  }

  function hasDirtyTasks() {
    return state.projects.some((project) =>
      project.plan.phases.some((phase) => phase.tasks.some((task) => task.dirty))
    );
  }

  function cleanAllTaskDrafts() {
    state.projects.forEach((project) => {
      project.plan.phases.forEach((phase) => {
        phase.tasks.forEach((task) => {
          task.dirty = false;
          task.editingFields = {};
        });
      });
    });
  }

  function updateSaveButton(message) {
    const saveButton = document.querySelector("[data-action='save-project']");
    const saveLabel = document.querySelector("[data-save-label]");
    if (!saveButton || !saveLabel) return;

    saveButton.classList.toggle("dirty", dirty);
    saveButton.disabled = !dirty;
    saveLabel.textContent = message || (dirty ? "Unsaved changes" : "Saved");
  }

  function markDirty() {
    dirty = true;
    updateSaveButton("Unsaved changes");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function textToHtml(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  function htmlToText(el) {
    return el.innerText.replace(/\n{3,}/g, "\n\n").trim();
  }

  function initials(nameOrEmail) {
    const value = String(nameOrEmail || "?").trim();
    const parts = value.includes("@") ? [value[0]] : value.split(/\s+/);
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function activeProject() {
    return state.projects.find((project) => project.id === state.activeProjectId) || null;
  }

  function ensureProjectPeople(project) {
    if (!project.people) project.people = [];
    return project.people;
  }

  function ensureGlobalPeople() {
    if (!state.globalPeople) state.globalPeople = [];
    return state.globalPeople;
  }

  function allAssignablePeople(project = activeProject()) {
    const seen = new Set();
    return [...ensureGlobalPeople(), ...(project ? ensureProjectPeople(project) : [])].filter((person) => {
      const key = personKey(person);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function personKey(person) {
    return String(person.email || person.id || "").trim().toLowerCase();
  }

  function allTasks(project) {
    return project.plan.phases.flatMap((phase) => phase.tasks);
  }

  function progressForTasks(tasks) {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === "Done").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }

  function phaseClass(index) {
    return `phase-${index + 1}`;
  }

  function render() {
    if (!state.user) {
      renderAuth();
      return;
    }

    app.innerHTML = `
      <div class="screen app-screen">
        <header class="topbar">
          <button class="brand-mark" data-action="go-projects" title="Workspace">
            <span class="brand-dot"></span>
            <span>GEO Planner</span>
          </button>
          <nav class="main-menu">
            <button data-action="go-projects" class="${state.view === "projects" || state.view === "selector" || state.view === "plan" ? "active" : ""}">Workspace</button>
            <button data-action="go-adminland" class="${state.view === "adminland" ? "active" : ""}">Adminland</button>
          </nav>
          <div class="topbar-actions">
            ${state.view === "plan" ? saveButtonHtml() : ""}
            ${themeToggleHtml()}
            <span class="user-pill" title="${escapeHtml(state.user.email)}">${escapeHtml(initials(state.user.name || state.user.email))}</span>
            <button class="quiet-btn" data-action="logout">Sign out</button>
          </div>
        </header>
        ${viewHtml()}
      </div>
      <div data-modal-root></div>
      <div class="toast" data-toast></div>
    `;

    bindEvents();
    updateSaveButton(dirty ? "Unsaved changes" : "Saved");
  }

  function renderPreservingScroll() {
    const chapterContent = document.querySelector(".chapter-content");
    const scrollState = {
      windowX: window.scrollX,
      windowY: window.scrollY,
      chapterTop: chapterContent ? chapterContent.scrollTop : 0,
    };

    render();

    requestAnimationFrame(() => {
      window.scrollTo(scrollState.windowX, scrollState.windowY);
      const nextChapterContent = document.querySelector(".chapter-content");
      if (nextChapterContent) nextChapterContent.scrollTop = scrollState.chapterTop;
    });
  }

  function renderAuth() {
    const totalTasks = template.plans["30"].phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
    app.innerHTML = `
      <section class="auth-screen">
        <div class="auth-theme-switch">${themeToggleHtml()}</div>
        <div class="auth-panel dark">
          <div class="auth-logo"><span class="brand-dot"></span><strong>GEO Planner</strong></div>
          <div class="auth-copy">
            <span class="eyebrow">Generative Engine Optimisation</span>
            <h1>Run client GEO plans with serious operational clarity.</h1>
            <p>Turn the master checklist into clean client workspaces with project-specific edits, links, owners, and progress tracking.</p>
          </div>
          <div class="auth-stats">
            <div><strong>${totalTasks}</strong><span>Workbook tasks</span></div>
            <div><strong>4</strong><span>Chapters</span></div>
            <div><strong>30</strong><span>Day plan</span></div>
          </div>
        </div>
        <form class="auth-panel light" data-login-form>
          <div class="auth-card">
            <h2>Welcome back</h2>
            <p>Use any name and email to open this local prototype.</p>
            <label class="field">
              <span>Name</span>
              <input name="name" autocomplete="name" required placeholder="Your name" />
            </label>
            <label class="field">
              <span>Email</span>
              <input name="email" type="email" autocomplete="email" required placeholder="you@agency.com" />
            </label>
            <button class="primary-btn" type="submit">Enter workspace</button>
            <div class="hint">Data is stored locally in this browser. Each project receives its own cloned copy of the base plan.</div>
          </div>
        </form>
      </section>
    `;

    app.querySelector("[data-action='toggle-theme']")?.addEventListener("click", handleAction);
    document.querySelector("[data-login-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.user = {
        name: String(form.get("name")).trim(),
        email: String(form.get("email")).trim(),
      };
      state.view = "projects";
      persist("Logged in");
      render();
    });
  }

  function saveButtonHtml() {
    return `
      <button class="save-btn" data-action="save-project" disabled>
        <span class="save-dot"></span>
        <span data-save-label>Saved</span>
      </button>
    `;
  }

  function viewHtml() {
    if (state.view === "adminland") return adminlandView();
    if (state.view === "selector") return selectorView();
    if (state.view === "plan") return planView();
    return projectsView();
  }

  function projectsView() {
    return `
      <main class="view-wrap">
        <section class="view-header">
          <div>
            <span class="eyebrow">Client workspaces</span>
            <h1>Clients</h1>
            <p>Create a client, choose a plan, and keep every task copy isolated from the master checklist.</p>
          </div>
          <button class="primary-btn compact" data-action="new-project">New client</button>
        </section>
        ${state.projects.length ? `<section class="projects-grid">${state.projects.map(projectCard).join("")}</section>` : emptyProjectsHtml()}
      </main>
    `;
  }

  function projectCard(project) {
    const progress = progressForTasks(allTasks(project));
    const created = new Date(project.createdAt || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `
      <article class="project-card" data-action="open-selector" data-project-id="${project.id}">
        <div class="project-card-top">
          <button class="icon-btn card-edit-icon" data-action="edit-project" data-project-id="${project.id}" title="Edit client" aria-label="Edit client">${penIcon()}</button>
        </div>
        <h2>${escapeHtml(project.name)}</h2>
        <div class="project-progress">
          <div><span style="width:${progress.pct}%"></span></div>
          <strong>${progress.done}/${progress.total}</strong>
        </div>
        <div class="badge-row">
          <span class="badge active">30 days</span>
          <span class="badge locked">60 locked</span>
          <span class="badge locked">90 locked</span>
        </div>
      </article>
    `;
  }

  function emptyProjectsHtml() {
    return `
      <section class="empty-panel">
        <div class="empty-icon">+</div>
        <h2>No clients yet</h2>
        <p>Create your first project workspace and we’ll clone the 30-day master checklist into it.</p>
        <button class="primary-btn compact" data-action="new-project">Add client</button>
      </section>
    `;
  }

  function adminlandView() {
    const people = ensureGlobalPeople();
    const assignedPeople = assignedPeopleAcrossProjects();
    return `
      <main class="view-wrap">
        <section class="view-header">
          <div>
            <span class="eyebrow">Global team directory</span>
            <h1>Adminland</h1>
            <p>Add people to the tool and assign their default role. Everyone here can be selected as a task owner in any workspace.</p>
          </div>
        </section>
        <section class="admin-panel">
          <div class="admin-panel-head">
            <h2>People in this tool</h2>
          </div>
          <div class="people-rows admin-people-rows" data-admin-people-rows>
            ${personRowHtml({}, { removable: false })}
          </div>
          <div class="admin-actions">
            <span class="admin-signal" data-admin-signal></span>
            <button class="primary-btn compact" data-action="save-adminland">Add Person</button>
          </div>
        </section>
        <section class="admin-panel">
          <div class="admin-panel-head">
            <h2>Assigned across workspaces</h2>
            <span>${assignedPeople.length} people</span>
          </div>
          ${assignedPeople.length ? `<div class="assigned-grid">${assignedPeople.map(assignedPersonCard).join("")}</div>` : `<p class="empty-admin-copy">No one has been assigned in a workspace yet.</p>`}
        </section>
      </main>
    `;
  }

  function assignedPeopleAcrossProjects() {
    const seen = new Map();
    ensureGlobalPeople().forEach((person) => {
      const key = personKey(person);
      if (!key) return;
      seen.set(key, { ...person, workspaces: [], sources: ["Adminland"] });
    });
    state.projects.forEach((project) => {
      ensureProjectPeople(project).forEach((person) => {
        const key = personKey(person);
        if (!key) return;
        if (!seen.has(key)) seen.set(key, { ...person, workspaces: [], sources: [] });
        const record = seen.get(key);
        record.name = record.name || person.name;
        record.email = record.email || person.email;
        record.role = record.role || person.role;
        if (!record.workspaces.includes(project.name)) record.workspaces.push(project.name);
      });
    });
    return Array.from(seen.values());
  }

  function assignedPersonCard(person) {
    const key = personKey(person);
    return `
      <article class="assigned-person-card" data-person-key="${escapeHtml(key)}">
        <strong>${escapeHtml(person.name || person.email)}</strong>
        <span>${escapeHtml(person.role)}</span>
        <p>${escapeHtml(person.email || "No email")}</p>
        <div class="workspace-chip-row">
          ${(person.workspaces || []).length ? person.workspaces.map((workspace) => `<small>${escapeHtml(workspace)}</small>`).join("") : `<small class="muted-chip">Not assigned to a workspace</small>`}
        </div>
        <div class="person-card-actions">
          <button class="icon-btn mini-edit" type="button" data-action="edit-admin-person" data-person-key="${escapeHtml(key)}" title="Edit person" aria-label="Edit person">${penIcon()}</button>
          <button class="icon-btn mini-edit danger-icon" type="button" data-action="delete-admin-person" data-person-key="${escapeHtml(key)}" title="Delete person" aria-label="Delete person">${trashIcon()}</button>
        </div>
      </article>
    `;
  }

  function selectorView() {
    const project = activeProject();
    if (!project) return projectsView();
    return `
      <main class="view-wrap">
        <button class="back-btn" data-action="go-projects">← Back to clients</button>
        <section class="view-header">
          <div>
            <span class="eyebrow">Choose plan</span>
            <h1>${escapeHtml(project.name)}</h1>
            <p>Select the client plan you want to work on. The 60 and 90 day plans are intentionally locked for now.</p>
          </div>
        </section>
        <section class="plan-cards">
          <button class="plan-card live" data-action="open-plan">
            <span class="plan-num">30</span>
            <span class="plan-label">Day plan</span>
            <strong>Foundation & Audit</strong>
            <p>Full GEO audit, baseline measurement, quick wins, and client handoff.</p>
          </button>
          <button class="plan-card" disabled>
            <em>Coming soon</em>
            <span class="plan-num">60</span>
            <span class="plan-label">Day plan</span>
            <strong>Implementation</strong>
            <p>Content rewrites, schema deployment, trust building, and off-site activation.</p>
          </button>
          <button class="plan-card" disabled>
            <em>Coming soon</em>
            <span class="plan-num">90</span>
            <span class="plan-label">Day plan</span>
            <strong>Scale & Authority</strong>
            <p>Content scaling, PR amplification, reputation building, and final attribution.</p>
          </button>
        </section>
      </main>
    `;
  }

  function planView() {
    const project = activeProject();
    if (!project) return projectsView();
    const phase = project.plan.phases[state.activeChapterIndex] || project.plan.phases[0];
    return `
      <main class="plan-shell">
        <aside class="chapter-sidebar">
          <div class="chapter-sidebar-head">
            <strong>${escapeHtml(project.name)}</strong>
            <span>30-Day Plan</span>
          </div>
          <nav class="chapter-nav">
            ${project.plan.phases.map((item, index) => chapterNavItem(project, item, index)).join("")}
          </nav>
        </aside>
        <section class="chapter-content">
          ${chapterHtml(project, phase, state.activeChapterIndex)}
        </section>
      </main>
    `;
  }

  function chapterNavItem(project, phase, index) {
    const progress = progressForTasks(phase.tasks);
    const active = index === state.activeChapterIndex ? "active" : "";
    return `
      <button class="chapter-nav-item ${active}" data-action="open-chapter" data-chapter-index="${index}">
        <span class="phase-dot ${phaseClass(index)}"></span>
        <span>
          <strong>${escapeHtml(phase.title.replace("PHASE ", "Phase "))}</strong>
          <small>${escapeHtml(phase.name)} · ${progress.pct}%</small>
        </span>
      </button>
    `;
  }

  function chapterHtml(project, phase, phaseIndex) {
    const progress = progressForTasks(phase.tasks);
    return `
      <article class="chapter">
        <div class="chapter-kicker">
          <span class="chapter-pill ${phaseClass(phaseIndex)}">${escapeHtml(phase.title)} · ${escapeHtml(phase.name)}</span>
        </div>
        <div class="chapter-title-row">
          <div>
            <h1>${escapeHtml(phase.name)}</h1>
            <p>${escapeHtml(project.planLabel)} chapter with editable execution guidance, tools, links, and owner/status tracking.</p>
          </div>
          <div class="chapter-score">
            <strong>${progress.pct}%</strong>
            <span>${progress.done}/${progress.total} done</span>
          </div>
        </div>
        <div class="progress-track"><span style="width:${progress.pct}%"></span></div>
        <div class="tasks-list">
          ${phase.tasks.map((task, taskIndex) => taskHtml(task, phaseIndex, taskIndex)).join("")}
        </div>
        <div class="chapter-footer">
          <button class="secondary-btn" data-action="prev-chapter" ${phaseIndex === 0 ? "disabled" : ""}>Previous chapter</button>
          <button class="secondary-btn" data-action="next-chapter" ${phaseIndex === project.plan.phases.length - 1 ? "disabled" : ""}>Next chapter</button>
        </div>
      </article>
    `;
  }

  function taskHtml(task, phaseIndex, taskIndex) {
    const isDone = task.status === "Done";
    const openClass = task.open ? "expanded" : "";
    const linkTodoClass = task.externalTodoLink ? "has-link" : "";
    const linkDriveClass = task.googleDriveLink ? "has-link" : "";
    const editing = task.editingFields || {};
    const can = (field) => Boolean(editing[field]);
    const disabled = (field) => (can(field) ? "" : "disabled");
    return `
      <article class="task-item ${openClass}" data-task-card data-phase-index="${phaseIndex}" data-task-index="${taskIndex}">
        <div class="task-header" data-action="toggle-task">
          <label class="check-wrap" onclick="event.stopPropagation()">
            <input type="checkbox" data-field="doneCheck" ${isDone ? "checked" : ""} />
            <span></span>
          </label>
          <div class="task-main">
            <div class="task-num">Task ${escapeHtml(task.number)}${task.edited ? `<span class="edited-badge">edited</span>` : ""}</div>
            <h2>${escapeHtml(task.task)}</h2>
            <div class="task-tags">
              <span class="status-tag status-${statusSlug(task.status)}">${escapeHtml(task.status || "To Do")}</span>
              <span class="category-tag">${escapeHtml(task.category)}</span>
              <span class="owner-tag">${escapeHtml(ownerDisplayName(task.owner))}</span>
              ${task.trainingRequired === "Yes — Bing WMT AI report setup" || task.trainingRequired === "Yes — prompt-building guide/recording needed" || task.trainingRequired === "Yes — step-by-step recording needed" ? `<span class="training">Training</span>` : ""}
              ${task.quickWin === "Yes" ? `<span class="quick">Quick win</span>` : ""}
            </div>
          </div>
          <button class="chevron" type="button" title="Open task" aria-label="Open task">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="task-body">
          <section class="task-section">
            ${fieldHeader("How to Execute", "howToExecute", can("howToExecute"))}
            ${can("howToExecute") ? `
              <div class="editor-shell">
                <div class="editor-toolbar">
                  <button type="button" data-action="format" data-command="bold" title="Bold" ${disabled("howToExecute")}>B</button>
                  <button type="button" data-action="format" data-command="italic" title="Italic" ${disabled("howToExecute")}><i>I</i></button>
                  <button type="button" data-action="format" data-command="insertUnorderedList" title="Bulleted list" ${disabled("howToExecute")}>•</button>
                  <button type="button" data-action="format" data-command="insertOrderedList" title="Numbered list" ${disabled("howToExecute")}>1.</button>
                </div>
                <div class="rich-editor" contenteditable="true" data-rich-field="howToExecute">${task.howToExecuteHtml || textToHtml(task.howToExecute)}</div>
              </div>
            ` : `<div class="execution-preview">${task.howToExecuteHtml ? task.howToExecuteHtml : formatExecutionPreview(task.howToExecute)}</div>`}
          </section>
          <div class="task-grid">
            <label class="field">
              <span>Status</span>
              <select data-field="status">
                ${["To Do", "In Progress", "Blocked", "Done"].map((status) => `<option ${task.status === status ? "selected" : ""}>${status}</option>`).join("")}
              </select>
            </label>
            <div class="field editable-field">
              <span>Owner</span>
              ${ownerSelect(task.owner)}
            </div>
            <div class="field wide editable-field">
              ${fieldHeader("Tools", "tools", can("tools"))}
              ${can("tools") ? `<textarea data-field="tools">${escapeHtml(task.tools)}</textarea>` : `<div class="plain-text">${textToHtml(task.tools) || "Not set"}</div>`}
            </div>
            <div class="field wide editable-field">
              ${fieldHeader("Dependency / Notes", "dependencyNotes", can("dependencyNotes"))}
              ${can("dependencyNotes") ? `<textarea data-field="dependencyNotes">${escapeHtml(task.dependencyNotes)}</textarea>` : `<div class="plain-text">${textToHtml(task.dependencyNotes) || "Not set"}</div>`}
            </div>
          </div>
          <section class="task-section">
            ${fieldHeader("Links", "links", can("links"))}
            <div class="link-grid">
              <div class="link-row ${linkTodoClass} ${can("links") ? "editing-link" : "locked-link"}">
                <span>To-do</span>
                ${can("links") ? `<input data-field="externalTodoLink" value="${escapeHtml(task.externalTodoLink)}" placeholder="Asana, Basecamp, Notion..." />` : `<div class="plain-link">${escapeHtml(task.externalTodoLink) || "No to-do link added"}</div>`}
                <a href="${escapeHtml(task.externalTodoLink || "#")}" target="_blank" rel="noopener" title="Open to-do link">↗</a>
              </div>
              <div class="link-row ${linkDriveClass} ${can("links") ? "editing-link" : "locked-link"}">
                <span>Drive</span>
                ${can("links") ? `<input data-field="googleDriveLink" value="${escapeHtml(task.googleDriveLink)}" placeholder="Google Drive doc, sheet, or folder..." />` : `<div class="plain-link">${escapeHtml(task.googleDriveLink) || "No Drive link added"}</div>`}
                <a href="${escapeHtml(task.googleDriveLink || "#")}" target="_blank" rel="noopener" title="Open Drive link">↗</a>
              </div>
            </div>
          </section>
          <div class="task-save-row">
            <span>${task.dirty ? "Unsaved changes in this card" : "Card saved"}</span>
            <button class="primary-btn compact" type="button" data-action="save-task" ${task.dirty ? "" : "disabled"}>Save card</button>
          </div>
        </div>
      </article>
    `;
  }

  function fieldHeader(label, field, isEditing) {
    return `
      <div class="field-head">
        <label>${escapeHtml(label)}</label>
        <button class="mini-edit icon-edit ${isEditing ? "is-editing" : ""}" type="button" data-action="edit-field" data-edit-field="${field}" title="Edit ${escapeHtml(label)}" aria-label="Edit ${escapeHtml(label)}">
          ${penIcon()}
        </button>
      </div>
    `;
  }

  function ownerSelect(currentOwner) {
    const project = activeProject();
    const people = allAssignablePeople(project);
    const value = String(currentOwner || "");
    const peopleByRole = TEAM_ROLE_OPTIONS.map((role) => {
      const rolePeople = people.filter((person) => person.role === role);
      if (!rolePeople.length) return `<option value="" disabled>${escapeHtml(role)} not assigned yet</option>`;
      return rolePeople.map((person) => {
        const personValue = ownerPersonValue(person);
        return `<option value="${escapeHtml(personValue)}" ${value === personValue ? "selected" : ""}>${escapeHtml(person.name)} (${escapeHtml(role)})</option>`;
      }).join("");
    }).join("");
    const knownValues = new Set(people.map(ownerPersonValue));
    const custom = value && !knownValues.has(value) ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(value)}</option>` : "";
    const empty = !value ? `<option value="" selected>Select owner</option>` : "";
    return `<select data-field="owner" class="owner-select">${empty}${custom}${peopleByRole}</select>`;
  }

  function ownerPersonValue(person) {
    return `person:${person.id}`;
  }

  function ownerDisplayName(ownerValue) {
    const value = String(ownerValue || "");
    if (!value.startsWith("person:")) return value || "Unassigned";
    const personId = value.slice("person:".length);
    const project = activeProject();
    const person = allAssignablePeople(project).find((item) => item.id === personId);
    return person ? `${person.name} (${person.role})` : "Unassigned";
  }

  function statusSlug(status) {
    return String(status || "to-do").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function penIcon() {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13.7 3.3 3 3M3.5 16.5l3.8-.8 8.6-8.6a2.1 2.1 0 0 0-3-3L4.3 12.7l-.8 3.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function trashIcon() {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.2 4.5V3.4c0-.6.5-1.1 1.1-1.1h3.4c.6 0 1.1.5 1.1 1.1v1.1m-8 0h10.4m-9 0 .7 12.2c0 .6.5 1 1.1 1h4c.6 0 1.1-.4 1.1-1l.7-12.2M8.7 8.1v5.6m2.6-5.6v5.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function formatExecutionPreview(text) {
    const lines = String(text || "").split("\n");
    return lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return `<div class="execution-gap"></div>`;
      const escaped = escapeHtml(trimmed);
      if (/^\d+\./.test(trimmed)) return `<p class="execution-line execution-step">${escaped}</p>`;
      if (/^[·•-]\s*/.test(trimmed)) return `<p class="execution-line execution-bullet">${escaped.replace(/^[·•-]\s*/, "")}</p>`;
      if (/^[A-Z][A-Z\s/&()0-9-]+:$/.test(trimmed) || /^DONE WHEN:/.test(trimmed)) return `<p class="execution-line execution-heading">${escaped}</p>`;
      return `<p class="execution-line">${escaped}</p>`;
    }).join("");
  }

  function bindEvents() {
    app.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handleAction));
    app.querySelectorAll("[data-field]").forEach((el) => {
      el.addEventListener("input", handleFieldInput);
      el.addEventListener("change", handleFieldInput);
    });
    app.querySelectorAll("[data-rich-field]").forEach((el) => el.addEventListener("input", handleRichInput));
    bindPersonRowRemoval(app);
  }

  function bindPersonRowRemoval(root) {
    root.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-action='remove-person-row']");
      if (!removeButton) return;
      event.preventDefault();
      const row = removeButton.closest("[data-person-row]");
      const container = row?.parentElement;
      const rowCount = container ? container.querySelectorAll("[data-person-row]").length : 0;
      if (rowCount > 1) row.remove();
      else if (row) {
        row.querySelectorAll("input").forEach((input) => {
          input.value = "";
        });
        row.querySelector("select").value = TEAM_ROLE_OPTIONS[0];
      }
    });
  }

  function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    const projectId = event.currentTarget.dataset.projectId;

    if (action === "toggle-theme") {
      state.theme = state.theme === "light" ? "dark" : "light";
      applyTheme();
      persist(`${state.theme === "light" ? "Light" : "Dark"} mode`);
      render();
      return;
    }

    if (action === "format") {
      event.preventDefault();
      if (event.currentTarget.disabled) return;
      document.execCommand(event.currentTarget.dataset.command, false, null);
      return;
    }

    if (action === "logout") {
      state.user = null;
      state.activeProjectId = null;
      state.view = "projects";
      persist("Signed out");
      render();
      return;
    }

    if (action === "go-projects") {
      state.view = "projects";
      state.activeProjectId = null;
      render();
    }

    if (action === "go-adminland") {
      state.view = "adminland";
      state.activeProjectId = null;
      render();
    }

    if (action === "go-selector") {
      state.view = "selector";
      render();
    }

    if (action === "new-project") openProjectModal();

    if (action === "add-admin-person-row") {
      document.querySelector("[data-admin-people-rows]")?.insertAdjacentHTML("beforeend", personRowHtml({}, { removable: false }));
    }

    if (action === "save-adminland") {
      const rowsContainer = document.querySelector("[data-admin-people-rows]");
      if (!rowsContainer) return;
      const previousCount = ensureGlobalPeople().length;
      const result = upsertAdminPeopleFromRows(rowsContainer);
      state.globalPeople = result.people;
      const addedCount = Math.max(0, state.globalPeople.length - previousCount);
      persist(addedCount ? "Person added" : "Adminland updated");
      render();
      const message = result.duplicates ? "Duplicate skipped" : addedCount ? "✓ New person added" : "Person updated";
      showAdminSignal(message);
      showToast(message);
    }

    if (action === "edit-admin-person") {
      const key = event.currentTarget.dataset.personKey;
      const person = assignedPeopleAcrossProjects().find((item) => personKey(item) === key);
      if (!person) return;
      const rowsContainer = document.querySelector("[data-admin-people-rows]");
      if (!rowsContainer) return;
      rowsContainer.innerHTML = personRowHtml(person, { removable: false });
      rowsContainer.querySelector("[data-person-field='name']")?.focus();
      showToast("Edit person details");
    }

    if (action === "delete-admin-person") {
      const key = event.currentTarget.dataset.personKey;
      const person = assignedPeopleAcrossProjects().find((item) => personKey(item) === key);
      if (!person) return;
      if (!window.confirm(`Delete "${person.name || person.email}" from Adminland and all workspaces?`)) return;
      removePersonEverywhere(key);
      persist("Person deleted");
      render();
      showToast("Person deleted");
    }

    if (action === "edit-project") {
      event.stopPropagation();
      const project = state.projects.find((item) => item.id === projectId) || activeProject();
      openProjectModal(project);
    }

    if (action === "open-selector") {
      state.activeProjectId = projectId;
      state.view = "selector";
      render();
    }

    if (action === "open-plan") {
      state.view = "plan";
      state.activeChapterIndex = 0;
      render();
    }

    if (action === "open-chapter") {
      state.activeChapterIndex = Number(event.currentTarget.dataset.chapterIndex);
      render();
    }

    if (action === "prev-chapter" || action === "next-chapter") {
      const direction = action === "next-chapter" ? 1 : -1;
      state.activeChapterIndex = Math.max(0, Math.min(activeProject().plan.phases.length - 1, state.activeChapterIndex + direction));
      render();
    }

    if (action === "toggle-task") {
      const task = getTaskFromCard(event.currentTarget.closest("[data-task-card]"));
      task.open = !task.open;
      renderPreservingScroll();
    }

    if (action === "save-project") {
      cleanAllTaskDrafts();
      persist("Saved");
      showToast("Project changes saved");
      render();
    }

    if (action === "edit-field") {
      event.preventDefault();
      event.stopPropagation();
      const card = event.currentTarget.closest("[data-task-card]");
      const task = getTaskFromCard(card);
      task.editingFields = task.editingFields || {};
      task.editingFields[event.currentTarget.dataset.editField] = true;
      renderPreservingScroll();
    }

    if (action === "save-task") {
      event.preventDefault();
      event.stopPropagation();
      const task = getTaskFromCard(event.currentTarget.closest("[data-task-card]"));
      task.dirty = false;
      task.editingFields = {};
      persist("Card saved");
      showToast("Task card saved");
      render();
    }
  }

  function handleFieldInput(event) {
    const card = event.currentTarget.closest("[data-task-card]");
    if (!card) return;
    const task = getTaskFromCard(card);
    const field = event.currentTarget.dataset.field;

    if (field === "doneCheck") {
      task.status = event.currentTarget.checked ? "Done" : "To Do";
    } else {
      task[field] = event.currentTarget.value;
    }

    task.edited = true;
    task.dirty = true;
    task.updatedAt = new Date().toISOString();
    markDirty();

    if (field === "doneCheck" || field === "status") {
      render();
      return;
    }

    if (field === "externalTodoLink" || field === "googleDriveLink") {
      const row = event.currentTarget.closest(".link-row");
      const anchor = row?.querySelector("a");
      row?.classList.toggle("has-link", Boolean(event.currentTarget.value.trim()));
      if (anchor) anchor.href = event.currentTarget.value.trim() || "#";
    }
  }

  function handleRichInput(event) {
    const task = getTaskFromCard(event.currentTarget.closest("[data-task-card]"));
    task.howToExecute = htmlToText(event.currentTarget);
    task.howToExecuteHtml = event.currentTarget.innerHTML;
    task.edited = true;
    task.dirty = true;
    task.updatedAt = new Date().toISOString();
    markDirty();
  }

  function getTaskFromCard(card) {
    const project = activeProject();
    return project.plan.phases[Number(card.dataset.phaseIndex)].tasks[Number(card.dataset.taskIndex)];
  }

  function openProjectModal(project = null) {
    const modalRoot = document.querySelector("[data-modal-root]");
    const isEdit = Boolean(project);
    const people = isEdit ? ensureProjectPeople(project) : [];
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <form class="modal" data-project-form>
          <h2>${isEdit ? "Edit client" : "New client"}</h2>
          <label class="field">
            <span>Client name</span>
            <input name="client" required value="${escapeHtml(project?.client || project?.name || "")}" placeholder="Acme Corp" />
          </label>
          <div class="modal-plan-note">
            <strong>30-Day Plan</strong>
            <span>Enabled now. 60 and 90 stay locked until we build those phases.</span>
          </div>
          <div class="team-builder">
            <div class="team-builder-head">
              <strong>People & roles</strong>
              <button class="secondary-btn compact" type="button" data-action="add-person-row">Add person</button>
            </div>
            ${adminPeoplePickerHtml(people)}
            <div class="people-rows" data-people-rows>
              ${people.length ? people.map(personRowHtml).join("") : personRowHtml()}
            </div>
          </div>
          <div class="modal-actions">
            ${isEdit ? `<button class="danger-btn" type="button" data-action="delete-current-project">Delete</button>` : ""}
            <button class="secondary-btn" type="button" data-action="close-modal">Cancel</button>
            <button class="primary-btn compact" type="submit">${isEdit ? "Save client" : "Add client"}</button>
          </div>
        </form>
      </div>
    `;

    modalRoot.querySelector("[data-action='close-modal']").addEventListener("click", closeModal);
    modalRoot.querySelector("[data-action='add-person-row']").addEventListener("click", () => {
      modalRoot.querySelector("[data-people-rows]").insertAdjacentHTML("beforeend", personRowHtml());
    });
    modalRoot.querySelector("[data-action='add-admin-person-to-client']")?.addEventListener("click", () => {
      const select = modalRoot.querySelector("[data-admin-person-picker]");
      const person = ensureGlobalPeople().find((item) => item.id === select?.value);
      if (!person) return;
      const rows = modalRoot.querySelector("[data-people-rows]");
      const existingKeys = new Set(
        Array.from(rows.querySelectorAll("[data-person-row]")).map((row) => {
          const email = row.querySelector("[data-person-field='email']").value.trim();
          const name = row.querySelector("[data-person-field='name']").value.trim();
          return (email || name).toLowerCase();
        }).filter(Boolean)
      );
      const key = personKey(person) || person.name.toLowerCase();
      if (existingKeys.has(key)) {
        showToast("Person already added to this client");
        return;
      }
      const blankRow = Array.from(rows.querySelectorAll("[data-person-row]")).find((row) => {
        const name = row.querySelector("[data-person-field='name']").value.trim();
        const email = row.querySelector("[data-person-field='email']").value.trim();
        return !name && !email;
      });
      if (blankRow && rows.querySelectorAll("[data-person-row]").length === 1) {
        blankRow.outerHTML = personRowHtml(person);
      } else {
        rows.insertAdjacentHTML("beforeend", personRowHtml(person));
      }
      select.value = "";
      showToast("Person added to client");
    });
    bindPersonRowRemoval(modalRoot);
    modalRoot.querySelector("[data-project-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const clientName = String(form.get("client")).trim();
      const result = readPeopleFromRows(event.currentTarget, isEdit ? project.people : [], ensureGlobalPeople());
      const people = result.people;
      if (isEdit) {
        project.name = clientName;
        project.client = clientName;
        project.people = people;
        project.updatedAt = new Date().toISOString();
      } else {
        const plan = clone(template.plans["30"]);
        const newProject = {
          id: uid("project"),
          name: clientName,
          client: clientName,
          planType: "30",
          planLabel: "30-Day Plan",
          plan,
          people,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.projects.unshift(newProject);
        state.activeProjectId = newProject.id;
        state.view = "selector";
      }
      persist(isEdit ? "Client updated" : "Client created");
      closeModal();
      render();
      if (result.duplicates) showToast(`${result.duplicates} duplicate skipped`);
    });

    const deleteButton = modalRoot.querySelector("[data-action='delete-current-project']");
    if (deleteButton) {
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`Delete "${project.name}"? This removes the project copy from local storage.`)) return;
        state.projects = state.projects.filter((item) => item.id !== project.id);
        state.activeProjectId = null;
        state.view = "projects";
        persist("Client deleted");
        closeModal();
        render();
      });
    }
  }

  function removePersonEverywhere(key) {
    const removedIds = new Set();
    ensureGlobalPeople().forEach((person) => {
      if (personKey(person) === key) removedIds.add(person.id);
    });
    state.projects.forEach((project) => {
      ensureProjectPeople(project).forEach((person) => {
        if (personKey(person) === key) removedIds.add(person.id);
      });
    });

    state.globalPeople = ensureGlobalPeople().filter((person) => personKey(person) !== key);
    state.projects.forEach((project) => {
      project.people = ensureProjectPeople(project).filter((person) => personKey(person) !== key);
      allTasks(project).forEach((task) => {
        if (!String(task.owner || "").startsWith("person:")) return;
        const personId = task.owner.slice("person:".length);
        if (removedIds.has(personId)) task.owner = "";
      });
    });
  }

  function adminPeoplePickerHtml(projectPeople = []) {
    const adminPeople = ensureGlobalPeople();
    if (!adminPeople.length) {
      return `
        <div class="client-admin-picker empty">
          <span>No Adminland people yet. Add a person below or create them in Adminland first.</span>
        </div>
      `;
    }

    const projectKeys = new Set(projectPeople.map((person) => personKey(person) || person.name.toLowerCase()).filter(Boolean));
    return `
      <div class="client-admin-picker">
        <label class="field">
          <span>Add from Adminland</span>
          <select data-admin-person-picker>
            <option value="">Select a person</option>
            ${adminPeople.map((person) => {
              const key = personKey(person) || person.name.toLowerCase();
              const alreadyAdded = projectKeys.has(key);
              return `<option value="${escapeHtml(person.id)}" ${alreadyAdded ? "disabled" : ""}>${escapeHtml(person.name || person.email)} (${escapeHtml(person.role)})${alreadyAdded ? " · already added" : ""}</option>`;
            }).join("")}
          </select>
        </label>
        <button class="secondary-btn compact" type="button" data-action="add-admin-person-to-client">Add to client</button>
      </div>
    `;
  }

  function personRowHtml(person = {}, options = {}) {
    const removable = options.removable !== false;
    return `
      <div class="person-row" data-person-row data-person-id="${escapeHtml(person.id || "")}">
        <input data-person-field="name" value="${escapeHtml(person.name || "")}" placeholder="Name" />
        <input data-person-field="email" value="${escapeHtml(person.email || "")}" type="email" placeholder="Email" />
        <select data-person-field="role">
          ${TEAM_ROLE_OPTIONS.map((role) => `<option value="${escapeHtml(role)}" ${person.role === role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}
        </select>
        ${removable ? `<button class="icon-btn" type="button" data-action="remove-person-row" title="Remove person">Remove</button>` : ""}
      </div>
    `;
  }

  function upsertAdminPeopleFromRows(root) {
    const people = [...ensureGlobalPeople()];
    const byId = new Map(people.map((person, index) => [person.id, index]));
    const byKey = new Map(people.map((person, index) => [personKey(person) || person.name.toLowerCase(), index]));
    const seenDrafts = new Set();
    let duplicates = 0;
    let added = 0;
    let updated = 0;

    Array.from(root.querySelectorAll("[data-person-row]")).forEach((row) => {
      const draft = {
        id: row.dataset.personId || "",
        name: row.querySelector("[data-person-field='name']").value.trim(),
        email: row.querySelector("[data-person-field='email']").value.trim(),
        role: row.querySelector("[data-person-field='role']").value,
      };
      if (!draft.name && !draft.email) return;

      const key = personKey(draft) || draft.name.toLowerCase();
      if (seenDrafts.has(key)) {
        duplicates += 1;
        return;
      }
      seenDrafts.add(key);

      const existingIndex = draft.id && byId.has(draft.id) ? byId.get(draft.id) : byKey.get(key);
      if (existingIndex !== undefined) {
        people[existingIndex] = {
          ...people[existingIndex],
          name: draft.name || people[existingIndex].name,
          email: draft.email || people[existingIndex].email,
          role: draft.role || people[existingIndex].role || TEAM_ROLE_OPTIONS[0],
        };
        updated += 1;
        return;
      }

      const person = {
        id: uid("person"),
        name: draft.name,
        email: draft.email,
        role: draft.role || TEAM_ROLE_OPTIONS[0],
        createdAt: new Date().toISOString(),
      };
      people.push(person);
      byId.set(person.id, people.length - 1);
      byKey.set(key, people.length - 1);
      added += 1;
    });

    return { people, duplicates, added, updated };
  }

  function readPeopleFromRows(root, existingPeople = [], canonicalPeople = []) {
    const existingById = new Map((existingPeople || []).map((person) => [person.id, person]));
    const canonicalByKey = new Map((canonicalPeople || []).map((person) => [personKey(person), person]));
    const seen = new Set();
    let duplicates = 0;
    const people = [];

    Array.from(root.querySelectorAll("[data-person-row]")).forEach((row) => {
      const draft = {
        id: row.dataset.personId || "",
        name: row.querySelector("[data-person-field='name']").value.trim(),
        email: row.querySelector("[data-person-field='email']").value.trim(),
        role: row.querySelector("[data-person-field='role']").value,
      };
      if (!draft.name && !draft.email) return;

      const key = personKey(draft) || draft.name.toLowerCase();
      if (seen.has(key)) {
        duplicates += 1;
        return;
      }
      seen.add(key);

      const canonical = canonicalByKey.get(key);
      const id = draft.id || canonical?.id || uid("person");
      people.push({
        id,
        name: draft.name || canonical?.name || "",
        email: draft.email || canonical?.email || "",
        role: draft.role || canonical?.role || TEAM_ROLE_OPTIONS[0],
        createdAt: existingById.get(id)?.createdAt || canonical?.createdAt || new Date().toISOString(),
      });
    });

    return { people, duplicates };
  }

  function closeModal() {
    const modalRoot = document.querySelector("[data-modal-root]");
    if (modalRoot) modalRoot.innerHTML = "";
  }

  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function showAdminSignal(message) {
    const signal = document.querySelector("[data-admin-signal]");
    if (!signal) return;
    signal.textContent = message;
    signal.classList.add("show");
    setTimeout(() => {
      signal.classList.remove("show");
      signal.textContent = "";
    }, 1400);
  }

  render();
})();
