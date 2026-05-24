import { Router } from "express";
import axios from "axios";
import crypto from "node:crypto";

const router = Router();

const CLIENT_ID = process.env["SF_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["SF_CLIENT_SECRET"] ?? "";

const SF_INSTANCE = process.env["SF_INSTANCE_URL"] ?? "https://login.salesforce.com";
const LOGIN_URL = `${SF_INSTANCE}/services/oauth2/authorize`;
const TOKEN_URL = `${SF_INSTANCE}/services/oauth2/token`;

function getRedirectUri(req: { headers: { host?: string } }) {
  const domains = process.env["REPLIT_DOMAINS"];
  const host = domains ? domains.split(",")[0] : req.headers.host;
  const proto = domains ? "https" : "http";
  return `${proto}://${host}/api/callback`;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

let accessToken = "";
let instanceUrl = "";
let storedCodeVerifier = "";

router.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Salesforce Validation Rules</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 24px; background: #f3f3f3; margin: 0; }
    h2 { color: #032d60; }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    button {
      background: #0176d3; color: white; border: none;
      padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;
    }
    button:hover { background: #014486; }
    button.danger { background: #c23934; }
    button.danger:hover { background: #8e1a16; }
    button.success { background: #2e844a; }
    button.success:hover { background: #1c5630; }
    input[type=text] {
      padding: 9px 12px; border: 1px solid #ccc; border-radius: 4px;
      font-size: 14px; width: 220px;
    }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    th { background: #032d60; color: white; padding: 12px 14px; text-align: left; }
    td { border-bottom: 1px solid #e0e0e0; padding: 12px 14px; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .badge.active { background: #d4f0db; color: #2e844a; }
    .badge.inactive { background: #fce8e8; color: #c23934; }
    #status { margin-bottom: 14px; padding: 10px 14px; border-radius: 4px; display: none; }
    #status.info { background: #e8f4fd; color: #014486; display: block; }
    #status.error { background: #fce8e8; color: #c23934; display: block; }
    .login-prompt { text-align: center; padding: 40px; background: white; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    #tableSection { display: none; }
    #loginSection { display: block; }
  </style>
</head>
<body>
  <h2>Salesforce Validation Rules</h2>
  <div id="status"></div>

  <div id="loginSection" class="login-prompt">
    <p style="font-size:16px;color:#555;margin-bottom:20px;">Connect your Salesforce org to view and manage Validation Rules.</p>
    <button onclick="loginSalesforce()">Login with Salesforce</button>
  </div>

  <div id="tableSection">
    <div class="toolbar">
      <input type="text" id="objectFilter" placeholder="Filter by object (e.g. Account)" oninput="filterRules()" />
      <button onclick="fetchRules()">Refresh</button>
      <button onclick="loginSalesforce()" style="background:#6c757d">Re-login</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Rule Name</th>
          <th>Object</th>
          <th>Active</th>
          <th>Error Message</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="tableBody"><tr><td colspan="5" style="text-align:center;color:#888">Loading...</td></tr></tbody>
    </table>
  </div>

  <script>
    let allRules = [];

    function loginSalesforce() {
      const popup = window.open("/api/login", "_blank", "width=600,height=700");
      const timer = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(timer);
          fetchRules();
        }
      }, 500);
    }

    function showLoginPrompt() {
      document.getElementById("loginSection").style.display = "block";
      document.getElementById("tableSection").style.display = "none";
    }

    function showTable() {
      document.getElementById("loginSection").style.display = "none";
      document.getElementById("tableSection").style.display = "block";
    }

    function setStatus(msg, type) {
      const el = document.getElementById("status");
      el.textContent = msg;
      el.className = type;
    }

    async function fetchRules() {
      setStatus("Loading validation rules...", "info");
      try {
        const response = await fetch("/api/validationRules");
        if (response.status === 401) {
          setStatus("Session expired — please log in again.", "error");
          showLoginPrompt();
          return;
        }
        if (!response.ok) throw new Error("Server error");
        const data = await response.json();
        allRules = data.records || [];
        setStatus("", "");
        showTable();
        renderRules(allRules);
      } catch (err) {
        setStatus("Error: " + err.message, "error");
      }
    }

    function filterRules() {
      const q = document.getElementById("objectFilter").value.trim().toLowerCase();
      const filtered = q ? allRules.filter(r => (r.EntityDefinition?.QualifiedApiName || "").toLowerCase().includes(q)) : allRules;
      renderRules(filtered);
    }

    function renderRules(rules) {
      const tbody = document.getElementById("tableBody");
      if (!rules.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888">No validation rules found.</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map(rule => \`
        <tr id="row-\${rule.Id}">
          <td>\${rule.ValidationName}</td>
          <td>\${rule.EntityDefinitionId || "—"}</td>
          <td><span class="badge \${rule.Active ? 'active' : 'inactive'}">\${rule.Active ? 'Active' : 'Inactive'}</span></td>
          <td>\${rule.ErrorMessage || "—"}</td>
          <td>
            <button class="\${rule.Active ? 'danger' : 'success'}" onclick="toggleRule('\${rule.Id}', \${rule.Active})">
              \${rule.Active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      \`).join("");
    }

    async function toggleRule(id, currentlyActive) {
      setStatus("Updating rule...", "info");
      try {
        const response = await fetch(\`/api/toggleRule/\${id}\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !currentlyActive })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to update");
        setStatus("Rule updated successfully.", "info");
        await fetchRules();
      } catch (err) {
        setStatus("Error: " + err.message, "error");
      }
    }

    fetchRules();
  </script>
</body>
</html>`);
});

router.get("/debug", (req, res) => {
  const redirectUri = getRedirectUri(req);
  res.send(`
    <h2>OAuth Debug Info</h2>
    <p><strong>Callback URL (copy this exactly into Salesforce):</strong></p>
    <code style="background:#f3f3f3;padding:8px 12px;display:block;border-radius:4px;word-break:break-all">${redirectUri}</code>
    <br/>
    <p><strong>Login URL base:</strong> <code>${LOGIN_URL}</code></p>
    <p><strong>Client ID set:</strong> ${CLIENT_ID ? "✅ Yes" : "❌ Missing"}</p>
    <p><strong>Client Secret set:</strong> ${CLIENT_SECRET ? "✅ Yes" : "❌ Missing"}</p>
    <br/><p><a href="/api">Back</a></p>
  `);
});

router.get("/login", (req, res) => {
  const redirectUri = getRedirectUri(req);
  storedCodeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(storedCodeVerifier);
  const authUrl =
    `${LOGIN_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;
  res.redirect(authUrl);
});

router.get("/callback", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const sfError = req.query["error"] as string | undefined;
  const sfErrorDesc = req.query["error_description"] as string | undefined;
  if (sfError) {
    req.log.error({ sfError, sfErrorDesc }, "Salesforce OAuth error");
    res.send(`
      <h2>Salesforce Login Error</h2>
      <p><strong>Error:</strong> ${sfError}</p>
      <p><strong>Description:</strong> ${sfErrorDesc ?? "none"}</p>
      <p><a href="/api">Back</a></p>
    `);
    return;
  }

  const code = req.query["code"] as string;
  if (!code) {
    res.send(`
      <h2>Missing Authorization Code</h2>
      <p>Salesforce did not return a code. Full query: <code>${JSON.stringify(req.query)}</code></p>
      <p><a href="/api">Back</a></p>
    `);
    return;
  }

  const redirectUri = getRedirectUri(req);
  try {
    const response = await axios.post(TOKEN_URL, null, {
      params: {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
        code_verifier: storedCodeVerifier,
      },
    });
    accessToken = response.data.access_token;
    instanceUrl = response.data.instance_url;
    res.send(`
      <!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:60px">
        <h2 style="color:#2e844a">✅ Login Successful!</h2>
        <p>You are now connected to Salesforce.</p>
        <p>Close this window and <strong>refresh the main app</strong> to see your validation rules.</p>
        <script>
          setTimeout(() => { window.close(); }, 2000);
        </script>
      </body></html>
    `);
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    req.log.error({ err: err.response?.data || err.message }, "OAuth callback error");
    res.send(`
      <h2>Token Exchange Failed</h2>
      <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
      <p><a href="/api">Back</a></p>
    `);
  }
});

router.get("/validationRules", async (req, res) => {
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const query =
      "SELECT Id, ValidationName, Active, ErrorMessage, EntityDefinitionId FROM ValidationRule ORDER BY ValidationName";
    const url = `${instanceUrl}/services/data/v60.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json(response.data);
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    req.log.error({ err: err.response?.data || err.message }, "Error fetching validation rules");
    res.status(500).json({ error: "Error fetching rules", detail: err.response?.data });
  }
});

router.post("/toggleRule/:id", async (req, res) => {
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { id } = req.params;
  const { active } = req.body as { active: boolean };
  try {
    const url = `${instanceUrl}/services/data/v60.0/tooling/sobjects/ValidationRule/${id}`;
    await axios.patch(
      url,
      { Metadata: { active } },
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    req.log.error({ err: err.response?.data || err.message }, "Error toggling rule");
    res.status(500).json({ error: "Failed to toggle rule", detail: err.response?.data });
  }
});

export default router;
