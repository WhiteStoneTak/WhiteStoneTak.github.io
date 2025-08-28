// ---- tiny store ----
const store = {
  get: (k, v = null) => JSON.parse(localStorage.getItem(k) || JSON.stringify(v)),
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  nowISO: () => new Date().toISOString().slice(0,10)
};

const $ = (q) => document.querySelector(q);
const onboarding = $("#onboarding");
const dashboard = $("#dashboard");
const planBox = $("#plan");
const quizForm = $("#quiz");
const tipBox = $("#tip");
const resultMsg = $("#resultMsg");

// ---- onboarding ----
$("#saveProfile").onclick = async () => {
  const profile = {
    name: $("#name").value.trim() || "You",
    exam: $("#exam").value,
    examDate: $("#examDate").value,
    daily: Number($("#daily").value),
    notifyAt: $("#notifyAt").value
  };
  store.set("profile", profile);
  store.set("reviews", {});   // { qid: { due: "2025-09-01", ease: 2 } }
  store.set("logs", []);      // [{date,qid,correct,time}]
  start();
};

$("#reset").onclick = () => { localStorage.clear(); location.reload(); };

async function fetchJSON(path){ const r = await fetch(path); return r.json(); }

// ---- core ----
async function start(){
  const profile = store.get("profile");
  if(!profile){ onboarding.classList.remove("hidden"); dashboard.classList.add("hidden"); return; }
  $("#greeting").textContent = `Hi, ${profile.name}！`;
  onboarding.classList.add("hidden");
  dashboard.classList.remove("hidden");

  const questions = await fetchJSON("./data/questions.json");
  const tips = await fetchJSON("./data/tips.json");
  renderPlan(profile);
  const picked = pick3(questions);
  renderQuiz(picked);
  renderTip(tips, picked);
}

function renderPlan(p){
  const remainDays = Math.max(1, Math.ceil((new Date(p.examDate) - new Date())/86400000));
  planBox.innerHTML = `
    <h3>今日の計画（${p.daily}分）</h3>
    <ul>
      <li>復習：昨日のミスをやり直し（${Math.round(p.daily*0.6)}分）</li>
      <li>新規：弱点1単元（${Math.round(p.daily*0.4)}分）</li>
    </ul>
    <p class="muted">試験まであと <b>${remainDays}</b> 日</p>`;
}

function pick3(all){
  const reviews = store.get("reviews", {});
  const today = store.nowISO();
  const due = all.filter(q => reviews[q.id]?.due <= today);
  const fresh = all.filter(q => !reviews[q.id]);
  const pool = [...due.slice(0,2), ...fresh.slice(0,3)];
  // fallback
  while(pool.length < 3) pool.push(all[Math.floor(Math.random()*all.length)]);
  // unique & 3件
  const ids = new Set(); const out=[];
  for(const q of pool){ if(!ids.has(q.id)){ out.push(q); ids.add(q.id); if(out.length===3) break; } }
  return out;
}

function renderQuiz(list){
  quizForm.innerHTML = `<h3>3問クイズ</h3>` + list.map((q,i)=>`
    <fieldset class="option">
      <legend>${i+1}. [${q.subject}] ${q.stem}</legend>
      ${q.choices.map((c,j)=>`
        <label><input type="radio" name="q${i}" value="${j}" required> ${c}</label>
      `).join("")}
      <input type="hidden" name="qid${i}" value="${q.id}" />
    </fieldset>
  `).join("");
}

function renderTip(tips, picked){
  const sub = picked[0]?.subject || "英語";
  const cand = tips.find(t=>t.subject===sub) || tips[0];
  tipBox.innerHTML = `<h3>今日のTips</h3><p>${cand.body}</p><a href="${cand.url}" target="_blank">参考</a>`;
}

$("#submitQuiz").onclick = (e)=>{
  e.preventDefault();
  const fd = new FormData(quizForm);
  const ans = [];
  for(let i=0;i<3;i++){
    const qid = fd.get(`qid${i}`); if(!qid) continue;
    const a = Number(fd.get(`q${i}`));
    ans.push({qid, a});
  }
  grade(ans);
};

function grade(ans){
  fetch("./data/questions.json").then(r=>r.json()).then(all=>{
    const byId = Object.fromEntries(all.map(q=>[q.id,q]));
    const reviews = store.get("reviews", {});
    const logs = store.get("logs", []);
    let correctCnt = 0;

    for(const {qid,a} of ans){
      const q = byId[qid];
      const ok = a === q.answer;
      correctCnt += ok ? 1 : 0;

      // log
      logs.push({date: store.nowISO(), qid, correct: ok});
      // schedule next review (SM2風の超簡略)
      const cur = reviews[qid]?.ease ?? 2; // 0..3
      const ease = Math.max(0, Math.min(3, ok ? cur+1 : cur-1));
      const addDays = [1,2,4,7][ease]; // 間隔
      const due = new Date(); due.setDate(due.getDate()+addDays);
      reviews[qid] = {ease, due: due.toISOString().slice(0,10)};
    }
    store.set("logs", logs);
    store.set("reviews", reviews);

    resultMsg.textContent = `スコア：${correctCnt}/3  明日の復習数：${ans.length - correctCnt} 問`;
    // すぐ解説を表示
    quizForm.querySelectorAll("fieldset").forEach((fs,idx)=>{
      const qid = fs.querySelector(`input[name="qid${idx}"]`)?.value;
      const q = byId[qid]; if(!q) return;
      const exp = document.createElement("div");
      exp.className = "muted";
      exp.innerHTML = `解説：${q.explain}`;
      fs.appendChild(exp);
    });
  });
}

$("#exportLog").onclick = ()=>{
  const profile = store.get("profile") || {};
  const logs = store.get("logs", []);
  const body = encodeURIComponent(
    `Name: ${profile.name}\nExam: ${profile.exam}\n\n` +
    logs.slice(-50).map(l=>`${l.date} ${l.qid} ${l.correct?'○':'×'}`).join('\n')
  );
  location.href = `mailto:?subject=StudyCoach%20progress&body=${body}`;
};
start();
