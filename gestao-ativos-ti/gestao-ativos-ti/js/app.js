// ============================================================
// js/app.js — Lógica principal do sistema
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let inventario = [];
let historico = [];

const PERMS = {
  admin:   { canCreate: true,  canEdit: true,  canDelete: true,  verUsuarios: true  },
  tecnico: { canCreate: true,  canEdit: true,  canDelete: false, verUsuarios: false },
  auditor: { canCreate: false, canEdit: false, canDelete: false, verUsuarios: false },
};

// ============================================================
// AUTENTICAÇÃO
// ============================================================
async function doLogin() {
  const email = document.getElementById('inp-email').value.trim();
  const pass  = document.getElementById('inp-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');

  err.style.display = 'none';
  btn.textContent = 'Entrando...';
  btn.disabled = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  btn.textContent = 'Entrar';
  btn.disabled = false;

  if (error) {
    document.getElementById('login-error-msg').textContent = 'E-mail ou senha incorretos.';
    err.style.display = 'flex';
    return;
  }

  currentUser = data.user;
  await loadProfile();
  showApp();
}

async function doLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  inventario = [];
  historico = [];
  document.getElementById('screen-login').style.display = 'flex';
  document.getElementById('screen-app').style.display = 'none';
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data;
}

// ============================================================
// INICIALIZAÇÃO DO APP
// ============================================================
async function showApp() {
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-app').style.display = 'block';

  const p = PERMS[currentProfile.role];

  // Topo: nome e perfil
  const ROLE_LABELS = { admin: 'Admin', tecnico: 'Técnico', auditor: 'Auditor' };
  const ROLE_COLORS = {
    admin:   { bg: '#fde8e8', color: '#b91c1c' },
    tecnico: { bg: '#dbeafe', color: '#1d4ed8' },
    auditor: { bg: '#d1fae5', color: '#065f46' },
  };
  const rc = ROLE_COLORS[currentProfile.role];
  document.getElementById('top-name').textContent = currentProfile.nome;
  const rt = document.getElementById('top-role-tag');
  rt.textContent = ROLE_LABELS[currentProfile.role];
  rt.style.background = rc.bg;
  rt.style.color = rc.color;

  // Iniciais no avatar
  const initials = currentProfile.nome.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
  const av = document.getElementById('top-avatar');
  av.textContent = initials;
  av.style.background = rc.bg;
  av.style.color = rc.color;

  // Permissões de UI
  document.getElementById('btn-novo').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('nav-users').style.display = p.verUsuarios ? 'inline-block' : 'none';

  await Promise.all([loadAtivos(), loadHistorico(), loadLicencas(), loadKPIs()]);
  initCharts();
  renderAlertas();
}

// ============================================================
// ATIVOS
// ============================================================
async function loadAtivos() {
  const { data, error } = await sb.from('ativos').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  inventario = data;
  applyFilters();
  document.getElementById('kpi-total').textContent = inventario.length.toLocaleString('pt-BR');
}

function applyFilters() {
  const q   = (document.getElementById('searchInput').value || '').toLowerCase();
  const cat = document.getElementById('filterCat').value;
  const loc = document.getElementById('filterLoc').value;
  const st  = document.getElementById('filterStatus').value;
  const filtered = inventario.filter(r =>
    (!q   || r.nome.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q) || (r.usuario_resp||'').toLowerCase().includes(q)) &&
    (!cat || r.categoria === cat) &&
    (!loc || r.localizacao === loc) &&
    (!st  || r.status === st)
  );
  renderInventory(filtered);
}

