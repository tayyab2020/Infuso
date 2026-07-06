const express = require('express');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

const router = express.Router();
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET;
const DEPLOY_SCRIPT = path.join(__dirname, '..', '..', 'deploy.sh');
const REPO_ROOT = path.join(__dirname, '..', '..');

function isValidSignature(req) {
  if (!SECRET) return false;
  const signature = req.get('X-Hub-Signature-256');
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GitHub webhook: push to main triggers a server-side git pull + restart.
// Runs over HTTPS (already reachable globally via Cloudflare) instead of
// GitHub Actions SSHing in, which proved unreliable from Azure's IP ranges.
router.post('/', (req, res) => {
  if (!isValidSignature(req)) return res.status(401).json({ error: 'Invalid signature' });
  if (req.get('X-GitHub-Event') !== 'push') return res.json({ ok: true, skipped: 'not a push event' });
  if ((req.body || {}).ref !== 'refs/heads/main') return res.json({ ok: true, skipped: 'not main' });

  res.json({ ok: true, deploying: true });

  const child = execFile('bash', [DEPLOY_SCRIPT], { cwd: REPO_ROOT });
  child.stdout.on('data', (d) => console.log('[deploy]', d.toString().trim()));
  child.stderr.on('data', (d) => console.error('[deploy]', d.toString().trim()));
  child.on('error', (err) => console.error('[deploy] failed to start:', err.message));
});

module.exports = router;
