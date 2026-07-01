// ============================================================
// js/app.js — Lógica principal do sistema
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let inventario = [];
let historico = [];
let licencas = [];
let impressoras = [];
let credenciais = [];
let chamados = [];
let manutencoes = [];
let fornecedores = [];
let auditoria = [];
let editLicId = null;
let editPrintId = null;
let editCredId = null;
let editAtivoId = null;
let editChamId = null;
let editManutId = null;
let editFornId = null;

const PERMS = {
  admin:   { canCreate: true,  canEdit: true,  canDelete: true,  verUsuarios: true,  verSenhas: true,  verAuditoria: true  },
  tecnico: { canCreate: true,  canEdit: true,  canDelete: false, verUsuarios: false, verSenhas: false, verAuditoria: false },
  auditor: { canCreate: false, canEdit: false, canDelete: false, verUsuarios: false, verSenhas: false, verAuditoria: true  },
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
  document.getElementById('btn-import').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('btn-nova-lic').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('btn-nova-print').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('btn-nova-manut').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('btn-novo-forn').style.display = p.canCreate ? 'inline-flex' : 'none';
  document.getElementById('nav-cred').style.display = p.verSenhas ? 'inline-block' : 'none';
  document.getElementById('nav-audit').style.display = p.verAuditoria ? 'inline-block' : 'none';
  document.getElementById('nav-users').style.display = p.verUsuarios ? 'inline-block' : 'none';

  await Promise.all([loadAtivos(), loadHistorico(), loadLicencas(), loadImpressoras(),
                     loadChamados(), loadManutencoes(), loadFornecedores(), loadKPIs()]);
  if (p.verSenhas) loadCredenciais();
  if (p.verAuditoria) loadAuditoria();
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
  populateFilterOptions();
  populateAtivoSelects();
  applyFilters();
  updateDashboard();
  document.getElementById('kpi-total').textContent = inventario.length.toLocaleString('pt-BR');
}

// Preenche os <select> de "ativo relacionado" dos chamados e manutenções.
function populateAtivoSelects() {
  const opts = '<option value="">Nenhum</option>' +
    inventario.map(a => `<option value="${a.id}">${a.codigo} — ${a.nome}</option>`).join('');
  ['ch-ativo','mt-ativo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const keep = el.value; el.innerHTML = opts; el.value = keep; }
  });
}

// Reconstrói as opções dos filtros (e dos datalists) a partir dos dados reais,
// para que categorias/localizações novas digitadas pelo usuário apareçam.
function populateFilterOptions() {
  const cats = [...new Set(['Notebook','Desktop','Servidor','Monitor','Periférico',
    ...inventario.map(r => r.categoria).filter(Boolean)])];
  const locs = [...new Set(['Sede SP','Campinas','Home Office','Data Center',
    ...inventario.map(r => r.localizacao).filter(Boolean)])];

  const selCat = document.getElementById('filterCat');
  const selLoc = document.getElementById('filterLoc');
  const keepCat = selCat.value, keepLoc = selLoc.value;
  selCat.innerHTML = '<option value="">Todas as categorias</option>' + cats.map(c => `<option>${c}</option>`).join('');
  selLoc.innerHTML = '<option value="">Todas as localizações</option>' + locs.map(l => `<option>${l}</option>`).join('');
  selCat.value = keepCat; selLoc.value = keepLoc;

  document.getElementById('dl-cat').innerHTML = cats.map(c => `<option>${c}</option>`).join('') + '<option>Outro</option>';
  document.getElementById('dl-loc').innerHTML = locs.map(l => `<option>${l}</option>`).join('') + '<option>Outro</option>';

  const setores = [...new Set(inventario.map(r => r.setor).filter(Boolean))].sort();
  const dlSetor = document.getElementById('dl-setor');
  if (dlSetor) dlSetor.innerHTML = setores.map(s => `<option>${s}</option>`).join('');
}

