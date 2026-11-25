(function(){
  'use strict';

  var APP_VERSION = 'v2.12';
  var APP_DATE = '2026-11-25';

  var SUPABASE_URL = 'https://oykyjwiwukidpchbbnnf.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_bwUO6RQBa1qiurFdMbNX3A_nTtHTMEt';
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var PALETTE = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#4dabf7','#f783ac','#38d9a9','#b197fc','#ff922b','#22d3ee'];
  var DEFAULT_OPTS = [{v:5,w:10},{v:10,w:25},{v:15,w:30},{v:20,w:25},{v:30,w:10}];
  var DEFAULT_REWARDS = [{name:'玩平板',cost:100},{name:'看动画片',cost:50},{name:'买小玩具',cost:300}];
  var MAX_PHOTOS = 1;
  var DEFAULT_MAX_DRAWS = 3;
  var MAX_PHOTO_DIM = 1280;
  var PHOTO_QUALITY = 0.82;
  var LOGIN_ID_RE = /^[a-zA-Z0-9_]{3,20}$/;
  var RECENT_KEY = 'bao_recent_accounts';
  var RECENT_MAX = 5;
  var CACHE_KEY_PREFIX = 'bao_cache_score_';
  var NETWORK_MSG_KEY = 'bao_network_msg';
  var MAIN_VIEW_KEY = 'bao_main_view';
  var DEBUG_LOG_KEY = 'bao_debug_log';

  var __baoLogs = [];
  function baoLoadLogs(){ try { __baoLogs = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || '[]') || []; } catch(e){ __baoLogs = []; } }
  function baoState(){ try { return { pts: totalPoints, draw: today ? today.drawCount : null, date: today ? today.date : null, got: today ? today.got : null, hist: hist.length, vip: isVip }; } catch(e){ return {}; } }
  function baoLog(tag, msg, data){
    try {
      var entry = { t: new Date().toLocaleString('zh-CN', {hour12:false}), tag: tag, msg: String(msg == null ? '' : msg), state: baoState() };
      if(data !== undefined) entry.data = data;
      __baoLogs.push(entry);
      if(__baoLogs.length > 200) __baoLogs = __baoLogs.slice(-200);
      localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(__baoLogs));
    } catch(e){}
  }
  function baoLogText(){
    return __baoLogs.map(function(x){
      var s = x.state || {};
      var line = x.t + ' [' + x.tag + '] ' + x.msg + ' | pts=' + s.pts + ' draw=' + s.draw + ' date=' + s.date + ' hist=' + s.hist;
      if(x.data !== undefined) line += ' | ' + JSON.stringify(x.data);
      return line;
    }).join('\n');
  }
  baoLoadLogs();
  window.__baoLog = baoLog;
  baoLog('boot', '页面打开', { url: location.href, ver: APP_VERSION });
  window.onerror = function(msg, src, line){ baoLog('error', String(msg), { src: String(src), line: line }); };
  window.addEventListener('unhandledrejection', function(e){ baoLog('promise', '未处理异常', { reason: e && e.reason && (e.reason.message || String(e.reason)) }); });
  window.addEventListener('popstate', function(){ baoLog('history', 'popstate', { url: location.href, len: history.length }); });
  window.addEventListener('hashchange', function(){ baoLog('history', 'hashchange', { url: location.href }); });
  document.addEventListener('visibilitychange', function(){ baoLog('visibility', document.visibilityState, { url: location.href }); });

  var user = null;
  var isVip = false;
  var loginId = '';
  var babyName = '';
  var accountEmail = '';
  var opts = DEFAULT_OPTS.map(function(o){return {v:o.v,w:o.w};});
  var rewards = DEFAULT_REWARDS.map(function(r){return {name:r.name,cost:r.cost};});
  var maxDraws = DEFAULT_MAX_DRAWS;
  var spinSpeed = 'normal';
  var totalPoints = 0;
  var hist = [];
  var soundOn = true;
  var today = null;
  var todayNote = '';
  var pendingPhotos = [];

  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function todayDisplay(){ var d=new Date(); var week=['日','一','二','三','四','五','六'][d.getDay()]; return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 星期'+week; }
  function resetTodayIfNeeded(){
    var ts = todayStr();
    if(!today || today.date !== ts){
      baoLog('today', '跨天重置今日状态', { old: today && today.date, now: ts });
      today = {date:ts, allowed:false, drawn:false, got:0, photos:[], drawCount:0};
      todayNote='';
    }
    if(!today.photos) today.photos = [];
    if(typeof today.drawCount !== 'number') today.drawCount = 0;
  }

  function displayName(){ return babyName ? babyName : '宝贝'; }
  function refreshNameDisplay(){
    var n = displayName();
    var a = document.getElementById('babyNameDisplay');
    var b = document.getElementById('confirmBn');
    var c = document.getElementById('prizeBn');
    if(a) a.textContent = n;
    if(b) b.textContent = n;
    if(c) c.textContent = n;
  }
  function refreshMenuValues(){
    var a = document.getElementById('mBabyNameVal');
    var b = document.getElementById('mAccountVal');
    var c = document.getElementById('mDrawLimitVal');
    var d = document.getElementById('mSpinSpeedVal');
    if(a) a.textContent = babyName || '未设置';
    if(b) b.textContent = loginId ? ('@' + loginId) : '';
    if(c) c.textContent = maxDraws + ' 次';
    if(d) {
      if(spinSpeed === 'fastest') d.textContent = '极速';
      else if(spinSpeed === 'fast') d.textContent = '快速';
      else if(spinSpeed === 'slow') d.textContent = '慢速';
      else if(spinSpeed === 'slowest') d.textContent = '超慢';
      else d.textContent = '标准';
    }
  }

  function isEmail(s){ return s.indexOf('@') !== -1; }

  function cacheKey(){ return CACHE_KEY_PREFIX + (user ? user.id : 'guest'); }
  function saveLocalCache(savedAt){
    if(!user) return;
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({
        totalPoints: totalPoints, hist: hist, today: today, todayNote: todayNote,
        rewards: rewards, opts: opts, maxDraws: maxDraws, spinSpeed: spinSpeed,
        savedAt: savedAt || new Date().toISOString()
      }));
    } catch(e){}
  }
  function isoLater(a, b){
    var ta = a ? Date.parse(a) : NaN, tb = b ? Date.parse(b) : NaN;
    if(isNaN(ta)) return false;
    if(isNaN(tb)) return true;
    return ta > tb;
  }
  function saveMainView(view){
    try { localStorage.setItem(MAIN_VIEW_KEY, view || 'main'); } catch(e){}
  }
  function loadMainView(){
    try { return localStorage.getItem(MAIN_VIEW_KEY) || 'main'; } catch(e){ return 'main'; }
  }
  function loadLocalCache(){
    if(!user) return null;
    try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch(e){ return null; }
  }
  function applyLocalCache(cache){
    if(!cache) return false;
    totalPoints = Number(cache.totalPoints || 0);
    hist = Array.isArray(cache.history || cache.hist) ? (cache.history || cache.hist) : [];
    today = cache.today || null;
    todayNote = cache.todayNote || '';
    if(Array.isArray(cache.rewards) && cache.rewards.length) rewards = cache.rewards;
    if(Array.isArray(cache.opts) && cache.opts.length) opts = cache.opts;
    if(typeof cache.maxDraws === 'number') maxDraws = cache.maxDraws;
    if(cache.spinSpeed) spinSpeed = cache.spinSpeed;
    return true;
  }
  function showNetworkMsg(text, type){
    var el = document.getElementById('netStatus');
    if(!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.className = 'net-status ' + (type || 'info');
    try {
      if(text) localStorage.setItem(NETWORK_MSG_KEY, JSON.stringify({text:text, type:type||'info', t:Date.now()}));
      else localStorage.removeItem(NETWORK_MSG_KEY);
    } catch(e){}
  }
  function restoreNetworkMsg(){
    try {
      var raw = localStorage.getItem(NETWORK_MSG_KEY);
      if(!raw) return;
      var saved = JSON.parse(raw);
      if(saved && saved.text){
        var el = document.getElementById('netStatus');
        if(el){
          el.textContent = saved.text;
          el.style.display = 'block';
          el.className = 'net-status ' + (saved.type || 'warn');
        }
      }
    } catch(e){}
  }
  function loadRecent(){
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch(e){ return []; }
  }
  function saveRecent(list){
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch(e){}
  }
  function addRecent(account, label){
    var list = loadRecent();
    list = list.filter(function(x){ return x.account !== account; });
    list.unshift({account: account, label: label, t: Date.now()});
    if(list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    saveRecent(list);
    renderRecent();
  }

  function renderRecent(){
    var box = document.getElementById('recentBox');
    var list = loadRecent();
    if(!list.length){
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    var listEl = document.getElementById('recentList');
    listEl.innerHTML = list.map(function(item, i){
      return '<button class="recent-item" data-i="'+i+'">'+
        '<span class="rico">👤</span>'+
        '<span class="rtxt">'+escapeHtml(item.label || item.account)+'</span>'+
        '<span class="rarrow">›</span>'+
      '</button>';
    }).join('');
    listEl.querySelectorAll('.recent-item').forEach(function(btn){
      btn.addEventListener('click', function(){
        var item = list[parseInt(btn.dataset.i)];
        if(!item) return;
        accountInput.value = item.account;
        passInput.value = '';
        passInput.focus();
        authMsg.textContent = '';
        authMsg.className = 'msg';
      });
    });
  }

  function loadProfile(){
    if(!user) return Promise.resolve();
    return sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      .then(function(res){
        if(res.error){ console.warn('读取 profile 失败', res.error); baoLog('profile', '读取失败', { msg: res.error.message }); return; }
        if(res.data){
          // 这里不再执行 signOut，只在下方强制拦截
          loginId = res.data.login_id || '';
          babyName = res.data.baby_name || '';
          accountEmail = res.data.email || user.email || '';
          isVip = !!res.data.is_vip;
          baoLog('profile', '读取成功', { baby: babyName, vip: isVip, loginId: loginId });
        } else {
          baoLog('profile', '无记录，准备创建');
          return sb.from('profiles').upsert({
            user_id: user.id,
            email: user.email || null,
            login_id: null,
            baby_name: '',
            is_vip: false
          }).then(function(r){
            if(r.error) console.warn('创建 profile 失败', r.error);
            accountEmail = user.email || '';
            isVip = false;
          });
        }
      });
  }

  function saveProfile(){
    if(!user) return Promise.resolve({ error: null });
    return sb.from('profiles').upsert({
      user_id: user.id,
      email: user.email || accountEmail || null,
      login_id: loginId || null,
      baby_name: babyName,
      updated_at: new Date().toISOString()
    }).then(function(res){
      if(res.error) console.warn('保存 profile 失败', res.error);
      return res;
    });
  }

  var saveTimer = null;
  var saveRetry = 0;
  var pendingSave = null;
  function saveCloud(){
    if(!user) return Promise.resolve();
    clearTimeout(saveTimer);
    var snapshot = {
      user_id: user.id,
      total_points: totalPoints,
      history: hist.slice(),
      today: today,
      today_note: todayNote,
      rewards: rewards.map(function(r){ return {name:r.name, cost:r.cost}; }),
      opts: opts.map(function(o){ return {v:o.v, w:o.w}; }),
      max_draws: maxDraws,
      spin_speed: spinSpeed,
      updated_at: new Date().toISOString()
    };
    saveLocalCache();
    baoLog('save', '准备保存云端', { pts: snapshot.total_points, draw: snapshot.today && snapshot.today.drawCount, got: snapshot.today && snapshot.today.got });
    pendingSave = new Promise(function(resolve){
      saveTimer = setTimeout(function(){
        sb.from('scores').upsert(snapshot, { onConflict: 'user_id' }).then(function(res){
          if(res.error){
            console.warn('保存失败，稍后重试', res.error);
            baoLog('save', '保存失败', { msg: res.error.message, retry: saveRetry });
            if(saveRetry < 3){
              saveRetry += 1;
              setTimeout(saveCloud, 1000 * saveRetry);
            } else {
              showNetworkMsg('网络暂时不可用，记录已先保存在本机，联网后会自动重试', 'warn');
            }
            resolve(res);
            return;
          }
          saveRetry = 0;
          var row = Array.isArray(res.data) ? res.data[0] : res.data;
          var empty = res.data == null || (Array.isArray(res.data) && res.data.length === 0);
          if(empty){
            baoLog('save', '保存返回空（可能未更新到记录）', { pts: snapshot.total_points, draw: snapshot.today && snapshot.today.drawCount });
          } else {
            baoLog('save', '保存成功', { pts: row && row.total_points != null ? row.total_points : totalPoints, draw: row && row.today ? row.today.drawCount : today && today.drawCount });
          }
          resolve(res);
        }).catch(function(err){
          console.warn('保存异常，稍后重试', err);
          baoLog('save', '保存异常', { msg: err && err.message });
          if(saveRetry < 3){
            saveRetry += 1;
            setTimeout(saveCloud, 1000 * saveRetry);
          } else {
            showNetworkMsg('网络暂时不可用，记录已先保存在本机，联网后会自动重试', 'warn');
          }
          resolve({ error: err });
        });
      }, 300);
    });
    return pendingSave;
  }

  function loadCloud(){
    return sb.from('scores').select('*').eq('user_id', user.id).maybeSingle()
      .then(function(res){
        if(res.error){
          console.warn('读取失败，使用本地缓存', res.error);
          baoLog('cloud', '读取失败，改用本地缓存', { msg: res.error.message });
          var cached = loadLocalCache();
          if(applyLocalCache(cached)) showNetworkMsg('网络暂时不可用，当前显示本地缓存记录', 'warn');
          resetTodayIfNeeded();
          return;
        }
        if(res.data){
          var cached = loadLocalCache();
          if(cached && isoLater(cached.savedAt, res.data.updated_at)){
            baoLog('cloud', '本地记录较新，保留本地并回写云端', { cloudPts: res.data.total_points, localPts: cached.totalPoints, cloudUpdated: res.data.updated_at, localSaved: cached.savedAt });
            applyLocalCache(cached);
            resetTodayIfNeeded();
            saveLocalCache();
            showNetworkMsg('', 'info');
            saveCloud();
            return;
          }
          totalPoints = Number(res.data.total_points || 0);
          hist = Array.isArray(res.data.history) ? res.data.history : [];
          today = res.data.today || null;
          todayNote = res.data.today_note || '';
          if(res.data.rewards && res.data.rewards.length) rewards = res.data.rewards;
          if(res.data.opts && res.data.opts.length) opts = res.data.opts;
          if(typeof res.data.max_draws === 'number') maxDraws = res.data.max_draws;
          if(res.data.spin_speed) spinSpeed = res.data.spin_speed;
          baoLog('cloud', '读取成功', { pts: totalPoints, draw: today && today.drawCount, date: today && today.date, got: today && today.got, hist: hist.length, updated: res.data.updated_at });
          saveLocalCache(res.data.updated_at);
        } else {
          baoLog('cloud', '云端无记录');
          var cached = loadLocalCache();
          if(!applyLocalCache(cached)){
            totalPoints = 0; hist = []; today = null; todayNote='';
            rewards = DEFAULT_REWARDS.map(function(r){return {name:r.name,cost:r.cost};});
            opts = DEFAULT_OPTS.map(function(o){return {v:o.v,w:o.w};});
            maxDraws = DEFAULT_MAX_DRAWS;
            spinSpeed = 'normal';
          }
          saveLocalCache();
          saveCloud();
        }
        showNetworkMsg('', 'info');
        resetTodayIfNeeded();
      });
  }

  function compressImage(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){
        var img = new Image();
        img.onload = function(){
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, MAX_PHOTO_DIM / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var c = cv.getContext('2d');
          c.drawImage(img, 0, 0, cw, ch);
          cv.toBlob(function(blob){
            if(blob) resolve(blob);
            else reject(new Error('压缩失败'));
          }, 'image/jpeg', PHOTO_QUALITY);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function uploadPhoto(file){
    if(!user) return Promise.reject(new Error('未登录'));
    return compressImage(file).then(function(blob){
      var fname = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.jpg';
      var path = user.id + '/' + fname;
      return sb.storage.from('photos').upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false
      });
    }).then(function(res){
      if(res.error) throw res.error;
      var path = res.data.path;
      return sb.storage.from('photos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
        .then(function(sres){
          if(sres.error) throw sres.error;
          return { path: path, url: sres.data.signedUrl };
        });
    });
  }

  function deleteAllPhotos(){
    if(!user) return Promise.resolve();
    return sb.storage.from('photos').list(user.id, { limit: 1000 }).then(function(res){
      if(res.error || !res.data || !res.data.length) return;
      var paths = res.data.map(function(f){ return user.id + '/' + f.name; });
      return sb.storage.from('photos').remove(paths).then(function(rres){
        if(rres.error) console.warn('照片删除失败', rres.error);
      });
    }).catch(function(err){
      console.warn('照片清理异常', err);
    });
  }

  function renderPhotoPreview(){
    var box = document.getElementById('photoPreview');
    box.innerHTML = '';
    pendingPhotos.forEach(function(p, i){
      var wrap = document.createElement('div');
      wrap.className = 'pwrap';
      var img = document.createElement('img');
      img.src = p.url;
      wrap.appendChild(img);
      var rm = document.createElement('button');
      rm.className = 'rm'; rm.textContent = '×'; rm.title = '删除这张';
      rm.addEventListener('click', function(){
        pendingPhotos.splice(i, 1);
        renderPhotoPreview();
      });
      wrap.appendChild(rm);
      box.appendChild(wrap);
    });
    var cnt = pendingPhotos.length;
    document.getElementById('photoHint').textContent = cnt >= MAX_PHOTOS ? '已达上限' : ('最多 ' + (MAX_PHOTOS - cnt) + ' 张');
    document.getElementById('photoBtn').disabled = cnt >= MAX_PHOTOS;
  }

  var ac=null, audioStarted=false;
  function ensureAudio(){ if(!audioStarted){ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} if(ac&&ac.state==='suspended')ac.resume(); audioStarted=true; } }
  function beep(f,dur,type,vol,delay){ if(!soundOn||!ac)return; var t=ac.currentTime+(delay||0); var o=ac.createOscillator(),g=ac.createGain(); o.type=type||'sine'; o.frequency.value=f; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol||0.25,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+(dur||0.12)); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+(dur||0.12)+0.02); }
  function tickSound(i){ beep(420+(i%8)*40,0.05,'square',0.12); }
  function winSound(){ [523,659,784,1046].forEach(function(f,i){ beep(f,0.22,'triangle',0.3,i*0.13); }); beep(1318,0.4,'triangle',0.28,0.55); }
  function exchangeSound(){ [600,800,1000].forEach(function(f,i){ beep(f,0.15,'sine',0.25,i*0.1); }); }

  var canvas=document.getElementById('wheel'), ctx=canvas.getContext('2d');
  var off=document.createElement('canvas'), offx=off.getContext('2d');
  var angle=0, spinning=false, radius=0, cx=0, cy=0;
  var segs=[];

  function totalW(){ return opts.reduce(function(s,o){return s+o.w;},0); }
  function setupCanvas(){
    var dpr=Math.min(window.devicePixelRatio||1,2.5);
    var size=canvas.clientWidth||canvas.clientHeight||360; if(size<=0)size=360;
    canvas.width=Math.round(size*dpr); canvas.height=Math.round(size*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    radius=Math.max(10,size/2-3); cx=size/2; cy=size/2;
  }
  function buildWheel(highlight){
    var dpr=Math.min(window.devicePixelRatio||1,2.5);
    off.width=canvas.width; off.height=canvas.height;
    offx.setTransform(dpr,0,0,dpr,0,0);
    var total=totalW(), cursor=-Math.PI/2;
    segs=[];
    var fontPx=Math.max(15,Math.round(cx*2*0.055));
    offx.font='900 '+fontPx+'px "ZCOOL KuaiLe","PingFang SC","Microsoft YaHei",sans-serif';
    offx.textAlign='center'; offx.textBaseline='middle';
    for(var i=0;i<opts.length;i++){
      var ang=(opts[i].w/total)*Math.PI*2;
      var start=cursor, end=cursor+ang;
      segs.push({start:start,end:end,idx:i});
      var col=PALETTE[i%PALETTE.length];
      if(highlight===i) col=lighten(col,0.18);
      offx.beginPath(); offx.moveTo(cx,cy); offx.arc(cx,cy,radius,start,end); offx.closePath();
      offx.fillStyle=col; offx.fill();
      offx.strokeStyle='rgba(255,255,255,.9)'; offx.lineWidth=2.5;
      offx.beginPath(); offx.moveTo(cx,cy); offx.lineTo(cx+radius*Math.cos(start),cy+radius*Math.sin(start)); offx.stroke();
      var mid=start+ang/2;
      var norm=((mid%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
      offx.save(); offx.translate(cx,cy); offx.rotate(mid);
      var dist=radius*0.52, flip=(norm>Math.PI/2&&norm<Math.PI*3/2);
      if(flip){ offx.rotate(Math.PI); dist=-dist; }
      var txt=opts[i].v+'分';
      offx.strokeStyle='rgba(255,255,255,.92)'; offx.lineWidth=fontPx*0.3; offx.lineJoin='round';
      offx.strokeText(txt,dist,0);
      offx.fillStyle='#5b3a2a'; offx.fillText(txt,dist,0);
      offx.restore();
      cursor=end;
    }
    offx.beginPath(); offx.arc(cx,cy,radius,0,Math.PI*2); offx.strokeStyle='#fff'; offx.lineWidth=6; offx.stroke();
    offx.beginPath(); offx.arc(cx,cy,radius*0.88,0,Math.PI*2); offx.strokeStyle='rgba(255,255,255,.5)'; offx.lineWidth=3; offx.stroke();
    var lamps=opts.length*2, lr=radius*0.965;
    for(var k=0;k<lamps;k++){
      var la=-Math.PI/2+(k+0.5)*(Math.PI*2/lamps);
      offx.beginPath(); offx.arc(cx+lr*Math.cos(la),cy+lr*Math.sin(la),Math.max(2.5,cx*0.008),0,Math.PI*2);
      offx.fillStyle=k%2?'#fff':'rgba(255,255,255,.55)'; offx.fill();
    }
  }
  function lighten(hex,amt){ var c=hex.replace('#',''); var r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16); r=Math.round(r+(255-r)*amt); g=Math.round(g+(255-g)*amt); b=Math.round(b+(255-b)*amt); return 'rgb('+r+','+g+','+b+')'; }
  function draw(ang){ ctx.clearRect(0,0,cx*2,cy*2); ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang); ctx.drawImage(off,-cx,-cy,cx*2,cy*2); ctx.restore(); }

  function pickIndex(){ var total=totalW(), r=Math.random()*total, acc=0; for(var i=0;i<opts.length;i++){ acc+=opts[i].w; if(r<acc) return i; } return opts.length-1; }
  var rafId=null;
  function spin(){
    if(spinning) return;
    resetTodayIfNeeded();
    if(!today.allowed){ updateStatus(); return; }
    if(today.drawCount >= maxDraws){ updateStatus(); return; }
    baoLog('spin', '开始抽奖', { draw: today.drawCount, max: maxDraws });
    ensureAudio();
    var target=pickIndex();
    var mid=segs[target].start+(segs[target].end-segs[target].start)/2;
    var need=(((-Math.PI/2-mid)%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);
    var full=((angle%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);
    var delta=((need-full)+(Math.PI*2))%(Math.PI*2);
    var final=angle+(4+Math.floor(Math.random()*3))*Math.PI*2+delta;
    var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){ angle=final; draw(final); finish(target); return; }
    spinning=true; var btn=document.getElementById('spinBtn'); btn.disabled=true;
    
    // 动态获取动画时长
    var dur = 4600;
    if(spinSpeed === 'fastest') dur = 1000;
    if(spinSpeed === 'fast') dur = 2000;
    if(spinSpeed === 'slow') dur = 7000;
    if(spinSpeed === 'slowest') dur = 10000;
    
    var startT=performance.now(), startAngle=angle, lastIndex=-1;
    cancelAnimationFrame(rafId);
    function frame(now){
      var p=Math.min(1,(now-startT)/dur), e=1-Math.pow(2,-10*p);
      angle=startAngle+(final-startAngle)*e; draw(angle);
      var count=Math.floor((angle-startAngle)/(Math.PI*2/opts.length));
      if(count!==lastIndex){ lastIndex=count; if(soundOn)tickSound(count); }
      if(p<1){ rafId=requestAnimationFrame(frame); }
      else{ angle=final; spinning=false; btn.disabled=true; buildWheel(target); draw(final); finish(target); }
    }
    rafId=requestAnimationFrame(frame);
  }

  function finish(target){
    winSound(); confetti();
    var v=opts[target].v;
    totalPoints+=v;
    today.drawCount = (today.drawCount||0) + 1;
    today.got = (today.got||0) + v;
    today.drawn = true;
    var photos = (today.photos || []).slice(0, MAX_PHOTOS);
    hist.unshift({
      d: todayStr().slice(5),
      p: v,
      full: todayStr(),
      note: todayNote,
      photos: photos
    });
    if(hist.length>100)hist=hist.slice(0,100);

    today.photos = [];
    pendingPhotos = [];
    baoLog('spin', '抽奖完成', { v: v, pts: totalPoints, draw: today.drawCount });
    saveCloud();
    var ptsBox = document.getElementById('ptsBox');
    refreshPointsDisplay();
    ptsBox.classList.remove('pop'); void ptsBox.offsetWidth; ptsBox.classList.add('pop');
    document.getElementById('result').innerHTML='今天抽到 <span class="prize">+'+v+' 分</span>，真棒！';
    document.getElementById('prizePts').textContent='+'+v;
    document.getElementById('prizeSub').textContent='分，攒进积分罐啦（现有 '+totalPoints+' 分）';
    refreshNameDisplay();
    document.getElementById('prizePop').classList.add('show');
    renderHist(); updateStatus();
    setTimeout(function(){ buildWheel(-1); draw(angle); },900);
    updateExchangeBtn();
  }

  function confetti(){
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(var i=0;i<44;i++){ var c=document.createElement('div'); c.className='confetti'; var s=6+Math.random()*8; c.style.cssText='left:'+(Math.random()*100)+'vw;width:'+s+'px;height:'+(s*(Math.random()>.5?1:1.6))+'px;background:'+PALETTE[i%PALETTE.length]+';border-radius:'+(Math.random()>.5?'50%':'3px')+';animation-duration:'+(2.2+Math.random()*2)+'s;animation-delay:'+(Math.random()*0.5)+'s;opacity:.9;'; document.body.appendChild(c); (function(el){ setTimeout(function(){el.remove();},5200); })(c); }
  }

  function updateStatus(){
    resetTodayIfNeeded();
    var box=document.getElementById('statusBox'), txt=document.getElementById('statusText'), btn=document.getElementById('spinBtn');
    box.classList.remove('lock','ok','done');
    if(!today.allowed){
      box.classList.add('lock');
      txt.textContent='今天还没有确认表现，等爸爸妈妈点头才能抽哦';
      btn.disabled=true;
      document.getElementById('result').innerHTML='先让爸爸妈妈确认今天的表现哦';
    } else if(today.drawCount >= maxDraws){
      box.classList.add('done');
      txt.textContent='今天已经抽满 '+maxDraws+' 次啦，明天再加油！';
      btn.disabled=true;
      document.getElementById('result').innerHTML='今天抽满啦，明天再来～';
    } else {
      box.classList.add('ok');
      txt.textContent='今天表现很棒！还可以抽 '+(maxDraws-today.drawCount)+' 次';
      btn.disabled=false;
      document.getElementById('result').innerHTML='准备好，抽今天的积分！';
    }
    updateExchangeBtn();
  }

  function updateExchangeBtn(){
    var exBtn = document.getElementById('exchangeBtn');
    var canAny = rewards.some(function(r){ return totalPoints >= r.cost; });
    exBtn.disabled = !canAny;
  }

  function renderRwList(){
    var box = document.getElementById('rwList');
    if(!rewards.length){
      box.innerHTML = '<div class="empty" style="text-align:center;">还没有设置奖励，去「设置 → 奖励选项」里添加吧</div>';
      return;
    }
    box.innerHTML = rewards.map(function(r, i){
      var can = totalPoints >= r.cost;
      return '<div class="rwitem'+(can?'':' disabled')+'" data-idx="'+i+'">'+
        '<span class="nm">'+escapeHtml(r.name)+'</span>'+
        '<span class="cost">'+r.cost+' 分</span>'+
      '</div>';
    }).join('');
    box.querySelectorAll('.rwitem').forEach(function(el){
      el.addEventListener('click', function(){
        if(el.classList.contains('disabled')) return;
        var idx = parseInt(el.dataset.idx);
        openExConfirm(idx);
      });
    });
  }


  var pendingExIdx = -1;
  function openExConfirm(idx){
    var r = rewards[idx];
    if(!r) return;
    pendingExIdx = idx;
    document.getElementById('exConfirmQ').innerHTML = '确定要消耗 <strong>'+r.cost+'分</strong> 兑换<br>「'+escapeHtml(r.name)+'」吗？';
    document.getElementById('exchangeOv').classList.remove('show');
    document.getElementById('exConfirmOv').classList.add('show');
  }
  function doExchange(){
    var idx = pendingExIdx;
    var r = rewards[idx];
    if(!r || totalPoints < r.cost) return;
    totalPoints -= r.cost;
    // 修复：full 只存日期，不存名字
    hist.unshift({d:todayStr().slice(5), p:-r.cost, full:todayStr(), name:r.name});
    if(hist.length>100)hist=hist.slice(0,100);
    saveCloud();
    refreshPointsDisplay();
    document.getElementById('result').innerHTML = '🎉 成功兑换「'+escapeHtml(r.name)+'」！<span class="prize">-'+r.cost+'分</span>';
    renderHist();
    updateStatus();
    updateExchangeBtn();
    ensureAudio();
    exchangeSound();
    document.getElementById('exConfirmOv').classList.remove('show');
    pendingExIdx = -1;
  }

  var currentTab = 'earn';

  function groupHistByDay(list){
    var map = {};
    var order = [];
    list.forEach(function(h){
      var key = h.full || h.d || '';
      if(!map[key]){
        map[key] = {date:key, items:[], totalP:0, count:0, note:'', photos:[], isExchange: h.p<0, name: h.name||'', names:[]};
        order.push(key);
      }
      map[key].items.push(h);
      map[key].totalP += h.p;
      map[key].count += 1;
      if(h.note && !map[key].note) map[key].note = h.note;
      if(h.photos && h.photos.length){
        map[key].photos = map[key].photos.concat(h.photos);
      }
      if(h.p<0){
        var exName = h.name || '兑换';
        if(map[key].names.indexOf(exName) === -1) map[key].names.push(exName);
      }
    });
    return order.map(function(k){ return map[k]; });
  }

  var currentGroups = [];

  function renderHist(){
    var box=document.getElementById('histList');
    box.classList.toggle('exchange-list', currentTab==='exchange');
    var list = hist.filter(function(h){ return currentTab==='earn' ? h.p>=0 : h.p<0; });
    if(!list.length){
      currentGroups = [];
      box.innerHTML = '<span class="empty">'+(currentTab==='earn'?'还没有攒分记录哦':'还没有兑换记录哦')+'</span>';
      return;
    }
    var groups = groupHistByDay(list);
    currentGroups = groups;
    box.innerHTML = groups.map(function(g, gi){
      var dateStr = g.date;
      var noteHtml = g.note ? '<span class="note">📝 '+escapeHtml(g.note)+'</span>' : '';
      var photosHtml = '';
      if(g.photos && g.photos.length){
        photosHtml = '<span class="thumbs">' + g.photos.map(function(p){
          var url = (typeof p === 'string') ? p : (p.url || '');
          return '<img src="'+url+'" data-url="'+url+'" alt="照片">';
        }).join('') + '</span>';
      }
      if(g.isExchange){
        var exNames = g.names && g.names.length ? g.names : [g.name || '兑换'];
        var exCountTxt = g.count>1 ? ('共'+g.count+'次') : '1次';
        var exTitle = exNames.slice(0,3).join('、');
        var exMoreTxt = exNames.length>3 ? (' 等'+exNames.length+'种') : '';
        return '<span class="chip exchange clickable" data-gi="'+gi+'">'+
          '<span>'+dateStr+'</span>'+
          '<span class="ex-name">'+escapeHtml(exTitle)+escapeHtml(exMoreTxt)+'</span>'+
          '<span class="ex-sub">'+exCountTxt + ' · ' + g.totalP + '分</span>'+
          noteHtml+
        '</span>';
      } else {
        var cntTxt = g.count>1 ? ('共'+g.count+'次 ') : '';
        return '<span class="chip clickable" data-gi="'+gi+'">'+dateStr+' · '+cntTxt+'+'+g.totalP+'分'+
          noteHtml+photosHtml+
        '</span>';
      }
    }).join('');
    box.querySelectorAll('.thumbs img').forEach(function(img){
      img.addEventListener('click', function(e){
        e.stopPropagation();
        openViewer(img.dataset.url);
      });
    });
    box.querySelectorAll('.chip.clickable').forEach(function(chip){
      chip.addEventListener('click', function(e){
        if(e.target.tagName === 'IMG') return;
        var gi = parseInt(chip.dataset.gi);
        openHistDetail(currentGroups[gi]);
      });
    });
  }

  function openHistDetail(group){
    if(!group) return;
    var isExchange = group.isExchange === true;
    document.getElementById('hdTitle').textContent = group.date + ' 的详情';
    document.getElementById('hdSummary').innerHTML = isExchange
      ? '共兑换 <b>'+group.count+'</b> 次，合计 <b>'+group.totalP+'</b> 分'
      : '共抽 <b>'+group.count+'</b> 次，合计 <b>+'+group.totalP+'</b> 分';

    var listEl = document.getElementById('hdList');
    if(!group.items.length){
      listEl.innerHTML = '<div class="empty">没有记录</div>';
    } else {
      listEl.innerHTML = group.items.map(function(h, i){
        var note = h.note ? ('<div class="hd-note">📝 '+escapeHtml(h.note)+'</div>') : '';
        var photos = '';
        if(h.photos && h.photos.length){
          photos = '<div class="hd-photos">'+h.photos.map(function(p){
            var url = (typeof p === 'string') ? p : (p.url || '');
            return '<img src="'+url+'" data-url="'+url+'" alt="照片">';
          }).join('')+'</div>';
        }
        var exchangeName = isExchange ? ('<div class="hd-name">🎁 '+escapeHtml(h.name||'兑换')+'</div>') : '';
        return '<div class="hd-item">'+
          '<div class="hd-top">'+
            '<span class="hd-idx">第 '+(group.items.length - i)+' 次</span>'+
            '<span class="hd-p">'+(isExchange ? h.p : '+'+h.p)+' 分</span>'+
          '</div>'+
          exchangeName+
          note+
          photos+
        '</div>';
      }).join('');
      listEl.querySelectorAll('.hd-photos img').forEach(function(img){
        img.addEventListener('click', function(){
          openViewer(img.dataset.url);
        });
      });
    }

    document.getElementById('histDetailOv').classList.add('show');
  }

  document.getElementById('hdClose').addEventListener('click', function(){
    document.getElementById('histDetailOv').classList.remove('show');
  });
  document.getElementById('histDetailOv').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('show');
  });

  document.querySelectorAll('.hist-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.hist-tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderHist();
    });
  });

  var viewer = document.getElementById('viewer');
  var viewerImg = document.getElementById('viewerImg');
  function openViewer(url){
    if(!url) return;
    viewerImg.src = url;
    viewer.classList.add('show');
  }
  document.getElementById('viewerClose').addEventListener('click', function(){
    viewer.classList.remove('show');
    viewerImg.src = '';
  });
  viewer.addEventListener('click', function(e){
    if(e.target === this){
      viewer.classList.remove('show');
      viewerImg.src = '';
    }
  });

  var saveConfirmAnswer = 0;
  var saveConfirmCallback = null;

  function askSaveConfirm(cb){
    var a = 1 + Math.floor(Math.random()*9);
    var b = 1 + Math.floor(Math.random()*9);
    saveConfirmAnswer = a + b;
    saveConfirmCallback = cb;
    document.getElementById('saveConfirmEq').textContent = a + ' + ' + b + ' = ?';
    document.getElementById('saveConfirmInput').value = '';
    document.getElementById('saveConfirmErr').textContent = '';
    document.getElementById('saveConfirmOv').classList.add('show');
    setTimeout(function(){ document.getElementById('saveConfirmInput').focus(); }, 100);
  }
  document.getElementById('saveConfirmYes').addEventListener('click', function(){
    var v = parseInt(document.getElementById('saveConfirmInput').value);
    if(v === saveConfirmAnswer){
      document.getElementById('saveConfirmOv').classList.remove('show');
      var cb = saveConfirmCallback;
      saveConfirmCallback = null;
      if(typeof cb === 'function') cb();
    } else {
      document.getElementById('saveConfirmErr').textContent = '答案不对，再试试';
      document.getElementById('saveConfirmInput').value = '';
      document.getElementById('saveConfirmInput').focus();
    }
  });
  document.getElementById('saveConfirmNo').addEventListener('click', function(){
    document.getElementById('saveConfirmOv').classList.remove('show');
    saveConfirmCallback = null;
  });
  document.getElementById('saveConfirmInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('saveConfirmYes').click();
  });
  document.getElementById('saveConfirmOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); saveConfirmCallback = null; }
  });

  function resetPoints(){
    document.getElementById('resetPwInput').value = '';
    document.getElementById('resetPwErr').textContent = '';
    document.getElementById('resetPwOv').classList.add('show');
    setTimeout(function(){ document.getElementById('resetPwInput').focus(); }, 100);
  }

  function doResetPoints(){
    deleteAllPhotos().then(function(){
      totalPoints = 0;
      hist = [];
      today = {date:todayStr(), allowed:false, drawn:false, got:0, photos:[], drawCount:0};
      todayNote = '';

      if(user){
        if(saveTimer) clearTimeout(saveTimer);
        sb.from('scores').upsert({
          user_id: user.id,
          total_points: 0,
          history: [],
          today: today,
          today_note: '',
          rewards: rewards,
          opts: opts,
          max_draws: maxDraws,
          updated_at: new Date().toISOString()
        }).then(function(res){
          if(res.error) console.warn('清零保存失败', res.error);
        });
      }

      pendingPhotos = [];
      saveLocalCache();
      renderPhotoPreview();
      document.getElementById('totalPts').textContent = '0';
      document.getElementById('result').innerHTML = '积分已清零，重新开始攒分吧！';
      renderHist();
      updateStatus();
      updateExchangeBtn();
      ensureAudio();
      beep(660,0.1,'triangle',0.2);
      beep(440,0.15,'triangle',0.2,0.12);
      document.getElementById('resetPwOv').classList.remove('show');
    });
  }

  document.getElementById('resetPwYes').addEventListener('click', function(){
    var pw = (document.getElementById('resetPwInput').value || '').trim();
    if(!pw){ document.getElementById('resetPwErr').textContent = '请输入密码'; return; }
    if(!user || !user.email){ document.getElementById('resetPwErr').textContent = '登录状态异常，请刷新页面'; return; }

    var btn = this;
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '验证中…';
    document.getElementById('resetPwErr').textContent = '';

    sb.auth.signInWithPassword({ email: user.email, password: pw })
      .then(function(res){
        btn.disabled = false;
        btn.textContent = oldText;
        if(res.error){
          document.getElementById('resetPwErr').textContent = '密码不对，再试试～';
          document.getElementById('resetPwInput').value = '';
          document.getElementById('resetPwInput').focus();
          return;
        }
        doResetPoints();
      })
      .catch(function(){
        btn.disabled = false;
        btn.textContent = oldText;
        document.getElementById('resetPwErr').textContent = '网络错误，请重试';
      });
  });
  document.getElementById('resetPwNo').addEventListener('click', function(){
    document.getElementById('resetPwOv').classList.remove('show');
  });
  document.getElementById('resetPwInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('resetPwYes').click();
  });
  document.getElementById('resetPwOv').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('show');
  });

  function openChangePw(){
    document.getElementById('oldPwInput').value = '';
    document.getElementById('newPwInput').value = '';
    document.getElementById('newPw2Input').value = '';
    document.getElementById('changePwErr').textContent = '';
    document.getElementById('changePwOv').classList.add('show');
    setTimeout(function(){ document.getElementById('oldPwInput').focus(); }, 100);
  }
  document.getElementById('changePwBtn').addEventListener('click', openChangePw);
  document.getElementById('changePwNo').addEventListener('click', function(){
    document.getElementById('changePwOv').classList.remove('show');
  });
  document.getElementById('changePwOv').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('show');
  });
  document.getElementById('changePwYes').addEventListener('click', function(){
    var oldPw = (document.getElementById('oldPwInput').value || '').trim();
    var newPw = (document.getElementById('newPwInput').value || '').trim();
    var newPw2 = (document.getElementById('newPw2Input').value || '').trim();
    var errEl = document.getElementById('changePwErr');

    if(!oldPw){ errEl.textContent = '请输入旧密码'; return; }
    if(!newPw){ errEl.textContent = '请输入新密码'; return; }
    if(newPw !== newPw2){ errEl.textContent = '两次新密码不一致'; return; }
    if(newPw === oldPw){ errEl.textContent = '新密码不能和旧密码一样'; return; }
    if(!user || !user.email){ errEl.textContent = '登录状态异常，请刷新页面'; return; }

    var btn = this;
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '验证中…';
    errEl.textContent = '';

    sb.auth.signInWithPassword({ email: user.email, password: oldPw })
      .then(function(res){
        if(res.error) throw new Error('旧密码不对');
        return sb.auth.updateUser({ password: newPw });
      })
      .then(function(res){
        btn.disabled = false;
        btn.textContent = oldText;
        if(res.error) throw res.error;
        document.getElementById('changePwOv').classList.remove('show');
        alert('✅ 密码修改成功！下次请用新密码登录。');
      })
      .catch(function(err){
        btn.disabled = false;
        btn.textContent = oldText;
        errEl.textContent = (err && err.message) || '修改失败，请重试';
      });
  });
  ['oldPwInput','newPwInput','newPw2Input'].forEach(function(id){
    document.getElementById(id).addEventListener('keydown', function(e){
      if(e.key === 'Enter') document.getElementById('changePwYes').click();
    });
  });

  function openSet(){
    refreshMenuValues();
    document.getElementById('setOv').classList.add('show');
  }
  function closeSet(){ document.getElementById('setOv').classList.remove('show'); }
  document.getElementById('setBtn').addEventListener('click', openSet);
  document.getElementById('cancelBtn').addEventListener('click', closeSet);
  document.getElementById('setOv').addEventListener('click', function(e){ if(e.target === this) closeSet(); });

  document.getElementById('mBabyName').addEventListener('click', function(){
    closeSet();
    document.getElementById('babyNameSetInput').value = babyName || '';
    document.getElementById('babyNameSetErr').textContent = '';
    document.getElementById('babyNameSetOv').classList.add('show');
    setTimeout(function(){ document.getElementById('babyNameSetInput').focus(); }, 100);
  });
  document.getElementById('mAccount').addEventListener('click', function(){
    closeSet();
    document.getElementById('loginIdInput').value = loginId || '';
    document.getElementById('emailDisplay').textContent = accountEmail || (user && user.email) || '—';
    document.getElementById('accountErr').textContent = '';
    document.getElementById('accountOv').classList.add('show');
  });
  document.getElementById('mDrawLimit').addEventListener('click', function(){
    closeSet();
    document.getElementById('drawLimitInput').value = maxDraws;
    document.getElementById('drawLimitErr').textContent = '';
    document.getElementById('drawLimitOv').classList.add('show');
  });
  
  // 转盘速度设置
  document.getElementById('mSpinSpeed').addEventListener('click', function(){
    closeSet();
    document.getElementById('spinSpeedOv').classList.add('show');
  });
  document.getElementById('spinSpeedBack').addEventListener('click', function(){
    document.getElementById('spinSpeedOv').classList.remove('show');
    openSet();
  });
  document.getElementById('spinSpeedOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.querySelectorAll('#spinSpeedOv .mitem').forEach(function(btn){
    btn.addEventListener('click', function(){
      var speed = btn.dataset.speed;
      askSaveConfirm(function(){
        spinSpeed = speed;
        saveCloud();
        refreshMenuValues();
        document.getElementById('spinSpeedOv').classList.remove('show');
        openSet();
      });
    });
  });

  // 注销账号
  document.getElementById('mDeleteAccount').addEventListener('click', function(){
    closeSet();
    document.getElementById('deleteAccountPw').value = '';
    document.getElementById('deleteAccountErr').textContent = '';
    document.getElementById('deleteAccountOv').classList.add('show');
    setTimeout(function(){ document.getElementById('deleteAccountPw').focus(); }, 100);
  });
  document.getElementById('deleteAccountNo').addEventListener('click', function(){
    document.getElementById('deleteAccountOv').classList.remove('show');
  });
  document.getElementById('deleteAccountOv').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('show');
  });
  document.getElementById('deleteAccountYes').addEventListener('click', function(){
    var pw = (document.getElementById('deleteAccountPw').value || '').trim();
    if(!pw){ document.getElementById('deleteAccountErr').textContent = '请输入密码'; return; }
    if(!user || !user.email){ document.getElementById('deleteAccountErr').textContent = '登录状态异常'; return; }

    var btn = this;
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '验证中…';
    document.getElementById('deleteAccountErr').textContent = '';

    sb.auth.signInWithPassword({ email: user.email, password: pw })
      .then(function(res){
        if(res.error) throw new Error('密码不对');
        
        // 注销逻辑（软删除）
        return sb.from('profiles').update({ 
          is_deleted: true, 
          email: 'deleted_' + Date.now() + '@fake.com',
          login_id: null
        }).eq('user_id', user.id);
      })
      .then(function(res){
        if(res && res.error) throw res.error;
        alert('账号已成功注销，再见！');
        sb.auth.signOut().then(function(){ location.reload(); });
      })
      .catch(function(err){
        btn.disabled = false;
        btn.textContent = oldText;
        document.getElementById('deleteAccountErr').textContent = (err && err.message) || '注销失败，请重试';
      });
  });
  document.getElementById('deleteAccountPw').addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('deleteAccountYes').click();
  });

  document.getElementById('mPoints').addEventListener('click', function(){
    closeSet();
    setTab = 'points';
    renderOpts();
    document.getElementById('pointsOv').classList.add('show');
  });
  document.getElementById('mRewards').addEventListener('click', function(){
    closeSet();
    setTab = 'rewards';
    renderOpts();
    document.getElementById('rewardsOv').classList.add('show');
  });
  document.getElementById('mSwitch').addEventListener('click', function(){
    closeSet();
    var list = loadRecent().filter(function(x){ return x.account !== (user && user.email); });
    var listEl = document.getElementById('switchList');
    if(!list.length){
      listEl.innerHTML = '<div class="vip-empty" style="padding:20px 0;">还没有其他登录过的账号<br><span style="font-size:12px;">在其他账号登录过后，会出现在这里</span></div>';
    } else {
      listEl.innerHTML = list.map(function(item, i){
        return '<button class="recent-item" data-i="'+i+'">'+
          '<span class="rico">👤</span>'+
          '<span class="rtxt">'+escapeHtml(item.label || item.account)+'</span>'+
          '<span class="rarrow">›</span>'+
        '</button>';
      }).join('');
      listEl.querySelectorAll('.recent-item').forEach(function(btn){
        btn.addEventListener('click', function(){
          var item = list[parseInt(btn.dataset.i)];
          if(!item) return;
          if(!confirm('确定切换到「'+ (item.label || item.account) +'」吗？')) return;
          switchAccount(item.account);
        });
      });
    }
    document.getElementById('switchOv').classList.add('show');
  });
  document.getElementById('mAbout').addEventListener('click', function(){
    closeSet();
    document.getElementById('aboutVer').textContent = APP_VERSION;
    document.getElementById('aboutDate').textContent = APP_DATE;
    
    // 计算注册天数和活跃天数
    var regDays = 1;
    if (user && user.created_at) {
      var regDate = new Date(user.created_at);
      var diffDays = Math.ceil(Math.abs(new Date() - regDate) / (1000 * 60 * 60 * 24));
      regDays = diffDays > 0 ? diffDays : 1;
    }
    
    var activeDates = new Set();
    hist.forEach(function(h) {
      if (h.full) activeDates.add(h.full);
    });
    if (activeDates.size === 0) activeDates.add(todayStr());
    var activeDays = activeDates.size;
    
    // 防穿越兜底
    if (activeDays > regDays) {
      activeDays = regDays;
    }

    document.getElementById('aboutDaysRegistered').textContent = regDays;
    document.getElementById('aboutDaysActive').textContent = activeDays;

    document.getElementById('aboutOv').classList.add('show');
  });

  document.getElementById('switchBack').addEventListener('click', function(){
    document.getElementById('switchOv').classList.remove('show');
    openSet();
  });
  document.getElementById('switchOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });

  function switchAccount(account){
    try { localStorage.setItem('bao_switch_to', account); } catch(e){}
    if(saveTimer) clearTimeout(saveTimer);
    sb.auth.signOut().then(function(){ location.reload(); }).catch(function(){ location.reload(); });
  }

  document.getElementById('babyNameSetBack').addEventListener('click', function(){
    document.getElementById('babyNameSetOv').classList.remove('show');
    openSet();
  });
  document.getElementById('babyNameSetOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('babyNameSetSave').addEventListener('click', function(){
    var n = (document.getElementById('babyNameSetInput').value || '').trim();
    if(!n){ document.getElementById('babyNameSetErr').textContent = '请输入宝贝的名字'; return; }
    if(n.length > 12) n = n.slice(0, 12);
    var errEl = document.getElementById('babyNameSetErr');
    errEl.textContent = '';
    askSaveConfirm(function(){
      babyName = n;
      refreshNameDisplay();
      saveProfile().then(function(res){
        if(res && res.error){ errEl.textContent = '保存失败，请重试'; return; }
        document.getElementById('babyNameSetOv').classList.remove('show');
        openSet();
      }).catch(function(){
        errEl.textContent = '网络错误，请重试';
      });
    });
  });
  document.getElementById('babyNameSetInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('babyNameSetSave').click();
  });

  document.getElementById('accountBack').addEventListener('click', function(){
    document.getElementById('accountOv').classList.remove('show');
    openSet();
  });
  document.getElementById('accountOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('accountSave').addEventListener('click', function(){
    var newId = (document.getElementById('loginIdInput').value || '').trim().toLowerCase();
    var errEl = document.getElementById('accountErr');
    if(newId && !LOGIN_ID_RE.test(newId)){
      errEl.textContent = '唯一号 3~20 位，只能用字母、数字、下划线';
      return;
    }
    if(newId === (loginId || '')){
      document.getElementById('accountOv').classList.remove('show');
      openSet();
      return;
    }
    errEl.textContent = '';
    askSaveConfirm(function(){
      var doSave = function(){
        loginId = newId;
        saveProfile().then(function(res){
          if(res && res.error){ errEl.textContent = '保存失败，请重试'; return; }
          document.getElementById('accountOv').classList.remove('show');
          openSet();
        }).catch(function(){
          errEl.textContent = '网络错误，请重试';
        });
      };
      if(newId){
        sb.from('profiles').select('user_id').eq('login_id', newId).maybeSingle()
          .then(function(res){
            if(res.data && res.data.user_id !== user.id){
              errEl.textContent = '这个唯一号已经被用了，换一个吧';
              return;
            }
            doSave();
          })
          .catch(function(){ errEl.textContent = '网络错误，请重试'; });
      } else {
        doSave();
      }
    });
  });

  document.getElementById('drawLimitBack').addEventListener('click', function(){
    document.getElementById('drawLimitOv').classList.remove('show');
    openSet();
  });
  document.getElementById('drawLimitOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('drawLimitSave').addEventListener('click', function(){
    var v = parseInt(document.getElementById('drawLimitInput').value);
    if(!v || v<1 || v>99){
      document.getElementById('drawLimitErr').textContent = '请输入 1~99 之间的整数';
      return;
    }
    var errEl = document.getElementById('drawLimitErr');
    errEl.textContent = '';
    askSaveConfirm(function(){
      maxDraws = v;
      saveCloud();
      document.getElementById('drawLimitOv').classList.remove('show');
      openSet();
      updateStatus();
    });
  });

  document.getElementById('pointsBack').addEventListener('click', function(){
    document.getElementById('pointsOv').classList.remove('show');
    openSet();
  });
  document.getElementById('pointsOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('pointsSave').addEventListener('click', function(){
    var clean=[];
    opts.forEach(function(o){ var v=parseInt(o.v)||0, w=parseInt(o.w)||1; if(v>0&&w>0) clean.push({v:v,w:w}); });
    if(clean.length<2){ alert('至少要有两档'); return; }
    if(clean.length>10) clean=clean.slice(0,10);
    askSaveConfirm(function(){
      opts=clean;
      setupCanvas(); buildWheel(-1); draw(angle);
      saveCloud();
      document.getElementById('pointsOv').classList.remove('show');
      openSet();
    });
  });

  document.getElementById('rewardsBack').addEventListener('click', function(){
    document.getElementById('rewardsOv').classList.remove('show');
    openSet();
  });
  document.getElementById('rewardsOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('rewardsSave').addEventListener('click', function(){
    var cleanR=[];
    rewards.forEach(function(r){ var name=(r.name||'').trim(); var cost=parseInt(r.cost)||0; if(name && cost>0) cleanR.push({name:name, cost:cost}); });
    if(cleanR.length>20) cleanR=cleanR.slice(0,20);
    askSaveConfirm(function(){
      rewards=cleanR;
      saveCloud();
      updateExchangeBtn();
      document.getElementById('rewardsOv').classList.remove('show');
      openSet();
    });
  });

  document.getElementById('aboutBack').addEventListener('click', function(){
    document.getElementById('aboutOv').classList.remove('show');
    openSet();
  });

  function openDiag(){
    document.getElementById('diagText').textContent = baoLogText() || '（暂无日志）';
    document.getElementById('diagOv').classList.add('show');
  }
  document.getElementById('mDiag').addEventListener('click', function(){ closeSet(); openDiag(); });
  document.getElementById('diagBack').addEventListener('click', function(){
    document.getElementById('diagOv').classList.remove('show');
    openSet();
  });
  document.getElementById('diagOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });
  document.getElementById('diagClear').addEventListener('click', function(){
    __baoLogs = [];
    try { localStorage.removeItem(DEBUG_LOG_KEY); } catch(e){}
    document.getElementById('diagText').textContent = '（已清空）';
  });
  document.getElementById('diagCopy').addEventListener('click', function(){
    var text = baoLogText();
    function fallback(){
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e){}
      ta.remove();
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(fallback);
    } else { fallback(); }
  });
  document.getElementById('aboutOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); openSet(); }
  });

  var setTab = 'points';
  function renderOpts(){
    var box=document.getElementById('opts');
    box.innerHTML='';
    opts.forEach(function(o,i){
      var row=document.createElement('div'); row.className='optrow';
      var dot=document.createElement('span'); dot.className='dot'; dot.style.background=PALETTE[i%PALETTE.length];
      var val=document.createElement('input'); val.className='val'; val.type='number'; val.min='1'; val.max='9999'; val.value=o.v;
      var w=document.createElement('input'); w.className='w'; w.type='number'; w.min='1'; w.max='9999'; w.value=o.w;
      w.setAttribute('aria-label','权重（越大越容易抽中）');
      var note=document.createElement('span'); note.className='note'; note.textContent='权重';
      var del=document.createElement('button'); del.className='del'; del.textContent='x';
      val.addEventListener('input',function(){ o.v=Math.max(1,Math.min(9999,parseInt(val.value)||1)); });
      w.addEventListener('input',function(){ o.w=Math.max(1,Math.min(9999,parseInt(w.value)||1)); });
      del.addEventListener('click',function(){ if(opts.length<=2)return; opts.splice(i,1); renderOpts(); });
      row.appendChild(dot); row.appendChild(val); row.appendChild(note); row.appendChild(w); row.appendChild(del);
      box.appendChild(row);
    });

    var boxR=document.getElementById('optsRw');
    boxR.innerHTML='';
    rewards.forEach(function(r,i){
      var row=document.createElement('div'); row.className='rwrow';
      var nm=document.createElement('input'); nm.className='nm'; nm.type='text'; nm.value=r.name; nm.placeholder='奖励名称，如：玩平板';
      var cost=document.createElement('input'); cost.className='cost'; cost.type='number'; cost.min='1'; cost.max='999999'; cost.value=r.cost;
      var del=document.createElement('button'); del.className='del'; del.textContent='x';
      nm.addEventListener('input',function(){ r.name = nm.value; });
      cost.addEventListener('input',function(){ r.cost = Math.max(1, Math.min(999999, parseInt(cost.value)||1)); });
      del.addEventListener('click',function(){ rewards.splice(i,1); renderOpts(); });
      row.appendChild(nm); row.appendChild(cost); row.appendChild(del);
      boxR.appendChild(row);
    });
    if(!rewards.length){
      boxR.innerHTML = '<div class="empty" style="text-align:center; padding:20px 0;">还没有奖励，点下面「加一个奖励」添加吧</div>';
    }
  }

  document.getElementById('addBtn').addEventListener('click',function(){
    if(opts.length>=10)return; opts.push({v:5,w:10});
    renderOpts();
  });
  document.getElementById('addRwBtn').addEventListener('click',function(){
    if(rewards.length>=20)return; rewards.push({name:'新奖励', cost:50});
    renderOpts();
  });

  function openBabyNameFirst(){
    document.getElementById('babyNameFirstInput').value = babyName || '';
    document.getElementById('babyNameFirstErr').textContent = '';
    document.getElementById('babyNameOv').classList.add('show');
    setTimeout(function(){ document.getElementById('babyNameFirstInput').focus(); }, 100);
  }
  document.getElementById('babyNameFirstYes').addEventListener('click', function(){
    var n = (document.getElementById('babyNameFirstInput').value || '').trim();
    if(!n){ document.getElementById('babyNameFirstErr').textContent = '请输入宝贝的名字'; return; }
    if(n.length > 12) n = n.slice(0, 12);
    babyName = n;
    refreshNameDisplay();
    var btn = this;
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '保存中…';
    saveProfile().then(function(res){
      btn.disabled = false;
      btn.textContent = oldText;
      if(res && res.error){
        document.getElementById('babyNameFirstErr').textContent = '保存失败，请重试';
        return;
      }
      document.getElementById('babyNameOv').classList.remove('show');
    }).catch(function(){
      btn.disabled = false;
      btn.textContent = oldText;
      document.getElementById('babyNameFirstErr').textContent = '网络错误，请重试';
    });
  });
  document.getElementById('babyNameFirstInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('babyNameFirstYes').click();
  });

  var verifyAnswer = 0;
  function openVerify(){
    var a = 1 + Math.floor(Math.random()*9);
    var b = 1 + Math.floor(Math.random()*9);
    verifyAnswer = a + b;
    document.getElementById('verifyQ').textContent = '请回答下面的问题：';
    document.getElementById('verifyEq').textContent = a + ' + ' + b + ' = ?';
    document.getElementById('verifyInput').value = '';
    document.getElementById('verifyErr').textContent = '';
    document.getElementById('verifyOv').classList.add('show');
    setTimeout(function(){ document.getElementById('verifyInput').focus(); }, 100);
  }
  function closeVerify(){ document.getElementById('verifyOv').classList.remove('show'); }
  function checkVerify(){
    var val = parseInt(document.getElementById('verifyInput').value);
    if(val === verifyAnswer){
      closeVerify();
      document.getElementById('noteInput').value = '';
      pendingPhotos = [];
      renderPhotoPreview();
      refreshNameDisplay();
      document.getElementById('confirmOv').classList.add('show');
    } else {
      document.getElementById('verifyErr').textContent = '答案不对，再试试～';
      document.getElementById('verifyInput').value = '';
      document.getElementById('verifyInput').focus();
    }
  }

  var captchaCode = '';
  var captchaChars = 'ABCDEFGHJKLMNPQRSTUVWXY23456789';
  function generateCaptcha(){
    captchaCode = '';
    for(var i=0;i<4;i++){ captchaCode += captchaChars.charAt(Math.floor(Math.random()*captchaChars.length)); }
    drawCaptcha();
  }
  function drawCaptcha(){
    var cv = document.getElementById('captchaCanvas');
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    c.fillStyle = '#f8f4ec';
    c.fillRect(0,0,W,H);
    for(var k=0;k<6;k++){
      c.strokeStyle = 'rgba('+Math.floor(Math.random()*180+60)+','+Math.floor(Math.random()*180+60)+','+Math.floor(Math.random()*180+60)+',0.6)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(Math.random()*W, Math.random()*H);
      c.lineTo(Math.random()*W, Math.random()*H);
      c.stroke();
    }
    for(var d=0;d<40;d++){
      c.fillStyle = 'rgba('+Math.floor(Math.random()*180+60)+','+Math.floor(Math.random()*180+60)+','+Math.floor(Math.random()*180+60)+',0.5)';
      c.beginPath();
      c.arc(Math.random()*W, Math.random()*H, 1.5, 0, Math.PI*2);
      c.fill();
    }
    for(var i=0;i<captchaCode.length;i++){
      c.save();
      var fs = 40 + Math.random()*10;
      c.font = '900 '+fs+'px "ZCOOL KuaiLe","PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      var x = (W/4)*(i+0.5) + (Math.random()-0.5)*8;
      var y = H/2 + (Math.random()-0.5)*10;
      c.translate(x,y);
      c.rotate((Math.random()-0.5)*0.5);
      c.fillStyle = 'rgb('+Math.floor(Math.random()*120+40)+','+Math.floor(Math.random()*120+40)+','+Math.floor(Math.random()*120+40)+')';
      c.fillText(captchaCode.charAt(i), 0, 0);
      c.restore();
    }
  }
  document.getElementById('captchaCanvas').addEventListener('click', generateCaptcha);

  document.getElementById('spinBtn').addEventListener('click',spin);
  document.getElementById('parentBtn').addEventListener('click',openVerify);
  document.getElementById('verifyYes').addEventListener('click',checkVerify);
  document.getElementById('verifyNo').addEventListener('click',closeVerify);
  document.getElementById('verifyInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter') checkVerify();
  });
  document.getElementById('verifyOv').addEventListener('click', function(e){ if(e.target===this) closeVerify(); });

  document.getElementById('photoBtn').addEventListener('click', function(){
    document.getElementById('photoInput').click();
  });
  document.getElementById('photoInput').addEventListener('change', function(e){
    var files = Array.from(e.target.files || []);
    e.target.value = '';
    if(!files.length) return;
    var room = MAX_PHOTOS - pendingPhotos.length;
    if(room <= 0){ alert('最多 '+MAX_PHOTOS+' 张照片'); return; }
    files = files.slice(0, room);

    var btn = document.getElementById('photoBtn');
    btn.disabled = true;
    var oldText = btn.textContent;
    var uploaded = 0, failed = 0;
    btn.textContent = '⏳ 上传中… 0/' + files.length;

    Promise.all(files.map(function(f){
      return uploadPhoto(f).then(function(res){
        uploaded++;
        btn.textContent = '⏳ 上传中… ' + uploaded + '/' + files.length;
        return res;
      }).catch(function(err){
        failed++;
        console.warn('照片上传失败', err);
        return null;
      });
    })).then(function(results){
      results.forEach(function(r){ if(r) pendingPhotos.push(r); });
      btn.disabled = false;
      btn.textContent = oldText;
      renderPhotoPreview();
      if(failed) alert('有 '+failed+' 张照片上传失败，请重试');
    });
  });

  document.getElementById('confirmYes').addEventListener('click',function(){
    today.allowed=true;
    todayNote = (document.getElementById('noteInput').value || '').trim();
    today.photos = pendingPhotos.slice(0, MAX_PHOTOS);
    saveCloud(); document.getElementById('confirmOv').classList.remove('show'); updateStatus();
  });
  document.getElementById('confirmNo').addEventListener('click',function(){
    today.allowed=false;
    todayNote = (document.getElementById('noteInput').value || '').trim();
    today.photos = pendingPhotos.slice(0, MAX_PHOTOS);
    saveCloud(); document.getElementById('confirmOv').classList.remove('show'); updateStatus();
  });
  document.getElementById('confirmOv').addEventListener('click',function(e){ if(e.target===this)this.classList.remove('show'); });

  document.getElementById('againBtn').addEventListener('click',function(){ document.getElementById('prizePop').classList.remove('show'); });
  document.getElementById('mResetPoints').addEventListener('click', function(){
    closeSet();
    resetPoints();
  });

  document.getElementById('exchangeBtn').addEventListener('click', function(){
    if(!rewards.length) { alert('还没有设置奖励，去「设置 → 奖励选项」里添加吧'); return; }
    if(!rewards.some(function(r){ return totalPoints >= r.cost; })) { alert('积分还不够兑换任何奖励哦，继续加油！'); return; }
    renderRwList();
    document.getElementById('exchangeOv').classList.add('show');
  });
  document.getElementById('exchangeNo').addEventListener('click', function(){
    document.getElementById('exchangeOv').classList.remove('show');
  });
  document.getElementById('exchangeOv').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('show');
  });

  document.getElementById('exConfirmYes').addEventListener('click', doExchange);
  document.getElementById('exConfirmNo').addEventListener('click', function(){
    document.getElementById('exConfirmOv').classList.remove('show');
    pendingExIdx = -1;
    document.getElementById('exchangeOv').classList.add('show');
  });
  document.getElementById('exConfirmOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); pendingExIdx = -1; }
  });

  var sbBtn=document.getElementById('soundBtn');
  function syncSound(){ document.getElementById('soundOn').style.display=soundOn?'block':'none'; document.getElementById('soundOff').style.display=soundOn?'none':'block'; sbBtn.setAttribute('aria-pressed',String(soundOn)); }
  sbBtn.addEventListener('click',function(){ soundOn=!soundOn; syncSound(); if(soundOn)ensureAudio(); });

  // ==================== 成语学习跳转 ====================
  function openSubPage(path){
    baoLog('nav', '跳转子页面', { path: path, pts: totalPoints, draw: today && today.drawCount });
    var done = false;
    var go = function(reason){ if(done) return; done = true; clearTimeout(timer); baoLog('nav', '离开首页（' + reason + '）', { path: path }); window.location.href = path; };
    var timer = setTimeout(function(){ go('超时'); }, 2500);
    saveCloud().then(function(res){ go(res && res.error ? '保存有错误' : '保存完成'); }, function(){ go('保存异常'); });
  }
  document.getElementById('idiomBtn').addEventListener('click', function(){
    // 跳转到 idioms.html，附带当前登录邮箱，方便新页面校验 session
    openSubPage('idioms.html');
  });
  document.getElementById('classicBtn').addEventListener('click', function(){
    openSubPage('classic.html');
  });
  document.getElementById('gameBtn').addEventListener('click', function(){
    openSubPage('games.html');
  });

  // ==================== VIP 后台 ====================
  var vipAllUsers = [];

  function vipLoadUsers(){
    var listEl = document.getElementById('vipList');
    listEl.innerHTML = '<div class="vip-empty">正在加载…</div>';
    return sb.from('profiles').select('*').then(function(pRes){
      if(pRes.error){
        listEl.innerHTML = '<div class="vip-empty">加载失败：'+escapeHtml(pRes.error.message)+'</div>';
        return;
      }
      var profiles = pRes.data || [];
      return sb.from('scores').select('*').then(function(sRes){
        var scores = (sRes.data || []);
        var scoreMap = {};
        scores.forEach(function(s){ scoreMap[s.user_id] = s; });
        
        // 【核心修改】过滤掉自己，并且过滤掉 is_deleted 为 true 的用户
        vipAllUsers = profiles
          .filter(function(p){ return p.user_id !== user.id && !p.is_deleted; })
          .map(function(p){
            var s = scoreMap[p.user_id] || {};
            return {
              user_id: p.user_id,
              login_id: p.login_id || '',
              baby_name: p.baby_name || '',
              email: p.email || '',
              is_vip: !!p.is_vip,
              total_points: s.total_points || 0,
              history: s.history || [],
              today: s.today || null,
              today_note: s.today_note || '',
              rewards: s.rewards || DEFAULT_REWARDS,
              opts: s.opts || DEFAULT_OPTS,
              max_draws: typeof s.max_draws === 'number' ? s.max_draws : DEFAULT_MAX_DRAWS,
              spin_speed: s.spin_speed || 'normal',
              updated_at: p.updated_at || s.updated_at || ''
            };
          });
        var st = document.getElementById('vipSubtitle');
        if(st) st.textContent = '共 ' + vipAllUsers.length + ' 位用户';
        vipRenderList();
      });
    });
  }

  function vipRenderList(){
    var listEl = document.getElementById('vipList');
    var kw = (document.getElementById('vipSearchInput').value || '').trim().toLowerCase();
    var list = vipAllUsers.filter(function(u){
      if(!kw) return true;
      return (u.baby_name||'').toLowerCase().indexOf(kw) !== -1
        || (u.login_id||'').toLowerCase().indexOf(kw) !== -1
        || (u.email||'').toLowerCase().indexOf(kw) !== -1;
    });
    if(!list.length){
      listEl.innerHTML = '<div class="vip-empty">没有找到用户</div>';
      return;
    }
    listEl.innerHTML = list.map(function(u, i){
      var initial = (u.baby_name || u.login_id || '?').charAt(0);
      var sub = [];
      if(u.login_id) sub.push('@'+escapeHtml(u.login_id));
      if(u.email) sub.push(escapeHtml(u.email));
      if(u.is_vip) sub.push('VIP');
      return '<div class="vip-row" data-i="'+i+'">'+
        '<div class="avatar">'+escapeHtml(initial)+'</div>'+
        '<div class="info">'+
          '<div class="nm">'+escapeHtml(u.baby_name || '（未设置名字）')+'</div>'+
          '<div class="sub">'+sub.join(' · ')+'</div>'+
        '</div>'+
        '<div class="pts">'+u.total_points+'<small> 分</small></div>'+
      '</div>';
    }).join('');
    listEl.querySelectorAll('.vip-row').forEach(function(row){
      row.addEventListener('click', function(){
        var i = parseInt(row.dataset.i);
        openVipDetail(list[i]);
      });
    });
  }

  var vipCurrentUser = null;
  var vipOptsDraft = [];
  var vipRewardsDraft = [];

  // 渲染积分档位可视化编辑器
  function renderVipOpts(){
    var box = document.getElementById('vipOptList');
    box.innerHTML = '';
    var totalW = vipOptsDraft.reduce(function(s,o){return s + (parseInt(o.w)||1);}, 0);
    vipOptsDraft.forEach(function(o, i){
      var col = PALETTE[i % PALETTE.length];
      var card = document.createElement('div');
      card.className = 'vp-opt-card';
      var ratio = totalW > 0 ? ((parseInt(o.w)||1) / totalW * 100) : 0;
      card.innerHTML =
        '<div class="vp-opt-head">'+
          '<span class="vp-opt-color" style="background:'+col+'"></span>'+
          '<div class="vp-opt-fields">'+
            '<div class="vp-opt-field"><label>分数</label><input type="number" min="1" max="9999" value="'+(o.v||1)+'" data-k="v" data-i="'+i+'"></div>'+
            '<div class="vp-opt-field"><label>权重</label><input type="number" min="1" max="9999" value="'+(o.w||1)+'" data-k="w" data-i="'+i+'"></div>'+
          '</div>'+
          '<button class="vp-opt-del" data-i="'+i+'">×</button>'+
        '</div>'+
        '<div class="vp-opt-bar">'+
          '<span style="width:'+ratio+'%;background:'+col+'"></span>'+
        '</div>'+
        '<div class="vp-opt-ratio">中奖概率约 '+ratio.toFixed(1)+'%</div>';
      box.appendChild(card);
    });
    // 绑定事件
    box.querySelectorAll('input').forEach(function(inp){
      inp.addEventListener('input', function(){
        var i = parseInt(inp.dataset.i);
        var k = inp.dataset.k;
        var val = Math.max(1, Math.min(9999, parseInt(inp.value)||1));
        if(vipOptsDraft[i]) vipOptsDraft[i][k] = val;
        // 更新预览条（重新渲染，但避免失焦，用延迟）
        clearTimeout(inp._t);
        inp._t = setTimeout(function(){ renderVipOpts(); }, 400);
      });
    });
    box.querySelectorAll('.vp-opt-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(vipOptsDraft.length <= 2) return;
        var i = parseInt(btn.dataset.i);
        vipOptsDraft.splice(i, 1);
        renderVipOpts();
      });
    });
  }

  // 渲染奖励可视化编辑器
  function renderVipRewards(){
    var box = document.getElementById('vipRwList');
    box.innerHTML = '';
    vipRewardsDraft.forEach(function(r, i){
      var card = document.createElement('div');
      card.className = 'vp-rw-card';
      card.innerHTML =
        '<span class="vp-rw-icon">🎁</span>'+
        '<div class="vp-rw-fields">'+
          '<input class="vp-rw-name" type="text" value="'+escapeHtml(r.name||'')+'" placeholder="奖励名称" data-i="'+i+'" data-k="name">'+
          '<input class="vp-rw-cost" type="number" min="1" max="999999" value="'+(r.cost||1)+'" data-i="'+i+'" data-k="cost">'+
        '</div>'+
        '<button class="vp-rw-del" data-i="'+i+'">×</button>';
      box.appendChild(card);
    });
    if(!vipRewardsDraft.length){
      box.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:10px;text-align:center;">还没有奖励，点下面添加</div>';
    }
    box.querySelectorAll('input').forEach(function(inp){
      inp.addEventListener('input', function(){
        var i = parseInt(inp.dataset.i);
        var k = inp.dataset.k;
        if(!vipRewardsDraft[i]) return;
        if(k === 'name') vipRewardsDraft[i].name = inp.value;
        else vipRewardsDraft[i].cost = Math.max(1, Math.min(999999, parseInt(inp.value)||1));
      });
    });
    box.querySelectorAll('.vp-rw-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        var i = parseInt(btn.dataset.i);
        vipRewardsDraft.splice(i, 1);
        renderVipRewards();
      });
    });
  }

  function openVipDetail(u){
    vipCurrentUser = u;
    document.getElementById('vipDAvatar').textContent = (u.baby_name || u.login_id || '?').charAt(0);
    document.getElementById('vipDName').textContent = u.baby_name || '（未设置名字）';
    var sub = [];
    if(u.login_id) sub.push('@'+u.login_id);
    if(u.email) sub.push(u.email);
    if(u.is_vip) sub.push('VIP');
    document.getElementById('vipDSub').textContent = sub.join(' · ');

    document.getElementById('vipDNameInput').value = u.baby_name || '';
    document.getElementById('vipDLoginIdInput').value = u.login_id || '';
    document.getElementById('vipDPointsInput').value = u.total_points || 0;
    document.getElementById('vipDMaxDrawsInput').value = typeof u.max_draws === 'number' ? u.max_draws : 3;
    document.getElementById('vipDSpinSpeedSel').value = u.spin_speed || 'normal';

    var t = u.today || {};
    document.getElementById('vipDAllowedSel').value = t.allowed ? '1' : '0';
    document.getElementById('vipDDrawCountInput').value = t.drawCount || 0;
    document.getElementById('vipDTodayNoteInput').value = t.note || u.today_note || '';

    // 深拷贝到草稿
    vipOptsDraft = JSON.parse(JSON.stringify(u.opts || DEFAULT_OPTS));
    vipRewardsDraft = JSON.parse(JSON.stringify(u.rewards || DEFAULT_REWARDS));
    renderVipOpts();
    renderVipRewards();

    var hbox = document.getElementById('vipDHist');
    var list = (u.history || []).slice(0, 50);
    if(!list.length){
      hbox.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:8px;">还没有记录</div>';
    } else {
      hbox.innerHTML = list.map(function(h){
        var pTxt = h.p<0 ? (h.p+'分') : ('+'+h.p+'分');
        var pColor = h.p<0 ? 'color:#dc2626;' : 'color:#3b82f6;';
        var note = h.note ? (' <span style="color:#94a3b8;">📝'+escapeHtml(h.note)+'</span>') : '';
        var imgs = '';
        if(h.photos && h.photos.length){
          imgs = ' <span class="imgs">'+h.photos.map(function(p){
            var url = (typeof p==='string')?p:(p.url||'');
            return '<img src="'+url+'" data-url="'+url+'" alt="照片">';
          }).join('')+'</span>';
        }
        return '<div class="hist-item">'+
          '<span class="date">'+escapeHtml(h.full||h.d||'')+'</span> '+
          '<span class="p" style="'+pColor+'">'+pTxt+'</span> '+
          escapeHtml(h.name||'')+
          note+imgs+
        '</div>';
      }).join('');
      hbox.querySelectorAll('img').forEach(function(img){
        img.addEventListener('click', function(){ openViewer(img.dataset.url); });
      });
    }

    document.getElementById('vipDErr').textContent = '';
    document.getElementById('vipDetailOv').classList.add('show');
  }

  document.getElementById('vipDClose').addEventListener('click', function(){
    document.getElementById('vipDetailOv').classList.remove('show');
    vipCurrentUser = null;
  });
  document.getElementById('vipDetailOv').addEventListener('click', function(e){
    if(e.target === this){ this.classList.remove('show'); vipCurrentUser = null; }
  });

  // 添加档位
  document.getElementById('vipOptAdd').addEventListener('click', function(){
    if(vipOptsDraft.length >= 10) return;
    vipOptsDraft.push({v:5, w:10});
    renderVipOpts();
  });

  // 添加奖励
  document.getElementById('vipRwAdd').addEventListener('click', function(){
    if(vipRewardsDraft.length >= 20) return;
    vipRewardsDraft.push({name:'新奖励', cost:50});
    renderVipRewards();
  });

  // 保存修改
  document.getElementById('vipDSave').addEventListener('click', function(){
    if(!vipCurrentUser) return;
    var errEl = document.getElementById('vipDErr');
    var btn = this;

    var newName = (document.getElementById('vipDNameInput').value || '').trim();
    if(newName.length > 12) newName = newName.slice(0, 12);
    var newId = (document.getElementById('vipDLoginIdInput').value || '').trim().toLowerCase();
    var newPoints = parseInt(document.getElementById('vipDPointsInput').value);
    var newMaxDraws = parseInt(document.getElementById('vipDMaxDrawsInput').value);
    var newSpinSpeed = document.getElementById('vipDSpinSpeedSel').value;
    var allowed = document.getElementById('vipDAllowedSel').value === '1';
    var drawCount = parseInt(document.getElementById('vipDDrawCountInput').value);
    var todayNote = (document.getElementById('vipDTodayNoteInput').value || '').trim();

    errEl.textContent = '';
    if(!newName){ errEl.textContent = '请输入宝贝名字'; return; }
    if(newId && !LOGIN_ID_RE.test(newId)){ errEl.textContent = '唯一号格式不对'; return; }
    if(isNaN(newPoints) || newPoints < 0){ errEl.textContent = '积分必须是非负整数'; return; }
    if(isNaN(newMaxDraws) || newMaxDraws < 1 || newMaxDraws > 99){ errEl.textContent = '每天抽奖次数需在 1~99 之间'; return; }
    if(isNaN(drawCount) || drawCount < 0){ errEl.textContent = '今日已抽次数需为非负整数'; return; }

    // 校验草稿
    if(vipOptsDraft.length < 2){ errEl.textContent = '积分档位至少两档'; return; }
    for(var i=0;i<vipOptsDraft.length;i++){
      var o = vipOptsDraft[i];
      if(!o.v || o.v < 1 || !o.w || o.w < 1){ errEl.textContent = '积分档位分数和权重必须 ≥1'; return; }
    }
    var cleanRewards = [];
    for(var j=0;j<vipRewardsDraft.length;j++){
      var r = vipRewardsDraft[j];
      if(!r.name || !r.name.trim()){ errEl.textContent = '奖励名称不能为空'; return; }
      if(!r.cost || r.cost < 1){ errEl.textContent = '奖励积分必须 ≥1'; return; }
      cleanRewards.push({name:r.name.trim(), cost:r.cost});
    }

    var newOpts = vipOptsDraft.map(function(o){ return {v:parseInt(o.v), w:parseInt(o.w)}; });
    var newRewards = cleanRewards;

    var newToday = (vipCurrentUser.today || {});
    newToday = {
      date: newToday.date || todayStr(),
      allowed: allowed,
      drawn: (drawCount > 0),
      got: newToday.got || 0,
      drawCount: drawCount,
      photos: newToday.photos || []
    };

    var diff = newPoints - (vipCurrentUser.total_points || 0);
    var newHist = (vipCurrentUser.history || []).slice(0);
    if(diff !== 0){
      newHist.unshift({
        d: todayStr().slice(5),
        p: diff,
        full: todayStr(),
        note: '👑 VIP 管理员调整',
        admin: true
      });
      if(newHist.length > 100) newHist = newHist.slice(0, 100);
    }

    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '保存中…';

    var checkIdThenSave = function(){
      if(newId && newId !== (vipCurrentUser.login_id || '')){
        sb.from('profiles').select('user_id').eq('login_id', newId).maybeSingle()
          .then(function(res){
            if(res.data && res.data.user_id !== vipCurrentUser.user_id){
              btn.disabled = false; btn.textContent = oldText;
              errEl.textContent = '这个唯一号已经被别的用户用了';
              return;
            }
            doSave();
          })
          .catch(function(){
            btn.disabled = false; btn.textContent = oldText;
            errEl.textContent = '网络错误，请重试';
          });
      } else {
        doSave();
      }
    };

    var doSave = function(){
      var patch = {
        baby_name: newName,
        login_id: newId || null,
        updated_at: new Date().toISOString()
      };
      sb.from('profiles').update(patch).eq('user_id', vipCurrentUser.user_id)
        .then(function(res){
          if(res.error) throw res.error;
          return sb.from('scores').upsert({
            user_id: vipCurrentUser.user_id,
            total_points: newPoints,
            history: newHist,
            today: newToday,
            today_note: todayNote,
            rewards: newRewards,
            opts: newOpts,
            max_draws: newMaxDraws,
            spin_speed: newSpinSpeed,
            updated_at: new Date().toISOString()
          });
        })
        .then(function(res){
          btn.disabled = false;
          btn.textContent = oldText;
          if(res.error){ errEl.textContent = '保存失败：'+res.error.message; return; }
          vipCurrentUser.baby_name = newName;
          vipCurrentUser.login_id = newId;
          vipCurrentUser.total_points = newPoints;
          vipCurrentUser.max_draws = newMaxDraws;
          vipCurrentUser.spin_speed = newSpinSpeed;
          vipCurrentUser.today = newToday;
          vipCurrentUser.today_note = todayNote;
          vipCurrentUser.history = newHist;
          vipCurrentUser.rewards = newRewards;
          vipCurrentUser.opts = newOpts;
          openVipDetail(vipCurrentUser);
          vipLoadUsers();
        })
        .catch(function(err){
          btn.disabled = false;
          btn.textContent = oldText;
          errEl.textContent = (err && err.message) || '网络错误，请重试';
        });
    };

    checkIdThenSave();
  });

  // 清空记录
  document.getElementById('vipDReset').addEventListener('click', function(){
    if(!vipCurrentUser) return;
    if(!confirm('确定清空「'+(vipCurrentUser.baby_name||'该用户')+'」的积分和历史记录吗？')) return;
    sb.from('scores').upsert({
      user_id: vipCurrentUser.user_id,
      total_points: 0,
      history: [{ d: todayStr().slice(5), p: 0, full: todayStr(), note: '👑 VIP 管理员清空了记录', admin: true }],
      today: {date:todayStr(), allowed:false, drawn:false, got:0, photos:[], drawCount:0},
      today_note: '',
      rewards: vipCurrentUser.rewards || DEFAULT_REWARDS,
      opts: vipCurrentUser.opts || DEFAULT_OPTS,
      max_draws: vipCurrentUser.max_draws || DEFAULT_MAX_DRAWS,
      updated_at: new Date().toISOString()
    }).then(function(res){
      if(res.error){ alert('操作失败：'+res.error.message); return; }
      alert('已清空');
      document.getElementById('vipDetailOv').classList.remove('show');
      vipCurrentUser = null;
      vipLoadUsers();
    });
  });

  // 【核心修改】删除用户（软删除）
  document.getElementById('vipDDelete').addEventListener('click', function(){
    if(!vipCurrentUser) return;
    if(!confirm('⚠️ 确定注销「'+(vipCurrentUser.baby_name||'该用户')+'」吗？\n注销后，该用户将无法登录，并会在列表中隐藏。')) return;
    
    // 标记为已删除，并把邮箱置空/乱码，释放邮箱给新用户注册
    sb.from('profiles').update({ 
      is_deleted: true, 
      email: 'deleted_' + Date.now() + '@fake.com',
      login_id: null
    }).eq('user_id', vipCurrentUser.user_id).then(function(res) {
      if(res.error) { alert('操作失败：' + res.error.message); return; }
      alert('已成功注销并隐藏该用户');
      document.getElementById('vipDetailOv').classList.remove('show');
      vipCurrentUser = null;
      vipLoadUsers(); // 重新加载列表，此时该用户已被过滤掉
    });
  });

  document.getElementById('vipSearchBtn').addEventListener('click', vipRenderList);
  document.getElementById('vipSearchInput').addEventListener('input', vipRenderList);
  document.getElementById('vipRefreshBtn').addEventListener('click', vipLoadUsers);
  document.getElementById('vipLogoutBtn').addEventListener('click', function(){
    if(!confirm('确定退出登录吗？')) return;
    sb.auth.signOut().then(function(){ location.reload(); });
  });

  // ==================== 登录界面 ====================
  var isRegister = false;
  var authBtn = document.getElementById('authBtn');
  var accountInput = document.getElementById('accountInput');
  var passInput = document.getElementById('passInput');
  var captchaRow = document.getElementById('captchaRow');
  var captchaInput = document.getElementById('captchaInput');
  var authMsg = document.getElementById('authMsg');
  var switchText = document.getElementById('switchText');
  var switchLink = document.getElementById('switchLink');
  var authTip = document.getElementById('authTip');

  function setAuthMode(reg){
    isRegister = reg;
    authBtn.textContent = reg ? '注 册' : '登 录';
    switchText.textContent = reg ? '已经有账号了？' : '还没有账号？';
    switchLink.textContent = reg ? '去登录' : '去注册';
    authTip.textContent = reg ? '注册需要邮箱，注册后可在设置里设唯一号' : '登录后，积分会保存在云端，换设备也不会丢哦';
    accountInput.placeholder = reg ? '邮箱' : '邮箱 或 唯一号';
    authMsg.textContent = '';
    authMsg.className = 'msg';
    if(reg){
      captchaRow.style.display = 'flex';
      captchaInput.value = '';
      generateCaptcha();
    } else {
      captchaRow.style.display = 'none';
      captchaInput.value = '';
    }
  }
  switchLink.addEventListener('click', function(){ setAuthMode(!isRegister); });

  document.getElementById('recentClear').addEventListener('click', function(){
    if(!confirm('清空最近登录记录吗？')) return;
    saveRecent([]);
    renderRecent();
  });

  function refreshPointsDisplay(){
    var ptsBox = document.getElementById('totalPts');
    if(ptsBox) ptsBox.textContent = totalPoints;
  }

  function enterApp(){
    refreshPointsDisplay();
    if(isVip){
      saveMainView('vip');
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('mainWrap').style.display = 'none';
      document.getElementById('vipWrap').style.display = 'block';
      vipLoadUsers();
      return;
    }
    saveMainView('main');
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('vipWrap').style.display = 'none';
    document.getElementById('mainWrap').style.display = 'block';

    document.getElementById('totalPts').textContent = totalPoints;
    document.getElementById('todayDate').textContent = todayDisplay();
    refreshNameDisplay();
    renderHist(); updateStatus(); syncSound();
    updateExchangeBtn();
    setTimeout(function(){ setupCanvas(); buildWheel(-1); draw(angle); }, 60);

    setTimeout(function(){
      if(!babyName){
        openBabyNameFirst();
      }
    }, 300);
  }

  document.getElementById('authForm').addEventListener('submit', function(e){
    e.preventDefault();
    authBtn.click();
  });
  authBtn.addEventListener('click', function(){
    var acc = (accountInput.value||'').trim();
    var pass = (passInput.value||'').trim();
    if(!acc || !pass){ authMsg.textContent = '请填写账号和密码'; return; }

    if(isRegister){
      if(!isEmail(acc)){
        authMsg.textContent = '注册请使用邮箱';
        return;
      }
      var inputCode = (captchaInput.value||'').trim().toUpperCase();
      if(!inputCode){ authMsg.textContent = '请输入验证码'; return; }
      if(inputCode !== captchaCode){
        authMsg.textContent = '验证码不对，换一个再试试';
        generateCaptcha();
        captchaInput.value = '';
        return;
      }
    }

    authBtn.disabled = true;
    authMsg.className = 'msg';
    authMsg.textContent = isRegister ? '注册中…' : '登录中…';

    if(isRegister){
      var doSignUp = function() {
        return sb.auth.signUp({ email: acc, password: pass })
          .then(function(res){
            if(res.error) throw res.error;
            if(res.data.user){
              return sb.from('profiles').upsert({
                user_id: res.data.user.id,
                email: acc,
                login_id: null,
                baby_name: '',
                is_vip: false
              });
            }
          });
      };

      doSignUp()
        .then(function() {
          authBtn.disabled = false;
          authMsg.className = 'msg ok';
          authMsg.textContent = '注册成功！请用邮箱登录。';
          setAuthMode(false);
          passInput.value = '';
        })
        .catch(function(err) {
          if(err.message && err.message.indexOf('already registered') > -1) {
            // 尝试用原密码登录，看看是不是注销的号
            return sb.auth.signInWithPassword({ email: acc, password: pass })
              .then(function(signInRes) {
                if(signInRes.error) {
                  throw new Error('该邮箱已被其他用户注册，请更换一个邮箱。');
                }
                // 登录成功，说明密码是对的！查一下是不是 is_deleted
                return sb.from('profiles').select('is_deleted').eq('user_id', signInRes.data.user.id).single()
                  .then(function(pRes) {
                    if (pRes.data && pRes.data.is_deleted) {
                      // 复活账号：清空积分，重置 is_deleted
                      return sb.from('profiles').update({ is_deleted: false, login_id: null, baby_name: '' }).eq('user_id', signInRes.data.user.id)
                        .then(function() {
                          return sb.from('scores').upsert({
                            user_id: signInRes.data.user.id,
                            total_points: 0,
                            history: [],
                            today: null,
                            today_note: '',
                            rewards: DEFAULT_REWARDS,
                            opts: DEFAULT_OPTS,
                            max_draws: DEFAULT_MAX_DRAWS,
                            updated_at: new Date().toISOString()
                          });
                        })
                        .then(function() {
                          authBtn.disabled = false;
                          authMsg.className = 'msg ok';
                          authMsg.textContent = '检测到历史注销账号，已为您重新激活并重置数据！';
                          // 稍等一下进入主页
                          setTimeout(() => { location.reload(); }, 1000);
                        });
                    } else {
                      throw new Error('该邮箱已被其他用户注册，请更换一个邮箱。');
                    }
                  });
              })
              .catch(function(signInErr) {
                throw new Error('该邮箱已被注册，且密码不匹配，请更换邮箱或找回密码。');
              });
          }
          throw err;
        })
        .catch(function(err){
          authBtn.disabled = false;
          authMsg.textContent = (err && err.message) || '注册失败，请重试';
          generateCaptcha();
        });

    } else {
      // 登录逻辑
      var doSignIn = function(emailToUse) {
        return sb.auth.signInWithPassword({ email: emailToUse, password: pass });
      };

      if(isEmail(acc)){
        // 尝试用原邮箱登录
        doSignIn(acc)
          .then(function(res){
            if (res.error) throw res.error;
            // 成功拿到 session，立刻去查 profile 的 is_deleted
            return sb.from('profiles').select('is_deleted').eq('user_id', res.data.user.id).single()
              .then(function(pRes) {
                if (pRes.data && pRes.data.is_deleted) {
                  // 如果被注销，先 sign out，然后报错
                  return sb.auth.signOut().then(() => {
                    throw new Error('该账号已被注销，请点击「去注册」重新激活。');
                  });
                }
                return res;
              });
          })
          .then(function(res){
            authBtn.disabled = false;
            addRecent(acc, acc);
            authMsg.className = 'msg ok';
            authMsg.textContent = '成功！正在进入…';
          })
          .catch(function(err){
            authBtn.disabled = false;
            authMsg.textContent = err.message;
          });
      } else {
        // 用唯一号登录
        var id = acc.toLowerCase();
        sb.from('profiles').select('email, is_deleted').eq('login_id', id).maybeSingle()
          .then(function(check){
            if(!check.data || !check.data.email){ throw new Error('找不到这个唯一号，请检查后重试'); }
            if (check.data.is_deleted) { throw new Error('该账号已被注销，无法登录。'); }
            
            // 使用底层真实的邮箱登录
            return doSignIn(check.data.email).then(function(res){
              if(res.error) {
                throw new Error('密码不对或账号异常');
              }
              return res;
            });
          })
          .then(function(res){
            authBtn.disabled = false;
            addRecent(id, '@'+id);
            authMsg.className = 'msg ok';
            authMsg.textContent = '成功！正在进入…';
          })
          .catch(function(err){
            authBtn.disabled = false;
            authMsg.textContent = (err && err.message) || '网络错误，请重试';
          });
      }
    }
  });

  [accountInput, passInput, captchaInput].forEach(function(inp){
    inp.addEventListener('keydown', function(e){
      if(e.key === 'Enter') authBtn.click();
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', function(){
    if(!confirm('确定要退出登录吗？')) return;
    if(saveTimer) clearTimeout(saveTimer);
    function doSignOut(){ sb.auth.signOut().then(function(){ location.reload(); }).catch(function(){ location.reload(); }); }
    if(user){
      try {
        sb.from('scores').upsert({
          user_id: user.id, total_points: totalPoints, history: hist,
          today: today, today_note: todayNote, rewards: rewards, opts: opts, max_draws: maxDraws, spin_speed: spinSpeed,
          updated_at: new Date().toISOString()
        }).then(doSignOut).catch(doSignOut);
      } catch(e) { doSignOut(); }
    } else { doSignOut(); }
  });

  window.addEventListener('resize',function(){ setupCanvas(); buildWheel(-1); draw(angle); });
  function renderHomeUI(){
    refreshPointsDisplay();
    document.getElementById('todayDate').textContent = todayDisplay();
    refreshNameDisplay();
    renderHist(); updateStatus(); updateExchangeBtn();
    var ptsBox = document.getElementById('ptsBox');
    if(ptsBox){ ptsBox.classList.remove('pop'); void ptsBox.offsetWidth; ptsBox.classList.add('pop'); }
    setTimeout(function(){ setupCanvas(); buildWheel(-1); draw(angle); }, 60);
  }
  function restoreHomeView(){
    if(!user || isVip){ baoLog('restore', '跳过恢复（未登录或 VIP）', { vip: isVip }); return; }
    baoLog('restore', '返回首页恢复', { persistedState: baoState() });
    saveMainView('main');
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('vipWrap').style.display = 'none';
    document.getElementById('mainWrap').style.display = 'block';
    renderHomeUI();
    Promise.all([loadProfile(), loadCloud()]).then(function(){
      baoLog('restore', '云端校正完成', baoState());
      renderHomeUI();
    }, function(err){
      baoLog('restore', '云端校正失败', { msg: err && err.message });
      renderHomeUI();
    });
  }
  window.addEventListener('pageshow', function(event){
    baoLog('lifecycle', 'pageshow', { persisted: event.persisted, url: location.href });
    if(event.persisted) restoreHomeView();
  });
  window.addEventListener('pagehide', function(){ baoLog('lifecycle', 'pagehide', { url: location.href }); });
  window.addEventListener('beforeunload', function(){ baoLog('lifecycle', 'beforeunload', { url: location.href }); });

  var sessionLoadToken = 0;
  var onlineSessionId = '';
  var sessionLoadTimer = null;

  function finishSessionLoad(token){
    if(token !== sessionLoadToken) return;
    if(sessionLoadTimer){ clearTimeout(sessionLoadTimer); sessionLoadTimer = null; }
    baoLog('session', '会话加载完成', baoState());
    enterApp();
  }
  function failSessionLoad(token, err){
    if(token !== sessionLoadToken) return;
    console.warn('会话数据加载失败', err);
    baoLog('session', '会话加载失败', { msg: err && err.message, token: token });
    if(sessionLoadTimer){ clearTimeout(sessionLoadTimer); sessionLoadTimer = null; }
    var msg = document.getElementById('authMsg');
    if(msg){
      msg.className = 'msg';
      msg.textContent = '数据加载较慢，正在重试…';
    }
    setTimeout(function(){
      if(token !== sessionLoadToken) return;
      location.reload();
    }, 1500);
  }
  function loadSessionData(session, token){
    baoLog('session', '开始加载会话数据', { token: token });
    if(sessionLoadTimer){ clearTimeout(sessionLoadTimer); sessionLoadTimer = null; }
    sessionLoadTimer = setTimeout(function(){ failSessionLoad(token, new Error('会话加载超时')); }, 12000);
    Promise.all([loadProfile(), loadCloud()])
      .then(function(){ finishSessionLoad(token); })
      .catch(function(err){ failSessionLoad(token, err); });
  }
  restoreNetworkMsg();
  sb.auth.onAuthStateChange(function(event, session){
    baoLog('auth', 'onAuthStateChange', { event: event, hasSession: !!(session && session.user), uid: session && session.user && session.user.id.slice(0,8) });
    if(session && session.user){
      user = session.user;
      onlineSessionId = session.access_token || session.user.id;
      var token = ++sessionLoadToken;
      setAuthMode(false);
      authMsg.className = 'msg ok';
      authMsg.textContent = '正在加载数据…';
      loadSessionData(session, token);
    } else {
      user = null;
      isVip = false;
      loginId = '';
      babyName = '';
      accountEmail = '';
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('mainWrap').style.display = 'none';
      document.getElementById('vipWrap').style.display = 'none';
    }
  });

  sb.auth.getSession().then(function(res){
    var has = !!(res.data && res.data.session && res.data.session.user);
    baoLog('auth', 'getSession', { hasSession: has, uid: has && res.data.session.user.id.slice(0,8) });
    if(res.data && res.data.session && res.data.session.user){
      user = res.data.session.user;
      onlineSessionId = res.data.session.access_token || res.data.session.user.id;
      var token = ++sessionLoadToken;
      authMsg.className = 'msg ok';
      authMsg.textContent = '正在加载数据…';
      loadSessionData(res.data.session, token);
    } else {
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('mainWrap').style.display = 'none';
      document.getElementById('vipWrap').style.display = 'none';
      var switchTo = null;
      try { switchTo = localStorage.getItem('bao_switch_to'); } catch(e){}
      if(switchTo){
        try { localStorage.removeItem('bao_switch_to'); } catch(e){}
        accountInput.value = switchTo;
        passInput.value = '';
        passInput.focus();
        authMsg.textContent = '请输入密码登录';
        authMsg.className = 'msg';
      }
      renderRecent();
    }
  });

  renderRecent();

  document.getElementById('aboutVer').textContent = APP_VERSION;
  document.getElementById('aboutDate').textContent = APP_DATE;
  document.getElementById('mAboutVal').textContent = APP_VERSION;

})();