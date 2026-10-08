// Registration: upstream's form has a single password field. BizzCMS adds "Repeat password"
// (inserted by src/branding.ts) and checks it here on the server, so a mismatch can't be
// submitted by skipping the browser check. Other fields stay upstream's validation.

export async function checkRegisterPasswords(request: Request, path: string): Promise<Response | null> {
  if (request.method !== 'POST' || (path !== '/auth/register/form' && path !== '/auth/register')) return null
  let form: FormData
  try { form = await request.clone().formData() } catch { return null }
  const password = String(form.get('password') ?? '')
  const repeat = form.get('confirmPassword')
  if (repeat !== null && String(repeat) === password) return null
  const message = repeat === null ? 'Please repeat your password.' : 'The passwords do not match.'
  // Same markup upstream uses for form errors, so it lands in the form's response area.
  return new Response(`<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">${message}</div>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// Inserted after the password field on /auth/register (same classes as upstream's inputs).
export const REPEAT_PASSWORD_FIELD = `<div class="mt-6 bizz-repeat-password">
<label for="confirmPassword" class="block text-sm font-medium text-white mb-2">Repeat password</label>
<input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" class="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white shadow-sm ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white transition-shadow" placeholder="Type the same password again">
<p id="confirmPassword-hint" class="bizz-field-error" aria-live="polite"></p>
</div>
<script>(function(){
  var p=document.getElementById('password'),r=document.getElementById('confirmPassword'),h=document.getElementById('confirmPassword-hint');
  if(!p||!r)return;
  function check(){var bad=r.value&&r.value!==p.value;r.setCustomValidity(bad?'The passwords do not match.':'');h.textContent=bad?'The passwords do not match.':''}
  p.addEventListener('input',check);r.addEventListener('input',check);
  var f=document.getElementById('register-form');if(f)f.addEventListener('submit',function(e){check();if(!r.checkValidity()){e.preventDefault();e.stopImmediatePropagation();r.reportValidity()}},true);
  document.body.addEventListener('htmx:beforeRequest',function(e){if(e.detail.elt&&e.detail.elt.id==='register-form'){check();if(!r.checkValidity()){e.preventDefault();r.reportValidity()}}});
})();</script>`

// Upstream ships POST /auth/seed-admin without authentication: it creates or resets admin@sonicjs.com
// with a password that is published in its source. Never reachable on a BizzCMS site.
export function blockedRoute(path: string): Response | null {
  if (path.replace(/\/+$/, '') === '/auth/seed-admin') return new Response('Not found', { status: 404 })
  return null
}