function applyFilters() {
  const q   = (document.getElementById('searchInput').value || '').toLowerCase();
  const cat = document.getElementById('filterCat').value;
  const loc = document.getElementById('filterLoc').value;
  const st  = document.getElementById('filterStatus').value;
  const filtered = inventario.filter(r =>
    (!q   || r.nome.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q) || (r.usuario_resp||'').toLowerCase().includes(q) || (r.setor||'').toLowerCase().includes(q)) &&
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
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum ativo encontrado.</td></tr>`;
    document.getElementById('filter-count').textContent = '';
    return;
  }
  body.innerHTML = data.map(r => `
    <tr onclick="showDetalhe('${r.id}')">
      <td style="color:var(--text-muted);font-size:12px">${r.codigo}</td>
      <td style="font-weight:500">${r.nome}</td>
      <td style="color:var(--text-secondary)">${r.categoria}</td>
      <td style="color:var(--text-secondary)">${r.setor || '—'}</td>
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

  const editing = !!editAtivoId;
  const existente = editing ? inventario.find(r => r.id === editAtivoId) : null;

  let codigo;
  if (editing) {
    codigo = existente.codigo;
  } else {
    const { data: last } = await sb.from('ativos').select('codigo').order('created_at', { ascending: false }).limit(1);
    const lastNum = last && last.length ? parseInt(last[0].codigo.replace('IT-','')) : 0;
    codigo  = 'IT-' + String(lastNum + 1).padStart(4, '0');
  }

  // ── Upload do anexo (PDF/JPG/JPEG) para o Supabase Storage ──
  let anexo_url  = editing ? existente.anexo_url  : null;
  let anexo_nome = editing ? existente.anexo_nome : null;
  const fileInput = document.getElementById('f-anexo');
  const file = fileInput.files[0];
  if (file) {
    const okTypes = ['application/pdf', 'image/jpeg'];
    const okExt = /\.(pdf|jpe?g)$/i.test(file.name);
    if (!okTypes.includes(file.type) && !okExt) {
      showToast('Anexo deve ser PDF, JPG ou JPEG.', '#d03b3b'); return;
    }
    if (file.size > 10 * 1024 * 1024) { showToast('Anexo acima de 10 MB.', '#d03b3b'); return; }
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${codigo}/${Date.now()}_${safeName}`;
    const { error: upErr } = await sb.storage.from('anexos').upload(path, file, { upsert: false });
    if (upErr) { showToast('Erro no upload: ' + upErr.message, '#d03b3b'); return; }
    anexo_url = sb.storage.from('anexos').getPublicUrl(path).data.publicUrl;
    anexo_nome = file.name;
  }

  const payload = {
    codigo,
    nome,
    categoria:    cat,
    localizacao:  loc,
    setor:        document.getElementById('f-setor').value || null,
    modelo:       document.getElementById('f-modelo').value || null,
    usuario_resp: document.getElementById('f-user').value || null,
    serie:        document.getElementById('f-serie').value || null,
    fabricante:   document.getElementById('f-fab').value || null,
    data_aquisicao: document.getElementById('f-data').value || null,
    valor:        document.getElementById('f-valor').value ? parseFloat(document.getElementById('f-valor').value) : null,
    custo_mensal: document.getElementById('f-custo').value ? parseFloat(document.getElementById('f-custo').value) : null,
    garantia_ate: document.getElementById('f-garantia').value || null,
    observacoes:  document.getElementById('f-obs').value || null,
    status:       document.getElementById('f-status').value,
    anexo_url,
    anexo_nome,
    softwares:    editing ? (existente.softwares || null) : null,
  };

  if (editing) {
    const { error } = await sb.from('ativos').update(payload).eq('id', editAtivoId);
    if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }
    await sb.from('historico').insert({
      ativo_id: editAtivoId, ativo_codigo: codigo, ativo_nome: nome,
      tipo: 'Atualização', descricao: `Ativo atualizado por ${currentProfile.nome}.`,
      responsavel: currentProfile.nome, created_by: currentUser.id,
    });
  } else {
    payload.created_by = currentUser.id;
    const { data, error } = await sb.from('ativos').insert(payload).select().single();
    if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }
    await sb.from('historico').insert({
      ativo_id: data.id, ativo_codigo: codigo, ativo_nome: nome,
      tipo: 'Cadastro', descricao: `Ativo cadastrado por ${currentProfile.nome}.`,
      responsavel: currentProfile.nome, created_by: currentUser.id,
    });
  }

  closeModal('Novo');
  await loadAtivos();
  await loadHistorico();
  renderAlertas();
  showToast(codigo + (editing ? ' atualizado!' : ' cadastrado com sucesso!'));
}

function resetNovoModal() {
  editAtivoId = null;
  document.getElementById('novo-titulo').childNodes[0].nodeValue = 'Cadastrar novo ativo ';
  ['f-nome','f-serie','f-fab','f-user','f-data','f-valor','f-garantia','f-obs','f-modelo','f-setor','f-custo'].forEach(id => document.getElementById(id).value = '');
  ['f-cat','f-loc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-status').value = 'ok';
  document.getElementById('f-anexo').value = '';
}

function editAtivo(id) {
  const a = inventario.find(r => r.id === id);
  if (!a) return;
  editAtivoId = id;
  document.getElementById('novo-titulo').childNodes[0].nodeValue = `Editar ${a.codigo} `;
  document.getElementById('f-nome').value     = a.nome || '';
  document.getElementById('f-cat').value      = a.categoria || '';
  document.getElementById('f-serie').value    = a.serie || '';
  document.getElementById('f-fab').value      = a.fabricante || '';
  document.getElementById('f-modelo').value   = a.modelo || '';
  document.getElementById('f-setor').value    = a.setor || '';
  document.getElementById('f-custo').value    = a.custo_mensal ?? '';
  document.getElementById('f-user').value     = a.usuario_resp || '';
  document.getElementById('f-loc').value      = a.localizacao || '';
  document.getElementById('f-data').value     = a.data_aquisicao || '';
  document.getElementById('f-valor').value    = a.valor ?? '';
  document.getElementById('f-garantia').value = a.garantia_ate || '';
  document.getElementById('f-status').value   = a.status || 'ok';
  document.getElementById('f-obs').value      = a.observacoes || '';
  document.getElementById('f-anexo').value    = '';
  closeModal('Detalhe');
  openModal('Novo');
}

async function deleteAtivo(id, codigo, nome) {
  if (!confirm(`Excluir o ativo ${codigo} — ${nome}?\nEsta ação não pode ser desfeita.`)) return;
  await sb.from('historico').delete().eq('ativo_id', id);
  const { error } = await sb.from('ativos').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  closeModal('Detalhe');
  await loadAtivos();
  await loadHistorico();
  renderAlertas();
  showToast(codigo + ' excluído.');
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
      <div class="info-item"><div class="info-item-label">Setor</div><div class="info-item-val">${a.setor||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Fabricante</div><div class="info-item-val">${a.fabricante||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Modelo</div><div class="info-item-val">${a.modelo||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Usuário</div><div class="info-item-val">${a.usuario_resp||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Localização</div><div class="info-item-val">${a.localizacao}</div></div>
      <div class="info-item"><div class="info-item-label">Nº de série</div><div class="info-item-val">${a.serie||'—'}</div></div>
      <div class="info-item"><div class="info-item-label">Valor</div><div class="info-item-val">${fmt(a.valor)}</div></div>
      <div class="info-item"><div class="info-item-label">Custo mensal</div><div class="info-item-val">${fmt(a.custo_mensal)}</div></div>
      <div class="info-item"><div class="info-item-label">Aquisição</div><div class="info-item-val">${fmtDate(a.data_aquisicao)}</div></div>
      <div class="info-item"><div class="info-item-label">Garantia até</div><div class="info-item-val">${fmtDate(a.garantia_ate)}</div></div>
    </div>
    ${a.softwares && Object.keys(a.softwares).length ? `
      <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px">Softwares / custos mensais</div>
      <div style="margin-bottom:14px">${Object.entries(a.softwares).map(([k,v]) => `
        <div class="license-row" style="padding:7px 0"><span style="font-size:13px">${k}</span><span style="font-weight:500;white-space:nowrap">${fmt(v)}</span></div>`).join('')}
      </div>` : ''}
    ${a.anexo_url ? `<a href="${a.anexo_url}" target="_blank" rel="noopener" class="action-btn" style="margin-bottom:12px;text-decoration:none"><i class="ti ti-paperclip" style="font-size:13px"></i> ${a.anexo_nome || 'Ver anexo'}</a>` : ''}
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
    <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:0.5px solid var(--border);flex-wrap:wrap">
      ${p.canEdit ? `<button class="action-btn btn-primary" onclick="registrarEvento('${a.id}','${a.codigo}','${a.nome.replace(/'/g,'')}')">
        <i class="ti ti-plus" style="font-size:12px"></i> Registrar evento
      </button>` : ''}
      ${p.canEdit ? `<button class="action-btn" onclick="editAtivo('${a.id}')">
        <i class="ti ti-pencil" style="font-size:12px"></i> Editar
      </button>` : ''}
      ${p.canDelete ? `<button class="action-btn" style="color:var(--danger);border-color:var(--danger)" onclick="deleteAtivo('${a.id}','${a.codigo}','${a.nome.replace(/'/g,'')}')">
        <i class="ti ti-trash" style="font-size:12px"></i> Excluir
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
  licencas = data || [];
  const p = PERMS[currentProfile.role];
  const list = document.getElementById('licenseList');
  if (!licencas.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Nenhuma licença cadastrada.</div>';
    return;
  }
  list.innerHTML = licencas.map(l => {
    const pct = l.total ? Math.round(l.usadas / l.total * 100) : 0;
    const cls = pct >= 95 ? 'progress-red' : pct >= 80 ? 'progress-amber' : 'progress-green';
    const renov = l.renovacao ? new Date(l.renovacao + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    return `<div class="license-row">
      <div style="min-width:120px"><div style="font-size:13px;color:var(--text-primary)">${l.nome}</div>
      <div style="font-size:11px;color:var(--text-muted)">Renovação: ${renov}</div></div>
      <div style="flex:1;margin:0 12px"><div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div></div>
      <span style="font-weight:500;color:var(--text-primary);white-space:nowrap">${l.usadas}<span style="color:var(--text-muted)">/${l.total}</span></span>
      ${p.canEdit ? `<div class="row-actions" style="margin-left:10px">
        <button class="icon-btn" title="Editar" onclick="editLicenca('${l.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteLicenca('${l.id}','${l.nome.replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

function editLicenca(id) {
  const l = licencas.find(x => String(x.id) === String(id));
  if (!l) return;
  editLicId = id;
  document.getElementById('lic-titulo').childNodes[0].nodeValue = 'Editar licença ';
  document.getElementById('l-nome').value   = l.nome || '';
  document.getElementById('l-fab').value    = l.fabricante || '';
  document.getElementById('l-renov').value  = l.renovacao || '';
  document.getElementById('l-total').value  = l.total ?? '';
  document.getElementById('l-usadas').value = l.usadas ?? '';
  openModal('Licenca');
}

async function salvarLicenca() {
  const nome   = document.getElementById('l-nome').value.trim();
  const total  = parseInt(document.getElementById('l-total').value);
  const usadas = parseInt(document.getElementById('l-usadas').value);
  if (!nome || isNaN(total) || isNaN(usadas)) { showToast('Preencha nome, total e usadas.', '#d03b3b'); return; }
  if (usadas > total) { showToast('Usadas não pode ser maior que o total.', '#d03b3b'); return; }

  const payload = {
    nome,
    fabricante: document.getElementById('l-fab').value || null,
    renovacao:  document.getElementById('l-renov').value || null,
    total, usadas,
  };

  let error;
  if (editLicId) {
    ({ error } = await sb.from('licencas').update(payload).eq('id', editLicId));
  } else {
    payload.created_by = currentUser.id;
    ({ error } = await sb.from('licencas').insert(payload));
  }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }

  closeModal('Licenca');
  resetLicModal();
  await loadLicencas();
  renderAlertas();
  showToast('Licença salva com sucesso!');
}

async function deleteLicenca(id, nome) {
  if (!confirm(`Excluir a licença "${nome}"?`)) return;
  const { error } = await sb.from('licencas').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadLicencas();
  renderAlertas();
  showToast('Licença excluída.');
}

function resetLicModal() {
  editLicId = null;
  document.getElementById('lic-titulo').childNodes[0].nodeValue = 'Nova licença ';
  ['l-nome','l-fab','l-renov','l-total','l-usadas'].forEach(id => document.getElementById(id).value = '');
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
// ALERTAS (gerados a partir dos dados reais)
// ============================================================
function renderAlertas() {
  const alertas = [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  // Alertas de licenças: renovação próxima e utilização alta
  licencas.forEach(l => {
    if (l.renovacao) {
      const dias = Math.round((new Date(l.renovacao + 'T00:00:00') - hoje) / 86400000);
      if (dias < 0) {
        alertas.push({ tipo:'danger', icon:'ti-license', title:`Licença ${l.nome} vencida há ${Math.abs(dias)} dia(s)`, desc:`Renovação estava prevista para ${new Date(l.renovacao+'T00:00:00').toLocaleDateString('pt-BR')}.` });
      } else if (dias <= 10) {
        alertas.push({ tipo:'danger', icon:'ti-license', title:`Licença ${l.nome} expira em ${dias} dia(s)`, desc:`${l.usadas} de ${l.total} licenças em uso. Renovação até ${new Date(l.renovacao+'T00:00:00').toLocaleDateString('pt-BR')}.` });
      } else if (dias <= 30) {
        alertas.push({ tipo:'warning', icon:'ti-clock', title:`Licença ${l.nome} expira em ${dias} dias`, desc:`Programar renovação. ${l.usadas}/${l.total} em uso.` });
      }
    }
    if (l.total && l.usadas / l.total >= 0.95) {
      alertas.push({ tipo:'warning', icon:'ti-alert-triangle', title:`Licença ${l.nome} quase esgotada`, desc:`${l.usadas} de ${l.total} licenças utilizadas (${Math.round(l.usadas/l.total*100)}%).` });
    }
  });

  // Alertas de ativos com problema
  const inativos = inventario.filter(a => a.status === 'err').length;
  const atencao  = inventario.filter(a => a.status === 'warn').length;
  if (inativos) alertas.push({ tipo:'danger',  icon:'ti-device-desktop-off', title:`${inativos} ativo(s) inativo(s)`, desc:'Verificar equipamentos marcados como inativos no inventário.' });
  if (atencao)  alertas.push({ tipo:'warning', icon:'ti-alert-circle',        title:`${atencao} ativo(s) requer(em) atenção`, desc:'Há equipamentos com status de atenção no inventário.' });

  // Impressoras com contrato vencendo
  impressoras.forEach(p => {
    if (p.contrato_vence) {
      const dias = Math.round((new Date(p.contrato_vence + 'T00:00:00') - hoje) / 86400000);
      if (dias >= 0 && dias <= 30) alertas.push({ tipo:'warning', icon:'ti-printer', title:`Contrato da impressora ${p.modelo} vence em ${dias} dias`, desc:`Locadora: ${p.locadora || '—'}.` });
    }
  });

  // Manutenções agendadas próximas / atrasadas
  manutencoes.forEach(m => {
    if (m.status === 'agendada' && m.data_programada) {
      const dias = Math.round((new Date(m.data_programada + 'T00:00:00') - hoje) / 86400000);
      if (dias < 0) alertas.push({ tipo:'danger', icon:'ti-tools', title:`Manutenção atrasada: ${m.titulo}`, desc:`Estava programada para ${fmtData(m.data_programada)}.` });
      else if (dias <= 7) alertas.push({ tipo:'warning', icon:'ti-tools', title:`Manutenção em ${dias} dia(s): ${m.titulo}`, desc:`${ativoLabel(m.ativo_id)} · responsável ${m.responsavel || '—'}.` });
    }
  });

  // Contratos de fornecedores vencendo
  fornecedores.forEach(f => {
    if (f.contrato_fim) {
      const dias = Math.round((new Date(f.contrato_fim + 'T00:00:00') - hoje) / 86400000);
      if (dias >= 0 && dias <= 30) alertas.push({ tipo:'warning', icon:'ti-file-text', title:`Contrato com ${f.nome} vence em ${dias} dias`, desc:`${f.tipo || 'Fornecedor'} · vencimento ${fmtData(f.contrato_fim)}.` });
      else if (dias < 0) alertas.push({ tipo:'danger', icon:'ti-file-text', title:`Contrato com ${f.nome} vencido`, desc:`Venceu em ${fmtData(f.contrato_fim)}.` });
    }
  });

  // Chamados abertos de alta prioridade
  const altaAbertos = chamados.filter(c => c.prioridade === 'alta' && (c.status === 'aberto' || c.status === 'andamento')).length;
  if (altaAbertos) alertas.push({ tipo:'danger', icon:'ti-headset', title:`${altaAbertos} chamado(s) de alta prioridade em aberto`, desc:'Verificar a fila de chamados.' });

  // Badge do menu
  const badge = document.querySelector('#nav-alert .badge');
  if (badge) { badge.textContent = alertas.length || ''; badge.style.display = alertas.length ? 'inline-flex' : 'none'; }
  document.getElementById('kpi-alertas').textContent = alertas.length;

  document.getElementById('alertList').innerHTML = alertas.length
    ? alertas.map(a => `
      <div class="alert-row">
        <div class="alert-icon ${a.tipo}"><i class="ti ${a.icon}" style="font-size:16px"></i></div>
        <div><div style="font-size:13px;font-weight:500;color:var(--text-primary)">${a.title}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${a.desc}</div></div>
      </div>`).join('')
    : '<div style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum alerta no momento. ✅</div>';
}

// ============================================================
// IMPRESSORAS LOCADAS
// ============================================================
async function loadImpressoras() {
  const { data, error } = await sb.from('impressoras').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  impressoras = data || [];
  applyPrintFilter();
}

const printStatusLabel = {
  ok:   '<span class="badge badge-success"><span class="dot dot-ok"></span>Ativa</span>',
  warn: '<span class="badge badge-warning"><span class="dot dot-warn"></span>Manutenção</span>',
  err:  '<span class="badge badge-danger"><span class="dot dot-err"></span>Inativa</span>',
};

function applyPrintFilter() {
  const q  = (document.getElementById('printSearch').value || '').toLowerCase();
  const st = document.getElementById('printStatus').value;
  const filtered = impressoras.filter(p =>
    (!q || (p.modelo||'').toLowerCase().includes(q) || (p.numero_serie||'').toLowerCase().includes(q) ||
            (p.locadora||'').toLowerCase().includes(q) || (p.localizacao||'').toLowerCase().includes(q)) &&
    (!st || p.status === st)
  );
  renderImpressoras(filtered);
}

function renderImpressoras(data) {
  const body = document.getElementById('printBody');
  const p = PERMS[currentProfile.role];
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma impressora cadastrada.</td></tr>`;
    return;
  }
  const fmt = v => v != null ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—';
  body.innerHTML = data.map(i => `
    <tr>
      <td style="font-weight:500">${i.modelo}${i.fabricante ? `<div style="font-size:11px;color:var(--text-muted);font-weight:400">${i.fabricante}</div>` : ''}</td>
      <td style="color:var(--text-muted);font-size:12px">${i.numero_serie || '—'}</td>
      <td>${i.locadora || '—'}</td>
      <td style="color:var(--text-secondary)">${i.localizacao || '—'}</td>
      <td>${fmt(i.custo_mensal)}</td>
      <td>${i.contador_atual != null ? i.contador_atual.toLocaleString('pt-BR') : '—'}</td>
      <td>${printStatusLabel[i.status] || '—'}</td>
      <td><div class="row-actions">
        ${p.canEdit ? `<button class="icon-btn" title="Editar" onclick="editImpressora('${i.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>` : ''}
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteImpressora('${i.id}','${(i.modelo||'').replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div></td>
    </tr>`).join('');
}

function editImpressora(id) {
  const i = impressoras.find(x => String(x.id) === String(id));
  if (!i) return;
  editPrintId = id;
  document.getElementById('print-titulo').childNodes[0].nodeValue = 'Editar impressora ';
  document.getElementById('p-modelo').value   = i.modelo || '';
  document.getElementById('p-fab').value       = i.fabricante || '';
  document.getElementById('p-serie').value     = i.numero_serie || '';
  document.getElementById('p-locadora').value  = i.locadora || '';
  document.getElementById('p-loc').value       = i.localizacao || '';
  document.getElementById('p-custo').value     = i.custo_mensal ?? '';
  document.getElementById('p-franquia').value  = i.franquia ?? '';
  document.getElementById('p-contador').value  = i.contador_atual ?? '';
  document.getElementById('p-contrato').value  = i.contrato_vence || '';
  document.getElementById('p-status').value    = i.status || 'ok';
  document.getElementById('p-obs').value       = i.observacoes || '';
  openModal('Impressora');
}

async function salvarImpressora() {
  const modelo = document.getElementById('p-modelo').value.trim();
  const loc    = document.getElementById('p-loc').value.trim();
  if (!modelo || !loc) { showToast('Preencha modelo e localização.', '#d03b3b'); return; }

  const payload = {
    modelo,
    fabricante:    document.getElementById('p-fab').value || null,
    numero_serie:  document.getElementById('p-serie').value || null,
    locadora:      document.getElementById('p-locadora').value || null,
    localizacao:   loc,
    custo_mensal:  document.getElementById('p-custo').value ? parseFloat(document.getElementById('p-custo').value) : null,
    franquia:      document.getElementById('p-franquia').value ? parseInt(document.getElementById('p-franquia').value) : null,
    contador_atual:document.getElementById('p-contador').value ? parseInt(document.getElementById('p-contador').value) : null,
    contrato_vence:document.getElementById('p-contrato').value || null,
    status:        document.getElementById('p-status').value,
    observacoes:   document.getElementById('p-obs').value || null,
  };

  let error;
  if (editPrintId) {
    ({ error } = await sb.from('impressoras').update(payload).eq('id', editPrintId));
  } else {
    payload.created_by = currentUser.id;
    ({ error } = await sb.from('impressoras').insert(payload));
  }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }

  closeModal('Impressora');
  resetPrintModal();
  await loadImpressoras();
  renderAlertas();
  showToast('Impressora salva com sucesso!');
}

async function deleteImpressora(id, modelo) {
  if (!confirm(`Excluir a impressora "${modelo}"?`)) return;
  const { error } = await sb.from('impressoras').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadImpressoras();
  showToast('Impressora excluída.');
}

function resetPrintModal() {
  editPrintId = null;
  document.getElementById('print-titulo').childNodes[0].nodeValue = 'Nova impressora locada ';
  ['p-modelo','p-fab','p-serie','p-locadora','p-loc','p-custo','p-franquia','p-contador','p-contrato','p-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-status').value = 'ok';
}

// ============================================================
// SENHAS / CREDENCIAIS  (acesso restrito por RLS — só admin)
// ============================================================
async function loadCredenciais() {
  const { data, error } = await sb.from('credenciais').select('*').order('servico');
  if (error) { console.error(error); return; }
  credenciais = data || [];
  applyCredFilter();
}

function applyCredFilter() {
  const q = (document.getElementById('credSearch').value || '').toLowerCase();
  const filtered = credenciais.filter(c =>
    !q || (c.servico||'').toLowerCase().includes(q) || (c.url||'').toLowerCase().includes(q) || (c.login||'').toLowerCase().includes(q)
  );
  renderCredenciais(filtered);
}

function renderCredenciais(data) {
  const body = document.getElementById('credBody');
  const p = PERMS[currentProfile.role];
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma credencial cadastrada.</td></tr>`;
    return;
  }
  body.innerHTML = data.map(c => `
    <tr>
      <td style="font-weight:500">${c.servico}</td>
      <td>${c.url ? `<a href="${/^https?:/.test(c.url) ? c.url : 'https://' + c.url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">${c.url}</a>` : '—'}</td>
      <td>
        <span class="pwd-cell">${c.login || '—'}
          ${c.login ? `<button class="icon-btn" title="Copiar login" onclick="copyText('${(c.login||'').replace(/'/g,"\\'")}')"><i class="ti ti-copy" style="font-size:14px"></i></button>` : ''}
        </span>
      </td>
      <td>
        <span class="pwd-cell">
          <span class="pwd-mask" id="pwd-${c.id}" data-real="${encodeURIComponent(c.senha||'')}" data-shown="0">••••••••</span>
          <button class="icon-btn" title="Mostrar/ocultar" onclick="toggleSenha('${c.id}')"><i class="ti ti-eye" style="font-size:14px"></i></button>
          <button class="icon-btn" title="Copiar senha" onclick="copyText(decodeURIComponent('${encodeURIComponent(c.senha||'')}'))"><i class="ti ti-copy" style="font-size:14px"></i></button>
        </span>
      </td>
      <td><div class="row-actions">
        ${p.canEdit ? `<button class="icon-btn" title="Editar" onclick="editCredencial('${c.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>` : ''}
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteCredencial('${c.id}','${(c.servico||'').replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div></td>
    </tr>`).join('');
}

function toggleSenha(id) {
  const el = document.getElementById('pwd-' + id);
  if (el.dataset.shown === '1') { el.textContent = '••••••••'; el.dataset.shown = '0'; }
  else { el.textContent = decodeURIComponent(el.dataset.real); el.dataset.shown = '1'; }
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(() => showToast('Copiado!')).catch(() => showToast('Não foi possível copiar.', '#d03b3b'));
}

function editCredencial(id) {
  const c = credenciais.find(x => String(x.id) === String(id));
  if (!c) return;
  editCredId = id;
  document.getElementById('cred-titulo').childNodes[0].nodeValue = 'Editar credencial ';
  document.getElementById('c-servico').value = c.servico || '';
  document.getElementById('c-url').value     = c.url || '';
  document.getElementById('c-login').value   = c.login || '';
  document.getElementById('c-senha').value   = c.senha || '';
  document.getElementById('c-obs').value     = c.observacoes || '';
  openModal('Credencial');
}

async function salvarCredencial() {
  const servico = document.getElementById('c-servico').value.trim();
  const login   = document.getElementById('c-login').value.trim();
  const senha   = document.getElementById('c-senha').value;
  if (!servico || !login || !senha) { showToast('Preencha serviço, login e senha.', '#d03b3b'); return; }

  const payload = {
    servico,
    url:    document.getElementById('c-url').value || null,
    login, senha,
    observacoes: document.getElementById('c-obs').value || null,
  };

  let error;
  if (editCredId) {
    ({ error } = await sb.from('credenciais').update(payload).eq('id', editCredId));
  } else {
    payload.created_by = currentUser.id;
    ({ error } = await sb.from('credenciais').insert(payload));
  }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }

  closeModal('Credencial');
  resetCredModal();
  await loadCredenciais();
  showToast('Credencial salva com sucesso!');
}

async function deleteCredencial(id, servico) {
  if (!confirm(`Excluir a credencial de "${servico}"?`)) return;
  const { error } = await sb.from('credenciais').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadCredenciais();
  showToast('Credencial excluída.');
}

function resetCredModal() {
  editCredId = null;
  document.getElementById('cred-titulo').childNodes[0].nodeValue = 'Nova credencial ';
  ['c-servico','c-url','c-login','c-senha','c-obs'].forEach(id => document.getElementById(id).value = '');
}

// ============================================================
// HELPERS COMPARTILHADOS
// ============================================================
function ativoLabel(id) {
  if (!id) return '—';
  const a = inventario.find(x => String(x.id) === String(id));
  return a ? `${a.codigo} — ${a.nome}` : '(ativo removido)';
}
function fmtMoeda(v) { return v != null ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'; }
function fmtData(d)  { return d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }

// ============================================================
// CHAMADOS / HELP DESK
// ============================================================
const chamStatusBadge = {
  aberto:    '<span class="badge badge-danger"><span class="dot dot-err"></span>Aberto</span>',
  andamento: '<span class="badge badge-warning"><span class="dot dot-warn"></span>Em andamento</span>',
  resolvido: '<span class="badge badge-success"><span class="dot dot-ok"></span>Resolvido</span>',
  fechado:   '<span class="badge" style="background:var(--surface-1);color:var(--text-muted)">Fechado</span>',
};
const prioBadge = {
  alta:  '<span class="badge badge-danger">Alta</span>',
  media: '<span class="badge badge-warning">Média</span>',
  baixa: '<span class="badge badge-success">Baixa</span>',
};

async function loadChamados() {
  const { data, error } = await sb.from('chamados').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  chamados = data || [];
  applyChamFilter();
}

function applyChamFilter() {
  const q  = (document.getElementById('chamSearch').value || '').toLowerCase();
  const st = document.getElementById('chamStatus').value;
  const pr = document.getElementById('chamPrioridade').value;
  renderChamados(chamados.filter(c =>
    (!q || (c.titulo||'').toLowerCase().includes(q) || (c.solicitante||'').toLowerCase().includes(q) || ativoLabel(c.ativo_id).toLowerCase().includes(q)) &&
    (!st || c.status === st) && (!pr || c.prioridade === pr)
  ));
}

function renderChamados(data) {
  const body = document.getElementById('chamBody');
  const p = PERMS[currentProfile.role];
  if (!data.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum chamado.</td></tr>`; return; }
  body.innerHTML = data.map(c => `
    <tr>
      <td style="color:var(--text-muted);font-size:12px">#${c.numero ?? '—'}</td>
      <td style="font-weight:500">${c.titulo}</td>
      <td style="color:var(--text-secondary);font-size:12px">${ativoLabel(c.ativo_id)}</td>
      <td>${c.solicitante || '—'}</td>
      <td>${c.responsavel || '—'}</td>
      <td>${prioBadge[c.prioridade] || '—'}</td>
      <td>${chamStatusBadge[c.status] || '—'}</td>
      <td><div class="row-actions">
        ${p.canEdit ? `<button class="icon-btn" title="Editar" onclick="editChamado('${c.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>` : ''}
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteChamado('${c.id}','${(c.titulo||'').replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div></td>
    </tr>`).join('');
}

function editChamado(id) {
  const c = chamados.find(x => String(x.id) === String(id));
  if (!c) return;
  editChamId = id;
  document.getElementById('cham-titulo').childNodes[0].nodeValue = `Editar chamado #${c.numero ?? ''} `;
  document.getElementById('ch-titulo').value      = c.titulo || '';
  document.getElementById('ch-ativo').value       = c.ativo_id || '';
  document.getElementById('ch-solicitante').value = c.solicitante || '';
  document.getElementById('ch-responsavel').value = c.responsavel || '';
  document.getElementById('ch-prioridade').value  = c.prioridade || 'media';
  document.getElementById('ch-status').value      = c.status || 'aberto';
  document.getElementById('ch-desc').value         = c.descricao || '';
  openModal('Chamado');
}

async function salvarChamado() {
  const titulo = document.getElementById('ch-titulo').value.trim();
  const solicitante = document.getElementById('ch-solicitante').value.trim();
  if (!titulo || !solicitante) { showToast('Preencha título e solicitante.', '#d03b3b'); return; }
  const status = document.getElementById('ch-status').value;
  const payload = {
    titulo,
    ativo_id:    document.getElementById('ch-ativo').value || null,
    solicitante,
    responsavel: document.getElementById('ch-responsavel').value || null,
    prioridade:  document.getElementById('ch-prioridade').value,
    status,
    descricao:   document.getElementById('ch-desc').value || null,
    resolved_at: (status === 'resolvido' || status === 'fechado') ? new Date().toISOString() : null,
  };
  let error;
  if (editChamId) ({ error } = await sb.from('chamados').update(payload).eq('id', editChamId));
  else { payload.created_by = currentUser.id; ({ error } = await sb.from('chamados').insert(payload)); }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }
  closeModal('Chamado'); resetChamModal();
  await loadChamados(); renderAlertas();
  showToast('Chamado salvo com sucesso!');
}

async function deleteChamado(id, titulo) {
  if (!confirm(`Excluir o chamado "${titulo}"?`)) return;
  const { error } = await sb.from('chamados').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadChamados(); renderAlertas(); showToast('Chamado excluído.');
}

function resetChamModal() {
  editChamId = null;
  document.getElementById('cham-titulo').childNodes[0].nodeValue = 'Novo chamado ';
  ['ch-titulo','ch-ativo','ch-solicitante','ch-responsavel','ch-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ch-prioridade').value = 'media';
  document.getElementById('ch-status').value = 'aberto';
}

// ============================================================
// MANUTENÇÕES PROGRAMADAS
// ============================================================
const manutStatusBadge = {
  agendada:  '<span class="badge badge-warning"><span class="dot dot-warn"></span>Agendada</span>',
  concluida: '<span class="badge badge-success"><span class="dot dot-ok"></span>Concluída</span>',
  cancelada: '<span class="badge" style="background:var(--surface-1);color:var(--text-muted)">Cancelada</span>',
};

async function loadManutencoes() {
  const { data, error } = await sb.from('manutencoes').select('*').order('data_programada');
  if (error) { console.error(error); return; }
  manutencoes = data || [];
  applyManutFilter();
}

function applyManutFilter() {
  const q  = (document.getElementById('manutSearch').value || '').toLowerCase();
  const st = document.getElementById('manutStatus').value;
  renderManutencoes(manutencoes.filter(m =>
    (!q || (m.titulo||'').toLowerCase().includes(q) || (m.responsavel||'').toLowerCase().includes(q) || ativoLabel(m.ativo_id).toLowerCase().includes(q)) &&
    (!st || m.status === st)
  ));
}

function renderManutencoes(data) {
  const body = document.getElementById('manutBody');
  const p = PERMS[currentProfile.role];
  if (!data.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma manutenção programada.</td></tr>`; return; }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  body.innerHTML = data.map(m => {
    const venceProx = m.status === 'agendada' && m.data_programada && (new Date(m.data_programada+'T00:00:00') - hoje) <= 7*86400000;
    return `<tr>
      <td style="font-weight:500">${m.titulo}</td>
      <td style="color:var(--text-secondary);font-size:12px">${ativoLabel(m.ativo_id)}</td>
      <td>${m.tipo || '—'}</td>
      <td style="${venceProx ? 'color:var(--danger);font-weight:500' : ''}">${fmtData(m.data_programada)}</td>
      <td>${m.responsavel || '—'}</td>
      <td>${fmtMoeda(m.custo)}</td>
      <td>${manutStatusBadge[m.status] || '—'}</td>
      <td><div class="row-actions">
        ${p.canEdit ? `<button class="icon-btn" title="Editar" onclick="editManutencao('${m.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>` : ''}
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteManutencao('${m.id}','${(m.titulo||'').replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function editManutencao(id) {
  const m = manutencoes.find(x => String(x.id) === String(id));
  if (!m) return;
  editManutId = id;
  document.getElementById('manut-titulo').childNodes[0].nodeValue = 'Editar manutenção ';
  document.getElementById('mt-titulo').value      = m.titulo || '';
  document.getElementById('mt-ativo').value       = m.ativo_id || '';
  document.getElementById('mt-tipo').value        = m.tipo || 'Preventiva';
  document.getElementById('mt-data').value        = m.data_programada || '';
  document.getElementById('mt-responsavel').value = m.responsavel || '';
  document.getElementById('mt-custo').value       = m.custo ?? '';
  document.getElementById('mt-status').value      = m.status || 'agendada';
  document.getElementById('mt-obs').value         = m.observacoes || '';
  openModal('Manutencao');
}

async function salvarManutencao() {
  const titulo = document.getElementById('mt-titulo').value.trim();
  const data_programada = document.getElementById('mt-data').value;
  if (!titulo || !data_programada) { showToast('Preencha título e data programada.', '#d03b3b'); return; }
  const payload = {
    titulo,
    ativo_id:    document.getElementById('mt-ativo').value || null,
    tipo:        document.getElementById('mt-tipo').value,
    data_programada,
    responsavel: document.getElementById('mt-responsavel').value || null,
    custo:       document.getElementById('mt-custo').value ? parseFloat(document.getElementById('mt-custo').value) : null,
    status:      document.getElementById('mt-status').value,
    observacoes: document.getElementById('mt-obs').value || null,
  };
  let error;
  if (editManutId) ({ error } = await sb.from('manutencoes').update(payload).eq('id', editManutId));
  else { payload.created_by = currentUser.id; ({ error } = await sb.from('manutencoes').insert(payload)); }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }
  closeModal('Manutencao'); resetManutModal();
  await loadManutencoes(); renderAlertas();
  showToast('Manutenção salva com sucesso!');
}

async function deleteManutencao(id, titulo) {
  if (!confirm(`Excluir a manutenção "${titulo}"?`)) return;
  const { error } = await sb.from('manutencoes').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadManutencoes(); renderAlertas(); showToast('Manutenção excluída.');
}

function resetManutModal() {
  editManutId = null;
  document.getElementById('manut-titulo').childNodes[0].nodeValue = 'Nova manutenção ';
  ['mt-titulo','mt-ativo','mt-data','mt-responsavel','mt-custo','mt-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mt-tipo').value = 'Preventiva';
  document.getElementById('mt-status').value = 'agendada';
}

// ============================================================
// FORNECEDORES / CONTRATOS
// ============================================================
async function loadFornecedores() {
  const { data, error } = await sb.from('fornecedores').select('*').order('nome');
  if (error) { console.error(error); return; }
  fornecedores = data || [];
  applyFornFilter();
}

function applyFornFilter() {
  const q  = (document.getElementById('fornSearch').value || '').toLowerCase();
  const tp = document.getElementById('fornTipo').value;
  renderFornecedores(fornecedores.filter(f =>
    (!q || (f.nome||'').toLowerCase().includes(q) || (f.contato||'').toLowerCase().includes(q) || (f.cnpj||'').toLowerCase().includes(q)) &&
    (!tp || f.tipo === tp)
  ));
}

function renderFornecedores(data) {
  const body = document.getElementById('fornBody');
  const p = PERMS[currentProfile.role];
  if (!data.length) { body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum fornecedor cadastrado.</td></tr>`; return; }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  body.innerHTML = data.map(f => {
    const venceProx = f.contrato_fim && (new Date(f.contrato_fim+'T00:00:00') - hoje) <= 30*86400000;
    return `<tr>
      <td style="font-weight:500">${f.nome}${f.cnpj ? `<div style="font-size:11px;color:var(--text-muted);font-weight:400">${f.cnpj}</div>` : ''}</td>
      <td>${f.tipo || '—'}</td>
      <td style="font-size:12px">${f.contato || '—'}${f.telefone ? `<div style="color:var(--text-muted)">${f.telefone}</div>` : ''}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${fmtData(f.contrato_inicio)} a ${fmtData(f.contrato_fim)}</td>
      <td>${fmtMoeda(f.valor_mensal)}</td>
      <td style="${venceProx ? 'color:var(--danger);font-weight:500' : ''}">${fmtData(f.contrato_fim)}</td>
      <td><div class="row-actions">
        ${p.canEdit ? `<button class="icon-btn" title="Editar" onclick="editFornecedor('${f.id}')"><i class="ti ti-pencil" style="font-size:15px"></i></button>` : ''}
        ${p.canDelete ? `<button class="icon-btn danger" title="Excluir" onclick="deleteFornecedor('${f.id}','${(f.nome||'').replace(/'/g,'')}')"><i class="ti ti-trash" style="font-size:15px"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function editFornecedor(id) {
  const f = fornecedores.find(x => String(x.id) === String(id));
  if (!f) return;
  editFornId = id;
  document.getElementById('forn-titulo').childNodes[0].nodeValue = 'Editar fornecedor ';
  document.getElementById('fn-nome').value    = f.nome || '';
  document.getElementById('fn-tipo').value    = f.tipo || 'Fornecedor';
  document.getElementById('fn-cnpj').value    = f.cnpj || '';
  document.getElementById('fn-contato').value = f.contato || '';
  document.getElementById('fn-tel').value     = f.telefone || '';
  document.getElementById('fn-email').value   = f.email || '';
  document.getElementById('fn-inicio').value  = f.contrato_inicio || '';
  document.getElementById('fn-fim').value     = f.contrato_fim || '';
  document.getElementById('fn-valor').value   = f.valor_mensal ?? '';
  document.getElementById('fn-obs').value     = f.observacoes || '';
  openModal('Fornecedor');
}

async function salvarFornecedor() {
  const nome = document.getElementById('fn-nome').value.trim();
  if (!nome) { showToast('Preencha o nome.', '#d03b3b'); return; }
  const payload = {
    nome,
    tipo:            document.getElementById('fn-tipo').value,
    cnpj:            document.getElementById('fn-cnpj').value || null,
    contato:         document.getElementById('fn-contato').value || null,
    telefone:        document.getElementById('fn-tel').value || null,
    email:           document.getElementById('fn-email').value || null,
    contrato_inicio: document.getElementById('fn-inicio').value || null,
    contrato_fim:    document.getElementById('fn-fim').value || null,
    valor_mensal:    document.getElementById('fn-valor').value ? parseFloat(document.getElementById('fn-valor').value) : null,
    observacoes:     document.getElementById('fn-obs').value || null,
  };
  let error;
  if (editFornId) ({ error } = await sb.from('fornecedores').update(payload).eq('id', editFornId));
  else { payload.created_by = currentUser.id; ({ error } = await sb.from('fornecedores').insert(payload)); }
  if (error) { showToast('Erro ao salvar: ' + error.message, '#d03b3b'); return; }
  closeModal('Fornecedor'); resetFornModal();
  await loadFornecedores(); renderAlertas();
  showToast('Fornecedor salvo com sucesso!');
}

async function deleteFornecedor(id, nome) {
  if (!confirm(`Excluir o fornecedor "${nome}"?`)) return;
  const { error } = await sb.from('fornecedores').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message, '#d03b3b'); return; }
  await loadFornecedores(); renderAlertas(); showToast('Fornecedor excluído.');
}

function resetFornModal() {
  editFornId = null;
  document.getElementById('forn-titulo').childNodes[0].nodeValue = 'Novo fornecedor ';
  ['fn-nome','fn-cnpj','fn-contato','fn-tel','fn-email','fn-inicio','fn-fim','fn-valor','fn-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fn-tipo').value = 'Fornecedor';
}

// ============================================================
// LOG DE AUDITORIA  (preenchido por gatilhos no banco)
// ============================================================
const opLabel = {
  INSERT: '<span class="badge badge-success">Criou</span>',
  UPDATE: '<span class="badge badge-warning">Editou</span>',
  DELETE: '<span class="badge badge-danger">Excluiu</span>',
};
const entLabel = { ativos:'Ativo', licencas:'Licença', impressoras:'Impressora', chamados:'Chamado', manutencoes:'Manutenção', fornecedores:'Fornecedor', credenciais:'Credencial' };

async function loadAuditoria() {
  const { data, error } = await sb.from('auditoria').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { console.error(error); return; }
  auditoria = data || [];
  applyAuditFilter();
}

function applyAuditFilter() {
  const q  = (document.getElementById('auditSearch').value || '').toLowerCase();
  const en = document.getElementById('auditEntidade').value;
  renderAuditoria(auditoria.filter(a =>
    (!q || (a.descricao||'').toLowerCase().includes(q) || (a.usuario_nome||'').toLowerCase().includes(q)) &&
    (!en || a.entidade === en)
  ));
}

function renderAuditoria(data) {
  const body = document.getElementById('auditBody');
  if (!data.length) { body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum registro de auditoria.</td></tr>`; return; }
  body.innerHTML = data.map(a => `
    <tr>
      <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap">${new Date(a.created_at).toLocaleString('pt-BR')}</td>
      <td>${a.usuario_nome || '—'}</td>
      <td>${opLabel[a.operacao] || a.operacao}</td>
      <td>${entLabel[a.entidade] || a.entidade}</td>
      <td style="color:var(--text-secondary)">${a.descricao || '—'}</td>
    </tr>`).join('');
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

// Importa ativos de uma planilha Excel (.xlsx/.xls) ou CSV.
// Reconhece o layout do controle patrimonial (Código, Categoria, Marca, Modelo,
// Nº Série, Data Aquisição, Valor Aquisição, Setor, Localização, Responsável,
// Status, OBS, colunas de custo de software e Custo Mensal).
async function importPlanilha(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  // normaliza cabeçalho: minúsculo, sem acento, espaços colapsados
  const norm = s => (s == null ? '' : String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const toNum = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[r$\s]/gi, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');  // formato BR
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  const toDate = v => {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
    const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  const statusCode = s => { s = norm(s); if (s.startsWith('baix') || s.startsWith('inat') || s === 'err') return 'err'; if (s.includes('sem uso') || s.startsWith('atenc') || s === 'warn') return 'warn'; return 'ok'; };

  const parseCsvLine = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i];
      if (ch === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ';' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out;
  };

  try {
    // 1) Lê o arquivo para uma matriz de linhas (array de arrays)
    let matrix = [];
    if (ext === 'xlsx' || ext === 'xls') {
      if (typeof XLSX === 'undefined') { showToast('Biblioteca de Excel não carregou. Verifique a internet ou exporte como CSV.', '#d03b3b'); return; }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    } else {
      const text = (await file.text()).replace(/^\ufeff/, '');
      matrix = text.split(/\r?\n/).filter(l => l.trim()).map(parseCsvLine);
    }
    if (matrix.length < 2) { showToast('Planilha vazia ou sem dados.', '#d03b3b'); return; }

    // 2) Acha a linha de cabeçalho (primeira que tenha "categoria" ou "codigo")
    let hIdx = matrix.findIndex(r => r.some(c => ['categoria', 'codigo'].includes(norm(c))));
    if (hIdx < 0) hIdx = 0;
    const header = matrix[hIdx].map(norm);

    // 3) Mapeia colunas conhecidas
    const find = pred => header.findIndex(pred);
    const col = {
      codigo:  find(h => h === 'codigo'),
      cat:     find(h => h === 'categoria'),
      marca:   find(h => h === 'marca' || h === 'fabricante'),
      modelo:  find(h => h === 'modelo'),
      serie:   find(h => h.includes('serie')),
      data:    find(h => h.includes('data') && h.includes('aquis')),
      valor:   find(h => h.includes('valor')),
      setor:   find(h => h === 'setor'),
      loc:     find(h => h.includes('local')),
      resp:    find(h => h.includes('respons')),
      status:  find(h => h === 'status'),
      obs:     find(h => h === 'obs' || h.includes('observ')),
      custo:   find(h => h.includes('custo') && h.includes('mensal')),
    };
    if (col.cat < 0 && col.codigo < 0) { showToast('Não reconheci o cabeçalho da planilha (faltam Código/Categoria).', '#d03b3b'); return; }

    // Colunas de software = as que sobraram (têm cabeçalho e não são campos conhecidos nem o custo total)
    const usadas = new Set(Object.values(col).filter(i => i >= 0));
    const swCols = [];
    matrix[hIdx].forEach((raw, i) => { if (!usadas.has(i) && raw != null && String(raw).trim() && i !== col.custo) swCols.push({ i, nome: String(raw).trim() }); });

    // 4) Monta os registros
    let maxNum = inventario.reduce((m, r) => Math.max(m, parseInt((r.codigo || '').replace(/\D/g, '')) || 0), 0);
    const usados = new Set(inventario.map(r => r.codigo));
    const novos = [];
    for (let r = hIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
      const get = i => (i >= 0 && row[i] != null) ? String(row[i]).trim() : '';

      const marca = get(col.marca), modelo = get(col.modelo), categoria = get(col.cat) || 'Outro';
      const nome = (marca + ' ' + modelo).trim() || categoria;

      let codigo = get(col.codigo);
      if (!codigo || usados.has(codigo)) codigo = 'PAT-' + String(++maxNum).padStart(4, '0');
      usados.add(codigo);

      const softwares = {};
      swCols.forEach(({ i, nome }) => { const n = toNum(row[i]); if (n != null && n !== 0) softwares[nome] = n; });

      novos.push({
        codigo, nome, categoria,
        localizacao:  get(col.loc) || 'Não informada',
        setor:        get(col.setor) || null,
        modelo:       modelo || null,
        fabricante:   marca || null,
        serie:        get(col.serie) || null,
        usuario_resp: get(col.resp) || null,
        data_aquisicao: toDate(col.data >= 0 ? row[col.data] : null),
        valor:        toNum(col.valor >= 0 ? row[col.valor] : null),
        custo_mensal: toNum(col.custo >= 0 ? row[col.custo] : null),
        observacoes:  get(col.obs) || null,
        status:       col.status >= 0 ? statusCode(row[col.status]) : 'ok',
        softwares:    Object.keys(softwares).length ? softwares : null,
        created_by:   currentUser.id,
      });
    }
    if (!novos.length) { showToast('Nenhuma linha de dados encontrada.', '#d03b3b'); return; }

    // 5) Insere em lotes de 100
    showToast(`Importando ${novos.length} itens...`, '#2a78d6');
    let ok = 0;
    for (let i = 0; i < novos.length; i += 100) {
      const { data, error } = await sb.from('ativos').insert(novos.slice(i, i + 100)).select('id');
      if (error) { showToast(`Erro após ${ok} itens: ${error.message}`, '#d03b3b'); break; }
      ok += data.length;
    }

    await loadAtivos(); renderAlertas();
    showToast(`${ok} de ${novos.length} ativo(s) importado(s)!`);
  } catch (err) {
    showToast('Falha ao ler a planilha: ' + err.message, '#d03b3b');
  } finally {
    event.target.value = '';
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function openModal(name)  { document.getElementById('modal' + name).classList.add('open'); }
function closeModal(name) {
  document.getElementById('modal' + name).classList.remove('open');
  if (name === 'Novo')       resetNovoModal();
  if (name === 'Licenca')    resetLicModal();
  if (name === 'Impressora') resetPrintModal();
  if (name === 'Credencial') resetCredModal();
  if (name === 'Chamado')    resetChamModal();
  if (name === 'Manutencao') resetManutModal();
  if (name === 'Fornecedor') resetFornModal();
}
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
let catChart = null;
const CAT_PALETTE = ['#2a78d6','#1baf7a','#eda100','#4a3aa7','#898781','#d03b3b','#0ea5b7','#b45309'];

function initCharts() {
  if (chartsInit) return; chartsInit = true;
  catChart = new Chart(document.getElementById('chartCat'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: CAT_PALETTE, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '60%' }
  });
  new Chart(document.getElementById('chartStatus'), {
    type: 'line',
    data: { labels: ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],
      datasets: [{ data: [97,98,96,99,98,97,98], borderColor: '#1baf7a', backgroundColor: 'rgba(27,175,122,0.08)', borderWidth: 2, fill: true, tension: .4, pointBackgroundColor: '#1baf7a', pointRadius: 4, pointBorderColor: '#fff', pointBorderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { min: 90, max: 100, ticks: { callback: v => v + '%', color: '#898781', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.05)' } }, x: { ticks: { color: '#898781', font: { size: 11 } }, grid: { display: false } } } }
  });
  updateDashboard();
}

// Recalcula os blocos do dashboard a partir do inventário real.
function updateDashboard() {
  // ── Inventário por categoria ──
  const porCat = {};
  inventario.forEach(a => { const c = a.categoria || 'Sem categoria'; porCat[c] = (porCat[c] || 0) + 1; });
  const cats = Object.entries(porCat).sort((a,b) => b[1] - a[1]);
  if (catChart) {
    catChart.data.labels = cats.map(c => c[0]);
    catChart.data.datasets[0].data = cats.map(c => c[1]);
    catChart.update();
  }
  const legend = document.getElementById('catLegend');
  if (legend) {
    legend.innerHTML = cats.length
      ? cats.map(([nome], i) => `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:${CAT_PALETTE[i % CAT_PALETTE.length]}"></span>${nome}</span>`).join('')
      : '<span style="color:var(--text-muted)">Sem dados ainda</span>';
  }

  // ── Por localização ──
  const porLoc = {};
  inventario.forEach(a => { const l = a.localizacao || 'Não informada'; porLoc[l] = (porLoc[l] || 0) + 1; });
  const locs = Object.entries(porLoc).sort((a,b) => b[1] - a[1]);
  const locList = document.getElementById('locList');
  if (locList) {
    locList.innerHTML = locs.length
      ? locs.map(([nome, n]) => `<div class="renov-item"><span>${nome}</span><span style="font-weight:500">${n.toLocaleString('pt-BR')}</span></div>`).join('')
      : '<div style="color:var(--text-muted);font-size:12px">Sem ativos cadastrados.</div>';
  }

  // ── Vida útil (por data de aquisição) ──
  const vu = document.getElementById('vidaUtil');
  if (vu) {
    const hoje = new Date();
    const comData = inventario.filter(a => a.data_aquisicao);
    if (!comData.length) {
      vu.innerHTML = '<div style="color:var(--text-muted);font-size:12px">Sem datas de aquisição cadastradas.</div>';
    } else {
      let b1=0,b2=0,b3=0;
      comData.forEach(a => {
        const anos = (hoje - new Date(a.data_aquisicao + 'T00:00:00')) / (365.25*86400000);
        if (anos < 2) b1++; else if (anos <= 4) b2++; else b3++;
      });
      const tot = comData.length;
      const linha = (label, n, cls) => {
        const pct = Math.round(n / tot * 100);
        return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--text-secondary)">${label}</span><span style="font-weight:500">${pct}%</span></div><div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div></div>`;
      };
      vu.innerHTML = linha('Menos de 2 anos', b1, 'progress-green') + linha('2 a 4 anos', b2, 'progress-blue') + linha('Mais de 4 anos', b3, 'progress-amber');
    }
  }
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
