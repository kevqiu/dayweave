import { COLOR } from "./tokens.ts";

export function mcpAuthPage(screen: "login" | "consent" | "connections", local: boolean) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Dayweave</title><style>
*{box-sizing:border-box}body{margin:0;background:${COLOR.paper};color:${COLOR.ink};font:16px/1.55 Figtree,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:100%;max-width:480px;background:${COLOR.card};padding:32px;border:1px solid ${COLOR.border};border-radius:20px}h1{font:500 32px/1.15 Newsreader,Georgia,serif;margin:24px 0 16px}p{color:${COLOR.inkSoft}}a{color:${COLOR.link}}ul{padding-left:24px}li{margin:10px 0}.brand{font-weight:700;letter-spacing:.02em}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}button{font:inherit;font-weight:600;padding:12px 20px;min-height:48px;border:1px solid ${COLOR.borderWarm};border-radius:12px;background:${COLOR.brandButton};color:${COLOR.ink};cursor:pointer}button.secondary{background:${COLOR.card}}button:disabled{opacity:.6;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid ${COLOR.ink};outline-offset:4px}#error{color:${COLOR.ink};padding:12px;background:${COLOR.noticeBg};border-left:3px solid ${COLOR.accent}}[hidden]{display:none!important}.client{overflow-wrap:anywhere}.connection{padding:16px 0;border-bottom:1px solid ${COLOR.border}}footer{margin-top:28px;font-size:14px}
</style></head><body><main>
<a class="brand" href="/">dayweave</a>
<h1 id="title">${screen === "connections" ? "Connected apps" : screen === "consent" ? "Connect your trips" : "Sign in to Dayweave"}</h1>
<p id="intro">${screen === "connections" ? "Manage the apps that can access your trips." : screen === "consent" ? "Review what this app will be able to do." : "Use your Google account to connect your trips to your assistant."}</p>
<p id="error" role="alert" hidden></p><div id="content" aria-live="polite"></div>
<div id="actions" class="actions"></div>
<footer><a href="/mcp/connections">Manage connections</a> · <a href="/">Back to Dayweave</a></footer>
</main><script>
const screen = ${JSON.stringify(screen)};
const local = ${JSON.stringify(local)};
const query = new URLSearchParams(location.search);
const signedNames = new Set(query.getAll('ba_param'));
const signed = new URLSearchParams();
for (const [key, value] of query) if (key === 'sig' || signedNames.has(key)) signed.append(key, value);
const oauthQuery = signed.toString();
const content = document.getElementById('content');
const actions = document.getElementById('actions');
const errorBox = document.getElementById('error');
function error(message) { errorBox.textContent = message; errorBox.hidden = false; }
function element(tag, value, parent = content) { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; }
async function api(path, body) {
  const response = await fetch('/api/auth' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error_description || data.error || 'Could not complete this request. Try connecting again.');
  return data;
}
function button(label, run, secondary = false, parent = actions) {
  const node = element('button', label, parent);
  node.type = 'button';
  if (secondary) node.className = 'secondary';
  node.onclick = async () => {
    errorBox.hidden = true;
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    node.setAttribute('aria-busy', 'true');
    try { await run(); } catch (e) { error(e.message); }
    finally { buttons.forEach(button => button.disabled = false); node.removeAttribute('aria-busy'); }
  };
  return node;
}
function navigate(data) {
  const destination = data.url || data.redirect_uri;
  if (!destination) throw new Error('Connection did not finish. Return to your assistant and try again.');
  const target = new URL(destination, location.origin);
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Unsupported callback address.');
  location.assign(target.href);
}
function login() {
  actions.replaceChildren();
  button('Continue with Google', async () => navigate(await api('/sign-in/social', { provider: 'google', callbackURL: '/mcp/connections', ...(oauthQuery ? { oauth_query: oauthQuery } : {}) })));
  if (local) button('Continue locally', async () => {
    const data = await api('/sign-in/local', oauthQuery ? { oauth_query: oauthQuery } : {});
    if (data.url || data.redirect_uri) navigate(data);
    else if (oauthQuery) {
      const resume = new URLSearchParams(oauthQuery);
      for (const key of ['sig', 'exp', 'ba_iat', 'ba_pl', 'ba_param']) resume.delete(key);
      const prompt = (resume.get('prompt') || '').split(' ').filter(value => value !== 'login').join(' ');
      if (prompt) resume.set('prompt', prompt); else resume.delete('prompt');
      location.assign('/api/auth/oauth2/authorize?' + resume);
    } else location.assign('/mcp/connections');
  }, true);
}
async function consent() {
  if (!query.get('sig') || !query.get('client_id')) throw new Error('Start the connection from your assistant to review access.');
  const session = await api('/get-session');
  if (!session?.user) { document.getElementById('intro').textContent = 'Sign in before reviewing access.'; login(); return; }
  const client = await api('/oauth2/public-client?client_id=' + encodeURIComponent(query.get('client_id')));
  element('strong', client.client_name || client.client_id || 'Connected app').className = 'client';
  const redirect = query.get('redirect_uri');
  if (redirect) element('p', 'Returns to ' + new URL(redirect).host).className = 'client';
  element('p', 'Signed in as ' + session.user.email);
  const labels = { 'trips:read': 'Read your trips, itinerary, notes, and lodging; search places.', 'trips:write': 'Create trips and edit itineraries, dates, notes, and lodging, including trips you share.', 'offline_access': 'Keep access until you disconnect this app.' };
  const list = element('ul', '');
  for (const scope of (query.get('scope') || '').split(' ').filter(Boolean)) element('li', labels[scope] || scope, list);
  element('p', 'This connection cannot book travel or access your Gmail or Google Drive.');
  button('Allow access', async () => navigate(await api('/oauth2/consent', { accept: true, oauth_query: oauthQuery })));
  button('Cancel', async () => navigate(await api('/oauth2/consent', { accept: false, oauth_query: oauthQuery })), true);
}
async function connections() {
  const session = await api('/get-session');
  if (!session?.user) { document.getElementById('intro').textContent = 'Sign in to manage your connected apps.'; login(); return; }
  const consents = await api('/oauth2/get-consents');
  content.replaceChildren();
  if (!consents.length) element('p', 'No apps connected yet.');
  for (const consent of consents) {
    const row = element('div', ''); row.className = 'connection';
    let name = consent.clientId;
    try { const client = await api('/oauth2/public-client?client_id=' + encodeURIComponent(consent.clientId)); name = client.client_name || name; } catch {}
    element('strong', name, row).className = 'client';
    button('Disconnect', async () => { await api('/oauth2/delete-consent', { id: consent.id }); await connections(); }, true, row);
  }
}
(async () => { try { if (screen === 'login') login(); else if (screen === 'consent') await consent(); else await connections(); } catch (e) { error(e.message); } })();
</script></body></html>`;
}
