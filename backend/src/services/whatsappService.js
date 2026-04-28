const pkg = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Client, LocalAuth } = pkg;

const state = {
  qrCodeUrl: null,
  status: 'DISCONNECTED' // DISCONNECTED, WAITING_QR, CONNECTED
};

// Vamos encontrar o Chrome VERDADEIRO da máquina do usuário para burlar o block da Meta
const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
];

let realChromePath = null;
for (const p of chromePaths) {
    if (fs.existsSync(p)) {
        realChromePath = p;
        break;
    }
}

// Configurar armazenamento local da sessão no diretório apropriado do backend
const authPath = path.join(__dirname, '..', '.wwebjs_auth');

let client = null;

const createClient = () => {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true, 
      executablePath: realChromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  client.on('qr', async (qr) => {
    console.log('QR CODE WhatsApp GERADO!');
    try {
      state.qrCodeUrl = await qrcode.toDataURL(qr);
      state.status = 'WAITING_QR';
    } catch (err) {
      console.error('Erro ao gerar imagem QR', err);
    }
  });

  client.on('ready', () => {
    console.log('WhatsApp Conectado de VERDADE com sucesso!');
    state.status = 'CONNECTED';
    state.qrCodeUrl = null;
  });

  client.on('disconnected', () => {
    console.log('WhatsApp Desconectado!');
    state.status = 'DISCONNECTED';
    state.qrCodeUrl = null;
  });
};

// Inicializa a primeira vez
createClient();

const initializeWhatsApp = () => {
  console.log('Iniciando Robô do WhatsApp silenciosamente em background...');
  if (!client) createClient();
  client.initialize().catch(err => {
    console.error("Erro fatal ao inicializar WhatsApp", err);
  });
};

const getGroups = async () => {
  if (state.status !== 'CONNECTED' || !client) return [];
  try {
    const chats = await client.getChats();
    return chats.filter(c => c.isGroup).map(g => ({
      id: g.id._serialized,
      name: g.name
    }));
  } catch (error) {
    console.error("Erro ao buscar grupos:", error);
    return [];
  }
};

const sendDirectMessage = async (jid, text) => {
  if (state.status !== 'CONNECTED' || !client) throw new Error("WhatsApp não está conectado.");
  try {
    let options = {};
    
    // Suporte a @todos (@all)
    if (text.includes('@todos') && jid.endsWith('@g.us')) {
      const chat = await client.getChatById(jid);
      if (chat.isGroup) {
        options.mentions = chat.participants.map(p => p.id._serialized);
      }
    }

    await client.sendMessage(jid, text, options);
    console.log(`Mensagem enviada com sucesso para ${jid} (mentions: ${options.mentions ? options.mentions.length : 0})`);
    return true;
  } catch (error) {
    console.error(`Erro ao enviar mensagem para ${jid}:`, error);
    throw error;
  }
};

const logoutWhatsApp = async () => {
  try {
    console.log('Tentando desconectar o WhatsApp de forma agressiva...');
    state.status = 'LOADING'; // Feedback rápido pro usuário
    
    // Tenta deslogar e destruir
    if (client) {
      try {
        await client.logout();
      } catch (e) {
        console.error('Erro no logout suave, forçando destruição...');
      }
      try {
        await client.destroy();
      } catch (e) {}
    }
    
    // Apaga a pasta de sessão para garantir o QR code novo
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }

    state.status = 'DISCONNECTED';
    state.qrCodeUrl = null;
    client = null;
    
    console.log('Sessão limpa. Reconstruindo cliente...');
    createClient();
    setTimeout(() => {
      client.initialize().catch(e => console.error(e));
    }, 1000);
    return true;
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
    throw error;
  }
};

module.exports = {
  state,
  get client() { return client; }, // Accessor to return the current client reference
  initializeWhatsApp,
  getGroups,
  sendDirectMessage,
  logoutWhatsApp
};
