import { createClient } from "@supabase/supabase-js";

type ConsentConfig = { supabaseUrl: string; publishableKey: string };
type AuthorizationDetails = { client?: { name?: string }; redirect_uri?: string; scope?: string };

const message = document.querySelector<HTMLParagraphElement>("#message")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;
const emailForm = document.querySelector<HTMLFormElement>("#email-form")!;
const email = document.querySelector<HTMLInputElement>("#email")!;
const approval = document.querySelector<HTMLElement>("#approval")!;
const detail = document.querySelector<HTMLElement>("#request-detail")!;
const authorizationId = new URLSearchParams(location.search).get("authorization_id");

function showError(text: string): void { error.textContent = text; }
function show(element: HTMLElement): void { element.classList.remove("hidden"); }
function hide(element: HTMLElement): void { element.classList.add("hidden"); }

async function bootstrap(): Promise<void> {
  if (!authorizationId) { message.textContent = "缺少授权请求，请返回 ChatGPT 后重新连接。"; return; }
  const config = await fetch("/oauth/consent-config").then(async (response) => {
    if (!response.ok) throw new Error("configuration unavailable");
    return response.json() as Promise<ConsentConfig>;
  });
  const supabase = createClient(config.supabaseUrl, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    message.textContent = "请先通过邮箱登录，再确认是否允许 ChatGPT 访问你的 FitLog 数据。";
    show(emailForm);
    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault(); showError("");
      const { error: signInError } = await supabase.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.href } });
      if (signInError) { showError("无法发送登录链接，请检查邮箱后重试。"); return; }
      message.textContent = "登录链接已发送，请在同一设备打开邮件后返回此页。";
      hide(emailForm);
    });
    return;
  }
  const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (detailsError || !data) { showError("授权请求已失效，请返回 ChatGPT 后重新连接。"); return; }
  const details = data as AuthorizationDetails;
  message.textContent = "请确认 ChatGPT 请求访问你的个人健身数据。";
  detail.replaceChildren();
  const client = document.createElement("strong"); client.textContent = details.client?.name ?? "ChatGPT";
  const redirect = document.createElement("p"); redirect.textContent = `回调地址：${details.redirect_uri ?? "未提供"}`;
  const scopes = document.createElement("ul");
  (details.scope ?? "").split(" ").filter(Boolean).forEach((scope) => { const item = document.createElement("li"); item.textContent = scope; scopes.append(item); });
  detail.append(client, redirect, scopes); show(approval);
  document.querySelector<HTMLButtonElement>("#approve")!.addEventListener("click", async () => {
    const { data: approved, error: approvalError } = await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (approvalError || !approved?.redirect_url) { showError("无法完成授权，请返回 ChatGPT 后重试。"); return; }
    location.assign(approved.redirect_url);
  });
  document.querySelector<HTMLButtonElement>("#deny")!.addEventListener("click", async () => {
    const { data: denied, error: denialError } = await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (denialError || !denied?.redirect_url) { showError("无法拒绝该请求，请返回 ChatGPT 后重试。"); return; }
    location.assign(denied.redirect_url);
  });
}

void bootstrap().catch(() => showError("页面暂时无法加载，请稍后重试。"));
