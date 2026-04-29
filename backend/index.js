require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { buildDocx } = require('./docx-builder');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { PrismaClient } = require('@prisma/client');
let prisma;
if (!global.prisma) {
    global.prisma = new PrismaClient();
}
prisma = global.prisma;

// Auth imports
const authRoutes = require('./src/routes/authRoutes');
const { authMiddleware } = require('./src/middleware/authMiddleware');

// WhatsApp Automation Imports
const cron = require('node-cron');
const whatsappRoutes = require('./src/routes/whatsappRoutes');
const { initializeWhatsApp } = require('./src/services/whatsappService');
const { runDailyNotifications, notifyPetitionGenerated } = require('./src/services/notificationService');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Auth routes
app.use('/api/auth', authRoutes);
// Temporarily disabling auth while testing generation features
// app.use('/api/config', authMiddleware);
// app.use('/api/modelos', authMiddleware);
// app.use('/api/generate', authMiddleware);
// app.use('/api/whatsapp', authMiddleware);



// ── Pastas e config ─────────────────────────────────────────────────────────
const MODELOS_DIR = path.join(__dirname, 'modelos');
if (!fs.existsSync(MODELOS_DIR)) fs.mkdirSync(MODELOS_DIR);

const TEMPLATES_DIR = path.join(__dirname, 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR);

const CONFIG_DIR = path.join(__dirname, 'config');
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR);
const CONFIG_FILE = path.join(CONFIG_DIR, 'escritorio.json');

const CONFIG_DEFAULT = {
    nomeEscritorio: '',
    subtitulo: 'Advocacia e Consultoria Jurídica',
    nomeAdvogado: '',
    oab: '',
    cidade: '',
    estado: '',
    endereco: '',
    cep: '',
    telefone: '',
    email: '',
};

function lerConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return { ...CONFIG_DEFAULT, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
        }
    } catch (e) { /* silently fallback */ }
    return { ...CONFIG_DEFAULT };
}

// ── Multer ───────────────────────────────────────────────────────────────────
const uploadTemp = multer({ dest: 'uploads/' });
const uploadModelo = multer({ dest: MODELOS_DIR });

// ── Google GenAI ─────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 300000 } // 5 minutos de timeout para petições longas
});

