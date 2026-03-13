const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// SCRIPT DE EXPORTAÇÃO DE DADOS
// Este script lê o banco de dados local e gera um arquivo SQL
// com todos os dados (INSERT statements) que podem ser importados
// no Railway

const dbLocal = new sqlite3.Database('./clinica.db');

const exportData = async () => {
    console.log('📊 Exportando dados do banco local...\n');
    
    const tables = [
        'profissionais',
        'procedimentos', 
        'impostos_taxas',
        'lancamentos',
        'categorias_despesas',
        'subcategorias_despesas',
        'despesas',
        'retiradas'
    ];
    
    let sqlExport = `-- EXPORTAÇÃO DE DADOS - ${new Date().toISOString()}\n`;
    sqlExport += `-- Sistema de Faturamento Carmo & Palitot\n\n`;
    
    for (const table of tables) {
        try {
            const rows = await new Promise((resolve, reject) => {
                dbLocal.all(`SELECT * FROM ${table}`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            if (rows && rows.length > 0) {
                sqlExport += `\n-- Tabela: ${table} (${rows.length} registros)\n`;
                
                rows.forEach(row => {
                    const columns = Object.keys(row).join(', ');
                    const values = Object.values(row).map(v => {
                        if (v === null) return 'NULL';
                        if (typeof v === 'number') return v;
                        return `'${String(v).replace(/'/g, "''")}'`;
                    }).join(', ');
                    
                    sqlExport += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
                });
                
                console.log(`✅ ${table}: ${rows.length} registros exportados`);
            } else {
                console.log(`⚠️  ${table}: Tabela vazia`);
            }
        } catch (err) {
            console.log(`❌ ${table}: Erro ao exportar (${err.message})`);
        }
    }
    
    // Salvar arquivo
    fs.writeFileSync('dados-exportados.sql', sqlExport, 'utf8');
    
    console.log('\n✅ Exportação concluída!');
    console.log('📁 Arquivo gerado: dados-exportados.sql\n');
    console.log('📋 Próximos passos:');
    console.log('1. Faça deploy no Railway primeiro');
    console.log('2. Depois use o script de importação');
    
    dbLocal.close();
};

exportData().catch(console.error);
