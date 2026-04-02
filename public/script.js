// Configuração da API
const API_URL = window.location.origin;

// Utilitários
async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro na API:', error);
        alert('Erro ao comunicar com o servidor. Tente novamente.');
        throw error;
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    await carregarSessao();
    atualizarMesAtual();
    await carregarDados();
    definirDataAtual();
});

async function carregarSessao() {
    try {
        const res = await fetch('/api/session');
        if (!res.ok) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (!data.autenticado) { window.location.href = '/login'; return; }
        const el = document.getElementById('nomeUsuarioLogado');
        if (el) el.textContent = data.usuario;
    } catch (e) {
        window.location.href = '/login';
    }
}

async function fazerLogout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
}

async function carregarDados() {
    await Promise.all([
        atualizarDashboard(),
        carregarLancamentosRecentes(),
        carregarProfissionais(),
        carregarProcedimentos(),
        carregarImpostos(),
        carregarCategoriasDespesas(),
        carregarDespesasRecentes(),
        carregarRetiradasRecentes()
    ]);
    popularSelects();
    popularSelectsRetiradas();
}

function definirDataAtual() {
    const hoje = new Date().toISOString().split('T')[0];
    const dataInput = document.getElementById('dataLancamento');
    if (dataInput) {
        dataInput.value = hoje;
    }
}

function atualizarMesAtual() {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const mesAtual = meses[mesAtualDashboard.getMonth()] + ' ' + mesAtualDashboard.getFullYear();
    document.getElementById('mesAtual').textContent = mesAtual;
    
    // Atualizar seletor de mês
    const ano = mesAtualDashboard.getFullYear();
    const mes = String(mesAtualDashboard.getMonth() + 1).padStart(2, '0');
    document.getElementById('seletorMes').value = `${ano}-${mes}`;
}

function mudarMes(direcao) {
    mesAtualDashboard.setMonth(mesAtualDashboard.getMonth() + direcao);
    atualizarMesAtual();
    atualizarDashboard();
}

function mesAnterior() {
    mudarMes(-1);
}

function proximoMes() {
    mudarMes(1);
}

function carregarMesSelecionado() {
    const mesAno = document.getElementById('seletorMes').value;
    if (mesAno) {
        const [ano, mes] = mesAno.split('-');
        mesAtualDashboard = new Date(ano, mes - 1, 1);
        atualizarMesAtual();
        atualizarDashboard();
    }
}

async function atualizarDashboard() {
    const ano = mesAtualDashboard.getFullYear();
    const mes = String(mesAtualDashboard.getMonth() + 1).padStart(2, '0');

    const lancamentos = await fetchAPI(`/api/relatorios/faturamento-mes?ano=${ano}&mes=${mes}`);
    
    // Organizar por profissional e procedimento
    const faturamentoPorProfissional = {};
    let totalGeralClinica = 0;

    lancamentos.forEach(l => {
        const profissional = l.profissional_executante;
        const procedimento = l.procedimento;
        const valor = parseFloat(l.valor);
        
        // Inicializar profissional se não existir
        if (!faturamentoPorProfissional[profissional]) {
            faturamentoPorProfissional[profissional] = {
                procedimentos: {},
                total: 0
            };
        }
        
        // Inicializar procedimento se não existir
        if (!faturamentoPorProfissional[profissional].procedimentos[procedimento]) {
            faturamentoPorProfissional[profissional].procedimentos[procedimento] = 0;
        }
        
        // Somar valores
        faturamentoPorProfissional[profissional].procedimentos[procedimento] += valor;
        faturamentoPorProfissional[profissional].total += valor;
        totalGeralClinica += valor;
    });

    const container = document.getElementById('faturamentoCards');
    container.innerHTML = '';

    if (Object.keys(faturamentoPorProfissional).length === 0) {
        container.innerHTML = '<div class="card"><h3>Nenhum lançamento este mês</h3><div class="valor">R$ 0,00</div></div>';
    } else {
        // Criar card para cada profissional
        Object.keys(faturamentoPorProfissional).sort().forEach(profissional => {
            const dados = faturamentoPorProfissional[profissional];
            
            const card = document.createElement('div');
            card.className = 'card card-profissional';
            
            // Montar lista de procedimentos
            let procedimentosHTML = '';
            Object.keys(dados.procedimentos).sort().forEach(procedimento => {
                const valor = dados.procedimentos[procedimento];
                procedimentosHTML += `
                    <div class="procedimento-linha">
                        <span class="procedimento-nome">${procedimento}</span>
                        <span class="procedimento-valor">R$ ${formatarReal(valor)}</span>
                    </div>
                `;
            });
            
            card.innerHTML = `
                <h3 class="profissional-nome">${profissional}</h3>
                <div class="procedimentos-lista">
                    ${procedimentosHTML}
                </div>
                <div class="total-profissional">
                    <span>TOTAL</span>
                    <span class="valor">R$ ${formatarReal(dados.total)}</span>
                </div>
            `;
            container.appendChild(card);
        });

        // Card de total geral da clínica
        const cardTotal = document.createElement('div');
        cardTotal.className = 'card total';
        cardTotal.innerHTML = `
            <h3>TOTAL GERAL DA CLÍNICA</h3>
            <div class="valor">R$ ${formatarReal(totalGeralClinica)}</div>
        `;
        container.appendChild(cardTotal);
    }
}

// Variáveis globais para paginação e filtros
let paginaAtualLancamentos = 1;
let itensPorPagina = 20;
let lancamentosFiltrados = [];
let mesAtualDashboard = new Date();

async function carregarLancamentosRecentes() {
    const lancamentos = await fetchAPI('/api/lancamentos');
    lancamentosFiltrados = lancamentos;
    
    // Popular selects de filtro
    const selectProfissional = document.getElementById('filtroProfissional');
    const selectProcedimento = document.getElementById('filtroProcedimento');
    
    if (selectProfissional) {
        selectProfissional.innerHTML = '<option value="">Todos</option>';
        dadosProfissionais.forEach(p => {
            const option = document.createElement('option');
            option.value = p.nome;
            option.textContent = p.nome;
            selectProfissional.appendChild(option);
        });
    }
    
    if (selectProcedimento) {
        selectProcedimento.innerHTML = '<option value="">Todos</option>';
        dadosProcedimentos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.nome;
            option.textContent = p.nome;
            selectProcedimento.appendChild(option);
        });
    }
    
    renderizarLancamentos();
}

function renderizarLancamentos() {
    const tbody = document.getElementById('corpoTabelaLancamentos');
    tbody.innerHTML = '';

    if (lancamentosFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum lançamento encontrado</td></tr>';
        document.getElementById('infoPagina').textContent = 'Nenhum resultado';
        document.getElementById('btnPaginaAnterior').disabled = true;
        document.getElementById('btnProximaPagina').disabled = true;
        return;
    }

    // Calcular índices da página
    const inicio = (paginaAtualLancamentos - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const lancamentosPagina = lancamentosFiltrados.slice(inicio, fim);
    const totalPaginas = Math.ceil(lancamentosFiltrados.length / itensPorPagina);

    lancamentosPagina.forEach(l => {
        const tr = document.createElement('tr');
        const formaPag = l.forma_pagamento === 'credito' && l.parcelas > 1 
            ? `Crédito ${l.parcelas}x` 
            : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1);
        
        tr.innerHTML = `
            <td>${formatarData(l.data)}</td>
            <td>${l.nome_paciente}</td>
            <td>${l.procedimento}</td>
            <td>${l.profissional_executante}</td>
            <td>R$ ${formatarReal(parseFloat(l.valor))}</td>
            <td>${formaPag}</td>
            <td>
                <button class="btn-secondary btn-small" onclick="editarLancamento(${l.id})">Editar</button>
                <button class="btn-danger btn-small" onclick="excluirLancamento(${l.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Atualizar informações de paginação
    document.getElementById('infoPagina').textContent = `Página ${paginaAtualLancamentos} de ${totalPaginas} (${lancamentosFiltrados.length} lançamentos)`;
    document.getElementById('btnPaginaAnterior').disabled = paginaAtualLancamentos === 1;
    document.getElementById('btnProximaPagina').disabled = paginaAtualLancamentos >= totalPaginas;
}

function proximaPagina() {
    const totalPaginas = Math.ceil(lancamentosFiltrados.length / itensPorPagina);
    if (paginaAtualLancamentos < totalPaginas) {
        paginaAtualLancamentos++;
        renderizarLancamentos();
    }
}

function paginaAnterior() {
    if (paginaAtualLancamentos > 1) {
        paginaAtualLancamentos--;
        renderizarLancamentos();
    }
}

async function aplicarFiltrosLancamentos() {
    const paciente = document.getElementById('filtroPaciente').value.toLowerCase();
    const dataInicial = document.getElementById('filtroDataInicial').value;
    const dataFinal = document.getElementById('filtroDataFinal').value;
    const profissional = document.getElementById('filtroProfissional').value;
    const procedimento = document.getElementById('filtroProcedimento').value;
    
    const lancamentos = await fetchAPI('/api/lancamentos');
    
    lancamentosFiltrados = lancamentos.filter(l => {
        let passa = true;
        
        if (paciente && !l.nome_paciente.toLowerCase().includes(paciente)) passa = false;
        if (dataInicial && l.data < dataInicial) passa = false;
        if (dataFinal && l.data > dataFinal) passa = false;
        if (profissional && l.profissional_executante !== profissional) passa = false;
        if (procedimento && l.procedimento !== procedimento) passa = false;
        
        return passa;
    });
    
    paginaAtualLancamentos = 1;
    renderizarLancamentos();
}

function limparFiltrosLancamentos() {
    document.getElementById('filtroPaciente').value = '';
    document.getElementById('filtroDataInicial').value = '';
    document.getElementById('filtroDataFinal').value = '';
    document.getElementById('filtroProfissional').value = '';
    document.getElementById('filtroProcedimento').value = '';
    
    carregarLancamentosRecentes();
}

function formatarData(data) {
    const partes = data.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Formatar número para R$ (padrão brasileiro)
function formatarReal(numero) {
    if (typeof numero === 'string') numero = parseFloat(numero);
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatar campo de moeda (R$ 0.000,00)
function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, ''); // Remove tudo que não é número
    valor = (valor / 100).toFixed(2); // Divide por 100 para ter centavos
    
    // Formata com separadores de milhar e decimal
    valor = valor.replace('.', ',');
    valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    
    input.value = valor;
}

// Converter valor formatado para número
function valorParaNumero(valorFormatado) {
    return parseFloat(valorFormatado.replace(/\./g, '').replace(',', '.')) || 0;
}

// Aplicar máscara de moeda em tempo real
function aplicarMascaraMoeda(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.addEventListener('input', function() {
            formatarMoeda(this);
        });
        
        // Formatar valor inicial se houver
        if (input.value) {
            formatarMoeda(input);
        }
    }
}

// Modais
function abrirModalLancamento() {
    document.getElementById('modalLancamento').style.display = 'block';
    document.getElementById('formLancamento').reset();
    definirDataAtual();
    document.getElementById('grupoParcelas').style.display = 'none';
    document.getElementById('grupoComissao').style.display = 'none';
    document.getElementById('grupoIndicacaoCheckbox').style.display = 'none';
    document.getElementById('grupoIndicacao').style.display = 'none';
}

async function abrirConfiguracoes() {
    document.getElementById('modalConfiguracoes').style.display = 'block';
    await Promise.all([
        carregarProfissionais(),
        carregarProcedimentos(),
        carregarImpostos()
    ]);
}

async function abrirRelatorios() {
    document.getElementById('modalRelatorios').style.display = 'block';
    await popularSelectsRelatorios();
}

function abrirModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function fecharModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let modal of modals) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
}

// Popular Selects
let dadosProfissionais = [];
let dadosProcedimentos = [];

async function popularSelects() {
    const selectsProfissional = [
        'profissionalExecutante',
        'comissaoPara',
        'indicadoPor'
    ];

    selectsProfissional.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione...</option>';
            dadosProfissionais.forEach(p => {
                const option = document.createElement('option');
                option.value = p.nome;
                option.textContent = p.nome;
                select.appendChild(option);
            });
            if (valorAtual) select.value = valorAtual;
        }
    });

    const selectProcedimento = document.getElementById('procedimento');
    if (selectProcedimento) {
        selectProcedimento.innerHTML = '<option value="">Selecione...</option>';
        dadosProcedimentos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.nome;
            option.textContent = p.nome;
            option.dataset.temIndicacao = p.tem_bonificacao;
            option.dataset.procedimentoId = p.id;
            selectProcedimento.appendChild(option);
        });
    }
}

async function popularSelectsRelatorios() {
    const selectsProfissional = [
        'filtroProfissionalGeral',
        'filtroProfissionalPagamento',
        'filtroProfissionalReceber',
        'filtroProfissionalRepasse'
    ];

    selectsProfissional.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const primeiraOpcao = id.includes('Geral') || id.includes('Receber') || id.includes('Repasse') ? '<option value="">Todos</option>' : '<option value="">Selecione...</option>';
            select.innerHTML = primeiraOpcao;
            dadosProfissionais.forEach(p => {
                const option = document.createElement('option');
                option.value = p.nome;
                option.textContent = p.nome;
                select.appendChild(option);
            });
        }
    });

    const selectProcedimento = document.getElementById('filtroProcedimentoGeral');
    if (selectProcedimento) {
        selectProcedimento.innerHTML = '<option value="">Todos</option>';
        dadosProcedimentos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.nome;
            option.textContent = p.nome;
            selectProcedimento.appendChild(option);
        });
    }

    // Definir mês atual no filtro de valores a receber
    const hoje = new Date();
    const mesAnoAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const inputMesAno = document.getElementById('mesAnoReceber');
    if (inputMesAno) {
        inputMesAno.value = mesAnoAtual;
    }
    
    // Definir mês atual no filtro de repasse
    const inputMesAnoRepasse = document.getElementById('mesAnoRepasse');
    if (inputMesAnoRepasse) {
        inputMesAnoRepasse.value = mesAnoAtual;
    }
}

// Lançamentos
function mostrarParcelas() {
    const formaPagamento = document.getElementById('formaPagamento').value;
    const grupoParcelas = document.getElementById('grupoParcelas');
    
    if (formaPagamento === 'credito') {
        grupoParcelas.style.display = 'block';
    } else {
        grupoParcelas.style.display = 'none';
        document.getElementById('numeroParcelas').value = '1';
    }
}

function mostrarComissao() {
    const temComissao = document.getElementById('temComissao').checked;
    const grupoComissao = document.getElementById('grupoComissao');
    grupoComissao.style.display = temComissao ? 'block' : 'none';
}

function verificarIndicacao() {
    const procedimentoSelect = document.getElementById('procedimento');
    const selectedOption = procedimentoSelect.options[procedimentoSelect.selectedIndex];
    const temIndicacao = selectedOption.dataset.temIndicacao === '1';
    
    const grupoIndicacaoCheckbox = document.getElementById('grupoIndicacaoCheckbox');
    const grupoIndicacao = document.getElementById('grupoIndicacao');
    
    if (temIndicacao) {
        // Mostra o checkbox de indicação (mas não marca)
        grupoIndicacaoCheckbox.style.display = 'block';
    } else {
        // Esconde tudo se o procedimento não tiver bonificação
        grupoIndicacaoCheckbox.style.display = 'none';
        document.getElementById('temIndicacao').checked = false;
        grupoIndicacao.style.display = 'none';
    }
}

function mostrarIndicacao() {
    const temIndicacao = document.getElementById('temIndicacao').checked;
    const grupoIndicacao = document.getElementById('grupoIndicacao');
    grupoIndicacao.style.display = temIndicacao ? 'block' : 'none';
}

async function salvarLancamento(event) {
    event.preventDefault();

    // Validação do profissional executante
    const profissionalExecutante = document.getElementById('profissionalExecutante').value;
    if (!profissionalExecutante) {
        alert('Por favor, selecione o profissional executante!');
        document.getElementById('profissionalExecutante').focus();
        return;
    }

    const lancamento = {
        data: document.getElementById('dataLancamento').value,
        nome_paciente: document.getElementById('nomePaciente').value,
        procedimento: document.getElementById('procedimento').value,
        valor: valorParaNumero(document.getElementById('valorLancamento').value),
        forma_pagamento: document.getElementById('formaPagamento').value,
        parcelas: document.getElementById('formaPagamento').value === 'credito' 
            ? parseInt(document.getElementById('numeroParcelas').value) 
            : 1,
        profissional_executante: document.getElementById('profissionalExecutante').value,
        tem_comissao: document.getElementById('temComissao').checked,
        comissao_para: document.getElementById('temComissao').checked 
            ? document.getElementById('comissaoPara').value 
            : null,
        tipo_comissao: document.getElementById('temComissao').checked 
            ? document.querySelector('input[name="tipoComissao"]:checked').value 
            : null,
        valor_comissao: document.getElementById('temComissao').checked 
            ? valorParaNumero(document.getElementById('valorComissao').value)
            : 0,
        tem_indicacao: document.getElementById('temIndicacao').checked,
        indicado_por: document.getElementById('temIndicacao').checked 
            ? document.getElementById('indicadoPor').value 
            : null
    };

    await fetchAPI('/api/lancamentos', {
        method: 'POST',
        body: JSON.stringify(lancamento)
    });

    fecharModal('modalLancamento');
    await carregarDados();
    alert('Lançamento salvo com sucesso!');
}

async function excluirLancamento(id) {
    if (confirm('Deseja realmente excluir este lançamento?')) {
        await fetchAPI(`/api/lancamentos/${id}`, {
            method: 'DELETE'
        });
        await carregarDados();
    }
}

async function editarLancamento(id) {
    // Buscar o lançamento específico
    const lancamentos = await fetchAPI('/api/lancamentos');
    const lancamento = lancamentos.find(l => l.id === id);
    
    if (!lancamento) return;
    
    // Abrir modal
    document.getElementById('modalLancamento').style.display = 'block';
    
    // Preencher os campos
    document.getElementById('dataLancamento').value = lancamento.data;
    document.getElementById('nomePaciente').value = lancamento.nome_paciente;
    document.getElementById('valorLancamento').value = lancamento.valor;
    document.getElementById('formaPagamento').value = lancamento.forma_pagamento;
    
    // Aguardar os selects serem populados
    await popularSelects();
    
    // Preencher procedimento
    document.getElementById('procedimento').value = lancamento.procedimento;
    verificarIndicacao();
    
    // Preencher profissional executante
    document.getElementById('profissionalExecutante').value = lancamento.profissional_executante;
    
    // Parcelas
    if (lancamento.forma_pagamento === 'credito') {
        mostrarParcelas();
        document.getElementById('numeroParcelas').value = lancamento.parcelas;
    }
    
    // Comissão
    if (lancamento.tem_comissao) {
        document.getElementById('temComissao').checked = true;
        mostrarComissao();
        document.getElementById('comissaoPara').value = lancamento.comissao_para;
        document.querySelector(`input[name="tipoComissao"][value="${lancamento.tipo_comissao}"]`).checked = true;
        document.getElementById('valorComissao').value = lancamento.valor_comissao;
    }
    
    // Indicação
    if (lancamento.tem_indicacao) {
        document.getElementById('temIndicacao').checked = true;
        mostrarIndicacao();
        document.getElementById('indicadoPor').value = lancamento.indicado_por;
    }
    
    // Mudar o comportamento do formulário para edição
    const form = document.getElementById('formLancamento');
    const headerModal = document.querySelector('#modalLancamento .modal-header h2');
    const btnSubmit = document.querySelector('#formLancamento button[type="submit"]');
    
    headerModal.textContent = 'Editar Lançamento';
    btnSubmit.textContent = 'Salvar Alterações';
    
    form.onsubmit = async function(event) {
        event.preventDefault();
        
        // Validação do profissional executante
        const profissionalExecutante = document.getElementById('profissionalExecutante').value;
        if (!profissionalExecutante) {
            alert('Por favor, selecione o profissional executante!');
            document.getElementById('profissionalExecutante').focus();
            return;
        }
        
        const lancamentoAtualizado = {
            data: document.getElementById('dataLancamento').value,
            nome_paciente: document.getElementById('nomePaciente').value,
            procedimento: document.getElementById('procedimento').value,
            valor: parseFloat(document.getElementById('valorLancamento').value),
            forma_pagamento: document.getElementById('formaPagamento').value,
            parcelas: document.getElementById('formaPagamento').value === 'credito' 
                ? parseInt(document.getElementById('numeroParcelas').value) 
                : 1,
            profissional_executante: profissionalExecutante,
            tem_comissao: document.getElementById('temComissao').checked,
            comissao_para: document.getElementById('temComissao').checked 
                ? document.getElementById('comissaoPara').value 
                : null,
            tipo_comissao: document.getElementById('temComissao').checked 
                ? document.querySelector('input[name="tipoComissao"]:checked').value 
                : null,
            valor_comissao: document.getElementById('temComissao').checked 
                ? parseFloat(document.getElementById('valorComissao').value) 
                : 0,
            tem_indicacao: document.getElementById('temIndicacao').checked,
            indicado_por: document.getElementById('temIndicacao').checked 
                ? document.getElementById('indicadoPor').value 
                : null
        };
        
        await fetchAPI(`/api/lancamentos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(lancamentoAtualizado)
        });
        
        // Resetar formulário
        form.reset();
        form.onsubmit = salvarLancamento;
        headerModal.textContent = 'Adicionar Lançamento';
        btnSubmit.textContent = 'Salvar';
        
        fecharModal('modalLancamento');
        await carregarDados();
        alert('Lançamento atualizado com sucesso!');
    };
}

