// gp-ui-render.js -- redesigned flow: accordion sections + live pitch sidebar
(function(global){
  const staticQuestions = [ /* …your same question array…*/ ];
  const SECTION_CONFIG = [
    { id: 'step1', title: 'Customer Info', weight: 15, fields: [
        { id:'custName', label:'Customer Name', type:'text', weight:8, placeholder:'Full name' },
        { id:'custPhone', label:'Customer Phone', type:'tel', weight:7, placeholder:'Phone #' }
      ]
    },
    { id: 'step2', title: 'Evaluate Needs', weight: staticQuestions.reduce((sum,q)=>sum+q.weight,0), fields: staticQuestions },
    { id: 'step3', title: 'Proposed Solution', weight:25, fields: [
        { id:'solutionText', label:'Solution', type:'textarea', weight:25, placeholder:'What we’ll offer…' }
      ]
    }
  ];

  const answers = {};

  function create(tag, attrs={}, html=''){ let el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
    if(html) el.innerHTML=html;
    return el;
  }

  function renderUI(){
    const app = document.getElementById('guestApp');
    if(!app) return;
    app.innerHTML = '';

    // Header + global progress
    const header = create('header',{class:'guest-header'},`
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>Guest Portal</h2>
        <div>
          <span id="progressLabel">Progress: 0%</span>
          <progress id="progressBar" max="100" value="0" style="height:16px;width:120px;"></progress>
        </div>
      </div>
    `);
    app.appendChild(header);

    // Two-column layout
    const main = create('div',{class:'guest-main', style:'display:flex;gap:24px;'});
    const left = create('div',{class:'guest-left', style:'flex:2;'});
    const right = create('aside',{class:'guest-right', style:'flex:1;position:sticky;top:20px;'});
    right.innerHTML = `<h3>Live Pitch</h3><textarea id="pitchPreview" readonly style="width:100%;height:80vh;"></textarea>`;

    SECTION_CONFIG.forEach(sec=>{
      const panel = create('section',{class:'guest-section', 'data-id':sec.id});
      panel.innerHTML = `
        <header class="sec-header" style="cursor:pointer;padding:8px 12px;background:#f0f0f0;">
          ${sec.title}
          <span class="sec-status" style="float:right;">0/${sec.fields.length}</span>
        </header>
        <div class="sec-body" style="display:none;padding:12px;border:1px solid #ddd;border-top:none;"></div>
      `;
      const body = panel.querySelector('.sec-body');
      // build fields
      sec.fields.forEach(q=>{
        let fld;
        if(q.type==='textarea'){
          fld = create('label',{class:'glabel'},`
            ${q.label}
            <textarea id="${q.id}" data-weight="${q.weight}" placeholder="${q.placeholder||''}" rows="3" class="gfield"></textarea>
          `);
        } else {
          fld = create('label',{class:'glabel'},`
            ${q.label}
            <input id="${q.id}" data-weight="${q.weight}" type="${q.type}" placeholder="${q.placeholder||''}" class="gfield"/>
          `);
        }
        body.appendChild(fld);
      });

      // toggle
      panel.querySelector('.sec-header').addEventListener('click',()=> {
        const open = body.style.display==='block';
        document.querySelectorAll('.sec-body').forEach(b=>b.style.display='none');
        document.querySelectorAll('.sec-header').forEach(h=>h.style.background='#f0f0f0');
        if(!open){
          body.style.display = 'block';
          panel.querySelector('.sec-header').style.background='#e0e0e0';
        }
      });

      left.appendChild(panel);
    });

    main.appendChild(left);
    main.appendChild(right);
    app.appendChild(main);

    // bind inputs
    document.querySelectorAll('.gfield').forEach(input=>{
      input.addEventListener(input.tagName==='SELECT'?'change':'input',e=>{
        const id = e.target.id;
        const val = e.target.value.trim();
        const pts = val? Number(e.target.dataset.weight) : 0;
        answers[id] = { value: val, points: pts };
        updateProgressAndSummary();
      });
    });
  }

  function updateProgressAndSummary(){
    // progress
    const totalPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const maxPts = SECTION_CONFIG.reduce((sum,sec)=>
      sum + sec.fields.reduce((ss,q)=>ss+q.weight,0)
    ,0);
    const pct = Math.round((totalPts/maxPts)*100);
    document.getElementById('progressBar').value = pct;
    document.getElementById('progressLabel').textContent = `Progress: ${pct}%`;

    // per-section status
    SECTION_CONFIG.forEach(sec=>{
      const done = sec.fields.filter(q=>answers[q.id]?.value).length;
      document.querySelector(`[data-id="${sec.id}"] .sec-status`)
        .textContent = `${done}/${sec.fields.length}`;
    });

    // live pitch
    let pitch = '';
    SECTION_CONFIG.forEach(sec=>{
      sec.fields.forEach(q=>{
        if(answers[q.id]?.value){
          pitch += `${q.label}: ${answers[q.id].value}\n`;
        }
      });
      if(sec.id==='step3') pitch += '\n-- End of Pitch --';
    });
    document.getElementById('pitchPreview').value = pitch.trim();
  }

  // init
  document.addEventListener('DOMContentLoaded',()=>{
    renderUI();
  });

})(window);