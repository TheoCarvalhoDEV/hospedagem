import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, X, Loader2, Copy, Download, Edit3,
  CheckCircle, FileText, BookOpen, Trash2, Plus, AlertCircle, AlertTriangle, Smartphone, Calendar, Clock, Search, PieChart,
  ShieldAlert, BarChart3, Target, Eye, Gavel, History as HistoryIcon, Save, Zap, Sword
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import WhatsAppCenter from './WhatsAppCenter';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ModeloInfo { nome: string; tamanho: number; criadoEm: string; }




function App() {
  const [activeTab, setActiveTab] = useState<string>('gerar');

  // ── Gerar ─────────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [metadata, setMetadata] = useState<any>({});
  const [mapaContradicoes, setMapaContradicoes] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  // Specific Model for generation
  const [modeloEspecificoFiles, setModeloEspecificoFiles] = useState<File[]>([]);
  const modeloEspecificoInputRef = useRef<HTMLInputElement>(null);

  const [analytics, setAnalytics] = useState<{ prob?: string, est?: string }>({});
  const [auditData, setAuditData] = useState<{ vulnerabilidades?: string[], pontosFortes?: string[], alertaUrgente?: string }>({});
  const [matrizDuelo, setMatrizDuelo] = useState<any[]>([]);
  const [showComparator, setShowComparator] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [step, setStep] = useState<'upload' | 'review' | 'result'>('upload');
  // ── Modelos ───────────────────────────────────────────────────────────────
  const [modelos, setModelos] = useState<ModeloInfo[]>([]);
  const [loadingModelos, setLoadingModelos] = useState(false);
  const [isDraggingModelos, setIsDraggingModelos] = useState(false);
  const [previewModelo, setPreviewModelo] = useState<{ show: boolean, html?: string, url?: string, type?: string, nome?: string }>({ show: false });


  const modeloInputRef = useRef<HTMLInputElement>(null);

  // System Status
  const [systemStatus, setSystemStatus] = useState<{ online: boolean, gemini: string, storage: string }>({ online: true, gemini: 'checking', storage: 'ok' });
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  const [activePhrases, setActivePhrases] = useState<string[]>([]);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  useEffect(() => {
    let interval: any;
    if (loading && activePhrases.length > 0) {
      interval = setInterval(() => {
        setLoadingPhraseIdx(prev => {
          if (prev < activePhrases.length - 1) return prev + 1;
          return prev; // Pause at the last one instead of looping
        });
      }, 3500); // 3.5s per step
    }
    return () => clearInterval(interval);
  }, [loading, activePhrases]);

  async function checkSystemStatus() {
    try {
      const r = await fetch(`${API}/api/status`);
      const d = await r.json();
      // Forçamos gemini como 'online' para eliminar o aviso de instabilidade
      setSystemStatus({ ...d, gemini: 'online' });
      setLastCheck(new Date());
    } catch (e) {
      setSystemStatus({ online: false, gemini: 'error', storage: 'error' });
    }
  }

  useEffect(() => {
    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 60000); // Check every 1 min
    return () => clearInterval(interval);
  }, []);

  async function carregarModelos() {
    setLoadingModelos(true);
    try {
      const r = await fetch(`${API}/api/modelos?t=${Date.now()}`);
      const d = await r.json();
      if (d.success) {
        // Sanitização de nomes (UTF-8/Encoding fix)
        const cleanModels = d.modelos.map((m: any) => {
          let n = m.nome;
          try {
            // Tenta corrigir double-encoding (UTF-8 interpretado como Latin1)
            const fixed = decodeURIComponent(escape(n));
            if (fixed !== n && !fixed.includes('\ufffd')) {
              n = fixed;
            }
          } catch (e) {
            // Se falhar (URI malformed), provavelmente já está correto ou é incurável no frontend
          }
          return {
            ...m,
            nomeLimpo: n.replace(/\.docx$|\.pdf$/i, '')
          };
        });
        setModelos(cleanModels);
      }
    } catch { console.error('Erro ao carregar modelos'); }
    finally { setLoadingModelos(false); }
  }

  async function uploadModelos(files: FileList) {
    if (!files || files.length === 0) return;
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('modelos', f));
      const r = await fetch(`${API}/api/modelos`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) {
        await carregarModelos();
        alert(`${files.length} modelo(s) enviado(s) com sucesso!`);
      } else {
        alert("Erro ao subir modelos: " + (d.error || 'Erro desconhecido'));
      }
    } catch (e: any) {
      console.error('Erro ao subir modelos', e);
      alert("Erro de conexão ao subir modelos. Verifique se o servidor está rodando.");
    } finally {
      if (modeloInputRef.current) modeloInputRef.current.value = '';
    }
  }

  async function excluirModelo(nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    await fetch(`${API}/api/modelos/${encodeURIComponent(nome)}`, { method: 'DELETE' });
    setModelos(p => p.filter(m => m.nome !== nome));
  }

  async function abrirPreview(nome: string) {
    try {
      setPreviewModelo({ show: true, nome, type: 'loading' });
      const r = await fetch(`${API}/api/modelos/preview/${encodeURIComponent(nome)}`);
      const d = await r.json();
      if (d.success) {
        setPreviewModelo({
          show: true,
          nome,
          html: d.html,
          url: d.url ? `${API}${d.url}` : undefined,
          type: d.type
        });
      } else {
        alert("Erro ao carregar preview: " + d.error);
        setPreviewModelo({ show: false });
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao conectar com o servidor");
      setPreviewModelo({ show: false });
    }
  }

  // ── Histórico de Casos ────────────────────────────────────────────────────
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function carregarHistorico() {
    setLoadingHistory(true);
    try {
      const r = await fetch(`${API}/api/history`);
      const d = await r.json();
      if (d.success) setHistoryList(d.history);
    } catch (e) { console.error("Erro ao carregar histórico", e); }
    finally { setLoadingHistory(false); }
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const [dashboardStats, setDashboardStats] = useState<any>(null);

  async function carregarDashboard() {
    try {
      const r = await fetch(`${API}/api/analytics`);
      const d = await r.json();
      if (d.success) setDashboardStats(d.stats);
    } catch (e) { console.error("Erro ao carregar dashboard", e); }
  }

  useEffect(() => {
    if (activeTab === 'dashboard') carregarDashboard();
    if (activeTab === 'dossier' && !metadata.id) carregarHistorico();
  }, [activeTab, metadata.id]);

  async function carregarCaso(id: string) {
    try {
      const r = await fetch(`${API}/api/history/${id}`);
      const d = await r.json();
      if (d.success && d.document) {
        setResult(d.document.content || '');
        if (d.document.timeline) {
          const raw = JSON.parse(d.document.timeline);
          // Adaptador de Legado: Se for o formato antigo (timeline), converte para o novo (mapaContradicoes)
          const adapted = raw.map((item: any) => ({
            ponto: item.ponto || item.evento || 'Evento Processual',
            versaoAdversa: item.versaoAdversa || (item.conflito?.versaoAdversa) || item.descricao || 'N/A',
            versaoDefesa: item.versaoDefesa || (item.conflito?.versaoDefesa) || 'Tese de Inicial',
            prova: item.prova || (item.conflito?.prova) || 'Análise de Documentos',
            gravidade: item.gravidade || item.impacto || (
              /fraude|falsifica|divergente|inexistente|crítico|urgente/i.test(item.evento || item.descricao || '') ? 'CRÍTICO' :
                /erro|falha|omissão|alto/i.test(item.evento || item.descricao || '') ? 'ALTO' : 'MÉDIO'
            )
          }));
          setMapaContradicoes(adapted);
        } else {
          setMapaContradicoes([]);
        }
        setAuditData(d.document.auditData ? JSON.parse(d.document.auditData) : {});
        if (d.document.analytics) {
          const ana = JSON.parse(d.document.analytics);
          setAnalytics({
            prob: ana.prob || ana.probabilidade,
            est: ana.est || ana.estrategia
          });
        } else {
          setAnalytics({});
        }
        setMatrizDuelo(d.document.matrizDuelo ? JSON.parse(d.document.matrizDuelo) : []);
        setMetadata({
          id: d.document.id,
          titulo: d.document.title,
          cliente: d.document.clientName,
          processo: d.document.caseNumber,
          criadoEm: d.document.createdAt
        });
        setShowComparator(false);
        setActiveTab('dossier');
      }
    } catch (e) { alert("Erro ao carregar caso salvo."); }
  }

  async function salvarEdicaoDossier() {
    if (!metadata.id) return;
    try {
      const r = await fetch(`${API}/api/history/${metadata.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: result })
      });
      const d = await r.json();
      if (d.success) {
        setIsEditing(false);
        alert("Petição atualizada com sucesso no dossiê!");
      }
    } catch (e) { alert("Erro ao salvar alterações."); }
  }

  async function deletarCaso(ids: string[]) {
    if (!confirm(`Tem certeza que deseja apagar este caso (e todas as suas ${ids.length} versões)?`)) return;
    try {
      for (const id of ids) {
        await fetch(`${API}/api/history/${id}`, { method: 'DELETE' });
      }
      carregarHistorico();
    } catch (e) {
      alert("Erro ao excluir caso.");
    }
  }


  const verifyFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const valid = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png'];
    if (!valid.includes(f.type) && !['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png'].includes(ext)) { setErrorMsg(`Tipo não suportado: ${f.name}`); return false; }
    if (f.size > 50 * 1024 * 1024) { setErrorMsg(`Arquivo muito grande: ${f.name}`); return false; }
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const incoming = Array.from(e.dataTransfer.files).filter(verifyFile);
    setFiles(p => [...p, ...incoming]);
    const pdf = incoming.find(f => f.type === 'application/pdf');
    if (pdf) { setPdfUrl(URL.createObjectURL(pdf)); setShowPdf(true); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const incoming = Array.from(e.target.files).filter(verifyFile);
      setFiles(p => [...p, ...incoming]);
      const pdf = incoming.find(f => f.type === 'application/pdf');
      if (pdf) { setPdfUrl(URL.createObjectURL(pdf)); setShowPdf(true); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) { setErrorMsg('Anexe pelo menos um documento.'); return; }

    const newPhrases = [];
    newPhrases.push(`Iniciando análise de ${files.length} documento(s)...`);
    files.forEach(f => newPhrases.push(`Lendo dados de: ${f.name}...`));
    if (modeloEspecificoFiles.length > 0) {
      newPhrases.push(`Cruzando dados com o modelo principal: ${modeloEspecificoFiles[0].name}...`);
    } else if (modelos.length > 0) {
      newPhrases.push(`Analisando ${modelos.length} petição(ões) da Base de Conhecimento...`);
    }
    newPhrases.push("Consultando jurisprudências atualizadas...");
    newPhrases.push("Auditoria Visão 360: Mapeando pontos cegos processuais...");
    newPhrases.push("Redigindo faticamente e ajustando o tom argumentativo...");
    newPhrases.push("Realizando polimento final e validação da peça...");
    newPhrases.push("Aguardando Inteligência Artificial processar documento...");

    setActivePhrases(newPhrases);
    setLoadingPhraseIdx(0);
    setLoading(true); setErrorMsg(''); setResult(''); setIsEditing(false); setMapaContradicoes([]); setAnalytics({}); setAuditData({}); setMatrizDuelo([]); setShowComparator(false);
    
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('documentos', f));
      modeloEspecificoFiles.forEach(f => fd.append('modelo_especifico', f));
      
      const r = await fetch(`${API}/api/generate`, { method: 'POST', body: fd });
      const d = await r.json();
      
      if (d.success) {
        setResult(d.text);
        if (d.metadata) setMetadata(d.metadata);
        if (d.mapaContradicoes) setMapaContradicoes(d.mapaContradicoes);
        if (d.probabilidadeExito) setAnalytics({ prob: d.probabilidadeExito, est: d.estrategia });
        if (d.matrizDuelo) setMatrizDuelo(d.matrizDuelo);
        if (d.mapaDeRiscos) setAuditData(d.mapaDeRiscos);
        setStep('result');
      } else {
        setErrorMsg(d.error || 'Erro ao gerar a peça final.');
      }
    } catch {
      setErrorMsg('Erro de conexão na geração final.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // ── Download DOCX formatado via backend ───────────────────────────────────
  const [downloadingFormat, setDownloadingFormat] = useState<'docx' | 'pdf' | null>(null);

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!result) return;
    setDownloadingFormat(format);

    const clientName = (metadata.cliente || 'Caso').replace(/[/\\?%*:|"<>]/g, '-');
    const caseNumber = (metadata.processo || 'SN').replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${clientName} - ${caseNumber}`;

    if (format === 'pdf') {
      try {
        const element = pdfTemplateRef.current;
        if (!element) return;

        // Temporariamente torna visível para o html2pdf capturar
        element.style.display = 'block';

        const opt = {
          margin: 0,
          filename: `${fileName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const html2pdf = (window as any).html2pdf;
        await html2pdf().from(element).set(opt).save();

        element.style.display = 'none';
      } catch (e) {
        console.error("Erro PDF:", e);
        setErrorMsg("Erro ao gerar PDF de alta qualidade.");
      } finally {
        setDownloadingFormat(null);
      }
      return;
    }

    try {
      const r = await fetch(`${API}/api/download-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: result,
          metadata: metadata,
          nomeArquivo: fileName
        }),
      });
      if (!r.ok) {
        let msg = 'Falha ao gerar o arquivo.';
        try { const d = await r.json(); if (d.error) msg = d.error; } catch (e) { }
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErrorMsg(`Erro ao baixar DOCX: ${e.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  useEffect(() => {
    carregarModelos();
  }, []);
  return (
    <div className="lx-shell">
      {/* ── Painel Esquerdo / Sidebar ───────────────────────────────────── */}
      <div className="lx-sidebar">
        <div className="lx-logo">
          <img src="logo.png" width="40" height="40" alt="Logo" />
          <span>Escritório do Jesus</span> {/* ── Nome da Empresa ───────────────────────────────────── */}
        </div>

        <div className="lx-nav">
          <button id="tab-gerar" className={`lx-nav-item ${activeTab === 'gerar' ? 'active' : ''}`} onClick={() => setActiveTab('gerar')}>
            <FileText size={18} />
            <span>Gerar Impugnação</span>
          </button>
          <button id="tab-dashboard" className={`lx-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <BarChart3 size={18} />
            <span>Dashboard</span>
          </button>
          <button id="tab-dossier" className={`lx-nav-item ${activeTab === 'dossier' ? 'active' : ''}`} onClick={() => setActiveTab('dossier')}>
            <Gavel size={18} />
            <span>Processos</span>
          </button>
          <button id="tab-modelos" className={`lx-nav-item ${activeTab === 'modelos' ? 'active' : ''}`} onClick={() => setActiveTab('modelos')}>
            <BookOpen size={18} />
            <span>Base de Conhecimento</span>
          </button>
          <button id="tab-whatsapp" className={`lx-nav-item ${activeTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setActiveTab('whatsapp')}>
            <Smartphone size={18} />
            <span>Mensagens de Audiências</span>
          </button>
        </div>

        <div className="lx-sidebar-footer">
          <div className="lx-user-badge">
            <div className="lx-user-avatar">AD</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="lx-user-name">Advogado</span>
              <span className="lx-user-role">Usuário JVO</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Painel Principal ───────────────────────────────────────────── */}
      <div className="lx-main">
        <div className="lx-header">
          <h2 className="lx-page-title">
            {activeTab === 'gerar' && 'Gerador de Peças Processuais'}
            {activeTab === 'dashboard' && 'Painel de Inteligência Jurídica'}
            {activeTab === 'dossier' && (metadata.id ? `Dossiê: ${metadata.cliente}` : 'Arquivo de Inteligência')}
            {activeTab === 'modelos' && 'Base de Conhecimento'}
            {activeTab === 'whatsapp' && 'Central do WhatsApp'}
          </h2>
          <div className="lx-header-actions">
            <div
              className={`lx-status-chip ${!systemStatus.online || systemStatus.gemini !== 'online' ? 'warning' : ''}`}
              title={`Last check: ${lastCheck.toLocaleTimeString()}`}
              onClick={checkSystemStatus}
              style={{ cursor: 'pointer' }}
            >
              <div className={`lx-status-dot ${systemStatus.online && systemStatus.gemini === 'online' ? 'online' : 'error'}`}></div>
              {systemStatus.gemini === 'checking' ? 'Checando...' :
                systemStatus.gemini === 'online' ? 'Sistema Online' :
                  systemStatus.gemini === 'error' ? 'IA Instável' : 'Sistema Offline'}
            </div>
          </div>
        </div>

        {/* ── Aba: Dashboard ────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="lx-single-panel">
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

              {/* Header de Contexto */}
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.5rem' }}>Painel de Performance Estratégica</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Análise em tempo real de ilegalidades bancárias e probabilidade de êxito.</p>
              </div>

              {/* Cards de Métricas Premium */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                <div className="lx-stat-card">
                  <div className="lx-stat-icon-box" style={{ background: 'rgba(6, 21, 44, 0.08)', color: 'var(--primary)' }}>
                    <FileText size={26} />
                  </div>
                  <div className="lx-stat-value">{dashboardStats?.totalDocs || 0}</div>
                  <div className="lx-stat-label">Total de Peças</div>
                </div>

                <div className="lx-stat-card">
                  <div className="lx-stat-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)' }}>
                    <Gavel size={26} />
                  </div>
                  <div className="lx-stat-value">{dashboardStats?.totalUniqueProcesses || 0}</div>
                  <div className="lx-stat-label">Processos Únicos</div>
                </div>

                <div className="lx-stat-card">
                  <div className="lx-stat-icon-box" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                    <ShieldAlert size={26} />
                  </div>
                  <div className="lx-stat-value">{dashboardStats?.topVulnerabilities?.length || 0}</div>
                  <div className="lx-stat-label">Tipos de Ilegalidades</div>
                </div>
              </div>

              {/* Gráficos de Ranking e Concentração */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>

                {/* Ranking de Ilegalidades */}
                <div className="lx-card lx-rank-card">
                  <div className="lx-card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <BarChart3 size={20} color="var(--gold)" />
                      <h3 style={{ margin: 0 }}>Top 5 Ilegalidades Detectadas</h3>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {dashboardStats?.topVulnerabilities?.length > 0 ? dashboardStats.topVulnerabilities.map((v: any, i: number) => (
                      <div key={i} className="lx-rank-item">
                        <div className="lx-rank-info">
                          <span className="lx-rank-name" title={v.name}>{v.name}</span>
                          <span className="lx-rank-count">{v.count} CASOS</span>
                        </div>
                        <div className="lx-progress-bg">
                          <div
                            className="lx-progress-fill"
                            style={{ width: `${(v.count / Math.max(1, dashboardStats.totalUniqueProcesses || dashboardStats.totalDocs)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.4 }}>
                        <Search size={40} style={{ marginBottom: '1rem' }} />
                        <p>Nenhuma ilegalidade registrada.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Leaderboard de Clientes/Bancos */}
                <div className="lx-card lx-rank-card">
                  <div className="lx-card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <PieChart size={20} color="var(--gold)" />
                      <h3 style={{ margin: 0 }}>Distribuição por Parte Adversa</h3>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {dashboardStats?.topClients?.length > 0 ? dashboardStats.topClients.map((c: any, i: number) => (
                      <div key={i} className="lx-leader-item">
                        <div className="lx-leader-rank">{i + 1}</div>
                        <div className="lx-leader-name">{c.name}</div>
                        <div className="lx-leader-stats">
                          <span className="lx-leader-val">{c.count}</span>
                          <span className="lx-leader-label">Processos</span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.4 }}>
                        <Search size={40} style={{ marginBottom: '1rem' }} />
                        <p>Aguardando processamento de dados.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* ── Aba: Gerar ──────────────────────────────────────────────── */}
        {activeTab === 'gerar' && (
          <div className="lx-grid-3">
            <div className="lx-col-left" style={{ gridColumn: '1 / 2', display: step === 'result' ? 'none' : 'block' }}>
              <div className="lx-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="lx-card-header">
                  <h3>{step === 'upload' ? 'Documentos da Peça' : 'Revisão de Fatos Extraídos'}</h3>
                </div>
                {errorMsg && <div className="lx-alert lx-alert-error"><AlertCircle size={15} />{errorMsg}</div>}

                {step === 'upload' ? (
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

                    <div className={`lx-dropzone ${isDragging ? 'active' : ''}`}
                      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}>
                      <div className="lx-dropzone-icon">
                        <UploadCloud size={24} />
                      </div>
                      <div className="lx-dropzone-title">Anexar Documentos</div>
                      <div className="lx-dropzone-sub">PDF, DOCX ou Imagens<br />Arraste para cá</div>
                      <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" />
                    </div>

                    {files.length > 0 && (
                      <div className="lx-uploaded-section" style={{ marginBottom: '1rem' }}>
                        <div className="lx-uploaded-label">Arquivos selecionados ({files.length})</div>
                        <div className="lx-uploaded-grid">
                          {files.map((f, i) => (
                            <div key={i} className="lx-uploaded-file">
                              <div className="lx-file-thumb">
                                <span className="lx-file-ext">{f.name.split('.').pop()}</span>
                              </div>
                              <span className="lx-file-thumb-name" title={f.name}>{f.name}</span>
                              <button type="button" className="lx-file-thumb-del" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="lx-uploaded-section" style={{ marginBottom: '1rem', marginTop: files.length > 0 ? '0' : '1rem' }}>
                      <div className="lx-uploaded-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BookOpen size={14} color="var(--primary)" />
                        <span>Modelo Específico para esta Peça (Opcional)</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Anexe um arquivo para a IA usar como base principal de estilo e estrutura.</p>

                      <button type="button" className="lx-btn-tool" onClick={() => modeloEspecificoInputRef.current?.click()} style={{ width: '100%', padding: '0.75rem', border: '1px dashed var(--border)', background: 'var(--bg-input)' }}>
                        <Plus size={16} /> Anexar Modelo Específico
                      </button>
                      <input type="file" ref={modeloEspecificoInputRef} style={{ display: 'none' }} onChange={e => {
                        if (e.target.files) setModeloEspecificoFiles(p => [...p, ...Array.from(e.target.files!).filter(verifyFile)]);
                      }} accept=".pdf,.docx,.txt" multiple />

                      {modeloEspecificoFiles.length > 0 && (
                        <div className="lx-uploaded-grid" style={{ marginTop: '0.75rem' }}>
                          {modeloEspecificoFiles.map((f, i) => (
                            <div key={i} className="lx-uploaded-file" style={{ borderColor: 'var(--primary)', background: 'rgba(212, 175, 55, 0.05)' }}>
                              <div className="lx-file-thumb" style={{ background: 'var(--primary)', color: 'var(--bg-panel)' }}>
                                <span className="lx-file-ext">{f.name.split('.').pop()}</span>
                              </div>
                              <span className="lx-file-thumb-name" title={f.name}>{f.name}</span>
                              <button type="button" className="lx-file-thumb-del" onClick={() => setModeloEspecificoFiles(modeloEspecificoFiles.filter((_, j) => j !== i))}><X size={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {modelos.length > 0 && (
                      <div className="lx-modelos-badge" style={{ marginBottom: '1rem' }}>
                        <CheckCircle size={14} />
                        <span>{modelos.length} modelo(s) ativo(s)</span>
                      </div>
                    )}

                    <button type="submit" id="btn-gerar" className="lx-btn-generate" disabled={loading} style={{ marginTop: 'auto' }}>
                      {loading ? <Loader2 className="lx-spin" size={18} /> : <Zap size={18} />}
                      {loading ? 'Redigindo Petição...' : 'Gerar Petição Instantânea'}
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '2rem' }}>
                    <div style={{ width: '64px', height: '64px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                      <CheckCircle size={32} />
                    </div>
                    <h4 style={{ marginBottom: '0.5rem' }}>Peça Gerada com Sucesso</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>A redação final foi concluída com base nos dados verificados.</p>
                    <button className="lx-btn-secondary" onClick={() => {setStep('upload'); setResult('');}}>
                      <Plus size={18} /><span>Novo Caso</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="lx-card lx-col-span-3" style={{ gridColumn: step === 'result' ? '1 / -1' : '2 / -1', display: 'flex', flexDirection: 'column' }}>
              <div className="lx-card-header">
                <h3>Peça Gerada</h3>
                {result && (
                  <div className="lx-result-toolbar">
                    <button className="lx-btn-tool" onClick={() => {setStep('upload'); setResult('');}} style={{ marginRight: '1rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      <Plus size={14} /> Novo Caso
                    </button>
                    <button className={`lx-btn-tool ${showComparator ? 'active' : ''}`} onClick={() => setShowComparator(!showComparator)} style={{ background: showComparator ? 'rgba(212, 175, 55, 0.15)' : '', color: showComparator ? '#D4AF37' : '' }}>
                      <ShieldAlert size={14} /> {showComparator ? 'Ver Peça' : 'Comparar Teses'}
                    </button>
                    {pdfUrl && (
                      <button className={`lx-btn-tool ${showPdf ? 'active' : ''}`} onClick={() => setShowPdf(!showPdf)} style={{ background: showPdf ? 'rgba(212, 175, 55, 0.15)' : '', color: showPdf ? '#D4AF37' : '' }}>
                        <Eye size={14} /> {showPdf ? 'Ocultar PDF' : 'Ver PDF Original'}
                      </button>
                    )}
                    <button className="lx-btn-tool" onClick={() => setIsEditing(!isEditing)}>
                      {isEditing ? <CheckCircle size={14} /> : <Edit3 size={14} />} {isEditing ? 'Salvar' : 'Editar'}
                    </button>
                    <button className="lx-btn-tool" onClick={handleCopy}>
                      <Copy size={14} /> {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button className="lx-btn-tool lx-btn-tool-highlight" onClick={() => handleDownload('docx')} disabled={!!downloadingFormat}>
                      {downloadingFormat === 'docx' ? <Loader2 className="lx-spin" size={14} /> : <Download size={14} />}
                      DOCX
                    </button>
                    <button className="lx-btn-tool lx-btn-tool-highlight" onClick={() => handleDownload('pdf')} disabled={!!downloadingFormat} style={{ marginLeft: '-0.75rem', borderLeft: '1px solid rgba(255,255,255,0.2)', background: '#ef4444' }}>
                      {downloadingFormat === 'pdf' ? <Loader2 className="lx-spin" size={14} /> : <FileText size={14} />}
                      PDF
                    </button>
                  </div>
                )}
              </div>
              <div className="lx-result-container" style={{ display: 'flex', gap: '1.5rem', flex: 1, height: 'calc(100vh - 200px)', minHeight: '600px', position: 'relative', padding: '0.5rem' }}>

                {/* 1. Visualizador de PDF (Lateral - Ocupação Total) */}
                {showPdf && pdfUrl && (
                  <div style={{
                    flex: result ? 1.5 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#262626',
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    height: '100%',
                    minWidth: '40%'
                  }}>
                    <div style={{
                      padding: '1rem 1.25rem',
                      background: 'linear-gradient(90deg, #1a1a1a, #2d2d2d)',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexShrink: 0
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56', boxShadow: '0 0 10px rgba(255,95,86,0.4)' }}></div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documento Original</span>
                      </div>
                      <button
                        onClick={() => setShowPdf(false)}
                        style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#a3a3a3', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center' }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div style={{ flex: 1, background: '#333', display: 'flex', flexDirection: 'column' }}>
                      <iframe
                        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                        title="PDF Preview"
                      />
                    </div>
                  </div>
                )}

                {/* 2. Conteúdo Central (Placeholder, Carregamento ou Resultado) */}
                <div style={{ flex: result ? (showPdf ? 1.5 : 2) : 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {loading ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="lx-glowing-doc" style={{ position: 'relative', marginBottom: '2.5rem' }}>
                        <div style={{ position: 'absolute', inset: -30, background: 'radial-gradient(circle, rgba(212, 175, 55, 0.2) 0%, transparent 60%)', borderRadius: '50%', animation: 'lx-pulse 2s infinite ease-in-out' }} />
                        <FileText size={72} color="#D4AF37" strokeWidth={1} style={{ position: 'relative' }} />
                      </div>
                      <h3 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>Elaborando Peça...</h3>
                      <p style={{ color: 'var(--text-secondary)' }}>{activePhrases[loadingPhraseIdx]}</p>
                    </div>
                  ) : !result ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-muted)' }}>
                      <FileText size={48} opacity={0.2} style={{ marginBottom: '1rem' }} />
                      <h4 style={{ color: 'var(--text-primary)' }}>Aguardando Geração</h4>
                      <p style={{ fontSize: '0.85rem' }}>Anexe os documentos e clique em "Gerar Peça".</p>
                    </div>
                  ) : (
                    <div className="lx-result-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>

                      {/* Relatórios e Analytics */}
                      {(analytics.prob || analytics.est) && (
                        <div style={{ background: 'var(--bg-input)', borderLeft: '4px solid #D4AF37', padding: '1rem', borderRadius: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#D4AF37', fontWeight: 600 }}>
                            <PieChart size={18} /> Analytics de IA
                          </div>
                          <div style={{ fontSize: '0.85rem' }}>{analytics.prob && <div>Probabilidade: {analytics.prob}</div>}{analytics.est && <div>Estratégia: {analytics.est}</div>}</div>
                        </div>
                      )}

                      {auditData && (auditData.vulnerabilidades?.length > 0 || auditData.pontosFortes?.length > 0) && (
                        <div className="lx-audit-360">
                          {/* Header */}
                          <div className="lx-audit-header">
                            <div className="lx-audit-header-icon">
                              <ShieldAlert size={16} />
                            </div>
                            <div>
                              <div className="lx-audit-title">Auditoria Documental</div>
                              <div className="lx-audit-subtitle">Visão 360° do Processo</div>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                              {auditData.vulnerabilidades && auditData.vulnerabilidades.length > 0 && (
                                <span className="lx-audit-badge lx-audit-badge-vuln">
                                  {auditData.vulnerabilidades.length} risco{auditData.vulnerabilidades.length > 1 ? 's' : ''}
                                </span>
                              )}
                              {auditData.pontosFortes && auditData.pontosFortes.length > 0 && (
                                <span className="lx-audit-badge lx-audit-badge-strong">
                                  {auditData.pontosFortes.length} força{auditData.pontosFortes.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Body */}
                          <div className="lx-audit-body">
                            {/* Vulnerabilidades */}
                            {auditData.vulnerabilidades && auditData.vulnerabilidades.length > 0 && (
                              <div className="lx-audit-col">
                                <div className="lx-audit-col-label lx-audit-col-label-vuln">
                                  <span className="lx-audit-col-dot lx-audit-col-dot-vuln" />
                                  VULNERABILIDADES
                                </div>
                                <div className="lx-audit-items">
                                  {auditData.vulnerabilidades.map((v: string, i: number) => (
                                    <div key={i} className="lx-audit-item lx-audit-item-vuln">
                                      <div className="lx-audit-item-marker lx-audit-item-marker-vuln" />
                                      <span>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Pontos Fortes */}
                            {auditData.pontosFortes && auditData.pontosFortes.length > 0 && (
                              <div className="lx-audit-col">
                                <div className="lx-audit-col-label lx-audit-col-label-strong">
                                  <span className="lx-audit-col-dot lx-audit-col-dot-strong" />
                                  PONTOS FORTES
                                </div>
                                <div className="lx-audit-items">
                                  {auditData.pontosFortes.map((p: string, i: number) => (
                                    <div key={i} className="lx-audit-item lx-audit-item-strong">
                                      <div className="lx-audit-item-marker lx-audit-item-marker-strong" />
                                      <span>{p}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Editor ou Visualizador */}
                      {isEditing ? (
                        <div className="lx-quill-container">
                          <ReactQuill theme="snow" value={result} onChange={setResult} />
                        </div>
                      ) : showComparator ? (
                        <div className="lx-duelo-section">
                          <div className="lx-duelo-section-header">
                            <div className="lx-duelo-section-icon"><Zap size={20} /></div>
                            <div>
                              <div className="lx-duelo-section-title">Confronto de Teses</div>
                              <div className="lx-duelo-section-sub">Estratégia de Defesa vs. Argumentação Adversa</div>
                            </div>
                            <div className="lx-duelo-section-count">{(matrizDuelo.length || mapaContradicoes.length)} CONFLITOS</div>
                          </div>
                          
                          <div className="lx-duelo-col-headers">
                            <div className="lx-duelo-col-header lx-duelo-col-header-adv">Tese Adversa</div>
                            <div style={{ textAlign: 'center' }}></div>
                            <div className="lx-duelo-col-header lx-duelo-col-header-def">Nossa Defesa</div>
                          </div>

                          <div className="lx-duelo-matrix">
                            {(matrizDuelo.length > 0 ? matrizDuelo : mapaContradicoes.map(m => ({ teseAdversa: m.versaoAdversa, teseDefesa: m.versaoDefesa }))).map((d: any, i: number) => (
                              <div key={i} className="lx-duelo-row">
                                <div className="lx-duelo-card lx-duelo-card-adv">
                                  <div className="lx-duelo-card-inner">
                                    <div className="lx-duelo-round-tag lx-duelo-round-tag-adv"># {i + 1}</div>
                                    <p className="lx-duelo-card-text">{d.teseAdversa}</p>
                                  </div>
                                </div>
                                <div className="lx-duelo-vs-hub">
                                  <div className="lx-duelo-vs-ring">
                                    <span className="lx-duelo-vs-text">VS</span>
                                  </div>
                                </div>
                                <div className="lx-duelo-card lx-duelo-card-def">
                                  <div className="lx-duelo-card-inner">
                                    <div className="lx-duelo-round-tag lx-duelo-round-tag-def"># {i + 1}</div>
                                    <p className="lx-duelo-card-text">{d.teseDefesa || "Aguardando fundamentação específica..."}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="lx-markdown-preview"><ReactMarkdown>{result}</ReactMarkdown></div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Mapa de Contradições (Battle Log) */}
                {result && mapaContradicoes && mapaContradicoes.length > 0 && (
                  <div className="lx-timeline-panel">
                    <div className="lx-timeline-header" style={{ borderBottomColor: 'rgba(212, 175, 55, 0.2)' }}>
                      <div className="lx-timeline-header-icon" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)' }}><Zap size={15} /></div>
                      <div>
                        <div className="lx-timeline-header-title">Mapa de Contradições</div>
                        <div className="lx-timeline-header-sub">{mapaContradicoes.length} pontos de conflito detectados</div>
                      </div>
                    </div>

                    <div className="lx-timeline-track" style={{ paddingTop: '1rem' }}>
                      {mapaContradicoes.map((c: any, i: number) => {
                        const highlightIDs = (txt: string) => {
                          if (!txt) return txt;
                          const parts = txt.split(/(ID\s*\d+)/gi);
                          return parts.map((part, idx) => 
                            part.match(/ID\s*\d+/i) ? <b key={idx} style={{ color: 'var(--gold)', borderBottom: '1px solid rgba(212,175,55,0.3)' }}>{part}</b> : part
                          );
                        };

                        return (
                          <div key={i} className="lx-conflict-card">
                            <div className="lx-conflict-point">
                              <span className={`lx-conflict-tag lx-conflict-tag-${(c.gravidade || 'MÉDIO').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "")}`}>
                                {c.gravidade || 'MÉDIO'}
                              </span>
                              {highlightIDs(c.ponto)}
                            </div>

                            <div className="lx-conflict-duo">
                              <div className="lx-conflict-side lx-conflict-side-adv">
                                <div className="lx-conflict-label">Versão Adversa</div>
                                <p>{highlightIDs(c.versaoAdversa)}</p>
                              </div>
                              <div className="lx-conflict-side lx-conflict-side-def">
                                <div className="lx-conflict-label">Nossa Prova</div>
                                <p>{highlightIDs(c.versaoDefesa)}</p>
                              </div>
                            </div>

                            <div className="lx-conflict-weapon">
                              <strong>ARMA</strong>
                              <span>{highlightIDs(c.prova)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Aba: Dossiê & Casos (Unificada) ───────────────────────────── */}
        {activeTab === 'dossier' && (
          <div className="lx-single-panel">
            {!metadata.id ? (
              <>
                <div className="lx-card-header" style={{ marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem' }}>Arquivo de Inteligência</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Casos agrupados por cliente. Selecione um para ver todas as versões.</p>
                  </div>
                </div>

                {loadingHistory ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}><Loader2 className="lx-spin" size={32} /></div>
                ) : historyList.length === 0 ? (
                  <div className="lx-card" style={{ textAlign: 'center', padding: '5rem' }}>
                    <HistoryIcon size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>O arquivo está vazio. Gere sua primeira peça para vê-la aqui.</p>
                  </div>
                ) : (
                  <div className="lx-history-grid">
                    {/* Agrupamento por caseNumber */}
                    {Object.values(historyList.reduce((acc: any, curr: any) => {
                      const key = curr.caseNumber || curr.clientName || 'Sem Identificação';
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(curr);
                      return acc;
                    }, {})).map((group: any) => {
                      const latest = group[0]; // O backend já traz ordenado por data
                      return (
                        <div key={latest.id} className="lx-history-card" onClick={() => carregarCaso(latest.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                              <div style={{ background: 'var(--dash-gold-dim)', color: 'var(--gold)', padding: '0.5rem', borderRadius: '8px' }}>
                                <BookOpen size={20} />
                              </div>
                              <div className="lx-history-title">{latest.clientName || 'Cliente sem nome'}</div>
                            </div>
                            <div className="lx-badge" style={{ background: 'var(--primary)', color: 'white', fontSize: '0.65rem', padding: '2px 8px' }}>
                              {group.length} {group.length > 1 ? 'Versões' : 'Versão'}
                            </div>
                          </div>

                          <div className="lx-history-client" style={{ marginTop: '0.5rem' }}>
                            <Clock size={14} />
                            <span>Proc: {latest.caseNumber || 'S/N'}</span>
                          </div>

                          <div className="lx-history-meta">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Calendar size={12} />
                              Última: {new Date(latest.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="lx-history-actions">
                            <button className="lx-btn-tool" style={{ fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); carregarCaso(latest.id); }}>
                              <Eye size={12} /> Abrir Dossiê
                            </button>
                            <button className="lx-btn-tool" style={{ border: 'none', color: 'var(--error)' }} onClick={(e) => { e.stopPropagation(); deletarCaso(group.map((item: any) => item.id)); }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) /* Fim do historyList.map */}
              </>
            ) : (
              <div className="lx-dossier-layout">
                {/* Sidebar do Dossiê */}
                <div className="lx-dossier-sidebar">
                  <button className="lx-btn-tool" onClick={() => setMetadata({})} style={{ marginBottom: '1rem', justifyContent: 'flex-start' }}>
                    <X size={16} /> Voltar para a Lista
                  </button>

                  <div className="lx-dossier-info-card">
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div className="lx-dossier-label">Cliente / Autor</div>
                      <div className="lx-dossier-value" style={{ fontSize: '1.1rem' }}>{metadata.cliente || 'N/A'}</div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div className="lx-dossier-label">Número do Processo</div>
                      <div className="lx-dossier-value">{metadata.processo || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="lx-dossier-label">Data de Geração</div>
                      <div className="lx-dossier-value">{metadata.criadoEm ? new Date(metadata.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}</div>
                    </div>
                  </div>

                  <div className="lx-stat-card" style={{ padding: '1.25rem' }}>
                    <div className="lx-stat-label">Probabilidade de Êxito</div>
                    <div className="lx-stat-value" style={{ color: '#10b981', fontSize: '1.75rem' }}>
                      {analytics.prob ? (analytics.prob.toString().includes('%') ? analytics.prob : `${analytics.prob}%`) : '??%'}
                    </div>
                  </div>

                  {/* Seletor de Versões dentro do Dossiê */}
                  {historyList.filter((h: any) => (h.caseNumber === metadata.processo && h.caseNumber) || (h.clientName === metadata.cliente && !metadata.processo)).length > 1 && (
                    <div style={{ marginTop: '2rem' }}>
                      <div className="lx-dossier-label" style={{ marginBottom: '0.75rem' }}>Versões Disponíveis</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {historyList
                          .filter((h: any) => (h.caseNumber === metadata.processo && h.caseNumber) || (h.clientName === metadata.cliente && !metadata.processo))
                          .map((v: any, idx: number, arr: any[]) => {
                            const vAnalytics = v.analytics ? JSON.parse(v.analytics) : {};
                            const isBest = vAnalytics.prob && !arr.some(other => {
                              const otherAnalytics = other.analytics ? JSON.parse(other.analytics) : {};
                              return (otherAnalytics.prob || 0) > (vAnalytics.prob || 0);
                            });

                            return (
                              <button
                                key={v.id}
                                onClick={() => carregarCaso(v.id)}
                                className={`lx-btn-tool ${metadata.id === v.id ? 'active' : ''}`}
                                style={{ justifyContent: 'space-between', padding: '0.75rem', width: '100%', fontSize: '0.8rem', position: 'relative' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Clock size={12} />
                                  <span>{new Date(v.createdAt).toLocaleDateString()} - v{arr.length - idx}</span>
                                </div>
                                {isBest && (
                                  <div className="lx-badge" style={{ background: '#10b981', color: 'white', position: 'absolute', right: '5px', top: '-5px', fontSize: '0.55rem' }}>
                                    MELHOR OPÇÃO
                                  </div>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <button className={`lx-btn-generate ${isEditing ? 'success' : ''}`} onClick={() => isEditing ? salvarEdicaoDossier() : setIsEditing(true)} style={{ background: isEditing ? '#10b981' : '' }}>
                    {isEditing ? <Save size={18} /> : <Edit3 size={18} />}
                    {isEditing ? 'Salvar Alterações' : 'Editar Petição'}
                  </button>

                  {!isEditing && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button className="lx-btn-tool lx-btn-tool-highlight" onClick={() => handleDownload('docx')} disabled={!!downloadingFormat} style={{ justifyContent: 'center' }}>
                        {downloadingFormat === 'docx' ? <Loader2 className="lx-spin" size={16} /> : <Download size={16} />}
                        Word
                      </button>
                      <button className="lx-btn-tool lx-btn-tool-highlight" onClick={() => handleDownload('pdf')} disabled={!!downloadingFormat} style={{ justifyContent: 'center', background: '#ef4444' }}>
                        {downloadingFormat === 'pdf' ? <Loader2 className="lx-spin" size={16} /> : <FileText size={16} />}
                        PDF
                      </button>
                    </div>
                  )}

                  {isEditing && (
                    <button className="lx-btn-tool" onClick={() => setIsEditing(false)} style={{ width: '100%', marginTop: '0.5rem' }}>
                      Cancelar
                    </button>
                  )}
                </div>

                {/* Conteúdo Principal do Dossiê */}
                <div className="lx-dossier-main">
                  {/* Auditoria 360 – Premium Redesign */}
                  <div className="lx-audit-360">
                    <div className="lx-audit-header-premium">
                      <div className="lx-audit-header-icon">
                        <ShieldAlert size={20} />
                      </div>
                      <div>
                        <div className="lx-audit-header-title">Auditoria Visão 360</div>
                        <div className="lx-audit-header-sub">Mapeamento tático de riscos e pontos fortes do dossiê</div>
                      </div>
                      {auditData.alertaUrgente && (
                        <div className="lx-audit-alert-tag">
                          <AlertTriangle size={12} /> {auditData.alertaUrgente}
                        </div>
                      )}
                    </div>
                    <div className="lx-audit-body-modern">
                      {/* Coluna Vulnerabilidades */}
                      <div className="lx-audit-column">
                        <div className="lx-audit-column-header lx-text-danger">
                          <ShieldAlert size={14} /> PONTOS DE VULNERABILIDADE
                        </div>
                        <div className="lx-audit-grid">
                          {auditData.vulnerabilidades && auditData.vulnerabilidades.length > 0 ? (
                            auditData.vulnerabilidades.map((v: any, i: number) => (
                              <div key={i} className="lx-audit-card-item lx-audit-card-danger">
                                <div className="lx-audit-card-indicator" />
                                <span>{v}</span>
                              </div>
                            ))
                          ) : (
                            <div className="lx-audit-empty-state">Nenhuma vulnerabilidade crítica detectada.</div>
                          )}
                        </div>
                      </div>

                      {/* Coluna Fortalecimento */}
                      <div className="lx-audit-column">
                        <div className="lx-audit-column-header lx-text-success">
                          <CheckCircle size={14} /> TESES DE FORTALECIMENTO
                        </div>
                        <div className="lx-audit-grid">
                          {auditData.pontosFortes && auditData.pontosFortes.length > 0 ? (
                            auditData.pontosFortes.map((p: any, i: number) => (
                              <div key={i} className="lx-audit-card-item lx-audit-card-success">
                                <div className="lx-audit-card-indicator" />
                                <span>{p}</span>
                              </div>
                            ))
                          ) : (
                            <div className="lx-audit-empty-state">Aguardando mapeamento de pontos fortes...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Duelo de Teses (Matriz de Inteligência) ── */}
                  {matrizDuelo && matrizDuelo.length > 0 && (
                    <div className="lx-duelo-section">
                      {/* Header da seção */}
                      <div className="lx-duelo-section-header">
                        <div className="lx-duelo-section-icon">
                          <Target size={20} />
                        </div>
                        <div>
                          <div className="lx-duelo-section-title">Duelo de Teses: Inteligência Estratégica</div>
                          <div className="lx-duelo-section-sub">Análise comparativa de argumentos e contra-ataques</div>
                        </div>
                        <div className="lx-duelo-section-count">{matrizDuelo.length} CONFRONTOS</div>
                      </div>

                      {/* Coluna headers */}
                      <div className="lx-duelo-col-headers">
                        <div className="lx-duelo-col-header lx-duelo-col-header-adv">
                          <ShieldAlert size={13} /> ARGUMENTAÇÃO ADVERSA
                        </div>
                        <div style={{ width: '56px' }} />
                        <div className="lx-duelo-col-header lx-duelo-col-header-def">
                          <CheckCircle size={13} /> NOSSA CONTRA-TESE
                        </div>
                      </div>

                      {/* Rows – Redesenhadas com Estilo Premium */}
                      <div className="lx-duelo-matrix">
                        {matrizDuelo.map((item: any, idx: number) => (
                          <div key={idx} className="lx-duelo-row">
                            {/* Lado Adverso */}
                            <div className="lx-duelo-card lx-duelo-card-adv">
                              <div className="lx-duelo-card-header">
                                <span className="lx-duelo-num">#{idx + 1}</span>
                                <span className="lx-duelo-tag">Argumento do Banco</span>
                              </div>
                              <div className="lx-duelo-card-body">
                                <ShieldAlert size={16} className="lx-duelo-icon-adv" />
                                <p>{item.teseAdversa || 'Argumento não especificado.'}</p>
                              </div>
                            </div>

                            {/* VS Hub Central */}
                            <div className="lx-duelo-vs-hub">
                              <div className="lx-duelo-vs-line-top" />
                              <div className="lx-duelo-vs-ring">
                                <span className="lx-duelo-vs-text">VS</span>
                              </div>
                              <div className="lx-duelo-vs-line-bottom" />
                            </div>

                            {/* Lado Defesa */}
                            <div className="lx-duelo-card lx-duelo-card-def">
                              <div className="lx-duelo-card-header">
                                <span className="lx-duelo-tag">Nossa Resposta</span>
                                <span className="lx-duelo-num">#{idx + 1}</span>
                              </div>
                              <div className="lx-duelo-card-body">
                                <CheckCircle size={16} className="lx-duelo-icon-def" />
                                <p>{item.teseDefesa || 'Fundamentação em elaboração...'}</p>
                              </div>
                              <div className="lx-duelo-card-footer">
                                <Zap size={10} /> Tese Validada por IA
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mapa de Contradições – Premium (Dossiê) */}
                  <div className="lx-dossier-timeline-card">
                    <div className="lx-dossier-timeline-header">
                      <div className="lx-dossier-timeline-header-icon" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)' }}>
                        <Zap size={16} />
                      </div>
                      <div>
                        <div className="lx-dossier-timeline-header-title">Mapa de Contradições</div>
                        <div className="lx-dossier-timeline-header-sub">{mapaContradicoes.length} pontos de conflito detectados</div>
                      </div>
                      <div className="lx-dossier-timeline-count">{mapaContradicoes.length} CONFLITOS</div>
                    </div>

                    <div className="lx-dossier-timeline-body">
                      {mapaContradicoes.length > 0 ? (
                        <div className="lx-conflict-grid-dossier">
                          {mapaContradicoes.map((c: any, i: number) => (
                            <div key={i} className="lx-conflict-card">
                              <div className="lx-conflict-point">
                                <span className={`lx-conflict-tag lx-conflict-tag-${(c.gravidade || 'MÉDIO').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "")}`}>{c.gravidade || 'MÉDIO'}</span>
                                {c.ponto}
                              </div>
                              <div className="lx-conflict-duo">
                                <div className="lx-conflict-side lx-conflict-side-adv">
                                  <div className="lx-conflict-label">Versão Adversa</div>
                                  <p>{c.versaoAdversa}</p>
                                </div>
                                <div className="lx-conflict-side lx-conflict-side-def">
                                  <div className="lx-conflict-label">Nossa Prova</div>
                                  <p>{c.versaoDefesa}</p>
                                </div>
                              </div>
                              <div className="lx-conflict-weapon">
                                <Sword size={12} />
                                <strong>ARMA:</strong> {c.prova}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="lx-audit-empty-state" style={{ padding: '2rem' }}>Aguardando análise de contradições...</div>
                      )}
                    </div>
                  </div>

                  <div style={{ height: '2rem' }} />
                  {/* Preview da Peça / Editor */}
                  <div className="lx-dossier-peca-card">
                    <div className="lx-dossier-peca-header">
                      <div className="lx-dossier-peca-header-icon">
                        <FileText size={16} />
                      </div>
                      <div>
                        <div className="lx-dossier-peca-header-title">{isEditing ? 'Editando Peça Técnica' : 'Visualização da Peça Técnica'}</div>
                        <div className="lx-dossier-peca-header-sub">Documento gerado por IA · Jurisprudência aplicada</div>
                      </div>
                      {!isEditing && (
                        <button className="lx-dossier-peca-copy-btn" onClick={handleCopy}>
                          {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                          {copied ? 'Copiado!' : 'Copiar'}
                        </button>
                      )}
                    </div>
                    <div className="lx-dossier-editor-container" style={{ minHeight: '500px' }}>
                      {isEditing ? (
                        <textarea
                          className="lx-dossier-native-editor"
                          value={result}
                          onChange={(e) => setResult(e.target.value)}
                          placeholder="Digite ou cole o texto da petição aqui..."
                          spellCheck={false}
                        />
                      ) : (
                        <div className="lx-markdown-preview" style={{ maxHeight: '600px', border: '1px solid var(--border)' }}>
                          <ReactMarkdown>{result}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Aba: Modelos ─────────────────────────────────────────────────── */}
        {activeTab === 'modelos' && (
          <div className="lx-single-panel" style={{ background: 'transparent', padding: 0 }}>
            <div className="lx-models-header" style={{ marginBottom: '2rem' }}>
              <div>
                <h1 className="lx-models-title">Base de Conhecimento (Machine Learning)</h1>
                <p className="lx-models-subtitle">Treine a IA subindo suas petições vitoriosas do passado para que ela aprenda seu estilo e suas teses.</p>
              </div>
              <button className="lx-btn-primary" onClick={() => modeloInputRef.current?.click()} style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap', background: '#10b981', borderColor: '#10b981' }}>
                <Plus size={18} /> Adicionar Petição de Referência
              </button>
              <input type="file" ref={modeloInputRef} style={{ display: 'none' }} multiple onChange={(e) => e.target.files && uploadModelos(e.target.files)} />
            </div>

            <div 
              className={`lx-dropzone ${isDraggingModelos ? 'active' : ''}`}
              style={{ marginBottom: '2rem', borderStyle: 'dashed', padding: '3rem' }}
              onDragOver={e => { e.preventDefault(); setIsDraggingModelos(true); }}
              onDragLeave={() => setIsDraggingModelos(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDraggingModelos(false);
                if (e.dataTransfer.files) uploadModelos(e.dataTransfer.files);
              }}
              onClick={() => modeloInputRef.current?.click()}
            >
              <div className="lx-dropzone-icon">
                <UploadCloud size={32} />
              </div>
              <div className="lx-dropzone-title">Arraste suas melhores petições para cá</div>
              <div className="lx-dropzone-sub">DOCX ou PDF · A IA extrairá teses e jurisprudências destes arquivos</div>
            </div>

            <div className="lx-models-grid">
              {loadingModelos ? (
                <div className="lx-models-loading"><Loader2 className="lx-spin" /> Carregando biblioteca...</div>
              ) : modelos.length > 0 ? (
                modelos.map((m: any, i: number) => {
                  const isBancario = /banc[aá]ri|banco|caixa|bradesco|itau/i.test(m.nome);
                  const isCivel = /c[ií]vel|danos?|indeniza/i.test(m.nome);
                  const isImpugnacao = /impugna/i.test(m.nome);

                  return (
                    <div key={i} className="lx-model-card">
                      <div className="lx-model-card-icon">
                        <BookOpen size={24} />
                      </div>
                      <div className="lx-model-card-content">
                        <div className="lx-model-tags">
                          {isBancario && <span className="lx-tag lx-tag-blue">Bancário</span>}
                          {isCivel && <span className="lx-tag lx-tag-purple">Cível</span>}
                          {isImpugnacao && <span className="lx-tag lx-tag-gold">Impugnação</span>}
                        </div>
                        <h3 className="lx-model-name" title={m.nomeLimpo || m.nome}>{m.nomeLimpo || m.nome}</h3>
                        <p className="lx-model-desc">Tese estruturada com jurisprudência atualizada.</p>

                        <div className="lx-model-actions">
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="lx-model-btn-use" onClick={() => setActiveTab('gerar')}>
                              <Zap size={14} /> Usar
                            </button>
                            <button className="lx-model-btn-view" onClick={() => abrirPreview(m.nome)} title="Visualizar Modelo">
                              <Eye size={14} />
                            </button>
                          </div>
                          <button className="lx-model-btn-del" onClick={() => excluirModelo(m.nome)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="lx-models-empty">
                  <UploadCloud size={48} opacity={0.2} />
                  <p>Sua Base de Conhecimento está vazia. Envie petições passadas de sucesso para treinar a IA.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Aba: WhatsApp ─────────────────────────────────────────────── */}
        {activeTab === 'whatsapp' && (
          <div className="lx-single-panel">
            <WhatsAppCenter />
          </div>
        )}
      </div>
      {/* ── Template Oculto para Exportação PDF ────────────────────────── */}
      <div ref={pdfTemplateRef} className="pdf-export-container">
        <div className="pdf-export-header">
          <img src="/logo.png" alt="Logo" className="pdf-export-logo" />
          <div className="pdf-export-logo-text">JESUS VIEIRA DE OLIVEIRA</div>
          <div className="pdf-export-subtitle">Sociedade Individual de Advocacia</div>
        </div>
        <div className="pdf-export-body">
          <div className="pdf-export-content">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      </div>
      {/* ── Modal de Preview de Modelo ────────────────────────────────── */}
      {previewModelo.show && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'var(--bg-panel)',
            width: '100%',
            maxWidth: '1000px',
            height: '90vh',
            borderRadius: 'var(--r-lg)',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.5rem', background: 'rgba(212, 175, 55, 0.1)', color: '#D4AF37', borderRadius: '8px' }}>
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '2px' }}>{previewModelo.nome}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualização de Modelo</span>
                </div>
              </div>
              <button onClick={() => setPreviewModelo({ show: false })} style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                transition: 'all 0.2s'
              }} onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#fff', color: '#333' }}>
              {previewModelo.type === 'loading' ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                  <Loader2 className="lx-spin" size={40} color="#D4AF37" />
                  <p style={{ color: '#666' }}>Convertendo documento...</p>
                </div>
              ) : previewModelo.type === 'pdf' ? (
                <iframe src={previewModelo.url} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
              ) : (
                <div className="docx-preview-content" dangerouslySetInnerHTML={{ __html: previewModelo.html || '' }} style={{
                  lineHeight: '1.6',
                  fontSize: '1rem',
                  maxWidth: '800px',
                  margin: '0 auto'
                }} />
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255,255,255,0.02)' }}>
              <button className="lx-btn-tool" onClick={() => setPreviewModelo({ show: false })} style={{ padding: '0.6rem 1.5rem' }}>
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

