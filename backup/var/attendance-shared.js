<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Trainingstermin – Admin</title>
  <style>
    :root { --bg:#000; --card:#111; --border:#333; --text:#fff; --muted:#bbb; }
    * { box-sizing: border-box; }
    body{margin:0;background:var(--bg);color:var(--text);font-family:Arial,Helvetica,sans-serif;}
    .wrap{max-width:960px;margin:0 auto;padding:16px;}
    h1{margin:12px 0 8px;}
    .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--muted)}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin:12px 0;}
    label{display:block;margin:8px 0 4px}
    input,select{width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;background:#000;color:var(--text)}
    button{background:#fff;color:#000;border:none;border-radius:10px;padding:10px 14px;font-weight:bold;cursor:pointer}
    button[disabled]{opacity:.6;cursor:not-allowed}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .row>div{flex:1;min-width:220px}

    #qr{display:grid;place-items:center;min-height:260px;background:#000;border:1px dashed var(--border);border-radius:12px;padding:16px}
    /* WICHTIG: keine Rundungen/Filter am Canvas selbst */
    #qr canvas, #qr img { background:#fff; border-radius:0; display:block; image-rendering: pixelated; }
    .qr-payload { color: var(--muted); font-size:12px; margin-top:8px; word-break: break-all; }

    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{padding:8px;border-bottom:1px solid #222;text-align:left}
    .muted{color:var(--muted)}
    .status{margin-left:8px;font-size:14px}
    .ok{color:#6ee7a8} .warn{color:#facc15} .err{color:#f87171}
  </style>
</head>
<body>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <h1>Trainingstermin – Verwaltung</h1>
    <div class="badge">Rolle: <span id="roleText">–</span></div>
  </div>

  <div class="card">
    <div class="row">
      <div>
        <label for="dt">Datum & Uhrzeit</label>
        <input type="datetime-local" id="dt" required>
      </div>
      <div>
        <label for="school">Schule</label>
        <input type="text" id="school" placeholder="z.B. MASTER">
      </div>
    </div>
    <label for="topic">Thema</label>
    <input type="text" id="topic" placeholder="z.B. Lat Sao – Konterserien" required>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="createBtn">Termin anlegen</button>
      <button id="toggleOpenBtn" disabled>Check-in starten</button>
      <button id="testQrBtn" style="background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--muted)">Test-QR</button>
      <span id="status" class="status muted">Bereit</span>
    </div>
    <div class="muted" style="margin-top:6px">Hinweis: Nur Admin/Si-Fu können Termine erstellen und Check-ins steuern.</div>
  </div>

  <div class="card">
    <h3>QR-Code</h3>
    <div id="qr">(kein aktiver Check-in)</div>
    <div class="muted" style="margin-top:8px">Teilnehmende öffnen „Ausbilder-Check-in“ und scannen diesen Code.</div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <h3 style="margin:0">Anwesenheiten (Live)</h3>
      <div id="count" class="muted">0 Teilnehmende</div>
    </div>
    <table aria-label="Anwesenheitsliste">
      <thead><tr><th>Name</th><th>E-Mail</th><th>Uhrzeit</th></tr></thead>
      <tbody id="list"></tbody>
    </table>
  </div>

  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
    <div class="muted">ID des aktuellen Termins: <span id="sidLabel">–</span></div>
    <div><button onclick="location.href='index.html'">Zurück</button></div>
  </div>
</div>

<!-- Firebase -->
<script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore-compat.js"></script>
<script src="firebase-config.js"></script>
<script src="attendance-shared.js"></script>

<!-- ECHTE QR-Code-Bibliothek lokal -->
<script src="vendor/qrcode/qrcode.min.js"></script>

<script>
(async function(){
  const {auth,db,newNonce,buildQrPayload,parseQrPayload,getUserRole} = window._att || {};
  if (!auth || !db) { alert('Firebase nicht initialisiert.'); location.replace('index.html'); return; }
  await new Promise(r => auth.onAuthStateChanged(u => { if(!u){ alert('Nicht eingeloggt.'); location.replace('index.html'); } else r(); }));

  const roleEl = document.getElementById('roleText');
  const statusEl = document.getElementById('status');
  const qrBox = document.getElementById('qr');
  const list = document.getElementById('list');
  const count = document.getElementById('count');
  const sidLabel = document.getElementById('sidLabel');

  let role = await getUserRole();
  roleEl.textContent = role || '(keine Rolle gefunden)';
  if (!['admin','si-fu'].includes(role)) { alert('Keine Berechtigung.'); location.replace('index.html'); return; }

  const dt = document.getElementById('dt');
  const topic = document.getElementById('topic');
  const school = document.getElementById('school');
  const createBtn = document.getElementById('createBtn');
  const toggleOpenBtn = document.getElementById('toggleOpenBtn');
  const testQrBtn = document.getElementById('testQrBtn');

  let currentSessionId = null;
  let unsubscribe = null;

  school.value = (sessionStorage.getItem('activeSchool') || sessionStorage.getItem('school') || 'MASTER').toUpperCase();
  function setStatus(text, cls){ statusEl.className = 'status ' + (cls || 'muted'); statusEl.textContent = text; }

  function attachLiveList(sid){
    if (unsubscribe) try{unsubscribe();}catch(e){}
    unsubscribe = db.collection('sessions').doc(sid).collection('checkins')
      .orderBy('checkedAt','desc')
      .onSnapshot(snap=>{
        list.innerHTML = '';
        let c = 0;
        snap.forEach(doc=>{
          const d = doc.data(); c++;
          const tr = document.createElement('tr');
          const ts = d.checkedAt?.toDate?.();
          tr.innerHTML = `<td>${d.displayName || '–'}</td><td>${d.email || ''}</td><td>${ts ? ts.toLocaleString() : ''}</td>`;
          list.appendChild(tr);
        });
        count.textContent = `${c} Teilnehmende`;
      }, err=>{
        console.error('Live-Liste Fehler:', err);
        setStatus('Live-Liste konnte nicht geladen werden.', 'err');
      });
  }

  // QR sauber rendern + Payload anzeigen
  function renderQR(text){
    qrBox.innerHTML = '';
    // qrcode.js rendert automatisch sauber (korrekte ECC, integer Raster).
    const qr = new QRCode(qrBox, {
      text,
      width: 240,
      height: 240,
      correctLevel: QRCode.CorrectLevel.M
    });
    // Diagnose-Label
    const diag = document.createElement('div');
    diag.className = 'qr-payload';
    diag.textContent = 'Payload: ' + text;
    qrBox.appendChild(diag);
  }

  // Test-QR unabhängig vom Firestore
  testQrBtn.onclick = () => {
    try{
      renderQR(JSON.stringify({t:'TEST',v:1,ts:new Date().toISOString()}));
      setStatus('Test-QR gerendert', 'ok');
    }catch(e){
      console.error(e); setStatus('QR-Render fehlgeschlagen', 'err');
    }
  };

  createBtn.onclick = async () => {
    if (!dt.value || !topic.value) { alert('Bitte Datum/Uhrzeit und Thema eingeben.'); return; }
    createBtn.disabled = true; setStatus('Termin wird angelegt…','warn');
    try{
      const when = new Date(dt.value);
      const u = auth.currentUser;
      const docRef = await db.collection('sessions').add({
        createdBy: u.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        date: firebase.firestore.Timestamp.fromDate(when),
        topic: topic.value.trim(),
        school: (school.value || 'MASTER').toUpperCase(),
        open: false,
        qrNonce: ''
      });
      currentSessionId = docRef.id;
      sidLabel.textContent = currentSessionId;
      toggleOpenBtn.disabled = false;
      setStatus(`Termin angelegt (ID: ${docRef.id})`, 'ok');
      attachLiveList(docRef.id);
    }catch(e){
      console.error('Fehler beim Anlegen:', e);
      alert('Termin konnte nicht angelegt werden.\n\n' + (e.message || e.code || e.toString()));
      setStatus('Fehler beim Anlegen', 'err');
    }finally{
      createBtn.disabled = false;
    }
  };

  toggleOpenBtn.onclick = async ()=>{
    if (!currentSessionId){ alert('Zuerst Termin anlegen.'); return; }
    toggleOpenBtn.disabled = true;
    try{
      const ref = db.collection('sessions').doc(currentSessionId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('Termin nicht gefunden.');
      const s = snap.data();
      const nowOpen = !s.open;

      if (nowOpen){
        const nonce = newNonce();
        await ref.update({ open: true, qrNonce: nonce });
        const payload = buildQrPayload(ref.id, nonce);  // -> {"t":"WT","v":1,"s":"...","n":"..."}
        setStatus('Check-in geöffnet', 'ok');
        renderQR(payload);
      } else {
        await ref.update({ open: false });
        setStatus('Check-in geschlossen', 'warn');
        qrBox.textContent = '(kein aktiver Check-in)';
      }
    }catch(e){
      console.error('Toggle Fehler:', e);
      alert('Check-in konnte nicht umgeschaltet werden.\n\n' + (e.message || e.code || e.toString()));
      setStatus('Fehler beim Umschalten', 'err');
    }finally{
      toggleOpenBtn.disabled = false;
    }
  };
})();
</script>
</body>
</html>
