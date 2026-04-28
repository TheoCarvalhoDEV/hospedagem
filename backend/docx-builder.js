/**
 * docx-builder.js
 * Gera um documento DOCX formatado com cabeçalho, rodapé e estrutura jurídica profissional.
 */
const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    Header,
    Footer,
    AlignmentType,
    PageNumber,
    WidthType,
    BorderStyle,
    VerticalAlign,
    TabStopPosition,
    TabStopType,
    UnderlineType,
} = require('docx');

// 1 cm ≈ 567 twips (para margens de página)
const CM = 567;
// Metade de ponto: 12pt = 24 (docx usa "half-points" em TextRun.size)
const PT = (pt) => pt * 2;

// ── Cores do escritório ────────────────────────────────────────────────────
// ── Cores do escritório ────────────────────────────────────────────────────
const COR_PRIMARIA = '1A233A'; // Azul Escuro conforme PDFs
const COR_CINZA = '6B7280';
const COR_CINZA_CLARO = 'F0F0F0'; // Para a caixa do título
const COR_LINHA = 'FFFFFF'; // Linha branca no rodapé
const COR_TEXTO_HEADER = 'FFFFFF';
const FONT_TITULOS = 'Times New Roman';
const FONT_BODY = 'Times New Roman';

// ── Helper: criar borda "nenhuma" para células de tabela ──────────────────
const SEM_BORDA = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// ── Parser inline: **bold**, *italic* ─────────────────────────────────────
function parseInline(text, extraOpts = {}) {
    const runs = [];
    // Quebra o texto em tokens de bold, italic e texto simples
    const regex = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (m[1]) {
            runs.push(new TextRun({ ...extraOpts, text: m[1], bold: true, italics: true }));
        } else if (m[2]) {
            runs.push(new TextRun({ ...extraOpts, text: m[2], bold: true }));
        } else if (m[3]) {
            runs.push(new TextRun({ ...extraOpts, text: m[3], italics: true }));
        } else if (m[4]) {
            runs.push(new TextRun({ ...extraOpts, text: m[4] }));
        }
    }
    return runs.length > 0 ? runs : [new TextRun({ ...extraOpts, text })];
}

