# -*- coding: utf-8 -*-
"""Generate financial dashboard HTML with embedded data as JSON."""
import json, pathlib

COLORS = {'group':'#2563eb','short':'#10b981','long':'#f59e0b','med':'#ef4444'}
LABELS = ['团险','短险','长险','医险']
KEYS = ['group','short','long','med']

YOY = [
  [0.10,0.12,0.08,0.15],[0.12,0.10,0.07,0.13],[0.11,0.09,0.06,0.12],
  [0.09,0.11,0.05,0.14],[0.08,0.13,0.06,0.11],[0.10,0.08,0.07,0.12],
  [0.07,0.09,0.05,0.10],[0.08,0.12,0.06,0.11]
]

raw = [
  dict(name='华诚保险经纪',region='华东',gP=280000,gI=224000,gC=145600,sP=210000,sI=168000,sC=99120,lP=410000,lI=328000,lC=111520,mP=180000,mI=144000,mC=131040,pyP=995000,pyL=78500),
  dict(name='恒信保险代理',region='江苏',gP=250000,gI=200000,gC=130000,sP=190000,sI=152000,sC=89680,lP=360000,lI=288000,lC=97920,mP=160000,mI=128000,mC=116480,pyP=885000,pyL=69800),
  dict(name='安达保险经纪',region='华南',gP=220000,gI=176000,gC=114400,sP=170000,sI=136000,sC=80240,lP=320000,lI=256000,lC=87040,mP=140000,mI=112000,mC=101920,pyP=785000,pyL=60800),
  dict(name='瑞丰保险代理',region='华中',gP=200000,gI=160000,gC=104000,sP=150000,sI=120000,sC=70800,lP=290000,lI=232000,lC=78880,mP=130000,mI=104000,mC=94640,pyP=710000,pyL=53800),
  dict(name='永安保险代理',region='西南',gP=180000,gI=144000,gC=93600,sP=140000,sI=112000,sC=66080,lP=270000,lI=216000,lC=73440,mP=120000,mI=96000,mC=88320,pyP=655000,pyL=49800),
  dict(name='国泰保险经纪',region='华北',gP=240000,gI=192000,gC=124800,sP=180000,sI=144000,sC=84960,lP=340000,lI=272000,lC=92480,mP=150000,mI=120000,mC=109200,pyP=840000,pyL=65200),
  dict(name='鼎诚保险代理',region='西北',gP=150000,gI=120000,gC=78000,sP=120000,sI=96000,sC=56640,lP=230000,lI=184000,lC=62640,mP=100000,mI=80000,mC=73600,pyP=555000,pyL=41200),
  dict(name='盛达保险代理',region='东北',gP=160000,gI=128000,gC=83200,sP=130000,sI=104000,sC=61360,lP=250000,lI=200000,lC=68000,mP=110000,mI=88000,mC=80960,pyP=600000,pyL=45100),
]

subs = []
for i, d in enumerate(raw):
    s = dict(d)
    yoy = YOY[i]
    s['prem'] = [d['gP'], d['sP'], d['lP'], d['mP']]
    s['incs'] = [d['gI'], d['sI'], d['lI'], d['mI']]
    s['clms'] = [d['gC'], d['sC'], d['lC'], d['mC']]
    s['tP'] = sum(s['prem'])
    s['tI'] = sum(s['incs'])
    s['tC'] = sum(s['clms'])
    s['cr'] = s['tC'] / s['tI']
    s['pf'] = s['tI'] - s['tC']
    s['pfR'] = s['pf'] / s['tI']
    s['pm'] = [p / s['tP'] for p in s['prem']]
    s['premG'] = s['tP'] / d['pyP'] - 1
    s['profitG'] = (s['pf'] - d['pyL']) / abs(d['pyL'])
    s['yoy'] = yoy
    subs.append(s)

data_json = json.dumps(subs, ensure_ascii=False)
colors_json = json.dumps(COLORS)
labels_json = json.dumps(LABELS, ensure_ascii=False)
keys_json = json.dumps(KEYS)

