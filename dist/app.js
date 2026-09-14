import { answerCoach, calculateNutrition, createWorkoutSet, estimateFood } from "./logic.js";

const storageKey = "fitlog-ai-demo-v1";
const today = new Date().toISOString().slice(0, 10);
const initialState = {
  view: "home",
  workouts: [{
    id: "seed-workout",
    date: today,
    title: "上肢力量",
    exercises: [
      { id: "bench", name: "杠铃卧推", sets: [createWorkoutSet(40, 12), createWorkoutSet(40, 10), createWorkoutSet(37.5, 10)] },
      { id: "row", name: "坐姿划船", sets: [createWorkoutSet(45, 12), createWorkoutSet(45, 12), createWorkoutSet(45, 10)] }
    ]
  }],
  meals: [
    { id: "seed-lunch", type: "午餐", name: "鸡胸肉饭", note: "鸡胸肉、米饭、青菜", calories: 460, protein: 35, carbs: 58, fat: 12, photo: "" },
    { id: "seed-shake", type: "加餐", name: "蛋白粉", note: "一勺蛋白粉", calories: 120, protein: 24, carbs: 3, fat: 2, photo: "" }
  ],
  chats: [{ role: "assistant", text: "你好，我是你的 AI 教练。我可以根据训练和饮食记录回答问题。" }]
};

let state = loadState();
let selectedPhoto = "";
const app = document.querySelector("#app");
const icons = {
  home: "⌂", training: "⌁", food: "◉", coach: "✦", plus: "+", arrow: "›", check: "✓", camera: "▣", microphone: "◌"
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved ? { ...initialState, ...saved, view: "home" } : initialState;
  } catch { return initialState; }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify({ ...state, view: "home" }));
}

function totalSets(workout) {
  return workout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
}

