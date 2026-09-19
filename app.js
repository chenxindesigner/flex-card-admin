
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tzdaqrfsgwijbswfxlwj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h03xmzLjgPwMuPdyR26o2g_m22WIaO6';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = function(id){ return document.getElementById(id); };
const fmtMoney = function(n){ return new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(n||0)); };
const fmtDate = function(v){ return v ? new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)) : '—'; };
const esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; }); };
const state = { members:[], referrals:[], conversions:[], commissions:[], events:[] };
let activeMemberId = null;
let commissionFilter = 'all';

const statusLabel = {active:'正常',inactive:'停用',blocked:'封鎖',pending:'未到期',approved:'待發',paid:'已發',void:'作廢',confirmed:'已確認',cancelled:'取消',refunded:'退款'};
const eventLabel = {
  card_open:'開啟名片', button_click:'點擊按鈕', line_oa_click:'LINE 官網', booking_click:'預約諮詢',
  portfolio_click:'作品集', share_started:'開始分享', share_completed:'完成分享'
};

function toast(msg){
  $('toast').textContent=msg;
  $('toast').classList.remove('hidden');
  setTimeout(function(){ $('toast').classList.add('hidden'); },2300);
}

function showLogin(message){
  $('dashboardView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  if(message){ $('loginError').textContent=message; $('loginError').classList.remove('hidden'); }
}

function showDashboard(){
  $('loginView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
}

async function verifyStaff(){
  const res = await supabase.from('system_settings').select('id').limit(1);
  if(res.error){
    if(res.error.code === '42501' || /row-level|permission/i.test(res.error.message||'')) return false;
    throw res.error;
  }
  return Array.isArray(res.data);
}

async function boot(){
  const sessionRes = await supabase.auth.getSession();
  if(!sessionRes.data.session){ showLogin(); return; }
  try{
    const ok = await verifyStaff();
    if(!ok){ showLogin('這個帳號尚未被加入 Flex Card 後台管理員。'); return; }
    showDashboard();
    await loadAll();
  }catch(e){
    showLogin('無法讀取後台權限：'+(e.message||e));
  }
}

$('loginForm').addEventListener('submit', async function(e){
  e.preventDefault();
  $('loginError').classList.add('hidden');
  const res = await supabase.auth.signInWithPassword({
    email:$('email').value.trim(),
    password:$('password').value
  });
  if(res.error){
    $('loginError').textContent='登入失敗：'+res.error.message;
    $('loginError').classList.remove('hidden');
    return;
  }
  await boot();
});

$('logoutBtn').addEventListener('click', async function(){
  await supabase.auth.signOut();
  showLogin();
});
$('refreshBtn').addEventListener('click', loadAll);
$('memberSearch').addEventListener('input', renderMembers);

document.querySelectorAll('[data-tab]').forEach(function(btn){
  btn.addEventListener('click',function(){ switchTab(btn.dataset.tab); });
});
document.querySelectorAll('[data-jump]').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(btn.dataset.filter) commissionFilter=btn.dataset.filter;
    switchTab(btn.dataset.jump);
    renderCommissions();
  });
});
document.querySelectorAll('[data-close]').forEach(function(btn){
  btn.addEventListener('click',function(){ $(btn.dataset.close).classList.add('hidden'); });
});
document.querySelectorAll('.modal-backdrop').forEach(function(bg){
  bg.addEventListener('click',function(e){ if(e.target===bg) bg.classList.add('hidden'); });
});
document.querySelectorAll('[data-cfilter]').forEach(function(btn){
  btn.addEventListener('click',function(){
    commissionFilter=btn.dataset.cfilter;
    renderCommissions();
  });
});

function switchTab(tab){
  document.querySelectorAll('[data-tab]').forEach(function(b){ b.classList.toggle('active',b.dataset.tab===tab); });
  ['members','referrals','conversions','commissions'].forEach(function(k){
    $('panel-'+k).classList.toggle('hidden',k!==tab);
  });
}

async function loadAll(){
  const results = await Promise.all([
    supabase.from('members').select('*').order('created_at',{ascending:false}),
    supabase.from('referral_relationships').select('*').order('created_at',{ascending:false}),
    supabase.from('conversions').select('*').order('created_at',{ascending:false}),
    supabase.from('commissions').select('*').order('created_at',{ascending:false}),
    supabase.from('interaction_events').select('*').order('occurred_at',{ascending:false}).limit(500)
  ]);
  const firstError = results.find(function(r){ return r.error; });
  if(firstError){
    console.error(firstError.error);
    toast('資料讀取失敗');
    return;
  }

  state.members=results[0].data||[];
  state.referrals=results[1].data||[];
  state.conversions=results[2].data||[];
  state.commissions=results[3].data||[];
  state.events=results[4].data||[];

  renderAll();
  if(activeMemberId && !$('memberModal').classList.contains('hidden')) openMember(activeMemberId);
}