# Build HTML as a template with placeholder for the script section
# We write the script in a separate file to avoid </script> escaping issues
script_content = """
const S = __DATA__;
const CL = __COLORS__;
const LB = __LABELS__;
const KY = __KEYS__;

function fmt(n){
  if(Math.abs(n)>=10000) return (n/10000).toFixed(2)+'亿';
  return n.toLocaleString('zh-CN')+'万';
}
function fw(n){return n.toLocaleString('zh-CN')}
function pc(n){return (n*100).toFixed(1)+'%'}
function tc(n){return n>=0?'pos':'neg'}
function ta(n){return n>=0?'↑':'↓'}

// Summary bar
const tP=S.reduce((a,s)=>a+s.tP,0);
const tI=S.reduce((a,s)=>a+s.tI,0);
const tC=S.reduce((a,s)=>a+s.tC,0);
const tL=tI-tC;
const aCR=tC/tI;
const pyTot=S.reduce((a,s)=>a+s.pyP,0);

document.getElementById('sbar').innerHTML =
  '<div class="sc"><div class="lab">总规模保费</div><div class="val">'+fmt(tP)+'</div><div class="sub">同比+'+pc((tP-pyTot)/pyTot)+'</div></div>'+
  '<div class="sc"><div class="lab">总收入</div><div class="val">'+fmt(tI)+'</div></div>'+
  '<div class="sc"><div class="lab">总赔付</div><div class="val">'+fmt(tC)+'</div><div class="sub">赔付率'+pc(tC/tI)+'</div></div>'+
  '<div class="sc"><div class="lab">综合成本率</div><div class="val" style="color:'+(aCR<=0.95?'#16a34a':'#dc2626')+'">'+pc(aCR)+'</div></div>'+
  '<div class="sc"><div class="lab">整体盈亏</div><div class="val pos">'+fmt(tL)+'</div><div class="sub">利润率'+pc(tL/tI)+'</div></div>';

// Subsidiary cards
const cg = document.getElementById('cg');
S.forEach(function(s,idx){
  var d = document.createElement('div');
  d.className = 'card';

  // Build table rows
  var rows = '';
  for(var i=0;i<4;i++){
    var pf = s.incs[i]-s.clms[i];
    var cr = s.incs[i]>0 ? s.clms[i]/s.incs[i] : 0;
    rows += '<tr><td>'+LB[i]+'</td>'+
      '<td class="ct">'+fw(s.prem[i])+'</td>'+
      '<td class="ct '+tc(s.yoy[i])+'">'+ta(s.yoy[i])+pc(s.yoy[i])+'</td>'+
      '<td class="ct">'+fw(s.incs[i])+'</td>'+
      '<td class="ct '+tc(s.yoy[i]*0.9)+'">'+ta(s.yoy[i]*0.9)+pc(s.yoy[i]*0.9)+'</td>'+
      '<td class="ct">'+fw(s.clms[i])+'</td>'+
      '<td class="ct '+tc(s.yoy[i]*1.05)+'">'+ta(s.yoy[i]*1.05)+pc(s.yoy[i]*1.05)+'</td>'+
      '<td class="ct'+(cr>0.68?' neg':'')+'">'+pc(cr)+'</td>'+
      '<td class="ct '+tc(pf)+'">'+fw(pf)+'</td></tr>';
  }
  rows += '<tr><td>合计</td>'+
    '<td class="ct">'+fw(s.tP)+'</td>'+
    '<td class="ct '+tc(s.premG)+'">'+ta(s.premG)+pc(s.premG)+'</td>'+
    '<td class="ct">'+fw(s.tI)+'</td><td></td>'+
    '<td class="ct">'+fw(s.tC)+'</td><td></td>'+
    '<td class="ct'+(s.cr>0.95?' neg':'')+'">'+pc(s.cr)+'</td>'+
    '<td class="ct '+tc(s.pf)+'">'+fw(s.pf)+'</td></tr>';

  var crCls = s.cr<=0.92?'gr':s.cr<=0.95?'am':'rd';
  var pgCls = s.profitG>=0.1?'gr':'bl';

  d.innerHTML =
    '<div class="ch"><h2>'+s.name+'</h2><span class="badge">'+s.region+'区</span></div>'+
    '<div class="cb"><table class="m">'+
    '<tr><th>险种</th><th class="sec">规模保费</th><th>同比</th><th class="sec">收入</th><th>同比</th><th class="sec">赔付</th><th>同比</th><th>赔付率</th><th>盈亏</th></tr>'+
    rows+'</table></div>'+
    '<div class="kpi-strip">'+
    '<div class="kpi '+crCls+'"><div class="kl">综合成本率</div><div class="kv">'+pc(s.cr)+'</div></div>'+
    '<div class="kpi gr"><div class="kl">整体盈亏</div><div class="kv">'+fmt(s.pf)+'</div></div>'+
    '<div class="kpi bl"><div class="kl">保费同比</div><div class="kv">+'+pc(s.premG)+'</div></div>'+
    '<div class="kpi '+pgCls+'"><div class="kl">利润同比</div><div class="kv">+'+pc(s.profitG)+'</div></div></div>'+
    '<div class="cbot">'+
    '<div class="cbox"><h4>保费结构</h4><canvas id="pie'+idx+'" width="170" height="170"></canvas></div>'+
    '<div class="cbox"><h4>收入vs赔付</h4><canvas id="bar'+idx+'" width="210" height="170"></canvas></div></div>';

  cg.appendChild(d);

  // Pie chart - premium structure
  new Chart(document.getElementById('pie'+idx),{
    type:'doughnut',
    data:{labels:LB,datasets:[{data:s.prem,backgroundColor:KY.map(function(k){return CL[k]}),borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:false,maintainAspectRatio:false,
      plugins:{legend:{position:'right',labels:{font:{size:8},padding:5,boxWidth:9}},
        tooltip:{callbacks:{label:function(c){return c.label+': '+c.raw.toLocaleString()+'万 ('+pc(s.pm[c.dataIndex])+')'}}}},
      cutout:'50%'}
  });

  // Bar chart - income vs claims by line
  new Chart(document.getElementById('bar'+idx),{
    type:'bar',
    data:{labels:LB,datasets:[
      {label:'收入',data:s.incs,backgroundColor:'rgba(37,99,235,.7)',borderRadius:3,barPercentage:.35},
      {label:'赔付',data:s.clms,backgroundColor:'rgba(239,68,68,.7)',borderRadius:3,barPercentage:.35}
    ]},
    options:{responsive:false,maintainAspectRatio:false,
      plugins:{legend:{labels:{font:{size:8},boxWidth:9}},
        tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+c.raw.toLocaleString()+'万'}}}},
      scales:{y:{ticks:{font:{size:7},callback:function(v){return (v/10000).toFixed(0)+'亿'}}},x:{ticks:{font:{size:8}}}}}
  });
});

// Bottom comparison: profit ranking
var sorted = S.slice().sort(function(a,b){return b.pf-a.pf});
new Chart(document.getElementById('pChart'),{
  type:'bar',
  data:{labels:sorted.map(function(s){return s.name}),
    datasets:[{label:'盈亏',data:sorted.map(function(s){return s.pf}),
      backgroundColor:sorted.map(function(s){return s.pf>=80000?'#16a34a':s.pf>=60000?'#2563eb':'#f59e0b'}),
      borderRadius:4,barPercentage:.55}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.raw.toLocaleString()+'万'}}}},
    scales:{x:{ticks:{font:{size:8},callback:function(v){return (v/10000).toFixed(1)+'亿'}}},y:{ticks:{font:{size:9}}}}}
});

// Bottom comparison: combined ratio ranking
var byCR = S.slice().sort(function(a,b){return a.cr-b.cr});
new Chart(document.getElementById('cChart'),{
  type:'bar',
  data:{labels:byCR.map(function(s){return s.name}),
    datasets:[{label:'成本率',data:byCR.map(function(s){return +(s.cr*100).toFixed(1)}),
      backgroundColor:byCR.map(function(s){return s.cr<=0.92?'#16a34a':s.cr<=0.95?'#2563eb':'#dc2626'}),
      borderRadius:4,barPercentage:.55}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.raw+'%'}}}},
    scales:{x:{min:88,max:97,ticks:{font:{size:8},callback:function(v){return v+'%'}}},y:{ticks:{font:{size:9}}}}}
});
"""

