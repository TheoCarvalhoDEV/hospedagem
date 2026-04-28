function escapeXML(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&apos;");
}

function parseInlineToOOXML(text, baseFontRun) {
    let xml = '';
    const regex = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (m[1]) {
            xml += `<w:r>${baseFontRun.replace('<w:rPr>', '<w:rPr><w:b/><w:i/>')}<w:t xml:space="preserve">${escapeXML(m[1])}</w:t></w:r>`;
        } else if (m[2]) {
            xml += `<w:r>${baseFontRun.replace('<w:rPr>', '<w:rPr><w:b/>')}<w:t xml:space="preserve">${escapeXML(m[2])}</w:t></w:r>`;
        } else if (m[3]) {
            xml += `<w:r>${baseFontRun.replace('<w:rPr>', '<w:rPr><w:i/>')}<w:t xml:space="preserve">${escapeXML(m[3])}</w:t></w:r>`;
        } else if (m[4]) {
            xml += `<w:r>${baseFontRun}<w:t xml:space="preserve">${escapeXML(m[4])}</w:t></w:r>`;
        }
    }
    return xml;
}

function parseMarkdownToOOXML(text) {
    const linhas = text.split('\n');
    let xml = '';

    const runFont = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;

    for (const linha of linhas) {
        const t = linha.trim();
        if (!t) {
            xml += `<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="both"/></w:pPr></w:p>`;
            continue;
        }

        // Separador horizontal --- / *** / ___
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
            xml += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="E5E7EB"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`;
            continue;
        }

        const cleanT = t.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        const isH1Symbol = t.startsWith('# ');
        const isH1Text = /^(?:[A-Z0-9]{1,3}(?:\.|\s*-)?\s*)?[A-ZÀ-Ú ]{8,}:?$/.test(cleanT) && cleanT === cleanT.toUpperCase();

        if (isH1Symbol || isH1Text) {
            xml += `<w:p><w:pPr><w:spacing w:before="300" w:after="200"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXML(cleanT.toUpperCase())}</w:t></w:r></w:p>`;
            continue;
        }

        const isH2Symbol = t.startsWith('## ');
        const isH2Text = /^\d+\.\d+\.?\s+[A-ZÀ-Ú]/.test(cleanT);
        if (isH2Symbol || isH2Text) {
            xml += `<w:p><w:pPr><w:spacing w:before="280" w:after="120"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXML(cleanT)}</w:t></w:r></w:p>`;
            continue;
        }

        if (t.startsWith('### ')) {
            xml += `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXML(cleanT)}</w:t></w:r></w:p>`;
            continue;
        }

        if (/^[-*]\s+/.test(t) && !isH1Text) {
            const conteudo = t.replace(/^[-*]\s+/, '');
            xml += `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:before="60" w:after="60"/><w:ind w:left="720" w:hanging="284"/><w:jc w:val="both"/></w:pPr><w:r>${runFont}<w:t xml:space="preserve">• </w:t></w:r>${parseInlineToOOXML(conteudo, runFont)}</w:p>`;
            continue;
        }

        const isCitation = t.startsWith('> ') || /^Art\.\s+\d/.test(cleanT) || /^\[\d+\]/.test(cleanT) || cleanT.includes('EMENTA:');
        if (isCitation) {
            const textToParse = t.startsWith('> ') ? t.slice(2) : t;
            xml += `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:ind w:left="720" w:right="720"/><w:jc w:val="both"/></w:pPr>${parseInlineToOOXML(textToParse, runFont)}</w:p>`;
            continue;
        }

        // Parágrafo comum (Recuo 1.27cm = 720 twips)
        xml += `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:ind w:firstLine="720"/><w:jc w:val="both"/></w:pPr>${parseInlineToOOXML(t, runFont)}</w:p>`;
    }
    return xml;
}

module.exports = { parseMarkdownToOOXML };