// Profissionais
function atualizarOrgaoClasse() {
    const funcao = document.getElementById('funcaoProfissional').value;
    const label = document.getElementById('labelOrgaoClasse');
    
    const orgaos = {
        'medico': 'CRM',
        'fisioterapeuta': 'CREFITO',
        'enfermeira': 'COREN',
        'outros': 'Número do Órgão de Classe'
    };
    
    label.textContent = orgaos[funcao] || 'Número do Órgão de Classe';
}

async function salvarProfissional(event) {
    event.preventDefault();

    const profissional = {
        nome: document.getElementById('nomeProfissional').value,
        funcao: document.getElementById('funcaoProfissional').value,
        numero_orgao: document.getElementById('numeroOrgaoClasse').value
    };

    await fetchAPI('/api/profissionais', {
        method: 'POST',
        body: JSON.stringify(profissional)
    });

    document.getElementById('formProfissional').reset();
    await carregarProfissionais();
    popularSelects();
    alert('Profissional cadastrado com sucesso!');
}

async function carregarProfissionais() {
    dadosProfissionais = await fetchAPI('/api/profissionais');
    const tbody = document.getElementById('listaProfissionais');
    tbody.innerHTML = '';

    if (dadosProfissionais.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum profissional cadastrado</td></tr>';
        return;
    }

    dadosProfissionais.forEach(p => {
        const tr = document.createElement('tr');
        const funcaoNome = {
            'medico': 'Médico',
            'fisioterapeuta': 'Fisioterapeuta',
            'enfermeira': 'Enfermeira',
            'outros': 'Outros'
        };
        
        tr.innerHTML = `
            <td>${p.nome}</td>
            <td>${funcaoNome[p.funcao]}</td>
            <td>${p.numero_orgao}</td>
            <td>
                <button class="btn-secondary btn-small" onclick="editarProfissional(${p.id})">Editar</button>
                <button class="btn-danger btn-small" onclick="excluirProfissional(${p.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function excluirProfissional(id) {
    if (confirm('Deseja realmente excluir este profissional?')) {
        await fetchAPI(`/api/profissionais/${id}`, {
            method: 'DELETE'
        });
        await carregarProfissionais();
        popularSelects();
    }
}

async function editarProfissional(id) {
    const profissional = dadosProfissionais.find(p => p.id === id);
    if (!profissional) return;
    
    document.getElementById('nomeProfissional').value = profissional.nome;
    document.getElementById('funcaoProfissional').value = profissional.funcao;
    document.getElementById('numeroOrgaoClasse').value = profissional.numero_orgao;
    
    atualizarOrgaoClasse();
    
    // Mudar texto do botão
    const btnSalvar = document.getElementById('btnSalvarProfissional');
    btnSalvar.textContent = 'Salvar Alterações';
    
    // Guardar o nome antigo para atualizar lançamentos
    const nomeAntigo = profissional.nome;
    
    // Mudar o comportamento do formulário para edição
    const form = document.getElementById('formProfissional');
    form.onsubmit = async function(event) {
        event.preventDefault();
        
        const nomeNovo = document.getElementById('nomeProfissional').value;
        
        const profissionalAtualizado = {
            nome: nomeNovo,
            funcao: document.getElementById('funcaoProfissional').value,
            numero_orgao: document.getElementById('numeroOrgaoClasse').value
        };
        
        // Se o nome mudou, perguntar se quer atualizar os lançamentos
        if (nomeAntigo !== nomeNovo) {
            const atualizar = confirm(
                `O nome foi alterado de "${nomeAntigo}" para "${nomeNovo}".\n\n` +
                `Deseja atualizar TODOS os lançamentos antigos com o novo nome?\n\n` +
                `Isso irá:\n` +
                `✓ Corrigir o nome em todos os lançamentos já salvos\n` +
                `✓ Manter o histórico unificado nos relatórios\n\n` +
                `Recomendamos clicar em OK!`
            );
            
            if (atualizar) {
                // Atualizar o profissional
                await fetchAPI(`/api/profissionais/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(profissionalAtualizado)
                });
                
                // Atualizar todos os lançamentos com o nome antigo
                await fetchAPI('/api/profissionais/atualizar-nome-lancamentos', {
                    method: 'POST',
                    body: JSON.stringify({ nomeAntigo, nomeNovo })
                });
                
                alert('Profissional e lançamentos atualizados com sucesso!');
            } else {
                // Apenas atualizar o profissional
                await fetchAPI(`/api/profissionais/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(profissionalAtualizado)
                });
                
                alert('Profissional atualizado! (Lançamentos antigos mantêm o nome anterior)');
            }
        } else {
            // Nome não mudou, apenas atualizar normalmente
            await fetchAPI(`/api/profissionais/${id}`, {
                method: 'PUT',
                body: JSON.stringify(profissionalAtualizado)
            });
            
            alert('Profissional atualizado com sucesso!');
        }
        
        form.reset();
        form.onsubmit = salvarProfissional;
        btnSalvar.textContent = 'Adicionar Profissional';
        await carregarProfissionais();
        await carregarDados(); // Recarregar dashboard e lançamentos
        popularSelects();
    };
    
    // Scroll para o formulário
    document.getElementById('nomeProfissional').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Procedimentos
function mostrarBonificacao() {
    const temBonificacao = document.getElementById('temBonificacaoIndicacao').checked;
    const grupoBonificacao = document.getElementById('grupoBonificacao');
    grupoBonificacao.style.display = temBonificacao ? 'block' : 'none';
}

async function salvarProcedimento(event) {
    event.preventDefault();

    const temBonificacao = document.getElementById('temBonificacaoIndicacao').checked;

    const procedimento = {
        nome: document.getElementById('nomeProcedimento').value,
        tipo: document.querySelector('input[name="tipoProcedimento"]:checked').value,
        tem_bonificacao: temBonificacao,
        tipo_bonificacao: temBonificacao 
            ? document.querySelector('input[name="tipoBonificacao"]:checked').value 
            : null,
        valor_bonificacao: temBonificacao 
            ? valorParaNumero(document.getElementById('valorBonificacao').value)
            : 0
    };

    await fetchAPI('/api/procedimentos', {
        method: 'POST',
        body: JSON.stringify(procedimento)
    });

    document.getElementById('formProcedimento').reset();
    await carregarProcedimentos();
    popularSelects();
    alert('Procedimento cadastrado com sucesso!');
}

async function carregarProcedimentos() {
    dadosProcedimentos = await fetchAPI('/api/procedimentos');
    const tbody = document.getElementById('listaProcedimentos');
    tbody.innerHTML = '';

    if (dadosProcedimentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum procedimento cadastrado</td></tr>';
        return;
    }

    dadosProcedimentos.forEach(p => {
        const tr = document.createElement('tr');
        const bonificacao = p.tem_bonificacao 
            ? `${p.valor_bonificacao}${p.tipo_bonificacao === 'percentual' ? '%' : ' R$'}` 
            : 'Não';
        
        tr.innerHTML = `
            <td>${p.nome}</td>
            <td>${p.tipo === 'clinico' ? 'Clínico' : 'Hospitalar'}</td>
            <td>${bonificacao}</td>
            <td>
                <button class="btn-secondary btn-small" onclick="editarProcedimento(${p.id})">Editar</button>
                <button class="btn-danger btn-small" onclick="excluirProcedimento(${p.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function excluirProcedimento(id) {
    if (confirm('Deseja realmente excluir este procedimento?')) {
        await fetchAPI(`/api/procedimentos/${id}`, {
            method: 'DELETE'
        });
        await carregarProcedimentos();
        popularSelects();
    }
}

async function editarProcedimento(id) {
    const procedimento = dadosProcedimentos.find(p => p.id === id);
    if (!procedimento) return;
    
    document.getElementById('nomeProcedimento').value = procedimento.nome;
    document.querySelector(`input[name="tipoProcedimento"][value="${procedimento.tipo}"]`).checked = true;
    
    if (procedimento.tem_bonificacao) {
        document.getElementById('temBonificacaoIndicacao').checked = true;
        mostrarBonificacao();
        document.querySelector(`input[name="tipoBonificacao"][value="${procedimento.tipo_bonificacao}"]`).checked = true;
        document.getElementById('valorBonificacao').value = procedimento.valor_bonificacao;
    } else {
        document.getElementById('temBonificacaoIndicacao').checked = false;
        mostrarBonificacao();
    }
    
    // Guardar o nome antigo para atualizar lançamentos
    const nomeAntigo = procedimento.nome;
    
    // Mudar texto do botão
    const btnSalvar = document.getElementById('btnSalvarProcedimento');
    btnSalvar.textContent = 'Salvar Alterações';
    
    // Mudar o comportamento do formulário para edição
    const form = document.getElementById('formProcedimento');
    form.onsubmit = async function(event) {
        event.preventDefault();
        
        const temBonificacao = document.getElementById('temBonificacaoIndicacao').checked;
        const nomeNovo = document.getElementById('nomeProcedimento').value;
        
        const procedimentoAtualizado = {
            nome: nomeNovo,
            tipo: document.querySelector('input[name="tipoProcedimento"]:checked').value,
            tem_bonificacao: temBonificacao,
            tipo_bonificacao: temBonificacao 
                ? document.querySelector('input[name="tipoBonificacao"]:checked').value 
                : null,
            valor_bonificacao: temBonificacao 
                ? parseFloat(document.getElementById('valorBonificacao').value) 
                : 0
        };
        
        // Se o nome mudou, perguntar se quer atualizar os lançamentos
        if (nomeAntigo !== nomeNovo) {
            const atualizar = confirm(
                `O nome foi alterado de "${nomeAntigo}" para "${nomeNovo}".\n\n` +
                `Deseja atualizar TODOS os lançamentos antigos com o novo nome?\n\n` +
                `Isso irá:\n` +
                `✓ Corrigir o nome em todos os lançamentos já salvos\n` +
                `✓ Manter o histórico unificado nos relatórios\n\n` +
                `Recomendamos clicar em OK!`
            );
            
            if (atualizar) {
                // Atualizar o procedimento
                await fetchAPI(`/api/procedimentos/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(procedimentoAtualizado)
                });
                
                // Atualizar todos os lançamentos com o nome antigo
                await fetchAPI('/api/procedimentos/atualizar-nome-lancamentos', {
                    method: 'POST',
                    body: JSON.stringify({ nomeAntigo, nomeNovo })
                });
                
                alert('Procedimento e lançamentos atualizados com sucesso!');
            } else {
                // Apenas atualizar o procedimento
                await fetchAPI(`/api/procedimentos/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(procedimentoAtualizado)
                });
                
                alert('Procedimento atualizado! (Lançamentos antigos mantêm o nome anterior)');
            }
        } else {
            // Nome não mudou, apenas atualizar normalmente
            await fetchAPI(`/api/procedimentos/${id}`, {
                method: 'PUT',
                body: JSON.stringify(procedimentoAtualizado)
            });
            
            alert('Procedimento atualizado com sucesso!');
        }
        
        form.reset();
        form.onsubmit = salvarProcedimento;
        btnSalvar.textContent = 'Adicionar Procedimento';
        await carregarProcedimentos();
        await carregarDados(); // Recarregar dashboard e lançamentos
        popularSelects();
    };
    
    // Scroll para o formulário
    document.getElementById('nomeProcedimento').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Impostos e Taxas
let dadosImpostos = {};

async function salvarImpostos(event) {
    event.preventDefault();

    const impostos = {
        imposto_clinico: parseFloat(document.getElementById('impostoClinico').value),
        imposto_hospitalar: parseFloat(document.getElementById('impostoHospitalar').value),
        imposto_cursos: parseFloat(document.getElementById('impostoCursos').value),
        taxa_debito: parseFloat(document.getElementById('taxaDebito').value),
        taxa_credito_vista: parseFloat(document.getElementById('taxaCreditoVista').value),
        taxa_credito_parcelado: parseFloat(document.getElementById('taxaCreditoParcelado').value)
    };

    await fetchAPI('/api/impostos', {
        method: 'PUT',
        body: JSON.stringify(impostos)
    });

    dadosImpostos = impostos;
    alert('Impostos e taxas salvos com sucesso!');
}

async function carregarImpostos() {
    dadosImpostos = await fetchAPI('/api/impostos');

    document.getElementById('impostoClinico').value = dadosImpostos.imposto_clinico || 0;
    document.getElementById('impostoHospitalar').value = dadosImpostos.imposto_hospitalar || 0;
    document.getElementById('impostoCursos').value = dadosImpostos.imposto_cursos || 0;
    document.getElementById('taxaDebito').value = dadosImpostos.taxa_debito || 0;
    document.getElementById('taxaCreditoVista').value = dadosImpostos.taxa_credito_vista || 0;
    document.getElementById('taxaCreditoParcelado').value = dadosImpostos.taxa_credito_parcelado || 0;
}

// Tabs
function abrirTab(event, tabId) {
    console.log('abrirTab chamada:', tabId);
    
    // Verificar se está dentro de um modal ou na página principal
    const modal = event.target.closest('.modal');
    
    if (modal) {
        // Dentro de modal
        console.log('Dentro de modal:', modal.id);
        const modalId = modal.id;
        const tabs = document.querySelectorAll(`#${modalId} .tab-content`);
        tabs.forEach(tab => tab.classList.remove('active'));

        const buttons = document.querySelectorAll(`#${modalId} .tab-button`);
        buttons.forEach(btn => btn.classList.remove('active'));
    } else {
        // Na página principal
        console.log('Página principal');
        const tabs = document.querySelectorAll('.tab-content');
        console.log('Tabs encontradas:', tabs.length);
        tabs.forEach(tab => tab.classList.remove('active'));

        const buttons = document.querySelectorAll('.tab-button');
        buttons.forEach(btn => btn.classList.remove('active'));
    }

    const targetTab = document.getElementById(tabId);
    console.log('Target tab:', targetTab);

    if (targetTab) {
        targetTab.classList.add('active');
        console.log('Tab ativada!');
    }

    event.target.classList.add('active');

    if (tabId === 'tabProdutividade') {
        carregarProcedimentosProdutividade();
        popularMedicosProdutividade();
        const hoje = new Date();
        const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('mesInicioProdutividade').value = mesAtual;
        document.getElementById('mesFimProdutividade').value = mesAtual;
    }
}

// Relatórios
function calcularImpostosETaxas(lancamento) {
    const proc = dadosProcedimentos.find(p => p.nome === lancamento.procedimento);
    const valorBruto = parseFloat(lancamento.valor);
    
    let impostoValor = 0;
    if (proc) {
        let aliquotaImposto = 0;
        if (proc.tipo === 'clinico') {
            aliquotaImposto = dadosImpostos.imposto_clinico;
        } else if (proc.tipo === 'hospitalar') {
            aliquotaImposto = dadosImpostos.imposto_hospitalar;
        } else if (proc.tipo === 'cursos') {
            aliquotaImposto = dadosImpostos.imposto_cursos;
        } else if (proc.tipo === 'isento') {
            aliquotaImposto = 0; // Procedimento isento não tem impostos
        }
        impostoValor = (valorBruto * aliquotaImposto) / 100;
    }
    
    let taxaValor = 0;
    if (lancamento.forma_pagamento === 'debito') {
        taxaValor = (valorBruto * dadosImpostos.taxa_debito) / 100;
    } else if (lancamento.forma_pagamento === 'credito') {
        const aliquota = lancamento.parcelas > 1 ? dadosImpostos.taxa_credito_parcelado : dadosImpostos.taxa_credito_vista;
        taxaValor = (valorBruto * aliquota) / 100;
    }
    
    return { impostoValor, taxaValor };
}

async function gerarRelatorioGeral() {
    const dataInicial = document.getElementById('dataInicialGeral').value;
    const dataFinal = document.getElementById('dataFinalGeral').value;
    const profissionalFiltro = document.getElementById('filtroProfissionalGeral').value;
    const procedimentoFiltro = document.getElementById('filtroProcedimentoGeral').value;
    
    // Filtros de forma de pagamento
    const filtrarPix = document.getElementById('filtroPixGeral').checked;
    const filtrarDinheiro = document.getElementById('filtroDinheiroGeral').checked;
    const filtrarDebito = document.getElementById('filtroDebitoGeral').checked;
    const filtrarCredito = document.getElementById('filtroCreditoGeral').checked;
    
    let query = '/api/lancamentos?';
    if (dataInicial) query += `data_inicial=${dataInicial}&`;
    if (dataFinal) query += `data_final=${dataFinal}&`;
    if (profissionalFiltro) query += `profissional=${encodeURIComponent(profissionalFiltro)}&`;
    if (procedimentoFiltro) query += `procedimento=${encodeURIComponent(procedimentoFiltro)}&`;
    
    let lancamentos = await fetchAPI(query);
    
    // Aplicar filtro de forma de pagamento
    lancamentos = lancamentos.filter(l => {
        if (l.forma_pagamento === 'pix' && filtrarPix) return true;
        if (l.forma_pagamento === 'dinheiro' && filtrarDinheiro) return true;
        if (l.forma_pagamento === 'debito' && filtrarDebito) return true;
        if (l.forma_pagamento === 'credito' && filtrarCredito) return true;
        return false;
    });
    
    const tbody = document.getElementById('corpoTabelaRelatorioGeral');
    tbody.innerHTML = '';
    
    let totais = {
        bruto: 0,
        impostos: 0,
        taxas: 0,
        comissao: 0,
        indicacao: 0,
        liquido: 0
    };
    
    lancamentos.forEach(l => {
        const { impostoValor, taxaValor } = calcularImpostosETaxas(l);
        const valorBruto = parseFloat(l.valor);
        
        let comissaoValor = 0;
        if (l.tem_comissao) {
            const valorAposImpostosTaxas = valorBruto - impostoValor - taxaValor;
            if (l.tipo_comissao === 'percentual') {
                comissaoValor = (valorAposImpostosTaxas * l.valor_comissao) / 100;
            } else {
                comissaoValor = l.valor_comissao;
            }
        }
        
        let indicacaoValor = 0;
        if (l.tem_indicacao) {
            const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
            if (proc && proc.tem_bonificacao) {
                const valorAposImpostosTaxas = valorBruto - impostoValor - taxaValor;
                if (proc.tipo_bonificacao === 'percentual') {
                    indicacaoValor = (valorAposImpostosTaxas * proc.valor_bonificacao) / 100;
                } else {
                    indicacaoValor = proc.valor_bonificacao;
                }
            }
        }
        
        const valorLiquido = valorBruto - impostoValor - taxaValor - comissaoValor - indicacaoValor;
        
        totais.bruto += valorBruto;
        totais.impostos += impostoValor;
        totais.taxas += taxaValor;
        totais.comissao += comissaoValor;
        totais.indicacao += indicacaoValor;
        totais.liquido += valorLiquido;
        
        const formaPag = l.forma_pagamento === 'credito' && l.parcelas > 1 
            ? `Créd. ${l.parcelas}x` 
            : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarData(l.data)}</td>
            <td>${l.nome_paciente}</td>
            <td>${l.procedimento}</td>
            <td>${l.profissional_executante}</td>
            <td>${formaPag}</td>
            <td>R$ ${formatarReal(valorBruto)}</td>
            <td>R$ ${formatarReal(impostoValor)}</td>
            <td>R$ ${formatarReal(taxaValor)}</td>
            <td>${l.tem_comissao ? `R$ ${formatarReal(comissaoValor)} (${l.comissao_para})` : '-'}</td>
            <td>${l.tem_indicacao ? `R$ ${formatarReal(indicacaoValor)} (${l.indicado_por})` : '-'}</td>
            <td>R$ ${formatarReal(valorLiquido)}</td>
        `;
        tbody.appendChild(tr);
    });
    
    const tfoot = document.getElementById('totalRelatorioGeral');
    tfoot.innerHTML = `
        <tr>
            <td colspan="5"><strong>TOTAL</strong></td>
            <td><strong>R$ ${formatarReal(totais.bruto)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.impostos)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.taxas)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.comissao)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.indicacao)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.liquido)}</strong></td>
        </tr>
    `;
    
    document.getElementById('resultadoRelatorioGeral').style.display = 'block';
}

async function gerarRelatorioPagamento() {
    const profissionalSelecionado = document.getElementById('filtroProfissionalPagamento').value;
    
    if (!profissionalSelecionado) {
        alert('Selecione um profissional');
        return;
    }
    
    const dataInicial = document.getElementById('dataInicialPagamento').value;
    const dataFinal = document.getElementById('dataFinalPagamento').value;
    
    let query = '/api/lancamentos?';
    if (dataInicial) query += `data_inicial=${dataInicial}&`;
    if (dataFinal) query += `data_final=${dataFinal}&`;
    
    const lancamentos = await fetchAPI(query);
    
    const tbody = document.getElementById('corpoTabelaRelatorioPagamento');
    tbody.innerHTML = '';
    
    // Totalizadores
    let totais = {
        valorBruto: 0,
        impostos: 0,
        taxas: 0,
        comissoesPagas: 0,
        comissoesRecebidas: 0,
        indicacoesRecebidas: 0,
        valorLiquido: 0
    };
    
    lancamentos.forEach(l => {
        const { impostoValor, taxaValor } = calcularImpostosETaxas(l);
        const valorBruto = parseFloat(l.valor);
        const valorAposImpostosTaxas = valorBruto - impostoValor - taxaValor;
        
        let comissaoPaga = 0;
        let comissaoRecebida = 0;
        let indicacaoRecebida = 0;
        let valorFinal = 0;
        
        if (l.profissional_executante === profissionalSelecionado) {
            valorFinal = valorAposImpostosTaxas;
            
            if (l.tem_comissao) {
                if (l.tipo_comissao === 'percentual') {
                    comissaoPaga = (valorAposImpostosTaxas * l.valor_comissao) / 100;
                } else {
                    comissaoPaga = l.valor_comissao;
                }
                valorFinal -= comissaoPaga;
            }
            
            if (l.tem_indicacao) {
                const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
                if (proc && proc.tem_bonificacao) {
                    if (proc.tipo_bonificacao === 'percentual') {
                        indicacaoRecebida = (valorAposImpostosTaxas * proc.valor_bonificacao) / 100;
                    } else {
                        indicacaoRecebida = proc.valor_bonificacao;
                    }
                    valorFinal -= indicacaoRecebida;
                }
            }
        }
        
        if (l.tem_comissao && l.comissao_para === profissionalSelecionado) {
            if (l.tipo_comissao === 'percentual') {
                comissaoRecebida = (valorAposImpostosTaxas * l.valor_comissao) / 100;
            } else {
                comissaoRecebida = l.valor_comissao;
            }
            valorFinal += comissaoRecebida;
        }
        
        if (l.tem_indicacao && l.indicado_por === profissionalSelecionado) {
            const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
            if (proc && proc.tem_bonificacao) {
                if (proc.tipo_bonificacao === 'percentual') {
                    indicacaoRecebida = (valorAposImpostosTaxas * proc.valor_bonificacao) / 100;
                } else {
                    indicacaoRecebida = proc.valor_bonificacao;
                }
                valorFinal += indicacaoRecebida;
            }
        }
        
        if (valorFinal !== 0) {
            // Se é COMISSÃO EM R$ ou INDICAÇÃO: determinar antes para calcular totais corretos
            const ehComissaoEmReais = (l.tem_comissao && l.comissao_para === profissionalSelecionado && l.tipo_comissao === 'reais');
            const ehIndicacao = (l.tem_indicacao && l.indicado_por === profissionalSelecionado);
            
            // Determinar valor bruto a somar nos totais
            let valorBrutoParaTotal = valorBruto;
            let impostoParaTotal = impostoValor;
            let taxaParaTotal = taxaValor;
            
            if (ehComissaoEmReais) {
                valorBrutoParaTotal = comissaoRecebida;
                impostoParaTotal = 0;
                taxaParaTotal = 0;
            } else if (ehIndicacao) {
                const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
                if (proc && proc.tipo_bonificacao === 'reais') {
                    valorBrutoParaTotal = indicacaoRecebida;
                    impostoParaTotal = 0;
                    taxaParaTotal = 0;
                }
            }
            
            // Somar aos totais
            totais.valorBruto += valorBrutoParaTotal;
            totais.impostos += impostoParaTotal;
            totais.taxas += taxaParaTotal;
            totais.comissoesPagas += comissaoPaga;
            totais.comissoesRecebidas += comissaoRecebida;
            totais.indicacoesRecebidas += indicacaoRecebida;
            totais.valorLiquido += valorFinal;
            
            // NOVA LÓGICA: Determinar texto de parcelas
            let parcelasTexto = '';
            
            if (ehComissaoEmReais || ehIndicacao) {
                parcelasTexto = 'No mesmo mês (integral)';
            } else {
                // Lógica normal para executante ou comissão em %
                const valorPorParcela = valorFinal / l.parcelas;
                
                if (l.forma_pagamento === 'pix' || l.forma_pagamento === 'dinheiro' || l.forma_pagamento === 'debito') {
                    parcelasTexto = 'No mesmo mês';
                } else if (l.forma_pagamento === 'credito') {
                    if (l.parcelas > 1) {
                        const dataLancamento = new Date(l.data + 'T00:00:00');
                        const primeiraParcela = new Date(dataLancamento);
                        primeiraParcela.setMonth(primeiraParcela.getMonth() + 1);
                        
                        parcelasTexto = `${l.parcelas}x de R$ ${formatarReal(valorPorParcela)} (início: ${primeiraParcela.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })})`;
                    } else {
                        const dataLancamento = new Date(l.data + 'T00:00:00');
                        const mesRecebimento = new Date(dataLancamento);
                        mesRecebimento.setMonth(mesRecebimento.getMonth() + 1);
                        
                        parcelasTexto = `Mês seguinte (${mesRecebimento.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })})`;
                    }
                }
            }
            
            // Determinar valor bruto a exibir
            // Se for comissão em R$ ou indicação em R$, mostra apenas o valor recebido
            let valorBrutoExibir = valorBruto;
            let impostoExibir = impostoValor;
            let taxaExibir = taxaValor;
            
            if (ehComissaoEmReais) {
                valorBrutoExibir = comissaoRecebida;
                impostoExibir = 0;
                taxaExibir = 0;
            } else if (ehIndicacao) {
                const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
                if (proc && proc.tipo_bonificacao === 'reais') {
                    valorBrutoExibir = indicacaoRecebida;
                    impostoExibir = 0;
                    taxaExibir = 0;
                }
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatarData(l.data)}</td>
                <td>${l.nome_paciente}</td>
                <td>${l.procedimento}</td>
                <td>R$ ${formatarReal(valorBrutoExibir)}</td>
                <td>R$ ${formatarReal(impostoExibir)}</td>
                <td>R$ ${formatarReal(taxaExibir)}</td>
                <td>${comissaoPaga > 0 ? `R$ ${formatarReal(comissaoPaga)}` : '-'}</td>
                <td>${comissaoRecebida > 0 ? `R$ ${formatarReal(comissaoRecebida)}` : '-'}</td>
                <td>${indicacaoRecebida > 0 ? `R$ ${formatarReal(indicacaoRecebida)}` : '-'}</td>
                <td>R$ ${formatarReal(valorFinal)}</td>
                <td>${parcelasTexto}</td>
            `;
            tbody.appendChild(tr);
        }
    });
    
    const tfoot = document.getElementById('totalRelatorioPagamento');
    tfoot.innerHTML = `
        <tr>
            <td colspan="3"><strong>TOTAL</strong></td>
            <td><strong>R$ ${formatarReal(totais.valorBruto)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.impostos)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.taxas)}</strong></td>
            <td><strong>${totais.comissoesPagas > 0 ? `R$ ${formatarReal(totais.comissoesPagas)}` : '-'}</strong></td>
            <td><strong>${totais.comissoesRecebidas > 0 ? `R$ ${formatarReal(totais.comissoesRecebidas)}` : '-'}</strong></td>
            <td><strong>${totais.indicacoesRecebidas > 0 ? `R$ ${formatarReal(totais.indicacoesRecebidas)}` : '-'}</strong></td>
            <td><strong>R$ ${formatarReal(totais.valorLiquido)}</strong></td>
            <td></td>
        </tr>
    `;
    
    document.getElementById('resultadoRelatorioPagamento').style.display = 'block';
}

