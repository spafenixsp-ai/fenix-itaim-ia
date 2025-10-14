const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const port = 3000;

app.use(bodyParser.json());

const initialMessage = "Bem-vindo ao Chat GPT, como posso te ajudar?";
const secretKey = process.env.OPENAI_API_KEY;
const zapiUrl = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`;

const chats = {};

const replyMessage = async (phone, message) => {
  console.log(`📤 Enviando mensagem para ${phone}: ${message}`);
  try {
    await axios.post(zapiUrl, {
      phone,
      message,
      delayTyping: 3,
    });
    console.log('✅ Mensagem enviada com sucesso via Z-API');
  } catch (error) {
    console.log('❌ Erro ao enviar mensagem via Z-API:', error.response?.data || error.message);
  }
};

const appendChat = (phone, message) => {
  // Garantir que o chat existe
  if (!chats[phone]) {
    chats[phone] = {
      blocked: false,
      messages: []
    };
  }
  
  chats[phone].messages.push(message.replace(/(\r\n|\n|\r)/gm, ""));
  if (chats[phone].messages.length > 7) {
    chats[phone].messages.shift();
  }
  console.log(`💾 Chat atualizado para ${phone}:`, chats[phone].messages);
};

const onNewMessage = async (message) => {
  console.log(`🤖 Processando mensagem de ${message.phone}: ${message.text.message}`);
  
  // INICIALIZAR O CHAT SE NÃO EXISTIR - CORREÇÃO CRÍTICA
  if (!chats[message.phone]) {
    chats[message.phone] = {
      blocked: false,
      messages: []
    };
  }
  
  if (chats[message.phone].blocked) {
    console.log('⏳ Chat bloqueado - enviando mensagem de aguarde');
    return await replyMessage(message.phone, "Um momento por favor");
  }
  
  chats[message.phone].blocked = true;
  const text = ` ${message.phone}: ${message.text.message}`;

  await appendChat(message.phone, text);
  await appendChat(message.phone, ` OPENAI:`);

  try {
    const prompt = chats[message.phone].messages.join("\n");
    console.log(`🧠 Enviando prompt para OpenAI: ${prompt}`);
    
    const response = await axios.post(
      `https://api.openai.com/v1/completions`,
      {
        model: "text-davinci-003",
        prompt,
        temperature: 0.9,
        max_tokens: 500,
        top_p: 1,
        frequency_penalty: 0.0,
        presence_penalty: 0.6,
        stop: [` ${message.phone}:`, " OPENAI:"],
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );
    
    if (response.data.choices.length > 0) {
      const aiResponse = response.data.choices[0].text.trim();
      console.log(`🤖 Resposta da OpenAI: ${aiResponse}`);
      await appendChat(message.phone, `${response.data.choices[0].text}`);
      await replyMessage(message.phone, aiResponse);
    } else {
      throw "NOT_FOUND";
    }
  } catch (e) {
    console.log('❌ Erro na OpenAI:', e);
    return await replyMessage(
      message.phone,
      "Desculpe, mas tive problemas no processamento, você pode reiniciar nossa conversando mandando novamente o comando !gpt"
    );
  } finally {
    chats[message.phone].blocked = false;
    console.log(`🔓 Chat desbloqueado para ${message.phone}`);
  }
};

app.post("/on-new-message", async (req, res) => {
  // VERIFICAR CLIENT-TOKEN
  const clientToken = req.headers['client-token'];
  const validToken = process.env.ZAPI_CLIENT_TOKEN;
  
  console.log('🔐 Verificando Client-Token:', clientToken ? 'Recebido' : 'Não recebido');
  
  if (!clientToken || clientToken !== validToken) {
    console.log('❌ Client-Token inválido ou ausente');
    return res.status(401).send({ error: "Unauthorized" });
  }
  
  console.log('✅ Client-Token válido!');
  
  console.log('🔔 WEBHOOK CHAMADO - Body completo:', JSON.stringify(req.body, null, 2));
  
  if (!req.body) {
    console.log('❌ Body vazio ou indefinido');
    return res.status(400).send({ error: "Body vazio" });
  }

  console.log('📱 Dados recebidos:');
  console.log('   - Phone:', req.body.phone);
  console.log('   - Text:', req.body.text);
  console.log('   - fromMe:', req.body.fromMe);
  console.log('   - Chat existente:', chats[req.body.phone] ? 'SIM' : 'NÃO');

  // CORREÇÃO: Inicializar chat se for comando !gpt
  if (!req.body.fromMe && req.body.text && req.body.text.message === "!gpt") {
    console.log('🎯 Comando !gpt detectado');
    chats[req.body.phone] = {
      blocked: false,
      messages: [],
    };
    await replyMessage(req.body.phone, initialMessage);
    await appendChat(req.body.phone, ` OPENAI: ${initialMessage}`);
  }
  
  // Processar mensagens normais
  if (!req.body.fromMe && req.body.text && req.body.text.message) {
    console.log('✅ Mensagem válida recebida');
    await onNewMessage(req.body);
  } else {
    console.log('⚠️ Mensagem ignorada (fromMe ou sem texto)');
  }

  console.log('✅ Webhook processado com sucesso');
  res.status(200).send({ message: "success" });
});

app.get("/", (req, res) => {
  res.send("🤖 Chat GPT Z-API está rodando!");
});

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    timestamp: new Date().toISOString(),
    chats_ativos: Object.keys(chats).length 
  });
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
  console.log(`🔗 Webhook: http://localhost:${port}/on-new-message`);
});
