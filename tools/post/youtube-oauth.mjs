// One-time helper to mint a YouTube refresh token for a channel.
//
//   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node tools/post/youtube-oauth.mjs [--save SECRET_NAME]
//
// The owner runs this on his own machine, once per channel, because it needs his Google login and his
// choice of which channel to authorize — neither of which CI or this assistant can do. It opens the
// Google consent screen in the browser, catches the redirect on a loopback port, exchanges the code and
// prints the refresh token. Put it in the GitHub organization as the secret for that channel:
//   - the Turkish channel (@ConflictGridTR)  -> YOUTUBE_REFRESH_TOKEN
//   - the English channel (@Conflict-Grid)   -> YOUTUBE_REFRESH_TOKEN_EN
// Pick the matching channel on Google's "choose an account / brand account" screen before approving.
//
// Needs only the client id and secret of a Desktop-app OAuth client (YouTube Data API v3 enabled). No
// npm dependency: Node's http, crypto and child_process do the loopback flow.
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first (from Google Cloud Console → Credentials → OAuth client, Desktop app).');
  process.exit(1);
}

// upload, plus read access for the daily analytics pull (tools/post/youtube-analytics.mjs): a token
// minted with upload alone cannot read a channel's statistics
const SCOPE = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'].join(' ');
// --save NAME writes the token straight into the repository secret NAME with the gh CLI, so it is never
// printed to the terminal or pasted into a chat
const saveAs = process.argv.includes('--save') ? process.argv[process.argv.indexOf('--save') + 1] : null;
const state = randomBytes(16).toString('hex');

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* print the URL below instead */ }
}

async function exchange(code, redirectUri) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`token exchange failed (${response.status}): ${JSON.stringify(token)}`);
  return token;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  if (url.pathname !== '/') { response.writeHead(404).end(); return; }
  const finish = (message) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(message);
  };
  try {
    if (url.searchParams.get('state') !== state) throw new Error('state mismatch (possible CSRF); start again');
    const error = url.searchParams.get('error');
    if (error) throw new Error(`Google returned an error: ${error}`);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('no authorization code in the redirect');
    const redirectUri = `http://localhost:${port}`;
    const token = await exchange(code, redirectUri);
    finish('Done. Go back to the terminal for the refresh token; you can close this tab.');
    if (!token.refresh_token) {
      console.error('\nNo refresh_token was returned. Revoke the app at https://myaccount.google.com/permissions and run again (we force prompt=consent, which normally returns one).');
      process.exit(1);
    }
    if (saveAs) {
      const r = spawnSync('gh', ['secret', 'set', saveAs, '-R', 'Greater-Turkiye/motion'], { input: token.refresh_token, stdio: ['pipe', 'inherit', 'inherit'] });
      if (r.status !== 0) { console.error(`gh secret set ${saveAs} failed; run again without --save to print the token`); process.exit(1); }
      console.log(`\nSaved the refresh token as the repository secret ${saveAs}.`);
      server.close();
      process.exit(0);
    }
    console.log('\nRefresh token (put it in the GitHub org secret for this channel):\n');
    console.log(token.refresh_token);
    console.log('\n  Turkish channel (@ConflictGridTR) -> YOUTUBE_REFRESH_TOKEN');
    console.log('  English channel (@Conflict-Grid)  -> YOUTUBE_REFRESH_TOKEN_EN\n');
    server.close();
    process.exit(0);
  } catch (caught) {
    finish(`Error: ${caught.message}`);
    console.error(`\n${caught.message}`);
    server.close();
    process.exit(1);
  }
});

let port;
server.listen(0, '127.0.0.1', () => {
  port = server.address().port;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', `http://localhost:${port}`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', SCOPE);
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('state', state);
  console.log('Opening the Google consent screen in your browser.');
  console.log('On the "choose an account / brand account" screen, pick the channel you want THIS token for.\n');
  console.log(`If the browser does not open, paste this URL:\n\n${auth.href}\n`);
  openBrowser(auth.href);
});
