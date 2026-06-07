import { useState, useRef, useEffect } from "react";

const CONFIG = {
  SUPABASE_URL: "https://XXXXXXXXXXXX.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXX",
  WHATSAPP_TOKEN: "EAAxxxxxxxxxxxxxxx",
  WHATSAPP_PHONE_ID: "10000000000000",
  WHATSAPP_TEMPLATE: "rdv_confirmation",
};

const CLINIC_INFO = {
  nom: "Clinique Sainte-Marie",
  ville: "Yaoundé, Cameroun",
  horaires: "Lundi – Vendredi : 7h30 – 19h00\nSamedi : 8h00 – 14h00\nDimanche : Urgences uniquement",
  adresse: "Avenue Kennedy, Bastos, Yaoundé",
  telephone: "+237 6XX XXX XXX",
  tarifs: "Consultation généraliste : 5 000 FCFA\nConsultation spécialiste : 10 000 – 15 000 FCFA\nUrgences : 8 000 FCFA",
  specialistes: "Médecine générale (tous les jours)\nGynécologie (Lun, Mer, Ven)\nPédiatrie (Mar, Jeu, Sam)\nCardiologie (Lundi, Jeudi)\nDermatologie (Mercredi)",
  examens: "Prise de sang, Urines, Selles\nÉchographie, Radio, ECG\nTest de grossesse, Glycémie, Groupe sanguin\nBilan complet disponible",
};

const SPECIALITES = [
  { label: "Médecine générale", jours: ["Lun","Mar","Mer","Jeu","Ven","Sam"] },
  { label: "Gynécologie", jours: ["Lun","Mer","Ven"] },
  { label: "Pédiatrie", jours: ["Mar","Jeu","Sam"] },
  { label: "Cardiologie", jours: ["Lun","Jeu"] },
  { label: "Dermatologie", jours: ["Mer"] },
];

const CRENEAUX = ["07h30","08h00","08h30","09h00","09h30","10h00","10h30","11h00",
                  "14h00","14h30","15h00","15h30","16h00","16h30","17h00","17h30"];
const JOURS_SEMAINE = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

function getProchainsDates() {
  const dates = []; let d = new Date();
  while (dates.length < 14) {
    d = new Date(d); d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) dates.push(new Date(d));
  }
  return dates;
}
function formatDate(d) {
  return d.toLocaleDateString("fr-FR", { weekday:"short", day:"2-digit", month:"short" });
}
function formatDateISO(d) { return d.toISOString().split("T")[0]; }
function joursDisponibles(sp) {
  return SPECIALITES.find(s => s.label === sp)?.jours || [];
}

async function sauvegarderRdvSupabase(rdv) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rendez_vous`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": `Bearer ${CONFIG.SUPABASE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      nom_patient: rdv.nom,
      telephone: rdv.telephone,
      specialite: rdv.specialite,
      date_rdv: rdv.dateISO,
      heure_rdv: rdv.creneau,
      motif: rdv.motif || null,
      statut: "confirme",
      created_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json())[0];
}

async function envoyerWhatsApp(rdv) {
  const tel = rdv.telephone.replace(/[\s\-\(\)]/g,"").replace(/^\+/,"");
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${CONFIG.WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: tel,
        type: "template",
        template: {
          name: CONFIG.WHATSAPP_TEMPLATE,
          language: { code: "fr" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: rdv.nom },
              { type: "text", text: rdv.specialite },
              { type: "text", text: rdv.date },
              { type: "text", text: rdv.creneau },
              { type: "text", text: CLINIC_INFO.nom },
              { type: "text", text: CLINIC_INFO.telephone },
            ],
          }],
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

const SYSTEM_PROMPT = `Tu es l'assistant virtuel de la ${CLINIC_INFO.nom} à ${CLINIC_INFO.ville}. Tu réponds de façon chaleureuse, claire et concise aux questions des patients.
Informations : Horaires : ${CLINIC_INFO.horaires} | Adresse : ${CLINIC_INFO.adresse} | Tél : ${CLINIC_INFO.telephone} | Tarifs : ${CLINIC_INFO.tarifs} | Spécialistes : ${CLINIC_INFO.specialistes} | Examens : ${CLINIC_INFO.examens}
Règles : Réponds en français. Pour RDV, invite à cliquer sur le bouton 📅. Pas de diagnostics. Réponses courtes.`;

const QUICK_QUESTIONS = [
  "Prendre un rendez-vous","Quels sont vos horaires ?",
  "Combien coûte une consultation ?","Y a-t-il un gynécologue aujourd'hui ?",
  "Quels examens faites-vous ?","Où êtes-vous situés ?",
];

