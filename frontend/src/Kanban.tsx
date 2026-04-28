import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
const API = 'http://localhost:3001';

export default function Kanban() {
    const [petitions, setPetitions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/api/pieces`);
            const d = await r.json();
            if (d.success) setPetitions(d.petitions);
            else throw new Error(d.error);
        } catch (err: any) {
            setError('Erro ao carregar o workflow Kanban: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleChangeStatus = async (id: string, newStatus: string) => {
        try {
            const r = await fetch(`${API}/api/pieces/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            const d = await r.json();
            if (d.success) {
                setPetitions(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
            }
        } catch (e) {
            alert("Falha ao mudar status.");
        }
    };

    const StatusColumn = ({ status, title }: any) => {
        const filtered = petitions.filter(p => p.status === status);
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'var(--bg-panel)', padding: '1rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title} ({filtered.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', minHeight: '300px' }}>
                    {filtered.map(p => (
                        <div key={p.id} className="lx-card" style={{ padding: '1rem', cursor: 'pointer' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '0.3rem' }}>{p.lawsuit?.caseNumber || 'Sem Processo Vinculado'}</div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', lineHeight: 1.3 }}>{p.title || 'Petição Gerada pela IA'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Atualizado em: {new Date(p.updatedAt).toLocaleDateString('pt-BR')}</div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {status === 'RASCUNHO' && <button className="lx-btn-tool" style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => handleChangeStatus(p.id, 'REVISÃO')}>P/ Revisão →</button>}
                                {status === 'REVISÃO' && <button className="lx-btn-tool" style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => handleChangeStatus(p.id, 'PROTOCOLADO')}>P/ Protocolo →</button>}
                                {status === 'REVISÃO' && <button className="lx-btn-tool" style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => handleChangeStatus(p.id, 'RASCUNHO')}>← Voltar</button>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="lx-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh', border: 'none', background: 'transparent', padding: 0 }}>
            <div className="lx-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.4rem' }}>Workflow de Peças Jurídicas</h3>
                <button className="lx-btn-tool" onClick={fetchData}>
                    {loading ? <Loader2 size={16} className="lx-spin" /> : <RefreshCw size={16} />} Atualizar
                </button>
            </div>
            
            {error && <div className="lx-alert lx-alert-error"><AlertCircle size={15} />{error}</div>}

            <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                <StatusColumn status="RASCUNHO" title="Rascunho (IA)" />
                <StatusColumn status="REVISÃO" title="Revisão Humana" />
                <StatusColumn status="PROTOCOLADO" title="Protocolado" />
            </div>
        </div>
    );
}
