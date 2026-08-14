(function(global){
  'use strict';

  // Auth seguro activado tras aprovisionamiento y preflight LIVE verificados.
  var AUTH_ENABLED = true;
  var API_BASE = '/api/auth';
  var nativeFetch = global.fetch.bind(global);
  var accessToken = null;
  var expiresAt = 0;
  var currentProfile = null;
  var refreshPromise = null;

  function authError(message, status, retryAfter){
    var err = new Error(message || 'Authentication failed');
    err.status = status || 0;
    err.retryAfter = retryAfter || 0;
    return err;
  }

  async function api(path, options){
    var opts = Object.assign({ credentials:'include' }, options || {});
    opts.headers = new Headers(opts.headers || {});
    if(opts.body && !opts.headers.has('Content-Type')) opts.headers.set('Content-Type','application/json');
    var res = await nativeFetch(API_BASE + path, opts);
    var data = null;
    try { data = await res.json(); } catch(_e) {}
    if(!res.ok){
      throw authError(data && data.error, res.status, data && data.retry_after);
    }
    return data || {};
  }

  function acceptSession(data){
    if(!data || !data.access_token || !data.profile) throw authError('Invalid session response', 502);
    accessToken = data.access_token;
    expiresAt = Date.now() + Math.max(30, Number(data.expires_in) || 300) * 1000;
    currentProfile = data.profile;
    return {
      profile: currentProfile,
      forcePinChange: !!data.force_pin_change
    };
  }

  async function login(employeeId, pin){
    if(!AUTH_ENABLED) throw authError('Authentication feature is disabled', 404);
    var data = await api('/login', {
      method:'POST',
      body:JSON.stringify({ employee_id:employeeId, pin:pin })
    });
    return acceptSession(data);
  }

  async function directory(department){
    if(!AUTH_ENABLED) throw authError('Authentication feature is disabled', 404);
    var data = await api('/directory?department=' + encodeURIComponent(department), { method:'GET' });
    return Array.isArray(data.employees) ? data.employees : [];
  }

  async function employees(){
    if(!AUTH_ENABLED) throw authError('Authentication feature is disabled', 404);
    var token = await getAccessToken(false);
    var data = await api('/employees', {
      method:'GET',
      headers:{ Authorization:'Bearer ' + token }
    });
    return Array.isArray(data.employees) ? data.employees : [];
  }

  async function refresh(){
    if(!AUTH_ENABLED) return null;
    if(refreshPromise) return refreshPromise;
    refreshPromise = api('/token', { method:'POST' })
      .then(acceptSession)
      .catch(function(err){
        accessToken=null; expiresAt=0; currentProfile=null;
        throw err;
      })
      .finally(function(){ refreshPromise=null; });
    return refreshPromise;
  }

  async function getAccessToken(forceRefresh){
    if(!AUTH_ENABLED) return null;
    if(!forceRefresh && accessToken && Date.now() < expiresAt - 60000) return accessToken;
    await refresh();
    return accessToken;
  }

  async function restore(){
    if(!AUTH_ENABLED) return null;
    try { return await refresh(); }
    catch(err){
      if(err && (err.status===401 || err.status===404)) return null;
      throw err;
    }
  }

  async function logout(){
    var token = accessToken;
    accessToken=null; expiresAt=0; currentProfile=null;
    if(!AUTH_ENABLED) return;
    var headers = token ? { Authorization:'Bearer ' + token } : {};
    try { await api('/logout', { method:'POST', headers:headers }); } catch(_e) {}
  }

  async function changePin(currentPin, newPin){
    if(!AUTH_ENABLED || !accessToken) throw authError('No active session', 401);
    var token = accessToken;
    try {
      return await api('/change-pin', {
        method:'POST',
        headers:{ Authorization:'Bearer ' + token },
        body:JSON.stringify({ current_pin:currentPin, new_pin:newPin })
      });
    } finally {
      accessToken=null; expiresAt=0; currentProfile=null;
    }
  }

  async function authorizedRequest(path, method, payload){
    if(!AUTH_ENABLED) throw authError('Authentication feature is disabled', 404);
    var token = await getAccessToken(false);
    return api(path, {
      method:method,
      headers:{ Authorization:'Bearer ' + token },
      body:JSON.stringify(payload || {})
    });
  }

  async function provisionEmployee(employee){
    return authorizedRequest('/provision', 'POST', employee);
  }

  async function resetPin(employeeId){
    return authorizedRequest('/reset-pin', 'POST', { employee_id:employeeId });
  }

  async function updateEmployee(employeeId, employee){
    return authorizedRequest('/employee', 'PATCH', {
      action:'update', employee_id:employeeId, employee:employee
    });
  }

  async function setEmployeeStatus(employeeId, status){
    return authorizedRequest('/employee', 'PATCH', {
      action:'set_status', employee_id:employeeId, estado:status
    });
  }

  async function deleteEmployee(employeeId){
    return authorizedRequest('/employee', 'DELETE', { employee_id:employeeId });
  }

  async function attachmentApi(path, method, payload){
    if(!AUTH_ENABLED) throw authError('Authentication feature is disabled', 404);
    var token = await getAccessToken(false);
    var response = await nativeFetch('/api/attachments/' + path, {
      method:method,
      credentials:'include',
      headers:{ Authorization:'Bearer ' + token, 'Content-Type':'application/json' },
      body:JSON.stringify(payload || {})
    });
    var data = null;
    try { data = await response.json(); } catch(_error) {}
    if(!response.ok) throw authError(data && data.error, response.status);
    return data || {};
  }

  async function uploadAttachment(file, table, recordId){
    var signed = await attachmentApi('sign-upload', 'POST', {
      table:table, record_id:recordId, name:file.name, type:file.type, size:file.size
    });
    if(!signed.url || !signed.path) throw authError('Invalid signed upload', 502);
    var uploadUrl = signed.url;
    if(signed.token && uploadUrl.indexOf('token=') < 0){
      uploadUrl += (uploadUrl.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(signed.token);
    }
    var response = await nativeFetch(uploadUrl, {
      method:'PUT',
      headers:{ 'Content-Type':file.type, 'x-upsert':'false' },
      body:file
    });
    if(!response.ok) throw authError('Attachment upload failed', response.status);
    return { path:signed.path };
  }

  async function attachmentUrl(table, recordId, path){
    var signed = await attachmentApi('sign-download', 'POST', {
      table:table, record_id:recordId, path:path
    });
    if(!signed.url) throw authError('Invalid signed download', 502);
    return signed.url;
  }

  async function deleteAttachment(table, recordId, path){
    return attachmentApi('object', 'DELETE', {
      table:table, record_id:recordId, path:path
    });
  }

  async function supabaseFetch(input, init){
    if(!AUTH_ENABLED) return nativeFetch(input, init);
    var token = await getAccessToken(false);
    var opts = Object.assign({}, init || {});
    opts.headers = new Headers(opts.headers || (input instanceof Request ? input.headers : {}));
    opts.headers.set('Authorization', 'Bearer ' + token);
    var firstInput = input instanceof Request ? input.clone() : input;
    var res = await nativeFetch(firstInput, opts);
    if(res.status !== 401) return res;
    token = await getAccessToken(true);
    opts.headers.set('Authorization', 'Bearer ' + token);
    var retryInput = input instanceof Request ? input.clone() : input;
    return nativeFetch(retryInput, opts);
  }

  global.SyncroAuth = Object.freeze({
    get enabled(){ return AUTH_ENABLED; },
    directory:directory,
    employees:employees,
    login:login,
    changePin:changePin,
    provisionEmployee:provisionEmployee,
    resetPin:resetPin,
    updateEmployee:updateEmployee,
    setEmployeeStatus:setEmployeeStatus,
    deleteEmployee:deleteEmployee,
    uploadAttachment:uploadAttachment,
    attachmentUrl:attachmentUrl,
    deleteAttachment:deleteAttachment,
    logout:logout,
    refresh:refresh,
    restore:restore,
    getAccessToken:getAccessToken,
    get profile(){ return currentProfile; }
  });
  global.syncroSupabaseFetch = supabaseFetch;
})(window);