const TypingIndicator = () => (
  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"12px 16px" }}>
    {[0,1,2].map(i=>(
      <div key={i} style={{ width:8,height:8,borderRadius:"50%",background:"#0ea5a0",
        animation:"bounce 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s` }}/>
    ))}
  </div>
);

const StatusBadge = ({ status, message }) => {
  const colors = {
    saving:  { bg:"#fff8e1", border:"#ffd54f", text:"#e65100", icon:"⏳" },
    sending: { bg:"#e8f5e9", border:"#81c784", text:"#2e7d32", icon:"📤" },
    success: { bg:"#e0f7fa", border:"#4dd0e1", text:"#006064", icon:"✅" },
    error:   { bg:"#fce4ec", border:"#ef9a9a", text:"#b71c1c", icon:"❌" },
  };
  const c = colors[status] || colors.saving;
  return (
    <div style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:12,
      padding:"8px 14px", fontSize:12, color:c.text,
      display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
      <span>{c.icon}</span> {message}
    </div>
  );
};

function RdvModal({ onClose, onConfirm }) {
  const [step, setStep] = useState(1);
  const [specialite, setSpecialite] = useState("");
  const [dateChoisie, setDateChoisie] = useState(null);
  const [creneau, setCreneau] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motif, setMotif] = useState("");
  const [statuses, setStatuses] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const dates = getProchainsDates();
  const joursOk = joursDisponibles(specialite);
  const datesFiltrees = dates.filter(d => joursOk.includes(JOURS_SEMAINE[d.getDay()]));

  const inputStyle = {
    width:"100%", padding:"10px 14px", borderRadius:12,
    border:"1.5px solid #c7e8e8", fontSize:14, fontFamily:"inherit",
    color:"#1e3a3a", background:"#f8fffe", boxSizing:"border-box", outline:"none",
  };
  const btnPrimary = (disabled) => ({
    background: disabled ? "#d1eeee" : "linear-gradient(135deg,#0ea5a0,#0891b2)",
    color: disabled ? "#aaa" : "white", border:"none", borderRadius:12,
    padding:"11px 24px", fontSize:14, cursor: disabled ? "default" : "pointer",
    fontFamily:"inherit", fontWeight:"bold", transition:"all 0.2s",
  });

  const handleSubmit = async () => {
    setSubmitting(true); setStatuses([]);
    const rdv = { nom, telephone, specialite, motif,
      date: formatDate(dateChoisie), dateISO: formatDateISO(dateChoisie), creneau };
    setStatuses([{ status:"saving", message:"Enregistrement du rendez-vous…" }]);
    try {
      await sauvegarderRdvSupabase(rdv);
      setStatuses([{ status:"sending", message:"RDV enregistré ✓ — Envoi WhatsApp…" }]);
    } catch(e) {
      setStatuses([{ status:"error", message:`Erreur base de données : ${e.message}` }]);
      setSubmitting(false); return;
    }
    try {
      await envoyerWhatsApp(rdv);
      setStatuses([{ status:"success", message:"RDV enregistré + WhatsApp envoyé ✓" }]);
    } catch(e) {
      setStatuses([{ status:"error", message:`RDV enregistré mais WhatsApp échoué : ${e.message}` }]);
    }
    setSubmitting(false); setDone(true); onConfirm(rdv);
  };

  const STEPS = ["Spécialité","Date","Horaire","Vos infos"];

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.48)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16 }}>
      <div style={{ background:"white",borderRadius:24,width:"100%",maxWidth:430,
        boxShadow:"0 24px 64px rgba(0,0,0,0.2)",overflow:"hidden",
        maxHeight:"90vh",display:"flex",flexDirection:"column" }}>
        <div style={{ background:"linear-gradient(135deg,#0ea5a0,#0891b2)",padding:"18px 24px",
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0 }}>
          <div>
            <div style={{ color:"white",fontWeight:"bold",fontSize:16 }}>📅 Prise de rendez-vous</div>
            <div style={{ color:"rgba(255,255,255,0.75)",fontSize:12 }}>{CLINIC_INFO.nom}</div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)",border:"none",
            borderRadius:"50%",width:30,height:30,color:"white",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        {!done && (
          <div style={{ display:"flex",padding:"14px 24px 0",gap:6,flexShrink:0 }}>
            {STEPS.map((s,i)=>(
              <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                <div style={{ width:26,height:26,borderRadius:"50%",
                  background:i+1<step?"#0ea5a0":i+1===step?"linear-gradient(135deg,#0ea5a0,#0891b2)":"#e8f5f5",
                  color:i+1<=step?"white":"#aaa",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:12,fontWeight:"bold" }}>
                  {i+1<step?"✓":i+1}
                </div>
                <div style={{ fontSize:9,color:i+1<=step?"#0ea5a0":"#bbb",textAlign:"center" }}>{s}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding:"18px 24px 24px",overflowY:"auto" }}>
          {step===1 && (
            <div>
              <p style={{ fontSize:14,color:"#1e3a3a",marginBottom:14,fontWeight:"600" }}>Choisissez une spécialité :</p>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {SPECIALITES.map(s=>(
                  <button key={s.label} onClick={()=>{ setSpecialite(s.label);setDateChoisie(null);setCreneau("");setStep(2); }}
                    style={{ textAlign:"left",padding:"12px 16px",borderRadius:12,
                      border:"1.5px solid #e0f5f5",background:"white",cursor:"pointer",
                      fontSize:14,fontFamily:"inherit",color:"#1e3a3a",
                      display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <span>🩺 {s.label}</span>
                    <span style={{ fontSize:11,color:"#7aabab" }}>{s.jours.join(", ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step===2 && (
            <div>
              <p style={{ fontSize:14,color:"#1e3a3a",marginBottom:14,fontWeight:"600" }}>
                Dates — <span style={{ color:"#0ea5a0" }}>{specialite}</span>
              </p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxHeight:200,overflowY:"auto" }}>
                {datesFiltrees.map((d,i)=>(
                  <button key={i} onClick={()=>{ setDateChoisie(d);setCreneau("");setStep(3); }}
                    style={{ padding:"10px 6px",borderRadius:12,border:"1.5px solid #e0f5f5",
                      background:"white",cursor:"pointer",fontSize:12,
                      fontFamily:"inherit",color:"#1e3a3a",textAlign:"center" }}>
                    {formatDate(d)}
                  </button>
                ))}
              </div>
              <button onClick={()=>setStep(1)} style={{ marginTop:14,background:"none",border:"none",color:"#0ea5a0",cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>← Retour</button>
            </div>
          )}
          {step===3 && (
            <div>
              <p style={{ fontSize:14,color:"#1e3a3a",marginBottom:14,fontWeight:"600" }}>Créneaux disponibles</p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
                {CRENEAUX.map(c=>(
                  <button key={c} onClick={()=>{ setCreneau(c);setStep(4); }}
                    style={{ padding:"9px 4px",borderRadius:10,border:"1.5px solid #e0f5f5",
                      background:"white",cursor:"pointer",fontSize:13,
                      fontFamily:"inherit",color:"#1e3a3a",textAlign:"center" }}>
                    {c}
                  </button>
                ))}
              </div>
              <button onClick={()=>setStep(2)} style={{ marginTop:14,background:"none",border:"none",color:"#0ea5a0",cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>← Retour</button>
            </div>
          )}
          {step===4 && !done && (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <p style={{ fontSize:14,color:"#1e3a3a",fontWeight:"600",margin:0 }}>Vos informations :</p>
              <div style={{ background:"#f0fefe",borderRadius:12,padding:"10px 14px",
                fontSize:13,color:"#0a8a86",border:"1px solid #c7e8e8" }}>
                📅 {specialite} • {dateChoisie&&formatDate(dateChoisie)} à {creneau}
              </div>
              <input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Nom complet *" style={inputStyle}/>
              <input value={telephone} onChange={e=>setTelephone(e.target.value)} placeholder="WhatsApp * (ex: +237 6XX XXX XXX)" style={inputStyle}/>
              <input value={motif} onChange={e=>setMotif(e.target.value)} placeholder="Motif (optionnel)" style={inputStyle}/>
              {statuses.map((s,i)=>(<StatusBadge key={i} status={s.status} message={s.message}/>))}
              <div style={{ display:"flex",gap:10,marginTop:4 }}>
                <button onClick={()=>setStep(3)} disabled={submitting}
                  style={{ flex:1,padding:"11px",borderRadius:12,border:"1.5px solid #c7e8e8",
                    background:"white",cursor:"pointer",fontSize:14,fontFamily:"inherit",color:"#0a8a86" }}>← Retour</button>
                <button onClick={handleSubmit} disabled={!nom.trim()||!telephone.trim()||submitting}
                  style={{ ...btnPrimary(!nom.trim()||!telephone.trim()||submitting),flex:2 }}>
                  {submitting?"⏳ Traitement…":"✅ Confirmer le RDV"}
                </button>
              </div>
            </div>
          )}
          {done && (
            <div style={{ textAlign:"center",padding:"10px 0" }}>
              <div style={{ fontSize:52,marginBottom:12 }}>🎉</div>
              <h3 style={{ color:"#0a8a86",margin:"0 0 8px",fontSize:18 }}>RDV confirmé !</h3>
              <p style={{ fontSize:14,color:"#1e3a3a",marginBottom:12,lineHeight:1.7 }}>
                <strong>{specialite}</strong><br/>
                {dateChoisie&&formatDate(dateChoisie)} à <strong>{creneau}</strong>
              </p>
              <div style={{ background:"#f0fefe",borderRadius:12,padding:"12px",fontSize:13,
                color:"#0a8a86",border:"1px solid #c7e8e8",marginBottom:16,textAlign:"left" }}>
                📱 WhatsApp envoyé au <strong>{telephone}</strong><br/>
                🗄️ RDV enregistré dans la base de données
              </div>
              {statuses.slice(-1).map((s,i)=>(<StatusBadge key={i} status={s.status} message={s.message}/>))}
              <p style={{ fontSize:12,color:"#7aabab",margin:"14px 0 16px" }}>
                Merci <strong>{nom}</strong> ! Empêchement ? Appelez le {CLINIC_INFO.telephone}
              </p>
              <button onClick={onClose} style={{ ...btnPrimary(false),width:"100%" }}>Fermer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CliniqueChat() {
  const [messages, setMessages] = useState([
    { role:"assistant", content:`Bonjour ! 👋 Je suis l'assistant de la **${CLINIC_INFO.nom}**.\n\nComment puis-je vous aider aujourd'hui ?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [showRdv, setShowRdv] = useState(false);
  const bottomRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    if (userText === "Prendre un rendez-vous") { setShowQuick(false); setShowRdv(true); return; }
    setInput(""); setShowQuick(false);
    setMessages(prev=>[...prev, { role:"user", content:userText }]);
    setLoading(true);
    try {
      const history = messages.map(m=>({ role:m.role, content:m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: SYSTEM_PROMPT,
          messages:[...history, { role:"user", content:userText }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(b=>b.text||"").join("") || "Désolé, je n'ai pas pu traiter votre demande.";
      setMessages(prev=>[...prev, { role:"assistant", content:reply }]);
    } catch {
      setMessages(prev=>[...prev, { role:"assistant", content:`❌ Erreur. Appelez le ${CLINIC_INFO.telephone}.` }]);
    } finally { setLoading(false); }
  };

  const handleRdvConfirm = (rdv) => {
    setMessages(prev=>[...prev, {
      role:"assistant",
      content:`✅ **RDV confirmé et enregistré !**\n\n📋 ${rdv.specialite}\n🗓 ${rdv.date} à ${rdv.creneau}\n👤 ${rdv.nom}\n📱 WhatsApp envoyé au ${rdv.telephone}\n\nÀ bientôt à la clinique !`,
    }]);
  };

  const renderText = (text) => text.split("\n").map((line,i)=>{
    const bold = line.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>");
    return <p key={i} style={{ margin:"2px 0" }} dangerouslySetInnerHTML={{ __html:bold }}/>;
  });

  return (
    <div style={{ minHeight:"100vh",
      background:"linear-gradient(135deg,#f0fafa 0%,#e6f7f7 50%,#f5f0ff 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Georgia','Times New Roman',serif",padding:16 }}>
      <style>{`
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
        textarea:focus,input:focus{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#c7e8e8;border-radius:4px}
      `}</style>
      {showRdv && <RdvModal onClose={()=>setShowRdv(false)} onConfirm={(rdv)=>{ setShowRdv(false); handleRdvConfirm(rdv); }}/>}
      <div style={{ width:"100%",maxWidth:440,background:"white",borderRadius:24,
        boxShadow:"0 20px 60px rgba(14,165,160,0.15)",overflow:"hidden",
        display:"flex",flexDirection:"column",height:"88vh",maxHeight:740 }}>
        <div style={{ background:"linear-gradient(135deg,#0ea5a0,#0891b2)",padding:"18px 22px",
          display:"flex",alignItems:"center",gap:14 }}>
          <div style={{ width:44,height:44,background:"rgba(255,255,255,0.2)",borderRadius:"50%",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>🏥</div>
          <div style={{ flex:1 }}>
            <div style={{ color:"white",fontWeight:"bold",fontSize:15.5 }}>{CLINIC_INFO.nom}</div>
            <div style={{ color:"rgba(255,255,255,0.8)",fontSize:12,display:"flex",alignItems:"center",gap:5 }}>
              <span style={{ display:"inline-block",width:7,height:7,background:"#4ade80",
                borderRadius:"50%",animation:"pulse 2s infinite" }}/>
              Assistant disponible 24h/24
            </div>
          </div>
          <button onClick={()=>setShowRdv(true)} style={{ background:"rgba(255,255,255,0.22)",
            border:"1.5px solid rgba(255,255,255,0.5)",color:"white",borderRadius:20,
            padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",
            fontWeight:"bold",whiteSpace:"nowrap" }}>📅 RDV</button>
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:"18px 14px",display:"flex",flexDirection:"column",gap:12 }}>
          {messages.map((msg,i)=>(
            <div key={i} style={{ display:"flex",
              justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              {msg.role==="assistant" && (
                <div style={{ width:30,height:30,minWidth:30,
                  background:"linear-gradient(135deg,#0ea5a0,#0891b2)",borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,marginRight:8,marginTop:4 }}>🩺</div>
              )}
              <div style={{ maxWidth:"76%",padding:"11px 15px",
                borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
                background:msg.role==="user"?"linear-gradient(135deg,#0ea5a0,#0891b2)":"#f8fffe",
                color:msg.role==="user"?"white":"#1e3a3a",fontSize:14,lineHeight:1.6,
                boxShadow:msg.role==="user"?"0 4px 12px rgba(14,165,160,0.3)":"0 2px 8px rgba(0,0,0,0.06)",
                border:msg.role==="assistant"?"1px solid #e0f5f5":"none" }}>
                {renderText(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex",alignItems:"flex-start" }}>
              <div style={{ width:30,height:30,minWidth:30,background:"linear-gradient(135deg,#0ea5a0,#0891b2)",
                borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:14,marginRight:8 }}>🩺</div>
              <div style={{ background:"#f8fffe",borderRadius:"18px 18px 18px 4px",border:"1px solid #e0f5f5" }}>
                <TypingIndicator/>
              </div>
            </div>
          )}
          {showQuick && (
            <div style={{ marginTop:8 }}>
              <p style={{ fontSize:12,color:"#7aabab",textAlign:"center",marginBottom:10,fontStyle:"italic" }}>
                Questions fréquentes :
              </p>
              <div style={{ display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center" }}>
                {QUICK_QUESTIONS.map((q,i)=>(
                  <button key={i}
                    onClick={()=>{ setShowQuick(false); q==="Prendre un rendez-vous"?setShowRdv(true):sendMessage(q); }}
                    style={{
                      background:q==="Prendre un rendez-vous"?"linear-gradient(135deg,#0ea5a0,#0891b2)":"white",
                      border:q==="Prendre un rendez-vous"?"none":"1.5px solid #b2e8e6",
                      color:q==="Prendre un rendez-vous"?"white":"#0a8a86",
                      borderRadius:20,padding:"6px 14px",fontSize:12,cursor:"pointer",
                      fontFamily:"inherit",fontWeight:q==="Prendre un rendez-vous"?"bold":"normal" }}>
                    {q==="Prendre un rendez-vous"?"📅 "+q:q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
        <div style={{ padding:"12px 14px",borderTop:"1px solid #e8f7f7",background:"white",
          display:"flex",gap:8,alignItems:"flex-end" }}>
          <button onClick={()=>setShowRdv(true)} style={{ width:42,height:42,minWidth:42,
            background:"#f0fefe",border:"1.5px solid #c7e8e8",borderRadius:"50%",
            cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>📅</button>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); } }}
            placeholder="Posez votre question ici…" rows={1}
            style={{ flex:1,resize:"none",border:"1.5px solid #c7e8e8",borderRadius:16,
              padding:"10px 14px",fontSize:14,fontFamily:"inherit",color:"#1e3a3a",
              background:"#f8fffe",lineHeight:1.5,maxHeight:100,overflowY:"auto",outline:"none" }}/>
          <button onClick={()=>sendMessage()} disabled={!input.trim()||loading}
            style={{ width:42,height:42,minWidth:42,
              background:input.trim()&&!loading?"linear-gradient(135deg,#0ea5a0,#0891b2)":"#d1eeee",
              border:"none",borderRadius:"50%",cursor:input.trim()&&!loading?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>➤</button>
        </div>
        <div style={{ textAlign:"center",padding:"7px 16px 11px",fontSize:11,color:"#a0c4c4",background:"white" }}>
          ☎️ Urgences : {CLINIC_INFO.telephone} • Disponible 24h/24
        </div>
      </div>
    </div>
  );
}