function memberById(id){ return state.members.find(function(x){ return x.id===id; }); }
function memberDisplay(m){ return m ? (m.admin_name || m.display_name || m.referral_code || '未命名') : '—'; }
function lineDisplay(m){ return m ? (m.display_name || '未取得名稱') : '—'; }
function referralForMember(id){ return state.referrals.find(function(r){ return r.referred_member_id===id; }); }
function referredBy(id){ return state.referrals.filter(function(r){ return r.referrer_member_id===id; }); }
function referredConversions(id){ return state.conversions.filter(function(c){ return c.referrer_member_id===id && c.status==='confirmed'; }); }
function ownConversions(id){ return state.conversions.filter(function(c){ return c.customer_member_id===id; }); }
function commissionsForMember(id){ return state.commissions.filter(function(c){ return c.recipient_member_id===id; }); }
function commissionFor(conversionId,stage){
  return state.commissions.find(function(c){ return c.conversion_id===conversionId && c.payout_stage===stage; });
}

function renderAll(){
  $('mMembers').textContent=state.members.length;
  $('mReferrals').textContent=state.referrals.length;
  $('mDeals').textContent=state.conversions.filter(function(x){ return x.status==='confirmed'; }).length;
  $('mPending').textContent=fmtMoney(
    state.commissions.filter(function(x){ return x.status==='approved'; })
      .reduce(function(s,x){ return s+Number(x.amount||0); },0)
  );
  renderMembers();
  renderReferrals();
  renderConversions();
  renderCommissions();
  $('dealCustomer').innerHTML='<option value="">請選擇</option>'+
    state.members.map(function(m){
      return '<option value="'+m.id+'">'+esc(memberDisplay(m))+'｜'+esc(m.referral_code||'')+'</option>';
    }).join('');
}

function avatarHtml(m){
  if(m && m.picture_url) return '<div class="avatar"><img src="'+esc(m.picture_url)+'" alt="" /></div>';
  const n=memberDisplay(m);
  return '<div class="avatar">'+esc((n||'?').slice(0,1))+'</div>';
}

function renderMembers(){
  const q=$('memberSearch').value.trim().toLowerCase();
  const rows=state.members.filter(function(m){
    if(!q) return true;
    return [m.admin_name,m.display_name,m.referral_code,m.line_user_id].some(function(v){
      return String(v||'').toLowerCase().includes(q);
    });
  });

  $('membersList').innerHTML=rows.map(function(m){
    const rel=referralForMember(m.id);
    const referrer=rel ? memberById(rel.referrer_member_id) : null;
    const referrals=referredBy(m.id).length;
    const deals=referredConversions(m.id).length;
    const pending=commissionsForMember(m.id)
      .filter(function(c){ return c.status==='approved'; })
      .reduce(function(s,c){ return s+Number(c.amount||0); },0);
    const lineNote=m.admin_name && m.display_name ? 'LINE：'+esc(m.display_name)+' · ' : '';
    const badgeClass=m.status==='active'?'green':'red';

    return '<button class="member-card" data-member="'+m.id+'">'+
      avatarHtml(m)+
      '<div>'+
        '<div class="card-name">'+esc(memberDisplay(m))+' <span class="badge '+badgeClass+'">'+esc(statusLabel[m.status]||m.status)+'</span></div>'+
        '<div class="card-sub">'+lineNote+'<span class="code">'+esc(m.referral_code||'')+'</span> · 來源：'+esc(memberDisplay(referrer))+'</div>'+
        '<div class="meta-row">'+
          '<span class="mini-stat">已推薦 '+referrals+'</span>'+
          '<span class="mini-stat">成交 '+deals+'</span>'+
          '<span class="mini-stat">待發 '+fmtMoney(pending)+'</span>'+
        '</div>'+
      '</div>'+
      '<div class="arrow">›</div>'+
    '</button>';
  }).join('');

  $('membersEmpty').classList.toggle('hidden',rows.length>0);
  document.querySelectorAll('[data-member]').forEach(function(btn){
    btn.addEventListener('click',function(){ openMember(btn.dataset.member); });
  });
}

