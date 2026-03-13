const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// SCRIPT DE IMPORTAÇÃO DE DADOS
// Este script importa os dados do arquivo SQL gerado
// no banco de dados do Railway

const dbRailway = new sqlite3.Database('./clinica.db');

const importData = async () => {
    console.log('📥 Importando dados para o banco do Railway...\n');
    
    if (!fs.existsSync('dados-exportados.sql')) {
        console.error('❌ Arquivo dados-exportados.sql não encontrado!');
        console.log('Execute primeiro o script de exportação no PC local.');
        process.exit(1);
    }
    
    const sql = fs.readFileSync('dados-exportados.sql', 'utf8');
    
    // Separar comandos SQL (um por linha)
    const commands = sql.split('\n')
        .filter(line => line.trim().startsWith('INSERT'))
        .filter(line => line.trim().length > 0);
    
    console.log(`📊 Total de comandos SQL: ${commands.length}\n`);
    
    let imported = 0;
    let errors = 0;
    
    for (const cmd of commands) {
        try {
            await new Promise((resolve, reject) => {
                dbRailway.run(cmd, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            imported++;
            if (imported % 10 === 0) {
                process.stdout.write(`\r📦 Importados: ${imported}/${commands.length}`);
            }
        } catch (err) {
            errors++;
            // Ignorar erros de duplicatas (já existe)
            if (!err.message.includes('UNIQUE constraint')) {
                console.log(`\n⚠️  Erro: ${err.message}`);
            }
        }
    }
    
    console.log(`\n\n✅ Importação concluída!`);
    console.log(`📊 Registros importados: ${imported}`);
    if (errors > 0) {
        console.log(`⚠️  Erros/Duplicatas: ${errors}`);
    }
    
    dbRailway.close();
};

importData().catch(console.error);
