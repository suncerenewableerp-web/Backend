"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
function buildFromAddress(fallbackUser) {
    const fromEmail = process.env.SMTP_FROM || process.env.FROM_EMAIL || fallbackUser;
    const fromName = process.env.SMTP_FROM_NAME || process.env.FROM_NAME;
    if (!fromEmail)
        return undefined;
    if (fromName)
        return `${fromName} <${fromEmail}>`;
    return fromEmail;
}
function isPlaceholder(value, placeholders) {
    if (!value)
        return true;
    const v = value.trim().toLowerCase();
    if (!v)
        return true;
    return placeholders.some((p) => v === p.trim().toLowerCase());
}
function getSmtpConfig() {
    const url = process.env.SMTP_URL;
    if (url) {
        let fallbackUser;
        try {
            const parsed = new URL(url);
            if (parsed.username)
                fallbackUser = decodeURIComponent(parsed.username);
        }
        catch {
            // Ignore URL parse issues; nodemailer will surface them on send.
        }
        const from = buildFromAddress(fallbackUser);
        if (!from)
            return null;
        if (isPlaceholder(url, ["smtps://user:pass@smtp.gmail.com:465"]))
            return null;
        return { url, from };
    }
    const host = process.env.SMTP_HOST ? String(process.env.SMTP_HOST).trim() : undefined;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const user = process.env.SMTP_USER ? String(process.env.SMTP_USER).trim() : undefined;
    let pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).trim() : undefined;
    const secure = process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
        : port === 465;
    const from = buildFromAddress(user);
    if (!host || !Number.isFinite(port) || !user || !pass || !from)
        return null;
    if (isPlaceholder(user, ["your-email@gmail.com"]) ||
        isPlaceholder(pass, ["your-app-password"]) ||
        isPlaceholder(from, ["your-email@gmail.com", "Sunce ERP <your-email@gmail.com>"])) {
        return null;
    }
    // Gmail "App Passwords" are often shown with spaces; remove whitespace to avoid auth failures.
    if (host.toLowerCase().includes("gmail.com") || host.toLowerCase().includes("googlemail.com")) {
        pass = pass.replace(/\s+/g, "");
    }
    return { host, port, user, pass, secure, from };
}
async function sendEmail(input) {
    const smtp = getSmtpConfig();
    if (!smtp) {
        console.warn("📧 SMTP not configured. Email not sent.");
        console.warn("📧 Configure SMTP_* env vars (for Gmail: use an App Password, not your normal Gmail password).");
        console.warn("📧 Email subject:", input.subject);
        console.warn("📧 Email to:", input.to);
        console.warn("📧 Email text:\n" + input.text);
        return { sent: false };
    }
    const transporter = "url" in smtp
        ? nodemailer_1.default.createTransport(smtp.url)
        : nodemailer_1.default.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: { user: smtp.user, pass: smtp.pass },
        });
    try {
        await transporter.sendMail({
            from: smtp.from,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
        });
    }
    catch (err) {
        const response = String(err?.response || "");
        const hostHint = "host" in smtp ? smtp.host.toLowerCase() : smtp.url.toLowerCase();
        const likelyGmail = hostHint.includes("gmail.com") || hostHint.includes("googlemail.com");
        if (err?.code === "EAUTH" && (likelyGmail || response.includes("BadCredentials"))) {
            console.error("📧 SMTP auth failed (Gmail).");
            console.error("📧 Use a Gmail App Password (enable 2-Step Verification) and set SMTP_USER/SMTP_PASS.");
            console.error("📧 If you pasted an App Password with spaces, remove the spaces.");
        }
        throw err;
    }
    return { sent: true };
}