function renderReferrals(){
  $('referralsList').innerHTML=state.referrals.map(function(r){
    const child=memberById(r.referred_member_id);
    const parent=memberById(r.referrer_member_id);
    return '<article class="simple-card">'+
      '<div class="side"><div class="card-name">'+esc(memberDisplay(parent))+'</div><div class="card-sub">'+esc(parent?.referral_code||'推薦人')+'</div></div>'+
      '<div class="mid">→</div>'+
      '<div class="side"><div class="card-name">'+esc(memberDisplay(child))+'</div><div class="card-sub">'+esc(child?.referral_code||'被推薦人')+' · '+fmtDate(r.created_at)+'</div></div>'+
    '</article>';
  }).join('');
  $('referralsEmpty').classList.toggle('hidden',state.referrals.length>0);
}

function stageHtml(c,stage){
  const isDeposit=stage==='deposit';
  const cm=commissionFor(c.id,stage);
  const reached=isDeposit ? !!c.deposit_received_at : !!c.project_completed_at;
  const title=isDeposit?'第一筆｜訂金':'第二筆｜結案';
  const amount=cm ? fmtMoney(cm.amount) : '$0';
  let note='';
  let action='';

  if(!cm){
    note='此案件沒有推薦獎金';
  }else if(cm.status==='paid'){
    note='已發放 · '+fmtDate(cm.paid_at);
  }else if(cm.status==='approved'){
    note='已符合發放條件';
    action='<button class="btn primary pay-commission" data-id="'+cm.id+'">發放 '+amount+'</button>';
  }else if(!reached){
    note=isDeposit?'等待訂金入帳':'等待結案／尾款入帳';
    if(isDeposit){
      action='<button class="btn soft mark-deposit" data-id="'+c.id+'">訂金已收</button>';
    }else{
      action='<button class="btn soft mark-final" data-id="'+c.id+'" '+(c.deposit_received_at?'':'disabled')+'>結案／尾款已收</button>';
    }
  }else{
    note='處理中';
  }

  const badge=cm
    ? '<span class="badge '+(cm.status==='paid'?'green':cm.status==='approved'?'orange':'')+'">'+esc(statusLabel[cm.status]||cm.status)+'</span>'
    : '';

  return '<div class="stage">'+
    '<div class="stage-title">'+title+' '+badge+'</div>'+
    '<div class="stage-amount">'+amount+'</div>'+
    '<div class="stage-note">'+note+'</div>'+
    action+
  '</div>';
}

function renderConversions(){
  $('conversionsList').innerHTML=state.conversions.map(function(c){
    const customer=memberById(c.customer_member_id);
    const referrer=memberById(c.referrer_member_id);
    return '<article class="deal-card">'+
      '<div class="deal-top">'+
        '<div><div class="card-name">'+esc(c.deal_name||'未命名案件')+'</div><div class="card-sub">客戶：'+esc(memberDisplay(customer))+' · 推薦人：'+esc(memberDisplay(referrer))+'</div></div>'+
        '<div style="text-align:right"><div class="money">'+fmtMoney(c.gross_amount)+'</div><div class="card-sub">總獎金 '+fmtMoney(c.commission_amount||0)+'</div></div>'+
      '</div>'+
      '<div class="stage-grid">'+stageHtml(c,'deposit')+stageHtml(c,'final')+'</div>'+
    '</article>';
  }).join('');

  $('conversionsEmpty').classList.toggle('hidden',state.conversions.length>0);
  document.querySelectorAll('#conversionsList .mark-deposit').forEach(function(btn){
    btn.addEventListener('click',function(){ markDeposit(btn.dataset.id); });
  });
  document.querySelectorAll('#conversionsList .mark-final').forEach(function(btn){
    btn.addEventListener('click',function(){ if(!btn.disabled) markFinal(btn.dataset.id); });
  });
  document.querySelectorAll('#conversionsList .pay-commission').forEach(function(btn){
    btn.addEventListener('click',function(){ markPaid(btn.dataset.id); });
  });
}

