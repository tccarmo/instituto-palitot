const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Sessão
app.use(session({
    secret: 'carmo-palitot-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 30 * 60 * 1000 // 30 minutos
    }
}));

// Middleware de autenticação
function requireAuth(req, res, next) {
    if (req.session && req.session.usuario) {
        req.session.cookie.maxAge = 30 * 60 * 1000; // renova timeout
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    res.redirect('/login');
}

// Arquivos estáticos sem autenticação (login.html, css, js)
app.use(express.static('public'));

// Rotas públicas
app.get('/login', (req, res) => {
    if (req.session && req.session.usuario) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// POST login
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }
    db.get('SELECT * FROM usuarios WHERE usuario = ?', [usuario], async (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const match = await bcrypt.compare(senha, row.senha_hash);
        if (!match) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        req.session.usuario = row.usuario;
        req.session.usuario_id = row.id;
        res.json({ success: true, usuario: row.usuario });
    });
});

// POST logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// GET verificar sessão
app.get('/api/session', (req, res) => {
    if (req.session && req.session.usuario) {
        return res.json({ autenticado: true, usuario: req.session.usuario });
    }
    res.json({ autenticado: false });
});

// Inicializar banco de dados
const fs = require('fs');

// Se não existe clinica.db, copiar do backup
if (!fs.existsSync('./clinica.db') && fs.existsSync('./clinica-backup.db')) {
    console.log('📋 Copiando banco de dados do backup...');
    fs.copyFileSync('./clinica-backup.db', './clinica.db');
    console.log('✅ Banco copiado!');
}

const db = new sqlite3.Database('./clinica.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados SQLite');
        inicializarBancoDeDados();
    }
});