function clearFilters() {
  ['searchInput','filterCat','filterLoc','filterStatus'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
}

const statusLabel = {
  ok:   '<span class="badge badge-success"><span class="dot dot-ok"></span>Ativo</span>',
  warn: '<span class="badge badge-warning"><span class="dot dot-warn"></span>Atenção</span>',
  err:  '<span class="badge badge-danger"><span class="dot dot-err"></span>Inativo</span>',
};

function renderInventory(data) {
  const body = document.getElementById('inventoryBody');
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum ativo encontrado.</td></tr>`;
    document.getElementById('filter-count').textContent = '';
    return;
  }
  body.innerHTML = data.map(r => `
    <tr onclick="showDetalhe('${r.id}')">
      <td style="color:var(--text-muted);font-size:12px">${r.codigo}</td>
      <td style="font-weight:500">${r.nome}</td>
      <td style="color:var(--text-secondary)">${r.categoria}</td>
      <td>${r.usuario_resp || '—'}</td>
      <td style="color:var(--text-secondary)">${r.localizacao}</td>
      <td>${statusLabel[r.status]}</td>
      <td><button class="action-btn" onclick="event.stopPropagation();showDetalhe('${r.id}')">
        <i class="ti ti-eye" style="font-size:12px"></i>
      </button></td>
    </tr>`).join('');
  document.getElementById('filter-count').textContent = `Exibindo ${data.length} de ${inventario.length} ativos`;
}

async function salvarAtivo() {
  const nome = document.getElementById('f-nome').value.trim();
  const cat  = document.getElementById('f-cat').value;
  const loc  = document.getElementById('f-loc').value;
  if (!nome || !cat || !loc) { showToast('Preencha os campos obrigatórios (*)', '#d03b3b'); return; }

  const { data: last } = await sb.from('ativos').select('codigo').order('created_at', { ascending: false }).limit(1);
  const lastNum = last && last.length ? parseInt(last[0].codigo.replace('IT-','')) : 0;
  const codigo  = 'IT-' + String(lastNum + 1).padStart(4, '0');

  const novoAtivo = {
    codigo,
    nome,
    categoria:    cat,
    localizacao:  loc,
    usuario_resp: document.getElementById('f-user').value || null,
    serie:        document.getElementById('f-serie').value || null,
    fabricante:   document.getElementById('f-fab').value || null,
    data_aquisicao: document.getElementById('f-data').value || null,
    valor:        document.getElementById('f-valor').value ? parseFloat(document.getElementById('f-valor').value) : null,
    garantia_ate: document.getElementById('f-garantia').value || null,
    observacoes:  document.getElementById('f-obs').value || null,
    status:       document.getElementById('f-status').value,
    created_by:   currentUser.id,
  };

  const { data, error } = await sb.from('ativos').insert(novoAtivo).select().single();
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }

  // Registrar histórico
  await sb.from('historico').insert({
    ativo_id:    data.id,
    ativo_codigo: codigo,
    ativo_nome:  nome,
    tipo:        'Cadastro',
    descricao:   `Ativo cadastrado por ${currentProfile.nome}.`,
    responsavel: currentProfile.nome,
    created_by:  currentUser.id,
  });

  ['f-nome','f-serie','f-fab','f-user','f-data','f-valor','f-garantia','f-obs'].forEach(id => document.getElementById(id).value = '');
  ['f-cat','f-loc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-status').value = 'ok';

  closeModal('Novo');
  await loadAtivos();
  await loadHistorico();
  showToast(codigo + ' cadastrado com sucesso!');
}

async function showDetalhe(id) {
  const a = inventario.find(r => r.id === id);
  if (!a) return;
  const p = PERMS[currentProfile.role];
  const { data: hist } = await sb.from('historico').select('*').eq('ativo_id', id).order('created_at', { ascending: false });

  document.getElementById('detalhe-titulo').innerHTML = `${a.codigo} — ${a.nome}
    <button onclick="closeModal('Detalhe')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px" aria-label="Fechar">×</button>`;

  const fmt = v => v ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—';
  const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  const tagCls = { Cadastro:'tl-tag-blue',Movimentação:'tl-tag-green',Manutenção:'tl-tag-amber',Atualização:'tl-tag-blue',Descarte:'tl-tag-red' };
  const dotCls = { Cadastro:'tl-dot-blue',Movimentação:'tl-dot-green',Manutenção:'tl-dot-amber',Atualização:'tl-dot-blue',Descarte:'tl-dot-red' };

  document.getElementById('detalhe-content').innerHTML = `
    <div style="margin-bottom:12px">${statusLabel[a.status]}</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-item-label">Categoria</div><div class="info-item-val">${a.categoria}</div></div>
      <div class="info-item"><div class="info-item-label">Fabricante</div><div class="info-item-val">${a.fabricante||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Usuário</div><div class="info-item-val">${a.usuario_resp||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Localização</div><div class="info-item-val">${a.localizacao}</div></div>
      <div class="info-item"><div class="info-item-label">Nº de série</div><div class="info-item-val">${a.serie||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Valor</div><div class="info-item-val">${fmt(a.valor)}</div></div>
      <div class="info-item"><div class="info-item-label">Aquisição</div><div class="info-item-val">${fmtDate(a.data_aquisicao)}</div></div>
      <div class="info-item"><div class="info-item-label">Garantia até</div><div class="info-item-val">${fmtDate(a.garantia_ate)}</div></div>
    </div>
    ${a.observacoes ? `<div style="font-size:13px;color:var(--text-secondary);padding:10px;background:var(--surface-1);border-radius:8px;margin-bottom:12px">${a.observacoes}</div>` : ''}
    ${hist && hist.length ? `
      <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:10px">Histórico</div>
      <div class="timeline">${hist.map(h => `
        <div class="tl-item">
          <div class="tl-dot ${dotCls[h.tipo]||'tl-dot-blue'}"></div>
          <div class="tl-date">${new Date(h.created_at).toLocaleDateString('pt-BR')} · ${h.responsavel}</div>
          <div class="tl-title">${h.tipo}</div>
          <div class="tl-desc">${h.descricao}</div>
          <span class="tl-tag ${tagCls[h.tipo]||'tl-tag-blue'}">${h.tipo}</span>
        </div>`).join('')}
      </div>` : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">Nenhum evento registrado.</div>'}
    <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:0.5px solid var(--border)">
      ${p.canEdit ? `<button class="action-btn btn-primary" onclick="registrarEvento('${a.id}','${a.codigo}','${a.nome.replace(/'/g,'')}')">
        <i class="ti ti-plus" style="font-size:12px"></i> Registrar evento
      </button>` : ''}
    </div>`;
  openModal('Detalhe');
}

async function registrarEvento(ativoId, codigoAtivo, nomeAtivo) {
  const tipo = prompt('Tipo do evento:\n1 - Movimentação\n2 - Manutenção\n3 - Atualização\n4 - Descarte\n\nDigite o número:');
  const tipos = { '1':'Movimentação','2':'Manutenção','3':'Atualização','4':'Descarte' };
  if (!tipos[tipo]) return;
  const desc = prompt('Descrição do evento:');
  if (!desc) return;
  await sb.from('historico').insert({
    ativo_id: ativoId, ativo_codigo: codigoAtivo, ativo_nome: nomeAtivo,
    tipo: tipos[tipo], descricao: desc, responsavel: currentProfile.nome, created_by: currentUser.id,
  });
  closeModal('Detalhe');
  await loadHistorico();
  showDetalhe(ativoId);
  showToast('Evento registrado!');
}

// ============================================================
// HISTÓRICO
// ============================================================
async function loadHistorico() {
  const { data } = await sb.from('historico').select('*').order('created_at', { ascending: false }).limit(50);
  historico = data || [];
  renderHist(historico);
}

function renderHist(data) {
  const tagCls = { Cadastro:'tl-tag-blue',Movimentação:'tl-tag-green',Manutenção:'tl-tag-amber',Atualização:'tl-tag-blue',Descarte:'tl-tag-red' };
  const dotCls = { Cadastro:'tl-dot-blue',Movimentação:'tl-dot-green',Manutenção:'tl-dot-amber',Atualização:'tl-dot-blue',Descarte:'tl-dot-red' };
  document.getElementById('histTimeline').innerHTML = data.length
    ? data.map(h => `
        <div class="tl-item">
          <div class="tl-dot ${dotCls[h.tipo]||'tl-dot-blue'}"></div>
          <div class="tl-date">${new Date(h.created_at).toLocaleDateString('pt-BR')} · ${h.responsavel}</div>
          <div class="tl-title">${h.ativo_codigo} — ${h.ativo_nome}</div>
          <div class="tl-desc">${h.descricao}</div>
          <span class="tl-tag ${tagCls[h.tipo]||'tl-tag-blue'}">${h.tipo}</span>
        </div>`).join('')
    : '<div style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum evento registrado ainda.</div>';
}

function applyHistFilter() {
  const q    = (document.getElementById('histSearch').value || '').toLowerCase();
  const tipo = document.getElementById('histTipo').value;
  renderHist(historico.filter(h =>
    (!q || h.ativo_nome.toLowerCase().includes(q) || h.responsavel.toLowerCase().includes(q)) &&
    (!tipo || h.tipo === tipo)
  ));
}

// ============================================================
// LICENÇAS
// ============================================================
async function loadLicencas() {
  const { data } = await sb.from('licencas').select('*').order('renovacao');
  if (!data) return;
  document.getElementById('licenseList').innerHTML = data.map(l => {
    const pct = Math.round(l.usadas / l.total * 100);
    const cls = pct >= 95 ? 'progress-red' : pct >= 80 ? 'progress-amber' : 'progress-green';
    const renov = l.renovacao ? new Date(l.renovacao).toLocaleDateString('pt-BR') : '—';
    return `<div class="license-row">
      <div><div style="font-size:13px;color:var(--text-primary)">${l.nome}</div>
      <div style="font-size:11px;color:var(--text-muted)">Renovação: ${renov}</div></div>
      <div style="flex:1;margin:0 12px"><div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div></div>
      <span style="font-weight:500;color:var(--text-primary);white-space:nowrap">${l.usadas}<span style="color:var(--text-muted)">/${l.total}</span></span>
    </div>`;
  }).join('');
}

// ============================================================
// KPIs
// ============================================================
async function loadKPIs() {
  const { count: total } = await sb.from('ativos').select('*', { count: 'exact', head: true });
  const { count: ativos } = await sb.from('ativos').select('*', { count: 'exact', head: true }).eq('status','ok');
  const { count: alertas } = await sb.from('ativos').select('*', { count: 'exact', head: true }).in('status',['warn','err']);
  document.getElementById('kpi-total').textContent   = (total  || 0).toLocaleString('pt-BR');
  document.getElementById('kpi-ativos').textContent  = total ? Math.round(ativos/total*100)+'%' : '—';
  document.getElementById('kpi-alertas').textContent = alertas || 0;
}

// ============================================================
// ALERTAS (baseados nos dados reais)
// ============================================================
function renderAlertas() {
  const alertas = [
    { tipo:'danger',  icon:'ti-alert-triangle', title:'Licença Microsoft 365 expira em 8 dias',   desc:'500 usuários serão afetados. Renovação necessária até 04/07/2026.' },
    { tipo:'danger',  icon:'ti-device-desktop-off', title:'Equipamentos sem comunicação há 48h', desc:'Verificar conectividade ou possível descarte não registrado.' },
    { tipo:'warning', icon:'ti-virus',           title:'Notebooks sem antivírus atualizado',      desc:'Atualização pendente há mais de 14 dias.' },
    { tipo:'warning', icon:'ti-clock',           title:'Garantia de ativos vence em 30 dias',     desc:'Verificar extensão de garantia dos servidores.' },
  ];
  document.getElementById('alertList').innerHTML = alertas.map(a => `
    <div class="alert-row">
      <div class="alert-icon ${a.tipo}"><i class="ti ${a.icon}" style="font-size:16px"></i></div>
      <div><div style="font-size:13px;font-weight:500;color:var(--text-primary)">${a.title}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${a.desc}</div></div>
    </div>`).join('');
}

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportCSV() {
  const rows = inventario.map(r => [
    r.codigo, r.nome, r.categoria, r.usuario_resp||'', r.localizacao,
    r.serie||'', r.fabricante||'',
    r.status === 'ok' ? 'Ativo' : r.status === 'warn' ? 'Atenção' : 'Inativo'
  ].join(';'));
  const csv = 'Código;Nome;Categoria;Usuário;Localização;Nº Série;Fabricante;Status\n' + rows.join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'ativos_ti.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado com sucesso!');
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function openModal(name)  { document.getElementById('modal' + name).classList.add('open'); }
function closeModal(name) { document.getElementById('modal' + name).classList.remove('open'); }
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}
function showToast(msg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.cssText = `display:block;position:fixed;bottom:20px;right:20px;background:${color||'#0ca30c'};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,.15)`;
  setTimeout(() => t.style.display = 'none', 3000);
}

// ============================================================
// GRÁFICOS
// ============================================================
let chartsInit = false;
function initCharts() {
  if (chartsInit) return; chartsInit = true;
  new Chart(document.getElementById('chartCat'), {
    type: 'doughnut',
    data: { labels: ['Notebooks','Desktops','Servidores','Monitores','Periféricos'],
      datasets: [{ data: [890,620,180,450,407], backgroundColor: ['#2a78d6','#1baf7a','#eda100','#4a3aa7','#898781'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '60%' }
  });
  new Chart(document.getElementById('chartStatus'), {
    type: 'line',
    data: { labels: ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],
      datasets: [{ data: [97,98,96,99,98,97,98], borderColor: '#1baf7a', backgroundColor: 'rgba(27,175,122,0.08)', borderWidth: 2, fill: true, tension: .4, pointBackgroundColor: '#1baf7a', pointRadius: 4, pointBorderColor: '#fff', pointBorderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { min: 90, max: 100, ticks: { callback: v => v + '%', color: '#898781', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.05)' } }, x: { ticks: { color: '#898781', font: { size: 11 } }, grid: { display: false } } } }
  });
}

// ============================================================
// VERIFICAR SESSÃO AO CARREGAR
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    showApp();
  }
  // Enter no login
  document.getElementById('inp-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('inp-email').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});
