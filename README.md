# 🏥 Sistema de Faturamento - Carmo & Palitot Health Institute

Sistema web completo de controle de faturamento para clínica médica.

## 🔐 Acesso ao Sistema

### Credenciais Iniciais
- **Usuário:** `admin`
- **Senha:** `@CarmoPalitot1`

⚠️ **IMPORTANTE:** Troque a senha após o primeiro acesso!

## 🚀 Deploy no Railway

### Passo 1: Criar Conta
1. Acesse [railway.app](https://railway.app)
2. Clique em "Start a New Project"
3. Faça login com GitHub

### Passo 2: Deploy
1. Clique em "+ New Project"
2. Escolha "Deploy from GitHub repo"
3. Ou escolha "Deploy" e faça upload do ZIP

### Passo 3: Configurar
- O Railway vai detectar automaticamente que é Node.js
- Vai instalar dependências automaticamente
- Vai criar o banco de dados SQLite
- Vai inserir o usuário admin automaticamente

### Passo 4: Acessar
- URL gerada: `https://seu-projeto.railway.app`
- Login: `admin` / `@CarmoPalitot1`

## 💻 Rodar Localmente

```bash
# Instalar dependências
npm install

# Iniciar servidor
npm start

# Ou em modo desenvolvimento
npm run dev
```

Acesse: `http://localhost:3000`

## 📦 Tecnologias

- **Backend:** Node.js + Express
- **Banco de Dados:** SQLite
- **Autenticação:** bcrypt + express-session
- **Frontend:** HTML5 + CSS3 + JavaScript

## 🔒 Segurança

- ✅ Senha criptografada com bcrypt
- ✅ Sessão segura com express-session
- ✅ Timeout automático (30 minutos)
- ✅ HttpOnly cookies
- ✅ Proteção de rotas

## 📊 Funcionalidades

- ✅ Controle de lançamentos
- ✅ Gestão de despesas (parcelamento até 48x)
- ✅ Retiradas de lucros
- ✅ Relatórios financeiros completos
- ✅ Filtros avançados
- ✅ Exportação PDF/Excel
- ✅ Sistema de login seguro

## 🛠️ Suporte

Para dúvidas ou problemas, entre em contato.

---

**Desenvolvido para Carmo & Palitot Health Institute**