// Função auxiliar para calcular data de recebimento baseada no pagamento
function calcularDataRecebimento(dataLancamento, formaPagamento, numeroParcela) {
    const data = new Date(dataLancamento + 'T00:00:00');
    
    if (formaPagamento === 'pix' || formaPagamento === 'dinheiro' || formaPagamento === 'debito') {
        // Recebe no mesmo mês
        return data;
    } else if (formaPagamento === 'credito') {
        // Crédito: primeira parcela no mês seguinte, depois mensalmente
        const diaOriginal = data.getDate();
        data.setMonth(data.getMonth() + numeroParcela);
        
        // Ajustar se o dia não existe no mês (ex: 31 em fevereiro)
        // Se mudou para o mês seguinte, voltar para último dia do mês anterior
        const mesEsperado = (new Date(dataLancamento + 'T00:00:00').getMonth() + numeroParcela) % 12;
        if (data.getMonth() !== mesEsperado && data.getMonth() !== (mesEsperado === 0 ? 0 : mesEsperado)) {
            // Voltou para o mês seguinte, então usar último dia do mês correto
            data.setDate(0); // Volta para último dia do mês anterior
        }
        
        return data;
    }
    
    return data;
}

async function gerarRelatorioValoresReceber() {
    const mesAnoFiltro = document.getElementById('mesAnoReceber').value;
    const profissionalFiltro = document.getElementById('filtroProfissionalReceber').value;
    
    if (!mesAnoFiltro) {
        alert('Selecione o mês/ano');
        return;
    }
    
    const [anoFiltro, mesFiltro] = mesAnoFiltro.split('-');
    
    // Buscar todos os lançamentos
    const lancamentos = await fetchAPI('/api/lancamentos');
    
    const tbody = document.getElementById('corpoTabelaValoresReceber');
    tbody.innerHTML = '';
    
    const resultados = [];
    let totais = {
        valorBruto: 0,
        impostos: 0,
        taxas: 0,
        descontos: 0,
        valorLiquido: 0
    };
    
    // Processar cada lançamento
    lancamentos.forEach(l => {
        const { impostoValor, taxaValor } = calcularImpostosETaxas(l);
        const valorBruto = parseFloat(l.valor);
        const valorAposImpostosTaxas = valorBruto - impostoValor - taxaValor;
        
        const parcelas = l.parcelas || 1;
        
        // Calcular comissões e indicações TOTAIS do lançamento
        let comissaoTotalValor = 0;
        if (l.tem_comissao && l.comissao_para) {
            if (l.tipo_comissao === 'percentual') {
                comissaoTotalValor = (valorAposImpostosTaxas * l.valor_comissao) / 100;
            } else {
                comissaoTotalValor = l.valor_comissao;
            }
        }
        
        let indicacaoTotalValor = 0;
        if (l.tem_indicacao && l.indicado_por) {
            const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
            if (proc && proc.tem_bonificacao) {
                if (proc.tipo_bonificacao === 'percentual') {
                    indicacaoTotalValor = (valorAposImpostosTaxas * proc.valor_bonificacao) / 100;
                } else {
                    indicacaoTotalValor = proc.valor_bonificacao;
                }
            }
        }
        
        // 1. PROFISSIONAL EXECUTANTE (quem fez o procedimento)
        if (l.profissional_executante) {
            const valorExecutante = valorAposImpostosTaxas - comissaoTotalValor - indicacaoTotalValor;
            
            if ((!profissionalFiltro || l.profissional_executante === profissionalFiltro) && valorExecutante > 0) {
                for (let i = 1; i <= parcelas; i++) {
                    const dataRecebimento = calcularDataRecebimento(l.data, l.forma_pagamento, i);
                    const anoRec = dataRecebimento.getFullYear();
                    const mesRec = dataRecebimento.getMonth() + 1;
                    
                    if (anoRec === parseInt(anoFiltro) && mesRec === parseInt(mesFiltro)) {
                        const valorPorParcela = valorExecutante / parcelas;
                        const impostoPorParcela = impostoValor / parcelas;
                        const taxaPorParcela = taxaValor / parcelas;
                        const comissaoPorParcela = comissaoTotalValor / parcelas;
                        const indicacaoPorParcela = indicacaoTotalValor / parcelas;
                        const valorBrutoPorParcela = valorBruto / parcelas;
                        
                        resultados.push({
                            profissional: l.profissional_executante,
                            dataOriginal: l.data,
                            paciente: l.nome_paciente,
                            servico: l.procedimento,
                            formaPagamento: l.forma_pagamento === 'credito' && parcelas > 1 ? `Crédito ${parcelas}x` : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1),
                            parcela: parcelas > 1 ? `${i}/${parcelas}` : 'À vista',
                            valorBruto: valorBrutoPorParcela,
                            impostos: impostoPorParcela,
                            taxas: taxaPorParcela,
                            descontos: comissaoPorParcela + indicacaoPorParcela,
                            valorLiquido: valorPorParcela,
                            dataRecebimento: dataRecebimento
                        });
                        
                        // Totais somados ao renderizar
                    }
                }
            }
        }
        
        // 2. PROFISSIONAL QUE RECEBE COMISSÃO
        if (l.tem_comissao && l.comissao_para && comissaoTotalValor > 0) {
            if (!profissionalFiltro || l.comissao_para === profissionalFiltro) {
                
                // LÓGICA: Comissão em R$ paga INTEGRAL no mesmo mês do lançamento
                const ehComissaoEmReais = (l.tipo_comissao === 'reais');
                
                if (ehComissaoEmReais) {
                    // Comissão em R$: paga INTEGRAL no MÊS DO LANÇAMENTO (mesmo que crédito)
                    const dataLancamento = new Date(l.data + 'T00:00:00');
                    const anoLanc = dataLancamento.getFullYear();
                    const mesLanc = dataLancamento.getMonth() + 1;
                    
                    if (anoLanc === parseInt(anoFiltro) && mesLanc === parseInt(mesFiltro)) {
                        // Montar descrição da comissão
                        let descricaoComissao = `Comissão R$ ${formatarReal(l.valor_comissao)} de ${l.procedimento}`;
                        
                        resultados.push({
                            profissional: l.comissao_para,
                            dataOriginal: l.data,
                            paciente: l.nome_paciente,
                            servico: descricaoComissao,
                            formaPagamento: l.forma_pagamento === 'credito' && parcelas > 1 ? `Crédito ${parcelas}x` : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1),
                            parcela: 'Integral',
                            valorBruto: comissaoTotalValor, // Valor da comissão, não do procedimento
                            impostos: 0,
                            taxas: 0,
                            descontos: 0,
                            valorLiquido: comissaoTotalValor,
                            dataRecebimento: dataLancamento
                        });
                        
                        // Totais somados ao renderizar
                    }
                } else {
                    // Comissão em %: paga conforme forma de pagamento (pode parcelar)
                    for (let i = 1; i <= parcelas; i++) {
                        const dataRecebimento = calcularDataRecebimento(l.data, l.forma_pagamento, i);
                        const anoRec = dataRecebimento.getFullYear();
                        const mesRec = dataRecebimento.getMonth() + 1;
                        
                        if (anoRec === parseInt(anoFiltro) && mesRec === parseInt(mesFiltro)) {
                            const comissaoPorParcela = comissaoTotalValor / parcelas;
                            const valorBrutoPorParcela = valorBruto / parcelas;
                            const impostoPorParcela = impostoValor / parcelas;
                            const taxaPorParcela = taxaValor / parcelas;
                            
                            // Montar descrição da comissão com o valor/percentual
                            let descricaoComissao = `Comissão ${l.valor_comissao}% de ${l.procedimento}`;
                            
                            resultados.push({
                                profissional: l.comissao_para,
                                dataOriginal: l.data,
                                paciente: l.nome_paciente,
                                servico: descricaoComissao,
                                formaPagamento: l.forma_pagamento === 'credito' && parcelas > 1 ? `Crédito ${parcelas}x` : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1),
                                parcela: parcelas > 1 ? `${i}/${parcelas}` : 'À vista',
                                valorBruto: valorBrutoPorParcela,
                                impostos: impostoPorParcela,
                                taxas: taxaPorParcela,
                                descontos: 0,
                                valorLiquido: comissaoPorParcela,
                                dataRecebimento: dataRecebimento
                            });
                            
                            // Totais somados ao renderizar
                        }
                    }
                }
            }
        }
        
        // 3. PROFISSIONAL QUE RECEBE INDICAÇÃO
        if (l.tem_indicacao && l.indicado_por && indicacaoTotalValor > 0) {
            if (!profissionalFiltro || l.indicado_por === profissionalFiltro) {
                
                // LÓGICA: Indicação SEMPRE paga INTEGRAL no mesmo mês do lançamento
                const dataLancamento = new Date(l.data + 'T00:00:00');
                const anoLanc = dataLancamento.getFullYear();
                const mesLanc = dataLancamento.getMonth() + 1;
                
                if (anoLanc === parseInt(anoFiltro) && mesLanc === parseInt(mesFiltro)) {
                    const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
                    
                    // Montar descrição da indicação com o valor/percentual
                    let descricaoIndicacao = 'Indicação';
                    if (proc) {
                        if (proc.tipo_bonificacao === 'percentual') {
                            descricaoIndicacao += ` ${proc.valor_bonificacao}%`;
                        } else {
                            descricaoIndicacao += ` R$ ${formatarReal(proc.valor_bonificacao)}`;
                        }
                    }
                    descricaoIndicacao += ` de ${l.procedimento}`;
                    
                    // Se indicação for em R$, valor bruto = valor da indicação
                    // Se for em %, valor bruto = valor total do procedimento
                    const valorBrutoIndicacao = (proc && proc.tipo_bonificacao === 'reais') ? indicacaoTotalValor : valorBruto;
                    const impostosIndicacao = (proc && proc.tipo_bonificacao === 'percentual') ? impostoValor * (proc.valor_bonificacao / 100) : 0;
                    const taxasIndicacao = (proc && proc.tipo_bonificacao === 'percentual') ? taxaValor * (proc.valor_bonificacao / 100) : 0;
                    
                    resultados.push({
                        profissional: l.indicado_por,
                        dataOriginal: l.data,
                        paciente: l.nome_paciente,
                        servico: descricaoIndicacao,
                        formaPagamento: l.forma_pagamento === 'credito' && parcelas > 1 ? `Crédito ${parcelas}x` : l.forma_pagamento.charAt(0).toUpperCase() + l.forma_pagamento.slice(1),
                        parcela: 'Integral',
                        valorBruto: valorBrutoIndicacao,
                        impostos: impostosIndicacao,
                        taxas: taxasIndicacao,
                        descontos: 0,
                        valorLiquido: indicacaoTotalValor,
                        dataRecebimento: dataLancamento
                    });
                    
                    // Totais somados ao renderizar
                }
            }
        }
    });
    
    // Ordenar por profissional e data
    resultados.sort((a, b) => {
        if (a.profissional !== b.profissional) {
            return a.profissional.localeCompare(b.profissional);
        }
        return new Date(a.dataOriginal) - new Date(b.dataOriginal);
    });
    
    if (resultados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center;">Nenhum valor a receber neste período</td></tr>';
    } else {
        resultados.forEach(r => {
            // Somar aos totais
            totais.valorBruto += r.valorBruto;
            totais.impostos += r.impostos;
            totais.taxas += r.taxas;
            totais.descontos += r.descontos;
            totais.valorLiquido += r.valorLiquido;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.profissional}</td>
                <td>${formatarData(r.dataOriginal)}</td>
                <td>${r.paciente}</td>
                <td>${r.servico}</td>
                <td>${r.formaPagamento}</td>
                <td>${r.parcela}</td>
                <td>R$ ${formatarReal(r.valorBruto)}</td>
                <td>R$ ${formatarReal(r.impostos)}</td>
                <td>R$ ${formatarReal(r.taxas)}</td>
                <td>R$ ${formatarReal(r.descontos)}</td>
                <td><strong>R$ ${formatarReal(r.valorLiquido)}</strong></td>
                <td>${r.dataRecebimento.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    const tfoot = document.getElementById('totalValoresReceber');
    tfoot.innerHTML = `
        <tr>
            <td colspan="6"><strong>TOTAL</strong></td>
            <td><strong>R$ ${formatarReal(totais.valorBruto)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.impostos)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.taxas)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.descontos)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.valorLiquido)}</strong></td>
            <td></td>
        </tr>
    `;
    
    document.getElementById('resultadoValoresReceber').style.display = 'block';
}

// Relatório de Repasse
async function gerarRelatorioRepasse() {
    const mesAnoFiltro = document.getElementById('mesAnoRepasse').value;
    const profissionalFiltro = document.getElementById('filtroProfissionalRepasse').value;
    
    if (!mesAnoFiltro) {
        alert('Selecione o mês/ano de competência');
        return;
    }
    
    const [anoFiltro, mesFiltro] = mesAnoFiltro.split('-');
    
    // Buscar todos os lançamentos
    const lancamentos = await fetchAPI('/api/lancamentos');
    
    // Mapear valores por profissional
    const repassePorProfissional = new Map();
    
    lancamentos.forEach(l => {
        const dataLancamento = new Date(l.data + 'T00:00:00');
        const anoLanc = dataLancamento.getFullYear();
        const mesLanc = dataLancamento.getMonth() + 1;
        
        const { impostoValor, taxaValor } = calcularImpostosETaxas(l);
        const valorBruto = parseFloat(l.valor);
        const parcelas = l.parcelas || 1;
        const formaPagamento = l.forma_pagamento;
        
        // Determinar se o lançamento é do mês filtrado
        const lancamentoDoMesFiltrado = (anoLanc === parseInt(anoFiltro) && mesLanc === parseInt(mesFiltro));
        
        // Calcular proporções para dividir entre profissionais
        let proporcaoExecutante = 1.0;
        let proporcaoComissao = 0;
        let proporcaoIndicacao = 0;
        
        if (l.tem_comissao && l.comissao_para && l.tipo_comissao === 'percentual') {
            proporcaoComissao = l.valor_comissao / 100;
            proporcaoExecutante -= proporcaoComissao;
        }
        
        if (l.tem_indicacao && l.indicado_por) {
            const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
            if (proc && proc.tem_bonificacao && proc.tipo_bonificacao === 'percentual') {
                proporcaoIndicacao = proc.valor_bonificacao / 100;
                proporcaoExecutante -= proporcaoIndicacao;
            }
        }
        
        // Processar EXECUTANTE
        if (l.profissional_executante) {
            if (!profissionalFiltro || l.profissional_executante === profissionalFiltro) {
                if (!repassePorProfissional.has(l.profissional_executante)) {
                    repassePorProfissional.set(l.profissional_executante, {
                        valorFaturadoBruto: 0,
                        impostos: 0,
                        taxas: 0,
                        parcelasAnteriores: 0,
                        valorLiquido: 0
                    });
                }
                
                const dados = repassePorProfissional.get(l.profissional_executante);
                
                // Calcular valores proporcionais do executante
                let valorBrutoExecutante = valorBruto * proporcaoExecutante;
                let impostoExecutante = impostoValor * proporcaoExecutante;
                let taxaExecutante = taxaValor * proporcaoExecutante;
                
                // Se tem comissão/indicação em R$, deduz do valor mas impostos ficam 100% com executante
                if (l.tem_comissao && l.comissao_para && l.tipo_comissao === 'reais') {
                    valorBrutoExecutante -= l.valor_comissao;
                    impostoExecutante = impostoValor;
                    taxaExecutante = taxaValor;
                }
                
                if (l.tem_indicacao && l.indicado_por) {
                    const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
                    if (proc && proc.tem_bonificacao && proc.tipo_bonificacao === 'reais') {
                        valorBrutoExecutante -= proc.valor_bonificacao;
                        impostoExecutante = impostoValor;
                        taxaExecutante = taxaValor;
                    }
                }
                
                // VALOR FATURADO BRUTO: se lançamento do mês, soma
                if (lancamentoDoMesFiltrado) {
                    dados.valorFaturadoBruto += valorBrutoExecutante;
                    dados.impostos += impostoExecutante;
                    
                    // Taxas: apenas débito e crédito
                    if (formaPagamento === 'debito' || formaPagamento === 'credito') {
                        dados.taxas += taxaExecutante;
                    }
                }
                
                // PARCELAS: calcular quando vence cada parcela
                const valorLiquido = valorBrutoExecutante - impostoExecutante - taxaExecutante;
                
                if (formaPagamento === 'pix' || formaPagamento === 'dinheiro') {
                    // Paga no mesmo mês
                    if (lancamentoDoMesFiltrado) {
                        dados.valorLiquido += valorLiquido;
                    }
                } else if (formaPagamento === 'debito') {
                    // Paga no mesmo mês
                    if (lancamentoDoMesFiltrado) {
                        dados.valorLiquido += valorLiquido;
                    }
                } else if (formaPagamento === 'credito') {
                    // Crédito: primeira parcela no mês seguinte
                    const valorPorParcela = valorLiquido / parcelas;
                    
                    for (let i = 1; i <= parcelas; i++) {
                        const dataRecebimento = calcularDataRecebimento(l.data, formaPagamento, i);
                        const anoRec = dataRecebimento.getFullYear();
                        const mesRec = dataRecebimento.getMonth() + 1;
                        
                        if (anoRec === parseInt(anoFiltro) && mesRec === parseInt(mesFiltro)) {
                            if (lancamentoDoMesFiltrado) {
                                // Se lançamento do mês e parcela também vence no mês (impossível pois crédito começa mês seguinte)
                                dados.valorLiquido += valorPorParcela;
                            } else {
                                // Parcela de mês anterior
                                dados.parcelasAnteriores += valorPorParcela;
                                dados.valorLiquido += valorPorParcela;
                            }
                        }
                    }
                }
            }
        }
        
        // Processar COMISSÃO
        if (l.tem_comissao && l.comissao_para) {
            if (!profissionalFiltro || l.comissao_para === profissionalFiltro) {
                if (!repassePorProfissional.has(l.comissao_para)) {
                    repassePorProfissional.set(l.comissao_para, {
                        valorFaturadoBruto: 0,
                        impostos: 0,
                        taxas: 0,
                        parcelasAnteriores: 0,
                        valorLiquido: 0
                    });
                }
                
                const dados = repassePorProfissional.get(l.comissao_para);
                
                let valorBrutoComissao = 0;
                let impostoComissao = 0;
                let taxaComissao = 0;
                
                if (l.tipo_comissao === 'percentual') {
                    valorBrutoComissao = valorBruto * proporcaoComissao;
                    impostoComissao = impostoValor * proporcaoComissao;
                    taxaComissao = taxaValor * proporcaoComissao;
                } else {
                    valorBrutoComissao = l.valor_comissao;
                    impostoComissao = 0;
                    taxaComissao = 0;
                }
                
                if (lancamentoDoMesFiltrado) {
                    dados.valorFaturadoBruto += valorBrutoComissao;
                    dados.impostos += impostoComissao;
                    
                    if (formaPagamento === 'debito' || formaPagamento === 'credito') {
                        dados.taxas += taxaComissao;
                    }
                }
                
                const valorLiquido = valorBrutoComissao - impostoComissao - taxaComissao;
                
                // NOVA LÓGICA: Comissão em R$ paga INTEGRAL no mesmo mês (mesmo se crédito)
                if (l.tipo_comissao === 'reais') {
                    // Comissão em R$: SEMPRE paga integral no mesmo mês da cirurgia
                    // Não importa se é PIX, Débito ou Crédito - SEMPRE no mesmo mês
                    if (lancamentoDoMesFiltrado) {
                        dados.valorLiquido += valorLiquido;
                    }
                } else {
                    // Comissão em %: paga conforme forma de pagamento (pode ser parcelado)
                    if (formaPagamento === 'pix' || formaPagamento === 'dinheiro' || formaPagamento === 'debito') {
                        if (lancamentoDoMesFiltrado) {
                            dados.valorLiquido += valorLiquido;
                        }
                    } else if (formaPagamento === 'credito') {
                        // Crédito começa no mês seguinte
                        const valorPorParcela = valorLiquido / parcelas;
                        
                        for (let i = 1; i <= parcelas; i++) {
                            const dataRecebimento = calcularDataRecebimento(l.data, formaPagamento, i);
                            const anoRec = dataRecebimento.getFullYear();
                            const mesRec = dataRecebimento.getMonth() + 1;
                            
                            if (anoRec === parseInt(anoFiltro) && mesRec === parseInt(mesFiltro)) {
                                if (!lancamentoDoMesFiltrado) {
                                    dados.parcelasAnteriores += valorPorParcela;
                                }
                                dados.valorLiquido += valorPorParcela;
                            }
                        }
                    }
                }
            }
        }
        
        // Processar INDICAÇÃO
        if (l.tem_indicacao && l.indicado_por) {
            const proc = dadosProcedimentos.find(p => p.nome === l.procedimento);
            if (proc && proc.tem_bonificacao) {
                if (!profissionalFiltro || l.indicado_por === profissionalFiltro) {
                    if (!repassePorProfissional.has(l.indicado_por)) {
                        repassePorProfissional.set(l.indicado_por, {
                            valorFaturadoBruto: 0,
                            impostos: 0,
                            taxas: 0,
                            parcelasAnteriores: 0,
                            valorLiquido: 0
                        });
                    }
                    
                    const dados = repassePorProfissional.get(l.indicado_por);
                    
                    let valorBrutoIndicacao = 0;
                    let impostoIndicacao = 0;
                    let taxaIndicacao = 0;
                    
                    if (proc.tipo_bonificacao === 'percentual') {
                        valorBrutoIndicacao = valorBruto * proporcaoIndicacao;
                        impostoIndicacao = impostoValor * proporcaoIndicacao;
                        taxaIndicacao = taxaValor * proporcaoIndicacao;
                    } else {
                        valorBrutoIndicacao = proc.valor_bonificacao;
                        impostoIndicacao = 0;
                        taxaIndicacao = 0;
                    }
                    
                    if (lancamentoDoMesFiltrado) {
                        dados.valorFaturadoBruto += valorBrutoIndicacao;
                        dados.impostos += impostoIndicacao;
                        
                        if (formaPagamento === 'debito' || formaPagamento === 'credito') {
                            dados.taxas += taxaIndicacao;
                        }
                    }
                    
                    const valorLiquido = valorBrutoIndicacao - impostoIndicacao - taxaIndicacao;
                    
                    // NOVA LÓGICA: Indicação SEMPRE paga INTEGRAL no mesmo mês (tanto % quanto R$)
                    if (lancamentoDoMesFiltrado) {
                        dados.valorLiquido += valorLiquido;
                    }
                }
            }
        }
    });
    
    // Renderizar tabela
    const tbody = document.getElementById('corpoTabelaRelatorioRepasse');
    tbody.innerHTML = '';
    
    let totais = {
        valorBruto: 0,
        impostos: 0,
        taxas: 0,
        parcelasAnteriores: 0,
        liquido: 0
    };
    
    if (repassePorProfissional.size === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum valor a repassar neste período</td></tr>';
    } else {
        const profissionaisOrdenados = Array.from(repassePorProfissional.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        profissionaisOrdenados.forEach(([profissional, dados]) => {
            totais.valorBruto += dados.valorFaturadoBruto;
            totais.impostos += dados.impostos;
            totais.taxas += dados.taxas;
            totais.parcelasAnteriores += dados.parcelasAnteriores;
            totais.liquido += dados.valorLiquido;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${profissional}</strong></td>
                <td>R$ ${formatarReal(dados.valorFaturadoBruto)}</td>
                <td>R$ ${formatarReal(dados.impostos)}</td>
                <td>R$ ${formatarReal(dados.taxas)}</td>
                <td style="color: #1976D2;"><strong>R$ ${formatarReal(dados.parcelasAnteriores)}</strong></td>
                <td><strong style="color: ${dados.valorLiquido >= 0 ? '#2E7D32' : '#D32F2F'};">R$ ${formatarReal(dados.valorLiquido)}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    const tfoot = document.getElementById('totalRelatorioRepasse');
    tfoot.innerHTML = `
        <tr style="background: #F5F5F5; font-weight: bold;">
            <td><strong>TOTAL GERAL</strong></td>
            <td><strong>R$ ${formatarReal(totais.valorBruto)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.impostos)}</strong></td>
            <td><strong>R$ ${formatarReal(totais.taxas)}</strong></td>
            <td style="color: #1976D2;"><strong>R$ ${formatarReal(totais.parcelasAnteriores)}</strong></td>
            <td><strong style="color: ${totais.liquido >= 0 ? '#2E7D32' : '#D32F2F'}; font-size: 1.1em;">R$ ${formatarReal(totais.liquido)}</strong></td>
        </tr>
    `;
    
    document.getElementById('resultadoRelatorioRepasse').style.display = 'block';
}

// Exportação para PDF e Excel
function exportarPDF(tipo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape, mm, A4
    
    let titulo = '';
    let tabela = null;
    
    if (tipo === 'geral') {
        titulo = 'Relatório Geral';
        tabela = document.getElementById('tabelaRelatorioGeral');
    } else if (tipo === 'pagamento') {
        titulo = 'Relatório de Pagamento';
        tabela = document.getElementById('tabelaRelatorioPagamento');
    } else if (tipo === 'receber') {
        titulo = 'Relatório de Valores a Receber';
        tabela = document.getElementById('tabelaValoresReceber');
    } else if (tipo === 'repasse') {
        titulo = 'Relatório de Repasse';
        tabela = document.getElementById('tabelaRelatorioRepasse');
        titulo = 'Relatório de Valores a Receber';
        tabela = document.getElementById('tabelaValoresReceber');
    }
    
    if (!tabela) {
        alert('Gere o relatório primeiro!');
        return;
    }
    
    // Título
    doc.setFontSize(16);
    doc.text('CARMO & PALITOT HEALTH INSTITUTE', 148, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text(titulo, 148, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 148, 28, { align: 'center' });
    
    // Extrair dados da tabela
    const thead = tabela.querySelector('thead');
    const tbody = tabela.querySelector('tbody');
    const tfoot = tabela.querySelector('tfoot');
    
    const headers = [];
    thead.querySelectorAll('th').forEach(th => {
        headers.push(th.textContent);
    });
    
    const rows = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach(td => {
            row.push(td.textContent);
        });
        if (row.length > 0) rows.push(row);
    });
    
    // Adicionar totais se existir
    if (tfoot) {
        const totalRow = [];
        tfoot.querySelectorAll('td').forEach(td => {
            totalRow.push(td.textContent);
        });
        if (totalRow.length > 0) rows.push(totalRow);
    }
    
    // Gerar tabela no PDF
    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 35,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [196, 151, 90], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 10, right: 10 }
    });
    
    // Salvar
    const nomeArquivo = `${titulo.replace(/ /g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(nomeArquivo);
}

function exportarExcel(tipo) {
    let titulo = '';
    let tabela = null;
    
    if (tipo === 'geral') {
        titulo = 'Relatório Geral';
        tabela = document.getElementById('tabelaRelatorioGeral');
    } else if (tipo === 'pagamento') {
        titulo = 'Relatório de Pagamento';
        tabela = document.getElementById('tabelaRelatorioPagamento');
    } else if (tipo === 'receber') {
        titulo = 'Relatório de Valores a Receber';
        tabela = document.getElementById('tabelaValoresReceber');
    } else if (tipo === 'repasse') {
        titulo = 'Relatório de Repasse';
        tabela = document.getElementById('tabelaRelatorioRepasse');
        titulo = 'Relatório de Valores a Receber';
        tabela = document.getElementById('tabelaValoresReceber');
    }
    
    if (!tabela) {
        alert('Gere o relatório primeiro!');
        return;
    }
    
    // Criar workbook
    const wb = XLSX.utils.book_new();
    
    // Converter tabela HTML para worksheet
    const ws = XLSX.utils.table_to_sheet(tabela);
    
    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, titulo);
    
    // Salvar arquivo
    const nomeArquivo = `${titulo.replace(/ /g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
}
// ==================== DESPESAS ====================

let dadosCategoriasDespesas = [];
let dadosSubcategoriasDespesas = [];
let dadosDespesas = [];

// Carregar categorias de despesas
async function carregarCategoriasDespesas() {
    dadosCategoriasDespesas = await fetchAPI('/api/categorias-despesas');
    
    // Atualizar selects
    const selects = ['categoriaSubcategoria', 'categoriaDespesa', 'filtroCategoriaDespesa'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Selecione...</option>';
            dadosCategoriasDespesas.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${cat.nome} (${cat.tipo})</option>`;
            });
        }
    });
    
    // Carregar lista de categorias
    await carregarListaCategorias();
}

// Carregar subcategorias
async function carregarSubcategoriasDespesas(categoriaId = null) {
    let url = '/api/subcategorias-despesas';
    if (categoriaId) url += `?categoria_id=${categoriaId}`;
    
    dadosSubcategoriasDespesas = await fetchAPI(url);
}

// Salvar categoria
async function salvarCategoria(event) {
    event.preventDefault();
    
    const categoria = {
        nome: document.getElementById('nomeCategoria').value,
        tipo: document.getElementById('tipoCategoria').value
    };
    
    await fetchAPI('/api/categorias-despesas', {
        method: 'POST',
        body: JSON.stringify(categoria)
    });
    
    document.getElementById('formCategoria').reset();
    await carregarCategoriasDespesas();
    alert('Categoria cadastrada com sucesso!');
}

// Salvar subcategoria
async function salvarSubcategoria(event) {
    event.preventDefault();
    
    const subcategoria = {
        categoria_id: document.getElementById('categoriaSubcategoria').value,
        nome: document.getElementById('nomeSubcategoria').value
    };
    
    await fetchAPI('/api/subcategorias-despesas', {
        method: 'POST',
        body: JSON.stringify(subcategoria)
    });
    
    document.getElementById('formSubcategoria').reset();
    await carregarListaCategorias();
    alert('Subcategoria cadastrada com sucesso!');
}

// Carregar lista de categorias com subcategorias
async function carregarListaCategorias() {
    await carregarSubcategoriasDespesas();
    
    const container = document.getElementById('listaCategorias');
    container.innerHTML = '';
    
    dadosCategoriasDespesas.forEach(cat => {
        const subs = dadosSubcategoriasDespesas.filter(s => s.categoria_id === cat.id);
        
        const div = document.createElement('div');
        div.style.border = '1px solid #ddd';
        div.style.padding = '15px';
        div.style.marginBottom = '15px';
        div.style.borderRadius = '8px';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h5 style="margin: 0; color: var(--gold-primary);">${cat.nome} <span style="font-size: 0.8em; color: #666;">(${cat.tipo})</span></h5>
                <button onclick="excluirCategoria(${cat.id})" class="btn-secondary" style="padding: 5px 10px; font-size: 0.9em;">Excluir</button>
            </div>
            ${subs.length > 0 ? `
                <ul style="margin: 0; padding-left: 20px;">
                    ${subs.map(s => `
                        <li style="margin: 5px 0;">
                            ${s.nome}
                            <button onclick="excluirSubcategoria(${s.id})" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8em; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;">✕</button>
                        </li>
                    `).join('')}
                </ul>
            ` : '<p style="margin: 0; color: #999; font-size: 0.9em;">Nenhuma subcategoria cadastrada</p>'}
        `;
        
        container.appendChild(div);
    });
}

// Excluir categoria
async function excluirCategoria(id) {
    if (confirm('Deseja realmente excluir esta categoria?')) {
        await fetchAPI(`/api/categorias-despesas/${id}`, { method: 'DELETE' });
        await carregarCategoriasDespesas();
    }
}

// Excluir subcategoria
async function excluirSubcategoria(id) {
    if (confirm('Deseja realmente excluir esta subcategoria?')) {
        await fetchAPI(`/api/subcategorias-despesas/${id}`, { method: 'DELETE' });
        await carregarListaCategorias();
    }
}

// Atualizar categorias no formulário de despesa
function atualizarCategoriasDespesa() {
    const tipo = document.getElementById('tipoDespesa').value;
    const grupocat = document.getElementById('grupoCategorias');
    const categoriaSelect = document.getElementById('categoriaDespesa');
    
    if (tipo) {
        grupocat.style.display = 'block';
        
        // Filtrar categorias por tipo
        const categoriasFiltradas = dadosCategoriasDespesas.filter(c => c.tipo === tipo);
        categoriaSelect.innerHTML = '<option value="">Selecione...</option>';
        categoriasFiltradas.forEach(cat => {
            categoriaSelect.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
        });
    } else {
        grupocat.style.display = 'none';
        document.getElementById('grupoSubcategorias').style.display = 'none';
    }
}

// Atualizar subcategorias
async function atualizarSubcategoriasDespesa() {
    const categoriaId = document.getElementById('categoriaDespesa').value;
    const gruposub = document.getElementById('grupoSubcategorias');
    const subSelect = document.getElementById('subcategoriaDespesa');
    
    if (categoriaId) {
        await carregarSubcategoriasDespesas(categoriaId);
        
        subSelect.innerHTML = '<option value="">Nenhuma</option>';
        dadosSubcategoriasDespesas.forEach(sub => {
            subSelect.innerHTML += `<option value="${sub.id}">${sub.nome}</option>`;
        });
        
        gruposub.style.display = 'block';
    } else {
        gruposub.style.display = 'none';
    }
}

// Mostrar parcelas
function mostrarParcelasDespesa() {
    const forma = document.getElementById('formaPagamentoDespesa').value;
    const grupo = document.getElementById('grupoParcelasDespesa');
    grupo.style.display = (forma === 'credito' || forma === 'boleto') ? 'block' : 'none';
}

// Salvar despesa
async function salvarDespesa(event) {
    event.preventDefault();
    
    const despesa = {
        data: document.getElementById('dataDespesa').value,
        tipo_despesa: document.getElementById('tipoDespesa').value,
        categoria_id: document.getElementById('categoriaDespesa').value || null,
        subcategoria_id: document.getElementById('subcategoriaDespesa').value || null,
        descricao: document.getElementById('descricaoDespesa').value,
        valor: valorParaNumero(document.getElementById('valorDespesa').value),
        forma_pagamento: document.getElementById('formaPagamentoDespesa').value,
        parcelas: document.getElementById('formaPagamentoDespesa').value === 'credito' 
            ? parseInt(document.getElementById('parcelasDespesa').value)
            : 1
    };
    
    await fetchAPI('/api/despesas', {
        method: 'POST',
        body: JSON.stringify(despesa)
    });
    
    fecharModal('modalLancamentoDespesa');
    document.getElementById('formDespesa').reset();
    await carregarDespesasRecentes();
    alert('Despesa lançada com sucesso!');
}

// Carregar despesas recentes
async function carregarDespesasRecentes() {
    const despesas = await fetchAPI('/api/despesas');
    const tbody = document.getElementById('corpoDespesasRecentes');
    
    if (!tbody) return; // Elemento não existe ainda
    
    tbody.innerHTML = '';
    
    despesas.slice(0, 20).forEach((d, idx) => {
        const tr = document.createElement('tr');
        tr.style.background = idx % 2 === 0 ? '#fff' : '#f9f9f9';
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${formatarData(d.data)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${d.tipo_despesa}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${d.categoria_nome || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${d.subcategoria_nome || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${d.descricao || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; text-align: right; font-weight: bold;">R$ ${formatarReal(d.valor)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; text-align: center;">${d.forma_pagamento.toUpperCase()}${d.parcelas > 1 ? ` ${d.parcelas}x` : ''}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                <button onclick="excluirDespesa(${d.id})" class="btn-secondary" style="padding: 5px 10px;">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Excluir despesa
async function excluirDespesa(id) {
    if (confirm('Deseja realmente excluir esta despesa?')) {
        await fetchAPI(`/api/despesas/${id}`, { method: 'DELETE' });
        await carregarDespesasRecentes();
    }
}

// Gerar relatório de despesas
async function gerarRelatorioDespesas() {
    const dataInicial = document.getElementById('dataInicialDespesas').value;
    const dataFinal = document.getElementById('dataFinalDespesas').value;
    
    // Buscar TODAS as despesas (sem filtro de data na API)
    // O filtro de data será aplicado DEPOIS de expandir as parcelas
    const despesas = await fetchAPI('/api/despesas');
    
    // Filtrar por tipo, categoria e forma de pagamento
    const filtroTipo = document.getElementById('filtroTipoDespesa').value;
    const filtroCategoria = document.getElementById('filtroCategoriaDespesa').value;
    const filtroFormaPagamento = document.getElementById('filtroFormaPagamentoDespesa').value;
    
    const despesasFiltradas = despesas.filter(d => {
        if (filtroTipo && d.tipo_despesa !== filtroTipo) return false;
        if (filtroCategoria && d.categoria_id !== parseInt(filtroCategoria)) return false;
        if (filtroFormaPagamento && d.forma_pagamento !== filtroFormaPagamento) return false;
        return true;
    });
    
    // Expandir despesas parceladas por mês
    const despesasPorMes = [];
    
    despesasFiltradas.forEach(d => {
        const parcelas = d.parcelas || 1;
        const valorPorParcela = d.valor / parcelas;
        
        if (parcelas === 1 || d.forma_pagamento === 'pix' || d.forma_pagamento === 'dinheiro' || d.forma_pagamento === 'debito') {
            // Pagamento à vista ou débito - verificar se a data está no período filtrado
            const dataDesp = new Date(d.data + 'T00:00:00');
            const dentroDoFiltro =
                (!dataInicial || dataDesp >= new Date(dataInicial + 'T00:00:00')) &&
                (!dataFinal || dataDesp <= new Date(dataFinal + 'T23:59:59'));
            if (!dentroDoFiltro) return;
            despesasPorMes.push({
                ...d,
                valorMes: d.valor,
                parcelaAtual: 1,
                totalParcelas: 1
            });
        } else {
            // Pagamento parcelado (crédito ou boleto) - dividir por mês
            for (let i = 1; i <= parcelas; i++) {
                const dataLancamento = new Date(d.data + 'T00:00:00');
                const diaOriginal = dataLancamento.getDate();
                const dataParcela = new Date(dataLancamento);
                dataParcela.setMonth(dataParcela.getMonth() + i - 1);
                
                // Ajustar se o dia não existe no mês (ex: 31 em fevereiro)
                const mesEsperado = (dataLancamento.getMonth() + i - 1) % 12;
                if (dataParcela.getMonth() !== mesEsperado) {
                    // Voltou para o mês seguinte, usar último dia do mês correto
                    dataParcela.setDate(0); // Volta para último dia do mês anterior
                }
                
                // Verificar se a parcela está no período filtrado
                if (dataInicial) {
                    const dataInicialObj = new Date(dataInicial + 'T00:00:00');
                    if (dataParcela < dataInicialObj) continue;
                }
                if (dataFinal) {
                    const dataFinalObj = new Date(dataFinal + 'T23:59:59');
                    if (dataParcela > dataFinalObj) continue;
                }
                
                despesasPorMes.push({
                    ...d,
                    data: dataParcela.toISOString().split('T')[0],
                    valorMes: valorPorParcela,
                    parcelaAtual: i,
                    totalParcelas: parcelas
                });
            }
        }
    });
    
    // Agrupar por categoria e subcategoria
    const agrupado = {};
    let totalGeral = 0;
    
    despesasPorMes.forEach(d => {
        const categoria = d.categoria_nome || 'Sem Categoria';
        const subcategoria = d.subcategoria_nome || 'Sem Subcategoria';
        
        if (!agrupado[categoria]) {
            agrupado[categoria] = { 
                subcategorias: {},
                total: 0 
            };
        }
        
        if (!agrupado[categoria].subcategorias[subcategoria]) {
            agrupado[categoria].subcategorias[subcategoria] = {
                despesas: [],
                total: 0
            };
        }
        
        agrupado[categoria].subcategorias[subcategoria].despesas.push(d);
        agrupado[categoria].subcategorias[subcategoria].total += d.valorMes;
        agrupado[categoria].total += d.valorMes;
        totalGeral += d.valorMes;
    });
    
    // Renderizar com cores corretas e subcategorias agrupadas
    const container = document.getElementById('despesasAgrupadas');
    container.innerHTML = '';
    
    Object.keys(agrupado).sort().forEach(categoria => {
        const grupo = agrupado[categoria];
        
        const divCategoria = document.createElement('div');
        divCategoria.style.marginBottom = '30px';
        divCategoria.style.background = '#fff';
        divCategoria.style.border = '2px solid var(--gold-primary)';
        divCategoria.style.borderRadius = '8px';
        divCategoria.style.overflow = 'hidden';
        
        // Header da categoria
        let htmlCategoria = `
            <div style="background: var(--gold-primary); color: white; padding: 15px; font-weight: bold; font-size: 1.2em;">
                📁 ${categoria} - Total: R$ ${formatarReal(grupo.total)}
            </div>
        `;
        
        // Para cada subcategoria
        Object.keys(grupo.subcategorias).sort().forEach(subcategoria => {
            const subgrupo = grupo.subcategorias[subcategoria];
            
            htmlCategoria += `
                <div style="margin: 15px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
                    <div style="background: #f8f8f8; padding: 10px; font-weight: bold; color: var(--gold-dark); border-bottom: 2px solid #ddd;">
                        📌 ${subcategoria} - Subtotal: R$ ${formatarReal(subgrupo.total)}
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; font-size: 11px; margin: 0; border-collapse: collapse;">
                            <thead style="background: #f5f5f5;">
                                <tr>
                                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; color: #333;">Data</th>
                                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; color: #333;">Descrição</th>
                                    <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd; color: #333;">Valor</th>
                                    <th style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd; color: #333;">Forma Pagto</th>
                                    <th style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd; color: #333;">Parcela</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subgrupo.despesas.map((d, idx) => `
                                    <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">
                                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${formatarData(d.data)}</td>
                                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${d.descricao || '-'}</td>
                                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #333;">R$ ${formatarReal(d.valorMes)}</td>
                                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${d.forma_pagamento.toUpperCase()}</td>
                                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${d.parcelaAtual}/${d.totalParcelas}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
        
        divCategoria.innerHTML = htmlCategoria;
        container.appendChild(divCategoria);
    });
    
    // Total geral
    const totalDiv = document.createElement('div');
    totalDiv.style.textAlign = 'right';
    totalDiv.style.fontSize = '1.3em';
    totalDiv.style.fontWeight = 'bold';
    totalDiv.style.marginTop = '20px';
    totalDiv.style.padding = '15px';
    totalDiv.style.background = 'var(--gold-dark)';
    totalDiv.style.color = 'white';
    totalDiv.style.borderRadius = '8px';
    totalDiv.innerHTML = `TOTAL GERAL DO PERÍODO: R$ ${formatarReal(totalGeral)}`;
    container.appendChild(totalDiv);
    
    document.getElementById('resultadoRelatorioDespesas').style.display = 'block';
}

// Gerar gráfico de pizza com as categorias
let graficoDespesasInstance = null; // Guardar instância para destruir depois

function gerarGraficoPizzaDespesas(agrupado) {
    const ctx = document.getElementById('graficoPizzaDespesas');
    if (!ctx) return;
    
    // Destruir gráfico anterior se existir
    if (graficoDespesasInstance) {
        graficoDespesasInstance.destroy();
    }
    
    // Preparar dados
    const categorias = Object.keys(agrupado).sort();
    const valores = categorias.map(cat => agrupado[cat].total);
    
    // Cores para o gráfico (paleta harmoniosa)
    const cores = [
        '#C4A962', // Dourado
        '#8B7355', // Marrom
        '#D4AF37', // Ouro
        '#CD7F32', // Bronze
        '#B8860B', // DarkGoldenrod
        '#DAA520', // GoldenRod
        '#F0E68C', // Khaki
        '#BDB76B', // DarkKhaki
        '#9B870C', // YellowGreen Dark
        '#8B8000', // Dark Yellow
        '#A0826D', // Tan
        '#C19A6B'  // Camel
    ];
    
    // Criar gráfico
    graficoDespesasInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: categorias,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, categorias.length),
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label}: R$ ${formatarReal(value)} (${percentage}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: R$ ${formatarReal(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Exportar relatório PDF
function exportarRelatorioDespesasPDF() {
    alert('Função de exportação PDF em desenvolvimento');
}
// ==================== RETIRADAS ====================

let dadosRetiradas = [];

// Carregar retiradas recentes
async function carregarRetiradasRecentes() {
    const retiradas = await fetchAPI('/api/retiradas');
    const tbody = document.getElementById('corpoRetiradásRecentes');
    
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    retiradas.slice(0, 20).forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.style.background = idx % 2 === 0 ? '#fff' : '#f9f9f9';
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${formatarData(r.data)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${r.profissional}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${r.descricao || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; text-align: right; font-weight: bold;">R$ ${formatarReal(r.valor)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                <button onclick="excluirRetirada(${r.id})" class="btn-secondary" style="padding: 5px 10px;">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Salvar retirada
async function salvarRetirada(event) {
    event.preventDefault();
    
    const retirada = {
        data: document.getElementById('dataRetirada').value,
        profissional: document.getElementById('profissionalRetirada').value,
        valor: valorParaNumero(document.getElementById('valorRetirada').value),
        descricao: document.getElementById('descricaoRetirada').value
    };
    
    await fetchAPI('/api/retiradas', {
        method: 'POST',
        body: JSON.stringify(retirada)
    });
    
    fecharModal('modalNovaRetirada');
    document.getElementById('formRetirada').reset();
    await carregarRetiradasRecentes();
    alert('Retirada registrada com sucesso!');
}

// Excluir retirada
async function excluirRetirada(id) {
    if (confirm('Deseja realmente excluir esta retirada?')) {
        await fetchAPI(`/api/retiradas/${id}`, { method: 'DELETE' });
        await carregarRetiradasRecentes();
    }
}

// Gerar relatório por período
async function gerarRelatorioRetiradas() {
    const dataInicial = document.getElementById('dataInicialRetiradas').value;
    const dataFinal = document.getElementById('dataFinalRetiradas').value;
    const profissional = document.getElementById('filtroSocioRetiradas').value;
    
    let query = '/api/retiradas?';
    if (dataInicial) query += `data_inicial=${dataInicial}&`;
    if (dataFinal) query += `data_final=${dataFinal}&`;
    if (profissional) query += `profissional=${encodeURIComponent(profissional)}&`;
    
    const retiradas = await fetchAPI(query);
    
    // Agrupar por sócio
    const agrupado = {};
    let totalGeral = 0;
    
    retiradas.forEach(r => {
        if (!agrupado[r.profissional]) {
            agrupado[r.profissional] = { retiradas: [], total: 0 };
        }
        agrupado[r.profissional].retiradas.push(r);
        agrupado[r.profissional].total += r.valor;
        totalGeral += r.valor;
    });
    
    // Renderizar
    const container = document.getElementById('conteudoRelatorioRetiradas');
    container.innerHTML = '';
    
    Object.keys(agrupado).sort().forEach(socio => {
        const grupo = agrupado[socio];
        
        const div = document.createElement('div');
        div.style.marginBottom = '30px';
        div.style.background = '#fff';
        div.style.border = '1px solid #ddd';
        div.style.borderRadius = '8px';
        div.style.overflow = 'hidden';
        
        div.innerHTML = `
            <div style="background: var(--gold-primary); color: white; padding: 15px; font-weight: bold; font-size: 1.1em;">
                ${socio} - Total: R$ ${formatarReal(grupo.total)}
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 12px; margin: 0; border-collapse: collapse;">
                    <thead style="background: #f5f5f5;">
                        <tr>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd; color: #333;">Data</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd; color: #333;">Descrição</th>
                            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd; color: #333;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${grupo.retiradas.map((r, idx) => `
                            <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">
                                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #333;">${formatarData(r.data)}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #333;">${r.descricao || '-'}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #333;">R$ ${formatarReal(r.valor)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        container.appendChild(div);
    });
    
    // Total geral
    const totalDiv = document.createElement('div');
    totalDiv.style.textAlign = 'right';
    totalDiv.style.fontSize = '1.3em';
    totalDiv.style.fontWeight = 'bold';
    totalDiv.style.marginTop = '20px';
    totalDiv.style.padding = '15px';
    totalDiv.style.background = 'var(--gold-dark)';
    totalDiv.style.color = 'white';
    totalDiv.style.borderRadius = '8px';
    totalDiv.innerHTML = `TOTAL GERAL: R$ ${formatarReal(totalGeral)}`;
    container.appendChild(totalDiv);
    
    document.getElementById('resultadoRelatorioRetiradas').style.display = 'block';
}

// Gerar relatório anual
async function gerarRelatorioAnual() {
    const ano = document.getElementById('anoRelatorioAnual').value;
    
    const retiradas = await fetchAPI(`/api/retiradas?data_inicial=${ano}-01-01&data_final=${ano}-12-31`);
    
    // Agrupar por sócio e mês
    const dados = {};
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    retiradas.forEach(r => {
        if (!dados[r.profissional]) {
            dados[r.profissional] = { meses: Array(12).fill(0), total: 0 };
        }
        
        const dataRetirada = new Date(r.data + 'T00:00:00');
        const mesIndex = dataRetirada.getMonth();
        
        dados[r.profissional].meses[mesIndex] += r.valor;
        dados[r.profissional].total += r.valor;
    });
    
    // Renderizar tabela
    const container = document.getElementById('conteudoRelatorioAnual');
    container.innerHTML = '';
    
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '11px';
    table.style.borderCollapse = 'collapse';
    
    // Header
    let headerHTML = '<thead style="background: var(--gold-primary);"><tr>';
    headerHTML += '<th style="padding: 10px; text-align: left; color: white; border: 1px solid #ddd; position: sticky; left: 0; background: var(--gold-primary);">Sócio</th>';
    meses.forEach(mes => {
        headerHTML += `<th style="padding: 10px; text-align: right; color: white; border: 1px solid #ddd;">${mes}</th>`;
    });
    headerHTML += '<th style="padding: 10px; text-align: right; color: white; border: 1px solid #ddd; font-weight: bold;">TOTAL</th>';
    headerHTML += '</tr></thead>';
    
    // Body
    let bodyHTML = '<tbody>';
    let totaisMes = Array(12).fill(0);
    let totalGeralAno = 0;
    
    Object.keys(dados).sort().forEach((socio, idx) => {
        const linha = dados[socio];
        bodyHTML += `<tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">`;
        bodyHTML += `<td style="padding: 8px; border: 1px solid #eee; font-weight: bold; color: #333; position: sticky; left: 0; background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">${socio}</td>`;
        
        linha.meses.forEach((valor, mesIdx) => {
            bodyHTML += `<td style="padding: 8px; border: 1px solid #eee; text-align: right; color: #333;">R$ ${formatarReal(valor)}</td>`;
            totaisMes[mesIdx] += valor;
        });
        
        bodyHTML += `<td style="padding: 8px; border: 1px solid #eee; text-align: right; font-weight: bold; background: #f5f5f5; color: #333;">R$ ${formatarReal(linha.total)}</td>`;
        bodyHTML += '</tr>';
        
        totalGeralAno += linha.total;
    });
    
    // Footer com totais
    bodyHTML += '<tr style="background: var(--gold-dark); font-weight: bold;">';
    bodyHTML += '<td style="padding: 10px; border: 1px solid #ddd; color: white; position: sticky; left: 0; background: var(--gold-dark);">TOTAL</td>';
    totaisMes.forEach(total => {
        bodyHTML += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: white;">R$ ${formatarReal(total)}</td>`;
    });
    bodyHTML += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: white; font-size: 1.1em;">R$ ${formatarReal(totalGeralAno)}</td>`;
    bodyHTML += '</tr>';
    bodyHTML += '</tbody>';
    
    table.innerHTML = headerHTML + bodyHTML;
    
    const wrapper = document.createElement('div');
    wrapper.style.overflowX = 'auto';
    wrapper.appendChild(table);
    
    container.appendChild(wrapper);
    
    document.getElementById('resultadoRelatorioAnual').style.display = 'block';
}

// Exportar relatórios (placeholder)
function exportarRelatorioRetiradas() {
    alert('Função de exportação PDF em desenvolvimento');
}

function exportarRelatorioAnual() {
    alert('Função de exportação PDF em desenvolvimento');
}

// Popular select de profissionais nas retiradas
function popularSelectsRetiradas() {
    const selects = ['profissionalRetirada', 'filtroSocioRetiradas'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select && dadosProfissionais) {
            const opcaoTodos = select.id.includes('filtro') ? '<option value="">Todos</option>' : '<option value="">Selecione...</option>';
            select.innerHTML = opcaoTodos;
            dadosProfissionais.forEach(prof => {
                select.innerHTML += `<option value="${prof.nome}">${prof.nome}</option>`;
            });
        }
    });
}

// Inicializar máscaras de moeda quando página carregar
document.addEventListener('DOMContentLoaded', function() {
    // Aplicar máscaras em todos os campos de valor
    aplicarMascaraMoeda('valorLancamento');
    aplicarMascaraMoeda('valorComissao');
    aplicarMascaraMoeda('valorBonificacao');
    aplicarMascaraMoeda('valorDespesa');
    aplicarMascaraMoeda('valorRetirada');
    
    // Definir data atual nos campos de data
    definirDataAtual();
});

// ============================================
// RELATÓRIO DE PRODUTIVIDADE
// ============================================

// Carregar procedimentos no filtro
async function carregarProcedimentosProdutividade() {
    const procedimentos = await fetchAPI('/api/procedimentos');
    const lista = document.getElementById('listaProcedimentosProdutividade');
    
    lista.innerHTML = procedimentos.map(p => `
        <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" class="checkbox-procedimento" value="${p.nome}" checked>
            <span>${p.nome}</span>
        </label>
    `).join('');
}

// Toggle todos procedimentos
function toggleTodosProcedimentos() {
    const todos = document.getElementById('todosProcedimentosProdutividade').checked;
    document.querySelectorAll('.checkbox-procedimento').forEach(cb => {
        cb.checked = todos;
    });
}

// Popular select de médicos
async function popularMedicosProdutividade() {
    const profissionais = await fetchAPI('/api/profissionais');
    const select = document.getElementById('medicoProdutividade');
    
    profissionais.forEach(p => {
        const option = document.createElement('option');
        option.value = p.nome;
        option.textContent = p.nome;
        select.appendChild(option);
    });
}

// Calcular impostos e taxas
function calcularImpostosETaxasProdutividade(lancamento, impostos) {
    const valor = parseFloat(lancamento.valor);
    let impostoValor = 0;
    let taxaValor = 0;
    
    // Imposto baseado no tipo
    const tipoProc = lancamento.tipo_procedimento || 'clinico';
    if (tipoProc === 'clinico') {
        impostoValor = (valor * (impostos.imposto_clinico || 0)) / 100;
    } else if (tipoProc === 'hospitalar') {
        impostoValor = (valor * (impostos.imposto_hospitalar || 0)) / 100;
    } else if (tipoProc === 'cursos') {
        impostoValor = (valor * (impostos.imposto_cursos || 0)) / 100;
    }
    
    // Taxa baseada na forma de pagamento
    const forma = lancamento.forma_pagamento;
    const parcelas = lancamento.parcelas || 1;
    
    if (forma === 'debito') {
        taxaValor = (valor * (impostos.taxa_debito || 0)) / 100;
    } else if (forma === 'credito') {
        if (parcelas === 1) {
            taxaValor = (valor * (impostos.taxa_credito_vista || 0)) / 100;
        } else {
            taxaValor = (valor * (impostos.taxa_credito_parcelado || 0)) / 100;
        }
    }
    
    return { impostoValor, taxaValor };
}

// Gerar relatório
async function gerarRelatorioProdutividade() {
    const mesInicio = document.getElementById('mesInicioProdutividade').value;
    const mesFim = document.getElementById('mesFimProdutividade').value;
    const medico = document.getElementById('medicoProdutividade').value;
    const tipoValor = document.getElementById('tipoValorProdutividade').value;
    
    if (!mesInicio || !mesFim) {
        alert('Selecione o período');
        return;
    }
    
    // Pegar procedimentos selecionados
    const checkboxes = document.querySelectorAll('.checkbox-procedimento:checked');
    const procedimentos = Array.from(checkboxes).map(cb => cb.value).join(',');
    
    if (!procedimentos) {
        alert('Selecione pelo menos um procedimento');
        return;
    }
    
    // Buscar dados
    let query = `/api/relatorio-produtividade?mes_inicio=${mesInicio}&mes_fim=${mesFim}&profissional=${medico}&procedimentos=${procedimentos}`;
    const data = await fetchAPI(query);
    
    // Processar dados
    processarDadosProdutividade(data, mesInicio, mesFim, tipoValor);
}

// Processar e exibir dados
function processarDadosProdutividade(data, mesInicio, mesFim, tipoValor) {
    const { lancamentos, impostos } = data;
    
    // Gerar lista de meses
    const meses = gerarListaMeses(mesInicio, mesFim);
    
    // Agrupar por procedimento e mês
    const agrupado = {};
    
    lancamentos.forEach(l => {
        const proc = l.procedimento;
        const mes = l.data.substring(0, 7); // YYYY-MM
        
        if (!agrupado[proc]) {
            agrupado[proc] = {};
            meses.forEach(m => agrupado[proc][m] = 0);
        }
        
        // Calcular valor (bruto ou líquido)
        let valor = parseFloat(l.valor);
        
        if (tipoValor === 'liquido') {
            const { impostoValor, taxaValor } = calcularImpostosETaxasProdutividade(l, impostos);
            valor = valor - impostoValor - taxaValor;
        }
        
        agrupado[proc][mes] += valor;
    });
    
    // Renderizar tabela
    renderizarTabelaProdutividade(agrupado, meses, tipoValor);
    
    // Renderizar gráfico
    renderizarGraficoProdutividade(agrupado, meses);
    
    // Mostrar resultado
    document.getElementById('resultadoProdutividade').style.display = 'block';
}

// Gerar lista de meses entre início e fim
function gerarListaMeses(inicio, fim) {
    const meses = [];
    const [anoIni, mesIni] = inicio.split('-').map(Number);
    const [anoFim, mesFim] = fim.split('-').map(Number);
    
    let ano = anoIni;
    let mes = mesIni;
    
    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
        meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
        mes++;
        if (mes > 12) {
            mes = 1;
            ano++;
        }
    }
    
    return meses;
}

// Renderizar tabela
function renderizarTabelaProdutividade(agrupado, meses, tipoValor) {
    const tabela = document.getElementById('tabelaProdutividade');
    
    let html = '<thead><tr>';
    html += '<th style="background: var(--gold-primary); color: white; padding: 12px; text-align: left; position: sticky; left: 0; z-index: 10;">Procedimento</th>';
    
    meses.forEach(mes => {
        const [ano, m] = mes.split('-');
        const mesNome = new Date(ano, m - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        html += `<th style="background: var(--gold-primary); color: white; padding: 12px; text-align: right;">${mesNome}</th>`;
    });
    
    html += '<th style="background: var(--gold-dark); color: white; padding: 12px; text-align: right; font-weight: bold;">TOTAL</th>';
    html += '</tr></thead><tbody>';
    
    // Totais por mês
    const totaisMes = {};
    meses.forEach(m => totaisMes[m] = 0);
    let totalGeral = 0;
    
    // Linhas de procedimentos
    Object.keys(agrupado).sort().forEach((proc, idx) => {
        const valores = agrupado[proc];
        let totalProc = 0;
        
        html += `<tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">`;
        html += `<td style="padding: 10px; font-weight: bold; position: sticky; left: 0; background: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'}; z-index: 5;">${proc}</td>`;
        
        meses.forEach(mes => {
            const valor = valores[mes] || 0;
            totalProc += valor;
            totaisMes[mes] += valor;
            
            html += `<td style="padding: 10px; text-align: right; ${valor > 0 ? 'font-weight: 600;' : 'color: #999;'}">
                R$ ${formatarReal(valor)}
            </td>`;
        });
        
        totalGeral += totalProc;
        
        html += `<td style="padding: 10px; text-align: right; font-weight: bold; background: #f0f0f0;">R$ ${formatarReal(totalProc)}</td>`;
        html += '</tr>';
    });
    
    // Linha de totais
    html += '<tr style="background: var(--gold-dark); color: white; font-weight: bold;">';
    html += '<td style="padding: 12px;">TOTAL</td>';
    
    meses.forEach(mes => {
        html += `<td style="padding: 12px; text-align: right;">R$ ${formatarReal(totaisMes[mes])}</td>`;
    });
    
    html += `<td style="padding: 12px; text-align: right; font-size: 1.1em;">R$ ${formatarReal(totalGeral)}</td>`;
    html += '</tr>';
    
    html += '</tbody>';
    tabela.innerHTML = html;
}

// Renderizar gráfico de barras
function renderizarGraficoProdutividade(agrupado, meses) {
    const container = document.getElementById('graficoProdutividade');
    
    // Calcular totais por procedimento
    const totais = {};
    Object.keys(agrupado).forEach(proc => {
        totais[proc] = meses.reduce((sum, mes) => sum + (agrupado[proc][mes] || 0), 0);
    });
    
    // Ordenar por total (maior para menor)
    const procedimentosOrdenados = Object.keys(totais).sort((a, b) => totais[b] - totais[a]);
    
    // Valor máximo para escala
    const valorMax = Math.max(...Object.values(totais));
    
    // Cores para as barras
    const cores = ['#8B6914', '#C9A84C', '#A0826D', '#6B5D3F', '#D4AF37', '#B8860B', '#DAA520', '#CD853F'];
    
    let html = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 300px; padding: 20px; background: #f9f9f9; border-radius: 8px; gap: 10px;">';
    
    procedimentosOrdenados.forEach((proc, idx) => {
        const valor = totais[proc];
        const altura = (valor / valorMax) * 100;
        const cor = cores[idx % cores.length];
        
        html += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="font-size: 12px; font-weight: bold; color: #333; text-align: center;">
                    R$ ${formatarReal(valor)}
                </div>
                <div style="width: 100%; height: ${altura}%; background: ${cor}; border-radius: 5px 5px 0 0; min-height: 20px; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                </div>
                <div style="font-size: 11px; color: #666; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${proc}">
                    ${proc}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Exportar PDF
function exportarProdutividadePDF() {
    alert('Funcionalidade de exportação PDF em desenvolvimento!');
    // Implementar com jsPDF
}

// Exportar Excel
function exportarProdutividadeExcel() {
    alert('Funcionalidade de exportação Excel em desenvolvimento!');
    // Implementar com SheetJS
}

