// init supabase
const supabase = window.supabase.createClient(window.__SUPABASE_URL, window.__SUPABASE_ANON);

// tabs
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLogin = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");
const linkToReg = document.getElementById("link-to-register");
const linkToLogin = document.getElementById("link-to-login");
const loginMsg = document.getElementById("login-msg");
const regMsg = document.getElementById("reg-msg");

function show(view){
  const isLogin = view === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);
  formLogin.hidden = !isLogin;
  formRegister.hidden = isLogin;
  (isLogin ? loginMsg : regMsg).textContent = "";
  (isLogin ? loginMsg : regMsg).classList.remove("err");
}
tabLogin.addEventListener("click", ()=>show("login"));
tabRegister.addEventListener("click", ()=>show("register"));
linkToReg.addEventListener("click", (e)=>{ e.preventDefault(); show("register"); });
linkToLogin.addEventListener("click", (e)=>{ e.preventDefault(); show("login"); });

// already logged in? -> go to app
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) location.replace("index.html");
})();

// login
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMsg.textContent = "Anmelden…";
  loginMsg.classList.remove("err");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.textContent = "Fehler: " + error.message;
    loginMsg.classList.add("err");
  } else {
    location.replace("index.html"); 
  }
});

// register
formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  regMsg.textContent = "Konto wird erstellt…";
  regMsg.classList.remove("err");

  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Nach E-Mail-Bestätigung hierhin zurück
      emailRedirectTo: "https://dreipac.github.io/Gym/index.html"
      // Für lokalen Test ggf.:
      // emailRedirectTo: "http://localhost:5500/index.html"
    }
  });

  if (error) {
    regMsg.textContent = "Fehler: " + error.message;
    regMsg.classList.add("err");
    return;
  }

  // Hinweis für Fälle mit E-Mail-Bestätigung
  regMsg.textContent = data.user?.email_confirmed_at
    ? "Konto erstellt – weiterleiten…"
    : "Konto erstellt. Prüfe dein Postfach zur Bestätigung.";

  // wenn schon eine Session besteht → weiter
  const { data: { session } } = await supabase.auth.getSession();
  if (session) location.href = "index.html";
});

