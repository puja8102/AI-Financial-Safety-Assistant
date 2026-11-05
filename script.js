const $ = id => document.getElementById(id);
const API_BASE = 'https://ai-financial-safety-assistant.onrender.com';
const message = $('message');
const result = $('result');

const getLang = () =>
    $('lang') ? $('lang').value : 'en';

const EMPTY_RESULT = `
    <div class="result-icon">✓</div>
    <h2>Your safety report appears here</h2>
    <p>Scan a message to see its risk indicator, warning signs and suggested next steps.</p>
`;

// ---------- HELPERS ----------

function safe(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

async function postJSON(url, body) {

    const ctrl = new AbortController();

    const timer = setTimeout(
        () => ctrl.abort(),
        70000
    );

    try {

        const response = await fetch(API_BASE + url, {
            

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify(body),

            signal: ctrl.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.error) {
            throw new Error(
                data.error || `Server error: ${response.status}`
            );
        }

        return data;

    } catch (error) {

        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }

        throw error;

    } finally {
        clearTimeout(timer);
    }
}

const levelFromScore = s =>
    s >= 60 ? 'HIGH' : s >= 25 ? 'MEDIUM' : 'LOW';

// ---------- SAMPLE + CLEAR ----------

$('sample').onclick = () => {

    message.value =
        'Your bank account will be blocked today. Click http://bank-verify-example.com and share your OTP immediately to keep it active.';
};

$('clear').onclick = () => {

    message.value = '';

    result.innerHTML = EMPTY_RESULT;
};

// ---------- RULE-BASED CHECK (OFFLINE FALLBACK) ----------

function runRules(t) {

    const rules = [

        [['otp', 'one time password', 'verification code'],
            30, 'Mentions an OTP or verification code.'],

        [['upi pin', 'share your pin', 'pin to receive'],
            35, 'Mentions a UPI PIN or asks for a secret PIN.'],

        [['blocked', 'suspended', 'account frozen'],
            20, 'Uses an account-blocking threat.'],

        [['click here', 'click the link', 'http://', 'https://', 'verify now'],
            15, 'Asks you to open a link or verify details.'],

        [['won', 'prize', 'lottery', 'claim reward'],
            20, 'Uses a prize or reward claim.'],

        [['processing fee', 'pay first', 'advance fee', 'send money'],
            25, 'Requests an upfront payment.'],

        [['urgent', 'immediately', 'last warning'],
            15, 'Creates pressure to act quickly.'],

        [['anydesk', 'remote access', 'screen sharing'],
            30, 'Mentions remote-access or screen-sharing software.'],

        [['collect request', 'approve the request', 'enter pin to receive'],
            30, 'Looks like a fake UPI collect request.']
    ];

    let score = 0;
    const flags = [];

    rules.forEach(([words, points, label]) => {

        if (words.some(w => t.includes(w))) {
            score += points;
            flags.push(label);
        }
    });

    score = Math.min(score, 99);

    const level = levelFromScore(score);

    const advice =
        level === 'HIGH'
            ? 'Do not click, pay or share OTP/PIN details. Verify using your bank’s official app or number.'
            : level === 'MEDIUM'
            ? 'Pause and verify the sender independently. Do not share personal or payment details.'
            : 'No common warning pattern was detected. This does not prove the message is safe; verify unexpected requests.';

    return {
        score,
        level,
        flags,
        advice
    };
}

// ---------- RENDER REPORT ----------

function renderReport(r, source, errorMessage = '') {

    const colour =
        r.level === 'HIGH' ? '#ff6575' :
        r.level === 'MEDIUM' ? '#ffc36a' :
        '#52e0ae';

    const badge = source === 'ai'
        ? '<span class="ai-badge">✦ Analysed by AI</span>'
        : '<span class="ai-badge warn">AI unavailable · basic rule check used</span>';

    const flagsHtml = r.flags.length
        ? r.flags.map(x => '<li>' + safe(x) + '</li>').join('')
        : '<li>No common warning sign found.</li>';

    result.innerHTML = `

        ${badge}

        <span class="risk">${safe(r.level)} RISK</span>

        <div class="result-icon" style="color:${colour}">
            ${Number(r.score)}
        </div>

        <h2>Risk score: ${Number(r.score)}/100</h2>

        <ul class="flags">
            ${flagsHtml}
        </ul>

        <p>
            <b>Suggested action:</b>
            ${safe(r.advice)}
        </p>

        ${errorMessage ? `
            <p class="disclaimer">
                Connection detail: ${safe(errorMessage)}
            </p>
        ` : ''}

        <p class="disclaimer">
            Educational tool. AI can make mistakes; always verify through your bank’s official app or number.
        </p>
    `;
}

// ---------- MESSAGE SCANNER (AI FIRST) ----------

$('scan').onclick = async () => {

    const raw = message.value.trim();

    if (!raw) {

        result.innerHTML =
            '<h2>Please paste a message first.</h2>';

        return;
    }

    const btn = $('scan');

    btn.disabled = true;

    result.innerHTML = `
        <div class="spinner"></div>
        <p>AI is analysing your message…</p>
    `;

    try {

        const ai = await postJSON('/api/analyze', {

            text: raw,

            lang: getLang()
        });

        renderReport(ai, 'ai');

    } catch (error) {

        console.error('AI SCAN ERROR:', error);

        renderReport(
            runRules(raw.toLowerCase()),
            'rules',
            error.message
        );

    } finally {

        btn.disabled = false;
    }
};

// ---------- URL CHECKER ----------

$('checkUrl').onclick = () => {

    const raw = $('urlInput').value.trim();

    const out = $('urlResult');

    if (!raw) {

        out.textContent = 'Please enter a URL.';

        return;
    }

    let u;

    try {

        u = new URL(
            raw.includes('://') ? raw : 'https://' + raw
        );

    } catch {

        out.textContent =
            'That does not look like a valid URL.';

        return;
    }

    if (!['http:', 'https:'].includes(u.protocol)) {

        out.textContent = 'Only HTTP or HTTPS URLs can be checked.';

        return;
    }

    const warnings = [];

    if (u.protocol !== 'https:') {
        warnings.push('The link does not use HTTPS.');
    }

    if (
        u.hostname.startsWith('xn--') ||
        u.hostname.includes('.xn--')
    ) {
        warnings.push('The domain uses encoded characters.');
    }

    if (/\d{5,}/.test(u.hostname)) {
        warnings.push('The domain contains a long number sequence.');
    }

    if (u.hostname.split('.').length > 4) {
        warnings.push('The domain has many subdomains.');
    }

    if (/login|verify|update|secure|bank|wallet|kyc|claim|reward/i.test(u.hostname)) {

        warnings.push(
            'The domain includes words sometimes used in misleading messages; this alone does not prove fraud.'
        );
    }

    out.innerHTML = `

        <b>
            ${warnings.length
                ? '⚠ Review this link carefully.'
                : '✓ No basic URL-pattern warning found.'}
        </b>

        <br>

        ${warnings.length
            ? warnings.map(safe).join('<br>')
            : 'This check cannot confirm a website is legitimate.'}

        <br><br>

        <b>Domain:</b> ${safe(u.hostname)}
    `;
};

// ---------- QUICK AI ASSISTANT QUESTIONS ----------

const answers = {

    pin: 'No. You do not need to enter your UPI PIN to receive money. A UPI PIN authorises a payment from your account. Never share it.',

    otp: 'Act immediately. Contact your bank through its official app or number. If money may have been stolen, call 1930 in India and report at cybercrime.gov.in.',

    bank: 'Use the number inside your bank’s official app, on the back of your card or on its verified official website. Avoid numbers sent by strangers.'
};

document.querySelectorAll('[data-q]').forEach(button => {

    button.onclick = () => {

        $('answer').textContent =
            answers[button.dataset.q];
    };
});

// ---------- FREE-FORM GEMINI AI CHAT ----------

async function askAI() {

    const input = $('askInput');

    const btn = $('askBtn');

    if (!input || !btn) return;

    const question = input.value.trim();

    if (!question) {

        $('answer').textContent =
            'Please type a question first.';

        return;
    }

    btn.disabled = true;

    $('answer').textContent =
        'AI is thinking…';

    try {

        const data = await postJSON('/api/chat', {

            question,

            lang: getLang()
        });

        $('answer').textContent = data.answer;

    } catch (error) {

        console.error('AI CHAT ERROR:', error);

        $('answer').textContent =
            'AI connection error: ' + error.message;
    }

    finally {

        btn.disabled = false;
    }
}

if ($('askBtn')) {
    $('askBtn').onclick = askAI;
}

if ($('askInput')) {

    $('askInput').addEventListener('keydown', e => {

        if (e.key === 'Enter') {
            askAI();
        }
    });
}

// ---------- MOBILE MENU ----------

$('menu').onclick = () => {

    $('nav').classList.toggle('open');
};

document.querySelectorAll('#nav a').forEach(link => {

    link.onclick = () => {

        $('nav').classList.remove('open');
    };
});