// Criar tabelas
function inicializarBancoDeDados() {
    db.serialize(() => {
        // Tabela de Usuários
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inserir usuário admin na primeira execução
        db.get('SELECT COUNT(*) as count FROM usuarios', async (err, row) => {
            if (!err && row.count === 0) {
                const hash = await bcrypt.hash('@CarmoPalitot1', 10);
                db.run('INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)', ['admin', hash]);
            }
        });

        // IMPORTAÇÃO AUTOMÁTICA (EXECUTAR UMA VEZ)
const fs = require('fs');
if (fs.existsSync('./dados-exportados.sql')) {
    console.log('📥 Importando dados...');
    const sql = fs.readFileSync('./dados-exportados.sql', 'utf8');
    const cmds = sql.split('\n').filter(l => l.trim().startsWith('INSERT'));
    
    let imported = 0;
    cmds.forEach(cmd => {
        try {
            db.run(cmd);
            imported++;
        } catch (err) {
            // Ignora erros de duplicata
        }
    });
    
    console.log(`✅ ${imported} registros importados!`);
    // Deletar arquivo após importar
    fs.unlinkSync('./dados-exportados.sql');
}

        // Tabela de Profissionais
        db.run(`
            CREATE TABLE IF NOT EXISTS profissionais (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                funcao TEXT NOT NULL,
                numero_orgao TEXT NOT NULL,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Procedimentos
        db.run(`
            CREATE TABLE IF NOT EXISTS procedimentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                tipo TEXT NOT NULL,
                tem_bonificacao BOOLEAN DEFAULT 0,
                tipo_bonificacao TEXT,
                valor_bonificacao REAL,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Impostos e Taxas
        db.run(`
            CREATE TABLE IF NOT EXISTS impostos_taxas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                imposto_clinico REAL DEFAULT 0,
                imposto_hospitalar REAL DEFAULT 0,
                imposto_cursos REAL DEFAULT 0,
                taxa_debito REAL DEFAULT 0,
                taxa_credito_vista REAL DEFAULT 0,
                taxa_credito_parcelado REAL DEFAULT 0,
                data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Adicionar coluna imposto_cursos se não existir (para bancos antigos)
        db.run(`ALTER TABLE impostos_taxas ADD COLUMN imposto_cursos REAL DEFAULT 0`, (err) => {
            // Ignora erro se coluna já existir
        });

        // Inserir configuração padrão de impostos se não existir
        db.get('SELECT COUNT(*) as count FROM impostos_taxas', (err, row) => {
            if (!err && row.count === 0) {
                db.run(`
                    INSERT INTO impostos_taxas (imposto_clinico, imposto_hospitalar, imposto_cursos, taxa_debito, taxa_credito_vista, taxa_credito_parcelado)
                    VALUES (0, 0, 0, 0, 0, 0)
                `);
            }
        });

        // Tabela de Lançamentos
        db.run(`
            CREATE TABLE IF NOT EXISTS lancamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                nome_paciente TEXT NOT NULL,
                procedimento TEXT NOT NULL,
                valor REAL NOT NULL,
                forma_pagamento TEXT NOT NULL,
                parcelas INTEGER DEFAULT 1,
                profissional_executante TEXT NOT NULL,
                tem_comissao BOOLEAN DEFAULT 0,
                comissao_para TEXT,
                tipo_comissao TEXT,
                valor_comissao REAL,
                tem_indicacao BOOLEAN DEFAULT 0,
                indicado_por TEXT,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabela de Categorias de Despesas
        db.run(`
            CREATE TABLE IF NOT EXISTS categorias_despesas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                tipo TEXT NOT NULL,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabela de Subcategorias de Despesas
        db.run(`
            CREATE TABLE IF NOT EXISTS subcategorias_despesas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoria_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (categoria_id) REFERENCES categorias_despesas(id)
            )
        `);
        
        // Tabela de Despesas
        db.run(`
            CREATE TABLE IF NOT EXISTS despesas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                tipo_despesa TEXT NOT NULL,
                categoria_id INTEGER,
                subcategoria_id INTEGER,
                descricao TEXT,
                valor REAL NOT NULL,
                forma_pagamento TEXT NOT NULL,
                parcelas INTEGER DEFAULT 1,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (categoria_id) REFERENCES categorias_despesas(id),
                FOREIGN KEY (subcategoria_id) REFERENCES subcategorias_despesas(id)
            )
        `);
        
        // Tabela de Retiradas de Lucros
        db.run(`
            CREATE TABLE IF NOT EXISTS retiradas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                profissional TEXT NOT NULL,
                valor REAL NOT NULL,
                descricao TEXT,
                data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    });
}

// Proteger todas as rotas da API e página principal
app.use('/api/', requireAuth);

// ==================== ROTAS - PROFISSIONAIS ====================

// Listar profissionais
app.get('/api/profissionais', (req, res) => {
    db.all('SELECT * FROM profissionais ORDER BY nome', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Adicionar profissional
app.post('/api/profissionais', (req, res) => {
    const { nome, funcao, numero_orgao } = req.body;
    
    db.run(
        'INSERT INTO profissionais (nome, funcao, numero_orgao) VALUES (?, ?, ?)',
        [nome, funcao, numero_orgao],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Atualizar profissional
app.put('/api/profissionais/:id', (req, res) => {
    const { id } = req.params;
    const { nome, funcao, numero_orgao } = req.body;
    
    db.run(
        'UPDATE profissionais SET nome = ?, funcao = ?, numero_orgao = ? WHERE id = ?',
        [nome, funcao, numero_orgao, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, changes: this.changes });
        }
    );
});

// Atualizar nome do profissional em todos os lançamentos
app.post('/api/profissionais/atualizar-nome-lancamentos', (req, res) => {
    const { nomeAntigo, nomeNovo } = req.body;
    
    db.serialize(() => {
        // Atualizar profissional_executante
        db.run(
            'UPDATE lancamentos SET profissional_executante = ? WHERE profissional_executante = ?',
            [nomeNovo, nomeAntigo]
        );
        
        // Atualizar comissao_para
        db.run(
            'UPDATE lancamentos SET comissao_para = ? WHERE comissao_para = ?',
            [nomeNovo, nomeAntigo]
        );
        
        // Atualizar indicado_por
        db.run(
            'UPDATE lancamentos SET indicado_por = ? WHERE indicado_por = ?',
            [nomeNovo, nomeAntigo],
            function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ success: true, message: 'Lançamentos atualizados com sucesso' });
            }
        );
    });
});

// Excluir profissional
app.delete('/api/profissionais/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM profissionais WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// ==================== ROTAS - PROCEDIMENTOS ====================

// Listar procedimentos
app.get('/api/procedimentos', (req, res) => {
    db.all('SELECT * FROM procedimentos ORDER BY nome', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Adicionar procedimento
app.post('/api/procedimentos', (req, res) => {
    const { nome, tipo, tem_bonificacao, tipo_bonificacao, valor_bonificacao } = req.body;
    
    db.run(
        'INSERT INTO procedimentos (nome, tipo, tem_bonificacao, tipo_bonificacao, valor_bonificacao) VALUES (?, ?, ?, ?, ?)',
        [nome, tipo, tem_bonificacao ? 1 : 0, tipo_bonificacao, valor_bonificacao],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Atualizar procedimento
app.put('/api/procedimentos/:id', (req, res) => {
    const { id } = req.params;
    const { nome, tipo, tem_bonificacao, tipo_bonificacao, valor_bonificacao } = req.body;
    
    db.run(
        'UPDATE procedimentos SET nome = ?, tipo = ?, tem_bonificacao = ?, tipo_bonificacao = ?, valor_bonificacao = ? WHERE id = ?',
        [nome, tipo, tem_bonificacao ? 1 : 0, tipo_bonificacao, valor_bonificacao, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, changes: this.changes });
        }
    );
});

// Atualizar nome do procedimento em todos os lançamentos
app.post('/api/procedimentos/atualizar-nome-lancamentos', (req, res) => {
    const { nomeAntigo, nomeNovo } = req.body;
    
    db.run(
        'UPDATE lancamentos SET procedimento = ? WHERE procedimento = ?',
        [nomeNovo, nomeAntigo],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, message: 'Lançamentos atualizados com sucesso' });
        }
    );
});

// Excluir procedimento
app.delete('/api/procedimentos/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM procedimentos WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// ==================== ROTAS - IMPOSTOS E TAXAS ====================

// Obter impostos e taxas
app.get('/api/impostos', (req, res) => {
    db.get('SELECT * FROM impostos_taxas ORDER BY id DESC LIMIT 1', (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

// Atualizar impostos e taxas
app.put('/api/impostos', (req, res) => {
    const { imposto_clinico, imposto_hospitalar, imposto_cursos, taxa_debito, taxa_credito_vista, taxa_credito_parcelado } = req.body;
    
    db.run(
        `UPDATE impostos_taxas SET 
            imposto_clinico = ?, 
            imposto_hospitalar = ?,
            imposto_cursos = ?, 
            taxa_debito = ?, 
            taxa_credito_vista = ?, 
            taxa_credito_parcelado = ?,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = 1`,
        [imposto_clinico, imposto_hospitalar, imposto_cursos, taxa_debito, taxa_credito_vista, taxa_credito_parcelado],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, changes: this.changes });
        }
    );
});

// ==================== ROTAS - LANÇAMENTOS ====================

// Listar lançamentos
app.get('/api/lancamentos', (req, res) => {
    const { data_inicial, data_final, profissional, procedimento } = req.query;
    
    let query = 'SELECT * FROM lancamentos WHERE 1=1';
    const params = [];
    
    if (data_inicial) {
        query += ' AND data >= ?';
        params.push(data_inicial);
    }
    
    if (data_final) {
        query += ' AND data <= ?';
        params.push(data_final);
    }
    
    if (profissional) {
        query += ' AND profissional_executante = ?';
        params.push(profissional);
    }
    
    if (procedimento) {
        query += ' AND procedimento = ?';
        params.push(procedimento);
    }
    
    query += ' ORDER BY data DESC, id DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Adicionar lançamento
app.post('/api/lancamentos', (req, res) => {
    const {
        data,
        nome_paciente,
        procedimento,
        valor,
        forma_pagamento,
        parcelas,
        profissional_executante,
        tem_comissao,
        comissao_para,
        tipo_comissao,
        valor_comissao,
        tem_indicacao,
        indicado_por
    } = req.body;
    
    db.run(
        `INSERT INTO lancamentos (
            data, nome_paciente, procedimento, valor, forma_pagamento, parcelas,
            profissional_executante, tem_comissao, comissao_para, tipo_comissao,
            valor_comissao, tem_indicacao, indicado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data, nome_paciente, procedimento, valor, forma_pagamento, parcelas,
            profissional_executante, tem_comissao ? 1 : 0, comissao_para, tipo_comissao,
            valor_comissao, tem_indicacao ? 1 : 0, indicado_por
        ],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Atualizar lançamento
app.put('/api/lancamentos/:id', (req, res) => {
    const { id } = req.params;
    const {
        data,
        nome_paciente,
        procedimento,
        valor,
        forma_pagamento,
        parcelas,
        profissional_executante,
        tem_comissao,
        comissao_para,
        tipo_comissao,
        valor_comissao,
        tem_indicacao,
        indicado_por
    } = req.body;
    
    db.run(
        `UPDATE lancamentos SET
            data = ?, nome_paciente = ?, procedimento = ?, valor = ?, 
            forma_pagamento = ?, parcelas = ?, profissional_executante = ?,
            tem_comissao = ?, comissao_para = ?, tipo_comissao = ?,
            valor_comissao = ?, tem_indicacao = ?, indicado_por = ?
        WHERE id = ?`,
        [
            data, nome_paciente, procedimento, valor, forma_pagamento, parcelas,
            profissional_executante, tem_comissao ? 1 : 0, comissao_para, tipo_comissao,
            valor_comissao, tem_indicacao ? 1 : 0, indicado_por, id
        ],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, changes: this.changes });
        }
    );
});

// Excluir lançamento
app.delete('/api/lancamentos/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM lancamentos WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// ==================== ROTAS - RELATÓRIOS ====================

// Faturamento do mês
app.get('/api/relatorios/faturamento-mes', (req, res) => {
    const { ano, mes } = req.query;
    
    db.all(
        `SELECT 
            l.*,
            p.tipo as tipo_procedimento
        FROM lancamentos l
        LEFT JOIN procedimentos p ON l.procedimento = p.nome
        WHERE strftime('%Y', l.data) = ? AND strftime('%m', l.data) = ?
        ORDER BY l.data DESC`,
        [ano, mes.padStart(2, '0')],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Servir página principal (protegida)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota: Relatório de Produtividade
app.get('/api/relatorio-produtividade', requireAuth, (req, res) => {
    const { mes_inicio, mes_fim, profissional, procedimentos } = req.query;
    
    if (!mes_inicio || !mes_fim) {
        return res.status(400).json({ error: 'Período obrigatório' });
    }
    
    // Converter mes_inicio e mes_fim (formato: 'YYYY-MM') para datas
    const dataInicio = mes_inicio + '-01';
    const [ano, mes] = mes_fim.split('-');
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFim = mes_fim + '-' + ultimoDia;
    
    let query = `
        SELECT 
            l.data,
            l.procedimento,
            l.profissional_executante,
            l.valor,
            l.forma_pagamento,
            l.parcelas,
            p.tipo as tipo_procedimento
        FROM lancamentos l
        LEFT JOIN procedimentos p ON l.procedimento = p.nome
        WHERE l.data >= ? AND l.data <= ?
    `;
    
    const params = [dataInicio, dataFim];
    
    if (profissional && profissional !== 'todos') {
        query += ' AND l.profissional_executante = ?';
        params.push(profissional);
    }
    
    if (procedimentos && procedimentos !== 'todos') {
        const procList = procedimentos.split(',');
        const placeholders = procList.map(() => '?').join(',');
        query += ` AND l.procedimento IN (${placeholders})`;
        params.push(...procList);
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Buscar configuração de impostos
        db.get('SELECT * FROM impostos_taxas ORDER BY id DESC LIMIT 1', (err, impostos) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ 
                lancamentos: rows,
                impostos: impostos || {}
            });
        });
    });
});


// ============================================
// SISTEMA DE BACKUP AUTOMÁTICO
// Adicione este código NO FINAL do server.js, ANTES do app.listen
// ============================================

const cron = require('node-cron');
const path = require('path');

// Função para criar backup
function criarBackupAutomatico() {
    const fs = require('fs');
    const dataHoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const backupPath = `./clinica-backup-${dataHoje}.db`;
    const dbPath = './clinica.db';
    
    if (!fs.existsSync(dbPath)) {
        console.log('⚠️  Banco de dados não encontrado para backup');
        return;
    }
    
    try {
        // Criar backup
        fs.copyFileSync(dbPath, backupPath);
        console.log(`✅ Backup criado: ${backupPath}`);
        
        // Limpar backups antigos (manter últimos 7 dias)
        limparBackupsAntigos();
        
    } catch (err) {
        console.error('❌ Erro ao criar backup:', err);
    }
}

// Função para limpar backups antigos
function limparBackupsAntigos() {
    const fs = require('fs');
    const diasManter = 7;
    const agora = Date.now();
    const milissegundosPorDia = 24 * 60 * 60 * 1000;
    
    try {
        const arquivos = fs.readdirSync('.');
        const backups = arquivos.filter(f => f.startsWith('clinica-backup-') && f.endsWith('.db'));
        
        backups.forEach(backup => {
            const stats = fs.statSync(backup);
            const idadeEmDias = (agora - stats.mtime.getTime()) / milissegundosPorDia;
            
            if (idadeEmDias > diasManter) {
                fs.unlinkSync(backup);
                console.log(`🗑️  Backup antigo removido: ${backup}`);
            }
        });
        
    } catch (err) {
        console.error('⚠️  Erro ao limpar backups antigos:', err);
    }
}

// Agendar backup diário às 03:00 (horário do servidor)
// Formato: minuto hora dia mês dia-da-semana
cron.schedule('0 3 * * *', () => {
    console.log('🕐 Executando backup automático agendado...');
    criarBackupAutomatico();
});

// Criar backup ao iniciar o servidor (primeira vez)
console.log('📋 Criando backup inicial...');
criarBackupAutomatico();

// Rota: Listar backups disponíveis
app.get('/api/backups/list', requireAuth, (req, res) => {
    const fs = require('fs');
    
    try {
        const arquivos = fs.readdirSync('.');
        const backups = arquivos
            .filter(f => f.startsWith('clinica-backup-') && f.endsWith('.db'))
            .map(f => {
                const stats = fs.statSync(f);
                const data = f.replace('clinica-backup-', '').replace('.db', '');
                return {
                    nome: f,
                    data: data,
                    tamanho: stats.size,
                    tamanhoMB: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    criado: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => b.data.localeCompare(a.data)); // Mais recente primeiro
        
        res.json({
            total: backups.length,
            backups: backups
        });
        
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar backups' });
    }
});

// Rota: Baixar backup específico
app.get('/api/backups/download/:data', requireAuth, (req, res) => {
    const fs = require('fs');
    const data = req.params.data;
    const backupPath = `./clinica-backup-${data}.db`;
    
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: 'Backup não encontrado' });
    }
    
    res.download(backupPath, `backup-${data}.db`, (err) => {
        if (err) {
            console.error('Erro ao baixar backup:', err);
            res.status(500).json({ error: 'Erro ao baixar backup' });
        }
    });
});

// Rota: Restaurar backup (CUIDADO!)
app.post('/api/backups/restore/:data', requireAuth, (req, res) => {
    const fs = require('fs');
    const data = req.params.data;
    const backupPath = `./clinica-backup-${data}.db`;
    const dbPath = './clinica.db';
    
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: 'Backup não encontrado' });
    }
    
    try {
        // Fazer backup do atual antes de restaurar
        const backupAtual = `./clinica-backup-antes-restauracao-${Date.now()}.db`;
        fs.copyFileSync(dbPath, backupAtual);
        
        // Restaurar backup
        fs.copyFileSync(backupPath, dbPath);
        
        res.json({ 
            success: true, 
            message: 'Backup restaurado com sucesso',
            backupAnterior: backupAtual
        });
        
    } catch (err) {
        console.error('Erro ao restaurar backup:', err);
        res.status(500).json({ error: 'Erro ao restaurar backup' });
    }
});

// Rota: Criar backup manual
app.post('/api/backups/create', requireAuth, (req, res) => {
    try {
        criarBackupAutomatico();
        res.json({ 
            success: true, 
            message: 'Backup manual criado com sucesso' 
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar backup' });
    }
});

console.log('✅ Sistema de backup automático ativado!');
console.log('📋 Backups serão criados diariamente às 03:00');
console.log('📋 Backups mantidos: últimos 7 dias');


// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║                                                            ║
    ║   🏥 CARMO & PALITOT HEALTH INSTITUTE                     ║
    ║      Sistema de Controle de Faturamento                   ║
    ║                                                            ║
    ║   🚀 Servidor rodando em: http://localhost:${PORT}       ║
    ║                                                            ║
    ╚════════════════════════════════════════════════════════════╝
    `);
});

// ==================== ROTAS - DESPESAS ====================

// Listar categorias
app.get('/api/categorias-despesas', (req, res) => {
    db.all('SELECT * FROM categorias_despesas ORDER BY nome', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Criar categoria
app.post('/api/categorias-despesas', (req, res) => {
    const { nome, tipo } = req.body;
    
    db.run(
        'INSERT INTO categorias_despesas (nome, tipo) VALUES (?, ?)',
        [nome, tipo],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Excluir categoria
app.delete('/api/categorias-despesas/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM categorias_despesas WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Listar subcategorias
app.get('/api/subcategorias-despesas', (req, res) => {
    const { categoria_id } = req.query;
    
    let query = 'SELECT * FROM subcategorias_despesas';
    let params = [];
    
    if (categoria_id) {
        query += ' WHERE categoria_id = ?';
        params.push(categoria_id);
    }
    
    query += ' ORDER BY nome';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Criar subcategoria
app.post('/api/subcategorias-despesas', (req, res) => {
    const { categoria_id, nome } = req.body;
    
    db.run(
        'INSERT INTO subcategorias_despesas (categoria_id, nome) VALUES (?, ?)',
        [categoria_id, nome],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Excluir subcategoria
app.delete('/api/subcategorias-despesas/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM subcategorias_despesas WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Listar despesas
app.get('/api/despesas', (req, res) => {
    const { data_inicial, data_final } = req.query;
    
    let query = `
        SELECT 
            d.*,
            c.nome as categoria_nome,
            c.tipo as categoria_tipo,
            s.nome as subcategoria_nome
        FROM despesas d
        LEFT JOIN categorias_despesas c ON d.categoria_id = c.id
        LEFT JOIN subcategorias_despesas s ON d.subcategoria_id = s.id
        WHERE 1=1
    `;
    let params = [];
    
    if (data_inicial) {
        query += ' AND d.data >= ?';
        params.push(data_inicial);
    }
    
    if (data_final) {
        query += ' AND d.data <= ?';
        params.push(data_final);
    }
    
    query += ' ORDER BY d.data DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Criar despesa
app.post('/api/despesas', (req, res) => {
    const { data, tipo_despesa, categoria_id, subcategoria_id, descricao, valor, forma_pagamento, parcelas } = req.body;
    
    db.run(
        `INSERT INTO despesas (
            data, tipo_despesa, categoria_id, subcategoria_id, descricao, valor, forma_pagamento, parcelas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [data, tipo_despesa, categoria_id || null, subcategoria_id || null, descricao, valor, forma_pagamento, parcelas || 1],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Excluir despesa
app.delete('/api/despesas/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM despesas WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// ==================== ROTAS - RETIRADAS ====================

// Listar retiradas
app.get('/api/retiradas', (req, res) => {
    const { data_inicial, data_final, profissional } = req.query;
    
    let query = 'SELECT * FROM retiradas WHERE 1=1';
    let params = [];
    
    if (data_inicial) {
        query += ' AND data >= ?';
        params.push(data_inicial);
    }
    
    if (data_final) {
        query += ' AND data <= ?';
        params.push(data_final);
    }
    
    if (profissional) {
        query += ' AND profissional = ?';
        params.push(profissional);
    }
    
    query += ' ORDER BY data DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Criar retirada
app.post('/api/retiradas', (req, res) => {
    const { data, profissional, valor, descricao } = req.body;
    
    db.run(
        'INSERT INTO retiradas (data, profissional, valor, descricao) VALUES (?, ?, ?, ?)',
        [data, profissional, valor, descricao || null],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Excluir retirada
app.delete('/api/retiradas/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM retiradas WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Tratamento de erros
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Erro ao fechar banco de dados:', err);
        } else {
            console.log('\n✅ Banco de dados fechado com sucesso');
        }
        process.exit(0);
    });
});