function renderCommissions(){
  document.querySelectorAll('[data-cfilter]').forEach(function(b){
    b.classList.toggle('active',b.dataset.cfilter===commissionFilter);
  });

  const rows=state.commissions.filter(function(c){
    return commissionFilter==='all' ? true : c.status===commissionFilter;
  });

  $('commissionsList').innerHTML=rows.map(function(c){
    const member=memberById(c.recipient_member_id);
    const deal=state.conversions.find(function(x){ return x.id===c.conversion_id; });
    const stage=c.payout_stage==='deposit'?'訂金獎金':'結案獎金';
    const badgeClass=c.status==='paid'?'green':c.status==='approved'?'orange':c.status==='void'?'red':'';
    const when=c.status==='paid'
      ? '已發：'+fmtDate(c.paid_at)
      : c.status==='approved'
        ? '可發：'+fmtDate(c.eligible_at)
        : '尚未到期';
    const pay=c.status==='approved'
      ? '<button class="btn primary pay-commission" data-id="'+c.id+'">標記已發</button>'
      : '';

    return '<article class="commission-card">'+
      '<div class="commission-top">'+
        '<div><div class="card-name">'+esc(memberDisplay(member))+' · '+stage+'</div><div class="card-sub">'+esc(deal?.deal_name||'案件')+' · '+when+'</div></div>'+
        '<div style="text-align:right"><div class="money">'+fmtMoney(c.amount)+'</div><span class="badge '+badgeClass+'">'+esc(statusLabel[c.status]||c.status)+'</span></div>'+
      '</div>'+
      (pay?'<div class="meta-row" style="justify-content:flex-end">'+pay+'</div>':'')+
    '</article>';
  }).join('');

  $('commissionsEmpty').classList.toggle('hidden',rows.length>0);
  document.querySelectorAll('#commissionsList .pay-commission').forEach(function(btn){
    btn.addEventListener('click',function(){ markPaid(btn.dataset.id); });
  });
}

function openMember(id){
  activeMemberId=id;
  const m=memberById(id);
  if(!m) return;

  const rel=referralForMember(id);
  const referrer=rel?memberById(rel.referrer_member_id):null;
  const referrals=referredBy(id);
  const referralDeals=referredConversions(id);
  const ownDeals=ownConversions(id);
  const cms=commissionsForMember(id);
  const totalDeal=referralDeals.reduce(function(s,c){ return s+Number(c.gross_amount||0); },0);
  const totalCommission=cms.reduce(function(s,c){ return s+Number(c.amount||0); },0);
  const pending=cms.filter(function(c){ return c.status==='approved'; }).reduce(function(s,c){ return s+Number(c.amount||0); },0);
  const events=state.events.filter(function(e){ return e.member_id===id; }).slice(0,12);

  $('memberDetail').innerHTML=
    '<div class="profile-head">'+avatarHtml(m)+'<div><div class="card-name">'+esc(memberDisplay(m))+'</div><div class="card-sub">LINE：'+esc(lineDisplay(m))+' · <span class="code">'+esc(m.referral_code||'')+'</span></div></div></div>'+
    '<div class="facts">'+
      '<div class="fact"><div class="k">直接推薦人</div><div class="v">'+esc(memberDisplay(referrer))+'</div></div>'+
      '<div class="fact"><div class="k">已推薦人數</div><div class="v">'+referrals.length+'</div></div>'+
      '<div class="fact"><div class="k">推薦成交</div><div class="v">'+referralDeals.length+' 筆</div></div>'+
      '<div class="fact"><div class="k">推薦成交總額</div><div class="v">'+fmtMoney(totalDeal)+'</div></div>'+
      '<div class="fact"><div class="k">累積獎金</div><div class="v">'+fmtMoney(totalCommission)+'</div></div>'+
      '<div class="fact"><div class="k">待發獎金</div><div class="v">'+fmtMoney(pending)+'</div></div>'+
      '<div class="fact"><div class="k">本人案件</div><div class="v">'+ownDeals.length+' 筆</div></div>'+
      '<div class="fact"><div class="k">首次進入</div><div class="v">'+fmtDate(m.first_seen_at)+'</div></div>'+
      '<div class="fact" style="grid-column:1/-1"><div class="k">LINE User ID</div><div class="v"><span class="code">'+esc(m.line_user_id)+'</span> <button class="btn linkish" id="copyUserId">複製</button></div></div>'+
    '</div>'+
    '<div class="section-title">管理備註</div>'+
    '<div class="field"><label>備註名稱</label><input id="memberAdminName" value="'+esc(m.admin_name||'')+'" placeholder="例如 王小姐－醫美客戶" /></div>'+
    '<div class="field"><label>備註</label><textarea id="memberAdminNote" rows="3" placeholder="只有管理員看得到">'+esc(m.admin_note||'')+'</textarea></div>'+
    '<div class="field"><label>狀態</label><select id="memberStatus">'+
      '<option value="active" '+(m.status==='active'?'selected':'')+'>正常</option>'+
      '<option value="inactive" '+(m.status==='inactive'?'selected':'')+'>停用</option>'+
      '<option value="blocked" '+(m.status==='blocked'?'selected':'')+'>封鎖</option>'+
    '</select></div>'+
    '<div class="section-title">最近互動</div>'+
    '<div class="timeline">'+
      (events.length
        ? events.map(function(e){
            return '<div class="event"><strong>'+esc(eventLabel[e.event_type]||e.button_key||e.event_type)+'</strong><small>'+fmtDate(e.occurred_at)+(e.button_key?' · '+esc(e.button_key):'')+'</small></div>';
          }).join('')
        : '<div class="empty">目前尚無互動紀錄</div>')+
    '</div>'+
    '<div class="modal-actions">'+
      '<button class="btn primary" id="saveMember">儲存</button>'+
      '<button class="btn" id="toggleMember">'+(m.status==='active'?'停用會員':'恢復會員')+'</button>'+
      '<button class="btn danger" id="deleteMember">刪除</button>'+
    '</div>';

  $('memberModal').classList.remove('hidden');
  $('copyUserId').addEventListener('click',function(){
    navigator.clipboard.writeText(m.line_user_id||'');
    toast('User ID 已複製');
  });
  $('saveMember').addEventListener('click',function(){ saveMember(m.id); });
  $('toggleMember').addEventListener('click',function(){ toggleMember(m.id,m.status); });
  $('deleteMember').addEventListener('click',function(){ deleteMember(m.id); });
}

