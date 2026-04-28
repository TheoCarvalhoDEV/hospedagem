const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

function createOOXML(text) {
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>This is BOLD</w:t></w:r></w:p>`;
}

const templatePath = 'templates/modelo_base.docx';
const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);

// Patch template: change {{corpo}} to {{@corpo}} if it exists
let docXml = zip.file("word/document.xml").asText();
docXml = docXml.replace(/\{\{\s*corpo\s*\}\}/g, '{{@corpo}}');
zip.file("word/document.xml", docXml);

const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
});

doc.render({
    corpo: createOOXML()
});

const buffer = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync('teste_xml.docx', buffer);
console.log('Teste XML gerado');