script_content = script_content.replace('__DATA__', data_json)
script_content = script_content.replace('__COLORS__', colors_json)
script_content = script_content.replace('__LABELS__', labels_json)
script_content = script_content.replace('__KEYS__', keys_json)

# Write script file separately to avoid </script> issues
out_dir = pathlib.Path(r'C:\Users\a8466\Desktop\工作文件')
script_path = out_dir / 'dashboard_data.js'
script_path.write_text(script_content, encoding='utf-8')

# Write the HTML referencing the external script
html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>财险子公司经营分析看板</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei","Segoe UI",sans-serif;background:#eef2f7;color:#1a1a2e}
.hdr{background:linear-gradient(135deg,#0d1b3e 0%,#1a3a6b 50%,#2a5a9b 100%);color:#fff;padding:16px 24px;position:sticky;top:0;z-index:100;box-shadow:0 3px 15px rgba(0,0,0,.25)}
.hdr h1{font-size:19px;font-weight:700;margin-bottom:3px}
.hdr .meta{font-size:11px;opacity:.7;display:flex;gap:18px}
.sbar{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px 18px;background:#fff;border-bottom:1px solid #e2e8f0}
.sc{text-align:center;padding:8px 4px;border-radius:7px;background:#f8fafc}
.sc .lab{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px}
.sc .val{font-size:16px;font-weight:800;color:#0d1b3e;margin-top:2px}
.sc .sub{font-size:9px;color:#64748b;margin-top:1px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 18px;max-width:1800px;margin:0 auto}
.card{background:#fff;border-radius:9px;box-shadow:0 1px 5px rgba(0,0,0,.06);overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 14px rgba(0,0,0,.11)}
.ch{background:linear-gradient(90deg,#0d1b3e,#1e3a6e);color:#fff;padding:9px 13px;display:flex;justify-content:space-between;align-items:center}
.ch h2{font-size:13px;font-weight:700}
.ch .badge{background:rgba(255,255,255,.15);padding:2px 9px;border-radius:10px;font-size:10px;font-weight:600}
.cb{padding:10px 12px}
table.m{width:100%;border-collapse:collapse;font-size:10.5px}
table.m th{background:#f1f5f9;padding:4px 3px;text-align:center;font-weight:700;color:#475569;border:1px solid #e2e8f0;font-size:9.5px}
table.m th.sec{background:#e2e8f0;color:#1e293b}
table.m td{padding:4px 3px;text-align:right;border:1px solid #e2e8f0;white-space:nowrap}
table.m td:first-child{text-align:left;font-weight:600;color:#334155;background:#fafbfc}
table.m td.ct{text-align:center;font-weight:700}
table.m tr:last-child td{background:#f1f5f9;font-weight:700}
.pos{color:#16a34a}.neg{color:#dc2626}
.kpi-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:0 12px 10px}
.kpi{text-align:center;padding:5px 3px;border-radius:5px}
.kpi .kl{font-size:8px;color:#94a3b8;text-transform:uppercase}
.kpi .kv{font-size:14px;font-weight:800;margin-top:1px}
.kpi.gr{background:#f0fdf4}.kpi.gr .kv{color:#16a34a}
.kpi.rd{background:#fef2f2}.kpi.rd .kv{color:#dc2626}
.kpi.bl{background:#eff6ff}.kpi.bl .kv{color:#2563eb}
.kpi.am{background:#fffbeb}.kpi.am .kv{color:#d97706}
.cbot{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px 12px}
.cbox{background:#f8fafc;border-radius:7px;padding:7px;text-align:center}
.cbox h4{font-size:9px;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px}
.cmp{background:#fff;border-radius:9px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin:0 18px 18px;padding:14px}
.cmp h3{font-size:13px;color:#0d1b3e;margin-bottom:10px;padding-bottom:7px;border-bottom:2px solid #e2e8f0}
.crow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cpan{background:#f8fafc;border-radius:7px;padding:10px}
.cpan h4{font-size:10px;color:#475569;margin-bottom:6px;text-align:center}
.ft{text-align:center;padding:10px;font-size:9px;color:#94a3b8;background:#fff;border-top:1px solid #e2e8f0}
@media(max-width:1100px){.grid,.crow{grid-template-columns:1fr}.sbar{grid-template-columns:repeat(3,1fr)}}
</style>
</head>
<body>
<div class="hdr">
  <h1>财险子公司经营分析看板</h1>
  <div class="meta"><span>报告期: 2025年5月</span><span>单位: 万元</span><span>数据截至: 2025-05-31</span></div>
</div>
<div class="sbar" id="sbar"></div>
<div class="grid" id="cg"></div>
<div class="cmp">
  <h3>各子公司利润与成本率排名</h3>
  <div class="crow">
    <div class="cpan"><h4>整体盈亏（万元）</h4><canvas id="pChart" height="280"></canvas></div>
    <div class="cpan"><h4>综合成本率（%）</h4><canvas id="cChart" height="280"></canvas></div>
  </div>
</div>
<div class="ft">数据来源：财险公司管理驾驶舱 · 自动生成 · 仅供内部分析参考</div>
<script src="dashboard_data.js"></script>
</body>
</html>"""

out_html = pathlib.Path(r'C:\Users\a8466\Desktop\工作文件\财险子公司经营分析看板.html')
out_html.write_text(html, encoding='utf-8')
print(f'Dashboard written: {out_html} ({len(html):,} bytes)')
print(f'Script written: {script_path} ({len(script_content):,} bytes)')
print(f'Total: 8 subsidiaries, 4 product lines per card')