async function saveMember(id){
  const payload={
    admin_name:$('memberAdminName').value.trim()||null,
    admin_note:$('memberAdminNote').value.trim()||null,
    status:$('memberStatus').value
  };
  const res=await supabase.from('members').update(payload).eq('id',id);
  if(res.error){ console.error(res.error); toast('儲存失敗'); return; }
  toast('會員資料已更新');
  await loadAll();
}

async function toggleMember(id,current){
  const next=current==='active'?'inactive':'active';
  const res=await supabase.from('members').update({status:next}).eq('id',id);
  if(res.error){ console.error(res.error); toast('更新失敗'); return; }
  toast(next==='active'?'會員已恢復':'會員已停用');
  await loadAll();
}

async function deleteMember(id){
  if(!confirm('確定要刪除這位會員？已有推薦、成交或獎金紀錄的人系統會阻止刪除。')) return;
  const res=await supabase.rpc('delete_member_if_clean',{p_member_id:id});
  if(res.error){ toast(res.error.message||'無法刪除'); return; }
  $('memberModal').classList.add('hidden');
  activeMemberId=null;
  toast('會員已刪除');
  await loadAll();
}

$('addDealBtn').addEventListener('click',function(){
  $('dealModal').classList.remove('hidden');
});

$('dealForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const rate=Number($('dealRate').value||0)/100;
  const res=await supabase.rpc('create_conversion_with_split',{
    p_customer_member_id:$('dealCustomer').value,
    p_deal_name:$('dealName').value.trim(),
    p_gross_amount:Number($('dealAmount').value||0),
    p_commission_rate:rate,
    p_notes:$('dealNotes').value.trim()||null
  });
  if(res.error){ console.error(res.error); toast('建立成交失敗'); return; }
  $('dealForm').reset();
  $('dealRate').value='10';
  $('dealModal').classList.add('hidden');
  toast('成交已建立，獎金已拆成兩筆');
  await loadAll();
});

async function markDeposit(id){
  const res=await supabase.rpc('mark_deposit_received',{p_conversion_id:id});
  if(res.error){ console.error(res.error); toast('訂金確認失敗'); return; }
  toast('訂金已確認，第一筆獎金可發');
  await loadAll();
}

async function markFinal(id){
  const res=await supabase.rpc('mark_project_completed',{p_conversion_id:id});
  if(res.error){ console.error(res.error); toast('結案確認失敗'); return; }
  toast('已結案，第二筆獎金可發');
  await loadAll();
}

async function markPaid(id){
  const res=await supabase.rpc('mark_commission_paid',{p_commission_id:id});
  if(res.error){ console.error(res.error); toast('獎金尚未到期或更新失敗'); return; }
  toast('已標記獎金發放');
  await loadAll();
}

boot();
