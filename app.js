(() => {
  "use strict";

  const KEY = "job-search-planner-v1";
  const AI_ENDPOINT_KEY = "job-search-planner-ai-endpoint";
  const SIDEBAR_NOTE_KEY = "job-search-planner-sidebar-note";
  const HERO_COPY_KEY = "job-search-planner-hero-copy";
  const PLANNER_UI_KEY = "job-search-planner-ui";
  const employmentTypes = ["正式", "日常实习", "转正实习", "其他"];
  const cities = ["上海", "广州", "深圳", "北京", "杭州", "南京", "其他"];
  const statuses = ["收藏", "待投递", "已投递", "笔试中", "面试中", "已结束"];
  const categories = ["投递", "学习", "笔面准备", "运动", "休息", "其他"];
  const categoryClass = { "投递": "apply", "学习": "review", "笔面准备": "prepare", "运动": "exercise", "休息": "rest", "其他": "other" };
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => localDate(new Date());
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localDate(d); };
  const dateLabel = (date) => date ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`)) : "日期待定";
  const timeLabel = (date, time) => `${dateLabel(date)}${time ? ` ${time}` : " · 具体时间待核实"}`;
  const asDate = (date, time = "00:00") => new Date(`${date}T${time}:00`).getTime();
  const validUrl = (raw) => { try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
  const urlLink = (raw, label) => { const url = validUrl(raw); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ""; };
  const empty = (title, body) => `<div class="empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;
  const options = (values, selected) => values.map((item) => { const value = typeof item === "object" ? item.v : item; const label = typeof item === "object" ? item.label : item; return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`; }).join("");
  const field = (name, label, type, value = "", extra = "", full = false) => `<label class="field${full ? " full" : ""}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const selectField = (name, label, values, selected, full = false) => `<label class="field${full ? " full" : ""}">${label}<select name="${name}">${options(values, selected)}</select></label>`;
  const textArea = (name, label, value = "", max = 500) => `<label class="field full">${label}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;
  const cleanText = (value, max = 500) => String(value ?? "").slice(0, max);

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { version: 1, jobs: [], events: [], blocks: [], tasks: [], dismissed: [], categories: [], tracks: [] };
      return normalize(JSON.parse(raw));
    } catch {
      setTimeout(() => toast("本机数据读取失败；请检查浏览器存储。"), 0);
      return { version: 1, jobs: [], events: [], blocks: [], tasks: [], dismissed: [], categories: [], tracks: [] };
    }
  }

  function normalize(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.jobs) || !Array.isArray(input.events) || !Array.isArray(input.blocks)) throw new Error("文件格式不符合本项目的数据格式");
    if (input.jobs.length + input.events.length + input.blocks.length + (Array.isArray(input.tasks) ? input.tasks.length : 0) > 5000) throw new Error("记录过多，无法导入");
    const pick = (item, keys) => Object.fromEntries(keys.map((key) => [key, cleanText(item?.[key], ["jdText", "resumeNotes", "prepNotes", "recapNotes"].includes(key) ? 8000 : 500)]));
    const jobs = input.jobs.map((j) => ({ ...pick(j, ["id", "company", "title", "track", "city", "status", "url", "deadlineDate", "deadlineTime", "appliedDate", "nextAction", "nextDate", "notes", "createdAt"]), employmentType: employmentTypes.includes(j?.employmentType) ? j.employmentType : "其他", legacyConversion: cleanText(j?.legacyConversion || j?.conversion, 30), deadlineReminder: Number(j?.deadlineReminder) || 0 }));
    const events = input.events.map((e) => ({ ...pick(e, ["id", "jobId", "kind", "title", "date", "time", "endTime", "link", "place", "notes", "jdText", "resumeNotes", "prepNotes", "recapNotes", "createdAt"]), reminderMinutes: Number(e?.reminderMinutes) || 0, done: Boolean(e?.done), important: Boolean(e?.important) }));
    const blocks = input.blocks.map((b) => ({ ...pick(b, ["id", "date", "start", "end", "category", "title", "createdAt"]), state: ["open", "done", "skipped"].includes(b?.state) ? b.state : "open", syncToToday: Boolean(b?.syncToToday) })).map((b) => ({ ...b, category: b.category === "项目复盘" ? "学习" : b.category || "其他" }));
    const tasks = (Array.isArray(input.tasks) ? input.tasks : []).map((t) => ({ ...pick(t, ["id", "title", "date", "jobId", "createdAt"]), done: Boolean(t?.done), followup: Boolean(t?.followup) }));
    const validDate = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
    const validTime = (value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    const validBlockEnd = (value) => value === "24:00" || validTime(value);
    if (jobs.some((j) => !j.id || !j.company || !j.title || !validDate(j.deadlineDate) || !validDate(j.appliedDate) || !validDate(j.nextDate) || !validTime(j.deadlineTime)) || events.some((e) => !e.id || !e.title || !validDate(e.date) || !validTime(e.time) || !validTime(e.endTime)) || blocks.some((b) => !b.id || !b.title || !validDate(b.date) || !validTime(b.start) || !validBlockEnd(b.end)) || tasks.some((t) => !t.id || !t.title || !validDate(t.date))) throw new Error("文件中有缺失或无效的日期、时间与必填项");
    const dismissed = Array.isArray(input.dismissed) ? input.dismissed.map((x) => cleanText(x, 100)).slice(0, 10000) : [];
    const custom = [...(Array.isArray(input.categories) ? input.categories : []), ...blocks.map((b) => b.category)].map((name) => cleanText(name, 20).trim()).filter((name) => name && name !== "项目复盘" && !categories.includes(name));
    const savedTracks = Array.isArray(input.tracks) ? input.tracks : jobs.map((job) => job.track);
    const tracks = [...new Set(savedTracks.map((name) => cleanText(name, 40).trim()).filter((name) => name && name !== "其他"))].slice(0, 50);
    return { version: 1, jobs, events, blocks, tasks, dismissed, categories: [...new Set(custom)].slice(0, 50), tracks };
  }

  let state = load();
  let currentView = "today";
  let editorType = "";
  let editorId = "";
  let selectedPlanDate = today();
  let planViewMode = "day";
  let planDraft = null;
  let selectedPlacement = null;
  let hasUnsavedChanges = false;
  let sidebarNote = null;
  let heroCopy = null;
  let toastTimer;
  let editingTrack = "";
  const seenReminders = new Set();
  const allCategories = () => [...categories, ...state.categories];
  const allTracks = () => ["其他", ...state.tracks];

  function renderTrackEditor(selected) {
    const select = $('#dialog-fields select[name="track"]');
    if (!select) return;
    const value = selected ?? select.value;
    select.innerHTML = options(allTracks(), allTracks().includes(value) ? value : "其他");
    $("#custom-track-list").innerHTML = state.tracks.map((name) => `<span class="category-tag">${esc(name)}<button type="button" data-edit-track="${esc(name)}" aria-label="修改岗位方向${esc(name)}">编辑</button><button type="button" data-delete-track="${esc(name)}" aria-label="删除岗位方向${esc(name)}">×</button></span>`).join("");
  }

  function renderCategoryEditor(selected) {
    const select = $('#dialog-fields select[name="category"]');
    if (!select) return;
    select.innerHTML = options(allCategories(), selected || select.value || "投递");
    $("#custom-category-list").innerHTML = state.categories.map((name) => `<span class="category-tag">${esc(name)}<button type="button" data-delete-category="${esc(name)}" aria-label="删除分类${esc(name)}">×</button></span>`).join("");
  }

  function markUnsaved() {
    hasUnsavedChanges = true;
    $("#save-status").textContent = "有未保存更改";
    $("#save-local").classList.add("is-dirty");
  }

  function save() {
    markUnsaved();
    render();
    return true;
  }

  function saveToLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      localStorage.setItem(SIDEBAR_NOTE_KEY, JSON.stringify(sidebarNote));
      localStorage.setItem(HERO_COPY_KEY, JSON.stringify(heroCopy));
      localStorage.setItem(AI_ENDPOINT_KEY, $("#ai-endpoint").value.trim());
      localStorage.setItem(PLANNER_UI_KEY, JSON.stringify({ input: $("#quick-plan-input").value, draft: planDraft }));
      hasUnsavedChanges = false;
      $("#save-status").textContent = "已保存在本机";
      $("#save-local").classList.remove("is-dirty");
      toast("已保存到当前浏览器。");
      return true;
    } catch {
      $("#save-status").textContent = "保存失败";
      toast("保存失败，请检查浏览器存储空间或权限。");
      return false;
    }
  }

  function toast(message) {
    const box = $("#toast");
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("show"), 4200);
  }

  function jobName(id) {
    const job = state.jobs.find((item) => item.id === id);
    return job ? `${job.company} · ${job.title}` : "未关联岗位";
  }

  function dueItems() {
    const now = Date.now();
    const horizon = now + 48 * 60 * 60 * 1000;
    const items = [];
    for (const event of state.events) {
      if (event.done || !event.date) continue;
      const at = asDate(event.date, event.time || "12:00");
      if (at < now - 24 * 60 * 60 * 1000 || at > (event.important ? now + 7 * 24 * 60 * 60 * 1000 : horizon)) continue;
      const key = `event:${event.id}`;
      items.push({ key, at, title: event.title || event.kind, meta: `${jobName(event.jobId)} · ${timeLabel(event.date, event.time)}`, kind: event.kind, important: event.important, isReminder: Boolean(event.time) && at - event.reminderMinutes * 60000 <= now && at >= now && !state.dismissed.includes(key) });
    }
    for (const job of state.jobs) {
      if (job.status === "已结束" || !job.deadlineDate) continue;
      const dateOnly = !job.deadlineTime;
      const at = asDate(job.deadlineDate, job.deadlineTime || "12:00");
      if (at < now - 24 * 60 * 60 * 1000 || at > horizon) continue;
      const key = `job:${job.id}`;
      items.push({ key, at, title: `${job.company} · ${job.title}`, meta: `投递截止 · ${timeLabel(job.deadlineDate, job.deadlineTime)}`, kind: "截止", isReminder: !dateOnly && at - job.deadlineReminder * 60000 <= now && at >= now && !state.dismissed.includes(key) });
    }
    return items.sort((a, b) => a.at - b.at);
  }

  function renderStats() {
    const active = state.jobs.filter((job) => job.status !== "已结束").length;
    const submitted = state.jobs.filter((job) => ["已投递", "笔试中", "面试中"].includes(job.status)).length;
    const events = state.events.filter((event) => !event.done && event.date === today()).length;
    const tasks = state.tasks.filter((task) => task.date === today());
    const syncedBlocks = state.blocks.filter((block) => block.date === today() && block.syncToToday);
    const completed = tasks.filter((task) => task.done).length + syncedBlocks.filter((block) => block.state === "done").length;
    $("#stats").innerHTML = [
      ["进行中岗位", active, "持续跟进"], ["已投递岗位", submitted, "逐步推进"], ["今日笔试面试", events, "记得预留准备时间"], ["今日待办", `${completed}/${tasks.length + syncedBlocks.length}`, "完成 / 总数"]
    ].map(([label, number, sub]) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-number">${number}</div><div class="stat-sub">${sub}</div></div>`).join("");
  }

  function renderToday() {
    const now = new Date();
    $("#top-date").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
    $("#hero-date").innerHTML = `<div class="day">${now.getDate()}</div><div class="month">${now.getFullYear()} / ${String(now.getMonth() + 1).padStart(2, "0")}</div>`;
    renderStats();
    const due = dueItems();
    const unknown = state.jobs.filter((job) => job.status !== "已结束" && job.deadlineDate === today() && !job.deadlineTime);
    const dueHtml = due.map((item) => `<div class="mini-row"><span class="mini-icon ${item.isReminder || item.important ? "urgent" : ""}">${item.kind === "截止" ? "!" : "◷"}</span><span class="mini-copy"><strong>${esc(item.title)}${item.important ? ' <span class="chip warm">重要</span>' : ""}${item.isReminder ? ' <span class="chip red">现在提醒</span>' : ""}</strong><small>${esc(item.meta)}</small></span>${item.isReminder ? `<button class="small-btn" data-action="dismiss" data-id="${esc(item.key)}" type="button">知道了</button>` : ""}</div>`).join("");
    const unknownHtml = unknown.filter((job) => !due.some((item) => item.key === `job:${job.id}`)).map((job) => `<div class="mini-row"><span class="mini-icon urgent">?</span><span class="mini-copy"><strong>${esc(job.company)} · ${esc(job.title)}</strong><small>今天截止 · 具体时间待核实</small></span></div>`).join("");
    $("#attention-list").innerHTML = dueHtml + unknownHtml || empty("眼下没有临近事件", "添加笔试、面试或岗位截止时间后会显示在这里。");
    const todayTasks = state.tasks.filter((task) => task.date <= today()).sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));
    const syncedBlocks = state.blocks.filter((block) => block.date === today() && block.syncToToday).sort((a, b) => a.start.localeCompare(b.start));
    const syncedHtml = syncedBlocks.map((block) => `<div class="mini-row"><span class="mini-icon ${block.state === "open" ? "urgent" : ""}">${block.state === "done" ? "✓" : block.state === "skipped" ? "–" : "□"}</span><span class="mini-copy"><strong>${esc(block.title)}</strong><small>${esc(block.start)}—${esc(block.end)} · ${esc(block.category)} · 来自每日安排${block.state === "done" ? " · 已完成" : block.state === "skipped" ? " · 已跳过" : ""}</small></span><button class="small-btn" data-action="${block.state === "open" ? "done-block" : "reset-block"}" data-id="${esc(block.id)}" type="button">${block.state === "open" ? "完成" : "恢复"}</button><button class="small-btn" data-action="edit-block" data-id="${esc(block.id)}" type="button">调整</button></div>`).join("");
    $("#today-tasks").innerHTML = todayTasks.length || syncedBlocks.length ? `<div class="mini-list">${syncedHtml}${todayTasks.map((task) => `<div class="mini-row"><span class="mini-icon ${task.done ? "" : "urgent"}">${task.done ? "✓" : "□"}</span><span class="mini-copy"><strong>${esc(task.title)}</strong><small>${task.jobId ? esc(jobName(task.jobId)) : "个人待办"}${task.date < today() ? " · 已逾期" : ""}${task.done ? " · 已完成" : ""}</small></span><button class="small-btn" data-action="toggle-task" data-id="${esc(task.id)}" type="button">${task.done ? "恢复" : "完成"}</button><button class="small-btn" data-action="edit-task" data-id="${esc(task.id)}" type="button">编辑</button><button class="small-btn danger" data-action="delete-task" data-id="${esc(task.id)}" type="button">删除</button></div>`).join("")}</div>` : empty("今天没有待办", "添加一件今天最该完成的事。");
    const followupTasks = state.tasks.filter((task) => task.followup && task.date === tomorrow());
    const followupJobs = state.jobs.filter((job) => job.status !== "已结束" && job.nextAction && job.nextDate === tomorrow());
    $("#tomorrow-actions").innerHTML = followupTasks.length || followupJobs.length ? `<div class="mini-list">${followupTasks.map((task) => `<div class="mini-row"><span class="mini-icon">→</span><span class="mini-copy"><strong>${esc(task.title)}</strong><small>${task.jobId ? esc(jobName(task.jobId)) : "个人跟进"}${task.done ? " · 已完成" : ""}</small></span><button class="small-btn" data-action="edit-task" data-id="${esc(task.id)}" type="button">调整</button><button class="small-btn danger" data-action="delete-task" data-id="${esc(task.id)}" type="button">删除</button></div>`).join("")}${followupJobs.map((job) => `<div class="mini-row"><span class="mini-icon">→</span><span class="mini-copy"><strong>${esc(job.nextAction)}</strong><small>${esc(job.company)} · ${esc(job.title)}</small></span><button class="small-btn" data-action="edit-job" data-id="${esc(job.id)}" type="button">调整</button></div>`).join("")}</div>` : empty("明天还没有跟进安排", "提前记下要联系的岗位和要完成的下一步。");
    for (const item of due.filter((x) => x.isReminder)) if (!seenReminders.has(item.key)) { seenReminders.add(item.key); toast(`提醒：${item.title}`); break; }
  }

  function renderJobs() {
    const query = $("#job-search").value.trim().toLowerCase();
    const filter = $("#job-filter").value;
    const jobs = state.jobs.filter((job) => (filter === "all" || job.status === filter) && `${job.company} ${job.title}`.toLowerCase().includes(query)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#job-list").innerHTML = jobs.length ? jobs.map((job) => {
      const related = state.events.filter((event) => event.jobId === job.id).length;
      return `<article class="record"><div class="record-top"><div><h2 class="record-title">${esc(job.company)} · ${esc(job.title)}</h2><div class="record-sub">${esc(job.track || "其他")} · ${esc(job.city)}</div></div><div class="record-actions"><button class="small-btn" data-action="edit-job" data-id="${esc(job.id)}" type="button">编辑</button><button class="small-btn danger" data-action="delete-job" data-id="${esc(job.id)}" type="button">删除</button></div></div><div class="record-meta"><span class="chip">${esc(job.status)}</span><span class="chip gray">类型：${esc(job.employmentType || "其他")}</span><span class="chip gray">${related} 个事件</span></div><div class="record-detail"><span>投递：${job.appliedDate ? esc(dateLabel(job.appliedDate)) : "未记录"}</span><span>截止：${job.deadlineDate ? esc(timeLabel(job.deadlineDate, job.deadlineTime)) : "未记录"}</span><span>下一步：${esc(job.nextAction || "未设置")}${job.nextDate ? ` · ${esc(dateLabel(job.nextDate))}` : ""}</span><span>${urlLink(job.url, "查看岗位链接")}</span>${job.notes ? `<span>备注：${esc(job.notes)}</span>` : ""}</div></article>`;
    }).join("") : empty("还没有符合条件的岗位", "新增岗位，或调整搜索与筛选条件。");
  }

  function renderEvents() {
    const events = [...state.events].sort((a, b) => `${a.date || "9999-12-31"}T${a.time || "00:00"}`.localeCompare(`${b.date || "9999-12-31"}T${b.time || "00:00"}`));
    $("#event-list").innerHTML = events.length ? events.map((event) => {
      const note = (label, value) => value ? `<div><strong>${label}</strong><p>${esc(value)}</p></div>` : "";
      const materials = note("JD / 岗位要求", event.jdText) + note("个人经历与简历要点", event.resumeNotes) + note("准备内容", event.prepNotes) + note("复盘记录", event.recapNotes);
      return `<article class="record ${event.done ? "is-done" : ""}"><div class="record-top"><div><h2 class="record-title">${esc(event.title)}</h2><div class="record-sub">${esc(jobName(event.jobId))}</div></div><div class="record-actions"><button class="small-btn" data-action="toggle-event" data-id="${esc(event.id)}" type="button">${event.done ? "恢复" : "完成"}</button><button class="small-btn" data-action="edit-event" data-id="${esc(event.id)}" type="button">编辑准备/复盘</button><button class="small-btn danger" data-action="delete-event" data-id="${esc(event.id)}" type="button">删除</button></div></div><div class="record-meta"><span class="chip warm">${esc(event.kind)}</span>${event.important ? '<span class="chip red">重要</span>' : ""}<span class="chip gray">${esc(event.date ? timeLabel(event.date, event.time) : "时间待定")}${event.endTime ? `—${esc(event.endTime)}` : ""}</span>${event.date && event.time ? `<span class="chip gray">提前 ${event.reminderMinutes || 0} 分钟</span>` : ""}</div><div class="record-detail"><span>${event.place ? `地点：${esc(event.place)}` : "地点未记录"}</span><span>${urlLink(event.link, "打开事件链接")}</span>${event.notes ? `<span>备注：${esc(event.notes)}</span>` : ""}</div>${materials ? `<details class="material-panel"><summary>查看准备材料与复盘</summary>${materials}</details>` : `<p class="material-hint">还没有准备材料或复盘记录，可点击“编辑准备/复盘”添加。</p>`}</article>`;
    }).join("") : empty("还没有笔试或面试", "添加事件后，可记录 JD、准备要点与结束后的复盘。");
  }

  function conflicts(block) {
    if (block.state !== "open") return false;
    const peers = state.blocks.filter((other) => other.id !== block.id && other.date === block.date && other.state === "open");
    if (peers.some((other) => block.start < other.end && other.start < block.end)) return true;
    return state.events.some((event) => !event.done && event.date === block.date && event.time && toMinutes(block.start) < (event.endTime ? toMinutes(event.endTime) : toMinutes(event.time) + 60) && toMinutes(event.time) < toMinutes(block.end));
  }

  function scheduleEntries(date) {
    const blocks = state.blocks.filter((block) => block.date === date).sort((a, b) => a.start.localeCompare(b.start));
    const events = state.events.filter((event) => event.date === date && event.time).sort((a, b) => a.time.localeCompare(b.time));
    const entries = [
      ...blocks.map((block) => ({ id: block.id, title: block.title, kind: "block", category: block.category, state: block.state, syncToToday: block.syncToToday, start: toMinutes(block.start), end: toMinutes(block.end), displayStart: block.start, displayEnd: block.end, conflict: conflicts(block) })),
      ...events.map((event) => ({ id: event.id, title: event.title, kind: "event", category: event.kind, state: event.done ? "done" : "open", start: toMinutes(event.time), end: Math.min(1440, event.endTime ? toMinutes(event.endTime) : toMinutes(event.time) + 60), displayStart: event.time, displayEnd: event.endTime || toTime(Math.min(1440, toMinutes(event.time) + 60)) }))
    ].sort((a, b) => a.start - b.start || b.end - a.end);
    let group = [];
    let groupEnd = -1;
    const assignLanes = () => {
      const laneEnds = [];
      for (const item of group) {
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(item.end); }
        else laneEnds[lane] = item.end;
        item.lane = lane;
      }
      group.forEach((item) => { item.lanes = laneEnds.length; });
    };
    for (const item of entries) {
      if (group.length && item.start >= groupEnd) { assignLanes(); group = []; groupEnd = -1; }
      group.push(item);
      groupEnd = Math.max(groupEnd, item.end);
    }
    if (group.length) assignLanes();
    return { blocks, events, entries };
  }

  const weekDates = (date) => {
    const start = new Date(`${date}T12:00:00`);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return localDate(day); });
  };

  function renderWeek() {
    const dates = weekDates(selectedPlanDate);
    const days = dates.map((date) => ({ date, ...scheduleEntries(date) }));
    const weekCount = days.reduce((total, day) => total + day.blocks.length, 0);
    const eventCount = days.reduce((total, day) => total + day.events.length, 0);
    $("#plan-summary").textContent = `本周 ${weekCount} 项安排 · ${eventCount} 个笔试面试`;
    $("#week-range").textContent = `${dates[0]} — ${dates[6]} · 点击日期查看当天详情`;
    $("#week-calendar").innerHTML = days.map((day, index) => `<section class="week-day ${day.date === selectedPlanDate ? "is-selected" : ""}"><button class="week-day-head ${day.date === selectedPlanDate ? "is-selected" : ""}" data-week-date="${day.date}" type="button" aria-label="查看${esc(dateLabel(day.date))}日程"><strong>${["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index]}</strong><span>${day.date.slice(5).replace("-", "/")}</span><small>${day.entries.length} 项</small></button><div class="week-day-items">${day.entries.length ? day.entries.map((item) => `<article class="week-item ${item.kind === "event" ? "fixed-event" : categoryClass[item.category] || "other"} ${item.state !== "open" ? "is-complete" : ""}"><button class="week-item-main" data-action="${item.kind === "event" ? "edit-event" : "edit-block"}" data-id="${esc(item.id)}" type="button"><span>${esc(item.displayStart)}—${esc(item.displayEnd)}</span><strong>${esc(item.title)}</strong><small>${esc(item.category)}${item.state === "done" ? " · 已完成" : item.state === "skipped" ? " · 已跳过" : ""}${item.conflict ? " · 时间冲突" : ""}</small></button><button class="week-item-delete" data-action="${item.kind === "event" ? "delete-event" : "delete-block"}" data-id="${esc(item.id)}" type="button" aria-label="删除${esc(item.title)}" title="删除日程">×</button></article>`).join("") : `<p class="week-empty">暂无安排</p>`}</div></section>`).join("");
    const selectedHeader = $("#week-calendar .week-day-head.is-selected");
    if (selectedHeader) $(".week-scroll").scrollLeft = Math.max(0, selectedHeader.getBoundingClientRect().left - $("#week-calendar").getBoundingClientRect().left);
  }

  function renderBlocks() {
    const { blocks, events, entries } = scheduleEntries(selectedPlanDate);
    $("#plan-date").value = selectedPlanDate;
    $("#plan-day-view").setAttribute("aria-pressed", String(planViewMode === "day"));
    $("#plan-week-view").setAttribute("aria-pressed", String(planViewMode === "week"));
    $("#plan-workspace").hidden = planViewMode === "week";
    $("#week-panel").hidden = planViewMode !== "week";
    $("#plan-prev").setAttribute("aria-label", planViewMode === "week" ? "前一周" : "前一天");
    $("#plan-next").setAttribute("aria-label", planViewMode === "week" ? "后一周" : "后一天");
    $("#back-today").textContent = planViewMode === "week" ? "回到本周" : "回到今天";
    if (planViewMode === "week") { renderWeek(); return; }
    $("#plan-summary").textContent = `${blocks.length} 项安排 · ${events.length} 个笔试面试 · ${blocks.filter((b) => b.state === "done").length} 项完成`;
    const assignedDrafts = planDraft?.date === selectedPlanDate ? planDraft.items.flatMap((item, index) => item.start && item.end ? [{ id: String(index), title: item.title, kind: "draft", category: item.category, state: "open", syncToToday: item.syncToToday, start: toMinutes(item.start), end: toMinutes(item.end), displayStart: item.start, displayEnd: item.end }] : []) : [];
    const allEntries = [...entries, ...assignedDrafts].sort((a, b) => a.start - b.start);
    const grid = $("#block-list");
    const previousDate = grid.dataset.renderedDate;
    const previousScroll = grid.scrollTop;
    const hourHeight = 104;
    const laneGroup = [];
    let groupEnd = -1;
    const assignLanes = () => {
      const laneEnds = [];
      for (const item of laneGroup) {
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(item.end); }
        else laneEnds[lane] = item.end;
        item.lane = lane;
      }
      laneGroup.forEach((item) => { item.lanes = laneEnds.length; });
      laneGroup.length = 0;
    };
    for (const item of allEntries) {
      if (laneGroup.length && item.start >= groupEnd) { assignLanes(); groupEnd = -1; }
      laneGroup.push(item);
      groupEnd = Math.max(groupEnd, item.end);
    }
    if (laneGroup.length) assignLanes();
    const entryHtml = (item) => {
      const type = item.kind === "event" ? "fixed-event" : categoryClass[item.category] || "other";
      const meta = `${item.category}${item.kind === "draft" ? " · 草案" : item.kind === "event" ? " · 固定事件" : ""}${item.syncToToday ? " · 同步今日待办" : ""}${item.state === "done" ? " · 已完成" : item.state === "skipped" ? " · 已跳过" : ""}${item.conflict ? " · ⚠ 时间冲突" : ""}`;
      const edit = item.kind === "draft" ? `data-draft-select="${item.id}"` : `data-action="${item.kind === "event" ? "edit-event" : "edit-block"}" data-id="${esc(item.id)}"`;
      const drag = item.kind === "draft" ? `data-drag-draft="${item.id}"` : item.kind === "block" ? `data-drag-block="${esc(item.id)}"` : "";
      const move = item.kind === "draft" ? `data-draft-select="${item.id}"` : `data-move-block="${esc(item.id)}"`;
      const deleteAction = item.kind === "draft" ? `data-draft-remove="${item.id}"` : `data-action="${item.kind === "event" ? "delete-event" : "delete-block"}" data-id="${esc(item.id)}"`;
      const controls = `${drag ? `<span class="time-block-drag" draggable="true" ${drag} ${move} role="button" tabindex="0" aria-label="拖动或点选${esc(item.title)}调整时间" title="拖动调整时间；点选后可选择时间段">⠿</span>` : ""}${item.kind === "block" ? `<button class="time-block-icon" data-action="sync-block" data-id="${esc(item.id)}" type="button" aria-label="${item.syncToToday ? "取消同步" : "同步"}${esc(item.title)}到今日待办" title="${item.syncToToday ? "取消同步" : "同步待办"}">${item.syncToToday ? "▣" : "▢"}</button><button class="time-block-icon" data-action="${item.state === "open" ? "done-block" : "reset-block"}" data-id="${esc(item.id)}" type="button" aria-label="${item.state === "open" ? "完成" : "恢复"}${esc(item.title)}" title="${item.state === "open" ? "完成" : "恢复"}">✓</button>` : ""}<button class="time-block-icon danger" ${deleteAction} type="button" aria-label="删除${esc(item.title)}" title="删除日程">×</button>`;
      const width = 100 / item.lanes;
      const top = Math.round(item.start * hourHeight / 60) + 2;
      const height = Math.max(56, Math.round((item.end - item.start) * hourHeight / 60) - 4);
      return `<article class="time-block ${type} ${item.kind === "draft" ? "is-draft" : ""} ${item.state !== "open" ? "is-complete" : ""}" style="top:${top}px;height:${height}px;left:calc(${item.lane * width}% + 5px);width:calc(${width}% - 10px)"><button class="time-block-main" ${edit} type="button"><span>${esc(item.displayStart)}—${esc(item.displayEnd)}</span><strong>${esc(item.title)}</strong><small>${esc(meta)}</small></button><div class="time-block-actions">${controls}</div></article>`;
    };
    const labels = Array.from({ length: 25 }, (_, hour) => `<span class="time-grid-hour-label" style="top:${hour * hourHeight}px">${toTime(hour * 60)}</span>`).join("");
    const slots = Array.from({ length: 48 }, (_, index) => {
      const time = toTime(index * 30);
      return `<div class="time-grid-slot ${index % 2 ? "half" : "full"} ${selectedPlacement ? "can-place" : ""}" data-slot-time="${time}" role="button" tabindex="0" aria-label="${time} 开始的时间段" style="top:${index * hourHeight / 2}px;height:${hourHeight / 2}px">${index % 2 ? `<span>${time}</span>` : ""}</div>`;
    }).join("");
    grid.innerHTML = `<div class="time-grid"><div class="time-grid-axis" style="height:${24 * hourHeight}px">${labels}</div><div class="time-grid-track" style="height:${24 * hourHeight}px">${slots}${allEntries.map(entryHtml).join("")}</div></div>`;
    grid.dataset.renderedDate = selectedPlanDate;
    const focusHour = allEntries.length ? Math.floor(allEntries[0].start / 60) : 8;
    grid.scrollTop = previousDate === selectedPlanDate ? previousScroll : Math.max(0, focusHour * hourHeight - 30);
  }

  function render() { renderToday(); renderJobs(); renderEvents(); renderBlocks(); }

  function activate(view) {
    if (!["today", "jobs", "events", "plan"].includes(view)) view = "today";
    currentView = view;
    $("#login-entry").hidden = view !== "today";
    $(".topbar").classList.toggle("has-login", view === "today");
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
    document.querySelectorAll(".nav-item").forEach((el) => { const active = el.dataset.view === view; el.classList.toggle("active", active); el.setAttribute("aria-current", active ? "page" : "false"); });
    if (view === "plan") { $("#block-list").dataset.renderedDate = ""; renderBlocks(); }
    history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEditor(type, id = "") {
    const followupDefault = type === "followup";
    if (followupDefault) type = "task";
    editorType = type; editorId = id; editingTrack = "";
    const item = id ? state[`${type === "job" ? "jobs" : type === "event" ? "events" : type === "task" ? "tasks" : "blocks"}`].find((x) => x.id === id) : null;
    $("#dialog-kicker").textContent = id ? "EDIT ENTRY" : "NEW ENTRY";
    $("#dialog-title").textContent = `${id ? "编辑" : "新增"}${type === "job" ? "岗位" : type === "event" ? "笔试面试" : type === "task" ? "待办" : "时间安排"}`;
    let html = "";
    if (type === "job") {
      html = field("company", "公司 *", "text", item?.company, 'required maxlength="80"') + field("title", "岗位名称 *", "text", item?.title, 'required maxlength="80"') + selectField("track", "岗位方向", allTracks(), item?.track || "其他")
        + `<div class="category-editor field full"><span>自定义岗位方向</span><div class="category-editor-add"><input id="new-track-name" type="text" maxlength="40" placeholder="输入岗位方向" aria-label="岗位方向名称"><button class="btn btn-secondary" id="add-track" type="button">＋ 添加方向</button></div><div id="custom-track-list" class="custom-category-list"></div></div>`
        + selectField("city", "城市", cities, item?.city || cities[0]) + selectField("status", "当前进度", statuses, item?.status || "待投递") + selectField("employmentType", "类型", employmentTypes, item?.employmentType || "其他")
        + (item?.legacyConversion ? `<p class="field-note">旧记录的转正机会为“${esc(item.legacyConversion)}”；无法据此确定岗位类型，请自行选择。</p>` : "")
        + field("url", "岗位链接", "url", item?.url, 'placeholder="https://…"', true) + field("deadlineDate", "投递截止日期", "date", item?.deadlineDate) + field("deadlineTime", "截止时间（未知可留空）", "time", item?.deadlineTime) + selectField("deadlineReminder", "截止提前提醒", [["0", "到时"], ["60", "提前 1 小时"], ["1440", "提前 1 天"]].map(([v, label]) => ({ v, label })), String(item?.deadlineReminder ?? 1440)) + field("appliedDate", "投递日期", "date", item?.appliedDate) + field("nextAction", "下一步动作", "text", item?.nextAction, 'maxlength="100"') + field("nextDate", "下一步日期", "date", item?.nextDate) + textArea("notes", "备注", item?.notes);
    } else if (type === "event") {
      const jobOptions = `<option value="">不关联岗位</option>${state.jobs.map((job) => `<option value="${esc(job.id)}" ${item?.jobId === job.id ? "selected" : ""}>${esc(job.company)} · ${esc(job.title)}</option>`).join("")}`;
      html = `<label class="field full">关联岗位<select name="jobId">${jobOptions}</select></label>`
        + selectField("kind", "事件类型", ["笔试", "面试", "其他"], item?.kind || "面试")
        + selectField("important", "是否重要事件", [{ v: "no", label: "普通" }, { v: "yes", label: "重要 · 有日期后显示在需要留意" }], item?.important ? "yes" : "no")
        + field("title", "事件名称 *", "text", item?.title, 'required maxlength="100"')
        + field("date", "日期（可稍后补）", "date", item?.date)
        + field("time", "开始时间（可稍后补）", "time", item?.time)
        + field("endTime", "结束时间", "time", item?.endTime)
        + `<label class="field">提前提醒（需填日期和开始时间）<select name="reminderMinutes"><option value="0" ${Number(item?.reminderMinutes) === 0 ? "selected" : ""}>到时</option><option value="15" ${Number(item?.reminderMinutes) === 15 ? "selected" : ""}>提前 15 分钟</option><option value="30" ${Number(item?.reminderMinutes) === 30 || item?.reminderMinutes == null ? "selected" : ""}>提前 30 分钟</option><option value="60" ${Number(item?.reminderMinutes) === 60 ? "selected" : ""}>提前 1 小时</option><option value="1440" ${Number(item?.reminderMinutes) === 1440 ? "selected" : ""}>提前 1 天</option></select></label>`
        + field("place", "地点或平台", "text", item?.place, 'maxlength="120"')
        + field("link", "会议或笔试链接", "url", item?.link, 'placeholder="https://…"', true)
        + `<div class="form-divider">准备材料</div>`
        + textArea("jdText", "JD / 岗位要求（可粘贴）", item?.jdText, 8000)
        + `<label class="field full">导入 JD 文本文件 <small>支持 TXT/MD；提交本表单后，还需点击右上角保存到本地。</small><input name="jdFile" type="file" accept=".txt,.md,text/plain,text/markdown"></label>`
        + textArea("resumeNotes", "个人经历与简历要点", item?.resumeNotes, 8000)
        + textArea("prepNotes", "面试准备 / 可能问题与回答要点", item?.prepNotes, 8000)
        + `<div class="form-divider">结束后复盘</div>`
        + textArea("recapNotes", "笔试或面试复盘记录", item?.recapNotes, 8000)
        + textArea("notes", "其他备注", item?.notes);
    } else if (type === "block") {
      html = field("date", "日期 *", "date", item?.date || selectedPlanDate, "required") + selectField("category", "类型", allCategories(), item?.category || "投递")
        + `<div class="category-editor field full"><span>自定义分类</span><div class="category-editor-add"><input id="new-category-name" type="text" maxlength="20" placeholder="例如：英语学习" aria-label="新分类名称"><button class="btn btn-secondary" id="add-category" type="button">＋ 添加分类</button></div><div id="custom-category-list" class="custom-category-list"></div></div>`
        + field("start", "开始时间 *", "time", item?.start, "required") + field("end", "结束时间 *", "time", item?.end === "24:00" ? "" : item?.end, item?.end === "24:00" ? "disabled" : "required")
        + `<label class="field full sync-choice"><input name="endAtMidnight" type="checkbox" value="yes" ${item?.end === "24:00" ? "checked" : ""}><span>当天 24:00 结束</span></label>`
        + field("title", "安排内容 *", "text", item?.title, 'required maxlength="100"', true)
        + `<label class="field full sync-choice"><input name="syncToToday" type="checkbox" value="yes" ${item?.syncToToday ? "checked" : ""}><span>同步到当天的“今日总览 · 今日待办”</span></label>`;
    } else {
      const jobOptions = `<option value="">不关联岗位</option>${state.jobs.map((job) => `<option value="${esc(job.id)}" ${item?.jobId === job.id ? "selected" : ""}>${esc(job.company)} · ${esc(job.title)}</option>`).join("")}`;
      html = field("title", "待办内容 *", "text", item?.title, 'required maxlength="100"', true) + field("date", "计划日期 *", "date", item?.date || (followupDefault ? tomorrow() : today()), "required") + selectField("taskType", "事项类型", ["普通待办", "岗位跟进"], item?.followup || followupDefault ? "岗位跟进" : "普通待办") + `<label class="field full">关联岗位<select name="jobId">${jobOptions}</select></label>`;
    }
    $("#dialog-fields").innerHTML = html;
    if (type === "block") renderCategoryEditor();
    if (type === "job") renderTrackEditor(item?.track || "其他");
    $("#editor").showModal();
    $("#dialog-fields input:not([type=date]):not([type=time]), #dialog-fields select").focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const id = editorId || uid();
    const createdAt = editorId ? state[`${editorType === "job" ? "jobs" : editorType === "event" ? "events" : editorType === "task" ? "tasks" : "blocks"}`].find((x) => x.id === id)?.createdAt || new Date().toISOString() : new Date().toISOString();
    let record;
    if (editorType === "job") {
      if (data.deadlineTime && !data.deadlineDate) { toast("请先填写投递截止日期。"); return; }
      record = { id, createdAt, company: data.company.trim(), title: data.title.trim(), track: allTracks().includes(data.track) ? data.track : "其他", city: data.city, status: data.status, employmentType: employmentTypes.includes(data.employmentType) ? data.employmentType : "其他", url: data.url.trim(), deadlineDate: data.deadlineDate, deadlineTime: data.deadlineTime, deadlineReminder: Number(data.deadlineReminder), appliedDate: data.appliedDate, nextAction: data.nextAction.trim(), nextDate: data.nextDate, notes: data.notes.trim() };
    } else if (editorType === "event") {
      if (data.time && !data.date) { toast("填写开始时间时，也请填写日期。"); return; }
      if (data.endTime && !data.time) { toast("请先填写开始时间，再填写结束时间。"); return; }
      if (data.endTime && data.endTime <= data.time) { toast("结束时间需要晚于开始时间。"); return; }
      let jdText = data.jdText.trim();
      if (data.jdFile?.size) {
        if (data.jdFile.size > 50 * 1024 || !/\.(txt|md)$/i.test(data.jdFile.name)) { toast("JD 文件仅支持 50 KB 以内的 TXT/MD 文本。"); return; }
        jdText = (await data.jdFile.text()).trim();
        if (jdText.length > 8000) { toast("JD 文本超过 8000 字，请摘录关键部分。"); return; }
      }
      record = { id, createdAt, jobId: data.jobId, kind: data.kind, important: data.important === "yes", title: data.title.trim(), date: data.date, time: data.time, endTime: data.endTime, place: data.place.trim(), link: data.link.trim(), notes: data.notes.trim(), jdText, resumeNotes: data.resumeNotes.trim(), prepNotes: data.prepNotes.trim(), recapNotes: data.recapNotes.trim(), reminderMinutes: Number(data.reminderMinutes), done: editorId ? state.events.find((x) => x.id === id)?.done || false : false };
    } else if (editorType === "block") {
      const end = data.endAtMidnight === "yes" ? "24:00" : data.end;
      if (!end || end <= data.start) { toast("结束时间需要晚于开始时间。"); return; }
      record = { id, createdAt, date: data.date, category: data.category, title: data.title.trim(), start: data.start, end, syncToToday: data.syncToToday === "yes", state: editorId ? state.blocks.find((x) => x.id === id)?.state || "open" : "open" };
      selectedPlanDate = record.date;
    } else {
      record = { id, createdAt, title: data.title.trim(), date: data.date, jobId: data.jobId, followup: data.taskType === "岗位跟进", done: editorId ? state.tasks.find((x) => x.id === id)?.done || false : false };
    }
    const collection = editorType === "job" ? state.jobs : editorType === "event" ? state.events : editorType === "task" ? state.tasks : state.blocks;
    const index = collection.findIndex((x) => x.id === id);
    if (index >= 0) collection[index] = record; else collection.push(record);
    state.dismissed = state.dismissed.filter((key) => key !== `${editorType}:${id}`);
    $("#editor").close();
    save();
    toast("已添加到页面；点击右上角“保存到本地”后才会保留。");
  }

  function handleAction(action, id) {
    if (action === "dismiss") { state.dismissed.push(id); save(); return; }
    const [, verb, kind] = action.match(/^(edit|delete|toggle|done|skip|reset|sync)-(job|event|block|task)$/) || [];
    if (!verb) return;
    const collection = kind === "job" ? state.jobs : kind === "event" ? state.events : kind === "task" ? state.tasks : state.blocks;
    const item = collection.find((x) => x.id === id);
    if (!item) return;
    if (verb === "edit") { openEditor(kind, id); return; }
    if (verb === "delete") {
      const message = kind === "job" ? "删除岗位会同时删除关联的笔试面试。确定删除吗？" : "确定删除这条记录吗？";
      if (!confirm(message)) return;
      if (kind === "job") state.events = state.events.filter((x) => x.jobId !== id);
      const index = collection.findIndex((x) => x.id === id);
      collection.splice(index, 1);
    } else if (verb === "toggle") item.done = !item.done;
    else if (verb === "sync" && kind === "block") item.syncToToday = !item.syncToToday;
    else if (verb === "done") item.state = "done";
    else if (verb === "skip") item.state = "skipped";
    else if (verb === "reset") item.state = "open";
    save();
  }

  const toMinutes = (time) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
  const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  function placementConflict(start, end, exclude = null) {
    const saved = state.blocks.filter((block) => block.date === selectedPlanDate && block.state === "open" && !(exclude?.kind === "block" && block.id === exclude.id)).map((block) => ({ start: toMinutes(block.start), end: toMinutes(block.end) }));
    const fixed = state.events.filter((event) => !event.done && event.date === selectedPlanDate && event.time).map((event) => ({ start: toMinutes(event.time), end: event.endTime ? toMinutes(event.endTime) : Math.min(1440, toMinutes(event.time) + 60) }));
    const drafts = planDraft?.date === selectedPlanDate ? planDraft.items.flatMap((item, index) => item.start && item.end && !(exclude?.kind === "draft" && index === exclude.index) ? [{ start: toMinutes(item.start), end: toMinutes(item.end) }] : []) : [];
    return [...saved, ...fixed, ...drafts].some((slot) => start < slot.end && slot.start < end);
  }

  function placeAt(selection, time) {
    if (!selection || !/^([01]\d|2[0-3]):(00|30)$/.test(time)) return;
    const item = selection.kind === "draft" ? planDraft?.items[selection.index] : state.blocks.find((block) => block.id === selection.id && block.date === selectedPlanDate);
    if (!item) { selectedPlacement = null; renderPlanDraft(); renderBlocks(); return; }
    const duration = selection.kind === "draft" ? Number(item.duration) : toMinutes(item.end) - toMinutes(item.start);
    if (!Number.isInteger(duration) || duration < 1 || (selection.kind === "draft" && (duration < 10 || duration > 240))) { toast("请先填写 10—240 分钟的时长。"); return; }
    const start = toMinutes(time);
    const end = start + duration;
    if (end > 1440) { toast("这项任务无法在当天结束，请选择更早的时间段。"); return; }
    const fixed = state.events.filter((event) => !event.done && event.date === selectedPlanDate && event.time).map((event) => ({ start: toMinutes(event.time), end: event.endTime ? toMinutes(event.endTime) : Math.min(1440, toMinutes(event.time) + 60) }));
    if (fixed.some((slot) => start < slot.end && slot.start < end)) { toast("这个时间段已有笔试面试，请选择其他时间。"); return; }
    const entries = [
      ...state.blocks.filter((block) => block.date === selectedPlanDate && (block.state === "open" || selection.kind === "block" && block.id === selection.id)).map((block) => ({ id: `block:${block.id}`, item: block, kind: "block", start: toMinutes(block.start), end: toMinutes(block.end) })),
      ...(planDraft?.date === selectedPlanDate ? planDraft.items.flatMap((draft, index) => draft.start && draft.end || selection.kind === "draft" && selection.index === index ? [{ id: `draft:${index}`, item: draft, kind: "draft", start: draft.start ? toMinutes(draft.start) : start, end: draft.end ? toMinutes(draft.end) : start + Number(draft.duration) }] : []) : [])
    ];
    const targetId = selection.kind === "draft" ? `draft:${selection.index}` : `block:${selection.id}`;
    const placements = window.PlanText.reflowAt(entries, fixed, targetId, start);
    if (!placements) { toast("顺延后当天放不下所有任务，原有时间保持不变。"); return; }
    const shifted = entries.filter((entry) => entry.id !== targetId && placements.get(entry.id).start !== entry.start).length;
    if (planDraft) {
      planDraft.originalBlocks ||= {};
      for (const entry of entries.filter((candidate) => candidate.kind === "block" && placements.get(candidate.id).start !== candidate.start)) {
        if (selection.kind === "draft") planDraft.originalBlocks[entry.item.id] ||= { start: entry.item.start, end: entry.item.end };
        else delete planDraft.originalBlocks[entry.item.id];
      }
    }
    for (const entry of entries) {
      const slot = placements.get(entry.id);
      entry.item.start = toTime(slot.start);
      entry.item.end = toTime(slot.end);
    }
    selectedPlacement = null;
    if (entries.some((entry) => entry.kind === "block" && placements.get(entry.id).start !== entry.start)) save();
    else markUnsaved();
    renderPlanDraft();
    renderBlocks();
    toast(`已将“${item.title}”放到 ${time}—${item.end}${shifted ? `，另有 ${shifted} 项顺延` : ""}。`);
  }

  function validatePlanDraft(items) {
    for (const [index, item] of items.entries()) {
      if (!item.title.trim()) return "请填写每项的任务内容。";
      if (!Number.isInteger(item.duration) || item.duration < 10 || item.duration > 240) return `请检查“${item.title}”的时长（10—240 分钟）。`;
      if (!item.start || !item.end) return `请把“${item.title}”放入左侧时间表。`;
      if (toMinutes(item.end) - toMinutes(item.start) !== item.duration || placementConflict(toMinutes(item.start), toMinutes(item.end), { kind: "draft", index })) return `“${item.title}”的时间与已有安排冲突，请重新放置。`;
    }
    return "";
  }

  function renderPlanDraft() {
    const box = $("#quick-plan-preview");
    if (!planDraft) { box.hidden = true; box.innerHTML = ""; return; }
    const error = validatePlanDraft(planDraft.items);
    const notes = planDraft.notes.map((note) => `<p class="plan-preview-note">${esc(note)}</p>`).join("");
    box.hidden = false;
    box.innerHTML = `<div class="plan-preview-head"><strong>${planDraft.source === "chatgpt" ? "ChatGPT 生成 · 待确认草案" : planDraft.source === "ai" ? "其他 AI 生成 · 待确认草案" : "本地拆分 · 待确认草案"}</strong><span>${esc(selectedPlanDate)} · ${planDraft.items.length} 项</span></div>${notes}`
      + `<p class="plan-preview-note">${planDraft.source === "local" ? "已自动排入左侧时间表；可拖动色块上的六点手柄调整时间。手机可点手柄，再点时间段。" : "拖动事项到左侧时间表的整点或半点；手机可点“选择时间”，再点时间段。"}</p>`
      + planDraft.items.map((item, index) => `<div class="plan-draft-row ${selectedPlacement?.kind === "draft" && selectedPlacement.index === index ? "is-selected" : ""}"><label class="plan-draft-title">事项<input data-draft-field="title" data-draft-index="${index}" maxlength="100" value="${esc(item.title)}"></label><label>时长（分钟）<input data-draft-field="duration" data-draft-index="${index}" type="number" min="10" max="240" value="${esc(item.duration)}"></label><label>类型<select data-draft-field="category" data-draft-index="${index}">${options(allCategories(), item.category)}</select></label><label class="draft-sync"><input data-draft-field="syncToToday" data-draft-index="${index}" type="checkbox" ${item.syncToToday ? "checked" : ""}>同步今日待办</label><div class="draft-placement"><span>${item.start ? `${esc(item.start)}—${esc(item.end)}` : "尚未放入时间表"}</span><button class="small-btn" data-draft-select="${index}" data-drag-draft="${index}" draggable="true" type="button">⠿ ${item.start ? "调整时间" : "选择时间"}</button><button class="small-btn danger" data-draft-remove="${index}" type="button">移除</button></div></div>`).join("")
      + (error ? `<p class="plan-preview-error">${esc(error)}</p>` : "")
      + `<div class="plan-preview-actions"><button class="btn btn-secondary" id="quick-plan-cancel" type="button">取消草案</button><button class="btn btn-primary" id="quick-plan-confirm" type="button" ${error || !planDraft.items.length ? "disabled" : ""}>确认加入日程</button></div>`;
  }

  function preparePlanDraft(items, source, initialNotes = []) {
    if (!items.length || items.length > 12) { toast("一次需要输入 1—12 件事。"); return; }
    if (planDraft) discardPlanDraft();
    const notes = [...initialNotes];
    const existingEvents = state.events.filter((event) => !event.done && event.date === selectedPlanDate);
    const newItems = items.filter((item) => {
      const isExistingInterview = /(?:完成|参加|进行).*?(面试|笔试)/.test(item.title) && existingEvents.some((event) => item.title.includes(event.kind));
      if (isExistingInterview) { notes.push(`“${item.title}”已在当天的笔试面试事件中，保留原有时间，未重复生成时间块。`); return false; }
      return true;
    });
    if (newItems.some((item) => !item.title || item.duration < 10 || item.duration > 240)) { toast("每项需有名称，时长为 10—240 分钟。请检查输入。"); return; }
    if (newItems.some((item) => item.estimated)) notes.push("未写时长的事项按 45 分钟估计，可在下方修改时长。");
    selectedPlacement = null;
    const preferredStart = selectedPlanDate === today() ? Math.max(540, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 30) * 30) : 540;
    const occupied = source === "local" ? [
      ...state.blocks.filter((block) => block.date === selectedPlanDate && block.state === "open").map((block) => ({ start: toMinutes(block.start), end: toMinutes(block.end) })),
      ...existingEvents.filter((event) => event.time).map((event) => ({ start: toMinutes(event.time), end: event.endTime ? toMinutes(event.endTime) : Math.min(1440, toMinutes(event.time) + 60) }))
    ] : [];
    const placements = source === "local" ? window.PlanText.autoPlace(newItems, occupied, preferredStart) : [];
    const unplaced = placements.filter((slot) => !slot).length;
    if (unplaced) notes.push(`${unplaced} 项在当天找不到空档，请手动选择时间或调整已有安排。`);
    planDraft = { items: newItems.map((item, index) => ({ ...item, start: placements[index] ? toTime(placements[index].start) : "", end: placements[index] ? toTime(placements[index].end) : "", syncToToday: false })), notes, date: selectedPlanDate, source };
    markUnsaved();
    renderPlanDraft();
    renderBlocks();
    if (source === "local") {
      const first = placements.find((slot) => slot);
      if (first) $("#block-list").scrollTop = Math.max(0, Math.floor(first.start / 60) * 104 - 30);
    }
    if (!newItems.length) toast("相关面试或笔试已记录，无需重复安排。");
  }

  function discardPlanDraft() {
    if (planDraft?.originalBlocks) {
      for (const [id, time] of Object.entries(planDraft.originalBlocks)) {
        const block = state.blocks.find((entry) => entry.id === id && entry.date === planDraft.date);
        if (block && typeof time?.start === "string" && typeof time?.end === "string") { block.start = time.start; block.end = time.end; }
      }
    }
    if (planDraft) markUnsaved();
    planDraft = null;
    selectedPlacement = null;
    renderPlanDraft();
    renderBlocks();
  }

  function generateQuickPlan() {
    preparePlanDraft(window.PlanText.parse($("#quick-plan-input").value), "local");
  }

  async function generateAiPlan() {
    const textInput = $("#quick-plan-input").value.trim();
    const endpointInput = $("#ai-endpoint").value.trim().replace(/\/+$/, "");
    const accessCode = $("#ai-access-code").value;
    if (!textInput) { toast("请先写下要做的事。"); return; }
    if (!endpointInput || !accessCode) { toast("请填写自己的 AI 服务地址和访问码。"); return; }
    let endpoint;
    try {
      const url = new URL(endpointInput);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
      endpoint = `${url.href.replace(/\/+$/, "")}/api/plan-draft`;
    } catch { toast("请输入 HTTPS 服务地址；本机测试可用 http://localhost。 "); return; }
    const button = $("#ai-plan-generate");
    const requestedDate = selectedPlanDate;
    button.disabled = true;
    button.textContent = "AI 正在生成…";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-access-code": accessCode },
        body: JSON.stringify({ text: textInput, date: requestedDate, fixedEvents: state.events.filter((event) => !event.done && event.date === requestedDate && event.time).map((event) => ({ kind: event.kind, title: event.title, time: event.time, endTime: event.endTime })) }),
        signal: AbortSignal.timeout(35000)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `服务端返回 ${response.status}`);
      if (requestedDate !== selectedPlanDate || textInput !== $("#quick-plan-input").value.trim()) { toast("输入或日期已改变，请重新生成草案。"); return; }
      if (!Array.isArray(body.items)) throw new Error("服务端没有返回可编辑事项。");
      const items = body.items.map((item) => ({ title: String(item.title || "").trim().slice(0, 100), duration: Number(item.duration), category: allCategories().includes(item.category) ? item.category : "其他", estimated: Boolean(item.estimated) }));
      preparePlanDraft(items, "ai", Array.isArray(body.notes) ? body.notes.map((note) => String(note).slice(0, 150)).slice(0, 5) : []);
    } catch (error) {
      toast(`AI 草案生成失败：${error.name === "TimeoutError" ? "服务端超时" : error.message || "请检查服务地址"}`);
    } finally {
      button.disabled = false;
      button.textContent = "其他 AI 生成";
    }
  }

  async function initializeChatGPT() {
    if (location.protocol !== "http:" || location.hostname !== "127.0.0.1") return;
    try {
      const response = await fetch("/api/chatgpt/status", { cache: "no-store" });
      if (!response.ok) return;
      const status = await response.json();
      if (!status.localApp) return;
      const login = $("#login-entry");
      login.disabled = false;
      login.textContent = status.connected ? "ChatGPT 已登录" : "使用 ChatGPT 登录";
      login.title = status.connected ? "点击重新授权 ChatGPT" : "使用本机 ChatGPT 订阅登录";
      $("#chatgpt-tools").hidden = false;
      const info = $("#chatgpt-status");
      if (!status.connected) { info.textContent = "请先在今日总览连接 ChatGPT。"; return; }
      if (!status.sharing) { info.textContent = "已登录，但尚未授权使用 ChatGPT 订阅。请在今日总览重新授权。"; return; }
      info.textContent = `${status.name || status.email || "ChatGPT 账号"} · 正在读取可用模型…`;
      const modelResponse = await fetch("/api/chatgpt/models", { cache: "no-store" });
      const body = await modelResponse.json();
      if (!modelResponse.ok) throw new Error(body.error || "模型列表不可用");
      if (!body.models?.length) throw new Error("当前账号没有可用模型");
      $("#chatgpt-model").innerHTML = body.models.map((model) => `<option value="${esc(model.id)}">${esc(model.name)}</option>`).join("");
      $("#chatgpt-model-wrap").hidden = false;
      $("#chatgpt-generate").disabled = false;
      info.textContent = `${status.name || status.email || "ChatGPT 账号"} · 可使用 ChatGPT 订阅`;
    } catch (error) {
      if (!$("#chatgpt-tools").hidden) $("#chatgpt-status").textContent = `暂无法使用 ChatGPT：${error.message}`;
    }
  }

  async function generateChatGPTPlan() {
    const textInput = $("#quick-plan-input").value.trim();
    const model = $("#chatgpt-model").value;
    if (!textInput) { toast("请先写下要做的事。"); return; }
    if (!model) { toast("请先选择可用模型。"); return; }
    const button = $("#chatgpt-generate");
    const requestedDate = selectedPlanDate;
    button.disabled = true;
    button.textContent = "ChatGPT 正在生成…";
    try {
      const response = await fetch("/api/chatgpt/plan-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: textInput, date: requestedDate, model, fixedEvents: state.events.filter((event) => !event.done && event.date === requestedDate && event.time).map((event) => ({ kind: event.kind, title: event.title, time: event.time, endTime: event.endTime })) }), signal: AbortSignal.timeout(70000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `本地服务返回 ${response.status}`);
      if (requestedDate !== selectedPlanDate || textInput !== $("#quick-plan-input").value.trim()) { toast("输入或日期已改变，请重新生成草案。"); return; }
      preparePlanDraft(body.items, "chatgpt", body.notes || []);
    } catch (error) { toast(`ChatGPT 草案生成失败：${error.name === "TimeoutError" ? "请求超时" : error.message}`); }
    finally { button.disabled = false; button.textContent = "用 ChatGPT 生成草案"; }
  }

  function confirmQuickPlan() {
    if (!planDraft || planDraft.date !== selectedPlanDate) return;
    const error = validatePlanDraft(planDraft.items);
    if (error || !planDraft.items.length) { toast(error || "草案中没有可保存的事项。"); return; }
    const generated = planDraft.items.map((item) => ({ id: uid(), createdAt: new Date().toISOString(), date: selectedPlanDate, category: item.category, title: item.title.trim(), start: item.start, end: item.end, syncToToday: Boolean(item.syncToToday), state: "open" }));
    state.blocks.push(...generated);
    if (save()) { planDraft = null; selectedPlacement = null; renderPlanDraft(); renderBlocks(); toast(`已加入 ${generated.length} 个时间块，可在时间表中继续调整。`); }
    else state.blocks.splice(-generated.length);
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { activate(viewButton.dataset.view); return; }
    const openButton = event.target.closest("[data-open]");
    if (openButton) { openEditor(openButton.dataset.open); return; }
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) handleAction(actionButton.dataset.action, actionButton.dataset.id);
  });
  $("#editor-form").addEventListener("submit", handleSubmit);
  $("#close-dialog").addEventListener("click", () => $("#editor").close());
  $("#cancel-dialog").addEventListener("click", () => $("#editor").close());
  $("#job-search").addEventListener("input", renderJobs);
  $("#job-filter").addEventListener("change", renderJobs);
  $("#plan-date").addEventListener("change", (event) => { selectedPlanDate = event.target.value || today(); discardPlanDraft(); });
  const shiftPlanDate = (days) => { const date = new Date(`${selectedPlanDate}T12:00:00`); date.setDate(date.getDate() + days); selectedPlanDate = localDate(date); discardPlanDraft(); };
  $("#plan-prev").addEventListener("click", () => shiftPlanDate(planViewMode === "week" ? -7 : -1));
  $("#plan-next").addEventListener("click", () => shiftPlanDate(planViewMode === "week" ? 7 : 1));
  $("#back-today").addEventListener("click", () => { selectedPlanDate = today(); discardPlanDraft(); });
  $("#plan-day-view").addEventListener("click", () => { planViewMode = "day"; renderBlocks(); });
  $("#plan-week-view").addEventListener("click", () => { planViewMode = "week"; renderBlocks(); });
  $("#week-calendar").addEventListener("click", (event) => {
    const day = event.target.closest("[data-week-date]");
    if (!day) return;
    selectedPlanDate = day.dataset.weekDate;
    planViewMode = "day";
    planDraft = null;
    selectedPlacement = null;
    renderPlanDraft();
    renderBlocks();
  });
  $("#quick-plan-toggle").addEventListener("click", () => {
    const panel = $(".quick-plan");
    const expanded = panel.classList.toggle("is-open");
    $("#quick-plan-toggle").setAttribute("aria-expanded", String(expanded));
    $("#quick-plan-toggle").textContent = expanded ? "收起输入" : "展开输入";
  });
  $("#quick-plan-generate").addEventListener("click", generateQuickPlan);
  $("#ai-plan-generate").addEventListener("click", generateAiPlan);
  $("#chatgpt-generate").addEventListener("click", generateChatGPTPlan);
  const renderSidebarNote = () => {
    if (typeof sidebarNote?.title === "string" && sidebarNote.title.trim()) $("#sidebar-note-title").textContent = sidebarNote.title;
    if (typeof sidebarNote?.body === "string" && sidebarNote.body.trim()) $("#sidebar-note-body").textContent = sidebarNote.body;
  };
  const renderHeroCopy = () => {
    if (typeof heroCopy?.kicker === "string" && heroCopy.kicker.trim()) $("#hero-kicker").textContent = heroCopy.kicker;
    if (typeof heroCopy?.title === "string" && heroCopy.title.trim()) $("#today-title").textContent = heroCopy.title;
    if (typeof heroCopy?.description === "string" && heroCopy.description.trim()) $("#hero-description").textContent = heroCopy.description;
  };
  $("#edit-hero").addEventListener("click", () => {
    $("#hero-kicker-input").value = $("#hero-kicker").textContent;
    $("#hero-title-input").value = $("#today-title").textContent;
    $("#hero-description-input").value = $("#hero-description").textContent;
    $("#hero-editor").showModal();
  });
  $("#close-hero-editor").addEventListener("click", () => $("#hero-editor").close());
  $("#cancel-hero-editor").addEventListener("click", () => $("#hero-editor").close());
  $("#hero-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const copy = {
      kicker: $("#hero-kicker-input").value.trim(),
      title: $("#hero-title-input").value.trim(),
      description: $("#hero-description-input").value.trim()
    };
    if (Object.values(copy).some((value) => !value)) return;
    heroCopy = copy;
    markUnsaved();
    renderHeroCopy();
    $("#hero-editor").close();
    toast("顶部文字已更新；点击右上角保存到本地。");
  });
  $("#edit-sidebar-note").addEventListener("click", () => {
    $("#sidebar-note-title-input").value = $("#sidebar-note-title").textContent;
    $("#sidebar-note-body-input").value = $("#sidebar-note-body").textContent;
    $("#sidebar-note-editor").showModal();
  });
  $("#close-sidebar-note").addEventListener("click", () => $("#sidebar-note-editor").close());
  $("#cancel-sidebar-note").addEventListener("click", () => $("#sidebar-note-editor").close());
  $("#sidebar-note-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#sidebar-note-title-input").value.trim();
    const body = $("#sidebar-note-body-input").value.trim();
    if (!title || !body) return;
    sidebarNote = { title, body };
    markUnsaved();
    renderSidebarNote();
    $("#sidebar-note-editor").close();
    toast("侧栏文字已更新；点击右上角保存到本地。");
  });
  $("#dialog-fields").addEventListener("click", (event) => {
    if (event.target.closest("#add-track")) {
      const input = $("#new-track-name");
      const name = input.value.trim();
      if (!name) { toast("请输入岗位方向名称。"); return; }
      if (name.length > 40) { toast("岗位方向最多 40 个字。"); return; }
      if (allTracks().includes(name) && name !== editingTrack) { toast("这个岗位方向已存在。"); return; }
      const selected = $('#dialog-fields select[name="track"]').value;
      if (editingTrack) {
        const old = editingTrack;
        state.tracks[state.tracks.indexOf(old)] = name;
        state.jobs.filter((job) => job.track === old).forEach((job) => { job.track = name; });
        editingTrack = "";
        input.value = "";
        $("#add-track").textContent = "＋ 添加方向";
        save();
        renderTrackEditor(selected === old ? name : selected);
        toast(`已修改岗位方向为“${name}”。`);
      } else {
        if (state.tracks.length >= 50) { toast("最多添加 50 个岗位方向。"); return; }
        state.tracks.push(name);
        input.value = "";
        save();
        renderTrackEditor(name);
        toast(`已添加岗位方向“${name}”。`);
      }
      return;
    }
    const editTrack = event.target.closest("[data-edit-track]");
    if (editTrack) {
      editingTrack = editTrack.dataset.editTrack;
      $("#new-track-name").value = editingTrack;
      $("#add-track").textContent = "保存修改";
      $("#new-track-name").focus();
      return;
    }
    const deleteTrack = event.target.closest("[data-delete-track]");
    if (deleteTrack) {
      const name = deleteTrack.dataset.deleteTrack;
      const affected = state.jobs.filter((job) => job.track === name);
      if (affected.length && !confirm(`删除“${name}”后，${affected.length} 个岗位的方向会改为“其他”。确定删除吗？`)) return;
      const selected = $('#dialog-fields select[name="track"]').value;
      state.tracks = state.tracks.filter((track) => track !== name);
      affected.forEach((job) => { job.track = "其他"; });
      if (editingTrack === name) { editingTrack = ""; $("#new-track-name").value = ""; $("#add-track").textContent = "＋ 添加方向"; }
      save();
      renderTrackEditor(selected === name ? "其他" : selected);
      toast(affected.length ? `已删除“${name}”，${affected.length} 个岗位改为“其他”。` : `已删除岗位方向“${name}”。`);
      return;
    }
    if (event.target.closest("#add-category")) {
      const input = $("#new-category-name");
      const name = input.value.trim();
      if (!name) { toast("请输入分类名称。"); return; }
      if (name === "项目复盘" || allCategories().includes(name)) { toast("这个分类已存在，请换个名称。"); return; }
      if (state.categories.length >= 50) { toast("最多添加 50 个自定义分类。"); return; }
      state.categories.push(name);
      if (!save()) { state.categories.pop(); return; }
      renderCategoryEditor(name);
      input.value = "";
      if (planDraft) renderPlanDraft();
      toast(`已添加分类“${name}”。`);
      return;
    }
    const remove = event.target.closest("[data-delete-category]");
    if (!remove) return;
    const name = remove.dataset.deleteCategory;
    const affectedBlocks = state.blocks.filter((block) => block.category === name);
    const affectedDrafts = planDraft?.items.filter((item) => item.category === name) || [];
    const previousCategories = [...state.categories];
    state.categories = state.categories.filter((category) => category !== name);
    affectedBlocks.forEach((block) => { block.category = "其他"; });
    affectedDrafts.forEach((item) => { item.category = "其他"; });
    if (!save()) { state.categories = previousCategories; affectedBlocks.forEach((block) => { block.category = name; }); affectedDrafts.forEach((item) => { item.category = name; }); return; }
    renderCategoryEditor($("#dialog-fields select[name=category]").value === name ? "其他" : undefined);
    if (planDraft) renderPlanDraft();
    toast(affectedBlocks.length ? `已删除“${name}”，${affectedBlocks.length} 项原有日程改为“其他”。` : `已删除分类“${name}”。`);
  });
  $("#dialog-fields").addEventListener("keydown", (event) => {
    if (event.target.id === "new-category-name" && event.key === "Enter") { event.preventDefault(); $("#add-category").click(); }
    if (event.target.id === "new-track-name" && event.key === "Enter") { event.preventDefault(); $("#add-track").click(); }
  });
  $("#dialog-fields").addEventListener("change", (event) => {
    if (event.target.name !== "endAtMidnight") return;
    const endInput = $("#dialog-fields input[name=end]");
    endInput.disabled = event.target.checked;
    endInput.required = !event.target.checked;
  });
  $("#login-entry").addEventListener("click", () => { if (!$("#login-entry").disabled) location.assign("/auth/start"); });
  $("#save-local").addEventListener("click", saveToLocal);
  try { $("#ai-endpoint").value = localStorage.getItem(AI_ENDPOINT_KEY) || ""; } catch { /* Browser storage may be unavailable. */ }
  $("#ai-endpoint").addEventListener("input", markUnsaved);
  $("#quick-plan-input").addEventListener("input", () => { discardPlanDraft(); markUnsaved(); });
  $("#quick-plan-preview").addEventListener("change", (event) => {
    const field = event.target.dataset.draftField;
    if (!planDraft || !field) return;
    const item = planDraft.items[Number(event.target.dataset.draftIndex)];
    if (!item) return;
    item[field] = field === "duration" ? Number(event.target.value) : field === "syncToToday" ? event.target.checked : event.target.value;
    if (field === "duration" && item.start) {
      const previousStart = toMinutes(item.start);
      item.start = "";
      item.end = "";
      if (planDraft.source === "local" && Number.isInteger(item.duration) && item.duration >= 10 && item.duration <= 240) {
        const occupied = [
          ...state.blocks.filter((block) => block.date === selectedPlanDate && block.state === "open").map((block) => ({ start: toMinutes(block.start), end: toMinutes(block.end) })),
          ...state.events.filter((entry) => !entry.done && entry.date === selectedPlanDate && entry.time).map((entry) => ({ start: toMinutes(entry.time), end: entry.endTime ? toMinutes(entry.endTime) : Math.min(1440, toMinutes(entry.time) + 60) })),
          ...planDraft.items.filter((other) => other !== item && other.start && other.end).map((other) => ({ start: toMinutes(other.start), end: toMinutes(other.end) }))
        ];
        const slot = window.PlanText.autoPlace([item], occupied, previousStart)[0];
        if (slot) { item.start = toTime(slot.start); item.end = toTime(slot.end); }
      }
      if (!item.start) toast("时长已修改，请重新选择时间段。");
    }
    markUnsaved();
    renderPlanDraft();
    renderBlocks();
  });
  $("#quick-plan-preview").addEventListener("click", (event) => {
    if (event.target.id === "quick-plan-confirm") confirmQuickPlan();
    else if (event.target.id === "quick-plan-cancel") discardPlanDraft();
    else if (event.target.dataset.draftSelect != null && planDraft) {
      selectedPlacement = { kind: "draft", index: Number(event.target.dataset.draftSelect) };
      renderPlanDraft(); renderBlocks();
      if (matchMedia("(max-width: 720px)").matches) $("#block-list").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("已选择事项，请点时间表中的整点或半点位置。");
    }
    else if (event.target.dataset.draftRemove != null && planDraft) { planDraft.items.splice(Number(event.target.dataset.draftRemove), 1); selectedPlacement = null; markUnsaved(); renderPlanDraft(); renderBlocks(); }
  });
  $("#block-list").addEventListener("click", (event) => {
    const removeDraft = event.target.closest("[data-draft-remove]");
    if (removeDraft && planDraft) {
      planDraft.items.splice(Number(removeDraft.dataset.draftRemove), 1);
      selectedPlacement = null;
      markUnsaved();
      renderPlanDraft(); renderBlocks();
      return;
    }
    const moveBlock = event.target.closest("[data-move-block]");
    const moveDraft = event.target.closest("[data-draft-select]");
    if (moveBlock || moveDraft) {
      selectedPlacement = moveBlock ? { kind: "block", id: moveBlock.dataset.moveBlock } : { kind: "draft", index: Number(moveDraft.dataset.draftSelect) };
      renderPlanDraft(); renderBlocks();
      toast("已选择事项，请点要放入的整点或半点时间段。");
      return;
    }
    if (event.target.closest("[data-action]")) return;
    const slot = event.target.closest("[data-slot-time]");
    if (slot && selectedPlacement) placeAt(selectedPlacement, slot.dataset.slotTime);
  });
  $("#block-list").addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".time-block-drag")) { event.preventDefault(); event.target.click(); }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-slot-time]") && selectedPlacement) { event.preventDefault(); placeAt(selectedPlacement, event.target.dataset.slotTime); }
  });
  document.addEventListener("dragstart", (event) => {
    const source = event.target.closest("[data-drag-draft], [data-drag-block]");
    if (!source) return;
    selectedPlacement = source.dataset.dragDraft != null ? { kind: "draft", index: Number(source.dataset.dragDraft) } : { kind: "block", id: source.dataset.dragBlock };
    event.dataTransfer.setData("text/plain", "schedule-item");
    event.dataTransfer.effectAllowed = "move";
  });
  const slotAtPointer = (event) => {
    const track = event.target.closest(".time-grid-track");
    if (!track) return null;
    const step = track.getBoundingClientRect().height / 48;
    const index = Math.max(0, Math.min(47, Math.floor((event.clientY - track.getBoundingClientRect().top) / step)));
    return track.querySelector(`[data-slot-time="${toTime(index * 30)}"]`);
  };
  $("#block-list").addEventListener("dragover", (event) => {
    const slot = event.target.closest("[data-slot-time]") || slotAtPointer(event);
    if (!slot || !selectedPlacement) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    $("#block-list .is-drop-target")?.classList.remove("is-drop-target");
    slot.classList.add("is-drop-target");
  });
  $("#block-list").addEventListener("dragleave", (event) => { if (!$("#block-list").contains(event.relatedTarget)) $("#block-list .is-drop-target")?.classList.remove("is-drop-target"); });
  $("#block-list").addEventListener("drop", (event) => {
    const slot = event.target.closest("[data-slot-time]") || slotAtPointer(event);
    if (!slot || !selectedPlacement) return;
    event.preventDefault();
    $("#block-list .is-drop-target")?.classList.remove("is-drop-target");
    placeAt(selectedPlacement, slot.dataset.slotTime);
  });
  try {
    sidebarNote = JSON.parse(localStorage.getItem(SIDEBAR_NOTE_KEY) || "null");
    heroCopy = JSON.parse(localStorage.getItem(HERO_COPY_KEY) || "null");
    const ui = JSON.parse(localStorage.getItem(PLANNER_UI_KEY) || "null");
    if (typeof ui?.input === "string") $("#quick-plan-input").value = ui.input.slice(0, 2000);
    const draft = ui?.draft;
    if (draft && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && Array.isArray(draft.items) && draft.items.length <= 12 && Array.isArray(draft.notes) && draft.items.every((item) => typeof item.title === "string" && Number.isInteger(item.duration) && typeof item.category === "string" && (!item.start || /^\d{2}:\d{2}$/.test(item.start)) && (!item.end || /^\d{2}:\d{2}$/.test(item.end)))) {
      planDraft = { ...draft, notes: draft.notes.filter((note) => typeof note === "string").slice(0, 20) };
      selectedPlanDate = draft.date;
    }
  } catch { /* Keep visible defaults if browser storage is unavailable. */ }
  window.addEventListener("storage", (event) => {
    if (hasUnsavedChanges) { toast("另一标签页更新了本地记录；请先决定是否保存当前更改。"); return; }
    if (event.key === KEY) { state = load(); render(); toast("已读取同一浏览器其他标签页的更新。"); }
    else if (event.key === SIDEBAR_NOTE_KEY) { try { sidebarNote = JSON.parse(event.newValue || "null"); renderSidebarNote(); } catch { /* Ignore invalid content. */ } }
    else if (event.key === HERO_COPY_KEY) { try { heroCopy = JSON.parse(event.newValue || "null"); renderHeroCopy(); } catch { /* Ignore invalid content. */ } }
  });
  window.addEventListener("beforeunload", (event) => { if (hasUnsavedChanges) event.preventDefault(); });
  setInterval(() => { if (document.visibilityState === "visible") renderToday(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") renderToday(); });
  renderSidebarNote();
  renderHeroCopy();
  renderPlanDraft();
  render();
  activate(location.hash.slice(1) || "today");
  initializeChatGPT();
})();