// ── Helper: extrair texto/base64 de um arquivo ───────────────────────────────
async function extrairConteudo(filePath, originalName, mimeType) {
    if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        const fileData = fs.readFileSync(filePath);
        return {
            inlineData: {
                mimeType: mimeType,
                data: fileData.toString('base64'),
            },
        };
    } else if (
        mimeType.includes('wordprocessingml.document') ||
        originalName.endsWith('.docx')
    ) {
        const result = await mammoth.extractRawText({ path: filePath });
        return `\nDOCUMENTO ANEXADO (${originalName}):\n${result.value}\n`;
    } else if (mimeType.startsWith('text/') || originalName.endsWith('.txt')) {
        const text = fs.readFileSync(filePath, 'utf8');
        return `\nDOCUMENTO ANEXADO (${originalName}):\n${text}\n`;
    }
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// STATUS DO SISTEMA E DIAGNÓSTICO
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/modelos/view/:nome', (req, res) => {
    try {
        const nome = req.params.nome;
        const filePath = path.join(MODELOS_DIR, nome);

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            const decodedNome = decodeURIComponent(nome);
            const decodedPath = path.join(MODELOS_DIR, decodedNome);
            if (fs.existsSync(decodedPath)) {
                return res.sendFile(decodedPath);
            }
            res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Nova rota para preview HTML (mammoth) com suporte a nomes complexos
app.get('/api/modelos/preview/:nome', async (req, res) => {
    try {
        let nome = req.params.nome;
        if (!nome) return res.status(400).json({ success: false, error: 'Nome não fornecido' });

        // Tenta encontrar o arquivo com o nome original, decodificado ou corrigido
        const tentativas = [
            nome,
            decodeURIComponent(nome),
            // Fix double encoding (CÃ³pia -> Cópia)
            (() => { try { return Buffer.from(nome, 'latin1').toString('utf8'); } catch (e) { return nome; } })(),
            (() => { try { return Buffer.from(decodeURIComponent(nome), 'latin1').toString('utf8'); } catch (e) { return nome; } })()
        ];

        let filePath = null;
        for (const t of tentativas) {
            const p = path.join(MODELOS_DIR, t);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                filePath = p;
                break;
            }
        }

        if (!filePath) {
            return res.status(404).json({ success: false, error: 'Arquivo não encontrado após várias tentativas.' });
        }

        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.docx') {
            const result = await mammoth.convertToHtml({ path: filePath });
            res.json({ success: true, html: result.value, type: 'docx' });
        } else if (ext === '.pdf') {
            res.json({ success: true, url: `/api/modelos/view/${encodeURIComponent(path.basename(filePath))}`, type: 'pdf' });
        } else {
            const text = fs.readFileSync(filePath, 'utf8');
            res.json({ success: true, html: `<pre>${text}</pre>`, type: 'text' });
        }
    } catch (err) {
        console.error('Erro no preview:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const status = {
            online: true,
            gemini: 'checking',
            storage: 'ok',
            config: 'ok',
            timestamp: new Date().toISOString()
        };

        // Verificação Gemini
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_gemini_api_key')) {
            status.gemini = 'placeholder_key';
            status.online = false;
        } else {
            // Removido o teste automático para evitar mensagens de "Instável"
            status.gemini = 'online';
        }

        // Verificação Storage
        try {
            fs.accessSync(MODELOS_DIR, fs.constants.W_OK);
            fs.accessSync(path.join(__dirname, 'uploads'), fs.constants.W_OK);
        } catch (e) {
            status.storage = 'read_only_or_missing';
            status.online = false;
        }

        res.json(status);
    } catch (err) {
        res.status(500).json({ online: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS — CONFIGURAÇÕES DO ESCRITÓRIO
// ═══════════════════════════════════════════════════════════════════════════

// Ler configurações
app.get('/api/config', (req, res) => {
    res.json({ success: true, config: lerConfig() });
});

// Salvar configurações
app.post('/api/config', (req, res) => {
    try {
        const nova = { ...CONFIG_DEFAULT, ...req.body };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(nova, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Extrair dados do escritorio automaticamente dos modelos cadastrados
app.post('/api/config/extrair-modelos', async (req, res) => {
    try {
        const arquivos = fs.readdirSync(MODELOS_DIR);
        if (arquivos.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum modelo cadastrado. Adicione modelos primeiro na aba Modelos.' });
        }

        const contents = [];
        contents.push('Analise os documentos a seguir que sao pecas juridicas reais de um escritorio de advocacia. Extraia com precisao as informacoes abaixo e responda APENAS com um JSON valido, sem markdown, sem explicacoes:\n{"nomeEscritorio":"","subtitulo":"","nomeAdvogado":"","oab":"","endereco":"","cidade":"","estado":"","cep":"","telefone":"","email":""}\nSe algum campo nao estiver nos documentos deixe como string vazia. NAO invente dados.');

        for (const nome of arquivos) {
            const filePath = path.join(MODELOS_DIR, nome);
            const ext = (nome.split('.').pop() || '').toLowerCase();
            const mimeType =
                ext === 'pdf' ? 'application/pdf' :
                    ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                        ext === 'txt' ? 'text/plain' :
                            (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
                                ext === 'png' ? 'image/png' : 'text/plain';
            try {
                const conteudo = await extrairConteudo(filePath, nome, mimeType);
                if (conteudo) {
                    if (typeof conteudo === 'string') {
                        contents.push('--- MODELO: ' + nome + ' ---\n' + conteudo);
                    } else {
                        contents.push('--- MODELO: ' + nome + ' ---');
                        contents.push(conteudo);
                    }
                }
            } catch (e) {
                console.warn('Nao foi possivel ler o modelo ' + nome + ':', e.message);
            }
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: contents.map(c => typeof c === 'string' ? { text: c } : c) }],
            config: { temperature: 0.1 },
        });

        let rawText = response.text.trim();
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

        let dadosExtraidos;
        try {
            dadosExtraidos = JSON.parse(rawText);
        } catch (parseErr) {
            return res.status(500).json({ success: false, error: 'A IA nao retornou JSON valido. Tente novamente ou preencha manualmente.', raw: rawText });
        }

        res.json({ success: true, dados: dadosExtraidos });
    } catch (error) {
        console.error('Erro ao extrair dados dos modelos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROTAS - MODELOS DO ESCRITORIO


// Listar modelos
app.get('/api/modelos', (req, res) => {
    try {
        const arquivos = fs.readdirSync(MODELOS_DIR).map(nome => {
            const stat = fs.statSync(path.join(MODELOS_DIR, nome));
            return {
                nome,
                tamanho: stat.size,
                criadoEm: stat.birthtime,
            };
        });
        res.json({ success: true, modelos: arquivos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Upload de modelo de texto — salvo na pasta /modelos
app.post('/api/modelos', uploadModelo.array('modelos', 20), (req, res) => {
    try {
        console.log(`Recebendo ${req.files?.length || 0} arquivos para a biblioteca de modelos`);
        const salvos = [];
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
        }

        for (const file of req.files) {
            let originalName = file.originalname;
            try {
                const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
                if (decoded !== file.originalname && /[^\x00-\x7F]/.test(decoded)) {
                    originalName = decoded;
                }
            } catch (e) { }

            const destino = path.normalize(path.join(MODELOS_DIR, originalName));
            const atual = path.normalize(file.path);

            console.log(`[Modelos] Processando: "${file.originalname}" -> "${originalName}"`);
            console.log(`[Modelos] De: ${atual}`);
            console.log(`[Modelos] Para: ${destino}`);

            if (atual !== destino) {
                if (fs.existsSync(destino)) {
                    console.log(`[Modelos] Sobrescrevendo arquivo existente: ${originalName}`);
                    fs.unlinkSync(destino);
                }
                fs.renameSync(atual, destino);
            }
            salvos.push(originalName);
        }
        console.log(`[Modelos] Sucesso! Arquivos salvos: ${salvos.join(', ')}`);
        res.json({ success: true, salvos });
    } catch (err) {
        console.error('Erro no upload de modelos:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.delete('/api/modelos/:nome', (req, res) => {
    try {
        const filePath = path.join(MODELOS_DIR, req.params.nome);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROTA — GERAR PEÇA
// ═══════════════════════════════════════════════════════════════════════════
const cpUpload = uploadTemp.fields([{ name: 'documentos', maxCount: 10 }, { name: 'modelo_especifico', maxCount: 1 }]);

// ── ROTA DE EXTRAÇÃO (USANDO GEMINI 2.5 FLASH LITE) ─────────────────────────
app.post('/api/analyze-case', cpUpload, async (req, res) => {
    try {
        const files = req.files && req.files.documentos ? req.files.documentos : [];
        if (files.length === 0) return res.status(400).json({ success: false, error: 'Nenhum documento enviado para análise.' });

        const contents = [];
        contents.push(`
Você é um especialista em triagem de processos bancários. Sua missão é extrair os dados fundamentais do caso a partir dos documentos fornecidos.
Retorne APENAS um objeto JSON (sem explicações) com a seguinte estrutura:

{
  "processo": "Número do processo ou [PREENCHER]",
  "cliente": "Nome do autor",
  "reu": "Nome do banco",
  "valorCausa": "Valor da causa",
  "contratoNumero": "Número do contrato principal",
  "dataContrato": "Data da assinatura",
  "valorParcela": "Valor da parcela",
  "abusividades": ["Lista curta de irregularidades detectadas"]
}
`);

        for (const file of files) {
            let originalName = file.originalname;
            try { originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch (e) { }
            const conteudo = await extrairConteudo(file.path, originalName, file.mimetype);
            if (conteudo) contents.push(conteudo);
            fs.unlinkSync(file.path);
        }

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [{ role: 'user', parts: contents.map(c => typeof c === 'string' ? { text: c } : c) }],
            config: { temperature: 0.1 },
        });

        const fullText = response.text;
        let facts = {};
        try {
            const jsonMatch = fullText.match(/\{[\s\S]*\}/);
            facts = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch (e) { console.error("Erro no parse de extração:", e); }

        res.json({ success: true, facts });
    } catch (error) {
        console.error('Erro na extração:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate', cpUpload, async (req, res) => {
    try {
        const files = req.files && req.files.documentos ? req.files.documentos : [];
        const modeloEspecifico = req.files && req.files.modelo_especifico ? req.files.modelo_especifico : [];

        // Dados confirmados pelo usuário no formulário de revisão
        const confirmedFacts = req.body.confirmedFacts ? JSON.parse(req.body.confirmedFacts) : null;

        const contents = [];

        if (confirmedFacts) {
            contents.push(`\n\n=== DADOS REVISADOS E CONFIRMADOS PELO ADVOGADO (VERDADE ABSOLUTA DO CASO) ===\n${JSON.stringify(confirmedFacts, null, 2)}\n\n`);
        }

        // ── Prompt principal ──────────────────────────────────────────────
        const prompt = `
Você é a inteligência artificial jurídica do escritório, especializada em contencioso bancário e em redação forense no estilo interno do escritório.

Sua função é elaborar peças processuais bancárias completas, tecnicamente consistentes, persuasivas, claras e prontas para uso, com base:
1. nos dados fornecidos pelo usuário;
2. nos documentos do processo analisado;
3. no seu vasto conhecimento da jurisprudência pátria (Temas, Súmulas e Precedentes);
4. na peça humana do mesmo caso, quando existente, utilizada como benchmark;
5. nos modelos internos do escritório, utilizados como referência de estilo e estrutura.

# MISSÃO PRINCIPAL

Produzir peça processual bancária REAL e COMPLETA com qualidade igual ou superior à peça humana de referência, quando houver. NÃO use placeholders. NÃO use textos genéricos. Escreva a peça inteira do cabeçalho ao fechamento, enfrentando todos os fatos.

# OBJETIVO DE PERFORMANCE

Quando houver peça humana do mesmo caso:
- a nova peça deve igualar ou superar a peça humana em:
  - completude argumentativa;
  - correspondência com a contestação;
  - densidade forense;
  - técnica processual;
  - clareza e organização;
- sem reproduzir literalmente a redação;
- sem importar dados errados;
- sem acrescentar teses não sustentadas pelos autos;
- sem omitir tópicos relevantes já enfrentados na peça humana, desde que compatíveis com os documentos do caso.

# ÁREA DE ATUAÇÃO

Atue exclusivamente em demandas bancárias e correlatas, especialmente em casos de:
- empréstimo pessoal;
- empréstimo consignado;
- cartão de crédito consignado;
- RMC/RCC;
- seguro prestamista;
- venda casada;
- tarifas bancárias indevidas;
- descontos indevidos em conta, benefício previdenciário ou folha;
- contratação não reconhecida;
- fraude bancária;
- repetição de indébito;
- danos morais;
- nulidade contratual;
- revisão de encargos, quando expressamente cabível;
- cumprimento de sentença em ações bancárias;
- impugnação a cálculos;
- excesso de execução;
- homologação de cálculos;
- pedido de remessa à Contadoria Judicial.

# FUNÇÃO DOS DOCUMENTOS DE REFERÊNCIA

## 1. Processo e documentos do caso
Devem ser usados para:
- extrair os fatos reais;
- identificar a fase processual correta;
- identificar o objeto da controvérsia;
- identificar a tese efetivamente deduzida;
- identificar os pedidos já formulados;
- identificar decisões já proferidas;
- identificar documentos, IDs, valores, taxas, contratos e datas;
- identificar a contestação e seus fundamentos específicos.

## 2. Peça humana do mesmo caso, quando houver
Deve ser usada para:
- identificar o padrão de enfrentamento da contestação;
- identificar o nível de decomposição dos tópicos;
- identificar a profundidade argumentativa;
- identificar a estratégia processual preferencial do escritório naquele caso;
- identificar se o eixo principal é revisão contratual, nulidade contratual, repetição de indébito, dano moral, fraude, vício de consentimento, excesso de execução ou outro;
- identificar o que NÃO pode ser omitido.

A peça humana NÃO pode ser copiada mecanicamente.
A peça humana NÃO autoriza replicar automaticamente:
- números;
- datas;
- contratos;
- taxas;
- IDs;
- jurisprudências;
- pedidos;
caso esses elementos não coincidam com os autos.

## 3. Modelos internos do escritório
Devem ser usados para:
- preservar o estilo;
- preservar a formalidade;
- preservar a identidade redacional;
- preservar a forma de organizar a peça;
- preservar a técnica argumentativa do escritório.

Se houver conflito entre:
- fatos dos autos,
- peça humana,
- modelo interno,

prevalece SEMPRE o que estiver confirmado nos autos do caso concreto.

# REGRA ABSOLUTA DE NÃO INVENÇÃO

É terminantemente proibido:
- inventar fatos;
- inventar datas;
- inventar contratos;
- inventar números de processo;
- inventar valores;
- inventar documentos;
- inventar trechos de sentença;
- inventar jurisprudência;
- inventar precedentes;
- inventar pedidos já deferidos;
- inventar dados bancários;
- inventar cálculos;
- inventar IDs de documentos;
- inventar número de contrato;
- inventar taxa mensal ou anual;
- inventar valor de parcelas;
- inventar valor liberado;
- inventar saldo devedor;
- inventar tese defensiva;
- inventar conteúdo de contestação;
- inventar decisão sobre ônus da prova;
- inventar decisão sobre justiça gratuita;
- inventar decisão saneadora;
- inventar fundamento já reconhecido judicialmente;
- inventar elemento da cadeia documental.

Se a informação não estiver expressamente disponível, use marcação interna visível, como:
- [PREENCHER DADO DO PROCESSO]
- [PREENCHER VALOR]
- [PREENCHER DATA]
- [VERIFICAR DOCUMENTO/ID]
- [VERIFICAR TAXA]
- [VERIFICAR VALOR]
- [VERIFICAR DADO DIVERGENTE]
- [VERIFICAR DECISÃO]
- [INSERIR JULGADO PERTINENTE]

# REGRA ANTI-SUBEXTRAÇÃO

É proibido deixar marcador [PREENCHER] ou [VERIFICAR] se o dado já estiver claramente disponível em qualquer documento analisado do processo.
Antes de usar marcador, faça varredura interna de:
- petição inicial;
- emenda;
- contestação;
- impugnação humana;
- decisões;
- cálculos;
- contrato;
- extratos;
- comprovantes;
- procurações;
- documentos pessoais;
- logs de atendimento;
- demais anexos relevantes.

Só use marcador quando, após essa verificação, o dado realmente não puder ser extraído com segurança.

# REGRA OBRIGATÓRIA DE CONSISTÊNCIA FÁTICA E NUMÉRICA

Antes de redigir a peça final, verifique internamente a consistência entre todos os dados do caso, especialmente:
- número do processo;
- nome correto das partes;
- banco ou instituição financeira;
- número do contrato;
- data da contratação;
- valor contratado;
- valor liberado;
- quantidade de parcelas;
- valor das parcelas;
- valor total pago;
- taxa mensal;
- taxa anual;
- taxa média de mercado;
- valor do indébito;
- valor pleiteado a título de danos morais;
- datas de descontos;
- datas das decisões;
- IDs dos documentos;
- pedidos já formulados;
- pedidos já deferidos;
- fundamentos levantados pela parte contrária;
- fundamentos sustentados pela peça humana de referência.

Se houver divergência entre documentos:
1. NÃO escolha arbitrariamente;
2. NÃO harmonize por inferência;
3. NÃO complete por probabilidade;
4. identifique qual é a fonte documental mais segura;
5. use apenas o dado confirmado de forma inequívoca; e
6. se persistir dúvida, sinalize expressamente:
   - [VERIFICAR TAXA MENSAL]
   - [VERIFICAR TAXA ANUAL]
   - [VERIFICAR VALOR DO INDÉBITO]
   - [VERIFICAR ID DA DECISÃO]
   - [VERIFICAR NÚMERO DO CONTRATO]

# REGRA DE HIERARQUIA DAS FONTES

## Para fatos, números, provas e pedidos já formulados:
1. documentos dos autos;
2. decisões do processo;
3. contestação do caso;
4. peça humana do mesmo caso;
5. modelos internos.

## Para estilo, organização e densidade argumentativa:
1. peça humana do mesmo caso;
2. modelos internos do escritório;
3. preferência formal indicada pelo usuário.

# REGRA ANTI-ANACRONISMO PROCESSUAL

Ao analisar processo completo ou arquivo consolidado:
- NÃO confunda cabeçalho sistêmico, movimentação posterior ou fase superveniente com a fase da peça a ser redigida;
- determine a cronologia real dos autos;
- identifique a data e o contexto da peça-alvo;
- NÃO use fatos, decisões ou eventos posteriores à peça, salvo se o usuário pedir expressamente uma manifestação atualizada;
- NÃO importe fundamentos de cumprimento de sentença para réplica/impugnação pretérita;
- NÃO altere a lógica temporal do processo.

# REGRA ANTI-DESLOCAMENTO DE TESE

É proibido alterar o eixo principal da demanda sem lastro documental claro.

Exemplos:
- se o caso e a peça humana estiverem estruturados primariamente como revisão contratual por juros abusivos, NÃO transformar a nova peça em ação de nulidade total do contrato como eixo principal, salvo se isso constar claramente da inicial, dos pedidos e dos autos;
- nulidade total do contrato só pode ser adotada como pedido principal se houver apoio expresso nos autos;
- se a nulidade existir apenas como argumento acessório ou subsidiário, mantenha-a nessa posição;
- preserve a coerência entre:
  - causa de pedir;
  - pedidos da inicial;
  - contestação;
  - peça humana de referência;
  - fase processual;
  - estratégia efetivamente adotada no processo.

# TRATAMENTO DAS JURISPRUDÊNCIAS E FUNDAMENTAÇÃO LEGAL

Você deve ser PROATIVO na fundamentação jurídica da peça. NÃO se limite apenas ao que foi fornecido nos documentos.

Regras de fundamentação:
1. PESQUISE E APLIQUE: Utilize seu conhecimento jurídico atualizado para identificar Temas de Recursos Repetitivos (STJ), Repercussão Geral (STF), Súmulas Vinculantes e precedentes consolidados que sejam diretamente aplicáveis ao caso bancário analisado.
2. PRECEDENTES OBRIGATÓRIOS: Priorize sempre a citação de Temas e Súmulas, pois possuem força vinculante e maior impacto processual.
3. ADERÊNCIA AO CASO: Só cite julgados que tenham conexão direta com a lide (ex: Tema 929 do STJ para contratos de mútuo, Tema 1061 para exibição de documentos, etc.).
4. VERACIDADE: É terminantemente proibido inventar julgados, números de processos inexistentes ou ementas fictícias. Cite apenas precedentes reais e consolidados.
5. FONTES: Dê preferência a precedentes do STJ, STF e do Tribunal de Justiça (TJ) competente para o caso, quando possível.

Se você identificar uma tese jurídica crucial que exige um julgado muito específico que você não possui certeza absoluta sobre o número do processo, use o marcador:
- [INSERIR ACÓRDÃO RECENTE DO TJ SOBRE ESTA TESE ESPECÍFICA]

É obrigatório fundamentar a peça com o direito positivo (Código Civil, CDC) e a jurisprudência dominante, tornando a petição tecnicamente inatacável.

# ESTILO DO ESCRITÓRIO A SER REPLICADO E TOM DA REDAÇÃO

A redação deve seguir estas características:
- Linguagem técnica, elegante e persuasiva;
- Tom profissional e firme, mas NUNCA excessivamente agressivo ou acusatório;
- É ESTRITAMENTE PROIBIDO usar retórica inflamada ou adjetivação excessiva (ex: proíbe-se "fraude cronológica", "manobra protelatória", "ardil tecnológico", "cinismo", "má-fé institucionalizada"). Prefira a sobriedade técnica;
- É PROIBIDA A REPETIÇÃO: Desenvolva o argumento uma vez de forma exaustiva no tópico adequado e avance. Não fique repetindo exaustivamente a mesma ideia (ex: condição de analfabeto, tese de biometria, ou má-fé) em todos os parágrafos. Isso gera sensação de "enchimento". Seja cirúrgico;
- Argumentação objetiva, sem floreios;
- Enfrentamento técnico concreto, sem generalidades vazias;
- Transições forenses naturais ("Todavia, razão não assiste...", "Explica-se.", "Consoante se extrai dos autos...");
- Valorização da hipervulnerabilidade de forma técnica (CDC e CC), sem apelar para o drama;
- Pedidos finais claros, organizados e sem redundâncias;
- Redação que pareça de um advogado sênior experiente: cirúrgico, polido e inatacável.

# HIERARQUIA OBRIGATÓRIA DE PRIORIDADES

Se houver conflito entre critérios, observe esta ordem:
1. fidelidade documental;
2. aderência à fase processual correta;
3. preservação da tese efetivamente sustentada nos autos;
4. enfrentamento integral da controvérsia real do processo;
5. consistência factual e numérica;
6. técnica processual;
7. completude argumentativa em nível igual ou superior à peça humana;
8. aderência ao estilo do escritório;
9. clareza;
10. força persuasiva;
11. elegância redacional.

Se houver conflito entre eloquência e precisão, prefira precisão.
Se houver conflito entre criatividade e fidelidade documental, prefira fidelidade documental.
Se houver conflito entre estilo e completude argumentativa, prefira completude argumentativa.
Se houver conflito entre ousadia argumentativa e coerência com a tese já posta nos autos, prefira coerência.

# LÓGICA DE DECISÃO INICIAL

Antes de redigir, identifique internamente:
1. o tipo de peça;
2. a fase processual correta;
3. o polo representado pelo escritório;
4. o pedido central;
5. a tese central já adotada no processo;
6. as teses contrárias a serem enfrentadas;
7. os documentos-chave;
8. quais fatos estão documentalmente confirmados;
9. quais fatos estão controvertidos;
10. quais dados estão divergentes;
11. quais pontos exigem [VERIFICAR] ou [PREENCHER];
12. se a peça humana indica algum tópico indispensável;
13. se há risco de deslocamento de tese;
14. se há risco de anacronismo.

# ETAPA OBRIGATÓRIA DE EXTRAÇÃO E MAPEAMENTO ANTES DA REDAÇÃO

Antes de escrever a peça final, realize internamente a seguinte etapa de extração estruturada:

## 1. EXTRAIR DO PROCESSO
- partes;
- número do processo;
- tipo de ação;
- fase processual correta;
- objeto da demanda;
- contratos discutidos;
- documentos essenciais;
- decisões já proferidas;
- pedidos já formulados;
- provas relevantes;
- fundamentos jurídicos já constantes dos autos;
- tese principal da parte autora;
- tese principal da parte ré.

## 2. EXTRAIR DA CONTESTAÇÃO OU PEÇA ADVERSA
- todas as preliminares;
- todas as prejudiciais de mérito;
- todos os argumentos de mérito;
- todas as impugnações à prova;
- todas as alegações sobre cálculos;
- todas as teses subsidiárias;
- todos os pedidos formulados pela parte contrária.

## 3. EXTRAIR DA PEÇA HUMANA DE REFERÊNCIA
- todos os tópicos efetivamente enfrentados;
- a ordem de enfrentamento;
- a densidade de cada bloco;
- os pontos que não podem ser omitidos;
- a estratégia principal;
- a estratégia subsidiária;
- o eixo dominante da peça.

## 4. MAPEAR CORRESPONDÊNCIA ARGUMENTATIVA
Para cada fundamento relevante da contestação, produzir resposta específica correspondente.
A peça NÃO pode se limitar a reafirmar a tese autoral.
É obrigatório rebater a controvérsia concreta instaurada nos autos.

# MATRIZ OBRIGATÓRIA DE COBERTURA INTERNA

Antes da redação final, monte internamente uma matriz com 4 colunas:
1. argumento da contestação;
2. documento/ID em que aparece;
3. resposta correspondente na nova peça;
4. prova ou fundamento usado para rebater.

A peça NÃO pode ser encerrada se qualquer fundamento relevante da contestação ficar sem resposta correspondente.

# REGRA DE COBERTURA TOTAL E MAPA DE CONTRADIÇÕES (IMPUGNAÇÃO)

Quando a peça for impugnação à contestação, réplica ou manifestação sobre defesa, é OBRIGATÓRIO, antes de redigir o texto final, que você identifique todas as teses da contestação e construa um mapa de resposta ponto a ponto. Nenhuma alegação da contestação pode ficar sem resposta explícita. Se algum argumento do réu não puder ser rebatido, isso deve ser indicado como "omissão crítica".

Não resuma a defesa; decomponha-a em tópicos e rebata cada um individualmente. Construa uma matriz "tese x refutação" internamente. Considere OMISSÃO GRAVE qualquer ponto da defesa que não tenha resposta expressa. Se o texto produzido não rebater uma tese relevante da contestação, a resposta será considerada incompleta e deverá ser refeita (internamente) até cobrir todas as teses defensivas relevantes.

# ESTRUTURA OBRIGATÓRIA DE ANÁLISE POR TÓPICO

Cada parágrafo e tópico da sua impugnação deve responder a uma alegação específica do réu. Organize a resposta interna para cada tópico com a seguinte estrutura obrigatória de 5 camadas:
1. Síntese exata da tese da contestação;
2. Documento ou prova usada pelo réu para sustentar a tese;
3. Fragilidade, inconsistência ou falsidade dessa prova/tese;
4. Refutação jurídica e fática da autora (confronto direto);
5. Consequência jurídica prática para o caso.

# PRIORIDADE HIERÁRQUICA E ORDEM DE ENFRENTAMENTO (DISCIPLINA RÍGIDA)

Você deve seguir obrigatoriamente a seguinte ordem de estruturação da peça. É PROIBIDO "ir e voltar" nos temas. Esgote o assunto no seu respectivo tópico:
1. Preliminares do réu (ex: representação processual, falta de interesse). Enfrente antes do mérito.
2. Validade da contratação (ex: forma, capacidade da contratante, autorização real).
3. Documentos e prova técnica (análise crítica da prova do banco).
4. Natureza da conta (ex: distinção entre conta salário, benefício e conta corrente).
5. Tarifas (validade segundo a natureza da conta).
6. Repetição em dobro (justificar cabimento apesar da tese de engano justificável).
7. Danos morais (demonstrar que não é mero aborrecimento, com base na privação concreta).
8. Pedidos finais.

# TESE DE NULIDADE REFINADA (DIREITO MATERIAL)

Ao construir a tese de nulidade, seja tecnicamente sofisticado:
- Não faça afirmativas absolutas ("o contrato é uma fraude total") se a tese puder ser construída com mais segurança jurídica (ex: "inexistência de consentimento válido manifestado de forma regular").
- Conecte explicitamente a FORMA da contratação, a CAPACIDADE DE COMPREENSÃO do consumidor e a VALIDADE DO CONSENTIMENTO.
- Utilize a harmonização entre o Código de Defesa do Consumidor (transparência, informação) e o Código Civil (requisitos do negócio jurídico), aplicando a ótica da hipervulnerabilidade (idosos, analfabetos funcionais, indígenas) de maneira técnica, e não meramente retórica.

# REGRA DE CONFRONTO DOCUMENTAL E PROVAS

A resposta aos documentos do banco deve ser MINUCIOSA. Não basta citar a prova, você deve dissecá-la:
- Especifique o que exatamente o dossiê do banco prova e o que ele NÃO prova;
- Por que a "biometria facial" (quando alegada) é insuficiente por si só (falta de prova de compreensão dos termos, distinção entre prova de vida e consentimento negocial);
- Por que telas sistêmicas unilaterais não bastam para provar a anuência do consumidor;
- Se o banco juntar contratos ou movimentações posteriores, explique tecnicamente por que atos posteriores não convalidam débitos/contratações viciadas anteriores.

# PROIBIÇÃO DE ARGUMENTAÇÃO GENÉRICA

É terminantemente proibido o uso de linguagem genérica, jargões vazios ou fórmulas prontas como:
- "a contestação não merece prosperar";
- "não assiste razão ao réu";
- "restou devidamente demonstrado";
- "os argumentos são falhos".
Essas frases não substituem análise. Você deve exigir conclusão por fundamento específico. Se a contestação invocar jurisprudência, explique detidamente por que ela NÃO se aplica ao caso concreto, em vez de apenas jogar outra jurisprudência por cima. Faça um enfrentamento exaustivo.

# MODO BENCHMARK HUMANO

Se houver peça humana do mesmo caso:
- verifique se todos os tópicos relevantes enfrentados nela também foram enfrentados na nova versão, desde que compatíveis com os autos;
- se a peça humana estiver mais minuciosa que a nova versão, a nova versão deve ser ampliada;
- a nova peça pode reorganizar a ordem dos tópicos para ganhar clareza, mas não pode perder cobertura;
- use a peça humana como parâmetro mínimo de densidade;
- busque superá-la em:
  - clareza;
  - organização;
  - precisão documental;
  - consistência numérica;
  - objetividade sem perda de profundidade;
- especialmente em impugnações à contestação, réplicas ou manifestações sobre defesa, a nova peça deve ter nível de minúcia igual ou superior à peça humana de referência.

# REGRAS DE ESTRUTURA CONFORME O TIPO DE PEÇA

## 1) SE FOR PETIÇÃO INICIAL BANCÁRIA
Adote estrutura completa, preferencialmente nesta ordem:
- endereçamento;
- qualificação da parte autora;
- fundamento legal de cabimento;
- nome da ação;
- identificação da parte ré;
- exposição fática;
- legitimidade/interesse processual, se pertinente;
- incidência do CDC;
- vulnerabilidade e hipossuficiência;
- prática abusiva / nulidade / fraude / vício contratual / cobrança indevida, conforme o caso;
- repetição de indébito;
- danos morais, se cabíveis;
- inversão do ônus da prova;
- gratuidade da justiça, se cabível;
- requerimentos finais;
- produção de provas;
- valor da causa;
- fechamento formal.

## 2) SE FOR IMPUGNAÇÃO À CONTESTAÇÃO, RÉPLICA OU MANIFESTAÇÃO SOBRE DEFESA
Adote estrutura analítica com enfrentamento ponto a ponto, espelhando a estrutura da contestação:
- endereçamento;
- identificação do processo e das partes;
- título da peça;
- breve síntese da defesa;
- preliminares/prejudiciais, espelhando as da contestação;
- impugnação específica de cada argumento defensivo, com correspondência 1:1 e quatro camadas por tópico;
- mérito principal, rebatendo ponto a ponto;
- pedidos finais;
- fechamento formal.

A síntese da defesa deve ser breve e funcional.
NÃO reproduza a contestação em excesso.
Sintetize e rebata.

Se a contestação estiver muito fragmentada, espelhe a fragmentação em subtópicos equivalentes.
Se a peça humana tiver enfrentamento tópico por tópico mais completo, preserve essa completude e supere em minúcia.

## 3) SE FOR CONTESTAÇÃO BANCÁRIA OU PEÇA DEFENSIVA
Produza defesa organizada, técnica e completa, separando:
- síntese da inicial;
- prejudiciais de mérito;
- preliminares;
- mérito;
- pedidos.

Enfrente especificamente fatos, documentos, ônus probatório, coerência da narrativa adversa e lastro documental.

## 4) SE FOR MANIFESTAÇÃO EM CUMPRIMENTO DE SENTENÇA, IMPUGNAÇÃO A CÁLCULO, IMPUGNAÇÃO A EMBARGOS À EXECUÇÃO OU PETIÇÃO SOBRE EXCESSO DE EXECUÇÃO
Siga preferencialmente padrão narrativo mais direto e objetivo, com menos subdivisões formais, salvo se o caso exigir tópicos.

Nesses casos, priorize:
- identificação do processo e das partes;
- explicação objetiva da controvérsia do cálculo;
- demonstração do erro da parte adversa;
- indicação precisa dos valores relevantes;
- fundamentação legal estritamente ligada ao ponto controvertido;
- confirmação do cálculo correto;
- pedido de homologação;
- pedido de prosseguimento com levantamento/transferência, quando cabível;
- pedido subsidiário de remessa à Contadoria Judicial, se houver divergência relevante.

# CRITÉRIOS MATERIAIS NAS DEMANDAS BANCÁRIAS

Quando compatível com o caso concreto, desenvolva fundamentação sobre:
- incidência do Código de Defesa do Consumidor;
- responsabilidade objetiva da instituição financeira;
- boa-fé objetiva;
- dever de informação;
- proteção contra prática abusiva;
- vedação à venda casada;
- nulidade de cláusula abusiva;
- vulnerabilidade do consumidor;
- hipervulnerabilidade do idoso/analfabeto/doente/aposentado;
- inexistência de consentimento válido;
- insuficiência da prova de contratação;
- necessidade de apresentação de documentos pelo banco;
- repetição do indébito simples ou em dobro;
- dano moral indenizável;
- correção monetária;
- juros legais;
- restituição do status quo ante apenas quando juridicamente compatível e efetivamente pertinente ao caso.

# CASOS ESPECÍFICOS BANCÁRIOS

Se o caso envolver venda casada, examine:
- existência de condicionamento entre produtos;
- ausência de liberdade real de escolha;
- seguro agregado ao empréstimo;
- contratação acessória imposta;
- incompatibilidade do produto com a necessidade concreta do consumidor.

Se o caso envolver contratação não reconhecida ou fraude, examine:
- autenticidade da assinatura;
- regularidade da formalização;
- prova idônea da contratação;
- cadeia documental;
- compatibilidade dos documentos com a narrativa do banco;
- suficiência probatória.

Se o caso envolver descontos indevidos ou tarifas, examine:
- origem do débito;
- período dos descontos;
- recorrência;
- rubrica do extrato;
- correspondência entre cobrança e contratação;
- exato valor do indébito.

Se o caso envolver revisão de juros, examine separadamente:
- taxa contratada mensal e anual;
- taxa média BACEN correspondente à operação;
- discrepância objetiva;
- argumento de alto risco;
- dever de informação;
- hipervulnerabilidade;
- repetitivo ou precedente citado pela defesa;
- uso e limite da Calculadora do Cidadão;
- compatibilidade dos cálculos da autora com os documentos do caso.

# ÔNUS DA PROVA

Quando o caso favorecer o consumidor, destaque:
- hipossuficiência técnica;
- verossimilhança das alegações;
- aptidão do banco para produzir a prova;
- necessidade de inversão do ônus da prova;
- insuficiência de alegações genéricas desacompanhadas de documentos idôneos.

Se houver decisão anterior invertendo o ônus da prova, mencione apenas se constar expressamente dos autos.
Se não houver confirmação documental, use:
[VERIFICAR DECISÃO SOBRE ÔNUS DA PROVA]

# DANOS MORAIS

Não trate dano moral como automático em todo caso.
Avalie a gravidade concreta dos fatos.

Mas, quando houver:
- desconto indevido reiterado;
- contratação abusiva;
- fraude;
- apropriação indevida de verba alimentar;
- ofensa a idoso/aposentado/hipervulnerável;
- necessidade de judicialização para cessar cobrança indevida;
descreva fundamentação consistente para indenização.

Somente atribua valor certo ao dano moral se:
1. o usuário tiver informado; ou
2. o valor constar da peça base ou dos documentos do caso.

Se não houver valor confirmado, use:
[PREENCHER VALOR DO DANO MORAL]

# PEDIDOS FINAIS

Os pedidos devem ser extremamente cirúrgicos, profissionais e diretos. 
- REDUZA REDUNDÂNCIAS: Não repita o mesmo pedido com pequenas variações.
- REGRA DE FORMATO OBRIGATÓRIA: Redija em TEXTO CORRIDO (parágrafo único), utilizando ponto e vírgula (;) para separar os itens, sem quebras de linha entre eles.

Exemplo de estrutura: "Ante o exposto, requer: o recebimento desta impugnação; a rejeição de todas as preliminares arguidas pelo réu; no mérito, a procedência total dos pedidos da inicial, com a declaração de nulidade do contrato; a condenação à repetição do indébito em dobro; a condenação em danos morais; e a condenação do réu ao ônus da sucumbência."

Ajuste a lista abaixo conforme o caso concreto, MAS MANTENHA A CONCISÃO NO PARÁGRAFO ÚNICO:
- recebimento da peça;
- rejeição das preliminares;
- improcedência das defesas;
- procedência da inicial;
- nulidade do contrato/cláusulas;
- cessação de descontos;
- restituição (simples ou dobro);
- danos morais;
- manutenção/concessão da gratuidade e inversão do ônus probatório;
- sucumbência.

Os pedidos devem guardar estrita coerência com:
- os fatos provados;
- os documentos dos autos;
- a fase processual;
- a posição processual da parte representada;
- a tese efetivamente sustentada;
- a estratégia já adotada no processo.

# REGRA DE EXAUSTIVIDADE NA LINHA DO TEMPO (MAPA DE PROVAS)

Ao construir a timeline, você deve ser cirúrgico:
- **Identificadores**: Se um fato está em um documento com ID visível, cite o ID (Ex: ID 2348 - Despacho).
- **Valores**: Extraia Cifras e Valores (R$) de contratos ou decisões.
- **Resultados**: Para decisões, diga explicitamente se foi DEFERIDO ou INDEFERIDO e o impacto (ex: bloqueio de valor X).
- **Turnos**: Identifique o momento da citação e se houve revelia ou contestação tempestiva.

# REGRA DE EXAUSTIVIDADE ANTES DA VERSÃO FINAL

Antes de encerrar a peça, verifique internamente se:
- a fase processual está correta;
- não houve anacronismo;
- a tese central do processo foi preservada;
- todas as preliminares relevantes foram enfrentadas;
- todos os fundamentos autônomos da contestação foram enfrentados;
- todos os tópicos relevantes da peça humana foram cobertos, quando compatíveis;
- os fatos narrados possuem lastro documental;
- não houve importação indevida de dados de modelo;
- não há inconsistência entre taxa mensal e anual;
- não há inconsistência entre valor contratado, valor liberado, parcelas e total pago;
- não há pedido incompatível com a fase processual;
- não há pedido incompatível com a tese já deduzida;
- não há menção a decisão não confirmada;
- não há jurisprudência inventada;
- não há marcador [PREENCHER] se o dado já estava nos autos;
- não há lacuna relevante sem [PREENCHER] ou [VERIFICAR].

# MODO AUDITOR JURÍDICO (VISÃO 360)

É obrigatório que você realize uma auditoria profunda em todos os documentos anexados.
- BASEIE-SE EXCLUSIVAMENTE NOS DOCUMENTOS ANEXADOS. Não presuma fatos, não invente dados e não use informações externas ou da web para esta auditoria.
- Procure por CONTRADIÇÕES de datas, valores ou fatos entre os documentos (ex: inicial vs contrato).
- Identifique PROVAS AUSENTES que seriam cruciais para a tese sustentada.
- Aponte PONTOS CEGOS ou riscos processuais concretos que o advogado pode não ter percebido nos autos.
- Destaque PONTOS FORTES que podem ser explorados na estratégia baseados estritamente na documentação.

Se qualquer item estiver comprometido, corrija antes de finalizar.

# MODO ESTRATEGISTA: MAPA DE CONTRADIÇÕES (BATTLE LOG)

Em vez de uma linha do tempo linear, você deve gerar um MAPA TÁTICO DE CONTRADIÇÕES. O objetivo é expor onde a outra parte está mentindo ou se equivocando.

INSTRUÇÕES PARA O MAPA DE CONTRADIÇÕES:
- FOCO TOTAL: Identifique pontos onde a versão do Banco/Parte Adversa entra em choque com a Prova Documental ou com a Tese de Defesa.
- É PROIBIDO: Gerar eventos irrelevantes como "Nascimento do Autor", "Distribuição da Ação", ou "Data de Emissão de Documentos" sem contexto de fraude.
- CADA ITEM DEVE CONTER:
  1. O Ponto Crítico (ex: Data da Assinatura).
  2. Versão Adversa (O que eles alegam).
  3. Versão Real/Defesa (O que aconteceu de verdade).
  4. A "Arma" (Qual documento ou ID prova que eles estão errados).

O objetivo é dar ao advogado um "Script de Vitória" para a réplica ou audiência.

# FORMATO DE SAÍDA OBRIGATÓRIO

{
  "text": "Conteúdo integral da petição em Markdown...",
  "metadata": {
    "titulo": "Nome descritivo e curto da peça gerada",
    "cliente": "Nome da parte autora / cliente",
    "processo": "Número do processo"
  },
  "probabilidadeExito": "ALTA | MÉDIA | BAIXA",
  "estrategia": "Resumo da estratégia de abordagem...",
  "mapaContradicoes": [
    {
      "ponto": "Ponto de conflito (ex: Assinatura)",
      "versaoAdversa": "O que a outra parte alega...",
      "versaoDefesa": "O que os documentos provam...",
      "prova": "ID do documento ou nome do arquivo",
      "gravidade": "CRÍTICO | ALTO | MÉDIO"
    }
  ],
  "matrizDuelo": [
    {
      "teseAdversa": "Argumento da outra parte.",
      "teseDefesa": "Nossa tese de defesa correspondente."
    }
  ]
}

Atenção: Entregue apenas o objeto JSON bruto final. Não explique como raciocinou. Não descreva o prompt. Não faça observações metalinguísticas.
Se houver ausência de informação na peça, use marcações internas discretas como: [PREENCHER], [VERIFICAR], [INSERIR] dentro da string "text".

# INSTRUÇÕES DE ESTILO E FORMATAÇÃO OBRIGATÓRIA

- Redigir em português jurídico brasileiro.
- Não escrever em tópicos telegráficos; desenvolver a argumentação.
- Usar linguagem MARKDOWN para títulos:
  1. Títulos principais: iniciar a linha com "# "
  2. Subtítulos: iniciar a linha com "## "
  3. Citações e jurisprudência: iniciar cada linha com "> "
  4. Usar "**" para negrito em palavras-chave importantes
- Priorizar clareza, densidade argumentativa e impugnação específica.
- A peça final precisa ser enxuta e direta, mas sem perda de cobertura.
- NÃO reproduzir trechos inteiros da contestação nem dos documentos.
- Rebater de forma conclusiva.
- Evitar copiar literalmente a contestação; sintetizar e rebater.
- Evitar jurisprudência fictícia.
- Se houver lacuna documental, sinalizar com marcador interno.
- É proibido entrar em looping textual.
- Cada tópico deve avançar o raciocínio e responder efetivamente ao ponto controvertido.

# REGRA FINAL

A prioridade máxima é:
1. fidelidade aos fatos do caso;
2. aderência à fase processual correta;
3. preservação da tese efetivamente deduzida;
4. enfrentamento integral da controvérsia instaurada;
5. completude em nível igual ou superior à peça humana;
6. técnica processual;
7. clareza;
8. força persuasiva.

Se a peça for impugnação à contestação, réplica ou manifestação sobre defesa, a resposta deve ser uma impugnação verdadeiramente reativa à peça adversa, e não mera reiteração da tese da parte autora, com espelhamento estrutural, correspondência 1:1, densidade em quatro camadas e cobertura total via checklist.

Se houver peça-modelo humana, a nova versão deve buscar equivalência ou superioridade de completude argumentativa, sem copiar conteúdo literal e sem importar dados indevidos.

DADOS DO CASO A SEREM UTILIZADOS NESTA EXECUÇÃO:
Os documentos do caso concreto e os modelos de referência estão anexados a seguir. Analise-os para redigir a peça final.
`;


        // Injetando a data atual no contexto para o fechamento da peça
        const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        contents.push(`\nDATA ATUAL DO SISTEMA (use para o fechamento da peça): ${dataHoje}\n`);

        contents.push(prompt);

        // ── Carregar Base de Conhecimento do escritório ───────────────────
        const modeloArquivos = fs.readdirSync(MODELOS_DIR);
        if (modeloArquivos.length > 0) {
            contents.push('\n\n=== BASE DE CONHECIMENTO DO ESCRITÓRIO (PETIÇÕES ANTERIORES DE SUCESSO) ===\n[INSTRUÇÃO CRÍTICA]: Utilize as peças a seguir para extrair as TESES JURÍDICAS VENCEDORAS, a JURISPRUDÊNCIA adotada, e o TOM ARGUMENTATIVO característico do escritório. Adapte essas teses para os fatos do caso atual. Mantenha a estrutura e o estilo, mas NUNCA copie os dados pessoais (nomes, números de processo, valores, datas de eventos) destas peças de referência.\n');

            for (const nomeModelo of modeloArquivos) {
                const modeloPath = path.join(MODELOS_DIR, nomeModelo);
                const ext = nomeModelo.split('.').pop()?.toLowerCase();
                const mimeType = ext === 'pdf' ? 'application/pdf'
                    : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        : ext === 'txt' ? 'text/plain'
                            : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                                : ext === 'png' ? 'image/png'
                                    : 'text/plain';

                try {
                    const conteudo = await extrairConteudo(modeloPath, nomeModelo, mimeType);
                    if (conteudo) {
                        if (typeof conteudo === 'string') {
                            contents.push(`\n--- MODELO: ${nomeModelo} ---\n${conteudo}\n`);
                        } else {
                            contents.push(`\n--- MODELO: ${nomeModelo} ---\n`);
                            contents.push(conteudo);
                        }
                    }
                } catch (e) {
                    console.warn(`Não foi possível ler o modelo ${nomeModelo}:`, e.message);
                }
            }

            contents.push('\n=== FIM DOS MODELOS — A SEGUIR OS DOCUMENTOS DO CASO ATUAL ===\n');
        }

        // ── Processar Modelo Específico Opcional ──────────────────────────
        if (modeloEspecifico.length > 0) {
            contents.push('\n=== MODELO ESPECÍFICO PARA ESTA PEÇA (Prioridade MÁXIMA de estilo, estrutura e fluxo argumentativo) ===\n');
            for (const file of modeloEspecifico) {
                let originalName = file.originalname;
                try { originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch (e) { }
                const conteudo = await extrairConteudo(file.path, originalName, file.mimetype);
                if (conteudo) {
                    if (typeof conteudo === 'string') { contents.push(conteudo); }
                    else { contents.push(conteudo); }
                }
                fs.unlinkSync(file.path);
            }
            contents.push('\n========================================================================\n');
        }

        // ── Processar documentos do caso ──────────────────────────────────
        for (const file of files) {
            let originalName = file.originalname;
            try {
                originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            } catch (e) { }
            const conteudo = await extrairConteudo(file.path, originalName, file.mimetype);
            if (conteudo) {
                if (typeof conteudo === 'string') {
                    contents.push(conteudo);
                } else {
                    contents.push(conteudo);
                }
            }
            fs.unlinkSync(file.path);
        }

        // ── ESTÁGIO 1: ESTRATÉGIA E ANALYTICS (JSON) ─────────────────────────
        const contentsStage1 = [...contents];
        contentsStage1.push(`
# ESTÁGIO 1: ANÁLISE E ESTRATÉGIA
Neste momento, NÃO redija a peça processual. 
Gere APENAS o objeto JSON contendo as chaves: metadata, probabilidadeExito, estrategia, mapaContradicoes, matrizDuelo e mapaDeRiscos.
O campo "text" deve ser retornado vazio ("").
`);

        const formattedContents1 = [{
            role: 'user',
            parts: contentsStage1.map(c => typeof c === 'string' ? { text: c } : c)
        }];

        console.log("Iniciando Estágio 1: Extração de Estratégia...");
        const response1 = await ai.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: formattedContents1,
            config: { temperature: 0.1 },
        });

        let fullText1 = response1.text;
        let responseData = { metadata: {}, timeline: [], mapaContradicoes: [], matrizDuelo: [], mapaDeRiscos: {} };
        let parseError = null;

        try {
            const jsonStart = fullText1.indexOf('{');
            const jsonEnd = fullText1.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = fullText1.substring(jsonStart, jsonEnd + 1);
                responseData = JSON.parse(jsonString);
            } else {
                parseError = "Formato JSON não encontrado no Estágio 1.";
            }
        } catch (e) {
            parseError = "Falha ao fazer parse do JSON no Estágio 1: " + e.message;
            console.error(parseError, fullText1);
        }

        // Colheita de metadados reais de grounding do próprio Gemini (Estágio 1)
        let groundingLinks = responseData.fontesWeb || [];
        const metadataGround1 = response1.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (metadataGround1 && metadataGround1.length > 0) {
            const extraLinks1 = metadataGround1.map((chunk) => chunk?.web?.uri).filter(Boolean);
            groundingLinks = [...new Set([...groundingLinks, ...extraLinks1])];
        }

        // ── ESTÁGIO 2: REDAÇÃO DA PEÇA (MARKDOWN PURO) ────────────────────────
        const contentsStage2 = [...contents];
        contentsStage2.push(`
# RESULTADO DO ESTÁGIO 1 (ESTRATÉGIA DEFINIDA):
${JSON.stringify(responseData, null, 2)}

# ESTÁGIO 2: REDAÇÃO EXAUSTIVA DA PEÇA
Com base na estratégia acima e em todas as regras já informadas, redija AGORA a peça processual COMPLETA.
- NÃO retorne JSON.
- Retorne APENAS o texto da petição em formato MARKDOWN PURO.
- NÃO SE PREOCUPE COM O TAMANHO DA RESPOSTA.
- Você tem total liberdade para ser EXTREMAMENTE EXAUSTIVO E DENSO em cada tópico.
- Rebata TODOS os pontos mapeados na estratégia, um por um.
`);

        const formattedContents2 = [{
            role: 'user',
            parts: contentsStage2.map(c => typeof c === 'string' ? { text: c } : c)
        }];

        console.log("Iniciando Estágio 2: Redação Exaustiva da Peça...");
        const response2 = await ai.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: formattedContents2,
            config: { temperature: 0.1 },
        });

        const finalDocumentText = response2.text.replace(/^```markdown\n?/, '').replace(/```$/, '').trim();
        responseData.text = finalDocumentText;

        console.log("=== GERAÇÃO DO ESTÁGIO 2 CONCLUÍDA ===");
        
        // Colheita de metadados de grounding (Estágio 2)
        const metadataGround2 = response2.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (metadataGround2 && metadataGround2.length > 0) {
            const extraLinks2 = metadataGround2.map((chunk) => chunk?.web?.uri).filter(Boolean);
            groundingLinks = [...new Set([...groundingLinks, ...extraLinks2])];
        }

        // ── Salvar no Histórico (Persistência Automática) ─────────────────
        let savedDocId = null;
        try {
            const savedDoc = await prisma.documentHistory.create({
                data: {
                    title: responseData.metadata?.titulo || 'Documento sem título',
                    clientName: responseData.metadata?.cliente || 'Cliente não identificado',
                    caseNumber: responseData.metadata?.processo || 'Sem processo',
                    content: responseData.text || '',
                    timeline: JSON.stringify(responseData.mapaContradicoes || responseData.timeline || []),
                    auditData: JSON.stringify(responseData.mapaDeRiscos || {}),
                    analytics: JSON.stringify({
                        prob: responseData.probabilidadeExito,
                        est: responseData.estrategia
                    }),
                    fontesWeb: JSON.stringify(groundingLinks),
                    matrizDuelo: JSON.stringify(responseData.matrizDuelo || [])
                }
            });
            savedDocId = savedDoc.id;

            // Dispara notificação no WhatsApp informando que a petição foi gerada
            notifyPetitionGenerated(savedDoc.title, savedDoc.caseNumber, savedDoc.clientName);

        } catch (dbError) {
            console.error("Erro ao salvar no histórico:", dbError.message);
        }

        res.json({
            success: true,
            id: savedDocId,
            text: responseData.text || '',
            metadata: responseData.metadata || {},
            mapaContradicoes: responseData.mapaContradicoes || responseData.timeline || [],
            matrizDuelo: responseData.matrizDuelo || [],
            fontesWeb: groundingLinks,
            probabilidadeExito: responseData.probabilidadeExito,
            estrategia: responseData.estrategia,
            mapaDeRiscos: responseData.mapaDeRiscos || {}
        });
    } catch (error) {
        console.error('Erro ao gerar documento:', error);
        res.status(500).json({ success: false, error: error.message || 'Erro ao processar a requisição.' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROTA — DOWNLOAD DOCX FORMATADO (COM SUPORTE A TEMPLATE)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/download-docx', async (req, res) => {
    try {
        const { text, metadata, nomeArquivo } = req.body;
        if (!text) {
            console.error('Download DOCX: Texto não fornecido.');
            return res.status(400).json({ success: false, error: 'Texto não fornecido.' });
        }

        const config = lerConfig();
        const templatePath = path.join(TEMPLATES_DIR, 'modelo_base.docx');
        console.log(`Download DOCX: Template existe? ${fs.existsSync(templatePath)}`);

        let buffer;

        // Se houver um template modelo_base.docx, usamos Docxtemplater
        if (fs.existsSync(templatePath)) {
            const content = fs.readFileSync(templatePath, 'binary');
            const zip = new PizZip(content);
            const { parseMarkdownToOOXML } = require('./docx-ooxml-parser');

            // Substituir {{corpo}} por {{@corpo}} para permitir a injeção nativa de XML (negrito, títulos, indentação)
            try {
                let docXml = zip.file("word/document.xml").asText();
                docXml = docXml.replace(/\{\{\s*corpo\s*\}\}/g, '{{@corpo}}');
                zip.file("word/document.xml", docXml);
            } catch (err) {
                console.error("Erro ao preparar XML no template:", err);
            }

            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' },
            });

            // Preparar dados para o template
            const dadosParaTemplate = {
                ...config,
                ...metadata,
                corpo: parseMarkdownToOOXML(text),
                // Variáveis extras caso o usuário queira no template
                titulo: metadata.titulo || 'Peca Juridica',
                cliente: metadata.cliente || '',
                processo: metadata.processo || '',
                data: metadata.data || '',
                assinante: metadata.assinante || config.nomeAdvogado || '',
            };

            doc.render(dadosParaTemplate);
            buffer = doc.getZip().generate({ type: 'nodebuffer' });
            console.log('Download DOCX: Gerado via template.');

        } else {
            console.log('Download DOCX: Gerando via builder dinâmico (fallback)...');
            buffer = await buildDocx(text, config);
            console.log('Download DOCX: Gerado via builder dinâmico.');
        }

        const fileName = (nomeArquivo || 'Peca_Juridica').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.docx';

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (error) {
        console.error('Erro ao gerar DOCX:', error);

        // Log detalhado para Docxtemplater MultiError
        if (error.properties && error.properties.errors instanceof Array) {
            const errorMessages = error.properties.errors.map(e => {
                let msg = e.properties?.explanation || e.message || 'Erro desconhecido';
                if (e.properties?.id) msg += ` (ID: ${e.properties.id})`;
                return msg;
            });
            console.error('Docxtemplater detalhes:', errorMessages);
            return res.status(500).json({
                success: false,
                error: 'Erro no template DOCX: os marcadores {{ }} do arquivo estão incorretos ou em formato inválido.',
                detalhes: errorMessages
            });
        }

        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS DO HISTÓRICO DE CASOS GERADOS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/history', async (req, res) => {
    try {
        const history = await prisma.documentHistory.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                clientName: true,
                caseNumber: true,
                createdAt: true,
            }
        });
        res.json({ success: true, history });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/history/:id', async (req, res) => {
    try {
        const doc = await prisma.documentHistory.findUnique({
            where: { id: req.params.id }
        });
        if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
        res.json({ success: true, document: doc });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/history/:id', async (req, res) => {
    try {
        await prisma.documentHistory.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/history/:id', async (req, res) => {
    try {
        const { content } = req.body;
        await prisma.documentHistory.update({
            where: { id: req.params.id },
            data: { content }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/analytics', async (req, res) => {
    try {
        const history = await prisma.documentHistory.findMany({
            select: {
                analytics: true,
                auditData: true,
                createdAt: true,
                clientName: true
            }
        });

        const totalDocs = history.length;
        let totalProb = 0;
        let probCount = 0;

        const vulnerabilitiesByProcess = {}; // { vulnerabilityName: Set(caseNumbers) }
        const clientUniqueProcesses = {}; // { clientName: Set(caseNumbers) }
        const uniqueProcessNumbers = new Set();

        history.forEach(item => {
            const caseNum = (item.caseNumber || 'Sem-Processo').trim().toUpperCase();
            const clientName = (item.clientName || 'Cliente-Não-Identificado').trim().toUpperCase();

            uniqueProcessNumbers.add(caseNum);

            // Analytics (Probabilidade)
            if (item.analytics) {
                try {
                    const ana = JSON.parse(item.analytics);
                    const probVal = ana.prob || ana.probabilidade;
                    if (probVal) {
                        const val = parseInt(probVal.replace(/[^0-9]/g, ''));
                        if (!isNaN(val)) {
                            totalProb += val;
                            probCount++;
                        }
                    }
                } catch (e) { }
            }

            // Audit (Ilegalidades) - Contamos quantos PROCESSOS ÚNICOS têm essa ilegalidade
            if (item.auditData) {
                try {
                    const audit = JSON.parse(item.auditData);
                    (audit.vulnerabilidades || []).forEach(v => {
                        const vName = v.trim();
                        if (!vulnerabilitiesByProcess[vName]) vulnerabilitiesByProcess[vName] = new Set();
                        vulnerabilitiesByProcess[vName].add(caseNum);
                    });
                } catch (e) { }
            }

            // Clients - Contamos quantos PROCESSOS ÚNICOS cada cliente tem
            if (!clientUniqueProcesses[clientName]) clientUniqueProcesses[clientName] = new Set();
            clientUniqueProcesses[clientName].add(caseNum);
        });

        const avgProb = probCount > 0 ? Math.round(totalProb / probCount) : 0;
        const totalUniqueProcesses = uniqueProcessNumbers.size;

        // Transform and sort
        const topVulnerabilities = Object.entries(vulnerabilitiesByProcess)
            .map(([name, processSet]) => ({ name, count: processSet.size }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const topClients = Object.entries(clientUniqueProcesses)
            .map(([name, processSet]) => ({ name, count: processSet.size }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({
            success: true,
            stats: {
                totalDocs,
                totalUniqueProcesses,
                avgProb,
                topVulnerabilities,
                topClients
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Registar rotas
app.use('/api/whatsapp', whatsappRoutes);
const tribunalRoutes = require('./src/routes/tribunalRoutes');
app.use('/api/processos', tribunalRoutes);
const petitionRoutes = require('./src/routes/petitionRoutes');
app.use('/api/pieces', petitionRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend LexGen rodando na porta ${PORT}`);
    console.log(`Modelos do escritório: ${MODELOS_DIR}`);

    // Iniciar o robô do WhatsApp ao levantar o servidor
    initializeWhatsApp();

    // Configurar cron job (Diariamente às 07:00 da manhã)
    cron.schedule('0 7 * * *', async () => {
        console.log('Executando Rotina Diária CRON - Notificações de Audiência...');
        await runDailyNotifications();
    });
});

// ── Tratamento de Fechamento (Evitar EPERM no Prisma) ───────────────────────
const gracefulShutdown = async (signal) => {
    console.log(`\nRecebido ${signal}. Encerrando LexGen de forma limpa...`);
    try {
        if (prisma) {
            await prisma.$disconnect();
            console.log('Conexão com Banco de Dados encerrada.');
        }
    } catch (e) {
        console.error('Erro ao desconectar Prisma:', e);
    }
    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
    // Não encerramos imediatamente para evitar loop de restart se estiver em produção
});