function nutrition() { return calculateNutrition(state.meals); }
function fmtDate(date) { return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" })[char]); }

function pageHeader(title, subtitle = "") {
  return `<header class="page-header"><div><p class="eyebrow">练记 AI</p><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ""}</div><button class="icon-button" data-action="reset" aria-label="重置演示数据">↻</button></header>`;
}

function renderHome() {
  const totals = nutrition();
  const latestWorkout = state.workouts[0];
  return `${pageHeader("今天", fmtDate(today))}
    <section class="hero-card">
      <div class="hero-heading"><img src="icon.png" alt="" /><div><span>每日摄入</span><strong>${totals.calories}</strong><em>kcal</em></div></div>
      <div class="macro-grid">
        <div><span>蛋白质</span><b>${totals.protein} g</b><i style="--p:${Math.min(totals.protein, 100)}%"></i></div>
        <div><span>碳水</span><b>${totals.carbs} g</b><i style="--p:${Math.min(totals.carbs / 2, 100)}%"></i></div>
        <div><span>脂肪</span><b>${totals.fat} g</b><i style="--p:${Math.min(totals.fat * 2, 100)}%"></i></div>
      </div>
    </section>
    <section class="section-head"><h2>今天的安排</h2><button class="text-button" data-view="training">查看训练</button></section>
    <button class="list-card wide-card" data-view="training"><span class="round-icon mint">⌁</span><span><b>${escapeHtml(latestWorkout.title)}</b><small>${latestWorkout.exercises.length} 个动作 · ${totalSets(latestWorkout)} 组</small></span><strong>${icons.arrow}</strong></button>
    <section class="section-head"><h2>快速记录</h2></section>
    <div class="quick-grid"><button class="quick-card" data-view="training"><span>＋</span>记录训练</button><button class="quick-card" data-view="food"><span>＋</span>记录饮食</button></div>
    <section class="coach-prompt" data-view="coach"><span>✦</span><div><b>问问你的 AI 教练</b><p>“我今天吃了多少热量？”</p></div><strong>${icons.arrow}</strong></section>`;
}

function renderTraining() {
  const workout = state.workouts[0];
  return `${pageHeader("训练", "按每一组保存重量和次数")}
    <section class="training-summary"><span class="round-icon cyan">⌁</span><div><b>${fmtDate(workout.date)} · ${escapeHtml(workout.title)}</b><p>${workout.exercises.length} 个动作 · ${totalSets(workout)} 组已记录</p></div></section>
    <section class="exercise-list">${workout.exercises.map((exercise, exerciseIndex) => `
      <article class="exercise-card">
        <div class="exercise-title"><div><span class="eyebrow">动作 ${exerciseIndex + 1}</span><h2>${escapeHtml(exercise.name)}</h2></div><button class="tiny-button" data-action="copy-set" data-exercise="${exercise.id}">复制上一组</button></div>
        <div class="set-head"><span>组别</span><span>重量</span><span>次数</span></div>
        ${exercise.sets.map((set, index) => `<div class="set-row"><span>${index + 1}</span><b>${set.weight} <small>kg</small></b><b>${set.reps} <small>次</small></b></div>`).join("")}
      </article>`).join("")}</section>
    <button class="primary-button" data-action="open-workout">${icons.plus} 添加动作</button>
    ${workoutModal()}`;
}

function workoutModal() {
  return `<dialog id="workout-dialog"><form method="dialog" id="workout-form" class="dialog-card"><div class="dialog-head"><div><span class="eyebrow">添加到今天训练</span><h2>记录一个动作</h2></div><button value="cancel" class="icon-button" aria-label="关闭">×</button></div>
    <label>动作名称<select name="name"><option>杠铃深蹲</option><option>哑铃卧推</option><option>高位下拉</option><option>硬拉</option><option>肩推</option><option>自定义动作</option></select></label>
    <div class="picker-grid"><label>重量（kg）<select name="weight">${Array.from({ length: 41 }, (_, i) => `<option value="${i * 2.5 + 10}">${i * 2.5 + 10} kg</option>`).join("")}</select></label><label>次数<select name="reps">${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}" ${i === 9 ? "selected" : ""}>${i + 1} 次</option>`).join("")}</select></label><label>组数<select name="count">${[1,2,3,4,5,6].map(count => `<option ${count === 3 ? "selected" : ""}>${count} 组</option>`).join("")}</select></label></div>
    <button class="primary-button" value="default">保存动作</button></form></dialog>`;
}

function renderFood() {
  const totals = nutrition();
  return `${pageHeader("饮食", `${totals.calories} kcal 已记录`) }
    <section class="food-total"><span>今日摄入</span><strong>${totals.calories} <small>kcal</small></strong><p>蛋白质 ${totals.protein} g · 碳水 ${totals.carbs} g · 脂肪 ${totals.fat} g</p></section>
    <section class="section-head"><h2>今天吃了什么</h2><button class="text-button" data-action="open-food">${icons.plus} 添加</button></section>
    <section class="meal-list">${state.meals.map(meal => `<article class="meal-card"><div class="meal-icon">${meal.photo ? `<img src="${meal.photo}" alt="${escapeHtml(meal.name)}" />` : meal.type === "加餐" ? "◌" : "♨"}</div><div><span class="eyebrow">${escapeHtml(meal.type)}</span><h2>${escapeHtml(meal.name)}</h2><p>${escapeHtml(meal.note)}</p><small>蛋白质 ${meal.protein} g · 碳水 ${meal.carbs} g · 脂肪 ${meal.fat} g</small></div><strong>${meal.calories}<small> kcal</small></strong></article>`).join("")}</section>
    <button class="primary-button" data-action="open-food">${icons.camera} 拍照或记录一餐</button>${foodModal()}`;
}

function foodModal() {
  return `<dialog id="food-dialog"><form method="dialog" id="food-form" class="dialog-card"><div class="dialog-head"><div><span class="eyebrow">添加饮食记录</span><h2>这一餐吃了什么？</h2></div><button value="cancel" class="icon-button" aria-label="关闭">×</button></div>
    <div class="photo-picker"><label for="food-photo">${selectedPhoto ? `<img src="${selectedPhoto}" alt="已选择的食物照片" />` : `<span>${icons.camera}</span><b>拍照或选择照片</b><small>照片只保存在当前设备</small>`}</label><input id="food-photo" type="file" accept="image/*" capture="environment" /></div>
    <label>餐次<select name="type"><option>早餐</option><option selected>午餐</option><option>晚餐</option><option>加餐</option></select></label>
    <label>描述或克重<input name="note" placeholder="例如：熟米饭 150g，鸡胸肉 180g" required /></label>
    <button type="button" class="voice-button" data-action="voice">${icons.microphone} 语音输入</button>
    <div class="estimate-note">填写后会先按常见食物给出估算，你可以继续改数字。</div>
    <button class="primary-button" value="default">生成并保存</button></form></dialog>`;
}

function renderCoach() {
  return `${pageHeader("AI 教练", "结合你的训练与饮食记录")}
    <div class="coach-context"><span>✦</span><p>我会用本机保存的训练和饮食记录回答。正式版接入安全的 AI 后端后，可处理更复杂的问题。</p></div>
    <section class="chat-list">${state.chats.map(chat => `<div class="bubble ${chat.role}">${escapeHtml(chat.text)}</div>`).join("")}</section>
    <div class="suggestions"><button data-question="今天吃了多少热量？">今天吃了多少热量？</button><button data-question="我上次卧推做了多少？">我上次卧推做了多少？</button><button data-question="给我一点训练建议">给我一点训练建议</button></div>
    <form id="chat-form" class="chat-form"><input name="question" placeholder="问训练、饮食或计划…" required /><button aria-label="发送">↑</button></form>`;
}

function nav() {
  const items = [["home", "今天", icons.home], ["training", "训练", icons.training], ["food", "饮食", icons.food], ["coach", "助手", icons.coach]];
  return `<nav>${items.map(([id, label, icon]) => `<button data-view="${id}" class="${state.view === id ? "active" : ""}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

function render() {
  const pages = { home: renderHome, training: renderTraining, food: renderFood, coach: renderCoach };
  app.innerHTML = `<div class="shell">${pages[state.view]()}${nav()}</div>`;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
  document.querySelectorAll("[data-action='reset']").forEach(button => button.addEventListener("click", () => { if (confirm("重置为演示数据？")) { localStorage.removeItem(storageKey); state = structuredClone(initialState); render(); toast("已恢复演示数据"); } }));
  document.querySelectorAll("[data-action='open-workout']").forEach(button => button.addEventListener("click", () => document.querySelector("#workout-dialog").showModal()));
  document.querySelectorAll("[data-action='open-food']").forEach(button => button.addEventListener("click", () => document.querySelector("#food-dialog").showModal()));
  document.querySelectorAll("[data-action='copy-set']").forEach(button => button.addEventListener("click", () => {
    const exercise = state.workouts[0].exercises.find(item => item.id === button.dataset.exercise); const last = exercise.sets.at(-1); exercise.sets.push(createWorkoutSet(last.weight, last.reps)); saveState(); render(); toast("已复制上一组");
  }));
  document.querySelector("#workout-form")?.addEventListener("submit", event => { const fd = new FormData(event.currentTarget); const count = Number(String(fd.get("count")).match(/\d+/)[0]); state.workouts[0].exercises.push({ id: crypto.randomUUID(), name: fd.get("name"), sets: Array.from({ length: count }, () => createWorkoutSet(fd.get("weight"), fd.get("reps"))) }); saveState(); toast("动作已加入训练"); setTimeout(render, 0); });
  document.querySelector("#food-photo")?.addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { selectedPhoto = reader.result; document.querySelector(".photo-picker label").innerHTML = `<img src="${selectedPhoto}" alt="已选择的食物照片" />`; }; reader.readAsDataURL(file); });
  document.querySelector("#food-form")?.addEventListener("submit", event => { const fd = new FormData(event.currentTarget); const estimate = estimateFood(fd.get("note")); state.meals.unshift({ id: crypto.randomUUID(), type: fd.get("type"), name: String(fd.get("note")).slice(0, 22), note: fd.get("note"), ...estimate, photo: selectedPhoto }); selectedPhoto = ""; saveState(); toast(`已保存 · 估算 ${estimate.calories} kcal`); setTimeout(render, 0); });
  document.querySelector("[data-action='voice']")?.addEventListener("click", startVoiceInput);
  document.querySelectorAll("[data-question]").forEach(button => button.addEventListener("click", () => askCoach(button.dataset.question)));
  document.querySelector("#chat-form")?.addEventListener("submit", event => { event.preventDefault(); const question = new FormData(event.currentTarget).get("question"); event.currentTarget.reset(); askCoach(question); });
}

function askCoach(question) { state.chats.push({ role: "user", text: question }); state.chats.push({ role: "assistant", text: answerCoach(question, { nutrition: nutrition(), workouts: state.workouts }) }); saveState(); render(); }
function startVoiceInput() { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) return toast("当前浏览器不支持语音输入，请直接打字。 "); const recognition = new Recognition(); recognition.lang = "zh-CN"; recognition.onresult = event => { document.querySelector("#food-form input[name='note']").value = event.results[0][0].transcript; toast("已转为文字，可继续修改"); }; recognition.start(); }
function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 2200); }

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
render();