// ── Cabeçalho do documento ────────────────────────────────────────────────
function buildHeader(config) {
    const nomeEscritorio = config.nomeEscritorio || 'JESUS VIEIRA DE OLIVEIRA';
    const subtitulo = config.subtitulo || 'Sociedade Individual de Advocacia';

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { fill: COR_PRIMARIA }, // Fundo azul escuro
        borders: SEM_BORDA,
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: SEM_BORDA,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                indent: { left: 400, right: 400 },
                                children: [
                                    new TextRun({
                                        text: nomeEscritorio.toUpperCase(),
                                        bold: true,
                                        size: PT(18),
                                        color: COR_TEXTO_HEADER,
                                        font: FONT_TITULOS,
                                    }),
                                ],
                                spacing: { before: 200 },
                            }),
                            new Paragraph({
                                indent: { left: 400, right: 400 },
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({ 
                                        text: subtitulo, 
                                        size: PT(10), 
                                        color: COR_TEXTO_HEADER, 
                                        font: FONT_TITULOS 
                                    })
                                ],
                                spacing: { after: 200 },
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

// ── Rodapé do documento ───────────────────────────────────────────────────
function buildFooter(config) {
    const infoContato = `contato@advocacia.com.br  •  (65) 99999-9999  •  Rua dos Advogados, 123, Centro, Cáceres/MT`;

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { fill: COR_PRIMARIA }, // Fundo azul escuro
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '#FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0 },
            left: { style: BorderStyle.NONE, size: 0 },
            right: { style: BorderStyle.NONE, size: 0 },
        },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: SEM_BORDA,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                indent: { left: 400 },
                                children: [
                                    new TextRun({
                                        text: infoContato,
                                        size: PT(9),
                                        color: COR_TEXTO_HEADER,
                                        font: FONT_BODY,
                                    }),
                                ],
                                spacing: { before: 100, after: 100 },
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

// ── Conversor de Markdown / Texto → Parágrafos DOCX ───────────────────────────────
function parseMarkdown(text) {
    const linhas = text.split('\n');
    const paragrafos = [];

    const BASE = { font: FONT_BODY, size: PT(12) };
    const SPACING = { line: 360, after: 120 }; // line: 360 é aproximadamente 1.5 (240 * 1.5)

    for (const linha of linhas) {
        const t = linha.trim();

        // Linha vazia
        if (!t) {
            paragrafos.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 0 } }));
            continue;
        }

        // Separador horizontal --- / *** / ___
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
            paragrafos.push(
                new Paragraph({
                    children: [new TextRun({ text: '' })],
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } },
                    spacing: { before: 120, after: 120 },
                })
            );
            continue;
        }

        const cleanT = t.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        
        // H1 (Centralizado conforme Documento 2)
        // Detecta: "# Título" ou formato texto "1 - DOS FATOS", "I - PRELIMINARES", "DAS PRELIMINARES" (tudo maiúsculo)
        const isH1Symbol = t.startsWith('# ');
        const isH1Text = /^(?:[A-Z0-9]{1,3}(?:\.|\s*-)?\s*)?[A-ZÀ-Ú ]{8,}:?$/.test(cleanT) && cleanT === cleanT.toUpperCase();

        if (isH1Symbol || isH1Text) {
            paragrafos.push(
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 300, after: 200 },
                    children: [
                        new TextRun({
                            text: cleanT,
                            bold: true,
                            size: PT(12),
                            font: FONT_TITULOS,
                            allCaps: true,
                        }),
                    ],
                })
            );
            continue;
        }

        // H2 (Subseções, Alinhado à esquerda)
        // Detecta: "## Título" ou "1.1 Da carência", "2.1. Do Dano Moral"
        const isH2Symbol = t.startsWith('## ');
        const isH2Text = /^\d+\.\d+\.?\s+[A-ZÀ-Ú]/.test(cleanT);

        if (isH2Symbol || isH2Text) {
            paragrafos.push(
                new Paragraph({
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 280, after: 120 },
                    children: [
                        new TextRun({
                            text: cleanT,
                            bold: true,
                            size: PT(12),
                            font: FONT_TITULOS,
                        }),
                    ],
                })
            );
            continue;
        }

        // H3
        if (t.startsWith('### ')) {
            paragrafos.push(
                new Paragraph({
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 200, after: 80 },
                    children: [
                        new TextRun({
                            text: cleanT,
                            bold: true,
                            size: PT(12),
                            font: FONT_TITULOS,
                        }),
                    ],
                })
            );
            continue;
        }

        // Lista com marcador: - item ou * item (Recuo 1.27cm)
        if (/^[-*]\s+/.test(t) && !isH1Text) {
            const conteudo = t.replace(/^[-*]\s+/, '');
            paragrafos.push(
                new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: Math.round(1.27 * CM), hanging: Math.round(0.5 * CM) },
                    spacing: { ...SPACING, before: 60, after: 60 },
                    children: [
                        new TextRun({ text: '• ', ...BASE }),
                        ...parseInline(conteudo, BASE),
                    ],
                })
            );
            continue;
        }

        // Citações em bloco (identificadas por > ou recuo manual ou formatos como "Art. 18")
        const isCitation = t.startsWith('> ') || /^Art\.\s+\d/.test(cleanT) || /^\[\d+\]/.test(cleanT) || cleanT.includes('EMENTA:');
        
        if (isCitation) {
            const textToParse = t.startsWith('> ') ? t.slice(2) : t;
            paragrafos.push(
                new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: Math.round(1.27 * CM), right: Math.round(1.27 * CM) },
                    spacing: SPACING,
                    children: parseInline(textToParse, BASE),
                })
            );
            continue;
        }

        // Parágrafo comum (Recuo 1.27cm)
        paragrafos.push(
            new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: SPACING,
                indent: { firstLine: Math.round(1.27 * CM) },
                children: parseInline(t, BASE),
            })
        );
    }

    return paragrafos;
}

// ── Função principal exportada ─────────────────────────────────────────────
async function buildDocx(markdownText, config) {
    const corpo = parseMarkdown(markdownText);

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: Math.round(2.54 * CM),
                            bottom: Math.round(1.9 * CM),
                            left: Math.round(3.17 * CM),
                            right: Math.round(3.17 * CM),
                            header: Math.round(1.27 * CM),
                            footer: Math.round(1.27 * CM),
                        },
                    },
                },
                headers: {
                    default: new Header({ children: [buildHeader(config)] }),
                },
                footers: {
                    default: new Footer({ children: [buildFooter(config)] }),
                },
                children: corpo,
            },
        ],
    });

    return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
